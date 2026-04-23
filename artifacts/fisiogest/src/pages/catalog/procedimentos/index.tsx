import { CATEGORIES, CATEGORY_CONFIG, formatCurrency, getMargin } from "./constants";
import { ProcedureCost, OverheadSchedule, OverheadAnalysis, Procedure, ViewMode } from "./types";
import {
  CardView,
  CategoryBadge,
  ListView,
  MarginBadge,
  CatalogModal,
  CostAnalysisModal,
  DeleteConfirmationModal,
  ProcedureFormModal,
} from "./components";
import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  LayoutGrid,
  LayoutList,
  Search,
  Stethoscope,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";
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
  const { hasRole, isSuperAdmin } = useAuth();
  const isAdmin = hasRole("admin") || isSuperAdmin;

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);
  const [deletingProcedure, setDeletingProcedure] = useState<Procedure | null>(null);
  const [costingProcedure, setCostingProcedure] = useState<Procedure | null>(null);
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

  const buildIntroText = useCallback((type: string, name: string, responsible?: string | null): string => {
    const isAutonomo = type === "autonomo" || type === "profissional";
    if (isAutonomo) {
      return `Conheça nossos serviços e tratamentos especializados. Com dedicação e técnicas modernas, ofereço atendimento personalizado para cada paciente.`;
    }
    return `Conheça nossos serviços e tratamentos especializados. Nossa equipe está pronta para oferecer o melhor cuidado, com técnicas modernas e atendimento personalizado para cada paciente.`;
  }, []);

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

  const baseUrl = isAdmin
    ? (selectedCategory === "all" ? "/api/procedures?includeInactive=true" : `/api/procedures?category=${selectedCategory}&includeInactive=true`)
    : (selectedCategory === "all" ? "/api/procedures" : `/api/procedures?category=${selectedCategory}`);
  const url = baseUrl;

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
    queryFn: () => apiFetch<Procedure[]>(url),
  });

  const procedures = allProcedures.filter(p =>
    search.trim() === "" || p.name.toLowerCase().includes(search.toLowerCase())
  );

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
    mutationFn: (id: number) => apiFetch<Procedure>(`/api/procedures/${id}/toggle-active`, { method: "PATCH" }),
    onSuccess: (updated: Procedure) => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      toast({ title: updated.isActive ? "Procedimento ativado" : "Procedimento desativado" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao alterar status", description: err.message });
    },
  });

  // ── Overhead analysis query (fires when cost dialog is open) ──────────────
  const { data: overheadData, isLoading: overheadLoading } = useQuery<OverheadAnalysis>({
    queryKey: ["overhead-analysis", analysisMonth, analysisYear, costingProcedure?.id],
    queryFn: () => apiFetch(
      `/api/procedures/overhead-analysis?month=${analysisMonth}&year=${analysisYear}` +
      (costingProcedure ? `&procedureId=${costingProcedure.id}` : "")
    ),
    enabled: !!costingProcedure,
    staleTime: 30_000,
  });

  // Use the backend-computed value when available (already adjusted for group capacity).
  // Fall back to local calculation only when procedureStats is not yet loaded.
  const computedFixedCostPerSession = overheadData && costingProcedure
    ? (overheadData.procedureStats?.fixedCostPerSession ??
        overheadData.costPerHour * (costingProcedure.durationMinutes / 60) /
        Math.max((costingProcedure.modalidade !== "individual" ? (costingProcedure.maxCapacity ?? 1) : 1), 1))
    : null;

  const updateCostsMutation = useMutation({
    mutationFn: async (data: { id: number; priceOverride: string; variableCost: string; notes: string }) => {
      const parsed = procedureCostFormSchema.safeParse({
        priceOverride: data.priceOverride,
        variableCost: data.variableCost,
        notes: data.notes,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      // fixedCost is intentionally 0 — overhead is always computed dynamically
      // from clinic expenses / available hours and never stored as a snapshot.
      return apiFetch(`/api/procedures/${data.id}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProcedureCostPayload(parsed.data)),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setCostingProcedure(null);
      toast({ title: "Custos da clínica atualizados com sucesso" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao salvar custos", description: err.message });
    },
  });

  function openConfigCosts(proc: Procedure) {
    setCostingProcedure(proc);
    setCostForm({
      priceOverride: proc.clinicCost?.priceOverride ? String(proc.clinicCost.priceOverride) : "",
      variableCost: proc.clinicCost?.variableCost && proc.clinicCost.variableCost !== "0" ? String(proc.clinicCost.variableCost) : "",
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
      category: proc.category,
      modalidade: (proc.modalidade ?? "individual") as "individual" | "dupla" | "grupo",
      durationMinutes: proc.durationMinutes,
      price: String(proc.price),
      cost: String(proc.cost ?? "0"),
      description: proc.description ?? "",
      maxCapacity: proc.maxCapacity ?? 1,
      onlineBookingEnabled: proc.onlineBookingEnabled ?? false,
      monthlyPrice: undefined,
      billingDay: undefined,
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

  const formMargin = getMargin(form.price, form.cost);
  const avgPrice = allProcedures.length ? allProcedures.reduce((s, p) => s + Number(p.price), 0) / allProcedures.length : 0;
  const avgMargin = allProcedures.length ? allProcedures.reduce((s, p) => s + getMargin(p.price, p.cost ?? 0), 0) / allProcedures.length : 0;

  function generateCatalog() {
    const { clinicName, tagline, showPrices, selectedCategories, introText } = catalogOptions;

    const categoryOrder = ["Reabilitação", "Estética", "Pilates"];
    const catColors: Record<string, string> = { "Reabilitação": "#2563eb", "Estética": "#db2777", "Pilates": "#7c3aed" };

    const grouped = categoryOrder
      .filter(cat => selectedCategories.includes(cat))
      .map(cat => ({
        cat,
        label: cat,
        color: catColors[cat] ?? "#334155",
        items: allProcedures.filter(p => p.category === cat && p.isActive),
      }))
      .filter(g => g.items.length > 0);

    const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    const itemsHtml = (items: Procedure[], color: string) =>
      items.map(p => `
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
      `).join("");

    const sectionsHtml = grouped.map(g => `
      <div class="category-section">
        <div class="category-header" style="border-left: 4px solid ${g.color}">
          <span class="category-title" style="color:${g.color}">${g.label}</span>
          <span class="category-count">${g.items.length} serviço${g.items.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="proc-grid">
          ${itemsHtml(g.items, g.color)}
        </div>
      </div>
    `).join("");

    const activeCount = allProcedures.filter(p => p.isActive).length;
    const html = getCatalogHtml(clinicName, tagline, introText, showPrices, sectionsHtml, activeCount, today);

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setIsCatalogModalOpen(false);
  }

  return (
    <AppLayout title="Procedimentos">
      <div className="space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-800">Procedimentos</h1>
            <p className="text-sm text-slate-500">Gerencie os serviços e procedimentos da clínica</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 px-4 rounded-lg"
              onClick={() => setIsCatalogModalOpen(true)}
            >
              <BookOpen className="mr-1.5 h-4 w-4" /> Gerar Catálogo
            </Button>
            <Button
              className="h-9 px-4 rounded-lg shadow-md shadow-primary/20"
              onClick={() => { resetForm(); setEditingProcedure(null); setIsModalOpen(true); }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo Procedimento
            </Button>
          </div>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total de procedimentos", value: allProcedures.length, icon: <Stethoscope className="w-4 h-4" />, color: "text-primary" },
            { label: "Preço médio", value: formatCurrency(avgPrice), icon: <span className="text-xs font-bold">R$</span>, color: "text-emerald-600" },
            { label: "Margem média", value: `${avgMargin.toFixed(0)}%`, icon: <TrendingUp className="w-4 h-4" />, color: avgMargin >= 50 ? "text-emerald-600" : "text-amber-600" },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("shrink-0", s.color)}>{s.icon}</div>
              <div>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters + View toggle ───────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Category tabs */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-medium bg-white">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setSelectedCategory(c.value)}
                className={cn(
                  "px-3 h-8 transition-colors border-r border-slate-200 last:border-r-0",
                  selectedCategory === c.value ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-600"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar procedimento..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm rounded-lg"
            />
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={cn("p-1.5 transition-colors", viewMode === "cards" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-500")}
              title="Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-1.5 transition-colors border-l border-slate-200", viewMode === "list" ? "bg-primary text-white" : "hover:bg-slate-50 text-slate-500")}
              title="Lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Carregando...</div>
        ) : procedures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
            <Stethoscope className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Nenhum procedimento encontrado.</p>
            <Button variant="outline" size="sm" onClick={() => { resetForm(); setEditingProcedure(null); setIsModalOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar procedimento
            </Button>
          </div>
        ) : viewMode === "cards" ? (
          <CardView procedures={procedures} onEdit={openEdit} onDelete={setDeletingProcedure} isAdmin={isAdmin} onToggleActive={(p) => toggleActiveMutation.mutate(p.id)} onConfigCosts={openConfigCosts} />
        ) : (
          <ListView procedures={procedures} onEdit={openEdit} onDelete={setDeletingProcedure} isAdmin={isAdmin} onToggleActive={(p) => toggleActiveMutation.mutate(p.id)} onConfigCosts={openConfigCosts} />
        )}
      </div>

      <ProcedureFormModal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsModalOpen(false);
            setEditingProcedure(null);
            resetForm();
          } else {
            setIsModalOpen(true);
          }
        }}
        editingProcedure={editingProcedure}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
      />

      <CatalogModal
        isOpen={isCatalogModalOpen}
        onOpenChange={setIsCatalogModalOpen}
        catalogOptions={catalogOptions}
        setCatalogOptions={setCatalogOptions}
        onGenerate={generateCatalog}
      />

      <CostAnalysisModal
        procedure={costingProcedure}
        onOpenChange={open => { if (!open) setCostingProcedure(null); }}
        analysisMonth={analysisMonth}
        setAnalysisMonth={setAnalysisMonth}
        analysisYear={analysisYear}
        setAnalysisYear={setAnalysisYear}
        overheadData={overheadData}
        overheadLoading={overheadLoading}
        costForm={costForm}
        setCostForm={setCostForm}
        computedFixedCostPerSession={computedFixedCostPerSession}
        onSave={() => costingProcedure && updateCostsMutation.mutate({
          ...costForm,
          id: costingProcedure.id,
        })}
        isSaving={updateCostsMutation.isPending}
      />

      <DeleteConfirmationModal
        procedure={deletingProcedure}
        onOpenChange={open => { if (!open) setDeletingProcedure(null); }}
        onConfirm={() => deletingProcedure && deleteMutation.mutate(deletingProcedure.id)}
      />
    </AppLayout>
  );
}

