import { fetchJSON, ClinicBasic } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
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

export function PlansTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_PLAN>(EMPTY_PLAN);
  const [featuresText, setFeaturesText] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => fetchJSON(api("/plans")),
  });

  const { data: planStats = [] } = useQuery<PlanStats[]>({
    queryKey: ["plans-stats"],
    queryFn: () => fetchJSON(api("/plans/stats")),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(api("/plans/seed-defaults"), { method: "POST" });
      if (!res.ok) throw new Error("Erro ao criar planos padrão");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      const created = data.results.filter((r: any) => r.action === "created").length;
      const skipped = data.results.filter((r: any) => r.action === "skipped").length;
      toast({
        title: "Planos padrão configurados!",
        description: created > 0
          ? `${created} plano(s) criado(s), ${skipped} já existia(m).`
          : "Todos os planos já existiam.",
      });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        price: Number(form.price),
        features: featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      const url = editPlan ? api(`/plans/${editPlan.id}`) : api("/plans");
      const method = editPlan ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Erro ao salvar plano");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({ title: editPlan ? "Plano atualizado!" : "Plano criado!" });
      setEditPlan(null);
      setCreating(false);
      setForm(EMPTY_PLAN);
      setFeaturesText("");
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(api(`/plans/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plans-stats"] });
      toast({ title: "Plano excluído" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const openEdit = (plan: Plan) => {
    setEditPlan(plan);
    setForm({ ...plan });
    setFeaturesText((plan.features ?? []).join("\n"));
  };

  const openCreate = () => {
    setCreating(true);
    setEditPlan(null);
    setForm(EMPTY_PLAN);
    setFeaturesText("");
  };

  const isOpen = creating || editPlan !== null;

  function getStatsForPlan(planId: number) {
    return planStats.find((s) => s.planId === planId);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Planos de Adesão</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gerencie preços, limites e recursos de cada plano</p>
        </div>
        <div className="flex items-center gap-2">
          {plans.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="rounded-xl gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Criar Planos Padrão
            </Button>
          )}
          {plans.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="rounded-xl gap-1.5 text-slate-500 text-xs"
              title="Sincronizar planos padrão"
            >
              {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync Padrão
            </Button>
          )}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            <button
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === "cards" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setView("cards")}
            >Cards</button>
            <button
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === "table" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setView("table")}
            >Tabela</button>
          </div>
          <Button onClick={openCreate} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Novo Plano
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-base font-bold text-slate-700 mb-1">Nenhum plano cadastrado</h3>
          <p className="text-sm text-slate-400 mb-6">
            Clique em "Criar Planos Padrão" para gerar os planos Essencial, Profissional e Premium automaticamente.
          </p>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="rounded-xl gap-2"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Criar Planos Padrão
          </Button>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const tier = getTierConfig(plan.name);
            const TierIcon = tier.icon;
            const stats = getStatsForPlan(plan.id);
            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border-2 ${tier.border} shadow-sm overflow-hidden flex flex-col`}
              >
                {/* Header */}
                <div className={`bg-gradient-to-br ${tier.gradient} p-5 text-white`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                        <TierIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-lg leading-tight">{plan.displayName}</p>
                        <p className="text-white/70 text-xs">{plan.description}</p>
                      </div>
                    </div>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${plan.isActive ? "bg-white/20 text-white" : "bg-black/20 text-white/60"}`}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-extrabold">{fmtCurrency(plan.price)}</span>
                    <span className="text-white/70 text-sm ml-1">/mês</span>
                  </div>
                  <p className="text-white/60 text-xs mt-0.5">{plan.trialDays} dias de trial grátis</p>
                </div>

                {/* Stats row */}
                {stats && (
                  <div className={`${tier.bg} px-5 py-3 flex items-center justify-between border-b ${tier.border}`}>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="text-sm font-bold text-slate-800">{stats.total}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">Ativos</p>
                      <p className="text-sm font-bold text-green-700">{stats.active}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">Trial</p>
                      <p className="text-sm font-bold text-blue-700">{stats.trial}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">MRR</p>
                      <p className="text-sm font-bold text-slate-800">{fmtCurrency(stats.mrr)}</p>
                    </div>
                  </div>
                )}

                {/* Limits */}
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Limites</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      ["Profissionais", plan.maxProfessionals],
                      ["Pacientes", plan.maxPatients],
                      ["Usuários", plan.maxUsers],
                      ["Agendas", plan.maxSchedules],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{label as string}</span>
                        <span className="text-xs font-bold text-slate-800">{limitLabel(val as number | null)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div className="px-5 py-3 flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recursos</p>
                  <ul className="space-y-1.5">
                    {(plan.features ?? []).map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: tier.color }} />
                        <span className="text-xs text-slate-600">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1 rounded-xl text-xs gap-1.5" onClick={() => openEdit(plan)}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => setDeleteId(plan.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 border-b border-slate-100">
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plano</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Preço/mês</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Profissionais</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Pacientes</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Usuários</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Trial</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Assinantes</TableHead>
                <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => {
                const tier = getTierConfig(plan.name);
                const TierIcon = tier.icon;
                const stats = getStatsForPlan(plan.id);
                return (
                  <TableRow key={plan.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: tier.color + "18" }}>
                          <TierIcon className="w-4 h-4" style={{ color: tier.color }} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{plan.displayName}</p>
                          <p className="text-xs text-slate-400">{plan.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-slate-800">{fmtCurrency(plan.price)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600">{limitLabel(plan.maxProfessionals)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600">{limitLabel(plan.maxPatients)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600">{limitLabel(plan.maxUsers)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600">{plan.trialDays}d</TableCell>
                    <TableCell className="text-center">
                      {stats ? (
                        <span className="text-sm font-bold text-slate-700">{stats.total}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {plan.isActive ? (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Ativo</span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Inativo</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(plan)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteId(plan.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit / Create dialog */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { setCreating(false); setEditPlan(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>Configure os limites e recursos do plano</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Identificador (slug)</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  placeholder="essencial"
                  disabled={!!editPlan}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nome de Exibição</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Essencial" className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição curta</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Para profissionais autônomos" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Preço mensal (R$)</Label>
                <Input type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Dias de Trial</Label>
                <Input type="number" min={0} value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} className="rounded-xl" />
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest pt-2">Limites (vazio = ilimitado)</p>
            <div className="grid grid-cols-2 gap-4">
              {([
                ["maxProfessionals", "Profissionais"],
                ["maxPatients", "Pacientes"],
                ["maxSchedules", "Agendas"],
                ["maxUsers", "Usuários totais"],
              ] as const).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Ilimitado"
                    value={form[field] ?? ""}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-xl"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Recursos (um por linha)</Label>
              <Textarea
                rows={5}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder={"Agenda completa\nProntuários digitais\nControle financeiro"}
                className="rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Ordem de exibição</Label>
                <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="rounded-xl" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Plano ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditPlan(null); }}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : editPlan ? "Salvar" : "Criar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Plano</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Clínicas ativas com este plano perderão a referência.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

