import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CloudinaryImage } from "./CloudinaryImage";

export function BeforeAfterSlider({
  beforePath,
  afterPath,
  beforeLabel,
  afterLabel,
}: {
  beforePath: string;
  afterPath: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition]
  );
  const onMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.touches[0].clientX);
  }, [updatePosition]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [onMouseMove, onMouseUp, onTouchMove]);

  // Usamos clip-path para "revelar" a foto Antes apenas no lado esquerdo da
  // barra. Assim ambas as fotos ficam ancoradas no mesmo enquadramento (full
  // size) e somente a área visível muda — a Antes não desliza junto com a barra.
  const beforeClip = `inset(0 ${100 - position}% 0 0)`;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden select-none cursor-ew-resize bg-black touch-none"
      style={{ aspectRatio: "3/4", maxHeight: "520px" }}
      onMouseDown={(e) => { isDragging.current = true; updatePosition(e.clientX); }}
      onTouchStart={(e) => { isDragging.current = true; updatePosition(e.touches[0].clientX); }}
    >
      <CloudinaryImage
        objectPath={afterPath}
        alt="Depois"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      <CloudinaryImage
        objectPath={beforePath}
        alt="Antes"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: beforeClip, WebkitClipPath: beforeClip }}
        draggable={false}
      />
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 pointer-events-none" style={{ left: `${position}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-xl border-2 border-primary flex items-center justify-center">
          <ChevronLeft className="w-3 h-3 text-primary absolute left-1" />
          <ChevronRight className="w-3 h-3 text-primary absolute right-1" />
        </div>
      </div>
      <div className="absolute top-3 left-3 z-20 pointer-events-none">
        <span className="px-2 py-1 bg-black/60 text-white text-xs rounded-md backdrop-blur-sm">{beforeLabel}</span>
      </div>
      <div className="absolute top-3 right-3 z-20 pointer-events-none">
        <span className="px-2 py-1 bg-primary/80 text-white text-xs rounded-md backdrop-blur-sm">{afterLabel}</span>
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <span className="px-3 py-1 bg-black/50 text-white text-xs rounded-full backdrop-blur-sm">Arraste para comparar</span>
      </div>
    </div>
  );
}
