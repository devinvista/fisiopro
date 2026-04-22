import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Package,
  CalendarDays,
  Clock,
  Layers,
  User,
  Users,
  RefreshCw,
  AlertCircle,
  Info,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";

interface Procedure {
  id: number;
  name: string;
  category: string;
  modalidade: string;
  price: string | number;
  durationMinutes: number;
  isActive: boolean;
}

interface PackageItem {
  id: number;
  name: string;
  description?: string | null;
  procedureId: number;
  procedureName: string;
  procedureCategory: string;
  procedureModalidade: string;
  procedureDurationMinutes: number;
  procedurePricePerSession: string | number;
  packageType: "sessoes" | "mensal" | "faturaConsolidada";
  totalSessions?: number | null;
  sessionsPerWeek: number;
  validityDays?: number | null;
  price: string | number;
  monthlyPrice?: string | number | null;
  billingDay?: number | null;
  absenceCreditLimit: number;
  isActive: boolean;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  "Reabilitação": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "Fisioterapia": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "fisioterapia": { label: "Reabilitação", bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-400" },
  "Estética":     { label: "Estética",     bg: "bg-pink-50",   text: "text-pink-700",  dot: "bg-pink-400" },
  "estetica":     { label: "Estética",     bg: "bg-pink-50",   text: "text-pink-700",  dot: "bg-pink-400" },
  "Pilates":      { label: "Pilates",      bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
  "pilates":      { label: "Pilates",      bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
};

const MODALIDADE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  individual: { label: "Individual", icon: User },
  dupla:      { label: "Dupla",      icon: Users },
  grupo:      { label: "Grupo",      icon: Users },
};

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? { label: category, bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", cfg.bg, cfg.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.message || `Erro ${r.status}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

const EMPTY_FORM = {
  name: "",
  description: "",
  procedureId: "",
  packageType: "sessoes" as "sessoes" | "mensal" | "faturaConsolidada",
  totalSessions: 8,
  sessionsPerWeek: 2,
  validityDays: 30,
  price: "",
  monthlyPrice: "",
  billingDay: 5,
  absenceCreditLimit: 1,
};

export default function Pacotes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "sessoes" | "mensal" | "faturaConsolidada">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<PackageItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: packages = [], isLoading } = useQuery<PackageItem[]>({
    queryKey: ["packages"],
    queryFn: () => apiFetch<PackageItem[]>("/api/packages?includeInactive=true"),
  });

  const { data: procedures = [] } = useQuery<Procedure[]>({
    queryKey: ["procedures-active"],
    queryFn: () => apiFetch<Procedure[]>("/api/procedures"),
  });

  const filtered = packages.filter((pkg) => {
    const matchesSearch = search.trim() === "" ||
      pkg.name.toLowerCase().includes(search.toLowerCase()) ||
      pkg.procedureName.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || pkg.packageType === typeFilter;
    return matchesSearch && matchesType;
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch<PackageItem>("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(data)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote criado com sucesso!" });
      closeModal();
    },
    onError: (err: Error) => toast({ title: "Erro ao criar pacote", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) =>
      apiFetch<PackageItem>(`/api/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(data)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote atualizado com sucesso!" });
      closeModal();
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar pacote", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/packages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote removido." });
      setDeletingPackage(null);
    },
    onError: (err: Error) => toast({ title: "Erro ao remover pacote", description: err.message, variant: "destructive" }),
  });

  function buildPayload(data: typeof form) {
    const base = {
      name: data.name,
      description: data.description || null,
      procedureId: Number(data.procedureId),
      packageType: data.packageType,
      sessionsPerWeek: Number(data.sessionsPerWeek),
    };
    if (data.packageType === "sessoes") {
      return {
        ...base,
        totalSessions: Number(data.totalSessions),
        validityDays: Number(data.validityDays),
        price: Number(data.price),
        monthlyPrice: null,
        billingDay: null,
        absenceCreditLimit: 0,
      };
    } else {
      return {
        ...base,
        totalSessions: null,
        validityDays: null,
        price: Number(data.monthlyPrice),
        monthlyPrice: Number(data.monthlyPrice),
        billingDay: Number(data.billingDay),
        absenceCreditLimit: Number(data.absenceCreditLimit),
      };
    }
  }

  function openCreate() {
    setEditingPackage(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  }

  function openEdit(pkg: PackageItem) {
    setEditingPackage(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      procedureId: String(pkg.procedureId),
      packageType: pkg.packageType,
      totalSessions: pkg.totalSessions ?? 8,
      sessionsPerWeek: pkg.sessionsPerWeek,
      validityDays: pkg.validityDays ?? 30,
      price: String(pkg.price),
      monthlyPrice: pkg.monthlyPrice ? String(pkg.monthlyPrice) : "",
      billingDay: pkg.billingDay ?? 5,
      absenceCreditLimit: pkg.absenceCreditLimit ?? 1,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPackage(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    if (!form.name || !form.procedureId) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.packageType === "sessoes" && !form.price) {
      toast({ title: "Informe o preço total do pacote", variant: "destructive" });
      return;
    }
    if (form.packageType !== "sessoes" && !form.monthlyPrice) {
      toast({ title: "Informe o valor da cobrança", variant: "destructive" });
      return;
    }
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const selectedProcedure = procedures.find((p) => p.id === Number(form.procedureId));
  const pricePerSessionAvulso = selectedProcedure ? Number(selectedProcedure.price) : null;

  const pricePerSessionPkg = form.packageType === "sessoes" && form.price && form.totalSessions
    ? Number(form.price) / Number(form.totalSessions)
    : null;

  const discount = pricePerSessionPkg && pricePerSessionAvulso && pricePerSessionAvulso > 0
    ? ((pricePerSessionAvulso - pricePerSessionPkg) / pricePerSessionAvulso) * 100
    : null;

  const weeksEstimated = form.totalSessions && form.sessionsPerWeek
    ? Math.ceil(Number(form.totalSessions) / Number(form.sessionsPerWeek))
    : null;

  const mensal_sessoesMes = form.sessionsPerWeek ? Number(form.sessionsPerWeek) * 4 : null;
  const mensal_pricePerSession = form.monthlyPrice && mensal_sessoesMes
    ? Number(form.monthlyPrice) / mensal_sessoesMes
    : null;

  const sessoesPkg = packages.filter(p => p.packageType === "sessoes").length;
  const mensaisPkg = packages.filter(p => p.packageType === "mensal").length;
  const faturasPkg = packages.filter(p => p.packageType === "faturaConsolidada").length;

  return (
    <AppLayout title="Pacotes">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pacotes de Serviços</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Configure pacotes por sessões ou mensalidades com regras de frequência e falta
            </p>
          </div>
          {isAdmin && (
            <Button onClick={openCreate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Novo Pacote
            </Button>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-lg">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{packages.length}</p>
              <p className="text-xs text-muted-foreground">Total de pacotes</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-lg">
              <Layers className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sessoesPkg}</p>
              <p className="text-xs text-muted-foreground">Por sessões</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-lg">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{mensaisPkg}</p>
              <p className="text-xs text-muted-foreground">Mensalidades</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className="bg-violet-100 p-2.5 rounded-lg">
              <FileText className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faturasPkg}</p>
              <p className="text-xs text-muted-foreground">Faturas</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar pacote ou procedimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 p-1 bg-muted rounded-xl">
            {([
              { v: "all", label: "Todos" },
              { v: "sessoes", label: "Por Sessões" },
              { v: "mensal", label: "Mensalidade" },
              { v: "faturaConsolidada", label: `Fatura (${faturasPkg})` },
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setTypeFilter(opt.v)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  typeFilter === opt.v
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-5 animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-10 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card border rounded-xl">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-medium text-foreground">Nenhum pacote encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || typeFilter !== "all" ? "Tente outros filtros" : "Crie o primeiro pacote clicando em \"Novo Pacote\""}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((pkg) => {
              const isMensal = pkg.packageType === "mensal";
              const isFatura = pkg.packageType === "faturaConsolidada";
              const ModalIcon = MODALIDADE_CONFIG[pkg.procedureModalidade]?.icon ?? User;
              const modalidadeLabel = MODALIDADE_CONFIG[pkg.procedureModalidade]?.label ?? pkg.procedureModalidade;
              const pps = isMensal
                ? (pkg.monthlyPrice ? Number(pkg.monthlyPrice) / (pkg.sessionsPerWeek * 4) : null)
                : (pkg.totalSessions ? Number(pkg.price) / pkg.totalSessions : null);

              return (
                <div key={pkg.id} className={cn(
                  "bg-card border rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col gap-4",
                  !pkg.isActive && "opacity-60"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                          isFatura ? "bg-violet-100 text-violet-700" : isMensal ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {isFatura ? "Fatura" : isMensal ? "Mensal" : "Sessões"}
                        </span>
                        {!pkg.isActive && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                      </div>
                      <h3 className="font-semibold text-foreground truncate">{pkg.name}</h3>
                      {pkg.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pkg.description}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(pkg)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingPackage(pkg)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <CategoryBadge category={pkg.procedureCategory} />
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      <ModalIcon className="h-3 w-3" />
                      {modalidadeLabel}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Procedimento: <span className="text-foreground font-medium">{pkg.procedureName}</span>
                    <span className="text-muted-foreground"> ({pkg.procedureDurationMinutes} min)</span>
                  </p>

                  {isMensal || isFatura ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted/50 rounded-lg p-2">
                        {isFatura ? <FileText className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" /> : <CalendarDays className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />}
                        <p className="text-base font-bold">{isFatura ? "uso" : `${pkg.sessionsPerWeek}x`}</p>
                        <p className="text-[10px] text-muted-foreground">{isFatura ? "por sessão" : "por semana"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <AlertCircle className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-base font-bold">{isFatura ? "fim" : pkg.absenceCreditLimit}</p>
                        <p className="text-[10px] text-muted-foreground">{isFatura ? "do ciclo" : "faltas/mês"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <Clock className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-base font-bold">dia {pkg.billingDay}</p>
                        <p className="text-[10px] text-muted-foreground">cobrança</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <Layers className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-base font-bold">{pkg.totalSessions}</p>
                        <p className="text-[10px] text-muted-foreground">sessões</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <CalendarDays className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-base font-bold">{pkg.sessionsPerWeek}x</p>
                        <p className="text-[10px] text-muted-foreground">por semana</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <Clock className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-base font-bold">{pkg.validityDays}</p>
                        <p className="text-[10px] text-muted-foreground">dias valid.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-end justify-between pt-1 border-t">
                    <div>
                      <p className="text-xl font-bold">
                        {isMensal ? formatCurrency(pkg.monthlyPrice) : formatCurrency(pkg.price)}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          {isFatura ? "/sessão" : isMensal ? "/mês" : "total"}
                        </span>
                      </p>
                      {pps !== null && (
                        <p className="text-xs text-muted-foreground">{formatCurrency(pps)}/sessão</p>
                      )}
                    </div>
                    {pps !== null && pricePerSessionAvulso === null && Number(pkg.procedurePricePerSession) > 0 && (
                      <span className="text-xs font-semibold text-emerald-600">
                        {(((Number(pkg.procedurePricePerSession) - pps) / Number(pkg.procedurePricePerSession)) * 100).toFixed(0)}% desc.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPackage ? "Editar Pacote" : "Novo Pacote"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Nome e descrição */}
            <div className="space-y-1.5">
              <Label>Nome do pacote *</Label>
              <Input
                placeholder="Ex: Pilates em Grupo — Mensal 2x/semana"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
              <Textarea
                placeholder="Descreva o pacote para o paciente..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Procedimento */}
            <div className="space-y-1.5">
              <Label>Procedimento *</Label>
              <Select value={form.procedureId} onValueChange={(v) => setForm((f) => ({ ...f, procedureId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o procedimento..." />
                </SelectTrigger>
                <SelectContent>
                  {procedures.map((p) => {
                    const ModalIcon = MODALIDADE_CONFIG[p.modalidade]?.icon ?? User;
                    return (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <span className="flex items-center gap-2">
                          <ModalIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{p.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({p.modalidade} · {formatCurrency(p.price)}/sessão)
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo do pacote */}
            <div className="space-y-2">
              <Label>Tipo de pacote *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  {
                    v: "sessoes",
                    label: "Por Sessões",
                    desc: "Quantidade fixa de sessões com validade em dias",
                    icon: Layers,
                    color: "border-blue-300 bg-blue-50 text-blue-700",
                  },
                  {
                    v: "mensal",
                    label: "Mensalidade",
                    desc: "Cobrança fixa; gera créditos após pagamento",
                    icon: RefreshCw,
                    color: "border-emerald-300 bg-emerald-50 text-emerald-700",
                  },
                  {
                    v: "faturaConsolidada",
                    label: "Fatura consolidada",
                    desc: "Sessões acumulam e viram uma fatura mensal",
                    icon: FileText,
                    color: "border-violet-300 bg-violet-50 text-violet-700",
                  },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, packageType: opt.v }))}
                      className={cn(
                        "text-left p-3 rounded-xl border-2 transition-all",
                        form.packageType === opt.v
                          ? opt.color
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3.5 w-3.5" />
                        <p className="text-xs font-bold">{opt.label}</p>
                      </div>
                      <p className="text-[10px] opacity-70 leading-snug">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frequência semanal — comum a ambos tipos */}
            <div className="space-y-1.5">
              <Label>Sessões por semana *</Label>
              <Select
                value={String(form.sessionsPerWeek)}
                onValueChange={(v) => setForm((f) => ({ ...f, sessionsPerWeek: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}x por semana
                      {n === 1 ? " (1 vez)" : n <= 3 ? " (recomendado)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campos específicos por tipo */}
            {form.packageType === "sessoes" ? (
              <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Configurações do Pacote por Sessões
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Total de sessões *</Label>
                    <Input
                      type="number" min={1}
                      value={form.totalSessions}
                      onChange={(e) => setForm((f) => ({ ...f, totalSessions: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Validade (dias)</Label>
                    <Input
                      type="number" min={1}
                      value={form.validityDays}
                      onChange={(e) => setForm((f) => ({ ...f, validityDays: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Preço total do pacote (R$) *</Label>
                  <Input
                    type="number" min={0} step={0.01} placeholder="0,00"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div className={cn("space-y-4 p-4 rounded-xl border", form.packageType === "mensal" ? "bg-emerald-50/50 border-emerald-100" : "bg-violet-50/50 border-violet-100")}>
                <p className={cn("text-xs font-semibold flex items-center gap-1.5", form.packageType === "mensal" ? "text-emerald-700" : "text-violet-700")}>
                  {form.packageType === "mensal" ? <RefreshCw className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {form.packageType === "mensal" ? "Configurações da Mensalidade" : "Configurações da Fatura Consolidada"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{form.packageType === "mensal" ? "Valor mensal (R$) *" : "Valor por sessão (R$) *"}</Label>
                    <Input
                      type="number" min={0} step={0.01} placeholder="0,00"
                      value={form.monthlyPrice}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dia de cobrança *</Label>
                    <Input
                      type="number" min={1} max={31}
                      value={form.billingDay}
                      onChange={(e) => setForm((f) => ({ ...f, billingDay: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                {form.packageType === "mensal" && <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Limite de faltas creditadas por mês
                    <span className="text-[10px] text-muted-foreground font-normal">(faltas acima deste limite não são creditadas)</span>
                  </Label>
                  <Select
                    value={String(form.absenceCreditLimit)}
                    onValueChange={(v) => setForm((f) => ({ ...f, absenceCreditLimit: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sem crédito de faltas</SelectItem>
                      <SelectItem value="1">1 falta creditada/mês</SelectItem>
                      <SelectItem value="2">2 faltas creditadas/mês</SelectItem>
                      <SelectItem value="3">3 faltas creditadas/mês</SelectItem>
                      <SelectItem value="4">4 faltas creditadas/mês</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.absenceCreditLimit > 0 && (
                    <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded-lg p-2 flex gap-1.5">
                      <Info className="h-3 w-3 shrink-0 mt-0.5" />
                      Até {form.absenceCreditLimit} falta(s) por mês geram crédito de sessão para o próximo mês. Faltas adicionais não geram crédito.
                    </p>
                  )}
                </div>}
                {form.packageType === "faturaConsolidada" && (
                  <p className="text-[10px] text-violet-700 bg-violet-50 rounded-lg p-2 flex gap-1.5">
                    <Info className="h-3 w-3 shrink-0 mt-0.5" />
                    As sessões concluídas não geram cobrança imediata; elas ficam pendentes e são somadas em uma fatura no dia de cobrança.
                  </p>
                )}
              </div>
            )}

            {/* Preview financeiro */}
            {selectedProcedure && (
              <div className="bg-muted/50 rounded-xl p-3 space-y-2 text-sm border">
                <p className="text-xs font-semibold text-foreground">Resumo financeiro</p>
                {form.packageType === "sessoes" ? (
                  <>
                    {pricePerSessionPkg !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Preço por sessão no pacote:</span>
                        <span className="font-semibold">{formatCurrency(pricePerSessionPkg)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço avulso:</span>
                      <span className="font-semibold">{formatCurrency(selectedProcedure.price)}</span>
                    </div>
                    {discount !== null && (
                      <div className="flex justify-between pt-1 border-t">
                        <span className="text-muted-foreground">Desconto para o paciente:</span>
                        <span className={cn("font-bold", discount > 0 ? "text-emerald-600" : "text-red-500")}>
                          {discount > 0 ? `-${discount.toFixed(0)}%` : `${Math.abs(discount).toFixed(0)}% acima do avulso`}
                        </span>
                      </div>
                    )}
                    {weeksEstimated !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duração estimada:</span>
                        <span className="font-semibold">~{weeksEstimated} semana(s)</span>
                      </div>
                    )}
                  </>
                ) : form.packageType === "mensal" ? (
                  <>
                    {mensal_sessoesMes !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sessões/mês (estimado):</span>
                        <span className="font-semibold">{mensal_sessoesMes} sessões</span>
                      </div>
                    )}
                    {mensal_pricePerSession !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Custo por sessão no plano:</span>
                        <span className="font-semibold">{formatCurrency(mensal_pricePerSession)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço avulso:</span>
                      <span className="font-semibold">{formatCurrency(selectedProcedure.price)}</span>
                    </div>
                    {mensal_pricePerSession !== null && Number(selectedProcedure.price) > 0 && (
                      <div className="flex justify-between pt-1 border-t">
                        <span className="text-muted-foreground">Desconto mensal vs. avulso:</span>
                        <span className={cn("font-bold",
                          mensal_pricePerSession < Number(selectedProcedure.price) ? "text-emerald-600" : "text-red-500"
                        )}>
                          {mensal_pricePerSession < Number(selectedProcedure.price)
                            ? `-${(((Number(selectedProcedure.price) - mensal_pricePerSession) / Number(selectedProcedure.price)) * 100).toFixed(0)}%`
                            : `+${(((mensal_pricePerSession - Number(selectedProcedure.price)) / Number(selectedProcedure.price)) * 100).toFixed(0)}%`}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor que entra na fatura por sessão:</span>
                      <span className="font-semibold">{formatCurrency(form.monthlyPrice || selectedProcedure.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dia de fechamento/cobrança:</span>
                      <span className="font-semibold">dia {form.billingDay}</span>
                    </div>
                    <div className="text-[10px] text-violet-700 bg-violet-50 rounded-lg p-2">
                      Atendimento concluído entra como pendente de fatura, e o job mensal consolida tudo em uma cobrança única.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingPackage ? "Salvar alterações" : "Criar pacote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deletingPackage} onOpenChange={(open) => { if (!open) setDeletingPackage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pacote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o pacote <strong>{deletingPackage?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPackage && deleteMutation.mutate(deletingPackage.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
