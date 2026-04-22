import { useState, useEffect } from "react";
import { ImageOff } from "lucide-react";

export const CloudinaryImage = ({
  objectPath,
  alt,
  className,
  style,
  draggable,
  onBlobReady,
}: {
  objectPath: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  onBlobReady?: (url: string) => void;
}) => {
  const [error, setError] = useState(false);

  useEffect(() => {
    if (onBlobReady) onBlobReady(objectPath);
  }, [objectPath, onBlobReady]);

  if (error)
    return (
      <div
        className={`bg-slate-100 flex items-center justify-center ${className ?? ""}`}
        style={style}
      >
        <ImageOff className="w-5 h-5 text-slate-300" />
      </div>
    );

  return (
    <img
      src={objectPath}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
    />
  );
};
