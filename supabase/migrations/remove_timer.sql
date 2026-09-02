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

    -- The deadline check is removed so players can take as long as they need.
    -- IF current_timestamp > v_round.answer_deadline THEN RAISE EXCEPTION 'Answer deadline has passed'; END IF;

    INSERT INTO answers (round_id, player_id, answer_text)
    VALUES (p_round_id, p_player_id, p_answer_text)
    ON CONFLICT (round_id, player_id) DO UPDATE SET answer_text = EXCLUDED.answer_text, submitted_at = current_timestamp;

    SELECT count(*) INTO v_answer_count FROM answers WHERE round_id = p_round_id;
    IF v_answer_count = 2 THEN
        UPDATE rounds SET status = 'revealing', revealed_at = current_timestamp WHERE id = p_round_id;
    END IF;
END;
$$;
