import { useParams, useLocation } from "wouter";
import { apiFetch } from "@/utils/api";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetPatient,
  useCreateAnamnesis,
  useListEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
  useListEvolutions,
  useCreateEvolution,
  useUpdateEvolution,
  useDeleteEvolution,
  useGetDischarge,
  useSaveDischarge,
  useUpdatePatient,
  useDeletePatient,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Phone, Mail, Calendar, Activity, ClipboardList, TrendingUp,
  FileText, DollarSign, History, Plus, ChevronDown, ChevronUp, User,
  MapPin, Stethoscope, Target, CheckCircle, Clock, XCircle, AlertCircle,
  LogOut, Pencil, Trash2, ShieldAlert, UserCheck, Lock, Paperclip, Upload,
  FileImage, File, Download, ScrollText, Printer, BadgeCheck, CalendarDays,
  ClipboardCheck, PenLine, Package, Layers, RefreshCw, Info,
  Milestone, RotateCcw, Filter,
  Check, ArrowUpRight, Zap, X,
  Wallet, TrendingDown, ArrowDownRight,
  Sparkles, Leaf, Droplets, Sun, Dumbbell, Scale, Ruler, FlaskConical,
  ShieldCheck, Link2, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/utils/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { PhotosTab } from "../../photos-tab";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para _patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "../types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "../utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "../utils/print-html";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

type ExamAttachment = {
  id: number;
  patientId: number;
  examTitle: string | null;
  originalFilename: string | null;
  contentType: string | null;
  fileSize: number | null;
  objectPath: string | null;
  description: string | null;
  resultText: string | null;
  uploadedAt: string;
};

