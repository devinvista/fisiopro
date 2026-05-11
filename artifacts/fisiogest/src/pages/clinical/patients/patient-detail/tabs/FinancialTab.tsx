import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Loader2, Plus, DollarSign, AlertCircle, CheckCircle, Wallet,
  RefreshCw, History, Repeat, TrendingUp, TrendingDown, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import { formatCurrency, formatDateTime } from "../utils/format";
import { statusLabel, txTypeLabel } from "./HistoryTab";
import { RecurringPackageSection } from "./FinancialTab/RecurringPackageSection";
import { CreditsSection } from "./FinancialTab/CreditsSection";
import { WalletSection } from "./FinancialTab/WalletSection";
import { PAYMENT_METHODS, emptyPaymentForm } from "./FinancialTab/constants";

type Section = "history" | "recurring" | "carteira";

const TABS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "history",   label: "Histórico",           icon: <History className="w-3.5 h-3.5" /> },
  { id: "recurring", label: "Pacotes Recorrentes",  icon: <Repeat  className="w-3.5 h-3.5" /> },
  { id: "carteira",  label: "Carteira",             icon: <Wallet  className="w-3.5 h-3.5" /> },
];

export function FinancialTab({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: records = [], isLoading: recLoading } = useQuery<any[]>({
    queryKey: [`/api/financial/patients/${patientId}/history`],
    queryFn: () => apiFetchJson<any[]>(`/api/financial/patients/${patientId}/history`),
    enabled: !!patientId,
  });

  const { data: summary, isLoading: sumLoading } = useQuery<{
    totalAReceber: number; totalPago: number; saldo: number; totalSessionCredits: number;
  }>({
    queryKey: [`/api/financial/patients/${patientId}/summary`],
    queryFn: () => apiFetchJson(`/api/financial/patients/${patientId}/summary`),
    enabled: !!patientId,
  });

  const [showPayForm, setShowPayForm]     = useState(false);
  const [payForm, setPayForm]             = useState(emptyPaymentForm);
  const [saving, setSaving]               = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("history");
  const [estornoTarget, setEstornoTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [estornoReason, setEstornoReason] = useState("");
  const [estorning, setEstorning]         = useState(false);

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
      await apiSendJson(`/api/financial/patients/${patientId}/payment`, "POST", {
        amount: Number(payForm.amount),
        paymentMethod: payForm.paymentMethod || undefined,
        description: payForm.description || undefined,
        paymentDate: payForm.paymentDate || undefined,
      });
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
    if (estornoReason.trim().length < 3) {
      toast({ title: "Informe o motivo do estorno (mínimo 3 caracteres).", variant: "destructive" });
      return;
    }
    setEstorning(true);
    try {
      await apiSendJson(
        `/api/financial/records/${estornoTarget.id}/estorno`,
        "PATCH",
        { reversalReason: estornoReason.trim() },
      );
      toast({ title: "Estorno aplicado", description: "O registro foi marcado como estornado." });
      invalidate();
      setEstornoTarget(null);
      setEstornoReason("");
    } catch (e: any) {
      toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" });
    } finally {
      setEstorning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const saldo          = summary?.saldo          ?? 0;
  const totalAReceber  = summary?.totalAReceber   ?? 0;
  const totalPago      = summary?.totalPago       ?? 0;
  const sessionCredits = summary?.totalSessionCredits ?? 0;
  const pendingCount   = records.filter((r: any) => r.status === "pendente").length;

  const saldoPositive = saldo > 0;
  const saldoNegative = saldo < 0;
  const saldoColor    = saldoPositive ? "text-amber-700"  : saldoNegative ? "text-emerald-700" : "text-slate-600";
  const saldoBg       = saldoPositive
    ? "from-amber-50 via-yellow-50 to-amber-50 border-amber-200"
    : saldoNegative
      ? "from-emerald-50 via-teal-50 to-emerald-50 border-emerald-200"
      : "from-slate-50 to-slate-100 border-slate-200";
  const saldoLabel      = saldoPositive ? "Cliente deve pagar" : saldoNegative ? "Cliente tem crédito" : "Em dia";
  const saldoBadgeCls   = saldoPositive
    ? "bg-amber-100 text-amber-700 border border-amber-200"
    : saldoNegative
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-slate-100 text-slate-600 border border-slate-200";

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary shrink-0">
                <DollarSign className="w-4 h-4" />
              </span>
              Financeiro do Paciente
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 ml-9">
              {records.length} lançamento(s) · {pendingCount} pendente(s)
            </p>
          </div>

          {/* Registrar Pagamento — only visible on sm+ alongside tabs */}
          {activeSection === "history" && (
            showPayForm ? (
              <Button
                variant="outline"
                className="hidden sm:flex h-9 px-4 rounded-full text-xs gap-1.5 shrink-0"
                onClick={() => { setShowPayForm(false); setPayForm(emptyPaymentForm); }}
              >
                Cancelar
              </Button>
            ) : (
              <PrimaryActionButton
                label="Registrar Pagamento"
                className="hidden sm:inline-flex"
                onClick={() => setShowPayForm(true)}
              />
            )
          )}
        </div>

        {/* Tab bar + mobile button row */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Scrollable tab bar */}
          <div className="flex min-w-0 overflow-x-auto scrollbar-none">
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5 min-w-max">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  data-density="compact"
                  onClick={() => setActiveSection(tab.id)}
                  className={[
                    "flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150",
                    activeSection === tab.id
                      ? "bg-primary text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white",
                  ].join(" ")}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile-only Registrar Pagamento */}
          {activeSection === "history" && (
            showPayForm ? (
              <Button
                variant="outline"
                className="sm:hidden w-full h-9 rounded-full text-xs gap-1.5"
                onClick={() => { setShowPayForm(false); setPayForm(emptyPaymentForm); }}
              >
                Cancelar
              </Button>
            ) : (
              <PrimaryActionButton
                label="Registrar Pagamento"
                className="sm:hidden w-full justify-center"
                onClick={() => setShowPayForm(true)}
              />
            )
          )}
        </div>
      </div>

      {/* ── Section content ─────────────────────────────────────────────── */}
      {activeSection === "carteira" ? (
        <WalletSection patientId={patientId} />
      ) : activeSection === "recurring" ? (
        <div className="space-y-6">
          <RecurringPackageSection patientId={patientId} />
          <CreditsSection patientId={patientId} />
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Payment form ──────────────────────────────────────────── */}
          {showPayForm && (
            <Card className="border-2 border-emerald-200 shadow-sm bg-emerald-50/20 overflow-hidden">
              <CardHeader className="pb-3 pt-4 px-5 border-b border-emerald-100 bg-emerald-50/40">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  Registrar Pagamento do Paciente
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registre um valor recebido. O saldo será atualizado automaticamente.
                </p>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Valor (R$) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number" min="0.01" step="0.01"
                      className="bg-white border-slate-200 focus:border-emerald-400 h-9"
                      value={payForm.amount}
                      onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                      placeholder="Ex: 150,00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Forma de Pagamento</Label>
                    <Select value={payForm.paymentMethod} onValueChange={v => setPayForm({ ...payForm, paymentMethod: v })}>
                      <SelectTrigger className="bg-white border-slate-200 h-9 text-sm">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Data do Pagamento{" "}
                      <span className="text-slate-400 font-normal">(opcional)</span>
                    </Label>
                    <DatePickerPTBR
                      value={payForm.paymentDate}
                      onChange={v => setPayForm({ ...payForm, paymentDate: v })}
                      className="h-9 bg-white border-slate-200"
                    />
                    <p className="text-[11px] text-slate-400">Deixe em branco para usar a data de hoje.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Descrição{" "}
                      <span className="text-slate-400 font-normal">(opcional)</span>
                    </Label>
                    <Input
                      className="bg-white border-slate-200 h-9"
                      value={payForm.description}
                      onChange={e => setPayForm({ ...payForm, description: e.target.value })}
                      placeholder="Ex: Pagamento das sessões de março…"
                    />
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setShowPayForm(false)}
                    className="w-full sm:w-auto h-10 rounded-xl"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleRegisterPayment}
                    disabled={saving}
                    className="w-full sm:w-auto h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  >
                    {saving
                      ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      : <CheckCircle className="w-4 h-4 shrink-0" />}
                    Confirmar Pagamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Balance card ──────────────────────────────────────────── */}
          <Card className={`border shadow-sm overflow-hidden bg-gradient-to-br ${saldoBg}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Saldo Atual
                  </p>
                  <p className={`text-2xl sm:text-3xl font-extrabold tabular-nums leading-none ${saldoColor}`}>
                    {saldoNegative ? "−" : ""}{formatCurrency(Math.abs(saldo))}
                  </p>
                  <span className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${saldoBadgeCls}`}>
                    {saldoPositive
                      ? <AlertCircle className="w-3 h-3 shrink-0" />
                      : <CheckCircle className="w-3 h-3 shrink-0" />}
                    {saldoLabel}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-400">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fórmula</span>
                  <p className="text-slate-600 font-medium">A receber − Pago</p>
                  <p className="tabular-nums">{formatCurrency(totalAReceber)} − {formatCurrency(totalPago)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Stats row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-none">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">A Receber</p>
                  <p className="text-lg font-bold text-blue-700 tabular-nums leading-tight">{formatCurrency(totalAReceber)}</p>
                  <p className="text-[10px] text-blue-400">Sessões + Mensalidades</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-none">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Total Pago</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums leading-tight">{formatCurrency(totalPago)}</p>
                  <p className="text-[10px] text-emerald-400">Pagamentos confirmados</p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border shadow-none ${sessionCredits > 0 ? "border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50" : "border-slate-100 bg-slate-50"}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${sessionCredits > 0 ? "bg-teal-100" : "bg-slate-100"}`}>
                  <Banknote className={`w-4 h-4 ${sessionCredits > 0 ? "text-teal-600" : "text-slate-400"}`} />
                </span>
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${sessionCredits > 0 ? "text-teal-500" : "text-slate-400"}`}>Créditos Sessão</p>
                  <p className={`text-lg font-bold tabular-nums leading-tight ${sessionCredits > 0 ? "text-teal-700" : "text-slate-500"}`}>{sessionCredits}</p>
                  <p className={`text-[10px] ${sessionCredits > 0 ? "text-teal-400" : "text-slate-400"}`}>Sessões disponíveis</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── History list ──────────────────────────────────────────── */}
          {records.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 shadow-none">
              <CardContent className="py-12 text-center text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-6 h-6 opacity-50" />
                </div>
                <p className="font-medium text-sm">Nenhum lançamento registrado</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">
                  As sessões confirmadas ou concluídas geram lançamentos automaticamente.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {[...records].reverse().map((record: any) => {
                const txInfo = txTypeLabel(record.transactionType);
                const stInfo = statusLabel(record.status);
                const isSessionType  = record.transactionType === "usoCredito" || record.transactionType === "creditoSessao";
                const isPayment      = record.transactionType === "pagamento";
                const isWalletUsage  = record.transactionType === "usoCarteira";
                const isReceivable   = ["creditoAReceber", "cobrancaSessao", "cobrancaMensal"].includes(record.transactionType);
                const isEstornado    = record.status === "estornado";
                const canEstorno     = !isEstornado && !isSessionType && Number(record.amount) > 0;

                const cardCls = isEstornado
                  ? "border-slate-100 bg-slate-50/60 opacity-60"
                  : isPayment
                    ? "border-emerald-100 bg-emerald-50/20 hover:border-emerald-200"
                    : isWalletUsage
                      ? "border-rose-100 bg-rose-50/20 hover:border-rose-200"
                      : isReceivable
                        ? "border-blue-100 bg-blue-50/20 hover:border-blue-200"
                        : isSessionType
                          ? "border-teal-100 bg-teal-50/20 hover:border-teal-200"
                          : "border-slate-100 hover:border-slate-200";

                const iconBg = isPayment
                  ? "bg-emerald-100 text-emerald-700"
                  : isWalletUsage
                    ? "bg-rose-100 text-rose-700"
                    : isReceivable
                      ? "bg-blue-100 text-blue-700"
                      : isSessionType
                        ? "bg-teal-100 text-teal-700"
                        : "bg-slate-100 text-slate-500";

                const amountCls = isEstornado
                  ? "text-slate-400 line-through"
                  : isPayment
                    ? "text-emerald-600"
                    : isWalletUsage
                      ? "text-rose-600"
                      : isReceivable
                        ? "text-blue-600"
                        : isSessionType
                          ? "text-teal-600"
                          : "text-slate-600";

                return (
                  <Card key={record.id} className={`border shadow-none group transition-colors ${cardCls}`}>
                    <CardContent className="p-3.5">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${iconBg}`}>
                          {txInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm truncate leading-snug ${isEstornado ? "text-slate-400" : "text-slate-800"}`}>
                                {record.description}
                              </p>
                            </div>
                            <p className={`text-sm font-bold text-right shrink-0 whitespace-nowrap tabular-nums ${amountCls}`}>
                              {isSessionType
                                ? (Number(record.amount) === 0 ? "—" : formatCurrency(Number(record.amount)))
                                : isPayment
                                  ? "+" + formatCurrency(Number(record.amount))
                                  : isWalletUsage
                                    ? "−" + formatCurrency(Number(record.amount))
                                    : Number(record.amount) === 0
                                      ? "Crédito"
                                      : "↑" + formatCurrency(Number(record.amount))}
                            </p>
                            {canEstorno && (
                              <button
                                onClick={() => setEstornoTarget({ id: record.id, description: record.description, amount: Number(record.amount) })}
                                className="shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                                title="Estornar registro"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${txInfo.color}`}>
                              {txInfo.label}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stInfo.dot}`} />
                              {stInfo.label}
                            </span>
                            <span className="text-[10px] text-slate-400">{formatDateTime(record.createdAt)}</span>
                            {record.paymentMethod && (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                                {record.paymentMethod}
                              </span>
                            )}
                          </div>
                          {record.dueDate && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Vencimento: {format(parseISO(record.dueDate), "dd/MM/yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── Estorno dialog ────────────────────────────────────────── */}
          <Dialog
            open={!!estornoTarget}
            onOpenChange={v => { if (!v) { setEstornoTarget(null); setEstornoReason(""); } }}
          >
            <DialogContent className="border-none shadow-2xl rounded-3xl w-[calc(100vw-2rem)] sm:max-w-[460px]">
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2.5 rounded-xl bg-amber-100">
                    <RefreshCw className="w-5 h-5 text-amber-600" />
                  </div>
                  <DialogTitle className="font-display text-xl">Estornar Lançamento?</DialogTitle>
                </div>
                <DialogDescription className="text-slate-600 pt-1">
                  O registro não será excluído — ficará marcado como estornado no histórico.
                  O saldo do paciente será recalculado.
                </DialogDescription>
              </DialogHeader>
              {estornoTarget && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm my-1">
                  <p className="font-semibold text-slate-800 truncate">{estornoTarget.description}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{formatCurrency(estornoTarget.amount)}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">
                  Motivo do estorno <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  rows={3}
                  className="rounded-xl border-slate-200 focus:border-amber-400"
                  placeholder="Ex.: cobrança duplicada, paciente devolveu o serviço, erro de lançamento…"
                  value={estornoReason}
                  onChange={e => setEstornoReason(e.target.value)}
                />
                <p className="text-[11px] text-slate-400">
                  Será registrado no histórico de estornos para auditoria (mínimo 3 caracteres).
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => { setEstornoTarget(null); setEstornoReason(""); }}
                  disabled={estorning}
                >
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 gap-1.5"
                  onClick={handleEstorno}
                  disabled={estorning || estornoReason.trim().length < 3}
                >
                  {estorning
                    ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    : <RefreshCw className="w-4 h-4 shrink-0" />}
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
