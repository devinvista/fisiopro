import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Loader2, Plus, DollarSign, AlertCircle, CheckCircle, Wallet, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import { formatCurrency, formatDateTime } from "../utils/format";
import { statusLabel, txTypeLabel } from "./HistoryTab";
import { SubscriptionsSection } from "./FinancialTab/SubscriptionsSection";
import { CreditsSection } from "./FinancialTab/CreditsSection";
import { WalletSection } from "./FinancialTab/WalletSection";
import { PAYMENT_METHODS, emptyPaymentForm } from "./FinancialTab/constants";

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

  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState(emptyPaymentForm);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"history" | "subscriptions" | "carteira">("history");
  const [estornoTarget, setEstornoTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [estornoReason, setEstornoReason] = useState("");
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
      await apiSendJson(`/api/financial/patients/${patientId}/payment`, "POST", {
        amount: Number(payForm.amount),
        paymentMethod: payForm.paymentMethod || undefined,
        description: payForm.description || undefined,
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

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  const saldo = summary?.saldo ?? 0;
  const totalAReceber = summary?.totalAReceber ?? 0;
  const totalPago = summary?.totalPago ?? 0;
  const sessionCredits = summary?.totalSessionCredits ?? 0;

  const pendingCount = records.filter((r: any) => r.status === "pendente").length;

  const saldoColor = saldo > 0 ? "text-amber-700" : saldo < 0 ? "text-green-700" : "text-slate-700";
  const saldoBg = saldo > 0 ? "from-amber-50 to-yellow-50 border-amber-200" : saldo < 0 ? "from-green-50 to-emerald-50 border-green-200" : "from-slate-50 to-slate-100 border-slate-200";
  const saldoLabel = saldo > 0 ? "Cliente deve pagar" : saldo < 0 ? "Cliente tem crédito" : "Em dia";
  const saldoBadgeClass = saldo > 0 ? "bg-amber-100 text-amber-700" : saldo < 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800 truncate">Financeiro do Paciente</h3>
          <p className="text-xs sm:text-sm text-slate-500">{records.length} lançamento(s) · {pendingCount} pendente(s)</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex border border-slate-200 rounded-lg overflow-x-auto text-xs">
            <button onClick={() => setActiveSection("history")}
              className={`px-3 h-9 sm:h-8 whitespace-nowrap transition-colors ${activeSection === "history" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              Histórico
            </button>
            <button onClick={() => setActiveSection("subscriptions")}
              className={`px-3 h-9 sm:h-8 whitespace-nowrap border-l border-slate-200 transition-colors ${activeSection === "subscriptions" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              Assinaturas
            </button>
            <button onClick={() => setActiveSection("carteira")}
              className={`px-3 h-9 sm:h-8 whitespace-nowrap border-l border-slate-200 transition-colors flex items-center gap-1 ${activeSection === "carteira" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"}`}>
              <Wallet className="w-3 h-3 shrink-0" /> Carteira
            </button>
          </div>
          {activeSection === "history" && (
            <Button onClick={() => { setShowPayForm(!showPayForm); setPayForm(emptyPaymentForm); }}
              className="w-full sm:w-auto h-10 sm:h-8 px-3 rounded-xl text-xs gap-1.5" variant={showPayForm ? "outline" : "default"}>
              <Plus className="w-3.5 h-3.5 shrink-0" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-1">
                  <Button variant="outline" onClick={() => setShowPayForm(false)} className="w-full sm:w-auto h-10 rounded-xl">Cancelar</Button>
                  <Button onClick={handleRegisterPayment} disabled={saving} className="w-full sm:w-auto h-10 rounded-xl bg-green-600 hover:bg-green-700 gap-1.5">
                    {saving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    <CheckCircle className="w-4 h-4 shrink-0" /> Confirmar Pagamento
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
                  <p className={`text-xl sm:text-3xl font-extrabold break-words leading-tight ${saldoColor}`}>
                    {saldo < 0 ? "−" : ""}{formatCurrency(Math.abs(saldo))}
                  </p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${saldoBadgeClass}`}>
                    {saldo > 0 ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <CardContent className="py-10 px-6 sm:p-12 text-center text-slate-400">
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
                    <CardContent className="p-3.5">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${iconBg}`}>
                          {txInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm truncate ${isEstornado ? "text-slate-400" : "text-slate-800"}`}>{record.description}</p>
                            </div>
                            <p className={`text-sm font-bold text-right shrink-0 whitespace-nowrap ${amountColor}`}>
                              {isSessionType ? (Number(record.amount) === 0 ? "—" : formatCurrency(Number(record.amount))) : (isPayment ? "+" : "↑") + (Number(record.amount) === 0 ? "Crédito" : formatCurrency(Number(record.amount)))}
                            </p>
                            {canEstorno && (
                              <button
                                onClick={() => setEstornoTarget({ id: record.id, description: record.description, amount: Number(record.amount) })}
                                className="shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-400 lg:text-slate-300 hover:text-red-500 transition-all"
                                title="Estornar registro"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Estorno confirmation */}
          <Dialog open={!!estornoTarget} onOpenChange={v => { if (!v) { setEstornoTarget(null); setEstornoReason(""); } }}>
            <DialogContent className="border-none shadow-2xl rounded-3xl w-[calc(100vw-2rem)] sm:max-w-[460px]">
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
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">
                  Motivo do estorno <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  rows={3}
                  className="rounded-xl border-slate-200 focus:border-amber-400"
                  placeholder="Ex.: cobrança duplicada, paciente devolveu o serviço, erro de lançamento…"
                  value={estornoReason}
                  onChange={(e) => setEstornoReason(e.target.value)}
                />
                <p className="text-[11px] text-slate-400">
                  Será registrado no histórico de estornos para auditoria (mínimo 3 caracteres).
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" className="rounded-xl" onClick={() => { setEstornoTarget(null); setEstornoReason(""); }} disabled={estorning}>Cancelar</Button>
                <Button
                  className="rounded-xl bg-amber-600 hover:bg-amber-700"
                  onClick={handleEstorno}
                  disabled={estorning || estornoReason.trim().length < 3}
                >
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
