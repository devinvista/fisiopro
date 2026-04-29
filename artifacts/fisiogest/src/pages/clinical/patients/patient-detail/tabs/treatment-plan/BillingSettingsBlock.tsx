import { CalendarDays, CreditCard, Hourglass } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  form: any;
  setForm: (fn: (prev: any) => any) => void;
  isAccepted: boolean;
}

/**
 * Configurações de cobrança — agora organizadas em 3 grupos visuais:
 *   1. Como cobrar (modo de pagamento + modo dos avulsos)
 *   2. Vencimentos (dia da fatura mensal de avulsos)
 *   3. Validade dos créditos (mensal / reposição)
 *
 * Após o aceite, paymentMode trava (já é cláusula contratual).
 */
export function BillingSettingsBlock({ form, setForm, isAccepted }: Props) {
  const lockMode = isAccepted;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-amber-700" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">Configurações de cobrança</h4>
          <p className="text-[11px] text-slate-500">Como e quando o paciente paga</p>
        </div>
      </div>

      {/* Grupo 1 — Como cobrar */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Como cobrar
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Modo de pagamento (mensalidades)</Label>
            <Select
              value={form.paymentMode || "_default"}
              onValueChange={(v) =>
                setForm((p: any) => ({ ...p, paymentMode: v === "_default" ? "" : v }))
              }
              disabled={lockMode}
            >
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_default">Padrão do pacote</SelectItem>
                <SelectItem value="prepago">Pré-pago — cobrar no início do mês</SelectItem>
                <SelectItem value="postpago">Pós-pago — cobrar após o uso</SelectItem>
              </SelectContent>
            </Select>
            {lockMode && (
              <p className="text-[11px] text-slate-400">
                Já aceito — mudanças só por renegociação (novo plano).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Avulsos / pagos por sessão</Label>
            <Select
              value={form.avulsoBillingMode || "porSessao"}
              onValueChange={(v: "porSessao" | "mensalConsolidado") =>
                setForm((p: any) => ({ ...p, avulsoBillingMode: v }))
              }
            >
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="porSessao">Por sessão (uma fatura por consulta)</SelectItem>
                <SelectItem value="mensalConsolidado">Mensal consolidado (uma fatura/mês)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Grupo 2 — Vencimento */}
      {form.avulsoBillingMode === "mensalConsolidado" && (
        <div className="space-y-3 rounded-xl bg-slate-50/60 border border-slate-100 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" /> Vencimento
          </p>
          <div className="space-y-1.5 max-w-[200px]">
            <Label className="text-xs text-slate-600">
              Dia do vencimento da fatura mensal
            </Label>
            <Input
              type="number" min="1" max="28"
              placeholder="Ex: 10"
              value={form.avulsoBillingDay}
              onChange={(e) =>
                setForm((p: any) => ({ ...p, avulsoBillingDay: e.target.value }))
              }
              className="h-10 bg-white"
            />
            <p className="text-[11px] text-slate-500">Dia do mês (1 a 28).</p>
          </div>
        </div>
      )}

      {/* Grupo 3 — Validade dos créditos */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
          <Hourglass className="w-3 h-3" /> Validade dos créditos
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">
              Crédito mensal (dias após o fim do mês)
            </Label>
            <Input
              type="number" min="0" max="365"
              placeholder="Padrão da clínica"
              value={form.monthlyCreditValidityDays}
              onChange={(e) =>
                setForm((p: any) => ({ ...p, monthlyCreditValidityDays: e.target.value }))
              }
              className="h-10 bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">
              Crédito de reposição (dias)
            </Label>
            <Input
              type="number" min="1" max="365"
              placeholder="Padrão da clínica"
              value={form.replacementCreditValidityDays}
              onChange={(e) =>
                setForm((p: any) => ({ ...p, replacementCreditValidityDays: e.target.value }))
              }
              className="h-10 bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
