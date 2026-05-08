import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import {
  AlertTriangle, Loader2, CheckCircle2, RefreshCw, ArrowRight,
} from "lucide-react";
import { apiSendJson } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { PlanProcedureItem } from "../../types";

const DURATION_OPTIONS = [1, 2, 3, 6, 12, 18, 24, 36];

interface ItemOverride {
  planProcedureId: number;
  unitPrice?: number;
  unitMonthlyPrice?: number;
  discount?: number;
}

export interface RenegotiateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: number;
  patientId: number;
  planTitle?: string;
  currentDurationMonths?: number;
  currentStartDate?: string | null;
  currentMonthlyDueDay?: number | null;
  currentPaymentMode?: string | null;
  planItems: PlanProcedureItem[];
  /** Called with the new plan's ID when the renegotiation succeeds and the user clicks "Go to new plan". */
  onSuccess: (newPlanId: number) => void;
}

export function RenegotiateDialog({
  open, onOpenChange, planId, patientId, planTitle,
  currentDurationMonths, currentStartDate, currentMonthlyDueDay, currentPaymentMode,
  planItems, onSuccess,
}: RenegotiateDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ newPlanId: number } | null>(null);

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [durationMonths, setDurationMonths] = useState(currentDurationMonths ?? 12);
  const [startDate, setStartDate] = useState(currentStartDate ?? "");
  const [monthlyDueDay, setMonthlyDueDay] = useState<number | "">(currentMonthlyDueDay ?? "");
  const [paymentMode, setPaymentMode] = useState<string>(currentPaymentMode ?? "postpago");
  const [confirmed, setConfirmed] = useState(false);
  const [itemOverrides, setItemOverrides] = useState<Record<number, Partial<ItemOverride>>>({});

  const canSubmit = reason.trim().length >= 3 && confirmed && !busy;

  function resetForm() {
    setResult(null);
    setReason("");
    setNotes("");
    setConfirmed(false);
    setItemOverrides({});
    setDurationMonths(currentDurationMonths ?? 12);
    setStartDate(currentStartDate ?? "");
    setMonthlyDueDay(currentMonthlyDueDay ?? "");
    setPaymentMode(currentPaymentMode ?? "postpago");
  }

  function handleClose() {
    if (!busy) {
      onOpenChange(false);
      setTimeout(resetForm, 300);
    }
  }

  function setOverride(itemId: number, patch: Partial<Omit<ItemOverride, "planProcedureId">>) {
    setItemOverrides(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], planProcedureId: itemId, ...patch },
    }));
  }

  function clearUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as Partial<T>;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const rawOverrides = Object.values(itemOverrides).filter(o => o.planProcedureId !== undefined);
      const cleanOverrides: ItemOverride[] = rawOverrides.map(o => ({
        planProcedureId: o.planProcedureId!,
        ...clearUndefined({ unitPrice: o.unitPrice, unitMonthlyPrice: o.unitMonthlyPrice, discount: o.discount }),
      })).filter(o => Object.keys(o).length > 1);

      const body: Record<string, unknown> = {
        reason: reason.trim(),
        durationMonths,
        paymentMode,
        ...(notes.trim() ? { renegotiationNotes: notes.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(monthlyDueDay !== "" ? { monthlyDueDay: Number(monthlyDueDay) } : {}),
        ...(cleanOverrides.length > 0 ? { itemOverrides: cleanOverrides } : {}),
      };

      const res = await apiSendJson<{ next: { id: number } }>(
        `/api/patients/${patientId}/treatment-plans/${planId}/renegotiate`,
        "POST",
        body,
      );
      setResult({ newPlanId: res.next.id });
    } catch (err: any) {
      toast({ title: "Erro ao renegociar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4 text-primary" />
            Renegociar contrato
          </DialogTitle>
          <DialogDescription>
            {planTitle ?? `Plano #${planId}`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          /* ── Result screen ── */
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" /> Renegociação iniciada com sucesso
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                O contrato anterior foi cancelado formalmente. Faturas futuras foram estornadas
                e agendamentos vinculados foram cancelados automaticamente.
              </p>
              <p className="text-xs font-semibold text-emerald-800 mt-1">
                Novo plano: <span className="font-bold">#{result.newPlanId}</span> — aguardando
                revisão e aceite do paciente.
              </p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
              <p className="text-[11px] text-sky-800 leading-snug">
                O novo plano referencia o contrato anterior (auditoria disponível no histórico).
                Configure os itens, ajuste a agenda e colete o aceite do paciente para
                iniciar o novo ciclo.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={handleClose} className="rounded-xl">
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={() => { onSuccess(result.newPlanId); handleClose(); }}
                className="gap-1.5 rounded-xl"
              >
                Ir para novo plano <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          /* ── Form screen ── */
          <div className="space-y-5 py-2">

            {/* Warning */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> O que acontece ao renegociar
              </div>
              <ul className="text-xs text-amber-800/90 space-y-1 pl-1">
                <li>• O contrato atual é <strong>cancelado formalmente</strong> com motivo e trilha de auditoria.</li>
                <li>• Faturas futuras não pagas são estornadas automaticamente.</li>
                <li>• Agendamentos futuros vinculados ao plano são cancelados automaticamente.</li>
                <li>• Um novo plano rascunho é criado referenciando o contrato anterior.</li>
                <li>• O novo plano precisa ser ajustado, aceito e iniciado pelo paciente.</li>
              </ul>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Motivo da renegociação <span className="text-rose-500">*</span>
              </Label>
              <textarea
                className="w-full min-h-[72px] px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
                placeholder="Ex.: reajuste de preço acordado, mudança de frequência semanal, alteração de duração..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={500}
              />
              <p className="text-[11px] text-slate-400 text-right">{reason.length}/500</p>
            </div>

            {/* New terms */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Novos termos do contrato</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Duração</Label>
                  <select
                    className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:border-primary outline-none"
                    value={durationMonths}
                    onChange={e => setDurationMonths(Number(e.target.value))}
                  >
                    {DURATION_OPTIONS.map(m => (
                      <option key={m} value={m}>{m} {m === 1 ? "mês" : "meses"}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Início do novo plano</Label>
                  <DatePickerPTBR
                    value={startDate}
                    onChange={(v) => setStartDate(v)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Vencimento mensal (dia 1–28)</Label>
                  <input
                    type="number"
                    min={1} max={28}
                    className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:border-primary outline-none"
                    placeholder="ex.: 10"
                    value={monthlyDueDay}
                    onChange={e => setMonthlyDueDay(
                      e.target.value === "" ? "" : Math.min(28, Math.max(1, Number(e.target.value)))
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Modo de pagamento</Label>
                  <select
                    className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:border-primary outline-none"
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value)}
                  >
                    <option value="postpago">Pós-pago (créditos imediatos)</option>
                    <option value="prepago">Pré-pago (créditos após pagamento)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Item price overrides */}
            {planItems.length > 0 && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Revisão de preços por item</p>
                  <p className="text-xs text-slate-500">Deixe em branco para manter o preço atual.</p>
                </div>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Procedimento</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Preço atual</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Novo preço</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Desconto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planItems.map((item) => {
                        const isMonthly = item.packageType === "mensal";
                        const currentPrice = isMonthly
                          ? Number(item.unitMonthlyPrice ?? item.monthlyPrice ?? 0)
                          : Number(item.unitPrice ?? item.price ?? 0);
                        const currentDiscount = Number(item.discount ?? 0);
                        const override = itemOverrides[item.id] ?? {};

                        return (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 text-slate-700 font-medium">
                              {item.procedureName ?? item.packageName ?? `Item ${item.id}`}
                              <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                                {isMonthly ? "mensal" : "avulso"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              R$ {currentPrice.toFixed(2)}
                              {currentDiscount > 0 && (
                                <span className="block text-[10px] text-slate-400">
                                  desc. {currentDiscount.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-24 h-7 px-2 text-right text-xs rounded border border-slate-200 focus:border-primary outline-none"
                                placeholder={currentPrice.toFixed(2)}
                                value={isMonthly
                                  ? (override.unitMonthlyPrice ?? "")
                                  : (override.unitPrice ?? "")}
                                onChange={e => {
                                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                                  setOverride(item.id, isMonthly ? { unitMonthlyPrice: val } : { unitPrice: val });
                                }}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-20 h-7 px-2 text-right text-xs rounded border border-slate-200 focus:border-primary outline-none"
                                placeholder={currentDiscount.toFixed(2)}
                                value={override.discount ?? ""}
                                onChange={e => {
                                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                                  setOverride(item.id, { discount: val });
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Internal notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Observações internas (opcional)</Label>
              <textarea
                className="w-full min-h-[56px] px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
                placeholder="Contexto interno da renegociação — não fica visível ao paciente"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                maxLength={1000}
              />
            </div>

            {/* Confirmation */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
              />
              <span className="text-xs text-slate-700 leading-snug">
                Confirmo que o plano atual será <strong>cancelado formalmente</strong> e que um
                novo rascunho de contrato será criado com os termos acima. O paciente precisará
                revisar e aceitar o novo contrato.
              </span>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm" variant="outline"
                onClick={handleClose}
                disabled={busy}
                className="rounded-xl"
              >
                Voltar
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="gap-1.5 rounded-xl"
              >
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> Confirmar renegociação</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
