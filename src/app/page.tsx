import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-primary/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[100px] -z-10 opacity-50 pointer-events-none" />

      <div className="max-w-xl w-full flex flex-col items-center text-center space-y-8 z-10">
        
        <div className="inline-flex items-center space-x-2 bg-secondary/50 border border-border px-3 py-1 rounded-full text-sm font-medium text-secondary-foreground mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>For exactly two players</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60">
          Questions Between Us
        </h1>
        
        <p className="text-lg sm:text-xl text-secondary-foreground max-w-md">
          A private, real-time question game. Discover what you both really think.
        </p>

        <div className="pt-8 w-full flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link 
            href="/login"
            className="w-full sm:w-auto px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:-translate-y-0.5"
          >
            <span>Create Room</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

      </div>
    </main>
  );
}
