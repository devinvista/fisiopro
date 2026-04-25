import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Layers, RefreshCw, FileText, User, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODALIDADE_CONFIG, formatCurrency } from "./helpers";
import type { Procedure, PackageFormData, PackageItem } from "./types";

export function PackageFormModal({
  open,
  editingPackage,
  form,
  setForm,
  procedures,
  onClose,
  onSubmit,
  saving,
}: {
  open: boolean;
  editingPackage: PackageItem | null;
  form: PackageFormData;
  setForm: React.Dispatch<React.SetStateAction<PackageFormData>>;
  procedures: Procedure[];
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const selectedProcedure = procedures.find((p) => p.id === Number(form.procedureId));
  const pricePerSessionAvulso = selectedProcedure ? Number(selectedProcedure.price) : null;

  const pricePerSessionPkg = form.packageType === "sessoes" && form.price && form.totalSessions
    ? Number(form.price) / Number(form.totalSessions)
    : null;

  const discount = pricePerSessionPkg && pricePerSessionAvulso && pricePerSessionAvulso > 0
    ? ((pricePerSessionAvulso - pricePerSessionPkg) / pricePerSessionAvulso) * 100
    : null;

  const weeksEstimated = form.totalSessions && form.sessionsPerWeek
    ? Math.ceil(Number(form.totalSessions) / Number(form.sessionsPerWeek))
    : null;

  const mensal_sessoesMes = form.sessionsPerWeek ? Number(form.sessionsPerWeek) * 4 : null;
  const mensal_pricePerSession = form.monthlyPrice && mensal_sessoesMes
    ? Number(form.monthlyPrice) / mensal_sessoesMes
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{editingPackage ? "Editar Pacote" : "Novo Pacote"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-2 flex-1 overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Nome do pacote *</Label>
            <Input
              placeholder="Ex: Pilates em Grupo — Mensal 2x/semana"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
            <Textarea
              placeholder="Descreva o pacote para o paciente..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Procedimento *</Label>
            <Select value={form.procedureId} onValueChange={(v) => setForm((f) => ({ ...f, procedureId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o procedimento..." />
              </SelectTrigger>
              <SelectContent>
                {procedures.map((p) => {
                  const ModalIcon = MODALIDADE_CONFIG[p.modalidade]?.icon ?? User;
                  return (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="flex items-center gap-2">
                        <ModalIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{p.name}</span>
                        <span className="text-muted-foreground text-xs">
                          ({p.modalidade} · {formatCurrency(p.price)}/sessão)
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de pacote *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { v: "sessoes", label: "Por Sessões", desc: "Quantidade fixa de sessões com validade em dias", icon: Layers, color: "border-blue-300 bg-blue-50 text-blue-700" },
                { v: "mensal", label: "Mensalidade", desc: "Cobrança fixa; gera créditos após pagamento", icon: RefreshCw, color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
                { v: "faturaConsolidada", label: "Fatura consolidada", desc: "Sessões acumulam e viram uma fatura mensal", icon: FileText, color: "border-violet-300 bg-violet-50 text-violet-700" },
              ] as const).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, packageType: opt.v }))}
                    className={cn(
                      "text-left p-3 rounded-xl border-2 transition-all",
                      form.packageType === opt.v
                        ? opt.color
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5" />
                      <p className="text-xs font-bold">{opt.label}</p>
                    </div>
                    <p className="text-[10px] opacity-70 leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Sessões por semana *</Label>
            <Select
              value={String(form.sessionsPerWeek)}
              onValueChange={(v) => setForm((f) => ({ ...f, sessionsPerWeek: Number(v) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}x por semana
                    {n === 1 ? " (1 vez)" : n <= 3 ? " (recomendado)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.packageType === "sessoes" ? (
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Configurações do Pacote por Sessões
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Total de sessões *</Label>
                  <Input type="number" min={1}
                    value={form.totalSessions}
                    onChange={(e) => setForm((f) => ({ ...f, totalSessions: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade (dias)</Label>
                  <Input type="number" min={1}
                    value={form.validityDays}
                    onChange={(e) => setForm((f) => ({ ...f, validityDays: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Preço total do pacote (R$) *</Label>
                <Input type="number" min={0} step={0.01} placeholder="0,00"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className={cn("space-y-4 p-4 rounded-xl border", form.packageType === "mensal" ? "bg-emerald-50/50 border-emerald-100" : "bg-violet-50/50 border-violet-100")}>
              <p className={cn("text-xs font-semibold flex items-center gap-1.5", form.packageType === "mensal" ? "text-emerald-700" : "text-violet-700")}>
                {form.packageType === "mensal" ? <RefreshCw className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {form.packageType === "mensal" ? "Configurações da Mensalidade" : "Configurações da Fatura Consolidada"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{form.packageType === "mensal" ? "Valor mensal (R$) *" : "Valor por sessão (R$) *"}</Label>
                  <Input type="number" min={0} step={0.01} placeholder="0,00"
                    value={form.monthlyPrice}
                    onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia de cobrança *</Label>
                  <Input type="number" min={1} max={31}
                    value={form.billingDay}
                    onChange={(e) => setForm((f) => ({ ...f, billingDay: Number(e.target.value) }))}
                  />
                </div>
              </div>
              {form.packageType === "mensal" && <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Limite de faltas creditadas por mês
                  <span className="text-[10px] text-muted-foreground font-normal">(faltas acima deste limite não são creditadas)</span>
                </Label>
                <Select
                  value={String(form.absenceCreditLimit)}
                  onValueChange={(v) => setForm((f) => ({ ...f, absenceCreditLimit: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem crédito de faltas</SelectItem>
                    <SelectItem value="1">1 falta creditada/mês</SelectItem>
                    <SelectItem value="2">2 faltas creditadas/mês</SelectItem>
                    <SelectItem value="3">3 faltas creditadas/mês</SelectItem>
                    <SelectItem value="4">4 faltas creditadas/mês</SelectItem>
                  </SelectContent>
                </Select>
                {form.absenceCreditLimit > 0 && (
                  <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded-lg p-2 flex gap-1.5">
                    <Info className="h-3 w-3 shrink-0 mt-0.5" />
                    Até {form.absenceCreditLimit} falta(s) por mês geram crédito de sessão para o próximo mês. Faltas adicionais não geram crédito.
                  </p>
                )}
              </div>}
              {form.packageType === "faturaConsolidada" && (
                <p className="text-[10px] text-violet-700 bg-violet-50 rounded-lg p-2 flex gap-1.5">
                  <Info className="h-3 w-3 shrink-0 mt-0.5" />
                  As sessões concluídas não geram cobrança imediata; elas ficam pendentes e são somadas em uma fatura no dia de cobrança.
                </p>
              )}
            </div>
          )}

          {selectedProcedure && (
            <div className="bg-muted/50 rounded-xl p-3 space-y-2 text-sm border">
              <p className="text-xs font-semibold text-foreground">Resumo financeiro</p>
              {form.packageType === "sessoes" ? (
                <>
                  {pricePerSessionPkg !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço por sessão no pacote:</span>
                      <span className="font-semibold">{formatCurrency(pricePerSessionPkg)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preço avulso:</span>
                    <span className="font-semibold">{formatCurrency(selectedProcedure.price)}</span>
                  </div>
                  {discount !== null && (
                    <div className="flex justify-between pt-1 border-t">
                      <span className="text-muted-foreground">Desconto para o paciente:</span>
                      <span className={cn("font-bold", discount > 0 ? "text-emerald-600" : "text-red-500")}>
                        {discount > 0 ? `-${discount.toFixed(0)}%` : `${Math.abs(discount).toFixed(0)}% acima do avulso`}
                      </span>
                    </div>
                  )}
                  {weeksEstimated !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração estimada:</span>
                      <span className="font-semibold">~{weeksEstimated} semana(s)</span>
                    </div>
                  )}
                </>
              ) : form.packageType === "mensal" ? (
                <>
                  {mensal_sessoesMes !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sessões/mês (estimado):</span>
                      <span className="font-semibold">{mensal_sessoesMes} sessões</span>
                    </div>
                  )}
                  {mensal_pricePerSession !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Custo por sessão no plano:</span>
                      <span className="font-semibold">{formatCurrency(mensal_pricePerSession)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preço avulso:</span>
                    <span className="font-semibold">{formatCurrency(selectedProcedure.price)}</span>
                  </div>
                  {mensal_pricePerSession !== null && Number(selectedProcedure.price) > 0 && (
                    <div className="flex justify-between pt-1 border-t">
                      <span className="text-muted-foreground">Desconto mensal vs. avulso:</span>
                      <span className={cn("font-bold",
                        mensal_pricePerSession < Number(selectedProcedure.price) ? "text-emerald-600" : "text-red-500"
                      )}>
                        {mensal_pricePerSession < Number(selectedProcedure.price)
                          ? `-${(((Number(selectedProcedure.price) - mensal_pricePerSession) / Number(selectedProcedure.price)) * 100).toFixed(0)}%`
                          : `+${(((mensal_pricePerSession - Number(selectedProcedure.price)) / Number(selectedProcedure.price)) * 100).toFixed(0)}%`}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor que entra na fatura por sessão:</span>
                    <span className="font-semibold">{formatCurrency(form.monthlyPrice || selectedProcedure.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dia de fechamento/cobrança:</span>
                    <span className="font-semibold">dia {form.billingDay}</span>
                  </div>
                  <div className="text-[10px] text-violet-700 bg-violet-50 rounded-lg p-2">
                    Atendimento concluído entra como pendente de fatura, e o job mensal consolida tudo em uma cobrança única.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row px-6 py-4 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto h-10 rounded-xl">Cancelar</Button>
          <Button onClick={onSubmit} disabled={saving} className="w-full sm:w-auto h-10 rounded-xl">
            {editingPackage ? "Salvar alterações" : "Criar pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
