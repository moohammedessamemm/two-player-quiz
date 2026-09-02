"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function JoinLobby({ room, sessionId }: { room: any, sessionId: string }) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    setError(null);

    const { data, error } = await supabase.rpc('join_room', {
      p_short_code: room.short_code,
      p_display_name: name.trim(),
      p_session_id: sessionId
    });

    if (error) {
      setError(error.message);
      setJoining(false);
    }
    // if successful, RoomClient will see the subscription update and we'll have joined
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 mt-12">
      <div className="w-full max-w-md p-8 rounded-3xl glass-card space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Join Room</h1>
          <p className="text-secondary-foreground font-mono bg-secondary/50 px-3 py-1 rounded-full inline-block">{room.short_code}</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4 pt-4">
          <div className="space-y-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={20}
              className="w-full px-4 py-4 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-500 text-lg text-center"
              placeholder="Your Name"
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="w-full py-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center text-lg"
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}
