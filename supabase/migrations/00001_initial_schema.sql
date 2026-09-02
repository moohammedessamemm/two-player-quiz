-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE room_status AS ENUM ('lobby', 'playing', 'completed');
CREATE TYPE round_status AS ENUM ('answering', 'revealing', 'completed');

-- Tables
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_code TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL, -- references auth.users (will be enforced by app logic/FK if auth enabled)
    status room_status NOT NULL DEFAULT 'lobby',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, session_id)
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answer_deadline TIMESTAMPTZ NOT NULL,
    status round_status NOT NULL DEFAULT 'answering',
    revealed_at TIMESTAMPTZ,
    UNIQUE(room_id, round_number)
);

CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(round_id, player_id)
);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Rooms: Anyone can read. Only authenticated admins can create/update.
CREATE POLICY "Anyone can read rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Admins can insert rooms" ON rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update their rooms" ON rooms FOR UPDATE USING (auth.uid() = created_by);

-- Players: Anyone can read. Insert/Update handled by RPC (SECURITY DEFINER).
CREATE POLICY "Anyone can read players" ON players FOR SELECT USING (true);
CREATE POLICY "Admins can manage players" ON players FOR ALL USING (
    EXISTS (SELECT 1 FROM rooms WHERE id = players.room_id AND created_by = auth.uid())
);

-- Questions: Anyone can read. Insert/Update handled by RPC or Admin.
CREATE POLICY "Anyone can read questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Admins can manage questions" ON questions FOR ALL USING (
    EXISTS (SELECT 1 FROM rooms WHERE id = questions.room_id AND created_by = auth.uid())
);

-- Rounds: Anyone can read. Admin can manage.
CREATE POLICY "Anyone can read rounds" ON rounds FOR SELECT USING (true);
CREATE POLICY "Admins can manage rounds" ON rounds FOR ALL USING (
    EXISTS (SELECT 1 FROM rooms WHERE id = rounds.room_id AND created_by = auth.uid())
);

-- Answers: Public can only read answers for revealed/completed rounds. Admin can read all.
CREATE POLICY "Public can read revealed answers" ON answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM rounds WHERE id = answers.round_id AND status IN ('revealing', 'completed'))
);
CREATE POLICY "Admins can manage answers" ON answers FOR ALL USING (
    EXISTS (
        SELECT 1 FROM rounds 
        JOIN rooms ON rounds.room_id = rooms.id 
        WHERE rounds.id = answers.round_id AND rooms.created_by = auth.uid()
    )
);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms, players, questions, rounds, answers;

-- RPCs for safe state transitions

