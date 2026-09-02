"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import JoinLobby from "@/components/room/JoinLobby";
import Lobby from "@/components/room/Lobby";
import QuestionSetup from "@/components/room/QuestionSetup";
import GamePhase from "@/components/room/GamePhase";

export default function RoomClient({ shortCode }: { shortCode: string }) {
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState<any>(null);
  
  const [sessionId, setSessionId] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Session ID from localStorage
    let storedSession = localStorage.getItem("qbu_session_id");
    if (!storedSession) {
      storedSession = uuidv4();
      localStorage.setItem("qbu_session_id", storedSession);
    }
    setSessionId(storedSession);

    loadRoomData(storedSession);
  }, [shortCode]);

  const loadRoomData = async (sessId: string) => {
    // 1. Get room
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("short_code", shortCode)
      .single();

    if (roomError || !roomData) {
      setError("Room not found");
      setLoading(false);
      return;
    }
    setRoom(roomData);

    // 2. Check admin
    const { data: { user } } = await supabase.auth.getUser();
    const admin = user?.id === roomData.created_by;
    setIsAdmin(admin);

    // 3. Get players
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomData.id);
    setPlayers(playersData || []);

    // Try to find if I'm already a player in this room
    if (playersData) {
      const me = playersData.find((p) => p.session_id === sessId);
      if (me) setMyPlayerId(me.id);
    }

    // 4. Get questions
    const { data: questionsData } = await supabase
      .from("questions")
      .select("*")
      .eq("room_id", roomData.id)
      .order("position", { ascending: true });
    setQuestions(questionsData || []);

    // 5. Get latest round
    const { data: roundsData } = await supabase
      .from("rounds")
      .select("*, questions(*)")
      .eq("room_id", roomData.id)
      .order("round_number", { ascending: false })
      .limit(1);
    
    if (roundsData && roundsData.length > 0) {
      setCurrentRound(roundsData[0]);
    }

    setLoading(false);

    // Subscriptions
    const channelName = `room_${roomData.id}_${Date.now()}_${Math.random()}`;
    const sub = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomData.id}` }, (payload) => {
        setRoom(payload.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomData.id}` }, async (payload) => {
        // Refresh players
        const { data } = await supabase.from("players").select("*").eq("room_id", roomData.id);
        setPlayers(data || []);
        if (payload.eventType === 'INSERT' && payload.new.session_id === sessId) {
          setMyPlayerId(payload.new.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `room_id=eq.${roomData.id}` }, async () => {
        const { data } = await supabase.from("questions").select("*").eq("room_id", roomData.id).order("position", { ascending: true });
        setQuestions(data || []);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomData.id}` }, async () => {
        const { data } = await supabase.from("rounds").select("*, questions(*)").eq("room_id", roomData.id).order("round_number", { ascending: false }).limit(1);
        if (data && data.length > 0) setCurrentRound(data[0]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-destructive">Error</h1>
          <p className="text-secondary-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // Derived state
  const joined = !!myPlayerId;
  const showSetup = joined && room.status === 'lobby';
  const showGame = room.status === 'playing' || room.status === 'completed';

  return (
    <main className="flex-1 flex flex-col p-4 sm:p-8 max-w-4xl mx-auto w-full">
      {!joined && <JoinLobby room={room} sessionId={sessionId} />}
      
      {showSetup && (
        <div className="space-y-8 w-full">
          <Lobby 
            room={room} 
            players={players} 
            isAdmin={isAdmin} 
            questions={questions}
          />
          <QuestionSetup 
            room={room} 
            myPlayerId={myPlayerId} 
            sessionId={sessionId}
            questions={questions.filter(q => q.player_id === myPlayerId)} 
          />
        </div>
      )}

      {showGame && (
        <GamePhase 
          room={room}
          players={players}
          currentRound={currentRound}
          myPlayerId={myPlayerId}
          sessionId={sessionId}
          isAdmin={isAdmin}
        />
      )}
    </main>
  );
}
