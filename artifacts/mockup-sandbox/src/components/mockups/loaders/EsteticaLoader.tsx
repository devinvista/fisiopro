import React from 'react';
import { Sparkles, Flower2 } from 'lucide-react';

export function EsteticaLoader() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        
        @keyframes bloom {
          0% { transform: scale(0.8) rotate(0deg); opacity: 0.5; }
          50% { transform: scale(1.1) rotate(180deg); opacity: 1; }
          100% { transform: scale(0.8) rotate(360deg); opacity: 0.5; }
        }
        
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        .font-playfair {
          font-family: 'Playfair Display', serif;
        }

        .text-gradient-gold {
          background: linear-gradient(to right, #d4a851, #f9d5d3, #d4a851);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
      `}</style>
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fdf8f5] relative overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#f9d5d3] rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-[float_8s_ease-in-out_infinite]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#e8b4b8] rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[float_10s_ease-in-out_infinite_reverse]" />
        </div>

        {/* Loader Core */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center mb-8">
            {/* Outer rings */}
            <div className="absolute inset-0 border border-[#d4a851]/30 rounded-full animate-[spin_10s_linear_infinite]" />
            <div className="absolute inset-2 border-t border-b border-[#d4a851]/50 rounded-full animate-[spin_6s_linear_infinite_reverse]" />
            
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#d4a851]/20 to-transparent animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
            
            {/* Center bloom */}
            <div className="relative w-16 h-16 bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(212,168,81,0.3)] border border-white/50">
              <Flower2 className="w-8 h-8 text-[#d4a851] animate-[bloom_4s_ease-in-out_infinite]" strokeWidth={1.5} />
            </div>

            {/* Sparkles */}
            <Sparkles className="absolute -top-4 -right-4 w-5 h-5 text-[#d4a851] animate-pulse" />
            <Sparkles className="absolute -bottom-2 -left-2 w-4 h-4 text-[#e8b4b8] animate-pulse delay-700" />
          </div>

          <h1 className="font-playfair text-4xl text-[#6b2d4e] mb-3 tracking-wide flex items-center gap-2">
            FisioGest <span className="text-gradient-gold italic">Pro</span>
          </h1>
          
          <p className="font-playfair text-[#6b2d4e]/70 tracking-widest text-sm uppercase">
            Sua beleza em boas mãos...
          </p>
        </div>
      </div>
    </>
  );
}
