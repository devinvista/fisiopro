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
import { Plus, Pencil, Globe, Info } from "lucide-react";
import { getMargin } from "../constants";
import { MarginBadge } from "./MarginBadge";
import { cn } from "@/lib/utils";

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
  accountingAccountId?: string;
  isGlobal?: boolean;
};

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
  showAccountingField?: boolean;
  isSuperAdmin?: boolean;
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
  isSuperAdmin = false,
}: ProcedureFormModalProps) {
  const revenueAccounts = accountingAccounts.filter((a) => a.type === "revenue");
  const formMargin = getMargin(form.price, form.cost);
  const isGroup = form.modalidade === "grupo";
  const isDupla = form.modalidade === "dupla";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl border-none shadow-2xl">
        <DialogHeader className="px-1">
          <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-2">
            <div className={cn("p-2 rounded-xl shrink-0", editingProcedure ? "bg-slate-100" : "bg-primary/10")}>
              {editingProcedure
                ? <Pencil className="w-5 h-5 text-slate-600" />
                : <Plus className="w-5 h-5 text-primary" />}
            </div>
            <span className="truncate">
              {editingProcedure ? "Editar Procedimento" : "Novo Procedimento"}
            </span>
          </DialogTitle>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {editingProcedure
              ? "Atualize as informações do serviço."
              : "Cadastre um novo serviço ou modalidade de atendimento."}
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Identificação ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do Procedimento</Label>
              <Input
                id="name"
                placeholder="Ex: RPG, Pilates Solo, Drenagem Linfática…"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-xl border-slate-200 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração (minutos)</Label>
                <Input
                  type="number"
                  min="5"
                  max="480"
                  value={form.durationMinutes}
                  onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  className="rounded-xl border-slate-200"
                />
              </div>

              {(isGroup || isDupla) && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                  <Label>Capacidade Máxima</Label>
                  <Input
                    type="number"
                    min={isDupla ? 2 : 2}
                    value={form.maxCapacity}
                    onChange={e => setForm(f => ({ ...f, maxCapacity: Number(e.target.value) }))}
                    className="rounded-xl border-slate-200"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva os benefícios, indicações ou detalhes do procedimento…"
                className="rounded-xl border-slate-200 resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* ── Preço e Custo Base ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Preço e Custo Base</p>
              {form.price && <MarginBadge margin={formMargin} />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Preço por sessão (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0,00"
                    className="pl-9 rounded-xl border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Custo base de insumos (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="0,00"
                    className="pl-9 rounded-xl border-slate-200 bg-white"
                  />
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              Custo base padrão para todas as clínicas. Custos variáveis específicos por clínica são
              configurados via o botão <strong className="text-slate-500">R$</strong> em cada procedimento.
            </p>
          </div>

          {/* ── Configurações ───────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer">Agendamento Online</Label>
                <p className="text-[11px] text-slate-400">Permitir que pacientes agendem via link público</p>
              </div>
              <Switch
                checked={form.onlineBookingEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, onlineBookingEnabled: v }))}
              />
            </div>

            {isSuperAdmin && !editingProcedure && (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium text-amber-800 cursor-pointer">Procedimento Global</Label>
                    <p className="text-[11px] text-amber-600">Disponível para todas as clínicas — não editável por clínicas</p>
                  </div>
                </div>
                <Switch
                  checked={form.isGlobal ?? false}
                  onCheckedChange={v => setForm(f => ({ ...f, isGlobal: v }))}
                />
              </div>
            )}

            {showAccountingField && (
              <div className="space-y-1.5">
                <Label className="text-sm">Conta contábil de receita</Label>
                <Select
                  value={form.accountingAccountId ?? ""}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, accountingAccountId: v === "__default__" ? "" : v }))
                  }
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
                <p className="text-[10px] text-slate-400">
                  Sub-conta usada no DRE. Vazio = receita padrão.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row bg-slate-50/50 p-4 -mx-6 -mb-6 border-t border-slate-100">
          <Button
            variant="outline"
            className="w-full sm:w-auto h-10 rounded-xl border-slate-200"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto h-10 rounded-xl sm:px-8 shadow-lg shadow-primary/20"
            onClick={onSubmit}
          >
            {editingProcedure ? "Salvar Alterações" : "Criar Procedimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
