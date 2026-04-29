import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import {
  Receipt, CheckCircle, Clock, AlertTriangle, XCircle,
  Loader2, Wallet, ChevronRight, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/toast";

type Installment = {
  id: number;
  description: string;
  amount: string | number;
  status: "pendente" | "pago" | "atrasado" | "cancelado" | "estornado" | string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  transactionType: string | null;
  planMonthRef: string | null;
  treatmentPlanProcedureId: number | null;
};

interface Props {
  patientId: number;
  planId: number;
  isAccepted: boolean;
  isMaterialized: boolean;
}

const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "debito", label: "Cartão de débito" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
];

function fmtBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? s + "T00:00:00" : s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function statusMeta(rec: Installment) {
  const today = todayISO();
  const isOverdue =
    rec.status === "pendente" &&
    rec.dueDate &&
    rec.dueDate < today;

  if (rec.status === "pago") {
    return {
      label: "Pago",
      icon: CheckCircle,
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    };
  }
  if (rec.status === "cancelado" || rec.status === "estornado") {
    return {
      label: rec.status === "cancelado" ? "Cancelado" : "Estornado",
      icon: XCircle,
      cls: "bg-slate-100 text-slate-500 border-slate-200",
      dot: "bg-slate-400",
    };
  }
  if (isOverdue) {
    return {
      label: "Atrasado",
      icon: AlertTriangle,
      cls: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    };
  }
  return {
    label: "Pendente",
    icon: Clock,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  };
}

