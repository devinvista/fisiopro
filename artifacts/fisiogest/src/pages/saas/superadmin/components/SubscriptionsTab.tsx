import { fetchJSON } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge } from "./";
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

// ─── Subscriptions Tab ────────────────────────────────────────────────────────

type ClinicBasic = { id: number; name: string; email: string | null; isActive: boolean; createdAt: string };

export function SubscriptionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editSub, setEditSub] = useState<SubRow | null>(null);
  const [subForm, setSubForm] = useState({
    status: "trial",
    planId: "",
    paymentStatus: "pending",
    amount: "",
    trialEndDate: "",
    currentPeriodStart: "",
    currentPeriodEnd: "",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newSubForm, setNewSubForm] = useState({
    clinicId: "",
    planId: "",
    status: "trial",
    paymentStatus: "pending",
    amount: "",
  });

  const { data: allClinics = [] } = useQuery<ClinicBasic[]>({
    queryKey: ["all-clinics"],
    queryFn: () => fetchJSON(api("/clinics")),
  });

  const { data: subs = [], isLoading } = useQuery<SubRow[]>({
    queryKey: ["clinic-subscriptions"],
    queryFn: () => fetchJSON(api("/clinic-subscriptions")),
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => fetchJSON(api("/plans")),
  });

  // Clinics that already have a subscription
  const subsClinicIds = useMemo(() => new Set(subs.map((s) => s.sub.clinicId)), [subs]);
  const clinicsWithoutSub = useMemo(() => allClinics.filter((c) => !subsClinicIds.has(c.id)), [allClinics, subsClinicIds]);

  const createSubMutation = useMutation({
    mutationFn: async () => {
      if (!newSubForm.clinicId || !newSubForm.planId) throw new Error("Selecione clínica e plano");
      const selectedPlan = plans.find((p) => String(p.id) === newSubForm.planId);
      const payload = {
        clinicId: Number(newSubForm.clinicId),
        planId: Number(newSubForm.planId),
        status: newSubForm.status,
        paymentStatus: newSubForm.paymentStatus,
        amount: newSubForm.amount ? Number(newSubForm.amount) : selectedPlan ? Number(selectedPlan.price) : undefined,
      };
      const res = await apiFetch(api("/clinic-subscriptions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Erro ao criar assinatura");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({ title: "Assinatura criada com sucesso!" });
      setNewSubOpen(false);
      setNewSubForm({ clinicId: "", planId: "", status: "trial", paymentStatus: "pending", amount: "" });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editSub) return;
      const payload = {
        planId: Number(subForm.planId) || undefined,
        status: subForm.status || undefined,
        paymentStatus: subForm.paymentStatus || undefined,
        amount: subForm.amount ? Number(subForm.amount) : undefined,
        trialEndDate: subForm.trialEndDate || undefined,
        currentPeriodStart: subForm.currentPeriodStart || undefined,
        currentPeriodEnd: subForm.currentPeriodEnd || undefined,
        notes: subForm.notes || undefined,
      };
      const res = await apiFetch(api(`/clinic-subscriptions/${editSub.sub.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Erro ao atualizar");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({ title: "Assinatura atualizada!" });
      setEditSub(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const quickUpdateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: object }) => {
      const res = await apiFetch(api(`/clinic-subscriptions/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({ title: "Assinatura atualizada!" });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const openEdit = (row: SubRow) => {
    setEditSub(row);
    setSubForm({
      status: row.sub.status,
      planId: String(row.sub.planId),
      paymentStatus: row.sub.paymentStatus,
      amount: row.sub.amount ?? "",
      trialEndDate: row.sub.trialEndDate ?? "",
      currentPeriodStart: row.sub.currentPeriodStart ?? "",
      currentPeriodEnd: row.sub.currentPeriodEnd ?? "",
      notes: row.sub.notes ?? "",
    });
  };

  const filtered = useMemo(() => {
    return subs.filter((row) => {
      const nameMatch = !search || (row.clinic?.name ?? "").toLowerCase().includes(search.toLowerCase()) || (row.clinic?.email ?? "").toLowerCase().includes(search.toLowerCase());
      const statusMatch = filterStatus === "all" || row.sub.status === filterStatus;
      const planMatch = filterPlan === "all" || String(row.sub.planId) === filterPlan;
      return nameMatch && statusMatch && planMatch;
    });
  }, [subs, search, filterStatus, filterPlan]);

  const trialExpiringSoon = subs.filter((row) => {
    if (row.sub.status !== "trial" || !row.sub.trialEndDate) return false;
    try {
      const days = differenceInDays(parseISO(row.sub.trialEndDate), new Date());
      return days >= 0 && days <= 7;
    } catch { return false; }
  });

  // auto-fill amount when plan changes in new sub form
  const handleNewSubPlanChange = (planId: string) => {
    const plan = plans.find((p) => String(p.id) === planId);
    setNewSubForm((f) => ({ ...f, planId, amount: plan ? plan.price : "" }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Assinaturas das Clínicas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Acompanhe e gerencie o status de cada clínica</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{subs.length}</p>
            <p className="text-xs text-slate-400">com assinatura</p>
          </div>
          <Button onClick={() => setNewSubOpen(true)} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Nova Assinatura
          </Button>
        </div>
      </div>

      {/* Clinics without subscription alert */}
      {clinicsWithoutSub.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-indigo-800">
                {clinicsWithoutSub.length} clínica(s) sem plano vinculado
              </p>
              <p className="text-xs text-indigo-600 mt-0.5 mb-2">
                {clinicsWithoutSub.map((c) => c.name).join(", ")}
              </p>
              <div className="flex flex-wrap gap-2">
                {clinicsWithoutSub.map((clinic) => (
                  <button
                    key={clinic.id}
                    onClick={() => {
                      const defaultPlan = plans[0];
                      setNewSubForm({
                        clinicId: String(clinic.id),
                        planId: defaultPlan ? String(defaultPlan.id) : "",
                        status: "trial",
                        paymentStatus: "pending",
                        amount: defaultPlan ? defaultPlan.price : "",
                      });
                      setNewSubOpen(true);
                    }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" />
                    {clinic.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trial expiring soon alert */}
      {trialExpiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {trialExpiringSoon.length} trial(s) expirando nos próximos 7 dias
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {trialExpiringSoon.map((r) => r.clinic?.name ?? "—").join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por clínica ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="rounded-xl w-40">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="suspended">Suspenso</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="rounded-xl w-44">
            <Package className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os planos</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || filterStatus !== "all" || filterPlan !== "all") && (
          <button
            onClick={() => { setSearch(""); setFilterStatus("all"); setFilterPlan("all"); }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-500">
            {subs.length === 0 ? "Nenhuma assinatura encontrada" : "Nenhum resultado para os filtros aplicados"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {subs.length === 0 ? "Assinaturas são criadas automaticamente ao cadastrar uma clínica" : "Tente mudar os filtros de busca"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 border-b border-slate-100">
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clínica</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plano</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trial até</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Pagamento</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cadastro</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const tier = getTierConfig(row.plan?.name ?? "");
                const TierIcon = tier.icon;
                const trialDaysLeft = row.sub.trialEndDate
                  ? differenceInDays(parseISO(row.sub.trialEndDate), new Date())
                  : null;
                return (
                  <TableRow key={row.sub.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <TableCell>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{row.clinic?.name ?? "—"}</p>
                        <p className="text-xs text-slate-400">{row.clinic?.email ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.plan ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: tier.color + "18" }}>
                            <TierIcon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{row.plan.displayName}</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={row.sub.status} />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-slate-600">{fmtDate(row.sub.trialEndDate)}</p>
                        {trialDaysLeft !== null && row.sub.status === "trial" && (
                          <p className={`text-xs font-semibold ${trialDaysLeft <= 3 ? "text-red-500" : trialDaysLeft <= 7 ? "text-amber-500" : "text-slate-400"}`}>
                            {trialDaysLeft < 0 ? "Expirado" : `${trialDaysLeft}d restantes`}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-700">
                      {fmtCurrency(row.sub.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <PaymentBadge status={row.sub.paymentStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {fmtDate(row.sub.createdAt?.split("T")[0])}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-center">
                        {row.sub.status === "trial" && (
                          <button
                            onClick={() => quickUpdateMutation.mutate({ id: row.sub.id, payload: { status: "active", paymentStatus: "paid" } })}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                            title="Ativar assinatura"
                          >
                            Ativar
                          </button>
                        )}
                        {row.sub.status === "active" && row.sub.paymentStatus !== "paid" && (
                          <button
                            onClick={() => quickUpdateMutation.mutate({ id: row.sub.id, payload: { paymentStatus: "paid" } })}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                            title="Marcar como pago"
                          >
                            Pago
                          </button>
                        )}
                        {(row.sub.status === "active" || row.sub.status === "trial") && (
                          <button
                            onClick={() => quickUpdateMutation.mutate({ id: row.sub.id, payload: { status: "suspended" } })}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            title="Suspender"
                          >
                            Suspender
                          </button>
                        )}
                        {row.sub.status === "suspended" && (
                          <button
                            onClick={() => quickUpdateMutation.mutate({ id: row.sub.id, payload: { status: "active" } })}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            Reativar
                          </button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(row)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length < subs.length && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-400">
                Mostrando {filtered.length} de {subs.length} assinaturas
              </p>
            </div>
          )}
        </div>
      )}

      {/* New subscription dialog */}
      <Dialog open={newSubOpen} onOpenChange={(o) => { if (!o) setNewSubOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Assinatura</DialogTitle>
            <DialogDescription>Vincule um plano a uma clínica manualmente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Clínica</Label>
              <Select value={newSubForm.clinicId} onValueChange={(v) => setNewSubForm((f) => ({ ...f, clinicId: v }))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione a clínica" />
                </SelectTrigger>
                <SelectContent>
                  {allClinics.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <div className="flex items-center gap-2">
                        {!subsClinicIds.has(c.id) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Sem plano</span>
                        )}
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={newSubForm.planId} onValueChange={handleNewSubPlanChange}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => {
                    const tier = getTierConfig(p.name);
                    const TierIcon = tier.icon;
                    return (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <div className="flex items-center gap-2">
                          <TierIcon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                          {p.displayName} — {fmtCurrency(p.price)}/mês
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={newSubForm.status} onValueChange={(v) => setNewSubForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <Select value={newSubForm.paymentStatus} onValueChange={(v) => setNewSubForm((f) => ({ ...f, paymentStatus: v }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="free">Grátis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Valor cobrado (R$)</Label>
              <Input
                type="number" min={0} step={0.01}
                value={newSubForm.amount}
                onChange={(e) => setNewSubForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="Preenchido automaticamente pelo plano"
                className="rounded-xl"
              />
            </div>

            {newSubForm.planId && (
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
                {(() => {
                  const plan = plans.find((p) => String(p.id) === newSubForm.planId);
                  if (!plan) return null;
                  return (
                    <span>
                      Trial de <strong>{plan.trialDays} dias</strong> será iniciado hoje.
                      O plano <strong>{plan.displayName}</strong> custa {fmtCurrency(plan.price)}/mês após o período de trial.
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSubOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createSubMutation.mutate()}
              disabled={createSubMutation.isPending || !newSubForm.clinicId || !newSubForm.planId}
            >
              {createSubMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Criar Assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit subscription dialog */}
      <Dialog open={editSub !== null} onOpenChange={(o) => { if (!o) setEditSub(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Assinatura</DialogTitle>
            <DialogDescription>
              {editSub?.clinic?.name} — altere plano, status e pagamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={subForm.planId} onValueChange={(v) => setSubForm({ ...subForm, planId: v })}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => {
                    const tier = getTierConfig(p.name);
                    const TierIcon = tier.icon;
                    return (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <div className="flex items-center gap-2">
                          <TierIcon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                          {p.displayName} — {fmtCurrency(p.price)}/mês
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status da Assinatura</Label>
                <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status do Pagamento</Label>
                <Select value={subForm.paymentStatus} onValueChange={(v) => setSubForm({ ...subForm, paymentStatus: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                    <SelectItem value="free">Grátis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Valor cobrado (R$)</Label>
              <Input type="number" min={0} step={0.01} value={subForm.amount} onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Trial válido até</Label>
              <Input type="date" value={subForm.trialEndDate} onChange={(e) => setSubForm({ ...subForm, trialEndDate: e.target.value })} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Início do período</Label>
                <Input type="date" value={subForm.currentPeriodStart} onChange={(e) => setSubForm({ ...subForm, currentPeriodStart: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Fim do período</Label>
                <Input type="date" value={subForm.currentPeriodEnd} onChange={(e) => setSubForm({ ...subForm, currentPeriodEnd: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={subForm.notes} onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })} className="rounded-xl text-sm" placeholder="Notas internas..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSub(null)}>Cancelar</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

