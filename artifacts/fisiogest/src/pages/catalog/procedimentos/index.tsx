import { CATEGORIES, formatCurrency, getMargin } from "./constants";
import { OverheadAnalysis, Procedure, ViewMode } from "./types";
import {
  CardView,
  CatalogModal,
  CostAnalysisModal,
  DeleteConfirmationModal,
  ListView,
  ProcedureFormModal,
} from "./components";
import { useState, useEffect, useCallback, ReactNode } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  LayoutGrid,
  LayoutList,
  Search,
  Stethoscope,
  BookOpen,
  TrendingUp,
  DollarSign,
  Lock,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  procedureFormSchema,
  procedureFormDefaults,
  buildProcedurePayload,
  procedureCostFormSchema,
  buildProcedureCostPayload,
} from "@/schemas/procedure.schema";
import { getCatalogHtml } from "./utils";

export default function Procedimentos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole, isSuperAdmin, hasFeature } = useAuth();
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const hasCostFeature    = hasFeature("financial.cost_per_procedure");
  const showAccountingField = hasFeature("financial.view.accounting");

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch]           = useState("");
  const [viewMode, setViewMode]       = useState<ViewMode>("cards");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure]   = useState<Procedure | null>(null);
  const [deletingProcedure, setDeletingProcedure] = useState<Procedure | null>(null);
  const [costingProcedure, setCostingProcedure]   = useState<Procedure | null>(null);
  const [costForm, setCostForm] = useState({ priceOverride: "", variableCost: "", notes: "" });
  const [analysisMonth, setAnalysisMonth] = useState(new Date().getMonth() + 1);
  const [analysisYear, setAnalysisYear]   = useState(new Date().getFullYear());
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogOptions, setCatalogOptions] = useState({
    clinicName: "FisioGest Pro",
    tagline: "Cuidando de você com excelência",
    showPrices: true,
    selectedCategories: ["Reabilitação", "Estética", "Pilates"] as string[],
    clinicType: "clinica" as string,
    introText: "",
  });

  const buildIntroText = useCallback(
    (type: string, _name: string, _responsible?: string | null): string => {
      const isAutonomo = type === "autonomo" || type === "profissional";
      return isAutonomo
        ? "Conheça nossos serviços e tratamentos especializados. Com dedicação e técnicas modernas, ofereço atendimento personalizado para cada paciente."
        : "Conheça nossos serviços e tratamentos especializados. Nossa equipe está pronta para oferecer o melhor cuidado, com técnicas modernas e atendimento personalizado para cada paciente.";
    },
    []
  );

  useEffect(() => {
    fetch("/api/public/clinic-info")
      .then((r) => r.json())
      .then((data: { name?: string; type?: string; responsibleTechnical?: string | null }) => {
        const name = data?.name || "FisioGest Pro";
        const type = data?.type || "clinica";
        const responsible = data?.responsibleTechnical;
        setCatalogOptions((o) => ({
          ...o,
          clinicName: name,
          clinicType: type,
          introText: buildIntroText(type, name, responsible),
        }));
      })
      .catch(() => {
        setCatalogOptions((o) => ({
          ...o,
          introText: buildIntroText("clinica", o.clinicName, null),
        }));
      });
  }, [buildIntroText]);

  const [form, setForm] = useState({ ...procedureFormDefaults });

  const queryUrl = isAdmin
    ? selectedCategory === "all"
      ? "/api/procedures?includeInactive=true"
      : `/api/procedures?category=${selectedCategory}&includeInactive=true`
    : selectedCategory === "all"
    ? "/api/procedures"
    : `/api/procedures?category=${selectedCategory}`;

  async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
    const r = await fetch(url, options);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.message || `Erro ${r.status}`);
    }
    if (r.status === 204) return undefined as T;
    return r.json();
  }

  const { data: allProcedures = [], isLoading } = useQuery<Procedure[]>({
    queryKey: ["procedures", selectedCategory],
    queryFn: () => apiFetch<Procedure[]>(queryUrl),
  });

  const { data: accountingData } = useQuery<{
    accounts: Array<{ id: number; code: string; name: string; type: string }>;
  }>({
    queryKey: ["accounting-accounts"],
    queryFn: () => apiFetch("/api/financial/accounting/accounts"),
    enabled: showAccountingField,
    staleTime: 60_000,
  });
  const accountingAccounts = accountingData?.accounts ?? [];

  const procedures = allProcedures.filter(
    (p) => search.trim() === "" || p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch<Procedure>("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          price: Number(data.price),
          cost: Number(data.cost),
          monthlyPrice: data.monthlyPrice ? Number(data.monthlyPrice) : undefined,
          billingDay: data.billingDay ? Number(data.billingDay) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setIsModalOpen(false);
      resetForm();
      toast({ title: "Procedimento criado com sucesso" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao criar procedimento", description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form & { id: number }) =>
      apiFetch<Procedure>(`/api/procedures/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          price: Number(data.price),
          cost: Number(data.cost),
          monthlyPrice: data.monthlyPrice ? Number(data.monthlyPrice) : undefined,
          billingDay: data.billingDay ? Number(data.billingDay) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setIsModalOpen(false);
      setEditingProcedure(null);
      resetForm();
      toast({ title: "Procedimento atualizado" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao atualizar procedimento", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/procedures/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setDeletingProcedure(null);
      toast({ title: "Procedimento removido" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao remover procedimento", description: err.message });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<Procedure>(`/api/procedures/${id}/toggle-active`, { method: "PATCH" }),
    onSuccess: (updated: Procedure) => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      toast({ title: updated.isActive ? "Procedimento ativado" : "Procedimento desativado" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao alterar status", description: err.message });
    },
  });

  const { data: overheadData, isLoading: overheadLoading } = useQuery<OverheadAnalysis>({
    queryKey: ["overhead-analysis", analysisMonth, analysisYear, costingProcedure?.id],
    queryFn: () =>
      apiFetch(
        `/api/procedures/overhead-analysis?month=${analysisMonth}&year=${analysisYear}` +
          (costingProcedure ? `&procedureId=${costingProcedure.id}` : "")
      ),
    enabled: !!costingProcedure && hasCostFeature,
    staleTime: 30_000,
  });

  const computedFixedCostPerSession =
    overheadData && costingProcedure
      ? (overheadData.procedureStats?.fixedCostPerSession ??
          (overheadData.costPerHour * (costingProcedure.durationMinutes / 60)) /
            Math.max(
              costingProcedure.modalidade !== "individual"
                ? (costingProcedure.maxCapacity ?? 1)
                : 1,
              1
            ))
      : null;

  const updateCostsMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      priceOverride: string;
      variableCost: string;
      notes: string;
    }) => {
      const parsed = procedureCostFormSchema.safeParse({
        priceOverride: data.priceOverride,
        variableCost: data.variableCost,
        notes: data.notes,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return apiFetch(`/api/procedures/${data.id}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProcedureCostPayload(parsed.data)),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setCostingProcedure(null);
      toast({ title: "Custos da clínica atualizados" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao salvar custos", description: err.message });
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function openConfigCosts(proc: Procedure) {
    if (!hasCostFeature) return;
    setCostingProcedure(proc);
    setCostForm({
      priceOverride:
        proc.clinicCost?.priceOverride ? String(proc.clinicCost.priceOverride) : "",
      variableCost:
        proc.clinicCost?.variableCost && proc.clinicCost.variableCost !== "0"
          ? String(proc.clinicCost.variableCost)
          : "",
      notes: proc.clinicCost?.notes ?? "",
    });
  }

  function resetForm() {
    setForm({ ...procedureFormDefaults });
  }

  function openEdit(proc: Procedure) {
    setEditingProcedure(proc);
    setForm({
      name: proc.name,
      category: proc.category as "Pilates" | "Estética" | "Reabilitação",
      modalidade: (proc.modalidade ?? "individual") as "individual" | "dupla" | "grupo",
      durationMinutes: proc.durationMinutes,
      price: String(proc.price),
      cost: String(proc.cost ?? "0"),
      description: proc.description ?? "",
      maxCapacity: proc.maxCapacity ?? 1,
      onlineBookingEnabled: proc.onlineBookingEnabled ?? false,
      monthlyPrice: undefined,
      billingDay: undefined,
      accountingAccountId: (proc as any).accountingAccountId
        ? String((proc as any).accountingAccountId)
        : "",
      isGlobal: proc.isGlobal ?? false,
    });
    setIsModalOpen(true);
  }

  function handleSubmit() {
    const parsed = procedureFormSchema.safeParse(form);
    if (!parsed.success) {
      toast({ variant: "destructive", title: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      return;
    }
    const payload = buildProcedurePayload(parsed.data);
    if (editingProcedure) {
      updateMutation.mutate({ ...payload, id: editingProcedure.id } as any);
    } else {
      createMutation.mutate(payload as any);
    }
  }

  function generateCatalog() {
    const { clinicName, tagline, showPrices, selectedCategories, introText } = catalogOptions;
    const categoryOrder = ["Reabilitação", "Estética", "Pilates"];
    const catColors: Record<string, string> = {
      Reabilitação: "#2563eb",
      Estética: "#db2777",
      Pilates: "#7c3aed",
    };
    const grouped = categoryOrder
      .filter((cat) => selectedCategories.includes(cat))
      .map((cat) => ({
        cat,
        label: cat,
        color: catColors[cat] ?? "#334155",
        items: allProcedures.filter((p) => p.category === cat && p.isActive),
      }))
      .filter((g) => g.items.length > 0);

    const today = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const itemsHtml = (items: Procedure[], color: string) =>
      items
        .map(
          (p) => `
        <div class="proc-card">
          <div class="proc-header">
            <div class="proc-name">${p.name}</div>
            <div class="proc-meta">
              <span class="proc-duration">⏱ ${p.durationMinutes} min</span>
              ${showPrices ? `<span class="proc-price" style="color:${color}">${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(p.price))}</span>` : ""}
            </div>
          </div>
          ${p.description ? `<div class="proc-desc">${p.description}</div>` : ""}
        </div>
      `
        )
        .join("");

    const sectionsHtml = grouped
      .map(
        (g) => `
      <div class="category-section">
        <div class="category-header" style="border-left: 4px solid ${g.color}">
          <span class="category-title" style="color:${g.color}">${g.label}</span>
          <span class="category-count">${g.items.length} serviço${g.items.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="proc-grid">${itemsHtml(g.items, g.color)}</div>
      </div>
    `
      )
      .join("");

    const activeCount = allProcedures.filter((p) => p.isActive).length;
    const html = getCatalogHtml(clinicName, tagline, introText, showPrices, sectionsHtml, activeCount, today);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setIsCatalogModalOpen(false);
  }

  // ── Computed stats ────────────────────────────────────────────────────────

  const activeProcs   = allProcedures.filter((p) => p.isActive);
  const inactiveCount = allProcedures.length - activeProcs.length;
  const avgPrice =
    activeProcs.length
      ? activeProcs.reduce((s, p) => s + Number(p.price), 0) / activeProcs.length
      : 0;
  const avgMargin =
    hasCostFeature && activeProcs.length
      ? activeProcs.reduce((s, p) => s + getMargin(p.price, p.cost ?? 0), 0) / activeProcs.length
      : null;
  const withClinicCosts = hasCostFeature
    ? allProcedures.filter((p) => !!p.clinicCost).length
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Procedimentos">
      <div className="space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Catálogo de serviços, preços e indicadores da clínica
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              className="h-9 px-3 sm:px-4 rounded-xl gap-1.5 text-sm"
              onClick={() => setIsCatalogModalOpen(true)}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Gerar Catálogo</span>
              <span className="sm:hidden">Catálogo</span>
            </Button>
            {isAdmin && (
              <PrimaryActionButton
                label="Novo Procedimento"
                mobileLabel="Novo"
                onClick={() => { resetForm(); setEditingProcedure(null); setIsModalOpen(true); }}
              />
            )}
          </div>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatCard
            icon={<Stethoscope className="w-4 h-4" />}
            label="Procedimentos ativos"
            value={isLoading ? "—" : String(activeProcs.length)}
            sub={inactiveCount > 0 ? `${inactiveCount} inativo${inactiveCount !== 1 ? "s" : ""}` : "todos ativos"}
            colorClass="text-primary"
            bgClass="bg-primary/10"
          />
          <StatCard
            icon={<span className="text-[11px] font-bold">R$</span>}
            label="Preço médio"
            value={isLoading ? "—" : formatCurrency(avgPrice)}
            sub="procedimentos ativos"
            colorClass="text-emerald-700"
            bgClass="bg-emerald-50"
          />
          {avgMargin !== null ? (
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Margem média"
              value={`${avgMargin.toFixed(0)}%`}
              sub={avgMargin >= 50 ? "Saudável" : avgMargin >= 35 ? "Atenção" : "Baixa"}
              colorClass={avgMargin >= 50 ? "text-emerald-700" : avgMargin >= 35 ? "text-amber-600" : "text-rose-600"}
              bgClass={avgMargin >= 50 ? "bg-emerald-50" : avgMargin >= 35 ? "bg-amber-50" : "bg-rose-50"}
            />
          ) : (
            <LockedStatCard label="Margem média" plan="Pro" />
          )}
          {withClinicCosts !== null ? (
            <StatCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Custos configurados"
              value={String(withClinicCosts)}
              sub={`de ${allProcedures.length} procedimento${allProcedures.length !== 1 ? "s" : ""}`}
              colorClass="text-violet-700"
              bgClass="bg-violet-50"
            />
          ) : (
            <LockedStatCard label="Custos configurados" plan="Pro" />
          )}
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* Category pills */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setSelectedCategory(c.value)}
                className={cn(
                  "px-3 h-7 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  selectedCategory === c.value
                    ? "bg-card shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar procedimento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* View toggle */}
          <div className="sm:ml-auto flex items-center gap-1 p-1 bg-muted rounded-xl">
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === "cards"
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Cards"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === "list"
                  ? "bg-card shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Lista"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {isLoading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : procedures.length === 0 ? (
          <EmptyState
            isAdmin={isAdmin}
            onNew={() => { resetForm(); setEditingProcedure(null); setIsModalOpen(true); }}
          />
        ) : viewMode === "cards" ? (
          <CardView
            procedures={procedures}
            onEdit={openEdit}
            onDelete={setDeletingProcedure}
            isAdmin={isAdmin}
            hasCostFeature={hasCostFeature}
            onToggleActive={(p) => toggleActiveMutation.mutate(p.id)}
            onConfigCosts={hasCostFeature && isAdmin ? openConfigCosts : undefined}
          />
        ) : (
          <ListView
            procedures={procedures}
            onEdit={openEdit}
            onDelete={setDeletingProcedure}
            isAdmin={isAdmin}
            hasCostFeature={hasCostFeature}
            onToggleActive={(p) => toggleActiveMutation.mutate(p.id)}
            onConfigCosts={hasCostFeature && isAdmin ? openConfigCosts : undefined}
          />
        )}

        {/* ── Upgrade banner (only when feature is locked) ──────────────── */}
        {!hasCostFeature && allProcedures.length > 0 && (
          <UpgradeBanner />
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <ProcedureFormModal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          if (!open) { setIsModalOpen(false); setEditingProcedure(null); resetForm(); }
          else { setIsModalOpen(true); }
        }}
        editingProcedure={editingProcedure}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        accountingAccounts={accountingAccounts}
        showAccountingField={showAccountingField}
        isSuperAdmin={isSuperAdmin}
      />

      <CatalogModal
        isOpen={isCatalogModalOpen}
        onOpenChange={setIsCatalogModalOpen}
        catalogOptions={catalogOptions}
        setCatalogOptions={setCatalogOptions}
        onGenerate={generateCatalog}
      />

      {hasCostFeature && (
        <CostAnalysisModal
          procedure={costingProcedure}
          onOpenChange={(open) => { if (!open) setCostingProcedure(null); }}
          analysisMonth={analysisMonth}
          setAnalysisMonth={setAnalysisMonth}
          analysisYear={analysisYear}
          setAnalysisYear={setAnalysisYear}
          overheadData={overheadData}
          overheadLoading={overheadLoading}
          costForm={costForm}
          setCostForm={setCostForm}
          computedFixedCostPerSession={computedFixedCostPerSession}
          onSave={() =>
            costingProcedure &&
            updateCostsMutation.mutate({ ...costForm, id: costingProcedure.id })
          }
          isSaving={updateCostsMutation.isPending}
        />
      )}

      <DeleteConfirmationModal
        procedure={deletingProcedure}
        onOpenChange={(open) => { if (!open) setDeletingProcedure(null); }}
        onConfirm={() => deletingProcedure && deleteMutation.mutate(deletingProcedure.id)}
      />
    </AppLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, colorClass, bgClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", bgClass, colorClass)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-none mb-1">
          {label}
        </p>
        <p className={cn("text-lg font-bold leading-none tabular-nums", colorClass)}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}

function LockedStatCard({ label, plan }: { label: string; plan: string }) {
  return (
    <div className="bg-card rounded-2xl border border-dashed border-border shadow-sm p-4 flex items-center gap-3 opacity-70">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
        <Lock className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-none mb-1">
          {label}
        </p>
        <div className="flex items-center gap-1.5">
          <p className="text-base font-bold text-muted-foreground leading-none">—</p>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700">
            {plan}
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "list") {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={cn("px-4 py-3.5 animate-pulse flex items-center gap-4", i !== 4 && "border-b border-border")}>
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted rounded w-48" />
              <div className="h-2.5 bg-muted rounded w-24" />
            </div>
            <div className="h-3 bg-muted rounded w-16" />
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border shadow-sm p-4 animate-pulse space-y-3">
          <div className="flex justify-between">
            <div className="h-5 bg-muted rounded-full w-24" />
            <div className="h-5 bg-muted rounded w-16" />
          </div>
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
          <div className="pt-2 border-t border-border flex justify-between items-end">
            <div className="space-y-1">
              <div className="h-2 bg-muted rounded w-16" />
              <div className="h-6 bg-muted rounded w-20" />
            </div>
            <div className="h-5 bg-muted rounded-full w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ isAdmin, onNew }: { isAdmin?: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-2xl border border-dashed border-border">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Stethoscope className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">Nenhum procedimento encontrado</p>
      <p className="text-xs text-muted-foreground mb-5 max-w-xs">
        Adicione os serviços e procedimentos da clínica para começar a gerenciar preços e custos.
      </p>
      {isAdmin && (
        <Button size="sm" onClick={onNew} className="rounded-xl gap-1.5 h-9">
          <Plus className="h-3.5 w-3.5" /> Adicionar procedimento
        </Button>
      )}
    </div>
  );
}

function UpgradeBanner() {
  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900">
          Análise de custos e margem disponível no Plano Pro
        </p>
        <p className="text-xs text-blue-700 mt-0.5">
          Configure custos variáveis por clínica, calcule overhead automaticamente e acompanhe a margem de cada procedimento.
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white">
        Pro
      </span>
    </div>
  );
}
