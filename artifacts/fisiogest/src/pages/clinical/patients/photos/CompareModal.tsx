import { SlidersHorizontal, LayoutGrid, ImageOff } from "lucide-react";
import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  PhotoSession, 
  ViewType, 
  VIEW_ORDER, 
  VIEW_LABELS, 
  formatDate, 
  formatDateShort 
} from "./types";
import { CloudinaryImage } from "./CloudinaryImage";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

const GRID_LABELS = [
  { label: "A — Antes", color: "bg-slate-100 text-slate-700" },
  { label: "B — Depois", color: "bg-primary/10 text-primary" },
  { label: "C — Antes", color: "bg-slate-100 text-slate-700" },
  { label: "D — Depois", color: "bg-primary/10 text-primary" },
];

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

export function CompareModal({
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
