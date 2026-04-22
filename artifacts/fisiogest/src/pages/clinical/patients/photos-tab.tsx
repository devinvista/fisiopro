import { useState, useRef, useCallback, useEffect, WheelEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/utils/api";
import {
  Camera,
  Upload,
  X,
  Trash2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ImageOff,
  ZoomIn,
  ZoomOut,
  Calendar,
  Tag,
  Info,
  Download,
  Pencil,
  Check,
  RotateCcw,
  ImagePlus,
  LayoutGrid,
  Link2,
  Stethoscope,
  Clock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import imageCompression from "browser-image-compression";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewType = "frontal" | "lateral_d" | "lateral_e" | "posterior" | "detalhe";

interface AppointmentDetails {
  id: number;
  date: string;
  startTime: string;
  status: string;
  procedure: { id: number; name: string } | null;
}

interface PatientPhoto {
  id: number;
  patientId: number;
  clinicId: number | null;
  takenAt: string;
  viewType: ViewType;
  sessionLabel: string | null;
  objectPath: string;
  originalFilename: string | null;
  contentType: string | null;
  fileSize: number | null;
  notes: string | null;
  appointmentId: number | null;
  appointmentDetails: AppointmentDetails | null;
  createdAt: string;
}

interface AppointmentOption {
  id: number;
  date: string;
  startTime: string;
  status: string;
  procedure: { id: number; name: string } | null;
}

interface PhotoSession {
  dateKey: string;
  label: string | null;
  photos: PatientPhoto[];
}

interface FileEntry {
  file: File;
  previewUrl: string;
  viewType: ViewType;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_LABELS: Record<ViewType, string> = {
  frontal: "Frontal",
  lateral_d: "Lateral Dir.",
  lateral_e: "Lateral Esq.",
  posterior: "Posterior",
  detalhe: "Detalhe",
};

const VIEW_ORDER: ViewType[] = [
  "frontal",
  "lateral_d",
  "lateral_e",
  "posterior",
  "detalhe",
];

const VIEW_COLORS: Record<ViewType, string> = {
  frontal: "bg-blue-100 text-blue-700 border-blue-200",
  lateral_d: "bg-violet-100 text-violet-700 border-violet-200",
  lateral_e: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  posterior: "bg-amber-100 text-amber-700 border-amber-200",
  detalhe: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
  remarcado: "Remarcado",
};

const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2400,
  useWebWorker: true,
  preserveExif: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBySession(photos: PatientPhoto[]): PhotoSession[] {
  const map = new Map<string, PatientPhoto[]>();
  for (const p of photos) {
    const key = p.takenAt.split("T")[0];
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, photos]) => ({
      dateKey,
      label: photos[0].sessionLabel,
      photos,
    }));
}

function formatDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "dd 'de' MMMM 'de' yyyy", {
      locale: ptBR,
    });
  } catch {
    return isoDate;
  }
}

