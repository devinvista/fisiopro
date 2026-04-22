import { fetchJSON, ClinicBasic } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentBadge, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard,
  Package,
  CreditCard,
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Activity,
  Infinity,
  Sparkles,
  Zap,
  Crown,
  Search,
  Filter,
  Check,
  RefreshCw,
  ChevronDown,
  BadgeDollarSign,
  Users,
  BarChart3,
  Receipt,
  DollarSign,
  CalendarDays,
  Banknote,
  Tag,
  Link2,
  Copy,
  CheckCircle2,
  Percent,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiFetch } from "@/utils/api";

// ─── Payments Tab ─────────────────────────────────────────────────────────────




export function PaymentsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<PaymentRow[]>({
    queryKey: ["payment-history"],
    queryFn: () => fetchJSON(api("/payment-history")),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<PaymentStats>({
    queryKey: ["payment-history-stats"],
    queryFn: () => fetchJSON(api("/payment-history/stats")),
  });

  const { data: subs = [] } = useQuery<SubRow[]>({
    queryKey: ["clinic-subscriptions"],
    queryFn: () => fetchJSON(api("/clinic-subscriptions")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(api(`/payment-history/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover pagamento");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-history"] });
      qc.invalidateQueries({ queryKey: ["payment-history-stats"] });
      toast({ title: "Pagamento removido" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (r) =>
        r.clinic?.name?.toLowerCase().includes(q) ||
        r.clinic?.email?.toLowerCase().includes(q) ||
        r.payment.referenceMonth?.includes(q) ||
        r.payment.method?.includes(q)
    );
  }, [payments, search]);

  const fmtBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (d: string) =>
    format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const fmtMonth = (m: string | null) => {
    if (!m) return "—";
    const [year, month] = m.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Histórico de Pagamentos</h2>
          <p className="text-sm text-slate-500 mt-0.5">Todos os pagamentos recebidos das clínicas</p>
        </div>
        <Button
          onClick={() => setShowDialog(true)}
          size="sm"
          className="rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar Pagamento
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))
        ) : (
          <>
            <KpiCard
              label="Recebido Este Mês"
              value={fmtBRL(stats?.totalThisMonth ?? 0)}
              icon={DollarSign}
              color="#10b981"
            />
            <KpiCard
              label="Total Histórico"
              value={fmtBRL(stats?.totalAllTime ?? 0)}
              icon={TrendingUp}
              color="#6366f1"
            />
            <KpiCard
              label="Pagamentos Registrados"
              value={stats?.totalPayments ?? 0}
              icon={Receipt}
              color="#0ea5e9"
            />
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por clínica, método ou mês..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl border-slate-200"
        />
      </div>

      {/* Table */}
      {paymentsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-500">Nenhum pagamento registrado</p>
          <p className="text-sm mt-1">Clique em "Registrar Pagamento" para começar.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Clínica</TableHead>
                <TableHead className="font-semibold text-slate-700">Plano</TableHead>
                <TableHead className="font-semibold text-slate-700">Mês Ref.</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Valor</TableHead>
                <TableHead className="font-semibold text-slate-700">Método</TableHead>
                <TableHead className="font-semibold text-slate-700">Data Pagamento</TableHead>
                <TableHead className="font-semibold text-slate-700">Registrado por</TableHead>
                <TableHead className="font-semibold text-slate-700">Obs.</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.payment.id} className="hover:bg-slate-50/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{row.clinic?.name ?? `#${row.payment.clinicId}`}</p>
                      <p className="text-xs text-slate-400">{row.clinic?.email ?? ""}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{row.plan?.displayName ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{fmtMonth(row.payment.referenceMonth)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold text-emerald-700 text-sm">
                      {fmtBRL(Number(row.payment.amount))}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                      {PAYMENT_METHOD_LABELS[row.payment.method] ?? row.payment.method}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{fmtDate(row.payment.paidAt)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-500">{row.recorder?.name ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-400 max-w-[120px] truncate block" title={row.payment.notes ?? ""}>
                      {row.payment.notes || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg h-7 w-7 p-0"
                      onClick={() => setDeleteId(row.payment.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">
              {filtered.length} de {payments.length} pagamentos
            </p>
          </div>
        </div>
      )}

      {/* Register Payment Dialog */}
      <RegisterPaymentDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        subs={subs}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["payment-history"] });
          qc.invalidateQueries({ queryKey: ["payment-history-stats"] });
          qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
        }}
      />

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Este registro será removido permanentemente do histórico de pagamentos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="rounded-xl"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Register Payment Dialog ───────────────────────────────────────────────────

