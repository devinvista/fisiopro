import { fetchJSON, ClinicBasic } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PaymentBadge, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
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

// ─── Dashboard / Painel Tab ───────────────────────────────────────────────────

export function PainelTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: subs = [], isLoading: subsLoading } = useQuery<SubRow[]>({
    queryKey: ["clinic-subscriptions"],
    queryFn: () => fetchJSON(api("/clinic-subscriptions")),
  });

  const { data: planStats = [], isLoading: statsLoading } = useQuery<PlanStats[]>({
    queryKey: ["plans-stats"],
    queryFn: () => fetchJSON(api("/plans/stats")),
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(api("/clinic-subscriptions/run-check"), { method: "POST" });
      if (!res.ok) throw new Error("Falha na verificação");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({
        title: "Verificação concluída",
        description: `${data.trialsExpired} trials expirados, ${data.renewed ?? 0} períodos renovados, ${data.markedOverdue} inadimplentes, ${data.suspended} suspensas.`,
      });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const isLoading = subsLoading || statsLoading;

  const total = subs.length;
  const trial = subs.filter((s) => s.sub.status === "trial").length;
  const active = subs.filter((s) => s.sub.status === "active").length;
  const suspended = subs.filter((s) => s.sub.status === "suspended" || s.sub.status === "cancelled").length;
  const overdue = subs.filter((s) => s.sub.paymentStatus === "overdue").length;
  const mrr = subs
    .filter((s) => s.sub.status === "active" && s.sub.paymentStatus === "paid")
    .reduce((acc, s) => acc + Number(s.sub.amount ?? 0), 0);

  const recentTrialExpiring = subs
    .filter((row) => {
      if (row.sub.status !== "trial" || !row.sub.trialEndDate) return false;
      try {
        const days = differenceInDays(parseISO(row.sub.trialEndDate), new Date());
        return days >= 0 && days <= 14;
      } catch { return false; }
    })
    .sort((a, b) => {
      try {
        return differenceInDays(parseISO(a.sub.trialEndDate!), new Date()) - differenceInDays(parseISO(b.sub.trialEndDate!), new Date());
      } catch { return 0; }
    });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Painel Geral</h2>
          <p className="text-sm text-slate-500 mt-0.5">Visão consolidada das clínicas e assinaturas</p>
        </div>
        <Button
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
          variant="outline"
          size="sm"
          className="rounded-xl gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
        >
          {checkMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Verificar Assinaturas
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Total de Clínicas" value={total} icon={Building2} color="#6366f1" />
        <KpiCard label="Em Trial" value={trial} sub="período gratuito" icon={Clock} color="#0ea5e9" />
        <KpiCard label="Assinaturas Ativas" value={active} icon={CheckCircle} color="#10b981" />
        <KpiCard label="Suspensas / Canceladas" value={suspended} icon={XCircle} color="#ef4444" />
        <KpiCard label="Inadimplentes" value={overdue} icon={AlertTriangle} color="#f59e0b" />
        <KpiCard label="MRR (estimado)" value={fmtCurrency(mrr)} sub="mensalidades pagas ativas" icon={TrendingUp} color="#8b5cf6" />
      </div>

      {/* Per-plan breakdown */}
      {planStats.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            Distribuição por Plano
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {planStats.map((stat) => {
              const tier = getTierConfig(stat.planName);
              const TierIcon = tier.icon;
              return (
                <div key={stat.planId} className={`bg-white rounded-2xl border-2 ${tier.border} p-5 space-y-4`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: tier.color + "18" }}>
                      <TierIcon className="w-5 h-5" style={{ color: tier.color }} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{stat.planDisplayName}</p>
                      <p className="text-xs text-slate-400">{fmtCurrency(stat.price)}/mês</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 ${tier.bg}`}>
                      <p className="text-xs text-slate-500 mb-0.5">Total</p>
                      <p className="text-xl font-extrabold" style={{ color: tier.color }}>{stat.total}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-green-50">
                      <p className="text-xs text-slate-500 mb-0.5">Ativos</p>
                      <p className="text-xl font-extrabold text-green-700">{stat.active}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-blue-50">
                      <p className="text-xs text-slate-500 mb-0.5">Trial</p>
                      <p className="text-xl font-extrabold text-blue-700">{stat.trial}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-slate-50">
                      <p className="text-xs text-slate-500 mb-0.5">MRR</p>
                      <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(stat.mrr)}</p>
                    </div>
                  </div>

                  {stat.total > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>Conversão Trial → Ativo</span>
                        <span>{stat.total > 0 ? Math.round((stat.active / stat.total) * 100) : 0}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${stat.total > 0 ? Math.round((stat.active / stat.total) * 100) : 0}%`,
                            backgroundColor: tier.color,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trials expiring soon */}
      {recentTrialExpiring.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Trials expirando em breve
          </h3>
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/60 border-b border-amber-100">
                  <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clínica</TableHead>
                  <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plano</TableHead>
                  <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trial expira</TableHead>
                  <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Dias restantes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTrialExpiring.map((row) => {
                  const daysLeft = row.sub.trialEndDate
                    ? differenceInDays(parseISO(row.sub.trialEndDate), new Date())
                    : null;
                  return (
                    <TableRow key={row.sub.id} className="border-b border-amber-50 hover:bg-amber-50/40">
                      <TableCell className="font-medium text-sm text-slate-800">{row.clinic?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{row.plan?.displayName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{fmtDate(row.sub.trialEndDate)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${daysLeft !== null && daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {daysLeft !== null ? `${daysLeft}d` : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Recent subscriptions */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-400" />
          Assinaturas recentes
        </h3>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 border-b border-slate-100">
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clínica</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plano</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Pagamento</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.slice(0, 8).map((row) => (
                <TableRow key={row.sub.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <TableCell className="font-medium text-sm text-slate-800">{row.clinic?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.plan?.displayName ?? "—"}</TableCell>
                  <TableCell className="text-center"><StatusBadge status={row.sub.status} /></TableCell>
                  <TableCell className="text-center"><PaymentBadge status={row.sub.paymentStatus} /></TableCell>
                  <TableCell className="text-sm text-slate-500">{fmtDate(row.sub.createdAt?.split("T")[0])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