const ACCEPTED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentTypeIcon({ contentType }: { contentType: string | null }) {
  if (!contentType) return <FileText className="w-5 h-5 text-indigo-400" />;
  if (contentType.startsWith("image/")) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (contentType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-slate-400" />;
}

function ExamAttachmentsSection({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addMode, setAddMode] = useState<null | "text" | "file">(null);
  const [uploading, setUploading] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [textForm, setTextForm] = useState({ examTitle: "", resultText: "" });

  const { data: attachments = [], isLoading } = useQuery<ExamAttachment[]>({
    queryKey: [`/api/patients/${patientId}/attachments`],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/${patientId}/attachments`);
      if (!res.ok) throw new Error("Falha ao carregar anexos");
      return res.json();
    },
  });

  const handleSaveText = async () => {
    if (!textForm.resultText.trim()) {
      toast({ title: "Resultado obrigatório", description: "Digite o resultado do exame.", variant: "destructive" });
      return;
    }
    setSavingText(true);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examTitle: textForm.examTitle || null, resultText: textForm.resultText }),
      });
      if (!res.ok) throw new Error("Falha ao salvar resultado");
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Resultado salvo" });
      setTextForm({ examTitle: "", resultText: "" });
      setAddMode(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingText(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast({ title: "Tipo não suportado", description: "Aceitos: PDF, DOCX, JPG, PNG, WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Tamanho máximo: 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setAddMode(null);
    try {
      // Server-side proxy upload (avoids browser→Cloudinary CORS / adblock issues).
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "fisiogest/attachments");

      const uploadRes = await apiFetch("/api/storage/uploads/proxy", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `Falha ao enviar arquivo (HTTP ${uploadRes.status})`);
      }
      const uploadData = await uploadRes.json();
      const objectPath: string = uploadData.secure_url;

      const metaRes = await apiFetch(`/api/patients/${patientId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalFilename: file.name, contentType: file.type, fileSize: file.size, objectPath }),
      });
      if (!metaRes.ok) throw new Error("Falha ao registrar anexo");

      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Arquivo enviado", description: file.name });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (att: ExamAttachment) => {
    if (!att.objectPath || !att.originalFilename) return;
    try {
      const res = await fetch(att.objectPath);
      if (!res.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.originalFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao baixar", description: "Não foi possível baixar o arquivo.", variant: "destructive" });
    }
  };

  const handleDelete = async (att: ExamAttachment) => {
    setDeletingId(att.id);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/attachments/${att.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Registro removido" });
    } catch {
      toast({ title: "Erro ao remover", description: "Não foi possível remover o registro.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Anexos e Exames Complementares</span>
          {attachments.length > 0 && (
            <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant={addMode === "text" ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={uploading}
            onClick={() => setAddMode(addMode === "text" ? null : "text")}
          >
            <FileText className="w-3.5 h-3.5" />
            Digitar resultado
          </Button>
          <Button
            variant={uploading ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={uploading}
            onClick={() => { setAddMode(null); fileInputRef.current?.click(); }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Enviando..." : "Anexar arquivo"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Inline text entry form */}
      {addMode === "text" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Novo resultado de exame</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Nome do exame</Label>
            <Input
              className="h-8 text-sm bg-white border-slate-200"
              placeholder="Ex: Hemograma Completo, Raio-X Coluna..."
              value={textForm.examTitle}
              onChange={e => setTextForm(f => ({ ...f, examTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Resultado <span className="text-red-400">*</span></Label>
            <Textarea
              className="min-h-[100px] text-sm bg-white border-slate-200 resize-none"
              placeholder="Digite o resultado do exame, laudos, observações..."
              value={textForm.resultText}
              onChange={e => setTextForm(f => ({ ...f, resultText: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAddMode(null); setTextForm({ examTitle: "", resultText: "" }); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={savingText} onClick={handleSaveText}>
              {savingText && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Salvar resultado
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && attachments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Paperclip className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum exame registrado</p>
          <p className="text-xs mt-0.5">Digite o resultado ou anexe um arquivo</p>
        </div>
      )}

      {/* List */}
      {!isLoading && attachments.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
          {attachments.map((att) => {
            const isText = !att.objectPath && att.resultText;
            const isExpanded = expandedId === att.id;
            const title = att.examTitle || att.originalFilename || "Sem título";
            return (
              <div key={att.id} className="bg-white hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <AttachmentTypeIcon contentType={att.contentType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{title}</p>
                    <p className="text-xs text-slate-400">
                      {isText
                        ? `Resultado digitado · ${formatDateTime(att.uploadedAt)}`
                        : `${att.fileSize ? formatFileSize(att.fileSize) : ""} · ${formatDateTime(att.uploadedAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {att.resultText && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-indigo-500"
                        title={isExpanded ? "Recolher" : "Ver resultado"}
                        onClick={() => setExpandedId(isExpanded ? null : att.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {att.objectPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-primary"
                        title="Baixar arquivo"
                        onClick={() => handleDownload(att)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      title="Remover"
                      disabled={deletingId === att.id}
                      onClick={() => handleDelete(att)}
                    >
                      {deletingId === att.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                {isExpanded && att.resultText && (
                  <div className="px-11 pb-3">
                    <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {att.resultText}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Anamnesis Tab ──────────────────────────────────────────────────────────────

type AnamTemplate = "reabilitacao" | "esteticaFacial" | "esteticaCorporal";

const TEMPLATE_OPTIONS: { value: AnamTemplate; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
  { value: "reabilitacao", label: "Reabilitação", desc: "Fisioterapia, ortopedia, neurologia e pós-cirúrgico", color: "blue", icon: <Stethoscope className="w-4 h-4" /> },
  { value: "esteticaFacial", label: "Estética Facial", desc: "Pele, tratamentos faciais e procedimentos estéticos", color: "rose", icon: <Sparkles className="w-4 h-4" /> },
  { value: "esteticaCorporal", label: "Estética Corporal", desc: "Modelagem, celulite, gordura localizada e flacidez", color: "violet", icon: <Leaf className="w-4 h-4" /> },
];

function AnamSection({ title, subtitle, icon, colorClass, open, onToggle, children }: {
  title: string; subtitle: string; icon: React.ReactNode; colorClass: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200",
    red: "bg-red-50 hover:bg-red-100 text-red-800 border-red-200",
    emerald: "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200",
    violet: "bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200",
    amber: "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200",
    rose: "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200",
    teal: "bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200",
    orange: "bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-200",
    indigo: "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200",
    pink: "bg-pink-50 hover:bg-pink-100 text-pink-800 border-pink-200",
  };
  const iconBg: Record<string, string> = {
    blue: "bg-blue-100 border-blue-200 text-blue-600",
    red: "bg-red-100 border-red-200 text-red-600",
    emerald: "bg-emerald-100 border-emerald-200 text-emerald-600",
    violet: "bg-violet-100 border-violet-200 text-violet-600",
    amber: "bg-amber-100 border-amber-200 text-amber-600",
    rose: "bg-rose-100 border-rose-200 text-rose-600",
    teal: "bg-teal-100 border-teal-200 text-teal-600",
    orange: "bg-orange-100 border-orange-200 text-orange-600",
    indigo: "bg-indigo-100 border-indigo-200 text-indigo-600",
    pink: "bg-pink-100 border-pink-200 text-pink-600",
  };
  const subtitleColor: Record<string, string> = {
    blue: "text-blue-500", red: "text-red-400", emerald: "text-emerald-500", violet: "text-violet-500",
    amber: "text-amber-500", rose: "text-rose-500", teal: "text-teal-500", orange: "text-orange-500",
    indigo: "text-indigo-500", pink: "text-pink-500",
  };
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors text-left ${colors[colorClass]}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${iconBg[colorClass]}`}>{icon}</div>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className={`text-xs ${subtitleColor[colorClass]}`}>{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>
      {open && <div className="p-4 space-y-4 bg-white">{children}</div>}
    </div>
  );
}

function EVAScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold text-slate-700">Escala de Dor (EVA)</Label>
          <p className="text-xs text-slate-400 mt-0.5">Escala Visual Analógica — 0 (sem dor) a 10 (dor máxima)</p>
        </div>
        <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl text-white shadow-md ${value >= 7 ? "bg-red-500" : value >= 4 ? "bg-orange-400" : "bg-green-500"}`}>{value}</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all ${
              value === v
                ? v >= 7 ? "bg-red-500 border-red-600 text-white" : v >= 4 ? "bg-orange-400 border-orange-500 text-white" : "bg-green-500 border-green-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
            }`}>{v}</button>
        ))}
      </div>
      <p className="text-xs font-medium flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${value >= 7 ? "bg-red-500" : value >= 4 ? "bg-orange-400" : "bg-green-500"}`} />
        <span className={value >= 7 ? "text-red-600" : value >= 4 ? "text-orange-600" : "text-green-600"}>
          {value === 0 ? "Sem dor" : value <= 3 ? "Dor leve" : value <= 6 ? "Dor moderada" : value <= 9 ? "Dor intensa" : "Dor insuportável"}
        </span>
      </p>
    </div>
  );
}

function CheckTag({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active ? "bg-primary text-white border-primary shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
      }`}>
      {active && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

function toggleInList(list: string, item: string): string {
  const arr = list ? list.split(",").map(s => s.trim()).filter(Boolean) : [];
  const idx = arr.indexOf(item);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(item);
  return arr.join(", ");
}

function hasInList(list: string, item: string): boolean {
  return list ? list.split(",").map(s => s.trim()).includes(item) : false;
}

// ─── Indicators Panel ────────────────────────────────────────────────────────

type BodyMeasurementPoint = {
  id: number; date: string;
  weight: number | null; height: number | null;
  waist: number | null; abdomen: number | null; hips: number | null;
  thighRight: number | null; thighLeft: number | null;
  armRight: number | null; armLeft: number | null;
  calfRight: number | null; calfLeft: number | null;
  bodyFat: number | null; celluliteGrade: string | null; notes: string | null;
};

type IndicatorsResponse = {
  eva: { date: string; value: number; source: string; label: string }[];
  body: { weight?: string | null; height?: string | null; updatedAt: string } | null;
  reab: { cid10?: string | null; painLocation?: string | null; updatedAt: string } | null;
  bodyMeasurements: BodyMeasurementPoint[];
};

const emptyMeasForm = {
  measuredAt: format(new Date(), "yyyy-MM-dd"),
  weight: "", height: "",
  waist: "", abdomen: "", hips: "",
  thighRight: "", thighLeft: "",
  armRight: "", armLeft: "",
  calfRight: "", calfLeft: "",
  bodyFat: "", celluliteGrade: "", notes: "",
};

function MeasField({ label, value, unit = "cm", onChange }: { label: string; value: string; unit?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-500">{label} <span className="text-slate-400">({unit})</span></Label>
      <Input type="number" step="0.1" placeholder="—" value={value}
        onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

export function IndicatorsPanel({ patientId }: { patientId: number }) {
  const token = localStorage.getItem("fisiogest_token");
  const indicatorHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const [showAdd, setShowAdd] = useState(false);
  const [measForm, setMeasForm] = useState({ ...emptyMeasForm });
  const [savingMeas, setSavingMeas] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: indicators, isLoading } = useQuery<IndicatorsResponse>({
    queryKey: [`/api/patients/${patientId}/indicators`],
    queryFn: () =>
      fetch(`/api/patients/${patientId}/indicators`, { headers: indicatorHeaders })
        .then(r => r.ok ? r.json() : { eva: [], body: null, reab: null, bodyMeasurements: [] }),
    enabled: !!patientId,
  });

  if (isLoading) return null;
  if (!indicators) return null;

  const eva = indicators.eva ?? [];
  const bm = indicators.bodyMeasurements ?? [];
  const evaColor = (v: number) => v >= 7 ? "#dc2626" : v >= 4 ? "#f97316" : "#16a34a";

  const latestEva = eva[eva.length - 1];
  const firstEva = eva[0];
  const evaTrend = latestEva && firstEva && eva.length > 1 ? latestEva.value - firstEva.value : null;

  const evaChartData = eva.map(p => ({
    value: p.value,
    date: format(new Date(p.date), "dd/MM/yy", { locale: ptBR }),
  }));

  const firstBm = bm[0];
  const latestBm = bm[bm.length - 1];

  const bmiCalc = (w: number | null, h: number | null) => {
    if (!w || !h || h <= 0) return null;
    const v = w / ((h / 100) ** 2);
    return { val: v.toFixed(1), cat: v < 18.5 ? "Abaixo do peso" : v < 25 ? "Normal" : v < 30 ? "Sobrepeso" : "Obesidade" };
  };
  const currentBmi = latestBm ? bmiCalc(latestBm.weight, latestBm.height) : null;
  const weightDelta = firstBm?.weight && latestBm?.weight && firstBm.id !== latestBm.id
    ? (latestBm.weight - firstBm.weight) : null;

  const bmChartData = bm.map(m => ({
    date: format(new Date(m.date), "dd/MM/yy", { locale: ptBR }),
    peso: m.weight,
    cintura: m.waist,
    abdomen: m.abdomen,
    quadril: m.hips,
    coxaD: m.thighRight,
  }));

  const perimCards = [
    { label: "Cintura", first: firstBm?.waist, last: latestBm?.waist },
    { label: "Abdômen", first: firstBm?.abdomen, last: latestBm?.abdomen },
    { label: "Quadril", first: firstBm?.hips, last: latestBm?.hips },
    { label: "Coxa D", first: firstBm?.thighRight, last: latestBm?.thighRight },
    { label: "Coxa E", first: firstBm?.thighLeft, last: latestBm?.thighLeft },
    { label: "Braço D", first: firstBm?.armRight, last: latestBm?.armRight },
    { label: "Braço E", first: firstBm?.armLeft, last: latestBm?.armLeft },
  ].filter(c => c.first != null || c.last != null);

  const mf = (field: keyof typeof emptyMeasForm) => measForm[field];
  const sf = (field: keyof typeof emptyMeasForm) => (v: string) => setMeasForm(f => ({ ...f, [field]: v }));

  const handleSaveMeasurement = async () => {
    setSavingMeas(true);
    try {
      const body: Record<string, any> = { measuredAt: measForm.measuredAt };
      const numFields = ["weight","height","waist","abdomen","hips","thighRight","thighLeft","armRight","armLeft","calfRight","calfLeft","bodyFat"] as const;
      for (const f of numFields) {
        if (measForm[f] !== "") body[f] = parseFloat(measForm[f]);
      }
      if (measForm.celluliteGrade) body.celluliteGrade = measForm.celluliteGrade;
      if (measForm.notes) body.notes = measForm.notes;
      const res = await fetch(`/api/patients/${patientId}/body-measurements`, {
        method: "POST",
        headers: { ...(indicatorHeaders as Record<string, string>), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Medição registrada!", description: "Dados corporais salvos com sucesso." });
      setShowAdd(false);
      setMeasForm({ ...emptyMeasForm, measuredAt: format(new Date(), "yyyy-MM-dd") });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/indicators`] });
    } catch {
      toast({ title: "Erro ao salvar medição", variant: "destructive" });
    } finally {
      setSavingMeas(false);
    }
  };

  const hasAnyData = eva.length > 0 || bm.length > 0;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Indicadores de Acompanhamento</p>
              <p className="text-[11px] text-slate-400">
                {[eva.length > 0 && `${eva.length} registro(s) EVA`, bm.length > 0 && `${bm.length} medição(ões) corporais`].filter(Boolean).join(" · ") || "Nenhum registro ainda"}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar Medição
          </Button>
        </div>

        {!hasAnyData && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Clique em "Adicionar Medição" para iniciar o acompanhamento evolutivo do paciente.
          </div>
        )}

        {/* EVA Section */}
        {eva.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dor — Escala EVA</p>
              <div className="flex items-center gap-2">
                {latestEva && (
                  <span className="text-lg font-bold" style={{ color: evaColor(latestEva.value) }}>{latestEva.value}/10</span>
                )}
                {evaTrend !== null && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    evaTrend < 0 ? "bg-green-50 text-green-700" : evaTrend > 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
                  }`}>
                    {evaTrend < 0 ? <TrendingDown className="w-3 h-3" /> : evaTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                    {evaTrend < 0 ? `${Math.abs(evaTrend)}pts melhora` : evaTrend > 0 ? `${evaTrend}pts piora` : "Estável"}
                  </div>
                )}
              </div>
            </div>
            {eva.length >= 2 ? (
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evaChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <ReferenceLine y={7} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.35} />
                    <ReferenceLine y={4} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.35} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v: number) => [`${v}/10`, "EVA"]} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2}
                      dot={(props: any) => <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill={evaColor(props.payload.value)} stroke="#fff" strokeWidth={1.5} />}
                      activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Registre mais sessões com EVA para ver o gráfico de evolução da dor.</p>
            )}
          </div>
        )}

        {/* Peso & Composição */}
        {bm.length > 0 && (
          <>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Peso & Composição Corporal</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {latestBm.weight && (
                    <span className="text-base font-bold text-slate-800">{latestBm.weight} kg</span>
                  )}
                  {weightDelta !== null && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      weightDelta < 0 ? "bg-green-50 text-green-700" : weightDelta > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                    }`}>
                      {weightDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)} kg
                    </div>
                  )}
                  {currentBmi && (
                    <span className="text-[11px] text-slate-500">IMC {currentBmi.val} <span className="text-slate-400">({currentBmi.cat})</span></span>
                  )}
                </div>
              </div>
              {bm.length >= 2 && (
                <div className="h-[100px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bmChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(v: number) => [`${v} kg`, "Peso"]} />
                      <Line type="monotone" dataKey="peso" stroke="#8b5cf6" strokeWidth={2}
                        dot={{ fill: "#8b5cf6", r: 3 }} activeDot={{ r: 5 }} name="Peso" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {latestBm.bodyFat && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">% Gordura:</span>
                  <span className="font-semibold text-slate-700">{latestBm.bodyFat}%</span>
                  {firstBm?.bodyFat && firstBm.id !== latestBm.id && (
                    <span className={`font-medium text-[11px] ${latestBm.bodyFat < firstBm.bodyFat ? "text-green-600" : "text-amber-600"}`}>
                      ({latestBm.bodyFat > firstBm.bodyFat ? "+" : ""}{(latestBm.bodyFat - firstBm.bodyFat).toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Perimetria */}
            {perimCards.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Perimetria Corporal</p>
                <div className="flex flex-wrap gap-2">
                  {perimCards.map(c => {
                    const delta = c.first != null && c.last != null && c.first !== c.last
                      ? c.last - c.first : null;
                    return (
                      <div key={c.label} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <span className="text-[11px] text-slate-500">{c.label}:</span>
                        <span className="text-xs font-bold text-slate-800">{c.last ?? c.first} cm</span>
                        {delta !== null && (
                          <span className={`text-[10px] font-semibold ${delta < 0 ? "text-green-600" : "text-amber-600"}`}>
                            ({delta > 0 ? "+" : ""}{delta.toFixed(1)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {bm.length >= 2 && bmChartData.some(d => d.cintura || d.abdomen || d.quadril) && (
                  <div className="h-[110px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bmChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                          formatter={(v: number, name: string) => [`${v} cm`, name]} />
                        {bmChartData.some(d => d.cintura) && (
                          <Line type="monotone" dataKey="cintura" stroke="#ec4899" strokeWidth={2} dot={{ fill: "#ec4899", r: 3 }} name="Cintura" />
                        )}
                        {bmChartData.some(d => d.abdomen) && (
                          <Line type="monotone" dataKey="abdomen" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} name="Abdômen" />
                        )}
                        {bmChartData.some(d => d.quadril) && (
                          <Line type="monotone" dataKey="quadril" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7", r: 3 }} name="Quadril" />
                        )}
                        {bmChartData.some(d => d.coxaD) && (
                          <Line type="monotone" dataKey="coxaD" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 2" dot={{ fill: "#14b8a6", r: 2.5 }} name="Coxa D" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {latestBm.celluliteGrade && (
                  <div className="text-xs flex items-center gap-1.5">
                    <span className="text-slate-500">Grau de celulite:</span>
                    <Badge variant="secondary" className="text-[11px] h-5">Grau {latestBm.celluliteGrade}</Badge>
                    {firstBm?.celluliteGrade && firstBm.id !== latestBm.id && firstBm.celluliteGrade !== latestBm.celluliteGrade && (
                      <span className="text-slate-400">(era Grau {firstBm.celluliteGrade})</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Measurement Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Medição Corporal</DialogTitle>
            <DialogDescription>Registre as medidas do paciente para acompanhar a evolução ao longo do tratamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Data da medição</Label>
              <Input type="date" value={measForm.measuredAt}
                onChange={e => setMeasForm(f => ({ ...f, measuredAt: e.target.value }))} className="h-8 text-sm" />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Biometria</p>
              <div className="grid grid-cols-2 gap-3">
                <MeasField label="Peso" value={mf("weight")} unit="kg" onChange={sf("weight")} />
                <MeasField label="Altura" value={mf("height")} unit="cm" onChange={sf("height")} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Perimetria (cm)</p>
              <div className="grid grid-cols-3 gap-2">
                <MeasField label="Cintura" value={mf("waist")} onChange={sf("waist")} />
                <MeasField label="Abdômen" value={mf("abdomen")} onChange={sf("abdomen")} />
                <MeasField label="Quadril" value={mf("hips")} onChange={sf("hips")} />
                <MeasField label="Coxa D" value={mf("thighRight")} onChange={sf("thighRight")} />
                <MeasField label="Coxa E" value={mf("thighLeft")} onChange={sf("thighLeft")} />
                <MeasField label="Braço D" value={mf("armRight")} onChange={sf("armRight")} />
                <MeasField label="Braço E" value={mf("armLeft")} onChange={sf("armLeft")} />
                <MeasField label="Pant. D" value={mf("calfRight")} onChange={sf("calfRight")} />
                <MeasField label="Pant. E" value={mf("calfLeft")} onChange={sf("calfLeft")} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Composição & Qualidade</p>
              <div className="grid grid-cols-2 gap-3">
                <MeasField label="% Gordura Corporal" value={mf("bodyFat")} unit="%" onChange={sf("bodyFat")} />
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Grau de Celulite</Label>
                  <Select value={measForm.celluliteGrade} onValueChange={v => setMeasForm(f => ({ ...f, celluliteGrade: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I">Grau I — Leve</SelectItem>
                      <SelectItem value="II">Grau II — Moderada</SelectItem>
                      <SelectItem value="III">Grau III — Intensa</SelectItem>
                      <SelectItem value="IV">Grau IV — Muito intensa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Observações clínicas</Label>
              <Textarea rows={2} placeholder="Notas adicionais..." value={measForm.notes}
                onChange={e => setMeasForm(f => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveMeasurement} disabled={savingMeas}>
                {savingMeas && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Salvar Medição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Anamnesis Tab ───────────────────────────────────────────────────────────

export function AnamnesisTab({ patientId }: { patientId: number }) {
  const token = localStorage.getItem("fisiogest_token");
  const authHeader: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: allAnamnesis = [], isLoading, refetch: refetchAll } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/anamnesis`, "all"],
    queryFn: () =>
      fetch(`/api/patients/${patientId}/anamnesis?all=true`, { headers: authHeader })
        .then(r => r.ok ? r.json() : []),
    enabled: !!patientId,
  });

  const mutation = useCreateAnamnesis();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [template, setTemplate] = useState<AnamTemplate>("reabilitacao");

  const filledTypes = new Set<string>(allAnamnesis.map((a: any) => a.templateType));

  const emptyForm = {
    // shared
    mainComplaint: "", diseaseHistory: "", medicalHistory: "",
    medications: "", allergies: "", familyHistory: "", lifestyle: "", painScale: 0,
    occupation: "", laterality: "", cid10: "", painLocation: "",
    painAggravatingFactors: "", painRelievingFactors: "",
    functionalImpact: "", patientGoals: "", previousTreatments: "", tobaccoAlcohol: "",
    // facial
    phototype: "", skinType: "", skinConditions: "", sunExposure: "", sunProtector: "",
    currentSkincareRoutine: "", previousAestheticTreatments: "", aestheticReactions: "",
    facialSurgeries: "", sensitizingMedications: "", skinContraindications: "", aestheticGoalDetails: "",
    // corporal
    mainBodyConcern: "", bodyConcernRegions: "", celluliteGrade: "", bodyWeight: "",
    bodyHeight: "", bodyMeasurements: "", physicalActivityLevel: "", physicalActivityType: "",
    waterIntake: "", dietHabits: "", bodyMedicalConditions: "", bodyContraindications: "", previousBodyTreatments: "",
  };

  const [form, setForm] = useState(emptyForm);
  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const sv = (k: keyof typeof emptyForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const populateFormFromRecord = (d: any) => {
    setForm({
      mainComplaint: d.mainComplaint || "", diseaseHistory: d.diseaseHistory || "",
      medicalHistory: d.medicalHistory || "", medications: d.medications || "",
      allergies: d.allergies || "", familyHistory: d.familyHistory || "",
      lifestyle: d.lifestyle || "", painScale: d.painScale ?? 0,
      occupation: d.occupation || "", laterality: d.laterality || "",
      cid10: d.cid10 || "", painLocation: d.painLocation || "",
      painAggravatingFactors: d.painAggravatingFactors || "",
      painRelievingFactors: d.painRelievingFactors || "",
      functionalImpact: d.functionalImpact || "",
      patientGoals: d.patientGoals || "",
      previousTreatments: d.previousTreatments || "",
      tobaccoAlcohol: d.tobaccoAlcohol || "",
      phototype: d.phototype || "", skinType: d.skinType || "",
      skinConditions: d.skinConditions || "", sunExposure: d.sunExposure || "",
      sunProtector: d.sunProtector || "", currentSkincareRoutine: d.currentSkincareRoutine || "",
      previousAestheticTreatments: d.previousAestheticTreatments || "",
      aestheticReactions: d.aestheticReactions || "", facialSurgeries: d.facialSurgeries || "",
      sensitizingMedications: d.sensitizingMedications || "",
      skinContraindications: d.skinContraindications || "",
      aestheticGoalDetails: d.aestheticGoalDetails || "",
      mainBodyConcern: d.mainBodyConcern || "", bodyConcernRegions: d.bodyConcernRegions || "",
      celluliteGrade: d.celluliteGrade || "", bodyWeight: d.bodyWeight || "",
      bodyHeight: d.bodyHeight || "", bodyMeasurements: d.bodyMeasurements || "",
      physicalActivityLevel: d.physicalActivityLevel || "", physicalActivityType: d.physicalActivityType || "",
      waterIntake: d.waterIntake || "", dietHabits: d.dietHabits || "",
      bodyMedicalConditions: d.bodyMedicalConditions || "",
      bodyContraindications: d.bodyContraindications || "",
      previousBodyTreatments: d.previousBodyTreatments || "",
    });
  };

  useEffect(() => {
    const match = allAnamnesis.find((a: any) => a.templateType === template);
    if (match) {
      populateFormFromRecord(match);
    } else {
      setForm(emptyForm);
    }
  }, [template, allAnamnesis]);

  const currentAnamnesis = allAnamnesis.find((a: any) => a.templateType === template);

  const [sections, setSections] = useState<Record<string, boolean>>({
    s1: true, s2: true, s3: true, s4: true, s5: true,
  });
  const toggle = (k: string) => setSections(p => ({ ...p, [k]: !p[k] }));

  const handleSave = () => {
    mutation.mutate({ patientId, data: { ...form, templateType: template } as any }, {
      onSuccess: () => {
        toast({ title: "Salvo com sucesso", description: "Anamnese atualizada." });
        refetchAll();
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/anamnesis`] });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/indicators`] });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl">Ficha de Anamnese</CardTitle>
            <CardDescription>
              Uma ficha independente por tipo de atendimento
              {filledTypes.size > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <CheckCircle className="w-3 h-3" />
                  {filledTypes.size} tipo(s) preenchido(s)
                </span>
              )}
            </CardDescription>
          </div>
          {currentAnamnesis?.updatedAt && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 shrink-0">
              <Clock className="w-3 h-3" />
              Atualizado em {formatDateTime(currentAnamnesis.updatedAt)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-5">

        {/* ── Template Selector ── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Tipo de Atendimento</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATE_OPTIONS.map(opt => {
              const isActive = template === opt.value;
              const isFilled = filledTypes.has(opt.value);
              const activeStyles: Record<AnamTemplate, string> = {
                reabilitacao: "border-blue-500 bg-blue-50 text-blue-800 shadow-sm",
                esteticaFacial: "border-rose-500 bg-rose-50 text-rose-800 shadow-sm",
                esteticaCorporal: "border-violet-500 bg-violet-50 text-violet-800 shadow-sm",
              };
              const iconStyles: Record<AnamTemplate, string> = {
                reabilitacao: "bg-blue-100 text-blue-600",
                esteticaFacial: "bg-rose-100 text-rose-600",
                esteticaCorporal: "bg-violet-100 text-violet-600",
              };
              return (
                <button key={opt.value} type="button" onClick={() => setTemplate(opt.value)}
                  className={`relative flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    isActive ? activeStyles[opt.value] : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                  }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? iconStyles[opt.value] : "bg-slate-100 text-slate-500"
                  }`}>{opt.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold leading-tight">{opt.label}</p>
                      {isFilled && !isActive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                          <Check className="w-2.5 h-2.5" />preenchida
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>
                  </div>
                  {isActive && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-current opacity-60" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            TEMPLATE: REABILITAÇÃO
        ════════════════════════════════════════════════════════ */}
        {template === "reabilitacao" && (<>

          <AnamSection title="Queixa Principal e História" subtitle="QP, HDA, ocupação e lateralidade" icon={<ClipboardList className="w-4 h-4" />} colorClass="blue" open={sections.s1} onToggle={() => toggle("s1")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Professor, Atleta, Operário..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Lateralidade</Label>
                <Select value={form.laterality} onValueChange={sv("laterality")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="destro">Destro (direita)</SelectItem>
                    <SelectItem value="canhoto">Canhoto (esquerda)</SelectItem>
                    <SelectItem value="ambidestro">Ambidestro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Queixa Principal (QP) <span className="text-red-400">*</span></Label>
              <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="Relato do paciente sobre o motivo da consulta, em suas próprias palavras..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">História da Doença Atual (HDA)</Label>
              <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Evolução dos sintomas, quando iniciou, como iniciou, o que fez até agora..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">CID-10 (Diagnóstico Médico)</Label>
              <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.cid10} onChange={f("cid10")} placeholder="Ex: M54.5 – Lombalgia, M75.1 – Síndrome do Manguito Rotador..." />
            </div>
          </AnamSection>

          <AnamSection title="Dor e Sintomas" subtitle="Localização, fatores agravantes, aliviantes e impacto funcional" icon={<Activity className="w-4 h-4" />} colorClass="red" open={sections.s2} onToggle={() => toggle("s2")}>
            <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5">
              <Activity className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                <span className="font-semibold">Escala EVA (dor):</span> o registro da Escala Visual Analógica é feito na aba <span className="font-semibold">Avaliações</span> — tanto na avaliação inicial quanto ao longo do tratamento — para garantir o acompanhamento evolutivo sem duplicidade.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Localização e Irradiação da Dor</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painLocation} onChange={f("painLocation")} placeholder="Ex: Dor lombar com irradiação para MID, formigamento em L5-S1..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Fatores que Agravam</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painAggravatingFactors} onChange={f("painAggravatingFactors")} placeholder="Ex: Ficar sentado por muito tempo, caminhar, subir escadas..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Fatores que Aliviam</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.painRelievingFactors} onChange={f("painRelievingFactors")} placeholder="Ex: Repouso, compressa quente, analgésico, deitar..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Impacto Funcional (AVDs afetadas)</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.functionalImpact} onChange={f("functionalImpact")} placeholder="Ex: Dificuldade para se vestir, limitação para dirigir, não consegue trabalhar..." />
            </div>
          </AnamSection>

          <AnamSection title="Histórico Médico" subtitle="HMP, medicamentos, alergias, tratamentos anteriores" icon={<FileText className="w-4 h-4" />} colorClass="emerald" open={sections.s3} onToggle={() => toggle("s3")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Histórico Médico (HMP)</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medicalHistory} onChange={f("medicalHistory")} placeholder="Cirurgias, internações, doenças crônicas, comorbidades..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Tratamentos Anteriores</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousTreatments} onChange={f("previousTreatments")} placeholder="Ex: Fisioterapia anterior, cirurgias, uso de órteses, infiltrações..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
                <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Nome comercial, dosagem e frequência..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
                <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Alergias a medicamentos, látex, materiais..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Histórico Familiar</Label>
                <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.familyHistory} onChange={f("familyHistory")} placeholder="Doenças hereditárias relevantes na família..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Tabagismo / Etilismo / Outros</Label>
                <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.tobaccoAlcohol} onChange={f("tobaccoAlcohol")} placeholder="Fuma? Bebe? Usa outras substâncias? Frequência..." />
              </div>
            </div>
          </AnamSection>

          <AnamSection title="Hábitos e Estilo de Vida" subtitle="Atividade física, sono, alimentação, rotina" icon={<UserCheck className="w-4 h-4" />} colorClass="violet" open={sections.s4} onToggle={() => toggle("s4")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Estilo de Vida</Label>
              <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.lifestyle} onChange={f("lifestyle")} placeholder="Atividade física (tipo e frequência), qualidade do sono, alimentação, postura no trabalho, nível de estresse..." />
            </div>
          </AnamSection>

          <AnamSection title="Objetivos e Expectativas" subtitle="O que o paciente espera do tratamento" icon={<Target className="w-4 h-4" />} colorClass="amber" open={sections.s5} onToggle={() => toggle("s5")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Objetivos e Expectativas do Paciente</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="O que o paciente espera alcançar com o tratamento? Metas de curto e longo prazo..." />
            </div>
          </AnamSection>

        </>)}

        {/* ════════════════════════════════════════════════════════
            TEMPLATE: ESTÉTICA FACIAL
        ════════════════════════════════════════════════════════ */}
        {template === "esteticaFacial" && (<>

          <AnamSection title="Queixa Principal e Histórico" subtitle="Motivo da consulta e histórico do problema" icon={<ClipboardList className="w-4 h-4" />} colorClass="rose" open={sections.s1} onToggle={() => toggle("s1")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Professora, Executiva, Esteticista..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">CID-10 (se aplicável)</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.cid10} onChange={f("cid10")} placeholder="Ex: L70 – Acne, L81 – Hiperpigmentação..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Queixa Principal <span className="text-red-400">*</span></Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="O que mais incomoda na face? Acne, manchas, rugas, flacidez, poros dilatados..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Histórico do Problema</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Quando começou? Houve piora recente? Fatores que desencadearam (estresse, mudança hormonal, sol)..." />
            </div>
          </AnamSection>

          <AnamSection title="Análise de Pele" subtitle="Tipo de pele, fototipo (Fitzpatrick), condições e exposição solar" icon={<Sun className="w-4 h-4" />} colorClass="amber" open={sections.s2} onToggle={() => toggle("s2")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Tipo de Pele</Label>
                <Select value={form.skinType} onValueChange={sv("skinType")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="seca">Seca</SelectItem>
                    <SelectItem value="oleosa">Oleosa</SelectItem>
                    <SelectItem value="mista">Mista</SelectItem>
                    <SelectItem value="sensivel">Sensível</SelectItem>
                    <SelectItem value="acneica">Acneica</SelectItem>
                    <SelectItem value="desidratada">Desidratada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Fototipo (Fitzpatrick)</Label>
                <Select value={form.phototype} onValueChange={sv("phototype")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I – Sempre queima, nunca bronzeia (pele muito clara)</SelectItem>
                    <SelectItem value="II">II – Sempre queima, bronzeia minimamente</SelectItem>
                    <SelectItem value="III">III – Queima moderado, bronzeia gradualmente</SelectItem>
                    <SelectItem value="IV">IV – Queima minimamente, bronzeia com facilidade</SelectItem>
                    <SelectItem value="V">V – Raramente queima, bronzeia muito (pele morena)</SelectItem>
                    <SelectItem value="VI">VI – Nunca queima, pele muito escura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Condições de Pele (marque todas que se aplicam)</Label>
              <div className="flex flex-wrap gap-2">
                {["Acne", "Rosácea", "Melasma", "Manchas solares", "Envelhecimento precoce", "Flacidez", "Rugas finas", "Rugas profundas", "Poros dilatados", "Oleosidade excessiva", "Ressecamento", "Sensibilidade", "Telangectasias", "Cicatrizes", "Olheiras", "Estrias faciais", "Xantomas", "Ceratose pilar"].map(cond => (
                  <CheckTag key={cond} label={cond} active={hasInList(form.skinConditions, cond)} onClick={() => setForm(p => ({ ...p, skinConditions: toggleInList(p.skinConditions, cond) }))} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Exposição Solar</Label>
                <Select value={form.sunExposure} onValueChange={sv("sunExposure")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta (trabalha ao ar livre, praia frequente)</SelectItem>
                    <SelectItem value="moderada">Moderada (exposição ocasional)</SelectItem>
                    <SelectItem value="baixa">Baixa (trabalha em ambiente fechado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Uso de Protetor Solar</Label>
                <Select value={form.sunProtector} onValueChange={sv("sunProtector")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diario">Diário (FPS 30+)</SelectItem>
                    <SelectItem value="as-vezes">Às vezes</SelectItem>
                    <SelectItem value="nao-usa">Não usa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Rotina de Skincare Atual</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.currentSkincareRoutine} onChange={f("currentSkincareRoutine")} placeholder="Produtos usados: limpeza, hidratante, sérum, vitamina C, retinol, ácidos, etc..." />
            </div>
          </AnamSection>

          <AnamSection title="Histórico de Tratamentos Estéticos" subtitle="Procedimentos anteriores, reações e cirurgias" icon={<FlaskConical className="w-4 h-4" />} colorClass="pink" open={sections.s3} onToggle={() => toggle("s3")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Tratamentos Estéticos Anteriores</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousAestheticTreatments} onChange={f("previousAestheticTreatments")} placeholder="Ex: Peeling químico, laser CO₂, luz intensa pulsada (IPL), microagulhamento, toxina botulínica, preenchimento com ácido hialurônico, HIFU..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Reações ou Complicações Anteriores</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.aestheticReactions} onChange={f("aestheticReactions")} placeholder="Queimaduras, hiperpigmentação pós-inflamatória, alergias a cosméticos, infecções..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Cirurgias Faciais</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.facialSurgeries} onChange={f("facialSurgeries")} placeholder="Ritidoplastia (lifting), blefaroplastia, rinoplastia, otoplastia, lipoaspiração facial..." />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Medicamentos Fotossensibilizantes ou Interfirentes</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.sensitizingMedications} onChange={f("sensitizingMedications")} placeholder="Isotretinoína, retinoides tópicos, anticoagulantes, corticoides, anticonvulsivantes, metformina, antibióticos..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Cosméticos, anestésicos tópicos (lidocaína), metais (níquel), fragrâncias, látex..." />
              </div>
            </div>
          </AnamSection>

          <AnamSection title="Triagem de Contraindicações" subtitle="Gestação, implantes, doenças de pele ativas e outros" icon={<ShieldCheck className="w-4 h-4" />} colorClass="teal" open={sections.s4} onToggle={() => toggle("s4")}>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-1">
              <p className="text-xs text-amber-700 font-medium">Marque todas as condições que o paciente apresenta ou apresentou nos últimos 6 meses.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Condições e Contraindicações</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Gestante", "Lactante", "Marca-passo", "Implantes metálicos na face/pescoço",
                  "Herpes ativo", "Psoríase ativa", "Dermatite ativa", "Rosácea grau III/IV",
                  "Distúrbio de coagulação", "Uso de anticoagulante", "Isotretinoína (últimos 6m)",
                  "Diabetes descompensada", "Lúpus", "Doença autoimune", "Queloides",
                  "Implante de silicone facial", "Fios de sustentação", "Radiofrequência contraindicada",
                ].map(cond => (
                  <CheckTag key={cond} label={cond} active={hasInList(form.skinContraindications, cond)} onClick={() => setForm(p => ({ ...p, skinContraindications: toggleInList(p.skinContraindications, cond) }))} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Outras condições clínicas relevantes</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medicalHistory} onChange={f("medicalHistory")} placeholder="Doenças crônicas, uso de medicamentos contínuos, condições dermatológicas específicas..." />
            </div>
          </AnamSection>

          <AnamSection title="Objetivos e Expectativas" subtitle="O que deseja melhorar e expectativas com o tratamento" icon={<Target className="w-4 h-4" />} colorClass="indigo" open={sections.s5} onToggle={() => toggle("s5")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">O que deseja melhorar na pele?</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.aestheticGoalDetails} onChange={f("aestheticGoalDetails")} placeholder="Descreva as principais queixas e o que espera após o tratamento (manchas, textura, firmeza, luminosidade)..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Expectativas e Disponibilidade para Manutenção</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="Prazo esperado para resultados, disponibilidade para sessões regulares, orçamento..." />
            </div>
          </AnamSection>

        </>)}

        {/* ════════════════════════════════════════════════════════
            TEMPLATE: ESTÉTICA CORPORAL
        ════════════════════════════════════════════════════════ */}
        {template === "esteticaCorporal" && (<>

          <AnamSection title="Queixa Principal e Dados Gerais" subtitle="Motivo da consulta, ocupação e histórico do problema" icon={<ClipboardList className="w-4 h-4" />} colorClass="violet" open={sections.s1} onToggle={() => toggle("s1")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Queixa Principal <span className="text-red-400">*</span></Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.mainComplaint} onChange={f("mainComplaint")} placeholder="O que mais incomoda? Celulite, gordura localizada, flacidez, estrias, retenção hídrica..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Profissão / Ocupação</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.occupation} onChange={f("occupation")} placeholder="Ex: Professora, Motorista, Analista..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Histórico do Problema</Label>
                <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.diseaseHistory} onChange={f("diseaseHistory")} placeholder="Quando começou? Houve ganho/perda de peso recente? Gestação?" />
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5">
              <Ruler className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                <span className="font-semibold">Peso, altura, perimetria e IMC</span> são registrados e monitorados na aba <span className="font-semibold">Avaliações</span> (indicadores de resultado), permitindo acompanhar a evolução ao longo do tratamento.
              </p>
            </div>
          </AnamSection>

          <AnamSection title="Análise Corporal" subtitle="Regiões de preocupação e alterações visíveis" icon={<Ruler className="w-4 h-4" />} colorClass="indigo" open={sections.s2} onToggle={() => toggle("s2")}>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Principais Queixas (marque todas que se aplicam)</Label>
              <div className="flex flex-wrap gap-2">
                {["Celulite", "Gordura localizada", "Flacidez", "Estrias", "Retenção hídrica", "Linfedema", "Lipedema", "Fibroedema gelóide", "Gordura visceral", "Ptose abdominal", "Cicatrizes corporais"].map(c => (
                  <CheckTag key={c} label={c} active={hasInList(form.mainBodyConcern, c)} onClick={() => setForm(p => ({ ...p, mainBodyConcern: toggleInList(p.mainBodyConcern, c) }))} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Regiões de Interesse (marque todas que se aplicam)</Label>
              <div className="flex flex-wrap gap-2">
                {["Abdome", "Flancos", "Dorso", "Glúteos", "Coxas (anterior)", "Coxas (posterior)", "Coxas (medial)", "Panturrilhas", "Braços", "Axila (gordura)", "Papada", "Pescoço"].map(r => (
                  <CheckTag key={r} label={r} active={hasInList(form.bodyConcernRegions, r)} onClick={() => setForm(p => ({ ...p, bodyConcernRegions: toggleInList(p.bodyConcernRegions, r) }))} />
                ))}
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5">
              <Activity className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                <span className="font-semibold">Grau de celulite (Nürnberger-Müller)</span> é registrado como indicador de resultado na aba <span className="font-semibold">Avaliações</span>, para monitorar a evolução de grau a cada reavaliação.
              </p>
            </div>
          </AnamSection>

          <AnamSection title="Hábitos de Vida" subtitle="Atividade física, alimentação, hidratação e sono" icon={<Dumbbell className="w-4 h-4" />} colorClass="emerald" open={sections.s3} onToggle={() => toggle("s3")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Nível de Atividade Física</Label>
                <Select value={form.physicalActivityLevel} onValueChange={sv("physicalActivityLevel")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentario">Sedentário (sem atividade)</SelectItem>
                    <SelectItem value="levemente-ativo">Levemente ativo (1–2x/semana)</SelectItem>
                    <SelectItem value="moderado">Moderadamente ativo (3–4x/semana)</SelectItem>
                    <SelectItem value="muito-ativo">Muito ativo (5+ vezes/semana ou atleta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Tipo de Atividade Física</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.physicalActivityType} onChange={f("physicalActivityType")} placeholder="Musculação, corrida, natação, pilates, caminhada..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Ingestão Hídrica</Label>
                <Select value={form.waterIntake} onValueChange={sv("waterIntake")}>
                  <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menos-1L">Menos de 1 litro/dia</SelectItem>
                    <SelectItem value="1-1.5L">1 a 1,5 litros/dia</SelectItem>
                    <SelectItem value="1.5-2L">1,5 a 2 litros/dia</SelectItem>
                    <SelectItem value="mais-2L">Mais de 2 litros/dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Tabagismo / Etilismo</Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white" value={form.tobaccoAlcohol} onChange={f("tobaccoAlcohol")} placeholder="Fuma? Bebe? Frequência..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Hábitos Alimentares</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.dietHabits} onChange={f("dietHabits")} placeholder="Dieta equilibrada, excesso de sódio ou açúcar, dieta restritiva, come fora frequentemente, ingestão de ultraprocessados..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Qualidade do Sono e Estresse</Label>
              <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.lifestyle} onChange={f("lifestyle")} placeholder="Dorme bem? Acorda cansado? Nível de estresse no trabalho/vida pessoal..." />
            </div>
          </AnamSection>

          <AnamSection title="Histórico Médico e Contraindicações" subtitle="Condições de saúde, medicamentos e restrições" icon={<ShieldCheck className="w-4 h-4" />} colorClass="orange" open={sections.s4} onToggle={() => toggle("s4")}>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 font-medium">Marque todas as condições que o paciente apresenta ou apresentou. Contraindicações relativas ou absolutas devem ser avaliadas antes do tratamento.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Condições Médicas (marque todas que se aplicam)</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Gestante", "Lactante", "Marca-passo", "Implantes metálicos", "Varizes grau III/IV",
                  "Tromboflebite", "Trombose venosa profunda", "Insuficiência venosa", "Linfedema",
                  "Diabetes", "Hipertensão descompensada", "Hipotireoidismo", "Hipertireoidismo",
                  "Câncer ativo", "Cirurgia abdominal recente (<6m)", "Hérnia abdominal",
                  "Distúrbio de coagulação", "Uso de anticoagulante", "Lipodistrofia",
                ].map(cond => (
                  <CheckTag key={cond} label={cond} active={hasInList(form.bodyContraindications, cond)} onClick={() => setForm(p => ({ ...p, bodyContraindications: toggleInList(p.bodyContraindications, cond) }))} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Medicamentos em Uso</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.medications} onChange={f("medications")} placeholder="Anticoagulantes, diuréticos, hormônios, anticoncepcionais, corticoides..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Alergias</Label>
                <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.allergies} onChange={f("allergies")} placeholder="Alergias a géis, cremes, látex, metais, adesivos..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Condições Hormonais</Label>
              <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.bodyMedicalConditions} onChange={f("bodyMedicalConditions")} placeholder="SOP, endometriose, menopausa, pré-menopausa, reposição hormonal, histórico de gestações..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Tratamentos Corporais Anteriores</Label>
              <Textarea className="min-h-[70px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.previousBodyTreatments} onChange={f("previousBodyTreatments")} placeholder="Criolipólise, radiofrequência, ultrassom focado, drenagem linfática, endermologia, lipoaspiração, mesoterapia..." />
            </div>
          </AnamSection>

          <AnamSection title="Objetivos e Expectativas" subtitle="Resultado esperado e disponibilidade para o tratamento" icon={<Target className="w-4 h-4" />} colorClass="amber" open={sections.s5} onToggle={() => toggle("s5")}>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Resultado Esperado</Label>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.patientGoals} onChange={f("patientGoals")} placeholder="O que espera alcançar? Redução de medidas, melhora da celulite, firmeza, definição muscular..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">Disponibilidade e Expectativa de Prazo</Label>
              <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 focus:bg-white resize-none" value={form.aestheticGoalDetails} onChange={f("aestheticGoalDetails")} placeholder="Quantas vezes por semana pode comparecer? Tem evento ou data especial? Expectativa de prazo para resultados..." />
            </div>
          </AnamSection>

        </>)}

        <ExamAttachmentsSection patientId={patientId} />

        <div className="pt-3 flex justify-end">
          <Button onClick={handleSave} className="h-11 px-8 rounded-xl shadow-md shadow-primary/20" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar Anamnese
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Evaluations Tab ────────────────────────────────────────────────────────────



