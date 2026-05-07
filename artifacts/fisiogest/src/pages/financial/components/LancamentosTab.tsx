import { useState, useMemo } from "react";
import { Loader2, TrendingUp, TrendingDown, Equal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/toast";
import { useListFinancialRecords } from "@workspace/api-client-react";
import { authHeaders, formatCurrency } from "../utils";
import { NewRecordModal } from "./NewRecordModal";
import { EditRecordModal } from "./EditRecordModal";
import { RecordsTable } from "./lancamentos/RecordsTable";

const NON_REVENUE_TX_TYPES = new Set([
  "pagamento", "depositoCarteira", "vendaPacote",
  "faturaConsolidada", "faturaMensalAvulso", "pendenteFatura",
]);

export function LancamentosTab({ month, year }: { month: number; year: number }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "receita" | "despesa">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const { data: rawRecords, isLoading: recLoading, refetch: refetchRec } = useListFinancialRecords({ month, year });

  const records = useMemo(() => {
    const list = ((rawRecords as any)?.data ?? rawRecords ?? []) as any[];
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (typeFilter === "all") return sorted;
    return sorted.filter((r) => r.type === typeFilter);
  }, [rawRecords, typeFilter]);

  const totalReceitas = useMemo(() =>
    records.filter((r) =>
      r.type === "receita" &&
      (r as any).status !== "cancelado" &&
      (r as any).status !== "estornado" &&
      !NON_REVENUE_TX_TYPES.has((r as any).transactionType)
    ).reduce((s, r) => s + Number(r.amount), 0),
    [records]);

  const totalDespesas = useMemo(() =>
    records.filter((r) =>
      r.type === "despesa" &&
      (r as any).status !== "cancelado" &&
      (r as any).status !== "estornado"
    ).reduce((s, r) => s + Number(r.amount), 0),
    [records]);

  const netResult = totalReceitas - totalDespesas;

  const handleSuccess = () => { setIsModalOpen(false); setEditTarget(null); refetchRec(); };

  const handleDeleteRecord = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/financial/records/${deleteTarget.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao excluir", description: data.message ?? "Não foi possível excluir." });
      } else {
        toast({ title: "Registro excluído." });
        setDeleteTarget(null);
        refetchRec();
      }
    } catch { toast({ variant: "destructive", title: "Erro ao excluir registro." }); }
    finally { setIsDeleting(false); }
  };

  return (
    <div className="space-y-4">

      {/* ── QUICK SUMMARY STRIP ─────────────────────────────────────────── */}
      {!recLoading && records.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-100 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Entradas</p>
              <p className="text-sm font-bold text-emerald-700 tabular-nums truncate">{formatCurrency(totalReceitas)}</p>
            </div>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-100 shrink-0">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Saídas</p>
              <p className="text-sm font-bold text-rose-700 tabular-nums truncate">{formatCurrency(totalDespesas)}</p>
            </div>
          </div>
          <div className={`border rounded-xl px-4 py-3 flex items-center gap-2.5 ${netResult >= 0 ? "bg-indigo-50 border-indigo-100" : "bg-red-50 border-red-100"}`}>
            <div className={`p-1.5 rounded-lg shrink-0 ${netResult >= 0 ? "bg-indigo-100" : "bg-red-100"}`}>
              <Equal className={`w-3.5 h-3.5 ${netResult >= 0 ? "text-indigo-600" : "text-red-600"}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${netResult >= 0 ? "text-indigo-600" : "text-red-600"}`}>Resultado</p>
              <p className={`text-sm font-bold tabular-nums truncate ${netResult >= 0 ? "text-indigo-700" : "text-red-700"}`}>
                {netResult >= 0 ? "+" : ""}{formatCurrency(netResult)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORDS TABLE ───────────────────────────────────────────────── */}
      <RecordsTable
        records={records}
        recLoading={recLoading}
        month={month}
        year={year}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        totalReceitas={totalReceitas}
        totalDespesas={totalDespesas}
        onNew={() => setIsModalOpen(true)}
        onEdit={(record) => setEditTarget(record)}
        onDelete={(info) => setDeleteTarget(info)}
      />

      {/* Modals */}
      <NewRecordModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleSuccess} />
      <EditRecordModal open={!!editTarget} record={editTarget} onClose={() => setEditTarget(null)} onSuccess={handleSuccess} />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Registro</DialogTitle>
            <DialogDescription>
              Confirmar exclusão de <strong>{deleteTarget?.description}</strong> ({formatCurrency(deleteTarget?.amount ?? 0)})?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto rounded-xl">Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteRecord} disabled={isDeleting} className="w-full sm:w-auto rounded-xl">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
