import React, { useEffect, useState } from 'react';
import { Leaf } from 'lucide-react';

export function PilatesLoader() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev < 100 ? prev + 1 : 100));
    }, 30);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: '#faf7f2' }}>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Montserrat:wght@300;400&display=swap');

        .font-elegant {
          font-family: 'Cormorant Garamond', serif;
        }

        .font-sans-elegant {
          font-family: 'Montserrat', sans-serif;
        }

        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.4; }
        }

        @keyframes rotate-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .circle-breathe {
          animation: breathe 4s ease-in-out infinite;
        }

        .ring-rotate {
          animation: rotate-slow 12s linear infinite;
        }

        .float-icon {
          animation: float 3s ease-in-out infinite;
        }

        .fade-up {
          animation: fadeUp 1s ease-out forwards;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />

      {/* Background ambient elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full blur-3xl opacity-20" style={{ backgroundColor: '#f5e6d3' }}></div>
        <div className="absolute top-[60%] -right-[10%] w-[40vw] h-[40vw] rounded-full blur-3xl opacity-20" style={{ backgroundColor: '#8aab8a' }}></div>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Loader Graphic */}
        <div className="relative w-48 h-48 flex items-center justify-center mb-8">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-[1px] border-dashed ring-rotate opacity-40" style={{ borderColor: '#2d2d2d' }}></div>
          
          {/* Breathing circles */}
          <div className="absolute w-32 h-32 rounded-full circle-breathe" style={{ backgroundColor: '#f5e6d3' }}></div>
          <div className="absolute w-24 h-24 rounded-full circle-breathe" style={{ backgroundColor: '#8aab8a', animationDelay: '1s' }}></div>
          <div className="absolute w-16 h-16 rounded-full circle-breathe" style={{ backgroundColor: '#c2684f', animationDelay: '2s' }}></div>

          {/* Central icon */}
          <div className="absolute float-icon text-white drop-shadow-md">
             <Leaf size={32} strokeWidth={1.5} color="#faf7f2" />
          </div>
        </div>

        {/* Brand */}
        <h1 className="text-5xl md:text-6xl font-elegant italic tracking-wider mb-3 fade-up" style={{ color: '#2d2d2d' }}>
          FisioGest Pro
        </h1>

        {/* Loading status */}
        <div className="flex flex-col items-center fade-up" style={{ animationDelay: '0.3s' }}>
          <p className="text-sm font-sans-elegant tracking-[0.2em] uppercase mb-4" style={{ color: '#c2684f' }}>
            Preparando seu espaço...
          </p>

          {/* Progress bar */}
          <div className="w-48 h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(45,45,45,0.1)' }}>
            <div 
              className="h-full transition-all duration-300 ease-out" 
              style={{ width: `${progress}%`, backgroundColor: '#8aab8a' }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PilatesLoader;
