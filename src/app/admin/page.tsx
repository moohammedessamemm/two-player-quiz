"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/utils";
import { LogOut, Plus, Users, Loader2 } from "lucide-react";

type Room = {
  id: string;
  short_code: string;
  status: string;
  created_at: string;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUser(user);
    fetchRooms(user.id);
  };

  const fetchRooms = async (userId: string) => {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setRooms(data);
    }
    setLoading(false);
  };

  const handleCreateRoom = async () => {
    if (!user) return;
    setCreating(true);
    const shortCode = generateRoomCode();
    
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        short_code: shortCode,
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/room/${data.short_code}`);
    } else {
      console.error(error);
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col p-6 sm:p-12 max-w-5xl mx-auto w-full space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-secondary-foreground">Manage your game rooms</p>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 text-secondary-foreground hover:text-white transition-colors rounded-lg hover:bg-secondary"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="flex flex-col gap-6">
        <button
          onClick={handleCreateRoom}
          disabled={creating}
          className="w-full sm:w-auto self-start px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center space-x-2"
        >
          {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          <span>Create New Room</span>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <div 
              key={room.id}
              onClick={() => router.push(`/room/${room.short_code}`)}
              className="p-6 glass-card rounded-2xl cursor-pointer hover:-translate-y-1 transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold font-mono tracking-wider group-hover:text-primary transition-colors">
                  {room.short_code}
                </h3>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  room.status === 'lobby' ? 'bg-blue-500/20 text-blue-400' :
                  room.status === 'playing' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {room.status.toUpperCase()}
                </span>
              </div>
              <div className="text-sm text-secondary-foreground flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Created {new Date(room.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {rooms.length === 0 && (
            <div className="col-span-full p-8 text-center border-2 border-dashed border-border rounded-2xl text-secondary-foreground">
              No rooms created yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
