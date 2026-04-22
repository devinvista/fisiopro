import { useState } from "react";
import { 
  Camera, 
  Tag, 
  Link2, 
  ZoomIn 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  PhotoSession, 
  PatientPhoto, 
  VIEW_ORDER, 
  VIEW_LABELS, 
  VIEW_COLORS, 
  formatDate 
} from "./types";
import { CloudinaryImage } from "./CloudinaryImage";
import { PhotoLightbox } from "./PhotoLightbox";

export function SessionCard({
  session,
  patientId,
  onPhotoDeleted,
  onPhotoUpdated,
}: {
  session: PhotoSession;
  patientId: number;
  onPhotoDeleted: (photoId: number) => void;
  onPhotoUpdated: (updated: PatientPhoto) => void;
}) {
  const [lightbox, setLightbox] = useState<PatientPhoto | null>(null);

  const linkedAppointment = session.photos.find((p) => p.appointmentDetails)?.appointmentDetails ?? null;

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Camera className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-800">
              {formatDate(session.dateKey + "T12:00:00")}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              {session.label && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> {session.label}
                </p>
              )}
              {linkedAppointment && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <Link2 className="w-3 h-3" />
                  <span>{linkedAppointment.procedure?.name ?? "Atendimento"}</span>
                  <span className="text-slate-400">·</span>
                  <span>{linkedAppointment.startTime}</span>
                </div>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {session.photos.length} foto{session.photos.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {VIEW_ORDER.map((viewType) => {
            const photo = session.photos.find((p) => p.viewType === viewType);
            if (!photo) return null;
            return (
              <button
                key={photo.id}
                className="group relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-200 hover:border-primary/40 hover:shadow-md transition-all"
                onClick={() => setLightbox(photo)}
              >
                <CloudinaryImage objectPath={photo.objectPath} alt={VIEW_LABELS[viewType]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-5 h-5 text-white drop-shadow" />
                </div>
                <div className="absolute top-1.5 left-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${VIEW_COLORS[viewType]}`}>
                    {VIEW_LABELS[viewType]}
                  </span>
                </div>
                {photo.appointmentId && (
                  <div className="absolute bottom-1 right-1">
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center" title="Vinculada a atendimento">
                      <Link2 className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {lightbox && (
        <PhotoLightbox
          photo={lightbox}
          patientId={patientId}
          onClose={() => setLightbox(null)}
          onDelete={() => onPhotoDeleted(lightbox.id)}
          onUpdated={(updated) => { onPhotoUpdated(updated); setLightbox(updated); }}
        />
      )}
    </>
  );
}
