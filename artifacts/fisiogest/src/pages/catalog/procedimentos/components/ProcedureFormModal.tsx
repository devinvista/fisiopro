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
};

interface ProcedureFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingProcedure: any;
  form: ProcedureFormState;
  setForm: React.Dispatch<React.SetStateAction<ProcedureFormState>>;
  onSubmit: () => void;
}

export function ProcedureFormModal({
  isOpen,
  onOpenChange,
  editingProcedure,
  form,
  setForm,
  onSubmit,
}: ProcedureFormModalProps) {
  const formMargin = getMargin(form.price, form.cost);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl border-none shadow-2xl overflow-hidden">
        <DialogHeader className="px-1">
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl">
              {editingProcedure ? <Pencil className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
            </div>
            {editingProcedure ? "Editar Procedimento" : "Novo Procedimento"}
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            {editingProcedure ? "Atualize as informações do serviço." : "Cadastre um novo serviço ou modalidade de atendimento."}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Nome do Procedimento</Label>
            <Input
              id="name"
              placeholder="Ex: RPG, Pilates Solo, Drenagem..."
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

          <div className="col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descreva os benefícios, indicações ou detalhes do procedimento..."
              className="rounded-xl border-slate-200 resize-none"
              rows={3}
            />
          </div>

          <div className="col-span-2 flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 mt-2">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Agendamento Online</Label>
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Permitir que pacientes agendem via link público</p>
            </div>
            <Switch
              checked={form.onlineBookingEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, onlineBookingEnabled: v }))}
            />
          </div>
        </div>

        <DialogFooter className="bg-slate-50/50 p-4 -mx-6 -mb-6 border-t border-slate-100">
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl px-8 shadow-lg shadow-primary/20" onClick={onSubmit}>
            {editingProcedure ? "Salvar Alterações" : "Criar Procedimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
