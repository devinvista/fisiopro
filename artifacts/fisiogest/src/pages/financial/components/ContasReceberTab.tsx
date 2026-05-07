import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronRight,
  User, Loader2, CreditCard, Wallet, Banknote, Smartphone,
  ClipboardCheck, TrendingUp, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch, apiFetchJson } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatCurrency } from "../utils";
import { KpiCard } from "./KpiCard";

// ── Types ────────────────────────────────────────────────────────────────────

type Aging = "vencido" | "hoje" | "a_vencer" | "sem_vencimento";

interface Receivable {
  id: number;
  description: string;
  amount: number;
  dueDate: string | null;
  aging: Aging;
  transactionType: string | null;
  category: string | null;
  patientId: number | null;
  patientName: string | null;
  procedureName: string | null;
  treatmentPlanId: number | null;
  planMonthRef: string | null;
}

interface ReceivablesResponse {
  items: Receivable[];
  summary: {
    totalAmount: number;
    overdueAmount: number;
    todayAmount: number;
    upcomingAmount: number;
    totalCount: number;
    overdueCount: number;
  };
}

interface PatientGroup {
  patientId: number | null;
  patientName: string;
  total: number;
  overdueTotal: number;
  items: Receivable[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "dinheiro",        label: "Dinheiro",        icon: <Banknote className="w-3.5 h-3.5" /> },
  { value: "pix",             label: "Pix",             icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: "cartao_credito",  label: "Cartão Crédito",  icon: <CreditCard className="w-3.5 h-3.5" /> },
  { value: "cartao_debito",   label: "Cartão Débito",   icon: <CreditCard className="w-3.5 h-3.5" /> },
  { value: "transferencia",   label: "Transferência",   icon: <Wallet className="w-3.5 h-3.5" /> },
  { value: "boleto",          label: "Boleto",          icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
];

// ── Aging badge ───────────────────────────────────────────────────────────────

function AgingBadge({ aging, dueDate }: { aging: Aging; dueDate: string | null }) {
  if (aging === "vencido") {
    const days = dueDate
      ? Math.floor((Date.now() - new Date(dueDate + "T00:00:00").getTime()) / 86_400_000)
      : 0;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">
        <AlertCircle className="w-2.5 h-2.5" />
        Vencido {days > 0 ? `há ${days}d` : ""}
      </span>
    );
  }
  if (aging === "hoje") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-100 rounded-full px-2 py-0.5">
        <Clock className="w-2.5 h-2.5" />
        Vence hoje
      </span>
    );
  }
  if (aging === "a_vencer") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5">
        <CheckCircle2 className="w-2.5 h-2.5" />
        A vencer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-slate-50 text-slate-400 border border-slate-100 rounded-full px-2 py-0.5">
      Sem venc.
    </span>
  );
}

function formatDueDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ── Baixar Dialog ─────────────────────────────────────────────────────────────