export function PlanInstallmentsPanel({ patientId, planId, isAccepted, isMaterialized }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState<Installment | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<string>("pix");
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const installmentsKey = [`/api/treatment-plans/${planId}/installments`];

  const { data, isLoading, isError, refetch } = useQuery<{
    items: Installment[];
    summary: {
      total: number;
      paid: number;
      pending: number;
      overdue: number;
      countTotal: number;
      countPaid: number;
      countPending: number;
      countOverdue: number;
    };
  }>({
    queryKey: installmentsKey,
    queryFn: () =>
      apiFetchJson(`/api/treatment-plans/${planId}/installments`),
    enabled: !!planId,
  });

  const items = data?.items ?? [];
  const summary = data?.summary;

  const grouped = useMemo(() => {
    const map = new Map<string, Installment[]>();
    for (const it of items) {
      const key = it.planMonthRef
        ? new Date(it.planMonthRef + "T00:00:00").toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })
        : it.dueDate
        ? new Date(it.dueDate + "T00:00:00").toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })
        : "Sem competência";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  async function recalcDueDates() {
    if (recalcBusy) return;
    setRecalcBusy(true);
    try {
      const result = await apiSendJson<{
        updated: number;
        alreadyCorrect: number;
        skippedPaid: number;
        skippedNoRef: number;
        total: number;
      }>(`/api/treatment-plans/${planId}/installments/recalc-due-dates`, "POST", {});

      if (result.updated > 0) {
        toast({
          title: "Vencimentos recalculados!",
          description: `${result.updated} parcela${result.updated === 1 ? "" : "s"} corrigida${result.updated === 1 ? "" : "s"}` +
            (result.skippedPaid > 0 ? ` (${result.skippedPaid} já paga${result.skippedPaid === 1 ? "" : "s"} preservada${result.skippedPaid === 1 ? "" : "s"})` : "") +
            ".",
        });
      } else {
        toast({
          title: "Nada para corrigir",
          description: `Todas as ${result.alreadyCorrect} parcela${result.alreadyCorrect === 1 ? "" : "s"} já estão com vencimento correto.`,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: installmentsKey }),
        queryClient.invalidateQueries({
          queryKey: [`/api/patients/${patientId}/financial-records`],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/financial/records"] }),
      ]);
    } catch (err: any) {
      toast({
        title: "Erro ao recalcular vencimentos",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRecalcBusy(false);
    }
  }

  async function confirmPayment() {
    if (!payOpen) return;
    setBusy(true);
    try {
      await apiSendJson(`/api/financial/records/${payOpen.id}/status`, "PATCH", {
        status: "pago",
        paymentDate: payDate,
        paymentMethod: payMethod,
      });
      toast({
        title: "Baixa registrada!",
        description: `Parcela #${payOpen.id} marcada como paga em ${fmtDate(payDate)}.`,
      });
      setPayOpen(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: installmentsKey }),
        queryClient.invalidateQueries({
          queryKey: [`/api/patients/${patientId}/financial-records`],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/financial/records"] }),
      ]);
    } catch (err: any) {
      toast({
        title: "Erro ao dar baixa",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando parcelas...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
        <p className="text-sm text-rose-700">
          Não foi possível carregar as parcelas deste plano.
        </p>
        <Button
          size="sm" variant="outline" className="mt-2 h-8" onClick={() => refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!isAccepted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Wallet className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-600">Parcelas do plano</h4>
        </div>
        <p className="text-xs text-slate-500">
          As parcelas aparecerão aqui após o <strong>aceite</strong> do plano e a geração
          das faturas (materialização). Aceite o plano na aba <em>Aceite</em> para começar.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Wallet className="w-4 h-4 text-amber-700" />
          <h4 className="text-sm font-semibold text-amber-900">Sem parcelas geradas</h4>
        </div>
        <p className="text-xs text-amber-800">
          Plano aceito mas {isMaterialized ? "" : "ainda não materializado — "}
          nenhuma parcela foi encontrada. {isMaterialized
            ? "Verifique se há itens recorrentes (pacote mensal) configurados."
            : "Use Materializar plano na aba Aceite para gerar a agenda e as faturas."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-white p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-slate-700">Parcelas do plano</h4>
          <span className="text-[11px] text-slate-400">
            ({summary?.countTotal ?? items.length} no total)
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1.5 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50 text-xs"
            onClick={recalcDueDates}
            disabled={recalcBusy}
            title="Recalcula a data de vencimento das parcelas pendentes respeitando a vigência do plano e o dia de cobrança. Parcelas já pagas não são alteradas."
          >
            {recalcBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Recalcular vencimentos
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <SummaryCard
              label="Valor total"
              value={fmtBRL(summary.total)}
              count={summary.countTotal}
              dotCls="bg-slate-400"
            />
            <SummaryCard
              label="Pago"
              value={fmtBRL(summary.paid)}
              count={summary.countPaid}
              dotCls="bg-emerald-500"
              cls="border-emerald-100 bg-emerald-50/40"
            />
            <SummaryCard
              label="Em aberto"
              value={fmtBRL(summary.pending - summary.overdue)}
              count={summary.countPending - summary.countOverdue}
              dotCls="bg-amber-500"
              cls="border-amber-100 bg-amber-50/40"
            />
            <SummaryCard
              label="Atrasado"
              value={fmtBRL(summary.overdue)}
              count={summary.countOverdue}
              dotCls="bg-rose-500"
              cls="border-rose-100 bg-rose-50/40"
            />
          </div>
        )}

        <div className="space-y-3">
          {grouped.map(([month, monthItems]) => (
            <div key={month}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                {month}
              </div>
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {monthItems.map((it) => {
                  const meta = statusMeta(it);
                  const Icon = meta.icon;
                  const canPay =
                    it.status !== "pago" && it.status !== "cancelado" && it.status !== "estornado";
                  return (
                    <li
                      key={it.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 transition"
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {it.description}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 px-1.5 font-medium ${meta.cls} flex items-center gap-1`}
                          >
                            <Icon className="w-2.5 h-2.5" /> {meta.label}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Vence {fmtDate(it.dueDate)}
                          {it.paymentDate && (
                            <span className="ml-2 text-emerald-600">
                              • Pago em {fmtDate(it.paymentDate)}
                              {it.paymentMethod ? ` (${it.paymentMethod})` : ""}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-slate-700 shrink-0">
                        {fmtBRL(it.amount)}
                      </div>
                      {canPay ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-8 gap-1 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs shrink-0"
                          onClick={() => {
                            setPayOpen(it);
                            setPayDate(todayISO());
                            setPayMethod(it.paymentMethod ?? "pix");
                          }}
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Dar baixa
                        </Button>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 border-t border-slate-100 pt-2">
          <FileText className="w-3 h-3" />
          As baixas registradas aqui também aparecem no módulo financeiro e atualizam a
          contabilidade automaticamente.
        </div>
      </div>

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" /> Dar baixa na parcela
            </DialogTitle>
            <DialogDescription>
              {payOpen?.description} — {payOpen ? fmtBRL(payOpen.amount) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data do pagamento</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                max={todayISO()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-slate-500">
              Esta operação registra o pagamento, lança a baixa contábil e gera o recibo no
              financeiro. Não pode ser desfeita pela aba do plano (use o módulo financeiro
              para estornos).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={confirmPayment} disabled={busy || !payDate}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({
  label, value, count, cls, dotCls,
}: {
  label: string;
  value: string;
  count: number;
  cls?: string;
  dotCls: string;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${cls ?? "border-slate-200 bg-slate-50/40"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400">
        {count} parcela{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}
