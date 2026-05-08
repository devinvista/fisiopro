import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, Loader2, XCircle, Info, CheckCircle2, ReceiptText,
} from "lucide-react";
import { apiSendJson } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface CancelPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: number;
  patientId: number;
  planTitle?: string;
  onSuccess: () => void;
}

interface CancelResult {
  invoicesCancelled: number;
  reversalsPosted: number;
  paidInvoicesSkipped: number;
  paidInvoiceIds: number[];
  partiallyConsumedInvoiceIds: number[];
  recalculatedAppointments: number;
  priceDifferenceTotal: string;
  reason: string;
}

export function CancelPlanDialog({
  open,
  onOpenChange,
  planId,
  planTitle,
  onSuccess,
}: CancelPlanDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [recalculate, setRecalculate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CancelResult | null>(null);

  const canSubmit = reason.trim().length >= 3;

  function handleClose() {
    if (busy) return;
    onOpenChange(false);
    setTimeout(() => {
      setReason("");
      setRecalculate(false);
      setResult(null);
    }, 300);
  }

  async function handleCancel() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const res = await apiSendJson<CancelResult>(
        `/api/treatment-plans/${planId}/cancel`,
        "POST",
        { reason: reason.trim(), recalculate },
      );
      setResult(res);
      onSuccess();
    } catch (err: any) {
      toast({
        title: "Não foi possível cancelar o plano",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <XCircle className="w-5 h-5" />
            Cancelar plano de tratamento
          </DialogTitle>
          <DialogDescription>
            {planTitle ? `"${planTitle}" — ` : ""}
            O cancelamento é irreversível e gera trilha de auditoria LGPD.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          /* ── Result screen ── */
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" /> Plano cancelado com sucesso
              </div>
              <ul className="text-xs text-slate-700 space-y-1 pl-1">
                <li className="flex items-center gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {result.invoicesCancelled} fatura(s) cancelada(s) e estornada(s).
                </li>
                {result.recalculatedAppointments > 0 && (
                  <li className="flex items-center gap-1.5">
                    <ReceiptText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {result.recalculatedAppointments} sessão(ões) com diferença de preço cobrada —
                    total: R$ {result.priceDifferenceTotal}.
                  </li>
                )}
              </ul>
            </div>

            {result.paidInvoiceIds.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {result.paidInvoiceIds.length} fatura(s) já paga(s) — ressarcimento manual
                </div>
                <p className="text-[11px] text-amber-800 leading-snug">
                  As faturas #{result.paidInvoiceIds.join(", ")} já estavam pagas e ficaram fora do
                  estorno automático. Realize o ressarcimento ao paciente manualmente pelo módulo
                  financeiro.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose} className="rounded-xl">
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          /* ── Form screen ── */
          <div className="space-y-4 py-2">
            {/* Warning */}
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> O que acontece ao cancelar
              </div>
              <ul className="text-xs text-rose-800/90 space-y-1 pl-1">
                <li>• Faturas mensais futuras não pagas são estornadas automaticamente.</li>
                <li>• Faturas já pagas ficam para ressarcimento manual.</li>
                <li>• Agendamentos futuros <strong>não</strong> são cancelados automaticamente — faça isso na agenda.</li>
                <li>• O motivo e o timestamp ficam gravados na trilha de auditoria (LGPD).</li>
              </ul>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason" className="text-sm font-medium">
                Motivo do cancelamento <span className="text-rose-500">*</span>
              </Label>
              <textarea
                id="cancel-reason"
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none resize-none"
                placeholder="Ex.: Paciente solicitou encerramento por motivos financeiros. Cláusula 3.2 aplicada."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                disabled={busy}
              />
              <p className="text-[11px] text-slate-400 text-right">{reason.length}/500</p>
            </div>

            {/* Recalculate option */}
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 accent-rose-600"
                checked={recalculate}
                onChange={(e) => setRecalculate(e.target.checked)}
                disabled={busy}
              />
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block">
                  Cobrar diferença de preço diferenciado
                </span>
                <span className="text-[11px] text-slate-500 leading-snug block">
                  Se a cláusula PRECO_DIFERENCIADO foi aceita, gera faturas pela diferença entre
                  preço de tabela e preço negociado para cada sessão já consumida.
                </span>
              </div>
            </label>

            {/* Info */}
            <div className="flex items-start gap-2 text-[11px] text-slate-500 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span>
                Para encerrar o contrato e manter o vínculo comercial, use{" "}
                <strong>Renegociar plano</strong> em vez de cancelar — isso cria uma nova versão
                versionada preservando o histórico.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={busy} className="rounded-xl">
                Voltar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 rounded-xl"
                disabled={!canSubmit || busy}
                onClick={handleCancel}
              >
                {busy
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <XCircle className="w-3.5 h-3.5" />}
                Confirmar cancelamento
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