-- 1. join_room
CREATE OR REPLACE FUNCTION join_room(p_short_code text, p_display_name text, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room rooms%rowtype;
    v_player_count int;
    v_existing_player players%rowtype;
BEGIN
    SELECT * INTO v_room FROM rooms WHERE short_code = p_short_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT * INTO v_existing_player FROM players WHERE room_id = v_room.id AND session_id = p_session_id;
    IF FOUND THEN
        UPDATE players SET display_name = p_display_name, last_seen_at = NOW() WHERE id = v_existing_player.id;
        RETURN jsonb_build_object('player_id', v_existing_player.id, 'room_id', v_room.id);
    END IF;

    SELECT count(*) INTO v_player_count FROM players WHERE room_id = v_room.id;
    IF v_player_count >= 2 THEN RAISE EXCEPTION 'Room is full'; END IF;

    INSERT INTO players (room_id, display_name, session_id)
    VALUES (v_room.id, p_display_name, p_session_id)
    RETURNING * INTO v_existing_player;

    RETURN jsonb_build_object('player_id', v_existing_player.id, 'room_id', v_room.id);
END;
$$;

-- 2. add_question
CREATE OR REPLACE FUNCTION add_question(p_room_id uuid, p_player_id uuid, p_session_id text, p_question_text text, p_position int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player players%rowtype;
    v_question_id uuid;
BEGIN
    SELECT * INTO v_player FROM players WHERE id = p_player_id AND session_id = p_session_id AND room_id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;

    INSERT INTO questions (room_id, player_id, question_text, position)
    VALUES (p_room_id, p_player_id, p_question_text, p_position)
    RETURNING id INTO v_question_id;

    RETURN v_question_id;
END;
$$;

-- 3. delete_question
CREATE OR REPLACE FUNCTION delete_question(p_question_id uuid, p_player_id uuid, p_session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player players%rowtype;
    v_question questions%rowtype;
BEGIN
    SELECT * INTO v_question FROM questions WHERE id = p_question_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_player FROM players WHERE id = p_player_id AND session_id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;

    IF v_question.player_id != p_player_id THEN RAISE EXCEPTION 'Not owner'; END IF;

    DELETE FROM questions WHERE id = p_question_id;
END;
$$;

-- 4. submit_answer
CREATE OR REPLACE FUNCTION submit_answer(p_round_id uuid, p_player_id uuid, p_session_id text, p_answer_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player players%rowtype;
    v_round rounds%rowtype;
    v_answer_count int;
BEGIN
    SELECT * INTO v_round FROM rounds WHERE id = p_round_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;

    SELECT * INTO v_player FROM players WHERE id = p_player_id AND session_id = p_session_id AND room_id = v_round.room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;

    IF v_round.status != 'answering' THEN RAISE EXCEPTION 'Round is not in answering phase'; END IF;
    IF current_timestamp > v_round.answer_deadline THEN RAISE EXCEPTION 'Answer deadline has passed'; END IF;

    INSERT INTO answers (round_id, player_id, answer_text)
    VALUES (p_round_id, p_player_id, p_answer_text)
    ON CONFLICT (round_id, player_id) DO UPDATE SET answer_text = EXCLUDED.answer_text, submitted_at = current_timestamp;

    SELECT count(*) INTO v_answer_count FROM answers WHERE round_id = p_round_id;
    IF v_answer_count = 2 THEN
        UPDATE rounds SET status = 'revealing', revealed_at = current_timestamp WHERE id = p_round_id;
    END IF;
END;
$$;

-- 5. get_my_answer (to fetch own answer during answering phase before reveal)
CREATE OR REPLACE FUNCTION get_my_answer(p_round_id uuid, p_player_id uuid, p_session_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player players%rowtype;
    v_answer_text text;
BEGIN
    SELECT * INTO v_player FROM players WHERE id = p_player_id AND session_id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;

    SELECT answer_text INTO v_answer_text FROM answers WHERE round_id = p_round_id AND player_id = p_player_id;
    RETURN v_answer_text;
END;
$$;

-- 6. advance_round (triggered by admin or client when timer expires)
CREATE OR REPLACE FUNCTION advance_round(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room rooms%rowtype;
    v_current_round rounds%rowtype;
    v_next_question questions%rowtype;
    v_next_round_number int;
BEGIN
    SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT * INTO v_current_round FROM rounds WHERE room_id = p_room_id ORDER BY round_number DESC LIMIT 1;
    
    IF v_current_round.id IS NULL THEN
        IF v_room.status != 'playing' THEN UPDATE rooms SET status = 'playing' WHERE id = p_room_id; END IF;

        -- We want to alternate between players. Order by position, then created_at.
        -- But for now, we just order by position and created_at. The frontend can assign positions to interleave them.
        SELECT * INTO v_next_question FROM questions WHERE room_id = p_room_id ORDER BY position ASC, created_at ASC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'No questions found'; END IF;
        
        INSERT INTO rounds (room_id, round_number, question_id, started_at, answer_deadline, status)
        VALUES (p_room_id, 1, v_next_question.id, current_timestamp, current_timestamp + interval '15 seconds', 'answering');
        RETURN;
    END IF;

    IF v_current_round.status = 'answering' THEN
        -- Only transition if deadline passed
        IF current_timestamp >= v_current_round.answer_deadline THEN
            UPDATE rounds SET status = 'revealing', revealed_at = current_timestamp WHERE id = v_current_round.id;
        END IF;
        RETURN;
    END IF;

    IF v_current_round.status = 'revealing' THEN
        SELECT * INTO v_next_question FROM questions 
        WHERE room_id = p_room_id 
        AND (position > (SELECT position FROM questions WHERE id = v_current_round.question_id)
             OR (position = (SELECT position FROM questions WHERE id = v_current_round.question_id) 
                 AND created_at > (SELECT created_at FROM questions WHERE id = v_current_round.question_id)))
        ORDER BY position ASC, created_at ASC LIMIT 1;

        IF v_next_question.id IS NULL THEN
            UPDATE rooms SET status = 'completed' WHERE id = p_room_id;
        ELSE
            INSERT INTO rounds (room_id, round_number, question_id, started_at, answer_deadline, status)
            VALUES (p_room_id, v_current_round.round_number + 1, v_next_question.id, current_timestamp, current_timestamp + interval '15 seconds', 'answering');
        END IF;
        RETURN;
    END IF;
END;
$$;
