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

type AtestadoRecord = {
  id: number;
  patientId: number;
  type: string;
  professionalName: string;
  professionalSpecialty: string | null;
  professionalCouncil: string | null;
  content: string;
  cid: string | null;
  daysOff: number | null;
  issuedAt: string;
};

type AtestadoType = "comparecimento" | "afastamento" | "tratamento" | "personalizado";

const ATESTADO_TYPES: { value: AtestadoType; label: string; icon: React.ReactNode; activeClass: string; desc: string }[] = [
  { value: "comparecimento", label: "Comparecimento", icon: <CalendarDays className="w-4 h-4" />, activeClass: "border-blue-400 bg-blue-50 text-blue-700", desc: "Confirma presença na clínica" },
  { value: "afastamento",    label: "Afastamento",    icon: <BadgeCheck className="w-4 h-4" />,   activeClass: "border-red-400 bg-red-50 text-red-700",   desc: "Afastamento por período determinado" },
  { value: "tratamento",     label: "Tratamento",     icon: <ClipboardCheck className="w-4 h-4" />,activeClass: "border-green-500 bg-green-50 text-green-700",desc: "Declara tratamento em curso" },
  { value: "personalizado",  label: "Personalizado",  icon: <PenLine className="w-4 h-4" />,      activeClass: "border-slate-400 bg-slate-50 text-slate-700",desc: "Redigido livremente" },
];

const TYPE_BADGE: Record<string, string> = {
  comparecimento: "bg-blue-100 text-blue-700",
  afastamento: "bg-red-100 text-red-700",
  tratamento: "bg-green-100 text-green-700",
  personalizado: "bg-slate-100 text-slate-600",
};

const TYPE_LABEL: Record<string, string> = {
  comparecimento: "Comparecimento",
  afastamento: "Afastamento",
  tratamento: "Tratamento Contínuo",
  personalizado: "Personalizado",
};

function daysToWords(n: number): string {
  const map: Record<number, string> = {
    1:"um",2:"dois",3:"três",4:"quatro",5:"cinco",6:"seis",7:"sete",8:"oito",9:"nove",10:"dez",
    11:"onze",12:"doze",13:"treze",14:"quatorze",15:"quinze",16:"dezesseis",17:"dezessete",
    18:"dezoito",19:"dezenove",20:"vinte",21:"vinte e um",22:"vinte e dois",23:"vinte e três",
    24:"vinte e quatro",25:"vinte e cinco",26:"vinte e seis",27:"vinte e sete",28:"vinte e oito",
    29:"vinte e nove",30:"trinta",45:"quarenta e cinco",60:"sessenta",90:"noventa",
  };
  return map[n] ?? String(n);
}

function buildAtestadoTemplate({ type, name, cpf, age, dateStr, daysOff, purpose }: {
  type: AtestadoType; name: string; cpf: string; age?: number | null; dateStr: string; daysOff?: number; purpose?: string;
}): string {
  const ageText = age ? `, ${age} anos,` : "";
  const fmt = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (type === "comparecimento") {
    return `Atestamos para os devidos fins que o(a) Sr(a). ${name}${ageText} portador(a) do CPF nº ${fmt}, compareceu a esta clínica no dia ${dateStr} para realização de atendimento fisioterapêutico, conforme prescrição e necessidade clínica.`;
  }
  if (type === "afastamento") {
    const d = daysOff || 0;
    const dw = d ? `${d} (${daysToWords(d)})` : "__ (____)";
    return `Atestamos para os devidos fins que o(a) Sr(a). ${name}${ageText} portador(a) do CPF nº ${fmt}, necessita de afastamento de suas atividades laborais pelo período de ${dw} dias, a partir de ${dateStr}.\n\nEsta determinação baseia-se em avaliação clínica realizada nesta data, sendo imprescindível o repouso para recuperação adequada do quadro em tratamento.`;
  }
  if (type === "tratamento") {
    const p = purpose?.trim() ? `para ${purpose.trim()}` : "conforme protocolo clínico estabelecido";
    return `Declaramos que o(a) Sr(a). ${name}${ageText} portador(a) do CPF nº ${fmt}, está sob acompanhamento fisioterapêutico regular nesta clínica, sendo necessária a manutenção do tratamento ${p}.\n\nSolicitamos a compreensão dos responsáveis para a continuidade e regularidade das sessões, fundamentais para o sucesso do tratamento.`;
  }
  return "";
}

function escapeHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function printAtestado(at: AtestadoRecord, clinic?: ClinicInfo | null) {
  const dateStr = format(new Date(at.issuedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const clinicName = clinic?.name || "FisioGest Pro";
  const isAutonomo = clinic?.type === "autonomo";
  const docId = isAutonomo
    ? (clinic?.cpf ? `CPF: ${clinic.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}` : "")
    : (clinic?.cnpj ? `CNPJ: ${clinic.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}` : "");
  const council = clinic?.crefito || "";
  const contactParts = [clinic?.phone, clinic?.email, clinic?.address].filter(Boolean).join(" · ");
  const logoHtml = clinic?.logoUrl
    ? `<img src="${clinic.logoUrl}" alt="Logo" style="max-height:50px;max-width:160px;object-fit:contain;" />`
    : "";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Atestado</title><style>
@page{size:A4;margin:2.5cm}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;line-height:1.5}
.header{border-bottom:2px solid #1d4ed8;padding-bottom:14px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-start}
.clinic-info{display:flex;align-items:center;gap:12px}
.clinic-name{font-size:15pt;font-weight:bold;letter-spacing:0.5px;color:#1e293b}
.clinic-sub{font-size:8.5pt;color:#64748b;margin-top:2px}
.clinic-contact{font-size:8pt;color:#94a3b8;margin-top:1px}
.doc-info{text-align:right;font-size:9pt;color:#555}
.doc-num{font-size:8pt;color:#999}
.doc-title{text-align:center;margin:36px 0 28px}
.doc-title h1{font-size:18pt;font-weight:bold;letter-spacing:6px;text-transform:uppercase;border-bottom:1px solid #000;display:inline-block;padding-bottom:4px}
.content{text-align:justify;line-height:2;font-size:12pt;white-space:pre-wrap;margin-bottom:16px}
.cid{font-size:10pt;color:#444;margin-top:8px}
.city-date{margin-top:48px;text-align:right;font-size:11pt}
.signature{margin-top:64px;text-align:center}
.sig-line{border-top:1px solid #000;width:300px;margin:0 auto 10px}
.sig-name{font-weight:bold;font-size:11pt}
.sig-detail{font-size:10pt;color:#333}
.footer{margin-top:48px;padding-top:10px;border-top:1px solid #ccc;font-size:7.5pt;color:#888;text-align:center}
</style></head><body>
<div class="header">
  <div class="clinic-info">
    ${logoHtml}
    <div>
      <div class="clinic-name">${escapeHtml(clinicName)}</div>
      <div class="clinic-sub">${[docId, council].filter(Boolean).join(" · ")}</div>
      ${contactParts ? `<div class="clinic-contact">${escapeHtml(contactParts)}</div>` : ""}
    </div>
  </div>
  <div class="doc-info"><div><strong>Emitido em:</strong> ${dateStr}</div><div class="doc-num">Nº ${String(at.id).padStart(5,"0")}</div></div>
</div>
<div class="doc-title"><h1>Atestado</h1></div>
<div class="content">${escapeHtml(at.content)}</div>
${at.cid ? `<div class="cid"><strong>CID-10:</strong> ${escapeHtml(at.cid)}</div>` : ""}
<div class="city-date">${dateStr}</div>
<div class="signature">
  <div class="sig-line"></div>
  <div class="sig-name">${escapeHtml(at.professionalName)}</div>
  ${at.professionalSpecialty ? `<div class="sig-detail">${escapeHtml(at.professionalSpecialty)}</div>` : ""}
  ${at.professionalCouncil ? `<div class="sig-detail">${escapeHtml(at.professionalCouncil)}</div>` : ""}
</div>
<div class="footer">Documento emitido via ${escapeHtml(clinicName)} em ${dateStr} — Atestado nº ${String(at.id).padStart(5,"0")}</div>
</body></html>`;
  const w = window.open("","_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

interface AtestadoDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: number;
  patient: PatientBasic;
  onCreated?: () => void;
  appointmentDate?: string;
  defaultType?: AtestadoType;
}

export function AtestadoDialog({ open, onClose, patientId, patient, onCreated, appointmentDate, defaultType }: AtestadoDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });

  const [type, setType] = useState<AtestadoType>(defaultType ?? "comparecimento");
  const [profSpecialty, setProfSpecialty] = useState(() => localStorage.getItem("fisiogest_prof_specialty") ?? "");
  const [profCouncil, setProfCouncil]     = useState(() => localStorage.getItem("fisiogest_prof_council") ?? "");
  const [daysOff, setDaysOff]   = useState("3");
  const [purpose, setPurpose]   = useState("");
  const [cid, setCid]           = useState("");
  const [content, setContent]   = useState("");
  const [saving, setSaving]     = useState(false);

  const age = patient.birthDate ? differenceInYears(todayBRTDate(), parseISO(patient.birthDate)) : null;
  const dateStr = appointmentDate
    ? format(parseISO(appointmentDate), "dd/MM/yyyy", { locale: ptBR })
    : format(todayBRTDate(), "dd/MM/yyyy", { locale: ptBR });

  useEffect(() => {
    if (!open) return;
    setType(defaultType ?? "comparecimento");
    setDaysOff("3"); setPurpose(""); setCid("");
  }, [open, defaultType]);

  useEffect(() => {
    if (type === "personalizado") { setContent(""); return; }
    setContent(buildAtestadoTemplate({ type, name: patient.name, cpf: patient.cpf ?? "", age, dateStr, daysOff: parseInt(daysOff)||0, purpose }));
  }, [type, patient.name, patient.cpf, age, dateStr, daysOff, purpose]);

  const handleEmit = async () => {
    if (!content.trim()) {
      toast({ title: "Texto obrigatório", description: "Preencha o conteúdo do atestado.", variant: "destructive" });
      return;
    }
    setSaving(true);
    localStorage.setItem("fisiogest_prof_specialty", profSpecialty);
    localStorage.setItem("fisiogest_prof_council", profCouncil);
    try {
      const res = await fetch(`/api/patients/${patientId}/atestados`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
        body: JSON.stringify({
          type, content, cid: cid || null,
          professionalName: user?.name ?? "Profissional",
          professionalSpecialty: profSpecialty || null,
          professionalCouncil: profCouncil || null,
          daysOff: type === "afastamento" ? (parseInt(daysOff) || null) : null,
        }),
      });
      if (!res.ok) throw new Error();
      const saved: AtestadoRecord = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/atestados`] });
      toast({ title: "Atestado emitido com sucesso!" });
      printAtestado(saved, clinic);
      onCreated?.();
      onClose();
    } catch {
      toast({ title: "Erro ao emitir atestado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <div className="flex flex-col max-h-[90dvh] overflow-hidden">
          <DialogHeader className="pb-4 border-b border-slate-100 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" /> Emitir Atestado
            </DialogTitle>
            <DialogDescription>
              Paciente: <strong>{patient.name}</strong> &bull; CPF: {(patient.cpf ?? "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4")}
              {appointmentDate && <> &bull; Consulta: <strong>{format(parseISO(appointmentDate),"dd/MM/yyyy",{locale:ptBR})}</strong></>}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto p-6 space-y-5">
            {/* Type selector */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Tipo de Atestado</Label>
              <div className="grid grid-cols-2 gap-2">
                {ATESTADO_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setType(t.value)}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${type === t.value ? t.activeClass : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                    <span className="mt-0.5 shrink-0">{t.icon}</span>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{t.label}</p>
                      <p className="text-xs opacity-70 mt-0.5 leading-tight">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Type-specific fields */}
            {type === "afastamento" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Dias de afastamento <span className="text-red-400">*</span></Label>
                  <Input type="number" min={1} max={365} className="h-9 text-sm bg-slate-50"
                    value={daysOff} onChange={e => setDaysOff(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">CID-10 (opcional)</Label>
                  <Input className="h-9 text-sm bg-slate-50 uppercase" placeholder="Ex: M54.5"
                    value={cid} onChange={e => setCid(e.target.value.toUpperCase())} />
                </div>
              </div>
            )}
            {type === "tratamento" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Finalidade do tratamento</Label>
                <Input className="h-9 text-sm bg-slate-50" placeholder="Ex: reabilitação pós-operatória de joelho direito"
                  value={purpose} onChange={e => setPurpose(e.target.value)} />
              </div>
            )}
            {(type === "comparecimento" || type === "personalizado") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">CID-10 (opcional)</Label>
                <Input className="h-9 text-sm bg-slate-50 max-w-xs uppercase" placeholder="Ex: M54.5"
                  value={cid} onChange={e => setCid(e.target.value.toUpperCase())} />
              </div>
            )}

            {/* Content */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700">
                Texto do Atestado
                {type !== "personalizado" && <span className="ml-2 text-xs font-normal text-slate-400">preenchido automaticamente · editável</span>}
              </Label>
              <Textarea
                className="min-h-[140px] text-sm bg-slate-50 border-slate-200 resize-none font-serif leading-relaxed"
                placeholder={type === "personalizado" ? "Digite o texto completo do atestado..." : ""}
                value={content} onChange={e => setContent(e.target.value)}
              />
            </div>

            {/* Professional info */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dados do Profissional (salvos automaticamente)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Nome do profissional</Label>
                  <p className="text-sm font-semibold text-slate-700 h-9 flex items-center">{user?.name ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Conselho / Registro</Label>
                  <Input className="h-9 text-sm bg-white" placeholder="Ex: CREFITO-3 123456-F"
                    value={profCouncil} onChange={e => setProfCouncil(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Especialidade</Label>
                  <Input className="h-9 text-sm bg-white" placeholder="Ex: Fisioterapia Ortopédica e Esportiva"
                    value={profSpecialty} onChange={e => setProfSpecialty(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 px-6 pb-2 border-t border-slate-100 shrink-0">
            <Button variant="outline" onClick={onClose} className="h-10">Cancelar</Button>
            <Button onClick={handleEmit} disabled={saving} className="h-10 gap-2 min-w-[155px] shadow-md shadow-primary/20">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {saving ? "Emitindo..." : "Emitir e Imprimir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AtestadosTab({ patientId, patient }: { patientId: number; patient: PatientBasic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });
  const [showDialog, setShowDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: atestados = [], isLoading } = useQuery<AtestadoRecord[]>({
    queryKey: [`/api/patients/${patientId}/atestados`],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/atestados`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`/api/patients/${patientId}/atestados/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
      });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/atestados`] });
      toast({ title: "Atestado excluído" });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl">Atestados</CardTitle>
            <CardDescription>Atestados e declarações emitidos para este paciente</CardDescription>
          </div>
          <Button onClick={() => setShowDialog(true)} className="gap-2 h-10 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" /> Emitir Atestado
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

        {!isLoading && atestados.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <ScrollText className="w-14 h-14 mb-4 opacity-15" />
            <p className="font-semibold text-base">Nenhum atestado emitido</p>
            <p className="text-sm mt-1 text-slate-400">Clique em "Emitir Atestado" ou acesse o histórico de consultas</p>
          </div>
        )}

        {!isLoading && atestados.length > 0 && (
          <div className="space-y-3">
            {atestados.map(at => (
              <div key={at.id} className="rounded-xl border border-slate-200 bg-white p-4 flex gap-4 hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ScrollText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[at.type] ?? "bg-slate-100 text-slate-600"}`}>
                      {TYPE_LABEL[at.type] ?? at.type}
                    </span>
                    {at.daysOff && <span className="text-xs text-slate-500">{at.daysOff} dia(s)</span>}
                    {at.cid && <span className="text-xs text-slate-400">CID: {at.cid}</span>}
                    <span className="text-xs text-slate-400 ml-auto shrink-0">{formatDateTime(at.issuedAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{at.content}</p>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {at.professionalName}{at.professionalSpecialty ? ` · ${at.professionalSpecialty}` : ""}
                    {at.professionalCouncil ? ` · ${at.professionalCouncil}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => printAtestado(at, clinic)}>
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </Button>
                  <Button variant="ghost" size="sm"
                    className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                    disabled={deletingId === at.id} onClick={() => handleDelete(at.id)}>
                    {deletingId === at.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AtestadoDialog open={showDialog} onClose={() => setShowDialog(false)}
        patientId={patientId} patient={patient} />
    </Card>
  );
}

// ─── Edit Patient Dialog ─────────────────────────────────────────────────────────


