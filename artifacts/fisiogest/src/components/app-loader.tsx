import { Activity } from "lucide-react";

export function AppLoader() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#f8fafc] text-[#1e3a5f] font-sans relative overflow-hidden">
      <style>{`
        @keyframes fg-pulse-ring {
          0%   { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes fg-float {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fg-progress {
          0%   { left: -60%; width: 60%; }
          50%  { left: 40%; width: 60%; }
          100% { left: 100%; width: 60%; }
        }
        @keyframes fg-fade-in-up {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fg-spine-glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        .fg-float        { animation: fg-float 3s ease-in-out infinite; }
        .fg-fade-in-up   { animation: fg-fade-in-up 0.8s ease-out forwards; }
        .fg-progress-bar { animation: fg-progress 2s ease-in-out infinite; }
        .fg-spine-dot    { animation: fg-spine-glow 2s ease-in-out infinite; }
        .fg-spine-dot:nth-child(1) { animation-delay: 0.0s; }
        .fg-spine-dot:nth-child(2) { animation-delay: 0.2s; }
        .fg-spine-dot:nth-child(3) { animation-delay: 0.4s; }
        .fg-spine-dot:nth-child(4) { animation-delay: 0.6s; }
        .fg-spine-dot:nth-child(5) { animation-delay: 0.8s; }
      `}</style>

      {/* Background abstract waves */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0,50 Q25,30 50,50 T100,50" fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke">
            <animate attributeName="d" dur="5s" repeatCount="indefinite"
              values="M0,50 Q25,30 50,50 T100,50; M0,50 Q25,70 50,50 T100,50; M0,50 Q25,30 50,50 T100,50" />
          </path>
          <path d="M0,60 Q25,40 50,60 T100,60" fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke">
            <animate attributeName="d" dur="7s" repeatCount="indefinite"
              values="M0,60 Q25,80 50,60 T100,60; M0,60 Q25,40 50,60 T100,60; M0,60 Q25,80 50,60 T100,60" />
          </path>
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Floating icon container */}
        <div className="relative w-32 h-32 mb-8 fg-float flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#10b981] opacity-0"
            style={{ animation: "fg-pulse-ring 2s cubic-bezier(0.215,0.61,0.355,1) infinite" }} />
          <div className="absolute inset-0 rounded-full border-2 border-[#2563eb] opacity-0"
            style={{ animation: "fg-pulse-ring 2s cubic-bezier(0.215,0.61,0.355,1) infinite 1s" }} />

          <div className="relative w-24 h-24 bg-white rounded-full shadow-lg shadow-blue-900/5 flex items-center justify-center border border-slate-100 overflow-hidden">
            {/* Spine dots */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-20">
              <div className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f] fg-spine-dot" />
              <div className="w-2   h-1.5 rounded-full bg-[#1e3a5f] fg-spine-dot" />
              <div className="w-2.5 h-1.5 rounded-full bg-[#1e3a5f] fg-spine-dot" />
              <div className="w-2   h-1.5 rounded-full bg-[#1e3a5f] fg-spine-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f] fg-spine-dot" />
            </div>
            <Activity className="w-10 h-10 text-[#2563eb] relative z-10 drop-shadow-sm" strokeWidth={2.5} />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#10b981]/10 to-transparent mix-blend-multiply" />
          </div>
        </div>

        {/* Typography */}
        <div className="text-center fg-fade-in-up">
          <h1 className="text-3xl font-semibold tracking-tight text-[#1e3a5f] flex items-center justify-center gap-2 mb-2">
            FisioGest <span className="text-[#2563eb] font-bold">Pro</span>
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 uppercase tracking-widest mt-4">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
            Carregando sua clínica…
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-1 bg-slate-200 rounded-full mt-8 overflow-hidden relative">
          <div className="absolute top-0 h-full bg-gradient-to-r from-[#2563eb] to-[#10b981] rounded-full fg-progress-bar" />
        </div>
      </div>
    </div>
  );
}
