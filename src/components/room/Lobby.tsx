"use client";

import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Lobby({ room, players, isAdmin, questions }: { room: any, players: any[], isAdmin: boolean, questions: any[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${room.short_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    await supabase.rpc('advance_round', { p_room_id: room.id });
  };

  const bothPlayersJoined = players.length === 2;
  // Require 10 questions per player to start the game
  const p1Questions = questions.filter(q => q.player_id === players[0]?.id).length;
  const p2Questions = questions.filter(q => q.player_id === players[1]?.id).length;
  
  const bothPlayersReady = bothPlayersJoined && p1Questions === 10 && p2Questions === 10;

  return (
    <div className="w-full p-6 glass-card rounded-3xl space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-xl font-bold">Lobby</h2>
          <p className="text-sm text-secondary-foreground">Waiting for players to join and set questions...</p>
        </div>
        <button 
          onClick={handleCopyLink}
          className="flex items-center space-x-2 px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors text-sm"
        >
          <Copy className="w-4 h-4" />
          <span>{copied ? "Copied!" : "Copy Invite Link"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((index) => {
          const player = players[index];
          const qCount = player ? questions.filter(q => q.player_id === player.id).length : 0;
          return (
            <div key={index} className="p-4 rounded-xl border border-border/50 bg-background/30 flex items-center justify-between">
              {player ? (
                <>
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-lg">{player.display_name}</span>
                  </div>
                  <div className="text-sm text-secondary-foreground">
                    {qCount} questions added
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-3 text-secondary-foreground/50">
                  <div className="w-5 h-5 rounded-full border-2 border-dashed border-secondary-foreground/50" />
                  <span>Waiting for Player {index + 1}...</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="pt-4 border-t border-border/50 flex justify-end">
          <button
            onClick={handleStartGame}
            disabled={!bothPlayersReady}
            className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Game
          </button>
        </div>
      )}
    </div>
  );
}
