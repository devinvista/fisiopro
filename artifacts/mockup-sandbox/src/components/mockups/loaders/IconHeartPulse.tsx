import React from "react";
import { HeartPulse } from "lucide-react";

export function IconHeartPulse() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] text-[#1e3a5f] font-sans relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes draw-line {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 70%; margin-left: 0%; }
          100% { width: 0%; margin-left: 100%; }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; }
        .progress-bar { animation: draw-line 2s ease-in-out infinite; }
      `}} />

      <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0,50 Q25,30 50,50 T100,50" fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke">
            <animate attributeName="d" dur="5s" repeatCount="indefinite" values="M0,50 Q25,30 50,50 T100,50; M0,50 Q25,70 50,50 T100,50; M0,50 Q25,30 50,50 T100,50" />
          </path>
          <path d="M0,60 Q25,40 50,60 T100,60" fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke">
            <animate attributeName="d" dur="7s" repeatCount="indefinite" values="M0,60 Q25,80 50,60 T100,60; M0,60 Q25,40 50,60 T100,60; M0,60 Q25,80 50,60 T100,60" />
          </path>
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative w-32 h-32 mb-8 animate-float flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#f43f5e] opacity-0" style={{ animation: 'pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite' }}></div>
          <div className="absolute inset-0 rounded-full border-2 border-[#2563eb] opacity-0" style={{ animation: 'pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite 1s' }}></div>
          <div className="relative w-24 h-24 bg-white rounded-full shadow-lg shadow-rose-900/5 flex items-center justify-center border border-slate-100">
            <HeartPulse className="w-10 h-10 text-[#f43f5e] relative z-10 drop-shadow-sm" strokeWidth={2} />
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#f43f5e]/10 to-transparent"></div>
          </div>
        </div>

        <div className="text-center animate-fade-in-up">
          <p className="text-xs font-semibold text-[#f43f5e] uppercase tracking-widest mb-2">HeartPulse</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[#1e3a5f] flex items-center justify-center gap-2 mb-2">
            FisioGest <span className="text-[#2563eb] font-bold">Pro</span>
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 uppercase tracking-widest mt-4">
            <span className="w-2 h-2 rounded-full bg-[#f43f5e] animate-pulse"></span>
            Carregando sua clínica...
          </div>
        </div>

        <div className="w-48 h-1 bg-slate-200 rounded-full mt-8 overflow-hidden relative">
          <div className="absolute top-0 h-full bg-gradient-to-r from-[#f43f5e] to-[#2563eb] rounded-full progress-bar"></div>
        </div>
      </div>
    </div>
  );
}

export default IconHeartPulse;
