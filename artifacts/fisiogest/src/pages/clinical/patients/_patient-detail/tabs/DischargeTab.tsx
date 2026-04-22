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

const DISCHARGE_REASONS = [
  "Objetivo alcançado",
  "Alta a pedido do paciente",
  "Encaminhamento para outro serviço",
  "Abandono de tratamento",
  "Sem resposta ao tratamento",
  "Outro",
];

export function DischargeTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { data, isLoading } = useGetDischarge(patientId);
  const { user } = useAuth();
  const mutation = useSaveDischarge();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ dischargeDate: today, dischargeReason: "", achievedResults: "", recommendations: "" });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        dischargeDate: data.dischargeDate || today,
        dischargeReason: data.dischargeReason || "",
        achievedResults: data.achievedResults || "",
        recommendations: data.recommendations || "",
      });
    }
  }, [data]);

  const showForm = (!data && !isLoading) || editing;

  const handleSave = () => {
    if (!form.dischargeReason || !form.dischargeDate) return;
    mutation.mutate({ patientId, data: form }, {
      onSuccess: () => {
        toast({ title: "Alta registrada", description: "Documento de alta fisioterapêutica salvo com sucesso." });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/discharge-summary`] });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });
        setEditing(false);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Alta Fisioterapêutica</h3>
          <p className="text-sm text-slate-500">Exigência regulatória COFFITO — finalização formal do tratamento</p>
        </div>
        {data && !editing && (
          <div className="flex items-center gap-2">
            {patient && (
              <Button variant="outline" size="sm" className="h-9 px-3 rounded-xl text-xs gap-1.5"
                onClick={() => printDocument(
                  generateDischargeHTML(patient, data as unknown as Record<string, string>, { name: (user as any)?.name }, clinic),
                  `Alta Fisioterapêutica — ${patient.name}`
                )}>
                <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)} className="h-9 px-4 rounded-xl text-sm">
              Editar Alta
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Requisito COFFITO:</span> Todo prontuário deve conter o documento de alta com motivo, resultados e recomendações para o paciente.
        </p>
      </div>

      {showForm ? (
        <Card className="border-2 border-primary/20 shadow-md">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base flex items-center gap-2">
              <LogOut className="w-4 h-4 text-primary" />
              {data ? "Editar Alta Fisioterapêutica" : "Registrar Alta Fisioterapêutica"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Data da Alta <span className="text-red-500">*</span></Label>
              <DatePickerPTBR value={form.dischargeDate} onChange={v => setForm({ ...form, dischargeDate: v })} className="bg-slate-50 border-slate-200 max-w-xs" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Motivo da Alta <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {DISCHARGE_REASONS.map(r => (
                  <button key={r} type="button"
                    onClick={() => setForm({ ...form, dischargeReason: r })}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.dischargeReason === r
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary"
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
              <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 focus:bg-white resize-none text-sm"
                value={form.dischargeReason}
                onChange={e => setForm({ ...form, dischargeReason: e.target.value })}
                placeholder="Selecione uma opção acima ou descreva o motivo da alta..." />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Resultados Alcançados</Label>
              <Textarea className="min-h-[100px] bg-slate-50 border-slate-200 focus:bg-white resize-none"
                value={form.achievedResults} onChange={e => setForm({ ...form, achievedResults: e.target.value })}
                placeholder="Descreva a evolução funcional, redução de dor, ganhos de amplitude e força muscular..." />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Recomendações ao Paciente</Label>
              <Textarea className="min-h-[100px] bg-slate-50 border-slate-200 focus:bg-white resize-none"
                value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })}
                placeholder="Orientações pós-alta: exercícios domiciliares, cuidados posturais, retorno se necessário..." />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              {editing && (
                <Button variant="outline" onClick={() => setEditing(false)} className="rounded-xl">Cancelar</Button>
              )}
              <Button onClick={handleSave}
                disabled={mutation.isPending || !form.dischargeReason || !form.dischargeDate}
                className="h-11 px-8 rounded-xl shadow-md shadow-primary/20">
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                Registrar Alta
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <Card className="border-none shadow-md overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-green-400 to-emerald-500" />
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base text-slate-800">Alta Concedida</CardTitle>
                  <p className="text-xs text-slate-500">
                    {formatDate(data.dischargeDate)} &bull; Registrado em {formatDateTime(data.updatedAt)}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <CheckCircle className="w-3.5 h-3.5" /> Alta Concedida
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <InfoBlock label="Motivo da Alta" value={data.dischargeReason} />
            {data.achievedResults && <InfoBlock label="Resultados Alcançados" value={data.achievedResults} />}
            {data.recommendations && <InfoBlock label="Recomendações ao Paciente" value={data.recommendations} />}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ─── Atestados ────────────────────────────────────────────────────────────────────



