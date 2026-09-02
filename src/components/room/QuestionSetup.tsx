"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2 } from "lucide-react";

export default function QuestionSetup({ 
  room, myPlayerId, sessionId, questions 
}: { 
  room: any, myPlayerId: string, sessionId: string, questions: any[] 
}) {
  const [newQuestion, setNewQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || questions.length >= 10) return;
    setSubmitting(true);

    await supabase.rpc('add_question', {
      p_room_id: room.id,
      p_player_id: myPlayerId,
      p_session_id: sessionId,
      p_question_text: newQuestion.trim(),
      p_position: questions.length + 1
    });

    setNewQuestion("");
    setSubmitting(false);
  };

  const handleDelete = async (questionId: string) => {
    await supabase.rpc('delete_question', {
      p_question_id: questionId,
      p_player_id: myPlayerId,
      p_session_id: sessionId
    });
  };

  return (
    <div className="w-full p-6 glass-card rounded-3xl space-y-6">
      <div className="flex justify-between items-center border-b border-border/50 pb-6">
        <h2 className="text-xl font-bold">Your Questions</h2>
        <span className="text-sm bg-secondary px-3 py-1 rounded-full text-secondary-foreground">
          {questions.length} / 10
        </span>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border/50">
            <div className="flex items-center space-x-3">
              <span className="text-secondary-foreground font-mono text-sm">{i + 1}.</span>
              <span>{q.question_text}</span>
            </div>
            <button 
              onClick={() => handleDelete(q.id)}
              className="p-2 text-secondary-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {questions.length < 10 && (
        <form onSubmit={handleAddQuestion} className="flex items-center space-x-2 pt-2">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Type a question..."
            maxLength={150}
            className="flex-1 px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-500"
          />
          <button
            type="submit"
            disabled={!newQuestion.trim() || submitting}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
          </button>
        </form>
      )}

      {questions.length === 10 && (
        <div className="text-center text-sm text-green-400 p-4 bg-green-400/10 rounded-xl border border-green-400/20">
          You have added all your questions. Waiting for the game to start.
        </div>
      )}
    </div>
  );
}
