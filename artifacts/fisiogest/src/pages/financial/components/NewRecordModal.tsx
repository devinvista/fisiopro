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
import { useCreateFinancialRecord, useListProcedures } from "@workspace/api-client-react";
import { authHeaders, todayISO } from "../utils";
import {
  GENERAL_EXPENSE_CATEGORIES, PROCEDURE_EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES, PAYMENT_METHODS,
} from "../constants";

// ─── Modal: New Financial Record ──────────────────────────────────────────────


export function NewRecordModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [expenseSubtype, setExpenseSubtype] = useState<"geral" | "procedimento">("geral");
  const [procedureId, setProcedureId] = useState<string>("");
  const [status, setStatus] = useState<"pago" | "pendente">("pago");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { data: procedures } = useListProcedures();
  const { mutateAsync: createRecord } = useCreateFinancialRecord();

  const categories = type === "receita"
    ? REVENUE_CATEGORIES
    : expenseSubtype === "geral"
      ? GENERAL_EXPENSE_CATEGORIES
      : PROCEDURE_EXPENSE_CATEGORIES;

  useEffect(() => {
    if (!open) {
      setType("despesa"); setAmount(""); setDescription("");
      setCategory(""); setExpenseSubtype("geral"); setProcedureId("");
      setStatus("pago"); setPaymentDate(todayISO()); setDueDate(todayISO());
      setPaymentMethod("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!amount || !description) {
      toast({ variant: "destructive", title: "Preencha descrição e valor." }); return;
    }
    setSaving(true);
    try {
      await createRecord({
        data: {
          type,
          amount: Number(amount),
          description,
          category: category || undefined,
          procedureId: procedureId ? Number(procedureId) : undefined,
          status,
          paymentDate: status === "pendente" ? null : (paymentDate || todayISO()),
          dueDate: dueDate || todayISO(),
          paymentMethod: paymentMethod || undefined,
        } as any,
      });
      toast({ title: "Lançamento criado com sucesso." });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "Erro ao criar lançamento." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
          <DialogDescription>Registre uma receita ou despesa manualmente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(["receita", "despesa"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setCategory(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${type === t
                  ? t === "receita"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-red-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                {t === "receita" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          {type === "despesa" && (
            <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1">
              {(["geral", "procedimento"] as const).map((sub) => (
                <button
                  key={sub}
                  onClick={() => { setExpenseSubtype(sub); setCategory(""); setProcedureId(""); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${expenseSubtype === sub ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                >
                  {sub === "geral" ? "Despesa Geral" : "Custo de Procedimento"}
                </button>
              ))}
            </div>
          )}

          {type === "despesa" && expenseSubtype === "procedimento" && (
            <div className="space-y-1.5">
              <Label>Procedimento vinculado</Label>
              <Select value={procedureId} onValueChange={setProcedureId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {(procedures ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {([
                { value: "pago", label: type === "receita" ? "Recebido" : "Pago", color: "bg-emerald-500" },
                { value: "pendente", label: type === "receita" ? "A Receber" : "A Pagar", color: "bg-amber-500" },
              ] as const).map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === s.value ? `${s.color} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Pagamento de aluguel, Consulta Dr. Silva…" className="rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            {status === "pago" && (
              <div className="space-y-1.5">
                <Label>Data de Pagamento</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" className="rounded-xl"
              />
            </div>
          </div>

          {status === "pago" && (
            <div className="space-y-1.5">
              <Label>Forma de Pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className={type === "receita" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {type === "receita" ? "Registrar Receita" : "Registrar Despesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