function BaixarDialog({
  record,
  open,
  onClose,
  onSuccess,
}: {
  record: Receivable;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paidAmount, setPaidAmount] = useState<string>(record.amount.toFixed(2));
  const { toast } = useToast();

  const isPartial =
    parseFloat(paidAmount) > 0 && parseFloat(paidAmount) < record.amount - 0.005;

  const mutation = useMutation({
    mutationFn: async () => {
      const paid = parseFloat(paidAmount);
      const body: Record<string, unknown> = {
        status: "pago",
        paymentDate,
        paymentMethod,
      };
      if (isPartial) body.paidAmount = paid;

      const res = await apiFetch(`/api/financial/records/${record.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Erro ao baixar parcela");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Parcela baixada!", description: isPartial ? "Parcela parcialmente quitada." : "Parcela quitada com sucesso." });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Baixar parcela</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {record.description}
            {record.patientName && <> — <span className="font-medium text-slate-700">{record.patientName}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm text-slate-500">Valor original</span>
            <span className="text-base font-bold text-slate-900">{formatCurrency(record.amount)}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Valor pago</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={record.amount}
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="font-mono text-base"
            />
            {isPartial && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Baixa parcial — restante ({formatCurrency(record.amount - parseFloat(paidAmount))}) ficará pendente
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="flex items-center gap-2">{m.icon} {m.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Data do pagamento</Label>
            <Input
              type="date"
              value={paymentDate}
              max={today}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || parseFloat(paidAmount) <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Patient Group Card ────────────────────────────────────────────────────────

function PatientGroupCard({
  group,
  onBaixar,
}: {
  group: PatientGroup;
  onBaixar: (r: Receivable) => void;
}) {
  const [expanded, setExpanded] = useState(group.overdueTotal > 0 || group.items.length <= 3);
  const hasOverdue = group.overdueTotal > 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${hasOverdue ? "border-red-100" : "border-slate-100"}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${hasOverdue ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-400"}`}>
          <User className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{group.patientName}</p>
          <p className="text-xs text-slate-400">{group.items.length} parcela{group.items.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-slate-900">{formatCurrency(group.total)}</p>
          {hasOverdue && (
            <p className="text-xs font-semibold text-red-500">{formatCurrency(group.overdueTotal)} vencido</p>
          )}
        </div>
        <div className="ml-1 text-slate-400 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {group.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <AgingBadge aging={item.aging} dueDate={item.dueDate} />
                  {item.planMonthRef && (
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                      Ref. {item.planMonthRef}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 truncate max-w-xs">{item.description}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.procedureName && <><span>{item.procedureName}</span> · </>}
                  Venc. {formatDueDate(item.dueDate)}
                </p>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className={`text-sm font-bold tabular-nums ${item.aging === "vencido" ? "text-red-600" : item.aging === "hoje" ? "text-amber-600" : "text-slate-900"}`}>
                  {formatCurrency(item.amount)}
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shrink-0"
                onClick={() => onBaixar(item)}
              >
                <CheckCircle2 className="w-3 h-3" />
                Baixar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function ContasReceberTab() {
  const qc = useQueryClient();
  const [selectedRecord, setSelectedRecord] = useState<Receivable | null>(null);
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState<Aging | "todos">("todos");

  const { data, isLoading, error } = useQuery<ReceivablesResponse>({
    queryKey: ["receivables"],
    queryFn: () => apiFetchJson("/api/financial/receivables"),
    staleTime: 30_000,
  });

  const groups = useMemo<PatientGroup[]>(() => {
    if (!data) return [];
    let items = data.items;

    if (agingFilter !== "todos") items = items.filter((i) => i.aging === agingFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          (i.patientName ?? "").toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (i.procedureName ?? "").toLowerCase().includes(q),
      );
    }

    const map = new Map<string, PatientGroup>();
    for (const item of items) {
      const key = String(item.patientId ?? "sem_paciente");
      if (!map.has(key)) {
        map.set(key, {
          patientId: item.patientId,
          patientName: item.patientName ?? "Sem paciente",
          total: 0,
          overdueTotal: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.total += item.amount;
      if (item.aging === "vencido") g.overdueTotal += item.amount;
      g.items.push(item);
    }

    return Array.from(map.values()).sort((a, b) => b.overdueTotal - a.overdueTotal || b.total - a.total);
  }, [data, search, agingFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando contas a receber…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 gap-2">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Erro ao carregar contas a receber</span>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total a Receber"
          value={formatCurrency(s?.totalAmount ?? 0)}
          icon={<TrendingUp className="w-4 h-4" />}
          accentColor="#6366f1"
          sub={`${s?.totalCount ?? 0} parcela${s?.totalCount !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Vencido"
          value={formatCurrency(s?.overdueAmount ?? 0)}
          icon={<AlertCircle className="w-4 h-4" />}
          accentColor="#ef4444"
          sub={`${s?.overdueCount ?? 0} parcela${s?.overdueCount !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Vence Hoje"
          value={formatCurrency(s?.todayAmount ?? 0)}
          icon={<Clock className="w-4 h-4" />}
          accentColor="#f59e0b"
        />
        <KpiCard
          label="A Vencer"
          value={formatCurrency(s?.upcomingAmount ?? 0)}
          icon={<CheckCircle2 className="w-4 h-4" />}
          accentColor="#10b981"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar por paciente, descrição ou procedimento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {(["todos", "vencido", "hoje", "a_vencer"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setAgingFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                agingFilter === f
                  ? f === "vencido"
                    ? "bg-red-500 text-white"
                    : f === "hoje"
                    ? "bg-amber-500 text-white"
                    : f === "a_vencer"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-800 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f === "todos" ? "Todos" : f === "vencido" ? "Vencidos" : f === "hoje" ? "Hoje" : "A Vencer"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Patient Groups ── */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-300" />
          <p className="text-sm font-medium text-slate-500">
            {search || agingFilter !== "todos"
              ? "Nenhuma parcela encontrada para os filtros selecionados"
              : "Nenhuma conta a receber pendente — tudo em dia!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {groups.length} paciente{groups.length !== 1 ? "s" : ""} com pendências
          </p>
          {groups.map((g) => (
            <PatientGroupCard
              key={String(g.patientId)}
              group={g}
              onBaixar={setSelectedRecord}
            />
          ))}
        </div>
      )}

      {/* ── Baixar Dialog ── */}
      {selectedRecord && (
        <BaixarDialog
          record={selectedRecord}
          open={true}
          onClose={() => setSelectedRecord(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["receivables"] })}
        />
      )}
    </div>
  );
}
