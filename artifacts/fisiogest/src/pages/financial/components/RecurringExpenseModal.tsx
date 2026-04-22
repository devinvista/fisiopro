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
import { authHeaders, formatCurrency } from "../utils";
import { RECURRING_CATEGORIES, FREQUENCY_OPTIONS } from "../constants";

// ─── Modal: Recurring Expense Form ───────────────────────────────────────────

export function RecurringExpenseModal({ open, editData, onClose, onSuccess }: {
  open: boolean; editData: any | null; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("mensal");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (editData) {
      setName(editData.name ?? "");
      setCategory(editData.category ?? "");
      setAmount(String(editData.amount ?? ""));
      setFrequency(editData.frequency ?? "mensal");
      setNotes(editData.notes ?? "");
    } else {
      setName(""); setCategory(""); setAmount(""); setFrequency("mensal"); setNotes("");
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!name || !category || !amount) {
      toast({ variant: "destructive", title: "Preencha nome, categoria e valor." }); return;
    }
    setSaving(true);
    try {
      const url = editData ? `/api/recurring-expenses/${editData.id}` : "/api/recurring-expenses";
      const method = editData ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ name, category, amount: Number(amount), frequency, notes: notes || undefined }),
      });
      if (res.ok) { toast({ title: editData ? "Despesa atualizada." : "Despesa cadastrada." }); onSuccess(); }
      else { const d = await res.json().catch(() => ({})); toast({ variant: "destructive", title: d.message ?? "Erro ao salvar." }); }
    } catch { toast({ variant: "destructive", title: "Erro ao salvar." }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? "Editar Despesa Fixa" : "Nova Despesa Fixa"}</DialogTitle>
          <DialogDescription>Despesas fixas são usadas para calcular o orçamento estimado e o custo por hora clínico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rec-name">Nome *</Label>
            <Input id="rec-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Aluguel, Salário, Internet…" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-cat">Categoria *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="rec-cat" className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {RECURRING_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-amt">Valor (R$) *</Label>
              <Input id="rec-amt" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-freq">Frequência</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="rec-freq" className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {amount && frequency === "anual" && (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
              Equivalente mensal: <strong className="text-slate-600 tabular-nums">{formatCurrency(Number(amount) / 12)}</strong>
            </p>
          )}
          {amount && frequency === "semanal" && (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
              Equivalente mensal: <strong className="text-slate-600 tabular-nums">{formatCurrency(Number(amount) * 4.33)}</strong>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rec-notes">Observações</Label>
            <Input id="rec-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional…" className="rounded-xl" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {editData ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

