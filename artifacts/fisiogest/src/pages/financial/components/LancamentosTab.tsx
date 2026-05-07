import { useState, useMemo, useEffect } from "react";
import { Loader2, RotateCcw } from "lucide-react";
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
import { EstornosTab } from "./EstornosTab";

const NON_REVENUE_TX_TYPES = new Set([
  "pagamento", "depositoCarteira", "vendaPacote",
  "faturaConsolidada", "faturaMensalAvulso", "pendenteFatura",
]);

export function LancamentosTab({
  month,
  year,
  triggerNew,
  onTriggerNewConsumed,
}: {
  month: number;
  year: number;
  triggerNew?: boolean;
  onTriggerNewConsumed?: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | "receita" | "despesa">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description: string; amount: number } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEstornos, setShowEstornos] = useState(false);
  const { toast } = useToast();

  const { data: rawRecords, isLoading: recLoading, refetch: refetchRec } = useListFinancialRecords({ month, year });

  useEffect(() => {
    if (triggerNew) {
      setIsModalOpen(true);
      onTriggerNewConsumed?.();
    }
  }, [triggerNew, onTriggerNewConsumed]);

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

  if (showEstornos) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEstornos(false)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium"
          >
            <span className="text-slate-400">←</span> Voltar para Lançamentos
          </button>
        </div>
        <EstornosTab />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Estornos link */}
      <div className="flex justify-end pt-1">
        <button
          onClick={() => setShowEstornos(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium"
        >
          <RotateCcw className="w-3 h-3" />
          Ver histórico de estornos
        </button>
      </div>

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
