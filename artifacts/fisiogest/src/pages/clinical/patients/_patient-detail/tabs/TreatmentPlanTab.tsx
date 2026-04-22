import { useParams, useLocation } from "wouter";
import { apiFetch } from "@/utils/api";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetPatient,
  useCreateAnamnesis,
  useListEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
  useListEvolutions,
  useCreateEvolution,
  useUpdateEvolution,
  useDeleteEvolution,
  useGetDischarge,
  useSaveDischarge,
  useUpdatePatient,
  useDeletePatient,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Phone, Mail, Calendar, Activity, ClipboardList, TrendingUp,
  FileText, DollarSign, History, Plus, ChevronDown, ChevronUp, User,
  MapPin, Stethoscope, Target, CheckCircle, Clock, XCircle, AlertCircle,
  LogOut, Pencil, Trash2, ShieldAlert, UserCheck, Lock, Paperclip, Upload,
  FileImage, File, Download, ScrollText, Printer, BadgeCheck, CalendarDays,
  ClipboardCheck, PenLine, Package, Layers, RefreshCw, Info,
  Milestone, RotateCcw, Filter,
  Check, ArrowUpRight, Zap, X,
  Wallet, TrendingDown, ArrowDownRight,
  Sparkles, Leaf, Droplets, Sun, Dumbbell, Scale, Ruler, FlaskConical,
  ShieldCheck, Link2, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/utils/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { PhotosTab } from "../../photos-tab";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para _patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "../types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "../utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "../utils/print-html";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

