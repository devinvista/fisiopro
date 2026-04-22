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
import { statusLabel, subscriptionStatusStyle, txTypeLabel } from "./HistoryTab";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

const emptyPaymentForm = { amount: "", paymentMethod: "", description: "" };

function SubscriptionsSection({ patientId }: { patientId: number }) {
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasFeature } = useAuth();
  const subscriptionsEnabled = hasFeature("module.patient_subscriptions");

  const { data: subscriptions = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/financial/patients/${patientId}/subscriptions`],
    queryFn: () => fetch(`/api/financial/patients/${patientId}/subscriptions`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ procedureId: "", startDate: "", billingDay: "", monthlyAmount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const { data: procedures = [] } = useQuery<any[]>({
    queryKey: ["procedures", "all"],
    queryFn: () => fetch("/api/procedures", { headers: authHeader() }).then(r => r.json()),
  });

  const handleCreate = async () => {
    if (!form.procedureId || !form.startDate || !form.monthlyAmount) {
      toast({ title: "Preencha procedimento, data de início e valor", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: any = { patientId, procedureId: parseInt(form.procedureId), startDate: form.startDate, monthlyAmount: Number(form.monthlyAmount), notes: form.notes || undefined };
      if (form.billingDay) body.billingDay = parseInt(form.billingDay);
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Assinatura criada com sucesso" });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/subscriptions`] });
      setForm({ procedureId: "", startDate: "", billingDay: "", monthlyAmount: "", notes: "" });
      setShowForm(false);
    } catch {
      toast({ title: "Erro ao criar assinatura", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Status atualizado" });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/subscriptions`] });
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h4 className="text-base font-semibold text-slate-800">Assinaturas / Mensalidades</h4>
            <p className="text-xs text-slate-500">{subscriptions.length} assinatura(s) vinculada(s)</p>
          </div>
          {!subscriptionsEnabled && <PlanBadge feature="module.patient_subscriptions" />}
        </div>
        {subscriptionsEnabled ? (
          <Button size="sm" className="h-8 rounded-xl" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3.5 h-3.5 mr-1" />{showForm ? "Cancelar" : "Nova Assinatura"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 rounded-xl gap-2" disabled>
            <Plus className="w-3.5 h-3.5" /> Indisponível no plano
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Procedimento *</Label>
                <Select value={form.procedureId} onValueChange={v => setForm(f => ({ ...f, procedureId: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {procedures.filter((p: any) => p.billingType === "mensal").map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Início *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor Mensal (R$) *</Label>
                <Input type="number" step="0.01" value={form.monthlyAmount} onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))} placeholder="Ex: 350,00" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dia de Cobrança <span className="text-slate-400 font-normal">(auto)</span></Label>
                <Input type="number" min="1" max="31" value={form.billingDay} onChange={e => setForm(f => ({ ...f, billingDay: e.target.value }))} placeholder="Usa o dia do início" className="text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." className="text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" className="rounded-xl" disabled={saving} onClick={handleCreate}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />} Criar Assinatura
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
      ) : subscriptions.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-8 text-center text-slate-400 text-sm">Nenhuma assinatura ativa para este paciente</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub: any) => (
            <Card key={sub.id} className="border border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{sub.procedure?.name ?? "Procedimento"}</p>
                      <Badge variant="outline" className={`text-[10px] border ${subscriptionStatusStyle(sub.status)}`}>
                        {sub.status === "ativa" ? "Ativa" : sub.status === "pausada" ? "Pausada" : "Cancelada"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {sub.subscriptionType === "faturaConsolidada" ? (
                        <span className="inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-medium">Fatura Consolidada</span>
                      ) : null}
                      Cobrança todo dia <strong>{sub.billingDay}</strong> · Valor: <strong>{formatCurrency(sub.monthlyAmount)}</strong>
                      {sub.startDate && ` · Desde ${format(parseISO(sub.startDate), "dd/MM/yyyy")}`}
                    </p>
                    {sub.expiryDate && (() => {
                      const expiry = parseISO(sub.expiryDate);
                      const daysLeft = differenceInDays(expiry, new Date());
                      const expired = daysLeft < 0;
                      const soonExpiry = daysLeft >= 0 && daysLeft <= 7;
                      if (!expired && !soonExpiry) return null;
                      return (
                        <p className={`text-[10px] flex items-center gap-1 mt-0.5 font-medium ${expired ? "text-red-600" : "text-amber-600"}`}>
                          <AlertCircle className="w-3 h-3" />
                          {expired
                            ? `Pacote vencido em ${format(expiry, "dd/MM/yyyy")}`
                            : `Vence em ${format(expiry, "dd/MM/yyyy")} (${daysLeft} dia${daysLeft === 1 ? "" : "s"})`}
                        </p>
                      );
                    })()}
                    {sub.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{sub.notes}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {sub.status === "ativa" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => handleStatusChange(sub.id, "pausada")}>
                        Pausar
                      </Button>
                    )}
                    {sub.status === "pausada" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => handleStatusChange(sub.id, "ativa")}>
                        Reativar
                      </Button>
                    )}
                    {sub.status !== "cancelada" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleStatusChange(sub.id, "cancelada")}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreditsSection({ patientId }: { patientId: number }) {
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` });
  const { data, isLoading } = useQuery<{ credits: any[]; totalAvailable: number }>({
    queryKey: [`/api/financial/patients/${patientId}/credits`],
    queryFn: () => fetch(`/api/financial/patients/${patientId}/credits`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const credits = data?.credits ?? [];
  const totalAvailable = data?.totalAvailable ?? 0;
  const creditsWithBalance = credits.filter((c: any) => c.availableCount > 0);

  if (isLoading) return <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" /></div>;
  if (credits.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-slate-800">Créditos de Sessão</h4>
        <Badge className={`${totalAvailable > 0 ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"} border-none text-xs font-semibold`}>
          {totalAvailable} crédito{totalAvailable !== 1 ? "s" : ""} disponível{totalAvailable !== 1 ? "eis" : ""}
        </Badge>
      </div>
      {creditsWithBalance.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum crédito disponível no momento.</p>
      ) : (
        <div className="space-y-1.5">
          {creditsWithBalance.map((credit: any) => (
            <div key={credit.id} className="flex items-center justify-between p-3 rounded-xl bg-teal-50 border border-teal-100">
              <div>
                <p className="text-sm font-semibold text-teal-800">{credit.procedure?.name ?? "Procedimento"}</p>
                <p className="text-xs text-teal-600">{credit.notes}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-teal-700">{credit.availableCount}</p>
                <p className="text-[10px] text-teal-500">crédito{credit.availableCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito",
  "Transferência", "Boleto", "Outro",
];

// ─── Wallet Section ──────────────────────────────────────────────────────────

const WALLET_TX_LABELS: Record<string, { label: string; color: string; sign: "+" | "-" | "" }> = {
  deposito:       { label: "Depósito",      color: "text-emerald-700 bg-emerald-50 border-emerald-200", sign: "+" },
  usoCarteira:    { label: "Uso Carteira",  color: "text-rose-700 bg-rose-50 border-rose-200",           sign: "-" },
  estorno:        { label: "Estorno",       color: "text-amber-700 bg-amber-50 border-amber-200",        sign: "+" },
  ajuste:         { label: "Ajuste",        color: "text-blue-700 bg-blue-50 border-blue-200",           sign: ""  },
};

function WalletSection({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` });

  const { data, isLoading, refetch } = useQuery<{ wallet: any; transactions: any[] }>({
    queryKey: [`/api/patients/${patientId}/wallet`],
    queryFn: () => fetch(`/api/patients/${patientId}/wallet`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const wallet = data?.wallet;
  const transactions = data?.transactions ?? [];
  const balance = Number(wallet?.balance ?? 0);

  const [showDeposit, setShowDeposit] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", paymentMethod: "", description: "" });
  const [saving, setSaving] = useState(false);

  const handleDeposit = async () => {
    const amount = Number(depositForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Informe um valor positivo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/wallet/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          amount,
          paymentMethod: depositForm.paymentMethod || undefined,
          description: depositForm.description || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? "Erro ao depositar");
      }
      toast({ title: "Depósito realizado", description: `R$ ${amount.toFixed(2)} adicionados à carteira.` });
      setDepositForm({ amount: "", paymentMethod: "", description: "" });
      setShowDeposit(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/summary`] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>;

  const balancePositive = balance > 0;
  const balanceBg   = balancePositive ? "from-emerald-50 to-teal-50 border-emerald-200" : "from-slate-50 to-slate-100 border-slate-200";
  const balanceText = balancePositive ? "text-emerald-700" : "text-slate-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Carteira de Crédito
          </h4>
          <p className="text-xs text-slate-500">Saldo pré-pago em R$ para abatimento automático nas sessões</p>
        </div>
        <Button size="sm" className="h-8 rounded-xl" variant={showDeposit ? "outline" : "default"}
          onClick={() => { setShowDeposit(v => !v); setDepositForm({ amount: "", paymentMethod: "", description: "" }); }}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {showDeposit ? "Cancelar" : "Depositar"}
        </Button>
      </div>

      {/* Balance card */}
      <Card className={`border shadow-sm bg-gradient-to-br ${balanceBg} overflow-hidden`}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Saldo disponível</p>
            <p className={`text-3xl font-bold font-display tabular-nums ${balanceText}`}>
              {formatCurrency(balance)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{transactions.length} transação(ões) registrada(s)</p>
          </div>
          <div className={`p-4 rounded-2xl ${balancePositive ? "bg-emerald-100/60" : "bg-slate-100"}`}>
            <Wallet className={`w-8 h-8 ${balancePositive ? "text-emerald-600" : "text-slate-400"}`} />
          </div>
        </CardContent>
      </Card>

      {/* Deposit form */}
      {showDeposit && (
        <Card className="border-2 border-emerald-200 bg-emerald-50/30 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5 border-b border-emerald-100">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-emerald-600" /> Novo Depósito na Carteira
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor (R$) <span className="text-red-500">*</span></Label>
                <Input type="number" min="0.01" step="0.01" placeholder="Ex: 200,00"
                  className="bg-white border-slate-200"
                  value={depositForm.amount}
                  onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Forma de Pagamento</Label>
                <Select value={depositForm.paymentMethod} onValueChange={v => setDepositForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="bg-white border-slate-200 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição <span className="text-slate-400 font-normal">(opcional)</span></Label>
              <Input placeholder="Ex: Pré-pagamento 10 sessões..."
                className="bg-white border-slate-200"
                value={depositForm.description}
                onChange={e => setDepositForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowDeposit(false)}>Cancelar</Button>
              <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleDeposit}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Confirmar Depósito
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction history */}
      {transactions.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-8 text-center text-slate-400 text-sm">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhuma movimentação na carteira
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx: any) => {
            const info = WALLET_TX_LABELS[tx.type] ?? { label: tx.type, color: "text-slate-700 bg-slate-50 border-slate-200", sign: "" as const };
            const amt = Number(tx.amount);
            const isCredit = info.sign === "+";
            return (
              <Card key={tx.id} className="border border-slate-100 shadow-none hover:border-slate-200 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg border ${info.color}`}>
                      {isCredit
                        ? <ArrowDownRight className="w-3.5 h-3.5" />
                        : <TrendingDown className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${info.color}`}>{info.label}</span>
                        <span className="text-[10px] text-slate-400">{tx.createdAt ? format(new Date(tx.createdAt), "dd/MM/yyyy HH:mm") : "—"}</span>
                      </div>
                    </div>
                  </div>
                  <p className={`text-sm font-bold tabular-nums shrink-0 ${isCredit ? "text-emerald-700" : "text-rose-600"}`}>
                    {info.sign}{formatCurrency(amt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Financial Tab ───────────────────────────────────────────────────────────

export function FinancialTab({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` });

  const { data: records = [], isLoading: recLoading } = useQuery<any[]>({
    queryKey: [`/api/financial/patients/${patientId}/history`],
    queryFn: () => fetch(`/api/financial/patients/${patientId}/history`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const { data: summary, isLoading: sumLoading } = useQuery<{
    totalAReceber: number; totalPago: number; saldo: number; totalSessionCredits: number;
  }>({
    queryKey: [`/api/financial/patients/${patientId}/summary`],
    queryFn: () => fetch(`/api/financial/patients/${patientId}/summary`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState(emptyPaymentForm);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"history" | "subscriptions" | "carteira">("history");
  const [estornoTarget, setEstornoTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [estorning, setEstorning] = useState(false);

  const isLoading = recLoading || sumLoading;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/history`] });
    queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/summary`] });
  };

  const handleRegisterPayment = async () => {
    if (!payForm.amount) {
      toast({ title: "Informe o valor do pagamento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/financial/patients/${patientId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          amount: Number(payForm.amount),
          paymentMethod: payForm.paymentMethod || undefined,
          description: payForm.description || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Erro");
      }
      toast({ title: "Pagamento registrado", description: "O saldo do paciente foi atualizado." });
      invalidate();
      setPayForm(emptyPaymentForm);
      setShowPayForm(false);
    } catch (e: any) {
      toast({ title: "Erro ao registrar pagamento", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEstorno = async () => {
    if (!estornoTarget) return;
    setEstorning(true);
    try {
      const res = await fetch(`/api/financial/records/${estornoTarget.id}/estorno`, {
        method: "PATCH",
        headers: authHeader(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Erro");
      }
      toast({ title: "Estorno aplicado", description: "O registro foi marcado como estornado." });
      invalidate();
      setEstornoTarget(null);
    } catch (e: any) {
      toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" });
    } finally {
      setEstorning(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  const saldo = summary?.saldo ?? 0;
  const totalAReceber = summary?.totalAReceber ?? 0;
  const totalPago = summary?.totalPago ?? 0;
  const sessionCredits = summary?.totalSessionCredits ?? 0;

  const visibleRecords = records.filter((r: any) => r.status !== "estornado" || r.transactionType === "estorno");
  const pendingCount = records.filter((r: any) => r.status === "pendente").length;

  const saldoColor = saldo > 0 ? "text-amber-700" : saldo < 0 ? "text-green-700" : "text-slate-700";
  const saldoBg = saldo > 0 ? "from-amber-50 to-yellow-50 border-amber-200" : saldo < 0 ? "from-green-50 to-emerald-50 border-green-200" : "from-slate-50 to-slate-100 border-slate-200";
  const saldoLabel = saldo > 0 ? "Cliente deve pagar" : saldo < 0 ? "Cliente tem crédito" : "Em dia";
  const saldoBadgeClass = saldo > 0 ? "bg-amber-100 text-amber-700" : saldo < 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Financeiro do Paciente</h3>
          <p className="text-sm text-slate-500">{records.length} lançamento(s) · {pendingCount} pendente(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => setActiveSection("history")}
              className={`px-3 h-8 transition-colors ${activeSection === "history" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              Histórico
            </button>
            <button onClick={() => setActiveSection("subscriptions")}
              className={`px-3 h-8 border-l border-slate-200 transition-colors ${activeSection === "subscriptions" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              Assinaturas
            </button>
            <button onClick={() => setActiveSection("carteira")}
              className={`px-3 h-8 border-l border-slate-200 transition-colors flex items-center gap-1 ${activeSection === "carteira" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              <Wallet className="w-3 h-3" /> Carteira
            </button>
          </div>
          {activeSection === "history" && (
            <Button onClick={() => { setShowPayForm(!showPayForm); setPayForm(emptyPaymentForm); }}
              className="h-8 px-3 rounded-xl text-xs" variant={showPayForm ? "outline" : "default"}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              {showPayForm ? "Cancelar" : "Registrar Pagamento"}
            </Button>
          )}
        </div>
      </div>

      {activeSection === "carteira" ? (
        <WalletSection patientId={patientId} />
      ) : activeSection === "subscriptions" ? (
        <div className="space-y-6">
          <SubscriptionsSection patientId={patientId} />
          <CreditsSection patientId={patientId} />
        </div>
      ) : (
        <div className="space-y-4">

          {/* Payment registration form */}
          {showPayForm && (
            <Card className="border-2 border-green-200 shadow-md bg-green-50/30">
              <CardHeader className="pb-3 border-b border-green-100">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" /> Registrar Pagamento do Paciente
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Registre um valor recebido do paciente. O saldo será atualizado automaticamente.</p>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Valor (R$) <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0.01" step="0.01"
                      className="bg-white border-slate-200 focus:border-green-400"
                      value={payForm.amount}
                      onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                      placeholder="Ex: 150.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Forma de Pagamento</Label>
                    <Select value={payForm.paymentMethod} onValueChange={v => setPayForm({ ...payForm, paymentMethod: v })}>
                      <SelectTrigger className="bg-white border-slate-200"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-700">Descrição <span className="text-slate-400 font-normal">(opcional)</span></Label>
                  <Input className="bg-white border-slate-200"
                    value={payForm.description}
                    onChange={e => setPayForm({ ...payForm, description: e.target.value })}
                    placeholder="Ex: Pagamento das sessões de março…" />
                </div>
                <div className="flex justify-end gap-3 pt-1">
                  <Button variant="outline" onClick={() => setShowPayForm(false)} className="rounded-xl">Cancelar</Button>
                  <Button onClick={handleRegisterPayment} disabled={saving} className="rounded-xl bg-green-600 hover:bg-green-700">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    <CheckCircle className="w-4 h-4 mr-1.5" /> Confirmar Pagamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Balance card */}
          <Card className={`border shadow-md overflow-hidden bg-gradient-to-br ${saldoBg}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Saldo Atual</p>
                  <p className={`text-3xl font-extrabold ${saldoColor}`}>
                    {saldo < 0 ? "−" : ""}{formatCurrency(Math.abs(saldo))}
                  </p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${saldoBadgeClass}`}>
                    {saldo > 0 ? <AlertCircle className="w-3 h-3" /> : saldo < 0 ? <CheckCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {saldoLabel}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-500">
                  <p>Fórmula: <strong className="text-slate-700">A receber − Pago</strong></p>
                  <p className="text-slate-400">{formatCurrency(totalAReceber)} − {formatCurrency(totalPago)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-none bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Total A Receber</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(totalAReceber)}</p>
                <p className="text-[10px] text-blue-400 mt-0.5">Sessões + Mensalidades</p>
              </CardContent>
            </Card>
            <Card className="border-none bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-green-600 uppercase mb-1">Total Pago</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totalPago)}</p>
                <p className="text-[10px] text-green-400 mt-0.5">Pagamentos confirmados</p>
              </CardContent>
            </Card>
            <Card className={`border-none shadow-sm ${sessionCredits > 0 ? "bg-gradient-to-br from-teal-50 to-cyan-50" : "bg-gradient-to-br from-slate-50 to-slate-100"}`}>
              <CardContent className="p-4">
                <p className={`text-[10px] font-bold uppercase mb-1 ${sessionCredits > 0 ? "text-teal-600" : "text-slate-500"}`}>Créditos Sessão</p>
                <p className={`text-xl font-bold ${sessionCredits > 0 ? "text-teal-700" : "text-slate-600"}`}>{sessionCredits}</p>
                <p className={`text-[10px] mt-0.5 ${sessionCredits > 0 ? "text-teal-400" : "text-slate-400"}`}>Sessões disponíveis</p>
              </CardContent>
            </Card>
          </div>

          {/* History */}
          {records.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200">
              <CardContent className="p-12 text-center text-slate-400">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Nenhum lançamento registrado</p>
                <p className="text-xs mt-1">As sessões confirmadas ou concluídas geram créditos automaticamente.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {[...records].reverse().map((record: any) => {
                const txInfo = txTypeLabel(record.transactionType);
                const stInfo = statusLabel(record.status);
                const isSessionType = record.transactionType === "usoCredito" || record.transactionType === "creditoSessao";
                const isPayment = record.transactionType === "pagamento";
                const isReceivable = record.transactionType === "creditoAReceber" || record.transactionType === "cobrancaSessao" || record.transactionType === "cobrancaMensal";
                const isEstornado = record.status === "estornado";
                const canEstorno = !isEstornado && !isSessionType && Number(record.amount) > 0;

                const cardBg = isEstornado
                  ? "border-slate-100 bg-slate-50/50 opacity-60"
                  : isPayment
                    ? "border-green-100 bg-green-50/30"
                    : isReceivable
                      ? "border-blue-100 bg-blue-50/20"
                      : isSessionType
                        ? "border-teal-100 bg-teal-50/20"
                        : "border-slate-200";

                const iconBg = isPayment ? "bg-green-100" : isReceivable ? "bg-blue-100" : isSessionType ? "bg-teal-100" : "bg-slate-100";
                const amountColor = isEstornado ? "text-slate-400 line-through" : isPayment ? "text-green-600" : isReceivable ? "text-blue-600" : isSessionType ? "text-teal-600" : "text-slate-600";

                return (
                  <Card key={record.id} className={`border shadow-sm group ${cardBg}`}>
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${iconBg}`}>
                        {txInfo.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${isEstornado ? "text-slate-400" : "text-slate-800"}`}>{record.description}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${txInfo.color}`}>{txInfo.label}</span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <span className={`w-1.5 h-1.5 rounded-full ${stInfo.dot}`} />{stInfo.label}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDateTime(record.createdAt)}</span>
                          {record.paymentMethod && (
                            <span className="text-[10px] text-slate-400">{record.paymentMethod}</span>
                          )}
                        </div>
                        {record.dueDate && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Vencimento: {format(parseISO(record.dueDate), "dd/MM/yyyy")}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${amountColor}`}>
                            {isSessionType ? (Number(record.amount) === 0 ? "—" : formatCurrency(Number(record.amount))) : (isPayment ? "+" : "↑") + (Number(record.amount) === 0 ? "Crédito" : formatCurrency(Number(record.amount)))}
                          </p>
                        </div>
                        {canEstorno && (
                          <button
                            onClick={() => setEstornoTarget({ id: record.id, description: record.description, amount: Number(record.amount) })}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                            title="Estornar registro"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Estorno confirmation */}
          <Dialog open={!!estornoTarget} onOpenChange={v => { if (!v) setEstornoTarget(null); }}>
            <DialogContent className="border-none shadow-2xl rounded-3xl sm:max-w-[420px]">
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2.5 rounded-xl bg-amber-100">
                    <RefreshCw className="w-5 h-5 text-amber-600" />
                  </div>
                  <DialogTitle className="font-display text-xl">Estornar Lançamento?</DialogTitle>
                </div>
                <DialogDescription className="text-slate-600 pt-1">
                  O registro não será excluído — ficará marcado como estornado no histórico. O saldo do paciente será recalculado.
                </DialogDescription>
              </DialogHeader>
              {estornoTarget && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm my-1">
                  <p className="font-semibold text-slate-800 truncate">{estornoTarget.description}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{formatCurrency(estornoTarget.amount)}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" className="rounded-xl" onClick={() => setEstornoTarget(null)} disabled={estorning}>Cancelar</Button>
                <Button className="rounded-xl bg-amber-600 hover:bg-amber-700" onClick={handleEstorno} disabled={estorning}>
                  {estorning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Confirmar Estorno
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

// ─── Discharge Tab ──────────────────────────────────────────────────────────────

