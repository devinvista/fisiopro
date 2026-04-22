import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "../utils";
import {
  GENERAL_EXPENSE_CATEGORIES, PROCEDURE_EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES, PAYMENT_METHODS,
} from "../constants";

// ─── Modal: Edit Financial Record ─────────────────────────────────────────────

export function EditRecordModal({ open, record, onClose, onSuccess }: {
  open: boolean;
  record: any | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"pendente" | "pago" | "cancelado" | "estornado">("pendente");
  const [paymentDate, setPaymentDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (record) {
      setType(record.type ?? "despesa");
      setAmount(String(record.amount ?? ""));
      setDescription(record.description ?? "");
      setCategory(record.category ?? "");
      setStatus(record.status ?? "pendente");
      setPaymentDate(record.paymentDate ?? "");
      setDueDate(record.dueDate ?? "");
      setPaymentMethod(record.paymentMethod ?? "");
    }
  }, [record]);

  const categories = type === "receita" ? REVENUE_CATEGORIES : GENERAL_EXPENSE_CATEGORIES;

  const handleSubmit = async () => {
    if (!amount || !description) {
      toast({ variant: "destructive", title: "Preencha descrição e valor." }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/financial/records/${record.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          type,
          amount: Number(amount),
          description,
          category: category || null,
          status,
          paymentDate: status === "pendente" ? null : (paymentDate || null),
          dueDate: dueDate || null,
          paymentMethod: paymentMethod || null,
        }),
      });
      if (res.ok) {
        toast({ title: "Lançamento atualizado." });
        onSuccess();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: d.message ?? "Erro ao atualizar." });
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar lançamento." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lançamento</DialogTitle>
          <DialogDescription>Atualize os dados do lançamento financeiro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(["receita", "despesa"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setCategory(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${type === t
                  ? t === "receita" ? "bg-emerald-500 text-white shadow-sm" : "bg-red-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"}`}
              >
                {t === "receita" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Pago / Recebido</span>
                </SelectItem>
                <SelectItem value="pendente">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pendente</span>
                </SelectItem>
                <SelectItem value="cancelado">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />Cancelado</span>
                </SelectItem>
                <SelectItem value="estornado">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Estornado</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-xl" />
            </div>
            {status !== "pendente" && (
              <div className="space-y-1.5">
                <Label>Data de Pagamento</Label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="rounded-xl" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de Pagamento</Label>
            <Select
              value={paymentMethod || "__none__"}
              onValueChange={(v) => setPaymentMethod(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={category || "__none__"}
              onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