function TreatmentPlanItemsSection({
  planId,
  planItems,
  planItemsKey,
}: {
  planId: number | undefined;
  planItems: PlanProcedureItem[];
  planItemsKey: string[] | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState<"package" | "procedure" | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [selectedProcId, setSelectedProcId] = useState("");
  const [itemSpw, setItemSpw] = useState(2);
  const [itemSessions, setItemSessions] = useState<string>("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemDiscount, setItemDiscount] = useState<string>("0");
  const [itemDiscountType, setItemDiscountType] = useState<"reais" | "percent">("reais");
  const [itemCustomPrice, setItemCustomPrice] = useState<string>("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSpw, setEditSpw] = useState(1);
  const [editSessions, setEditSessions] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState<string>("0");
  const [editDiscountType, setEditDiscountType] = useState<"reais" | "percent">("reais");
  const [editCustomPrice, setEditCustomPrice] = useState<string>("");

  const { data: packages = [] } = useQuery<PkgOption[]>({
    queryKey: ["packages"],
    queryFn: () => fetch("/api/packages", {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => r.json()),
  });

  const { data: procedures = [] } = useQuery<{ id: number; name: string; price: string | number; durationMinutes: number }[]>({
    queryKey: ["procedures-active"],
    queryFn: () => fetch("/api/procedures", {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => r.json()),
  });

  const selectedPkg = packages.find(p => String(p.id) === selectedPkgId) ?? null;
  const selectedProc = procedures.find(p => String(p.id) === selectedProcId) ?? null;

  function resolveDiscountAmount(discountStr: string, discType: "reais" | "percent", basePrice: number): number {
    const d = Number(discountStr) || 0;
    if (discType === "percent") return Math.max(0, (d / 100) * basePrice);
    return Math.max(0, d);
  }

  const addMutation = useMutation({
    mutationFn: (body: object) => fetch(`/api/treatment-plans/${planId}/procedures`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
      body: JSON.stringify(body),
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.message || "Erro ao adicionar"); }
      return r.json();
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
      toast({ title: "Item adicionado ao plano!" });
      setAddMode(null);
      setSelectedPkgId(""); setSelectedProcId(""); setItemSpw(2); setItemSessions(""); setItemNotes(""); setItemDiscount("0"); setItemDiscountType("reais"); setItemCustomPrice("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      fetch(`/api/treatment-plans/${planId}/procedures/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
        body: JSON.stringify(body),
      }).then(async r => {
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.message || "Erro ao atualizar"); }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
      toast({ title: "Item atualizado!" });
      setEditingId(null);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => fetch(`/api/treatment-plans/${planId}/procedures/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => { if (!r.ok) throw new Error("Erro ao remover"); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey ?? [] });
      toast({ title: "Item removido do plano." });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  function handleAddSubmit() {
    if (!planId) return;
    if (addMode === "package" && !selectedPkgId) { toast({ title: "Selecione um pacote", variant: "destructive" }); return; }
    if (addMode === "procedure" && !selectedProcId) { toast({ title: "Selecione um procedimento", variant: "destructive" }); return; }

    const body: any = {
      sessionsPerWeek: itemSpw,
      totalSessions: itemSessions ? Number(itemSessions) : null,
      notes: itemNotes || null,
    };

    if (addMode === "package" && selectedPkg) {
      const isMensal = selectedPkg.packageType === "mensal";
      const effectivePrice = itemCustomPrice ? Number(itemCustomPrice) : (isMensal ? Number(selectedPkg.monthlyPrice ?? 0) : Number(selectedPkg.price ?? 0));
      const discAmt = resolveDiscountAmount(itemDiscount, itemDiscountType, effectivePrice);
      body.packageId = selectedPkg.id;
      body.unitPrice = itemCustomPrice ? Number(itemCustomPrice) : selectedPkg.price;
      body.unitMonthlyPrice = isMensal ? (itemCustomPrice ? Number(itemCustomPrice) : selectedPkg.monthlyPrice ?? null) : null;
      body.discount = discAmt;
      body.sessionsPerWeek = itemSpw || selectedPkg.sessionsPerWeek;
      body.totalSessions = itemSessions ? Number(itemSessions) : (selectedPkg.totalSessions ?? null);
    } else if (addMode === "procedure" && selectedProc) {
      const effectivePrice = Number(itemCustomPrice || selectedProc.price || 0);
      const sessCount = Number(itemSessions) || 1;
      const discAmt = resolveDiscountAmount(itemDiscount, itemDiscountType, effectivePrice * sessCount);
      body.procedureId = selectedProc.id;
      body.unitPrice = itemCustomPrice ? Number(itemCustomPrice) : selectedProc.price;
      body.discount = discAmt;
    }
    addMutation.mutate(body);
  }

  function startEdit(item: PlanProcedureItem) {
    setEditingId(item.id);
    setEditSpw(item.sessionsPerWeek);
    setEditSessions(String(item.totalSessions ?? ""));
    setEditNotes(item.notes ?? "");
    setEditDiscount(String(item.discount ?? "0"));
    setEditDiscountType("reais");
    setEditCustomPrice(String(item.unitPrice ?? item.price ?? ""));
  }

  function handleEditSave(item: PlanProcedureItem) {
    const isMensal = item.packageType === "mensal";
    const baseUnitPrice = Number(editCustomPrice || item.unitPrice || item.price || 0);
    const sessCount = Number(editSessions) || item.totalSessions || 1;
    const baseForDiscount = isMensal ? baseUnitPrice : baseUnitPrice * sessCount;
    const discAmt = resolveDiscountAmount(editDiscount, editDiscountType, baseForDiscount);
    const updateBody: Record<string, unknown> = {
      sessionsPerWeek: editSpw,
      totalSessions: editSessions ? Number(editSessions) : null,
      notes: editNotes || null,
      discount: discAmt,
    };
    if (editCustomPrice) updateBody.unitPrice = Number(editCustomPrice);
    updateMutation.mutate({ id: item.id, body: updateBody });
  }

  function calcItemTotal(item: PlanProcedureItem): { gross: number; discount: number; net: number } {
    const isMensal = item.packageType === "mensal";
    const discount = Number(item.discount ?? 0);
    if (isMensal) {
      const gross = Number(item.monthlyPrice ?? item.price ?? 0);
      return { gross, discount, net: Math.max(0, gross - discount) };
    }
    const isAvulso = !item.packageId;
    const unitP = Number(item.price ?? 0);
    const sessions = item.totalSessions ?? (isAvulso ? 1 : 0);
    const gross = isAvulso ? unitP * sessions : unitP;
    return { gross, discount, net: Math.max(0, gross - discount) };
  }

  // Financial totals
  const financialRows = planItems.map(item => ({ item, ...calcItemTotal(item) }));
  const totalMensal = financialRows.filter(r => r.item.packageType === "mensal").reduce((s, r) => s + r.net, 0);
  const totalSessoes = financialRows.filter(r => r.item.packageType !== "mensal").reduce((s, r) => s + r.net, 0);
  const totalDesconto = financialRows.reduce((s, r) => s + r.discount, 0);
  const totalSessions = planItems.reduce((s, i) => i.packageType === "mensal" ? s : s + (i.totalSessions ?? 0), 0);
  const estimatedWeeks = planItems
    .filter(i => i.packageType !== "mensal" && i.totalSessions && i.sessionsPerWeek > 0)
    .reduce((max, i) => Math.max(max, Math.ceil((i.totalSessions ?? 0) / i.sessionsPerWeek)), 0);
  const hasMensal = planItems.some(i => i.packageType === "mensal");
  const hasSessoes = planItems.some(i => i.packageType !== "mensal");

  if (!planId) {
    return (
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              Vincule procedimentos e pacotes ao plano
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Clique em <strong>"Salvar Plano"</strong> abaixo para registrar as informações e desbloquear a vinculação de pacotes, procedimentos avulsos, descontos e previsão financeira.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-slate-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          Procedimentos e Pacotes do Plano
        </p>
        {addMode === null && editingId === null && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2.5" onClick={() => { setAddMode("package"); setItemSpw(2); setItemSessions(""); setItemNotes(""); setItemDiscount("0"); setItemDiscountType("reais"); setItemCustomPrice(""); }}>
              <Plus className="h-3 w-3" /> Pacote
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2.5" onClick={() => { setAddMode("procedure"); setItemSpw(2); setItemSessions(""); setItemNotes(""); setItemDiscount("0"); setItemDiscountType("reais"); setItemCustomPrice(""); }}>
              <Plus className="h-3 w-3" /> Avulso
            </Button>
          </div>
        )}
      </div>

      {/* Add form */}
      {addMode !== null && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600">
            {addMode === "package" ? "➕ Adicionar pacote ao plano" : "➕ Adicionar procedimento avulso"}
          </p>

          {addMode === "package" ? (
            <Select value={selectedPkgId} onValueChange={v => {
              setSelectedPkgId(v);
              const pkg = packages.find(p => String(p.id) === v);
              if (pkg) { setItemSpw(pkg.sessionsPerWeek); setItemSessions(String(pkg.totalSessions ?? "")); setItemCustomPrice(""); }
            }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione o pacote..." /></SelectTrigger>
              <SelectContent>
                {packages.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    <span className="flex items-center gap-2">
                      {p.packageType === "mensal"
                        ? <RefreshCw className="h-3 w-3 text-emerald-500 shrink-0" />
                        : <Layers className="h-3 w-3 text-blue-500 shrink-0" />}
                      <span>{p.name}</span>
                      <span className="text-muted-foreground text-xs ml-1">
                        {p.packageType === "mensal" ? `${fmtCur(p.monthlyPrice)}/mês` : `${p.totalSessions ?? "?"} sessões · ${fmtCur(p.price)}`}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={selectedProcId} onValueChange={v => { setSelectedProcId(v); setItemCustomPrice(""); }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione o procedimento..." /></SelectTrigger>
              <SelectContent>
                {procedures.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name} — {fmtCur(p.price)}/sessão</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Catalog price info */}
          {(selectedPkg || selectedProc) && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-slate-600 flex gap-4 flex-wrap">
              {selectedPkg && (
                <>
                  <span>Procedimento: <strong>{selectedPkg.procedureName}</strong></span>
                  {selectedPkg.packageType === "mensal"
                    ? <span>Mensalidade catálogo: <strong className="text-primary">{fmtCur(selectedPkg.monthlyPrice)}</strong></span>
                    : <span>Valor catálogo: <strong className="text-primary">{fmtCur(selectedPkg.price)}</strong></span>}
                </>
              )}
              {selectedProc && (
                <span>Valor catálogo: <strong className="text-primary">{fmtCur(selectedProc.price)}</strong>/sessão</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Sessões/semana</Label>
              <Select value={String(itemSpw)} onValueChange={v => setItemSpw(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5].map(n=><SelectItem key={n} value={String(n)}>{n}x/sem</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(addMode === "procedure" || (selectedPkg && selectedPkg.packageType === "sessoes")) ? (
              <div className="space-y-1">
                <Label className="text-xs">Total de sessões</Label>
                <Input className="h-8 text-xs" type="number" min={1} placeholder="Ex: 20" value={itemSessions} onChange={e => setItemSessions(e.target.value)} />
              </div>
            ) : <div />}
          </div>

          {/* Price override + discount */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">
                Preço negociado <span className="text-slate-400 font-normal">(deixe vazio p/ usar catálogo)</span>
              </Label>
              <Input
                className="h-8 text-xs"
                type="number" min={0} step={0.01}
                placeholder={
                  selectedPkg
                    ? selectedPkg.packageType === "mensal"
                      ? `Catálogo: ${fmtCur(selectedPkg.monthlyPrice)}/mês`
                      : `Catálogo: ${fmtCur(selectedPkg.price)}`
                    : selectedProc
                      ? `Catálogo: ${fmtCur(selectedProc.price)}/sessão`
                      : "Preço unitário..."
                }
                value={itemCustomPrice}
                onChange={e => setItemCustomPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desconto <span className="text-slate-400 font-normal">(opcional)</span></Label>
              <div className="flex gap-1">
                <Input
                  className="h-8 text-xs flex-1"
                  type="number" min={0}
                  step={itemDiscountType === "percent" ? 1 : 0.01}
                  max={itemDiscountType === "percent" ? 100 : undefined}
                  placeholder="0"
                  value={itemDiscount}
                  onChange={e => setItemDiscount(e.target.value)}
                />
                <Select value={itemDiscountType} onValueChange={(v: "reais" | "percent") => { setItemDiscountType(v); setItemDiscount("0"); }}>
                  <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reais">R$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observações <span className="text-slate-400 font-normal">(opcional)</span></Label>
            <Input className="h-8 text-xs" placeholder="Ex: iniciar com baixa carga..." value={itemNotes} onChange={e => setItemNotes(e.target.value)} />
          </div>

          {/* Estimated net price preview */}
          {(selectedPkg || selectedProc) && (() => {
            const isMensal = selectedPkg?.packageType === "mensal";
            const baseUnit = itemCustomPrice
              ? Number(itemCustomPrice)
              : selectedPkg
                ? isMensal ? Number(selectedPkg.monthlyPrice ?? 0) : Number(selectedPkg.price ?? 0)
                : Number(selectedProc?.price ?? 0);
            const sessCount = Number(itemSessions) || (addMode === "procedure" ? 1 : selectedPkg?.totalSessions ?? 1);
            const baseForDiscount = isMensal ? baseUnit : baseUnit * sessCount;
            const discAmt = resolveDiscountAmount(itemDiscount, itemDiscountType, baseForDiscount);
            const net = Math.max(0, baseForDiscount - discAmt);
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2">
                <span className="text-slate-600">
                  {discAmt > 0 && <span className="line-through text-slate-400 mr-1.5">{fmtCur(baseForDiscount)}</span>}
                  Valor final estimado: <strong className="text-emerald-700 text-sm">{fmtCur(net)}</strong>
                  {isMensal && <span className="text-slate-500">/mês</span>}
                  {!isMensal && sessCount > 1 && <span className="text-slate-500 ml-1">({sessCount} × {fmtCur(baseUnit)})</span>}
                </span>
                {discAmt > 0 && (
                  <span className="text-emerald-600 font-semibold whitespace-nowrap">
                    Desc: {fmtCur(discAmt)}
                    {itemDiscountType === "percent" && <span className="text-slate-400 ml-0.5">({itemDiscount}%)</span>}
                  </span>
                )}
              </div>
            );
          })()}

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddMode(null); setSelectedPkgId(""); setSelectedProcId(""); setItemCustomPrice(""); setItemDiscountType("reais"); setItemDiscount("0"); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleAddSubmit} disabled={addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Adicionar ao Plano
            </Button>
          </div>
        </div>
      )}

      {/* Items list */}
      {planItems.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-slate-200 rounded-xl">
          Nenhum procedimento ou pacote vinculado ao plano ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {planItems.map((item) => {
            const isMensal = item.packageType === "mensal";
            const isAvulso = !item.packageId;
            const used = item.usedSessions ?? 0;
            const planned = item.totalSessions ?? (isMensal ? item.sessionsPerWeek * 4 : 0);
            const pct = planned > 0 ? Math.min(100, (used / planned) * 100) : 0;
            const { gross, discount: disc, net } = calcItemTotal(item);
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className={`border rounded-xl p-3 transition-colors ${isEditing ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200 hover:border-slate-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {item.packageId ? (
                        isMensal
                          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5"><RefreshCw className="h-2.5 w-2.5" /> Mensal</span>
                          : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" /> Pacote Sessões</span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">Avulso</span>
                      )}
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {item.packageName ?? item.procedureName ?? "—"}
                      </span>
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                          {!isMensal && item.sessionsPerWeek > 0 && <span>{item.sessionsPerWeek}x/semana</span>}
                          {isMensal && <span>{item.sessionsPerWeek}x/sem · dia {item.billingDay ?? "—"}</span>}
                          {!isMensal && item.totalSessions && <span className="font-medium">{item.totalSessions} sessões previstas</span>}
                          {!isMensal && item.totalSessions && item.sessionsPerWeek > 0 && (
                            <span className="text-slate-400">~{Math.ceil(item.totalSessions / item.sessionsPerWeek)} semanas</span>
                          )}
                          {isMensal && (item.absenceCreditLimit ?? 0) > 0 && (
                            <span className="text-emerald-600 font-medium">{item.absenceCreditLimit} falta(s) c/ crédito/mês</span>
                          )}
                          <span className="font-semibold text-slate-700">
                            {isMensal
                              ? <>{fmtCur(net)}/mês{disc > 0 && <span className="text-emerald-600 ml-1">(-{fmtCur(disc)})</span>}</>
                              : isAvulso && item.totalSessions
                                ? <>{fmtCur(net)}{disc > 0 && <span className="text-emerald-600 ml-1">(-{fmtCur(disc)})</span>}</>
                                : <>{fmtCur(net)}{disc > 0 && <span className="text-emerald-600 ml-1">(-{fmtCur(disc)})</span>}</>}
                          </span>
                          {item.notes && <span className="text-slate-400 italic w-full">{item.notes}</span>}
                        </div>

                        {/* Burn-down progress bar */}
                        {planned > 0 && (
                          <div className="mt-2 space-y-0.5">
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                <strong className="text-green-700">{used}</strong> realizadas · <strong>{Math.max(0, planned - used)}</strong> restantes de {planned}
                              </span>
                              <span className={pct >= 100 ? "text-green-600 font-semibold" : "text-slate-500"}>
                                {pct >= 100 ? "✓ Concluído" : `${pct.toFixed(0)}%`}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 75 ? "bg-amber-400" : "bg-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {planned === 0 && isMensal && used > 0 && (
                          <div className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
                            <Activity className="h-3 w-3" /> {used} sessão(ões) realizada(s)
                          </div>
                        )}
                      </>
                    ) : (
                      /* Edit mode */
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Sessões/semana</Label>
                            <Select value={String(editSpw)} onValueChange={v => setEditSpw(Number(v))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{[1,2,3,4,5].map(n=><SelectItem key={n} value={String(n)}>{n}x/sem</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {!isMensal && (
                            <div className="space-y-1">
                              <Label className="text-[10px]">Total sessões</Label>
                              <Input className="h-7 text-xs" type="number" min={1} value={editSessions} onChange={e => setEditSessions(e.target.value)} />
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Preço unitário</Label>
                            <Input className="h-7 text-xs" type="number" min={0} step={0.01} placeholder={String(item.unitPrice ?? item.price ?? "")} value={editCustomPrice} onChange={e => setEditCustomPrice(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Desconto</Label>
                            <div className="flex gap-1">
                              <Input className="h-7 text-xs flex-1" type="number" min={0} step={editDiscountType === "percent" ? 1 : 0.01} max={editDiscountType === "percent" ? 100 : undefined} value={editDiscount} onChange={e => setEditDiscount(e.target.value)} />
                              <Select value={editDiscountType} onValueChange={(v: "reais" | "percent") => { setEditDiscountType(v); setEditDiscount("0"); }}>
                                <SelectTrigger className="h-7 text-xs w-14"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="reais">R$</SelectItem>
                                  <SelectItem value="percent">%</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Observações</Label>
                          <Input className="h-7 text-xs" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                        </div>
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setEditingId(null)}>Cancelar</Button>
                          <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleEditSave(item)} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => startEdit(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-destructive" onClick={() => removeMutation.mutate(item.id)} disabled={removeMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Financial Forecast */}
      {planItems.length > 0 && (
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Previsão Financeira do Plano
          </p>

          {/* Per-item breakdown */}
          <div className="space-y-1 text-xs">
            {financialRows.map(({ item, gross, discount: disc, net }) => {
              const isMensal = item.packageType === "mensal";
              const isAvulso = !item.packageId;
              const label = item.packageName ?? item.procedureName ?? "—";
              const detail = isMensal
                ? `${fmtCur(net)}/mês`
                : isAvulso && item.totalSessions
                  ? `${item.totalSessions} × ${fmtCur(Number(item.price ?? 0))}${disc > 0 ? ` − ${fmtCur(disc)}` : ""} = ${fmtCur(net)}`
                  : `${fmtCur(net)}${disc > 0 ? ` (desc. ${fmtCur(disc)})` : ""}`;
              return (
                <div key={item.id} className="flex justify-between items-center py-0.5 border-b border-primary/10 last:border-0">
                  <span className="text-slate-600 truncate max-w-[60%]">{label}</span>
                  <span className="font-medium text-slate-700 text-right">{detail}{isMensal && <span className="text-muted-foreground">/mês</span>}</span>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5 pt-1 border-t border-primary/20">
            {totalDesconto > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-emerald-600">Total de descontos:</span>
                <span className="font-semibold text-emerald-600">− {fmtCur(totalDesconto)}</span>
              </div>
            )}
            {hasSessoes && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Pacotes / avulsos:</span>
                <span className="font-semibold">{fmtCur(totalSessoes)}</span>
              </div>
            )}
            {hasMensal && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Mensalidades:</span>
                <span className="font-semibold">{fmtCur(totalMensal)}<span className="text-xs font-normal text-muted-foreground">/mês</span></span>
              </div>
            )}
            {totalSessions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total de sessões previstas:</span>
                <span className="font-semibold">{totalSessions} sessões</span>
              </div>
            )}
            {estimatedWeeks > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Duração estimada:</span>
                <span className="font-semibold">{estimatedWeeks} sem. <span className="text-xs font-normal text-muted-foreground">(~{(estimatedWeeks / 4.33).toFixed(1)} meses)</span></span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-primary/20">
              <span className="text-slate-700 font-bold">
                {hasMensal && hasSessoes ? "Total na contratação:" : hasSessoes ? "Total do plano:" : "Investimento mensal:"}
              </span>
              <span className="font-bold text-primary text-base">
                {hasSessoes && hasMensal
                  ? <>{fmtCur(totalSessoes + totalMensal)}<span className="text-xs font-normal text-muted-foreground ml-1">+ {fmtCur(totalMensal)}/mês</span></>
                  : hasSessoes
                  ? fmtCur(totalSessoes)
                  : <>{fmtCur(totalMensal)}<span className="text-xs font-normal text-muted-foreground">/mês</span></>}
              </span>
            </div>
          </div>

          {/* Monthly rules */}
          {hasMensal && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Regras dos Planos Mensais
              </p>
              {planItems.filter(i => i.packageType === "mensal").map(item => (
                <div key={item.id} className="text-[10px] text-emerald-700 flex items-start gap-1">
                  <span className="mt-0.5">•</span>
                  <span>
                    <strong>{item.packageName ?? item.procedureName}</strong>: {fmtCur(item.monthlyPrice)}/mês, {item.sessionsPerWeek}x/sem (~{item.sessionsPerWeek * 4} sess./mês).
                    {(item.absenceCreditLimit ?? 0) > 0 ? ` Até ${item.absenceCreditLimit} falta(s) c/ crédito/mês.` : " Sem crédito de faltas."}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasMensal && (
            <p className="text-[10px] text-slate-500 flex gap-1 items-start">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Mensalidades são recorrentes. O total acima considera apenas o 1º mês.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Treatment Plan Tab ─────────────────────────────────────────────────────────

export function TreatmentPlanTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });

  // ─── All plans list ──────────────────────────────────────────────────────
  const plansKey = [`/api/patients/${patientId}/treatment-plans`];
  const { data: allPlans = [], isLoading: plansLoading } = useQuery<any[]>({
    queryKey: plansKey,
    queryFn: () => fetch(`/api/patients/${patientId}/treatment-plans`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => r.json()),
    enabled: !!patientId,
  });

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Auto-select most recent active plan on load
  useEffect(() => {
    if (allPlans.length > 0 && selectedPlanId === null) {
      const active = allPlans.find(p => p.status === "ativo") ?? allPlans[0];
      setSelectedPlanId(active.id);
    }
  }, [allPlans, selectedPlanId]);

  const selectedPlan = allPlans.find(p => p.id === selectedPlanId) ?? null;

  // ─── Plan items for selected plan ───────────────────────────────────────
  const planItemsKey = selectedPlanId ? [`/api/treatment-plans/${selectedPlanId}/procedures`] : null;
  const { data: planItems = [] } = useQuery<PlanProcedureItem[]>({
    queryKey: planItemsKey ?? ["plan-items-disabled"],
    queryFn: () => fetch(`/api/treatment-plans/${selectedPlanId}/procedures`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => r.json()),
    enabled: !!selectedPlanId,
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => fetch(`/api/patients/${patientId}/appointments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` }
    }).then(r => r.json()),
    enabled: !!patientId,
  });

  const completedSessions = appointments.filter((a: any) => a.status === "concluido" || a.status === "presenca").length;

  const { data: professionals = [] } = useQuery<{ id: number; name: string; roles: string[] }[]>({
    queryKey: ["/api/users/professionals"],
    queryFn: () => fetch("/api/users/professionals", {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
    }).then(r => r.json()),
  });

  // ─── Form state per selected plan ───────────────────────────────────────
  const emptyForm = { objectives: "", techniques: "", frequency: "", estimatedSessions: "" as string | number, startDate: "", responsibleProfessional: "", status: "ativo" as "ativo" | "concluido" | "suspenso" };
  const [form, setForm] = useState(emptyForm);
  const planItemsInitRef = useRef(false);

  useEffect(() => {
    planItemsInitRef.current = false;
    if (selectedPlan) {
      setForm({
        objectives: selectedPlan.objectives || "",
        techniques: selectedPlan.techniques || "",
        frequency: selectedPlan.frequency || "",
        estimatedSessions: selectedPlan.estimatedSessions || "",
        startDate: selectedPlan.startDate || "",
        responsibleProfessional: selectedPlan.responsibleProfessional || "",
        status: (selectedPlan.status as "ativo" | "concluido" | "suspenso") || "ativo",
      });
    } else {
      setForm(emptyForm);
    }
  }, [selectedPlanId, allPlans]);

  // Auto-sync sessions/freq from plan items
  useEffect(() => {
    if (!planItemsInitRef.current) { planItemsInitRef.current = true; return; }
    if (planItems.length === 0) return;
    const totalSess = planItems.reduce((s, i) => i.packageType === "mensal" ? s : s + (i.totalSessions ?? 0), 0);
    const spwValues = planItems.map(i => i.sessionsPerWeek ?? 0).filter(v => v > 0);
    const maxSpw = spwValues.length > 0 ? Math.max(...spwValues) : 0;
    const freqStr = maxSpw > 0 ? `${maxSpw}x/semana` : "";
    setForm(f => ({ ...f, ...(totalSess > 0 ? { estimatedSessions: totalSess } : {}), ...(freqStr ? { frequency: freqStr } : {}) }));
  }, [planItems]);

  // ─── Mutations ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/treatment-plans/${selectedPlanId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
        body: JSON.stringify({ ...form, estimatedSessions: form.estimatedSessions ? Number(form.estimatedSessions) : null, startDate: form.startDate || null, responsibleProfessional: form.responsibleProfessional || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Salvo com sucesso", description: "Plano de tratamento atualizado." });
      queryClient.invalidateQueries({ queryKey: plansKey });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/journey`] });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlan = async () => {
    setCreatingNew(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/treatment-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
        body: JSON.stringify({ status: "ativo" }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      await queryClient.invalidateQueries({ queryKey: plansKey });
      setSelectedPlanId(created.id);
      toast({ title: "Novo plano criado", description: "Preencha os dados e salve." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível criar o plano.", variant: "destructive" });
    } finally {
      setCreatingNew(false);
    }
  };

  const handleDeletePlan = async (planId: number) => {
    setDeletingId(planId);
    // Capture remaining plans from current state before invalidation
    const remaining = allPlans.filter(p => p.id !== planId);
    try {
      const res = await fetch(`/api/patients/${patientId}/treatment-plans/${planId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` },
      });
      if (!res.ok) throw new Error();
      toast({ title: "Plano excluído" });
      // Set next selection before invalidating so UI doesn't flicker on stale data
      setSelectedPlanId(remaining.length > 0 ? remaining[0].id : null);
      await queryClient.invalidateQueries({ queryKey: plansKey });
    } catch {
      toast({ title: "Erro", description: "Não foi possível excluir.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const statusStyles: Record<string, string> = {
    ativo: "bg-green-100 text-green-700 border-green-200",
    concluido: "bg-slate-100 text-slate-700 border-slate-200",
    suspenso: "bg-orange-100 text-orange-700 border-orange-200",
  };
  const statusLabel: Record<string, string> = { ativo: "Ativo", concluido: "Concluído", suspenso: "Suspenso" };

  if (plansLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* ── Plan selector strip ─────────────────────────────────────────── */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-600 shrink-0">Planos de Tratamento</span>
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {allPlans.map((plan, idx) => {
                const isSelected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                        : "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      plan.status === "ativo" ? "bg-green-400" : plan.status === "suspenso" ? "bg-orange-400" : "bg-slate-400"
                    } ${isSelected ? "opacity-100" : ""}`} />
                    <span>Plano {idx + 1}</span>
                    <span className={`text-[10px] font-normal ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                      {plan.startDate ? new Date(plan.startDate + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) : statusLabel[plan.status] ?? plan.status}
                    </span>
                    {allPlans.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                        className={`ml-1 rounded-full p-0.5 transition-opacity ${isSelected ? "text-white/60 hover:text-white" : "text-slate-300 hover:text-red-400"} ${deletingId === plan.id ? "opacity-50 pointer-events-none" : ""}`}
                        title="Excluir plano"
                      >
                        {deletingId === plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      </span>
                    )}
                  </button>
                );
              })}
              {allPlans.length === 0 && (
                <span className="text-sm text-slate-400 italic">Nenhum plano cadastrado</span>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 px-3 rounded-xl text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 shrink-0"
              onClick={handleCreatePlan} disabled={creatingNew}>
              {creatingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Novo Plano
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Selected plan card ──────────────────────────────────────────── */}
      {selectedPlan ? (
        <Card className="border-none shadow-md">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-xl">
                  Plano {allPlans.findIndex(p => p.id === selectedPlanId) + 1}
                  {selectedPlan.startDate && (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      — desde {new Date(selectedPlan.startDate + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>Objetivos, procedimentos, estimativas e base para contrato</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center border px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[form.status] ?? ""}`}>
                  {statusLabel[form.status] ?? form.status}
                </span>
                {patient && (
                  <>
                    <Button variant="outline" size="sm" className="h-8 px-3 rounded-xl text-xs gap-1.5"
                      onClick={() => printDocument(generatePlanHTML(patient, form, appointments, planItems, clinic), `Plano de Tratamento — ${patient.name}`)}>
                      <Printer className="w-3.5 h-3.5" /> Imprimir Plano
                    </Button>
                    <Button size="sm" className="h-8 px-3 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => printDocument(generateContractHTML(patient, form, planItems, clinic), `Contrato — ${patient.name}`)}>
                      <ScrollText className="w-3.5 h-3.5" /> Gerar Contrato
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5">

            {/* Objectives */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Objetivos do Tratamento
              </Label>
              <Textarea className="min-h-[100px] bg-slate-50 border-slate-200 focus:bg-white resize-none"
                value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}
                placeholder="Quais os objetivos terapêuticos a serem alcançados..." />
            </div>

            {/* Techniques */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary" /> Técnicas e Recursos
              </Label>
              <Textarea className="min-h-[100px] bg-slate-50 border-slate-200 focus:bg-white resize-none"
                value={form.techniques} onChange={e => setForm({ ...form, techniques: e.target.value })}
                placeholder="Técnicas fisioterapêuticas, eletroterapia, exercícios..." />
            </div>

            {/* Responsible professional */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" /> Profissional Responsável
              </Label>
              <Select value={form.responsibleProfessional} onValueChange={v => setForm({ ...form, responsibleProfessional: v })}>
                <SelectTrigger className="bg-slate-50 border-slate-200 focus:bg-white">
                  <SelectValue placeholder="Selecionar profissional..." />
                </SelectTrigger>
                <SelectContent>
                  {professionals.length === 0 && <SelectItem value="__none" disabled>Nenhum profissional cadastrado</SelectItem>}
                  {professionals.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency, start date, estimated sessions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  Frequência
                  {planItems.length > 0 && <span className="text-[10px] text-slate-400 font-normal">— calculado dos itens</span>}
                </Label>
                <Input className="bg-slate-50 border-slate-200 focus:bg-white"
                  value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} placeholder="Ex: 3x/semana..." />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Data de Início</Label>
                <Input type="date" className="bg-slate-50 border-slate-200 focus:bg-white"
                  value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  Sessões Estimadas
                  {planItems.length > 0 && <span className="text-[10px] text-slate-400 font-normal">— calculado dos itens</span>}
                </Label>
                <Input type="number" min={1} className="bg-slate-50 border-slate-200 focus:bg-white"
                  value={form.estimatedSessions} onChange={e => setForm({ ...form, estimatedSessions: e.target.value })} placeholder="Ex: 20" />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Status do Tratamento</Label>
              <Select value={form.status} onValueChange={(v: "ativo" | "concluido" | "suspenso") => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-slate-50 border-slate-200 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Session progress */}
            {(form.estimatedSessions || completedSessions > 0) && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Progresso Geral de Sessões
                  </Label>
                  <span className={`text-sm font-bold ${form.estimatedSessions && completedSessions >= Number(form.estimatedSessions) ? "text-green-600" : "text-primary"}`}>
                    {completedSessions} / {form.estimatedSessions || "—"}
                  </span>
                </div>
                {form.estimatedSessions ? (
                  <>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-2.5 rounded-full transition-all duration-500 ${completedSessions >= Number(form.estimatedSessions) ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, (completedSessions / Number(form.estimatedSessions)) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {completedSessions >= Number(form.estimatedSessions)
                        ? "✓ Meta atingida! Considere registrar a alta."
                        : `${Math.max(0, Number(form.estimatedSessions) - completedSessions)} sessão(ões) restante(s)`}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">{completedSessions} sessão(ões) concluída(s). Defina o total estimado para ver o progresso.</p>
                )}
              </div>
            )}

            {/* Items section */}
            <TreatmentPlanItemsSection planId={selectedPlanId ?? undefined} planItems={planItems} planItemsKey={planItemsKey} />

            {/* Save button */}
            <div className="pt-3 flex justify-end">
              <Button onClick={handleSave} className="h-11 px-8 rounded-xl shadow-md shadow-primary/20" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar Plano
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="space-y-3">
              <p className="text-slate-400 text-sm">Nenhum plano selecionado.</p>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                onClick={handleCreatePlan} disabled={creatingNew}>
                {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar Primeiro Plano
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Evolutions Tab ─────────────────────────────────────────────────────────────


// ─── Evolution Templates ──────────────────────────────────────────────────────

