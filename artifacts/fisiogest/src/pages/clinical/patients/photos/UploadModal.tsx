import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  X,
  Camera,
  Trash2,
  Loader2,
  ImagePlus,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { apiFetch } from "@/lib/api";
import { 
  ViewType, 
  AppointmentOption, 
  FileEntry, 
  VIEW_ORDER, 
  VIEW_LABELS, 
  ALLOWED_PHOTO_TYPES, 
  MAX_PHOTO_SIZE, 
  COMPRESSION_OPTIONS,
  autoAssignViews,
  appointmentLabel
} from "./types";

export function UploadModal({
  open,
  patientId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  patientId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [sessionLabel, setSessionLabel] = useState("");
  const [appointmentId, setAppointmentId] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
  type UploadStatus = "pending" | "compressing" | "uploading" | "saving" | "done" | "error";
  const [progress, setProgress] = useState<Record<number, { status: UploadStatus; percent: number; error?: string }>>({});

  const { data: appointments = [] } = useQuery<AppointmentOption[]>({
    queryKey: ["patient-appointments-for-photos", patientId],
    queryFn: async () => {
      const res = await apiFetch(`/api/appointments?patientId=${patientId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data
        .filter((a: any) => !["cancelado", "faltou", "remarcado"].includes(a.status))
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
        .slice(0, 30)
        .map((a: any) => ({
          id: a.id,
          date: a.date,
          startTime: a.startTime,
          status: a.status,
          procedure: a.procedure ? { id: a.procedure.id, name: a.procedure.name } : null,
        }));
    },
    enabled: open,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (!ALLOWED_PHOTO_TYPES.has(f.type)) {
        toast({ title: `Arquivo "${f.name}" não é uma imagem suportada.`, variant: "destructive" });
        return false;
      }
      if (f.size > MAX_PHOTO_SIZE) {
        toast({ title: `Arquivo "${f.name}" excede o limite de 15MB.`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...autoAssignViews(valid)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].previewUrl);
      next.splice(idx, 1);
      return next;
    });
  };

  const updateFileView = (idx: number, viewType: ViewType) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, viewType } : f)));
  };

  const setFileProgress = (idx: number, status: UploadStatus, percent: number, error?: string) => {
    setProgress((prev) => ({ ...prev, [idx]: { status, percent, error } }));
  };

  const uploadWithProgress = (
    url: string,
    formData: FormData,
    onProgress: (percent: number) => void,
  ): Promise<{ secure_url: string; bytes: number; format: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.withCredentials = true;
      const csrf = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("fisiogest_csrf="));
      if (csrf) xhr.setRequestHeader("x-csrf-token", decodeURIComponent(csrf.split("=")[1] ?? ""));

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Resposta inválida do servidor"));
          }
        } else {
          let message = `HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            message = body?.error || body?.message || message;
          } catch {
            /* ignore */
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error("Falha de rede no envio"));
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(Object.fromEntries(files.map((_, i) => [i, { status: "pending" as UploadStatus, percent: 0 }])));

    let successCount = 0;
    let firstErrorMessage: string | null = null;

    const errorMessage = (err: unknown, fallback: string): string => {
      if (err instanceof Error && err.message) return err.message;
      if (typeof err === "string" && err) return err;
      if (err && typeof err === "object") {
        const anyErr = err as { message?: unknown; error?: unknown };
        if (typeof anyErr.message === "string" && anyErr.message) return anyErr.message;
        if (typeof anyErr.error === "string" && anyErr.error) return anyErr.error;
      }
      return fallback;
    };

    const NORMALIZED_MIME: Record<string, string> = {
      "image/jpg": "image/jpeg",
      "image/heic": "image/jpeg",
      "image/heif": "image/jpeg",
    };

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      try {
        setFileProgress(i, "compressing", 0);

        // Compressão é "best effort". Falhas (ex.: HEIC sem decoder, blob corrompido)
        // não devem bloquear o upload — usamos o arquivo original como fallback.
        let toUpload: File | Blob = entry.file;
        try {
          const compressed = await imageCompression(entry.file, COMPRESSION_OPTIONS);
          if (compressed && compressed.size > 0) toUpload = compressed;
        } catch (compressionErr) {
          console.warn(
            `[upload] compressão falhou para "${entry.file.name}", enviando arquivo original.`,
            compressionErr,
          );
        }

        const uploadForm = new FormData();
        uploadForm.append("file", toUpload, entry.file.name);
        uploadForm.append("folder", `fisiogest/patients/${patientId}/photos`);

        setFileProgress(i, "uploading", 0);
        const uploaded = await uploadWithProgress(`/api/storage/uploads/proxy`, uploadForm, (percent) => {
          setFileProgress(i, "uploading", percent);
        });

        setFileProgress(i, "saving", 100);
        const rawType = (toUpload as Blob).type || entry.file.type || "image/jpeg";
        const contentType = NORMALIZED_MIME[rawType] ?? rawType;
        const payload: Record<string, unknown> = {
          objectPath: uploaded.secure_url,
          originalFilename: entry.file.name,
          contentType,
          fileSize: uploaded.bytes,
          viewType: entry.viewType,
        };
        if (sessionLabel) payload.sessionLabel = sessionLabel;
        if (appointmentId !== "none") payload.appointmentId = Number(appointmentId);

        const res = await apiFetch(`/api/patients/${patientId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || errBody?.message || `Falha ao salvar foto (HTTP ${res.status})`);
        }

        setFileProgress(i, "done", 100);
        successCount++;
      } catch (err) {
        console.error(`[upload] falha no envio de "${entry.file.name}":`, err);
        const message = errorMessage(err, "Erro ao enviar foto");
        setFileProgress(i, "error", 0, message);
        if (!firstErrorMessage) firstErrorMessage = message;
      }
    }

    setUploading(false);

    if (successCount === files.length) {
      toast({ title: `${successCount} foto(s) enviada(s) com sucesso.` });
      onSuccess();
      onClose();
      setFiles([]);
      setProgress({});
      setSessionLabel("");
      setAppointmentId("none");
    } else if (successCount > 0) {
      toast({
        title: `${successCount} de ${files.length} foto(s) enviada(s).`,
        description: firstErrorMessage ?? undefined,
        variant: "destructive",
      });
      onSuccess();
    } else {
      toast({
        title: "Erro ao enviar fotos.",
        description: firstErrorMessage ?? undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !uploading && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" /> Adicionar Fotos
          </DialogTitle>
          <DialogDescription>
            Envie fotos de diferentes vistas para documentar o progresso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Step 1: Photos */}
          <div className="space-y-3">
            <Label>Fotos selecionadas ({files.length})</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {files.map((f, i) => {
                const p = progress[i];
                const isActive = p && p.status !== "pending" && p.status !== "done" && p.status !== "error";
                const statusLabel: Record<UploadStatus, string> = {
                  pending: "Aguardando",
                  compressing: "Comprimindo…",
                  uploading: `Enviando ${p?.percent ?? 0}%`,
                  saving: "Salvando…",
                  done: "Enviada",
                  error: "Falhou",
                };
                return (
                <div key={i} className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-50 aspect-[3/4]">
                  <img src={f.previewUrl} width={160} height={160} className="w-full h-full object-cover" alt="Pré-visualização da foto" loading="lazy" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {!uploading && (
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {p?.status === "done" && (
                    <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-semibold">OK</div>
                  )}
                  {p?.status === "error" && (
                    <div
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-semibold"
                      title={p.error}
                    >ERRO</div>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2 px-3">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                      <span className="text-[10px] font-medium text-white text-center">{statusLabel[p.status]}</span>
                      <div className="w-full h-1.5 rounded-full bg-white/30 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-200"
                          style={{ width: `${p.status === "saving" ? 100 : p.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-white/90 backdrop-blur-sm border-t">
                    <Select
                      value={f.viewType}
                      onValueChange={(v) => updateFileView(i, v as ViewType)}
                      disabled={uploading}
                    >
                      <SelectTrigger className="h-7 text-[10px] px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIEW_ORDER.map((v) => (
                          <SelectItem key={v} value={v} className="text-xs">
                            {VIEW_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                );
              })}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-primary/30 transition-colors aspect-[3/4]"
              >
                <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center">
                  <ImagePlus className="w-4 h-4 text-primary" />
                </div>
                <span className="text-[10px] font-medium text-slate-500">Adicionar mais</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Rótulo da Sessão (Opcional)</Label>
              <Input
                placeholder="Ex: Pós-operatório 15 dias"
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                maxLength={100}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Vincular a Atendimento (Opcional)</Label>
              <Select value={appointmentId} onValueChange={setAppointmentId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione um atendimento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum vínculo</SelectItem>
                  {appointments.map((appt) => (
                    <SelectItem key={appt.id} value={String(appt.id)} className="text-xs">
                      {appointmentLabel(appt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancelar</Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="min-w-[120px]"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Salvar Fotos
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