function formatDateShort(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return isoDate;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function autoAssignViews(files: File[]): FileEntry[] {
  return files.map((file, i) => ({
    file,
    previewUrl: URL.createObjectURL(file),
    viewType: VIEW_ORDER[i % VIEW_ORDER.length],
  }));
}

function appointmentLabel(appt: AppointmentOption): string {
  const dateStr = formatDateShort(appt.date + "T12:00:00");
  const proc = appt.procedure?.name ?? "Atendimento";
  const status = STATUS_LABELS[appt.status] ?? appt.status;
  return `${dateStr} ${appt.startTime} — ${proc} (${status})`;
}

// ─── CloudinaryImage ──────────────────────────────────────────────────────────

const CloudinaryImage = ({
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

// ─── Before/After Slider ──────────────────────────────────────────────────────

function BeforeAfterSlider({
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
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [onMouseMove, onMouseUp, onTouchMove]);

  const containerWidth = containerRef.current?.clientWidth ?? 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden select-none cursor-ew-resize bg-black"
      style={{ aspectRatio: "3/4", maxHeight: "520px" }}
      onMouseDown={(e) => { isDragging.current = true; updatePosition(e.clientX); }}
      onTouchStart={(e) => { isDragging.current = true; updatePosition(e.touches[0].clientX); }}
    >
      <CloudinaryImage objectPath={afterPath} alt="Depois" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <CloudinaryImage objectPath={beforePath} alt="Antes" className="absolute inset-0 object-cover" style={{ width: containerWidth || "100%", height: "100%" }} draggable={false} />
      </div>
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

// ─── Grid Cell — single photo picker for 2×2 grid ────────────────────────────

function GridCell({
  sessions,
  sessionKey,
  viewType,
  onSessionChange,
  onViewChange,
  label,
  labelColor,
}: {
  sessions: PhotoSession[];
  sessionKey: string;
  viewType: ViewType;
  onSessionChange: (key: string) => void;
  onViewChange: (v: ViewType) => void;
  label: string;
  labelColor: string;
}) {
  const session = sessions.find((s) => s.dateKey === sessionKey);
  const photo = session?.photos.find((p) => p.viewType === viewType);

  const availableViews = session
    ? VIEW_ORDER.filter((v) => session.photos.some((p) => p.viewType === v))
    : VIEW_ORDER;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-center text-xs font-semibold px-2 py-0.5 rounded-md ${labelColor}`}>
        {label}
      </div>
      <Select value={sessionKey} onValueChange={onSessionChange}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Sessão…" />
        </SelectTrigger>
        <SelectContent>
          {sessions.map((s) => (
            <SelectItem key={s.dateKey} value={s.dateKey} className="text-xs">
              {formatDateShort(s.dateKey + "T12:00:00")}
              {s.label ? ` · ${s.label}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={viewType} onValueChange={(v) => onViewChange(v as ViewType)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableViews.map((v) => (
            <SelectItem key={v} value={v} className="text-xs">
              {VIEW_LABELS[v]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: "3/4" }}>
        {photo ? (
          <CloudinaryImage
            objectPath={photo.objectPath}
            alt={VIEW_LABELS[viewType]}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2 p-2">
            <ImageOff className="w-6 h-6" />
            <p className="text-[10px] text-center text-slate-400">
              {!sessionKey ? "Selecione uma sessão" : `Sem foto "${VIEW_LABELS[viewType]}"`}
            </p>
          </div>
        )}
        {photo && (
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/50 backdrop-blur-sm">
            <p className="text-[9px] text-white truncate">{formatDateShort(session!.dateKey + "T12:00:00")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compare Modal (Slider + Grade 2×2) ──────────────────────────────────────

const GRID_LABELS = [
  { label: "A — Antes", color: "bg-slate-100 text-slate-700" },
  { label: "B — Depois", color: "bg-primary/10 text-primary" },
  { label: "C — Antes", color: "bg-slate-100 text-slate-700" },
  { label: "D — Depois", color: "bg-primary/10 text-primary" },
];

function CompareModal({
  open,
  sessions,
  onClose,
}: {
  open: boolean;
  sessions: PhotoSession[];
  onClose: () => void;
}) {
  // Slider state
  const [sliderBeforeKey, setSliderBeforeKey] = useState<string>("");
  const [sliderAfterKey, setSliderAfterKey] = useState<string>("");
  const [sliderView, setSliderView] = useState<ViewType>("frontal");

  // Grid state — 4 independent cells [sessionKey, viewType]
  const [gridCells, setGridCells] = useState<{ sessionKey: string; viewType: ViewType }[]>([
    { sessionKey: "", viewType: "frontal" },
    { sessionKey: "", viewType: "frontal" },
    { sessionKey: "", viewType: "lateral_d" },
    { sessionKey: "", viewType: "lateral_d" },
  ]);

  useEffect(() => {
    if (sessions.length < 2) return;
    const oldest = sessions[sessions.length - 1].dateKey;
    const newest = sessions[0].dateKey;
    setSliderBeforeKey(oldest);
    setSliderAfterKey(newest);
    setGridCells([
      { sessionKey: oldest, viewType: "frontal" },
      { sessionKey: newest, viewType: "frontal" },
      { sessionKey: oldest, viewType: "lateral_d" },
      { sessionKey: newest, viewType: "lateral_d" },
    ]);
  }, [sessions]);

  const sliderBeforeSession = sessions.find((s) => s.dateKey === sliderBeforeKey);
  const sliderAfterSession = sessions.find((s) => s.dateKey === sliderAfterKey);
  const sliderBeforePhoto = sliderBeforeSession?.photos.find((p) => p.viewType === sliderView);
  const sliderAfterPhoto = sliderAfterSession?.photos.find((p) => p.viewType === sliderView);

  const availableSliderViews = (() => {
    if (!sliderBeforeSession || !sliderAfterSession) return VIEW_ORDER;
    const bv = new Set(sliderBeforeSession.photos.map((p) => p.viewType));
    const av = new Set(sliderAfterSession.photos.map((p) => p.viewType));
    return VIEW_ORDER.filter((v) => bv.has(v) && av.has(v));
  })();

  useEffect(() => {
    if (availableSliderViews.length > 0 && !availableSliderViews.includes(sliderView)) {
      setSliderView(availableSliderViews[0]);
    }
  }, [availableSliderViews, sliderView]);

  const updateGridCell = (idx: number, field: "sessionKey" | "viewType", value: string) => {
    setGridCells((prev) =>
      prev.map((cell, i) =>
        i === idx ? { ...cell, [field]: value } : cell
      )
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-primary" /> Comparar Fotos
          </DialogTitle>
          <DialogDescription>
            Compare sessões com o deslizador ou visualize até 4 fotos na grade.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="slider">
          <TabsList className="w-full">
            <TabsTrigger value="slider" className="flex-1 gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Deslizador Antes/Depois
            </TabsTrigger>
            <TabsTrigger value="grid" className="flex-1 gap-2">
              <LayoutGrid className="w-3.5 h-3.5" /> Grade 2×2
            </TabsTrigger>
          </TabsList>

          {/* ── Slider tab ── */}
          <TabsContent value="slider" className="mt-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <Label className="text-xs">Antes</Label>
                <Select value={sliderBeforeKey} onValueChange={setSliderBeforeKey}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione sessão" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.dateKey} value={s.dateKey} disabled={s.dateKey === sliderAfterKey}>
                        {formatDate(s.dateKey + "T12:00:00")}{s.label ? ` · ${s.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Depois</Label>
                <Select value={sliderAfterKey} onValueChange={setSliderAfterKey}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione sessão" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.dateKey} value={s.dateKey} disabled={s.dateKey === sliderBeforeKey}>
                        {formatDate(s.dateKey + "T12:00:00")}{s.label ? ` · ${s.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vista</Label>
                <Select value={sliderView} onValueChange={(v) => setSliderView(v as ViewType)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableSliderViews.map((v) => (
                      <SelectItem key={v} value={v}>{VIEW_LABELS[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sliderBeforePhoto && sliderAfterPhoto ? (
              <BeforeAfterSlider
                beforePath={sliderBeforePhoto.objectPath}
                afterPath={sliderAfterPhoto.objectPath}
                beforeLabel={formatDate(sliderBeforePhoto.takenAt)}
                afterLabel={formatDate(sliderAfterPhoto.takenAt)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-400">
                <ImageOff className="w-10 h-10 mb-3" />
                <p className="text-sm font-medium">
                  {!sliderBeforeKey || !sliderAfterKey
                    ? "Selecione as duas sessões para comparar"
                    : `Nenhuma foto "${VIEW_LABELS[sliderView]}" em uma das sessões`}
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Grid 2×2 tab ── */}
          <TabsContent value="grid" className="mt-4">
            <p className="text-xs text-slate-500 mb-3">
              Cada célula pode exibir qualquer sessão e vista de forma independente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {gridCells.map((cell, idx) => (
                <GridCell
                  key={idx}
                  sessions={sessions}
                  sessionKey={cell.sessionKey}
                  viewType={cell.viewType}
                  onSessionChange={(key) => updateGridCell(idx, "sessionKey", key)}
                  onViewChange={(v) => updateGridCell(idx, "viewType", v)}
                  label={GRID_LABELS[idx].label}
                  labelColor={GRID_LABELS[idx].color}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Appointment Badge ────────────────────────────────────────────────────────

function AppointmentBadge({ appt }: { appt: AppointmentDetails }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
      <Link2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
      <span className="font-medium text-blue-700">
        {appt.procedure?.name ?? "Atendimento"}
      </span>
      <span className="text-slate-400">·</span>
      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
      <span>{formatDateShort(appt.date + "T12:00:00")}</span>
      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
      <span>{appt.startTime}</span>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
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
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [takenAt, setTakenAt] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [sessionLabel, setSessionLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch recent appointments for patient
  const { data: appointments = [] } = useQuery<AppointmentOption[]>({
    queryKey: ["patient-appointments-for-photos", patientId],
    queryFn: async () => {
      const res = await apiFetch(`/api/appointments?patientId=${patientId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data
        .filter((a: any) => !["cancelado", "faltou", "remarcado"].includes(a.status))
        .sort((a: any, b: any) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
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

  const reset = () => {
    setEntries((prev) => {
      prev.forEach((e) => URL.revokeObjectURL(e.previewUrl));
      return [];
    });
    setTakenAt(new Date().toISOString().split("T")[0]);
    setSessionLabel("");
    setNotes("");
    setLinkedAppointmentId("none");
    setProgress({ done: 0, total: 0 });
    setIsDragOver(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const processFiles = useCallback(async (allFiles: File[]) => {
    const valid = allFiles.filter(
      (f) => ALLOWED_PHOTO_TYPES.has(f.type) && f.size <= MAX_PHOTO_SIZE
    );
    const rejected = allFiles.length - valid.length;
    if (rejected > 0) {
      toast({
        title: `${rejected} arquivo(s) ignorado(s)`,
        description: "Use JPG, PNG, WebP ou HEIC com até 15MB por foto.",
        variant: "destructive",
      });
    }
    if (valid.length === 0) return;
    const newEntries = autoAssignViews(valid);
    setEntries((prev) => { prev.forEach((e) => URL.revokeObjectURL(e.previewUrl)); return newEntries; });
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const updateEntryView = (idx: number, viewType: ViewType) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, viewType } : e)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // When appointment selected, auto-fill date
  useEffect(() => {
    if (linkedAppointmentId === "none") return;
    const appt = appointments.find((a) => String(a.id) === linkedAppointmentId);
    if (appt) setTakenAt(appt.date);
  }, [linkedAppointmentId, appointments]);

  // Normalize MIME type: some browsers report "image/jpg" instead of "image/jpeg"
  const normalizeContentType = (type: string): string => (type === "image/jpg" ? "image/jpeg" : type);

  const extractApiError = async (res: Response, fallback: string): Promise<string> => {
    try {
      const data = await res.json();
      return data?.message || data?.error || fallback;
    } catch {
      return `${fallback} (HTTP ${res.status})`;
    }
  };

  const uploadSingle = async (file: File, viewType: ViewType): Promise<void> => {
    let fileToUpload = file;
    if (file.type !== "image/heic" && file.type !== "image/heif") {
      try {
        const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
        const compressedType = normalizeContentType(compressed.type || file.type);
        fileToUpload = new File([compressed], file.name, { type: compressedType });
      } catch { /* use original */ }
    }

    const contentType = normalizeContentType(fileToUpload.type || file.type);

    // Server-side proxy upload to avoid browser→Cloudinary CORS / adblock issues.
    const formData = new FormData();
    formData.append("file", fileToUpload);
    formData.append("folder", "fisiogest/patient-photos");

    const uploadRes = await apiFetch("/api/storage/uploads/proxy", {
      method: "POST",
      body: formData,
    });
    if (!uploadRes.ok) throw new Error(await extractApiError(uploadRes, "Falha no envio do arquivo"));
    const uploadData = await uploadRes.json();
    const objectPath: string = uploadData.secure_url;

    const metaRes = await apiFetch(`/api/patients/${patientId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectPath,
        originalFilename: file.name,
        contentType,
        fileSize: fileToUpload.size,
        viewType,
        takenAt: `${takenAt}T12:00:00.000Z`,
        sessionLabel: sessionLabel || null,
        notes: notes || null,
        appointmentId: linkedAppointmentId !== "none" ? parseInt(linkedAppointmentId) : null,
      }),
    });
    if (!metaRes.ok) throw new Error(await extractApiError(metaRes, "Falha ao salvar metadados"));
  };

  const handleUpload = async () => {
    if (entries.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: entries.length });
    const failures: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      try {
        await uploadSingle(entries[i].file, entries[i].viewType);
        setProgress({ done: i + 1, total: entries.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        console.error(`Falha ao enviar foto "${entries[i].file.name}":`, err);
        failures.push(`${entries[i].file.name}: ${msg}`);
      }
    }
    setUploading(false);
    const errors = failures.length;
    if (errors === 0) {
      toast({ title: `${entries.length} foto(s) enviada(s) com sucesso!` });
      onSuccess();
      handleClose();
    } else {
      toast({
        title: `${entries.length - errors} de ${entries.length} enviadas`,
        description: failures.slice(0, 2).join(" — ") + (failures.length > 2 ? ` (e mais ${failures.length - 2})` : ""),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" /> Adicionar Fotos
          </DialogTitle>
          <DialogDescription>
            Selecione as imagens, ajuste a vista de cada uma e informe a data da sessão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop Zone */}
          <div>
            <Label>Imagens *</Label>
            <div
              className={`mt-1.5 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragOver ? "border-primary bg-primary/10" : "border-slate-200 hover:border-primary/40 hover:bg-primary/5"
              }`}
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            >
              {entries.length === 0 ? (
                <>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {isDragOver ? "Solte as imagens aqui" : "Clique para selecionar ou arraste aqui"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">JPG, PNG, WebP · máx. 15MB · comprimido automaticamente</p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span>{entries.length} foto(s) — clique ou arraste para substituir</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* Per-file view assignment */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Vista de cada foto</Label>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {entries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2 border border-slate-200">
                    <img src={entry.previewUrl} alt="" className="w-14 h-14 object-cover rounded-md border border-slate-200 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 truncate font-medium" title={entry.file.name}>{entry.file.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatBytes(entry.file.size)}</p>
                    </div>
                    <div className="shrink-0 w-36">
                      <Select value={entry.viewType} onValueChange={(v) => updateEntryView(idx, v as ViewType)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VIEW_ORDER.map((v) => (
                            <SelectItem key={v} value={v} className="text-xs">{VIEW_LABELS[v]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <button onClick={() => removeEntry(idx)} className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data da Sessão *</Label>
              <Input type="date" className="mt-1.5" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} max={new Date().toISOString().split("T")[0]} />
            </div>
            <div>
              <Label>Rótulo da Sessão (opcional)</Label>
              <Input className="mt-1.5" placeholder="Ex: Avaliação Inicial, Mês 1…" value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)} maxLength={100} />
            </div>
          </div>

          {/* Appointment link */}
          <div>
            <Label className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-blue-500" />
              Vincular a um atendimento (opcional)
            </Label>
            <Select value={linkedAppointmentId} onValueChange={setLinkedAppointmentId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Sem vínculo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem vínculo com atendimento</SelectItem>
                {appointments.map((appt) => (
                  <SelectItem key={appt.id} value={String(appt.id)}>
                    {appointmentLabel(appt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {appointments.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Nenhum atendimento encontrado para este paciente.</p>
            )}
          </div>

          <div>
            <Label>Observações (opcional)</Label>
            <Textarea className="mt-1.5 resize-none" rows={2} placeholder="Notas clínicas sobre esta sessão…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Enviando foto {progress.done + 1} de {progress.total}…
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose} disabled={uploading}>Cancelar</Button>
            <Button className="flex-1" onClick={handleUpload} disabled={entries.length === 0 || uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Enviar {entries.length > 1 ? `${entries.length} fotos` : "foto"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Photo Lightbox with Zoom + Download + Edit ───────────────────────────────

function PhotoLightbox({
  photo,
  onClose,
  onDelete,
  onUpdated,
  patientId,
}: {
  photo: PatientPhoto;
  onClose: () => void;
  onDelete: () => void;
  onUpdated: (updated: PatientPhoto) => void;
  patientId: number;
}) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Zoom/pan
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Edit
  const [editing, setEditing] = useState(false);
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

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
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

// ─── Main PhotosTab ───────────────────────────────────────────────────────────

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
