import { fetchJSON, ClinicBasic } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { CouponsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
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

// ─── Clinics Tab ──────────────────────────────────────────────────────────────

type ClinicRow = {
  clinic: { id: number; name: string; email: string | null; phone: string | null; cnpj: string | null; isActive: boolean; createdAt: string };
  sub: { id: number; status: string; paymentStatus: string; trialEndDate: string | null; currentPeriodEnd: string | null; amount: string | null } | null;
  plan: { id: number; name: string; displayName: string; price: string } | null;
};

export function ClinicsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [checkResult, setCheckResult] = useState<null | {
    trialsExpired: number; renewed: number; markedOverdue: number; suspended: number; errors: number;
  }>(null);

  const { data: rows = [], isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["admin-clinics"],
    queryFn: () => fetchJSON(api("/admin/clinics")),
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(api("/clinic-subscriptions/run-check"), { method: "POST" });
      if (!res.ok) throw new Error("Falha na verificação");
      return res.json();
    },
    onSuccess: (data) => {
      setCheckResult(data);
      qc.invalidateQueries({ queryKey: ["admin-clinics"] });
      qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
      toast({
        title: "Verificação concluída",
        description: `${data.trialsExpired} trials expirados, ${data.renewed ?? 0} períodos renovados, ${data.markedOverdue} inadimplentes, ${data.suspended} suspensas.`,
      });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.clinic.name.toLowerCase().includes(s) ||
        (r.clinic.email ?? "").toLowerCase().includes(s) ||
        (r.clinic.cnpj ?? "").includes(s)
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Clínicas Cadastradas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Todas as clínicas e seus planos ativos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar clínica..."
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
          </div>
          <Button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            variant="outline"
            className="rounded-xl gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            {checkMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Verificar Assinaturas
          </Button>
        </div>
      </div>

      {checkResult && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-6 text-sm flex-wrap">
          <span className="font-semibold text-indigo-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-600" />
            Último resultado da verificação:
          </span>
          <span className="text-slate-700">{checkResult.trialsExpired} trials expirados</span>
          <span className="text-green-700">{checkResult.renewed} períodos renovados</span>
          <span className="text-amber-700">{checkResult.markedOverdue} inadimplentes</span>
          <span className="text-red-700">{checkResult.suspended} suspensas</span>
          {checkResult.errors > 0 && <span className="text-red-600 font-semibold">{checkResult.errors} erros</span>}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {rows.length === 0 ? "Nenhuma clínica cadastrada" : "Nenhum resultado"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 border-b border-slate-100">
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clínica</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CNPJ</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plano</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Pagamento</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Mensalidade</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const tier = row.plan ? getTierConfig(row.plan.name) : getTierConfig("");
                const TierIcon = tier.icon;
                const trialExpiring = row.sub?.status === "trial" && row.sub.trialEndDate
                  ? differenceInDays(parseISO(row.sub.trialEndDate), new Date())
                  : null;
                return (
                  <TableRow
                    key={row.clinic.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/60 ${
                      row.sub?.status === "suspended" || row.sub?.status === "cancelled" ? "bg-red-50/30" :
                      row.sub?.paymentStatus === "overdue" ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{row.clinic.name}</p>
                        <p className="text-xs text-slate-400">{row.clinic.email ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 tabular-nums">{row.clinic.cnpj ?? "—"}</TableCell>
                    <TableCell>
                      {row.plan ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: tier.color + "18" }}>
                            <TierIcon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{row.plan.displayName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sem plano</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.sub ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <StatusBadge status={row.sub.status} />
                          {trialExpiring !== null && trialExpiring <= 7 && (
                            <span className={`text-[10px] font-bold ${trialExpiring <= 3 ? "text-red-500" : "text-amber-500"}`}>
                              {trialExpiring < 0 ? "Expirado" : `${trialExpiring}d`}
                            </span>
                          )}
                        </div>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.sub ? <PaymentBadge status={row.sub.paymentStatus} /> : <span className="text-slate-400 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-700 text-sm">
                      {row.sub?.amount ? fmtCurrency(row.sub.amount) : row.plan ? fmtCurrency(row.plan.price) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {row.sub?.status === "trial" ? fmtDate(row.sub.trialEndDate) : fmtDate(row.sub?.currentPeriodEnd)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${row.clinic.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                        {row.clinic.isActive ? "✓" : "✗"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">
              {filtered.length} de {rows.length} clínicas
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

