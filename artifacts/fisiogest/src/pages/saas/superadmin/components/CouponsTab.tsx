import { fetchJSON, ClinicBasic } from "../helpers";
import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
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

// ─── Coupons Tab ─────────────────────────────────────────────────────────────

type CouponRow = {
  id: number;
  code: string;
  description: string;
  type: "discount" | "referral";
  discountType: "percent" | "fixed";
  discountValue: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  minPlanAmount: string | null;
  applicablePlanNames: string[] | null;
  referrerClinicId: number | null;
  referrerBenefitType: string | null;
  referrerBenefitValue: string | null;
  notes: string | null;
  createdAt: string;
};


export function CouponsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CouponRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CouponRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_COUPON });
  const [copying, setCopying] = useState<number | null>(null);
  const [clinicComboOpen, setClinicComboOpen] = useState(false);

  const { data: coupons = [], isLoading } = useQuery<CouponRow[]>({
    queryKey: ["coupon-codes"],
    queryFn: () => fetchJSON(api("/coupon-codes")),
  });

  const { data: activeClinics = [] } = useQuery<ClinicBasic[]>({
    queryKey: ["all-clinics"],
    queryFn: () => fetchJSON(api("/clinics")),
    select: (data) => data.filter((c) => c.isActive),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.toLowerCase();
    return coupons.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [coupons, search]);

  const stats = useMemo(() => ({
    total: coupons.length,
    active: coupons.filter((c) => c.isActive).length,
    totalUses: coupons.reduce((sum, c) => sum + (c.usedCount ?? 0), 0),
    referrals: coupons.filter((c) => c.type === "referral").length,
  }), [coupons]);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_COUPON });
    setDialogOpen(true);
  }

  function openEdit(c: CouponRow) {
    setEditTarget(c);
    setForm({
      code: c.code,
      description: c.description,
      type: c.type,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      maxUses: c.maxUses != null ? String(c.maxUses) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      isActive: c.isActive,
      minPlanAmount: c.minPlanAmount ?? "",
      applicablePlanNames: c.applicablePlanNames ?? [],
      referrerClinicId: c.referrerClinicId != null ? String(c.referrerClinicId) : "",
      referrerBenefitType: (c.referrerBenefitType as "percent" | "fixed" | "") ?? "",
      referrerBenefitValue: c.referrerBenefitValue ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.toUpperCase().trim(),
        description: form.description,
        type: form.type,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
        isActive: form.isActive,
        minPlanAmount: form.minPlanAmount ? Number(form.minPlanAmount) : null,
        applicablePlanNames: form.applicablePlanNames.length > 0 ? form.applicablePlanNames : null,
        referrerClinicId: form.referrerClinicId ? Number(form.referrerClinicId) : null,
        referrerBenefitType: form.referrerBenefitType || null,
        referrerBenefitValue: form.referrerBenefitValue ? Number(form.referrerBenefitValue) : null,
        notes: form.notes || null,
      };
      const url = editTarget ? api(`/coupon-codes/${editTarget.id}`) : api("/coupon-codes");
      const method = editTarget ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupon-codes"] });
      setDialogOpen(false);
      toast({ title: editTarget ? "Cupom atualizado!" : "Cupom criado!" });
    },
    onError: (err: Error) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(api(`/coupon-codes/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["coupon-codes"] });
      setDeleteTarget(null);
      toast({ title: data.message ?? "Cupom removido." });
    },
    onError: () => toast({ title: "Erro ao remover cupom", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiFetch(api(`/coupon-codes/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupon-codes"] }),
    onError: () => toast({ title: "Erro ao atualizar cupom", variant: "destructive" }),
  });

  function getCouponLink(code: string) {
    return `${window.location.origin}/register?cupom=${encodeURIComponent(code)}`;
  }

  async function copyLink(coupon: CouponRow) {
    setCopying(coupon.id);
    try {
      await navigator.clipboard.writeText(getCouponLink(coupon.code));
      toast({ title: "Link copiado!", description: getCouponLink(coupon.code) });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
    setTimeout(() => setCopying(null), 1500);
  }

  function discountLabel(c: CouponRow) {
    if (c.discountType === "percent") return `${Number(c.discountValue).toFixed(0)}%`;
    return `R$ ${Number(c.discountValue).toFixed(2).replace(".", ",")}`;
  }

  const PLAN_OPTIONS = ["essencial", "profissional", "premium"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Tag className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Cupons</h2>
            <p className="text-sm text-slate-500 mt-0.5">Cupons de desconto e indicação</p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Novo Cupom
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total de Cupons", value: stats.total, icon: Tag, color: "#8b5cf6" },
          { label: "Ativos", value: stats.active, icon: CheckCircle2, color: "#10b981" },
          { label: "Usos Totais", value: stats.totalUses, icon: Hash, color: "#0ea5e9" },
          { label: "Indicações", value: stats.referrals, icon: Link2, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-4">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: s.color }} />
            <div className="flex items-center gap-3 pl-2">
              <div className="p-2 rounded-xl" style={{ backgroundColor: s.color + "18" }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por código ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl bg-white border-slate-200"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 border-b border-slate-100">
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desconto</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Usos</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Validade</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Tag className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">Nenhum cupom encontrado</p>
                    <p className="text-xs text-slate-400">Crie o primeiro cupom clicando em "Novo Cupom"</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <TableCell>
                    <div>
                      <span className="font-mono font-bold text-slate-900 tracking-widest">{c.code}</span>
                      {c.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{c.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      c.type === "referral"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-violet-50 text-violet-700"
                    }`}>
                      {c.type === "referral" ? <Link2 className="w-3 h-3" /> : <Tag className="w-3 h-3" />}
                      {c.type === "referral" ? "Indicação" : "Desconto"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-emerald-600 tabular-nums text-sm">
                      {c.discountType === "percent" ? <Percent className="w-3 h-3 inline mr-0.5" /> : null}
                      {discountLabel(c)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums text-sm text-slate-700">
                      {c.usedCount ?? 0}
                      {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.expiresAt ? (
                      <span className={`text-xs ${new Date(c.expiresAt) < new Date() ? "text-red-500 font-semibold" : "text-slate-500"}`}>
                        {format(parseISO(c.expiresAt), "dd/MM/yyyy")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sem validade</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.isActive}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isActive: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyLink(c)}
                        title="Copiar link de indicação"
                        className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        {copying === c.id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
            <DialogDescription>
              {editTarget ? "Altere os dados do cupom." : "Preencha os dados do novo cupom."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input
                  placeholder="Ex: FISIO30"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, "") })}
                  className="rounded-xl font-mono tracking-widest uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v: "discount" | "referral") => setForm({ ...form, type: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">Desconto</SelectItem>
                    <SelectItem value="referral">Indicação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                placeholder="Ex: 30% de desconto para novos usuários"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Desconto *</Label>
                <Select value={form.discountType} onValueChange={(v: "percent" | "fixed") => setForm({ ...form, discountType: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor do Desconto *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    {form.discountType === "percent" ? "%" : "R$"}
                  </span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    className="rounded-xl pl-8"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Limite de Usos</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Sem limite"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validade</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Planos aplicáveis</Label>
              <div className="flex gap-2 flex-wrap">
                {PLAN_OPTIONS.map((p) => {
                  const selected = form.applicablePlanNames.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          applicablePlanNames: selected
                            ? form.applicablePlanNames.filter((x) => x !== p)
                            : [...form.applicablePlanNames, p],
                        });
                      }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize ${
                        selected
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 inline mr-1" />}
                      {p}
                    </button>
                  );
                })}
                <p className="text-xs text-slate-400 w-full">Deixe vazio para todos os planos</p>
              </div>
            </div>

            {form.type === "referral" && (
              <div className="space-y-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> Benefício para quem indica
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo do benefício</Label>
                    <Select
                      value={form.referrerBenefitType}
                      onValueChange={(v) => setForm({ ...form, referrerBenefitType: v as "percent" | "fixed" | "" })}
                    >
                      <SelectTrigger className="rounded-xl bg-white">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor do benefício</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 20"
                      value={form.referrerBenefitValue}
                      onChange={(e) => setForm({ ...form, referrerBenefitValue: e.target.value })}
                      className="rounded-xl bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Clínica indicadora</Label>
                  <Popover open={clinicComboOpen} onOpenChange={setClinicComboOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-input bg-white px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className={form.referrerClinicId ? "text-foreground" : "text-muted-foreground"}>
                          {form.referrerClinicId
                            ? (activeClinics.find((c) => String(c.id) === form.referrerClinicId)?.name ?? `ID ${form.referrerClinicId}`)
                            : "Selecione uma clínica..."}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Pesquisar clínica..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma clínica encontrada.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value=""
                              onSelect={() => {
                                setForm({ ...form, referrerClinicId: "" });
                                setClinicComboOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${!form.referrerClinicId ? "opacity-100" : "opacity-0"}`} />
                              <span className="text-muted-foreground italic">Nenhuma</span>
                            </CommandItem>
                            {activeClinics.map((clinic) => (
                              <CommandItem
                                key={clinic.id}
                                value={`${clinic.name} ${clinic.id}`}
                                onSelect={() => {
                                  setForm({ ...form, referrerClinicId: String(clinic.id) });
                                  setClinicComboOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${form.referrerClinicId === String(clinic.id) ? "opacity-100" : "opacity-0"}`} />
                                <span>{clinic.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground">#{clinic.id}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações internas</Label>
              <Input
                placeholder="Notas internas sobre este cupom"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                id="coupon-active"
              />
              <Label htmlFor="coupon-active" className="cursor-pointer">
                Cupom ativo
              </Label>
            </div>

            {form.code && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Link de indicação
                </p>
                <p className="text-xs text-slate-600 font-mono break-all">
                  {window.location.origin}/register?cupom={form.code}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.code || !form.discountValue}
              className="rounded-xl"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editTarget ? "Salvar" : "Criar Cupom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Cupom</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover o cupom{" "}
              <strong className="font-mono">{deleteTarget?.code}</strong>?
              {(deleteTarget?.usedCount ?? 0) > 0 && (
                <span className="block text-amber-600 mt-1">
                  Este cupom tem {deleteTarget?.usedCount} uso(s) registrado(s) e será desativado em vez de excluído.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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

