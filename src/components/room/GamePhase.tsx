"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Send, ArrowRight } from "lucide-react";

export default function GamePhase({ 
  room, players, currentRound, myPlayerId, sessionId, isAdmin 
}: { 
  room: any, players: any[], currentRound: any, myPlayerId: string | null, sessionId: string, isAdmin: boolean
}) {
  const [answers, setAnswers] = useState<any[]>([]);
  const [myAnswerInput, setMyAnswerInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentRound) return;
    
    // Fetch answers for the current round
    fetchAnswers();

    // Setup realtime subscription for answers in this round
    const channelName = `round_${currentRound.id}_answers_${Date.now()}_${Math.random()}`;
    const sub = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `round_id=eq.${currentRound.id}` }, () => {
        fetchAnswers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [currentRound?.id, currentRound?.status]);

  useEffect(() => {
    // The round now advances purely via submit_answer when both players answer.
  }, [currentRound?.status]);

  const fetchAnswers = async () => {
    if (!currentRound) return;
    
    // If revealing or completed, we can just select from table (RLS allows it)
    if (currentRound.status === 'revealing' || currentRound.status === 'completed') {
      const { data } = await supabase.from('answers').select('*').eq('round_id', currentRound.id);
      setAnswers(data || []);
    } else {
      // During answering, we can only see our own answer via RPC or local state.
      // But we know if the other player submitted by checking the length of answers? No, RLS blocks SELECT.
      // Wait, RLS blocks SELECT for others. We can still try to select. It will just return our own answer if we added a policy, but we didn't add a policy for own answer.
      // We can use the RPC get_my_answer.
      if (myPlayerId) {
        const { data } = await supabase.rpc('get_my_answer', {
          p_round_id: currentRound.id,
          p_player_id: myPlayerId,
          p_session_id: sessionId
        });
        if (data) {
          setAnswers([{ player_id: myPlayerId, answer_text: data }]);
          setMyAnswerInput(data); // populate input if refreshed
        } else {
          setAnswers([]);
          setMyAnswerInput("");
        }
      } else {
        setAnswers([]);
      }
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myAnswerInput.trim() || !myPlayerId) return;
    setSubmitting(true);

    const { error } = await supabase.rpc('submit_answer', {
      p_round_id: currentRound.id,
      p_player_id: myPlayerId,
      p_session_id: sessionId,
      p_answer_text: myAnswerInput.trim()
    });

    if (error) {
      console.error(error);
      alert("Failed to submit answer: " + error.message);
    } else {
      // Optimistically update
      setAnswers([{ player_id: myPlayerId, answer_text: myAnswerInput.trim() }]);
    }
    setSubmitting(false);
  };

  const handleNextRound = async () => {
    await supabase.rpc('advance_round', { p_room_id: room.id });
  };

  if (room.status === 'completed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Game Complete</h1>
        <p className="text-secondary-foreground text-lg">Thank you for playing!</p>
        {isAdmin ? (
          <button onClick={() => window.location.href = '/admin'} className="px-6 py-3 bg-secondary rounded-xl hover:bg-secondary/80 transition-colors">
            Return to Dashboard
          </button>
        ) : (
          <p className="text-secondary-foreground text-sm">You can safely close this window now.</p>
        )}
      </div>
    );
  }

  if (!currentRound) return null;

  const question = currentRound.questions;
  const questionOwner = players.find(p => p.id === question.player_id);
  const myAnswerSubmitted = answers.some(a => a.player_id === myPlayerId);

  return (
    <div className="flex flex-col w-full h-full max-w-4xl mx-auto justify-center space-y-8 mt-12">
      
      {/* Header Info */}
      <div className="flex justify-between items-center px-4">
        <span className="text-sm font-semibold tracking-widest text-primary uppercase">
          Round {currentRound.round_number}
        </span>
        <span className="text-sm text-secondary-foreground">
          Question by {questionOwner?.display_name || "Unknown"}
        </span>
      </div>

      {/* Main Card */}
      <div className="p-8 sm:p-12 glass-card rounded-[2rem] relative overflow-hidden text-center min-h-[300px] flex flex-col items-center justify-center space-y-8 shadow-2xl">
        
        <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
          {question.question_text}
        </h2>

      </div>

      {/* Answer Area */}
      {currentRound.status === 'answering' && myPlayerId && (
        <div className="w-full">
          {!myAnswerSubmitted ? (
            <form onSubmit={handleSubmitAnswer} className="relative w-full max-w-2xl mx-auto">
              <input
                type="text"
                value={myAnswerInput}
                onChange={(e) => setMyAnswerInput(e.target.value)}
                placeholder="Type your answer..."
                className="w-full px-6 py-5 bg-secondary/80 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-500 text-lg shadow-lg pr-16"
                autoFocus
              />
              <button
                type="submit"
                disabled={!myAnswerInput.trim() || submitting}
                className="absolute right-3 top-3 p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          ) : (
            <div className="text-center p-6 glass-card rounded-2xl max-w-xl mx-auto border border-green-500/20 bg-green-500/5">
              <p className="text-lg text-green-400 font-medium flex items-center justify-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span>Answer locked. Waiting for the other player...</span>
              </p>
            </div>
          )}
        </div>
      )}

      {currentRound.status === 'revealing' && (
        <div className="space-y-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {players.map(player => {
              const pAns = answers.find(a => a.player_id === player.id);
              return (
                <div key={player.id} className="p-6 glass-card rounded-2xl border border-primary/20 space-y-4">
                  <div className="text-sm font-semibold tracking-wider text-secondary-foreground uppercase">
                    {player.display_name}'s Answer
                  </div>
                  <div className="text-xl sm:text-2xl font-medium">
                    {pAns ? pAns.answer_text : <span className="text-destructive/80 italic">No answer submitted</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="flex justify-center pt-8">
              <button
                onClick={handleNextRound}
                className="px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all flex items-center space-x-3 shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                <span>Next Round</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Admin Controls */}
      {isAdmin && (
        <div className="pt-12 flex justify-center w-full space-x-4">
          {currentRound.status === 'answering' && (
            <button
              onClick={async () => {
                await supabase.from('rounds').update({ status: 'revealing', revealed_at: new Date().toISOString() }).eq('id', currentRound.id);
              }}
              className="text-secondary-foreground hover:text-white text-sm font-medium transition-colors border border-border hover:border-secondary-foreground px-4 py-2 rounded-lg"
            >
              Force Reveal
            </button>
          )}
          <button
            onClick={async () => {
              if (confirm("Are you sure you want to end the game early?")) {
                await supabase.from('rooms').update({ status: 'completed' }).eq('id', room.id);
              }
            }}
            className="text-destructive/50 hover:text-destructive text-sm font-medium transition-colors border border-destructive/20 hover:border-destructive/50 px-4 py-2 rounded-lg"
          >
            End Game
          </button>
        </div>
      )}
    </div>
  );
}
