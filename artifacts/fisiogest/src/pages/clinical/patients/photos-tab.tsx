import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Upload,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/utils/api";
import { 
  PatientPhoto, 
  groupBySession 
} from "./_photos/types";
import { UploadModal } from "./_photos/UploadModal";
import { CompareModal } from "./_photos/CompareModal";
import { SessionCard } from "./_photos/SessionCard";

export function PhotosTab({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const { data: photos = [], isLoading } = useQuery<PatientPhoto[]>({
    queryKey: ["patient-photos", patientId],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/${patientId}/photos`);
      if (!res.ok) throw new Error("Falha ao carregar fotos");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (photoId: number) => {
      const res = await apiFetch(`/api/patients/${patientId}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir foto");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-photos", patientId] });
      toast({ title: "Foto excluída com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro ao excluir foto.", variant: "destructive" });
    },
  });

  const handlePhotoUpdated = useCallback((updated: PatientPhoto) => {
    queryClient.setQueryData<PatientPhoto[]>(
      ["patient-photos", patientId],
      (old) => old?.map((p) => (p.id === updated.id ? { ...updated, appointmentDetails: p.appointmentDetails } : p)) ?? []
    );
  }, [queryClient, patientId]);

  const sessions = groupBySession(photos);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Acompanhamento Fotográfico
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Registre a evolução visual do paciente ao longo do tratamento
          </p>
        </div>
        <div className="flex gap-2">
          {sessions.length >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
              <SlidersHorizontal className="w-4 h-4" /> Comparar
            </Button>
          )}
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> Adicionar Fotos
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
          <p className="text-sm">Carregando fotos…</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
          <Camera className="w-12 h-12 mb-4 text-slate-300" />
          <p className="font-medium text-slate-500">Nenhuma foto registrada</p>
          <p className="text-sm mt-1 mb-5">Adicione fotos para acompanhar a evolução visual do tratamento</p>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> Adicionar Primeiras Fotos
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-primary/5 rounded-xl p-3 border border-primary/10 text-center">
              <p className="text-2xl font-bold text-primary">{sessions.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Sessões</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-2xl font-bold text-slate-700">{photos.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Fotos no total</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-2xl font-bold text-slate-700">
                {sessions.length > 1
                  ? (() => {
                      const first = new Date(sessions[sessions.length - 1].dateKey);
                      const last = new Date(sessions[0].dateKey);
                      const days = Math.round((last.getTime() - first.getTime()) / 86400000);
                      return days >= 30 ? `${Math.round(days / 30)}m` : `${days}d`;
                    })()
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Período</p>
            </div>
          </div>

          {sessions.map((session) => (
            <SessionCard
              key={session.dateKey}
              session={session}
              patientId={patientId}
              onPhotoDeleted={(id) => deleteMutation.mutate(id)}
              onPhotoUpdated={handlePhotoUpdated}
            />
          ))}
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        patientId={patientId}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient-photos", patientId] })}
      />

      <CompareModal
        open={compareOpen}
        sessions={sessions}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}
