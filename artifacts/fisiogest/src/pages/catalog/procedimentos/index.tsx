import { CATEGORIES, CATEGORY_CONFIG, formatCurrency, getMargin } from "./constants";
import { ProcedureCost, OverheadSchedule, OverheadAnalysis, Procedure, ViewMode } from "./types";
import { CardView, CategoryBadge, ListView, MarginBadge } from "./components";
import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Clock,
  LayoutGrid,
  LayoutList,
  Search,
  TrendingUp,
  Stethoscope,
  BookOpen,
  Printer,
  Globe,
  Power,
  PowerOff,
  DollarSign,
  Wrench,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";

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

  const [form, setForm] = useState({
    name: "",
    category: "Reabilitação",
    modalidade: "individual" as "individual" | "dupla" | "grupo",
    durationMinutes: 60,
    price: "",
    cost: "",
    description: "",
    maxCapacity: 1,
    onlineBookingEnabled: false,
    monthlyPrice: "" as string | undefined,
    billingDay: "" as string | undefined,
  });

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
      return apiFetch(`/api/procedures/${data.id}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceOverride: data.priceOverride !== "" ? Number(data.priceOverride) : null,
          // fixedCost is intentionally 0 — overhead is always computed dynamically
          // from clinic expenses / available hours and never stored as a snapshot.
          fixedCost: 0,
          variableCost: data.variableCost !== "" ? Number(data.variableCost) : 0,
          notes: data.notes || null,
        }),
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
    setForm({ name: "", category: "Reabilitação", modalidade: "individual", durationMinutes: 60, price: "", cost: "", description: "", maxCapacity: 1, onlineBookingEnabled: false, monthlyPrice: undefined, billingDay: undefined });
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
    if (editingProcedure) {
      updateMutation.mutate({ ...form, id: editingProcedure.id });
    } else {
      createMutation.mutate(form);
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

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Catálogo de Serviços — ${clinicName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
    }

    /* ── Hero header ── */
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      padding: 52px 48px 44px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: "";
      position: absolute;
      top: -60px; right: -60px;
      width: 240px; height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }
    .hero::after {
      content: "";
      position: absolute;
      bottom: -80px; left: 40%;
      width: 300px; height: 300px;
      border-radius: 50%;
      background: rgba(255,255,255,0.03);
    }
    .hero-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 12px;
    }
    .hero-name {
      font-family: 'Outfit', sans-serif;
      font-size: 40px;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #fff 60%, #7dd3fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero-tagline {
      font-size: 15px;
      color: #94a3b8;
      font-weight: 400;
      margin-bottom: 28px;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 100px;
    }

    /* ── Content ── */
    .content { padding: 40px 48px 56px; }

    .intro {
      font-size: 14px;
      color: #64748b;
      line-height: 1.7;
      margin-bottom: 36px;
      padding-bottom: 28px;
      border-bottom: 1px solid #e2e8f0;
    }

    /* ── Category sections ── */
    .category-section { margin-bottom: 36px; }

    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 14px;
    }
    .category-title {
      font-family: 'Outfit', sans-serif;
      font-size: 17px;
      font-weight: 700;
    }
    .category-count {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }

    /* ── Procedure cards ── */
    .proc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .proc-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      background: #fff;
    }
    .proc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .proc-name {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      flex: 1;
      line-height: 1.4;
    }
    .proc-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      shrink: 0;
    }
    .proc-duration {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
    }
    .proc-price {
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .proc-desc {
      font-size: 11.5px;
      color: #64748b;
      line-height: 1.55;
    }

    /* ── Footer ── */
    .footer {
      padding: 20px 48px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
    }
    .footer-brand {
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }
    .footer-date {
      font-size: 11px;
      color: #94a3b8;
    }

    /* ── No-price note ── */
    .no-price-note {
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
      margin-bottom: 28px;
    }

    /* ── Print ── */
    .print-btn {
      position: fixed;
      bottom: 24px; right: 24px;
      background: #0f172a;
      color: #fff;
      border: none;
      border-radius: 100px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25);
      display: flex; align-items: center; gap: 8px;
    }
    .print-btn:hover { background: #1e293b; }

    @media print {
      @page { size: A4; margin: 1.5cm; }
      body { background: #fff; }
      .print-btn { display: none !important; }
      .page { box-shadow: none; max-width: none; margin: 0; }
      .proc-card { break-inside: avoid; }
      .category-section { break-inside: avoid; }
      .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div class="hero-eyebrow">Portfólio de Serviços</div>
      <div class="hero-name">${clinicName}</div>
      <div class="hero-tagline">${tagline}</div>
      <div class="hero-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
        ${allProcedures.filter(p => p.isActive).length} serviços disponíveis
      </div>
    </div>

    <div class="content">
      <div class="intro">
        ${introText}
      </div>

      ${!showPrices ? `<div class="no-price-note">* Entre em contato para informações sobre valores e pacotes personalizados.</div>` : ""}

      ${sectionsHtml}
    </div>

    <div class="footer">
      <div class="footer-brand">${clinicName}</div>
      <div class="footer-date">Gerado em ${today}</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Imprimir / Salvar PDF
  </button>
</body>
</html>`;

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

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      <Dialog open={isModalOpen} onOpenChange={open => { if (!open) { setIsModalOpen(false); setEditingProcedure(null); resetForm(); } }}>
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editingProcedure ? "Editar Procedimento" : "Novo Procedimento"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Fisioterapia Ortopédica"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categoria *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Reabilitação">Reabilitação</SelectItem>
                    <SelectItem value="Estética">Estética</SelectItem>
                    <SelectItem value="Pilates">Pilates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Modalidade *</Label>
                <Select value={form.modalidade} onValueChange={v => setForm(f => ({ ...f, modalidade: v as "individual" | "dupla" | "grupo", maxCapacity: v === "individual" ? 1 : v === "dupla" ? 2 : f.maxCapacity < 3 ? 10 : f.maxCapacity }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual (1 pessoa)</SelectItem>
                    <SelectItem value="dupla">Dupla (2 pessoas)</SelectItem>
                    <SelectItem value="grupo">Grupo (3+ pessoas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duração (min) *</Label>
                <Input
                  type="number"
                  value={form.durationMinutes}
                  onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) || 60 }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label>
                  Vagas simultâneas
                  {form.modalidade !== "grupo" && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(fixo por modalidade)</span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={form.modalidade === "grupo" ? 3 : form.modalidade === "dupla" ? 2 : 1}
                  value={form.maxCapacity}
                  disabled={form.modalidade !== "grupo"}
                  onChange={e => setForm(f => ({ ...f, maxCapacity: parseInt(e.target.value) || 3 }))}
                  className="rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
                />
                {form.modalidade === "individual" && (
                  <p className="text-[10px] text-muted-foreground">1 vaga — atendimento exclusivo</p>
                )}
                {form.modalidade === "dupla" && (
                  <p className="text-[10px] text-muted-foreground">2 vagas — atendimento em dupla</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Preço padrão / sessão (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,00"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label>Custo direto / sessão (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  placeholder="0,00"
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Real-time margin preview */}
            {form.price !== "" && (
              <div className={cn(
                "flex items-center justify-between rounded-xl px-4 py-2.5 text-sm",
                formMargin >= 60 ? "bg-emerald-50 text-emerald-700"
                  : formMargin >= 35 ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-600"
              )}>
                <span className="font-medium">Margem de contribuição</span>
                <span className="font-bold text-base">{formMargin.toFixed(1)}%</span>
              </div>
            )}

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Descrição do procedimento..."
                className="rounded-xl resize-none"
              />
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
              <strong>Periodicidade e cobrança</strong> são configuradas nos <strong>Pacotes</strong> — o procedimento define apenas o produto (preço avulso e custo direto por sessão).
            </div>

            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border-2 transition-colors",
              form.onlineBookingEnabled ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-slate-50"
            )}>
              <div className="flex items-center gap-2.5">
                <Globe className={cn("w-4 h-4", form.onlineBookingEnabled ? "text-primary" : "text-slate-400")} />
                <div>
                  <p className={cn("text-sm font-semibold", form.onlineBookingEnabled ? "text-primary" : "text-slate-700")}>
                    Agendamento Online
                  </p>
                  <p className="text-xs text-slate-400">Disponível no portal público</p>
                </div>
              </div>
              <Switch
                checked={form.onlineBookingEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, onlineBookingEnabled: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => { setIsModalOpen(false); setEditingProcedure(null); resetForm(); }}
            >
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={handleSubmit}
              disabled={!form.name || !form.price || createMutation.isPending || updateMutation.isPending}
            >
              {editingProcedure ? "Salvar alterações" : "Criar procedimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Catalog Options Modal ───────────────────────────────────────── */}
      <Dialog open={isCatalogModalOpen} onOpenChange={setIsCatalogModalOpen}>
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> Gerar Catálogo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label>Nome da clínica</Label>
              <Input
                value={catalogOptions.clinicName}
                onChange={e => setCatalogOptions(o => ({ ...o, clinicName: e.target.value }))}
                className="rounded-xl"
                placeholder="Nome da clínica"
              />
            </div>

            <div className="space-y-1">
              <Label>Slogan / descrição curta</Label>
              <Input
                value={catalogOptions.tagline}
                onChange={e => setCatalogOptions(o => ({ ...o, tagline: e.target.value }))}
                className="rounded-xl"
                placeholder="Ex: Cuidando de você com excelência"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Texto de apresentação</Label>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  (catalogOptions.clinicType === "autonomo" || catalogOptions.clinicType === "profissional")
                    ? "bg-purple-50 text-purple-600"
                    : "bg-blue-50 text-blue-600"
                )}>
                  {(catalogOptions.clinicType === "autonomo" || catalogOptions.clinicType === "profissional")
                    ? "Profissional autônomo"
                    : "Clínica / Empresa"}
                </span>
              </div>
              <Textarea
                value={catalogOptions.introText}
                onChange={e => setCatalogOptions(o => ({ ...o, introText: e.target.value }))}
                rows={4}
                className="rounded-xl resize-none text-sm"
                placeholder="Texto de apresentação da clínica no catálogo..."
              />
              <p className="text-[10px] text-slate-400">Texto ajustado automaticamente com base no tipo de cadastro. Você pode personalizar.</p>
            </div>

            <div className="space-y-2">
              <Label>Categorias a incluir</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "Reabilitação", label: "Reabilitação" },
                  { value: "Estética", label: "Estética" },
                  { value: "Pilates", label: "Pilates" },
                ].map(c => {
                  const active = catalogOptions.selectedCategories.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setCatalogOptions(o => ({
                          ...o,
                          selectedCategories: active
                            ? o.selectedCategories.filter(x => x !== c.value)
                            : [...o.selectedCategories, c.value],
                        }))
                      }
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        active
                          ? "bg-primary text-white border-primary"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Exibir preços (R$)</p>
                <p className="text-xs text-slate-500">Mostre ou oculte os valores no catálogo</p>
              </div>
              <Switch
                checked={catalogOptions.showPrices}
                onCheckedChange={v => setCatalogOptions(o => ({ ...o, showPrices: v }))}
              />
            </div>

            <div className={cn(
              "flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs",
              catalogOptions.showPrices
                ? "bg-blue-50 text-blue-700"
                : "bg-slate-50 text-slate-500"
            )}>
              <Printer className="w-3.5 h-3.5 shrink-0" />
              {catalogOptions.showPrices
                ? "O catálogo será aberto com os preços visíveis. Use Ctrl+P para salvar como PDF."
                : "O catálogo será aberto sem preços. Ideal para apresentação pública."}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setIsCatalogModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={generateCatalog}
              disabled={catalogOptions.selectedCategories.length === 0}
            >
              <Printer className="mr-1.5 h-4 w-4" /> Abrir Catálogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clinic Cost Configuration Dialog ────────────────────────────── */}
      <Dialog open={!!costingProcedure} onOpenChange={open => { if (!open) setCostingProcedure(null); }}>
        <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Análise de Custos — {costingProcedure?.name}
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              O overhead é calculado automaticamente (despesas da clínica ÷ horas disponíveis).
              O custo variável é inserido manualmente para materiais e insumos por sessão.
              {costingProcedure?.modalidade !== "individual" && (
                <span className="ml-1 text-violet-600 font-medium">
                  Overhead rateado por {costingProcedure?.maxCapacity ?? 1} participantes.
                </span>
              )}
              {costingProcedure?.isGlobal && (
                <span className="ml-1 text-blue-600 font-medium">Procedimento global.</span>
              )}
            </p>
          </DialogHeader>

          {/* ── Period selector ─────────────────────────────────── */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-slate-500 shrink-0">Período de referência:</span>
            <select
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
              value={analysisMonth}
              onChange={e => setAnalysisMonth(Number(e.target.value))}
            >
              {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
              value={analysisYear}
              onChange={e => setAnalysisYear(Number(e.target.value))}
            >
              {[analysisYear - 1, analysisYear, analysisYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">

            {/* ── Overhead breakdown panel ─────────────────────── */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Wrench className="w-3 h-3" /> Overhead da Clínica — calculado automaticamente
              </div>
              {overheadLoading ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">Calculando…</div>
              ) : overheadData ? (
                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-3 px-3 py-2.5 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total de despesas</p>
                      <p className="font-semibold text-slate-800">{formatCurrency(overheadData.totalOverhead)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Horas disponíveis</p>
                      <p className="font-semibold text-slate-800">{overheadData.totalAvailableHours}h</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Custo por hora</p>
                      <p className="font-bold text-emerald-700">{formatCurrency(overheadData.costPerHour)}/h</p>
                    </div>
                  </div>

                  {/* Per-procedure overhead cost */}
                  <div className="grid grid-cols-2 gap-x-4 px-3 py-2.5 bg-emerald-50/60">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        Overhead estimado / part. <span className="normal-case">({costingProcedure?.durationMinutes} min)</span>
                      </p>
                      <p className="text-base font-bold text-emerald-700">
                        {computedFixedCostPerSession !== null ? formatCurrency(computedFixedCostPerSession) : "—"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatCurrency(overheadData.costPerHour)}/h × {((costingProcedure?.durationMinutes ?? 0) / 60).toFixed(2)}h
                        {costingProcedure?.modalidade !== "individual" && (
                          <> ÷ {costingProcedure?.maxCapacity ?? 1} cap.</>
                        )}
                      </p>
                    </div>
                    {overheadData.procedureStats && (
                      <div className="text-right">
                        {/* For group procedures show real overhead using actual avg participants */}
                        {overheadData.procedureStats.avgActualParticipants !== null ? (
                          <>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                              Overhead real / part.
                            </p>
                            <p className="text-base font-bold text-slate-700">
                              {formatCurrency(overheadData.procedureStats.fixedCostPerSessionReal)}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Média {overheadData.procedureStats.avgActualParticipants} part.
                              · {overheadData.procedureStats.uniqueCompletedSessions} sessões
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                              Overhead total / mês
                            </p>
                            <p className="text-base font-bold text-slate-700">
                              {formatCurrency(overheadData.procedureStats.fixedCostAllocatedMonthly)}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {overheadData.procedureStats.confirmedAppointments} atend.
                              · {overheadData.procedureStats.totalHoursUsed}h
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Schedule details */}
                  {overheadData.schedules.length > 0 && (
                    <div className="px-3 py-2 text-[10px] text-slate-400 flex flex-wrap gap-3">
                      {overheadData.schedules.map((s, i) => (
                        <span key={i}>{s.name}: {s.startTime}–{s.endTime} · {s.workingDaysInMonth} dias · {s.hoursInMonth}h</span>
                      ))}
                    </div>
                  )}

                  {overheadData.totalAvailableHours === 0 && (
                    <div className="px-3 py-2 text-[10px] text-amber-600 bg-amber-50">
                      Nenhuma agenda ativa encontrada. Cadastre a agenda da clínica para calcular automaticamente.
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  Sem dados de agenda/despesas para o período selecionado.
                </div>
              )}
            </div>

            {/* ── Manual inputs ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Preço cobrado pela clínica (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={costForm.priceOverride}
                  onChange={e => setCostForm(f => ({ ...f, priceOverride: e.target.value }))}
                  placeholder={`Padrão: ${formatCurrency(costingProcedure?.price ?? 0)}`}
                  className="rounded-xl"
                />
                <p className="text-[10px] text-slate-400">Deixe em branco para usar o preço base.</p>
              </div>
              <div className="space-y-1">
                <Label>Custo variável / sessão (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={costForm.variableCost}
                  onChange={e => setCostForm(f => ({ ...f, variableCost: e.target.value }))}
                  placeholder="0,00"
                  className="rounded-xl"
                />
                <p className="text-[10px] text-slate-400">Materiais, insumos por sessão.</p>
              </div>
            </div>

            {/* ── Real-time margin summary ───────────────────────── */}
            {(() => {
              const price  = Number(costForm.priceOverride || costingProcedure?.effectivePrice || costingProcedure?.price || 0);
              const fixed  = computedFixedCostPerSession ?? 0;
              const variable = Number(costForm.variableCost || 0);
              const total  = fixed + variable;
              if (!price) return null;
              const m = ((price - total) / price) * 100;
              return (
                <div className={cn(
                  "rounded-xl border px-4 py-3",
                  m >= 60 ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                           : m >= 35 ? "bg-amber-50 border-amber-100 text-amber-800"
                           : "bg-red-50 border-red-100 text-red-800"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Margem por sessão</span>
                    <span className="text-xl font-bold">{m.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 text-[11px] opacity-80 gap-x-2">
                    <span>Preço: {formatCurrency(price)}</span>
                    <span>Overhead: {formatCurrency(fixed)}</span>
                    <span>Variável: {formatCurrency(variable)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                value={costForm.notes}
                onChange={e => setCostForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Ex: Inclui material descartável, taxa de sala..."
                className="rounded-xl resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCostingProcedure(null)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => costingProcedure && updateCostsMutation.mutate({
                ...costForm,
                id: costingProcedure.id,
              })}
              disabled={updateCostsMutation.isPending}
            >
              <DollarSign className="mr-1.5 h-4 w-4" />
              {updateCostsMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!deletingProcedure} onOpenChange={open => { if (!open) setDeletingProcedure(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover procedimento?</AlertDialogTitle>
            <AlertDialogDescription>
              O procedimento <strong>"{deletingProcedure?.name}"</strong> será removido permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingProcedure && deleteMutation.mutate(deletingProcedure.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

