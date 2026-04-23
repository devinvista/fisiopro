import { useState, useRef, useEffect, WheelEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Trash2,
  Loader2,
  ZoomIn,
  ZoomOut,
  Calendar,
  Tag,
  Info,
  Download,
  Pencil,
  Check,
  RotateCcw,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/lib/toast";
import { apiFetch } from "@/utils/api";
import { 
  PatientPhoto, 
  ViewType, 
  AppointmentOption, 
  VIEW_LABELS, 
  VIEW_ORDER, 
  VIEW_COLORS, 
  formatDate, 
  formatBytes, 
  appointmentLabel 
} from "./types";
import { CloudinaryImage } from "./CloudinaryImage";
import { AppointmentBadge } from "./AppointmentBadge";

export function PhotoLightbox({
  photo,
  patientId,
  onClose,
  onDelete,
  onUpdated,
}: {
  photo: PatientPhoto;
  patientId: number;
  onClose: () => void;
  onDelete: () => void;
  onUpdated: (updated: PatientPhoto) => void;
}) {
  const { toast } = useToast();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit state
  const [editViewType, setEditViewType] = useState<ViewType>(photo.viewType);
  const [editNotes, setEditNotes] = useState(photo.notes ?? "");
  const [editLabel, setEditLabel] = useState(photo.sessionLabel ?? "");
  const [editApptId, setEditApptId] = useState<string>(photo.appointmentId ? String(photo.appointmentId) : "none");
  const [saving, setSaving] = useState(false);

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
    enabled: editing,
  });

  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.max(1, Math.min(5, s + delta)));
  };

  useEffect(() => { resetZoom(); setEditing(false); }, [photo.id]);

  const handleDownload = async () => {
    if (!blobUrl) return;
    try {
      const res = await fetch(blobUrl);
      if (!res.ok) throw new Error("Falha ao baixar a foto");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.originalFilename ?? `foto-${photo.viewType}-${photo.takenAt.split("T")[0]}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao baixar a foto.", variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/patients/${photo.patientId}/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewType: editViewType,
          notes: editNotes || null,
          sessionLabel: editLabel || null,
          appointmentId: editApptId !== "none" ? parseInt(editApptId) : null,
        }),
      });
      if (!res.ok) throw new Error();
      const updated: PatientPhoto = await res.json();
      onUpdated(updated);
      setEditing(false);
      toast({ title: "Foto atualizada com sucesso." });
    } catch {
      toast({ title: "Erro ao salvar alterações.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {/* Image */}
          <div
            className="relative bg-black overflow-hidden"
            style={{ height: "58vh", cursor: scale > 1 ? "grab" : "default" }}
            onWheel={handleWheel}
            onMouseDown={(e) => { if (scale <= 1) return; isPanning.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; }}
            onMouseMove={(e) => {
              if (!isPanning.current) return;
              const dx = e.clientX - lastPos.current.x;
              const dy = e.clientY - lastPos.current.y;
              lastPos.current = { x: e.clientX, y: e.clientY };
              setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
            }}
            onMouseUp={() => { isPanning.current = false; }}
            onMouseLeave={() => { isPanning.current = false; }}
          >
            <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "center center", transition: isPanning.current ? "none" : "transform 0.1s ease", width: "100%", height: "100%" }}>
              <CloudinaryImage objectPath={photo.objectPath} alt={VIEW_LABELS[photo.viewType]} className="w-full h-full object-contain" onBlobReady={setBlobUrl} draggable={false} />
            </div>
            {/* Zoom controls */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 z-20">
              <button onClick={() => setScale((s) => Math.min(5, s + 0.5))} className="w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><ZoomIn className="w-3.5 h-3.5" /></button>
              <button onClick={() => setScale((s) => { const n = Math.max(1, s - 0.5); if (n === 1) setOffset({ x: 0, y: 0 }); return n; })} className="w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><ZoomOut className="w-3.5 h-3.5" /></button>
              {scale !== 1 && <button onClick={resetZoom} className="w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><RotateCcw className="w-3.5 h-3.5" /></button>}
              {scale !== 1 && <span className="px-1.5 py-0.5 bg-black/60 text-white text-xs rounded-md">{Math.round(scale * 100)}%</span>}
            </div>
            {/* Actions */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
              {blobUrl && <button onClick={handleDownload} className="w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80" title="Baixar foto"><Download className="w-3.5 h-3.5" /></button>}
              <button onClick={onClose} className="w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="w-3.5 h-3.5" /></button>
            </div>
            {scale === 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <span className="px-2 py-1 bg-black/50 text-white text-xs rounded-full backdrop-blur-sm">Scroll para ampliar</span>
              </div>
            )}
          </div>

          {/* Info / Edit */}
          <div className="p-4 space-y-3">
            {!editing ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${VIEW_COLORS[photo.viewType]}`}>
                      {VIEW_LABELS[photo.viewType]}
                    </Badge>
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />{formatDate(photo.takenAt)}
                    </span>
                    {photo.sessionLabel && (
                      <span className="text-sm text-slate-500 flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5" />{photo.sessionLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700 h-8 px-2" onClick={() => setEditing(true)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>

                {photo.appointmentDetails && (
                  <AppointmentBadge appt={photo.appointmentDetails} />
                )}

                {photo.notes && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 flex gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />{photo.notes}
                  </p>
                )}
                {photo.originalFilename && (
                  <p className="text-xs text-slate-400">{photo.originalFilename}{photo.fileSize ? ` · ${formatBytes(photo.fileSize)}` : ""}</p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Editar informações da foto</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Vista</Label>
                    <Select value={editViewType} onValueChange={(v) => setEditViewType(v as ViewType)}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VIEW_ORDER.map((v) => <SelectItem key={v} value={v} className="text-xs">{VIEW_LABELS[v]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Rótulo de Sessão</Label>
                    <Input className="mt-1 h-8 text-xs" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={100} placeholder="Ex: Avaliação Inicial" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-blue-500" /> Atendimento vinculado
                  </Label>
                  <Select value={editApptId} onValueChange={setEditApptId}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Sem vínculo</SelectItem>
                      {appointments.map((appt) => (
                        <SelectItem key={appt.id} value={String(appt.id)} className="text-xs">{appointmentLabel(appt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea className="mt-1 resize-none text-xs" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} maxLength={1000} placeholder="Notas clínicas…" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
                  <Button size="sm" className="flex-1" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir foto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A foto será removida permanentemente do prontuário.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { setConfirmDelete(false); onDelete(); onClose(); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
