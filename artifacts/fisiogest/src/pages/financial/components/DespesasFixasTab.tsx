import { useState, useEffect, useCallback } from "react";
import {
  BarChart3, CalendarDays, Edit2, Loader2, PiggyBank, Plus, Receipt, Settings2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, formatCurrency } from "../utils";
import { KpiCard } from "./KpiCard";
import { RecurringExpenseModal } from "./RecurringExpenseModal";

export function DespesasFixasTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-expenses", { headers: authHeaders() });
      if (res.ok) setRecords(await res.json());
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const totalMonthly = records.filter(r => r.isActive).reduce((sum, r) => {
    const amt = Number(r.amount);
    if (r.frequency === "anual") return sum + amt / 12;
    if (r.frequency === "semanal") return sum + amt * 4.33;
    return sum + amt;
  }, 0);

  const toggleActive = async (record: any) => {
    try {
      const res = await fetch(`/api/recurring-expenses/${record.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ isActive: !record.isActive }),
      });
      if (res.ok) { fetchRecords(); toast({ title: record.isActive ? "Despesa desativada." : "Despesa ativada." }); }
    } catch { toast({ variant: "destructive", title: "Erro ao atualizar." }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/recurring-expenses/${deleteTarget.id}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) { toast({ title: "Despesa removida." }); setDeleteTarget(null); fetchRecords(); }
      else toast({ variant: "destructive", title: "Erro ao remover." });
    } catch { toast({ variant: "destructive", title: "Erro ao remover." }); }
    finally { setIsDeleting(false); }
  };

  const categoryGroups = records.reduce((acc: Record<string, any[]>, r) => {
    const cat = r.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const freqLabel: Record<string, string> = { mensal: "/mês", anual: "/ano (÷12)", semanal: "/sem (×4,33)" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Despesas Fixas Recorrentes</h2>
          <p className="text-sm text-slate-400 mt-0.5">Configure suas despesas fixas para calcular o orçamento estimado e o custo por hora clínico.</p>
        </div>
        <Button
          onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
          size="sm"
          className="rounded-xl shadow-sm h-9 px-4 shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Nova Despesa
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Mensal Estimado" value={formatCurrency(totalMonthly)} icon={<Receipt className="w-4 h-4" />} accentColor="#ef4444" />
        <KpiCard label="Despesas Cadastradas" value={String(records.length)} icon={<Settings2 className="w-4 h-4" />} accentColor="#64748b" sub={`${records.filter(r => r.isActive).length} ativa(s)`} />
        <KpiCard label="Total Anual Estimado" value={formatCurrency(totalMonthly * 12)} icon={<CalendarDays className="w-4 h-4" />} accentColor="#8b5cf6" />
        <KpiCard label="Categorias" value={String(Object.keys(categoryGroups).length)} icon={<BarChart3 className="w-4 h-4" />} accentColor="#0ea5e9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : records.length === 0 ? (
        <Card className="border border-dashed border-slate-200 shadow-none rounded-2xl bg-slate-50">
          <CardContent className="py-14 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white shadow-sm flex items-center justify-center">
              <PiggyBank className="w-7 h-7 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-600">Nenhuma despesa fixa cadastrada</p>
            <p className="text-sm text-slate-400 mt-1 mb-5 max-w-sm mx-auto">
              Adicione aluguel, salários, contas e outros custos fixos para habilitar o cálculo de custo por procedimento e o orçamento estimado.
            </p>
            <Button
              onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
              variant="outline"
              size="sm"
              className="rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Adicionar primeira despesa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(categoryGroups).map(([cat, items]: [string, any[]]) => {
            const catMonthly = items.filter((r: any) => r.isActive).reduce((s: number, r: any) => {
              const a = Number(r.amount);
              return s + (r.frequency === "anual" ? a / 12 : r.frequency === "semanal" ? a * 4.33 : a);
            }, 0);
            return (
              <Card key={cat} className="border border-slate-100 shadow-sm rounded-2xl bg-white overflow-hidden">
                <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{cat}</p>
                  <p className="text-xs font-bold text-slate-600 tabular-nums">{formatCurrency(catMonthly)}/mês</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map((r: any) => (
                    <div key={r.id} className={`flex items-center gap-4 px-5 py-3.5 transition-opacity ${!r.isActive ? "opacity-40" : ""}`}>
                      <Switch checked={r.isActive} onCheckedChange={() => toggleActive(r)} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${r.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>{r.name}</p>
                        {r.notes && <p className="text-[11px] text-slate-400 truncate mt-0.5">{r.notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-red-600 tabular-nums">{formatCurrency(Number(r.amount))}</p>
                        <p className="text-[11px] text-slate-400">{freqLabel[r.frequency] ?? r.frequency}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditTarget(r); setIsModalOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RecurringExpenseModal
        open={isModalOpen}
        editData={editTarget}
        onClose={() => { setIsModalOpen(false); setEditTarget(null); }}
        onSuccess={() => { setIsModalOpen(false); setEditTarget(null); fetchRecords(); }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remover Despesa Fixa</DialogTitle>
            <DialogDescription>
              Confirmar remoção de <strong>{deleteTarget?.name}</strong>? Isso não afetará registros financeiros já gerados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

