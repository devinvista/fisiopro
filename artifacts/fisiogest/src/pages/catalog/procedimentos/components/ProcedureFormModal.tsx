import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil } from "lucide-react";
import { getMargin } from "../constants";
import { MarginBadge } from "./MarginBadge";

type ProcedureFormState = {
  name: string;
  category: string;
  modalidade: "individual" | "dupla" | "grupo";
  durationMinutes: number;
  price: string;
  cost: string;
  description: string;
  maxCapacity: number;
  onlineBookingEnabled: boolean;
  monthlyPrice?: string;
  billingDay?: string;
  // Sprint 3 T8 — id (string) da sub-conta contábil de receita.
  // "" → conta padrão (4.1.1/4.1.2).
  accountingAccountId?: string;
};

// Sub-conta de receita exibida no Select. Listada via /api/financial/accounting/accounts.
export interface AccountingAccountOption {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface ProcedureFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingProcedure: any;
  form: ProcedureFormState;
  setForm: React.Dispatch<React.SetStateAction<ProcedureFormState>>;
  onSubmit: () => void;
  accountingAccounts?: AccountingAccountOption[];
  /** Quando undefined, a clínica não possui o feature `financial.view.accounting`. */
  showAccountingField?: boolean;
}

export function ProcedureFormModal({
  isOpen,
  onOpenChange,
  editingProcedure,
  form,
  setForm,
  onSubmit,
  accountingAccounts = [],
  showAccountingField = false,
}: ProcedureFormModalProps) {
  // Apenas contas de receita (sub-contas de 4.1.1/4.1.2 etc) fazem sentido aqui.
  const revenueAccounts = accountingAccounts.filter((a) => a.type === "revenue");
  const formMargin = getMargin(form.price, form.cost);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl border-none shadow-2xl">
        <DialogHeader className="px-1">
          <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0">
              {editingProcedure ? <Pencil className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
            </div>
            <span className="truncate">{editingProcedure ? "Editar Procedimento" : "Novo Procedimento"}</span>
          </DialogTitle>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {editingProcedure ? "Atualize as informações do serviço." : "Cadastre um novo serviço ou modalidade de atendimento."}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="name">Nome do Procedimento</Label>
            <Input
              id="name"
              placeholder="Ex: RPG, Pilates Solo, Drenagem…"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-xl border-slate-200 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onValueChange={v => setForm(f => ({ ...f, category: v }))}
            >
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Reabilitação">Reabilitação</SelectItem>
                <SelectItem value="Estética">Estética</SelectItem>
                <SelectItem value="Pilates">Pilates</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <Select
              value={form.modalidade}
              onValueChange={(v: any) => setForm(f => ({ ...f, modalidade: v }))}
            >
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="dupla">Em Dupla</SelectItem>
                <SelectItem value="grupo">Em Grupo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Duração (minutos)</Label>
            <Input
              type="number"
              value={form.durationMinutes}
              onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
              className="rounded-xl border-slate-200"
            />
          </div>

          {form.modalidade === "grupo" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
              <Label>Capacidade Máxima</Label>
              <Input
                type="number"
                min="1"
                value={form.maxCapacity}
                onChange={e => setForm(f => ({ ...f, maxCapacity: Number(e.target.value) }))}
                className="rounded-xl border-slate-200"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Preço por Sessão (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="0,00"
              className="rounded-xl border-slate-200"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Custo de Insumos (R$)</Label>
              <MarginBadge margin={formMargin} />
            </div>
            <Input
              type="number"
              step="0.01"
              value={form.cost}
              onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
              placeholder="0,00"
              className="rounded-xl border-slate-200"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descreva os benefícios, indicações ou detalhes do procedimento…"
              className="rounded-xl border-slate-200 resize-none"
              rows={3}
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 mt-2">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Agendamento Online</Label>
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Permitir que pacientes agendem via link público</p>
            </div>
            <Switch
              checked={form.onlineBookingEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, onlineBookingEnabled: v }))}
            />
          </div>

          {showAccountingField && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Conta contábil de receita</Label>
              <Select
                value={form.accountingAccountId ?? ""}
                onValueChange={(v) => setForm((f) => ({ ...f, accountingAccountId: v === "__default__" ? "" : v }))}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Conta padrão (4.1.1 / 4.1.2)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Conta padrão (4.1.1 / 4.1.2)</SelectItem>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                Sub-conta usada no DRE por procedimento. Vazio = receita padrão.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row bg-slate-50/50 p-4 -mx-6 -mb-6 border-t border-slate-100">
          <Button variant="outline" className="w-full sm:w-auto h-10 rounded-xl border-slate-200" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="w-full sm:w-auto h-10 rounded-xl sm:px-8 shadow-lg shadow-primary/20" onClick={onSubmit}>
            {editingProcedure ? "Salvar Alterações" : "Criar Procedimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
