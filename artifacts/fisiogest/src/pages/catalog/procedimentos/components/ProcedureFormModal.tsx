import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Globe, Info, Wifi } from "lucide-react";
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
  const formMargin      = getMargin(form.price, form.cost);
  const isGroup  = form.modalidade === "grupo";
  const isDupla  = form.modalidade === "dupla";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl border-none shadow-2xl">
        <DialogHeader className="px-1">
          <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-3">
            <div className={cn("p-2 rounded-xl shrink-0",
              editingProcedure ? "bg-muted" : "bg-primary/10"
            )}>
              {editingProcedure
                ? <Pencil className="w-5 h-5 text-muted-foreground" />
                : <Plus className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <span className="block text-foreground">
                {editingProcedure ? "Editar Procedimento" : "Novo Procedimento"}
              </span>
              <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                {editingProcedure
                  ? "Atualize as informações do serviço."
                  : "Cadastre um novo serviço ou modalidade de atendimento."}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Identificação ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proc-name" className="text-sm font-medium">Nome do Procedimento</Label>
              <Input
                id="proc-name"
                placeholder="Ex: RPG, Pilates Solo, Drenagem Linfática…"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Reabilitação">Reabilitação</SelectItem>
                    <SelectItem value="Estética">Estética</SelectItem>
                    <SelectItem value="Pilates">Pilates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Modalidade</Label>
                <Select
                  value={form.modalidade}
                  onValueChange={(v: any) => setForm(f => ({ ...f, modalidade: v }))}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                <Label className="text-sm font-medium">Duração (minutos)</Label>
                <Input
                  type="number" min="5" max="480"
                  value={form.durationMinutes}
                  onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  className="rounded-xl"
                />
              </div>
              {(isGroup || isDupla) && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                  <Label className="text-sm font-medium">Capacidade máxima</Label>
                  <Input
                    type="number" min={2}
                    value={form.maxCapacity}
                    onChange={e => setForm(f => ({ ...f, maxCapacity: Number(e.target.value) }))}
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Descrição</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Benefícios, indicações ou detalhes do procedimento…"
                className="rounded-xl resize-none text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* ── Preço e Custo Base ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Preço e Custo Base
              </p>
              {form.price && <MarginBadge margin={formMargin} />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Preço por sessão</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
                  <Input
                    type="number" step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0,00"
                    className="pl-9 rounded-xl bg-card"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Custo base de insumos</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
                  <Input
                    type="number" step="0.01"
                    value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="0,00"
                    className="pl-9 rounded-xl bg-card"
                  />
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              Custo base padrão para todos os planos. Custos variáveis específicos por clínica são
              configurados via o botão <strong>R$</strong> em cada procedimento (Plano Pro).
            </p>
          </div>

          {/* ── Configurações ───────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <Label className="text-sm font-medium cursor-pointer">Agendamento Online</Label>
                  <p className="text-[11px] text-muted-foreground">Disponível no portal público da clínica</p>
                </div>
              </div>
              <Switch
                checked={form.onlineBookingEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, onlineBookingEnabled: v }))}
              />
            </div>

            {isSuperAdmin && !editingProcedure && (
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-amber-800 cursor-pointer">Procedimento Global</Label>
                    <p className="text-[11px] text-amber-600">Disponível para todas as clínicas</p>
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
                <Label className="text-sm font-medium">Conta contábil de receita</Label>
                <Select
                  value={form.accountingAccountId ?? ""}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, accountingAccountId: v === "__default__" ? "" : v }))
                  }
                >
                  <SelectTrigger className="rounded-xl">
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
                <p className="text-[10px] text-muted-foreground">
                  Sub-conta usada no DRE. Vazio = receita padrão.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row bg-muted/30 p-4 -mx-6 -mb-6 border-t border-border">
          <Button
            variant="outline"
            className="w-full sm:w-auto h-10 rounded-xl"
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
