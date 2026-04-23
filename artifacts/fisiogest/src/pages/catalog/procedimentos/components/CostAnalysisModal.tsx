import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "../constants";
import { Procedure, OverheadAnalysis } from "../types";

interface CostAnalysisModalProps {
  procedure: Procedure | null;
  onOpenChange: (open: boolean) => void;
  analysisMonth: number;
  setAnalysisMonth: (month: number) => void;
  analysisYear: number;
  setAnalysisYear: (year: number) => void;
  overheadData?: OverheadAnalysis;
  overheadLoading: boolean;
  costForm: { priceOverride: string; variableCost: string; notes: string };
  setCostForm: React.Dispatch<React.SetStateAction<{ priceOverride: string; variableCost: string; notes: string }>>;
  computedFixedCostPerSession: number | null;
  onSave: () => void;
  isSaving: boolean;
}

export function CostAnalysisModal({
  procedure,
  onOpenChange,
  analysisMonth,
  setAnalysisMonth,
  analysisYear,
  setAnalysisYear,
  overheadData,
  overheadLoading,
  costForm,
  setCostForm,
  computedFixedCostPerSession,
  onSave,
  isSaving,
}: CostAnalysisModalProps) {
  if (!procedure) return null;

  return (
    <Dialog open={!!procedure} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Análise de Custos — {procedure.name}
          </DialogTitle>
          <div className="text-xs text-slate-500 mt-0.5">
            O overhead é calculado automaticamente (despesas da clínica ÷ horas disponíveis).
            O custo variável é inserido manualmente para materiais e insumos por sessão.
            {procedure.modalidade !== "individual" && (
              <span className="ml-1 text-violet-600 font-medium">
                Overhead rateado por {procedure.maxCapacity ?? 1} participantes.
              </span>
            )}
            {procedure.isGlobal && (
              <span className="ml-1 text-blue-600 font-medium">Procedimento global.</span>
            )}
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 shrink-0">Período de referência:</span>
          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
            value={analysisMonth}
            onChange={e => setAnalysisMonth(Number(e.target.value))}
          >
            {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
            value={analysisYear}
            onChange={e => setAnalysisYear(Number(e.target.value))}
          >
            {[analysisYear - 1, analysisYear, analysisYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Wrench className="w-3 h-3" /> Overhead da Clínica — calculado automaticamente
            </div>
            {overheadLoading ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">Calculando…</div>
            ) : overheadData ? (
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-3 px-3 py-2.5 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total de despesas</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(overheadData.totalOverhead)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Horas disponíveis</p>
                    <p className="font-semibold text-slate-800">{overheadData.totalAvailableHours}h</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Custo por hora</p>
                    <p className="font-bold text-emerald-700">{formatCurrency(overheadData.costPerHour)}/h</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 px-3 py-2.5 bg-emerald-50/60">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                      Overhead estimado / part. <span className="normal-case">({procedure.durationMinutes} min)</span>
                    </p>
                    <p className="text-base font-bold text-emerald-700">
                      {computedFixedCostPerSession !== null ? formatCurrency(computedFixedCostPerSession) : "—"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatCurrency(overheadData.costPerHour)}/h × {((procedure.durationMinutes ?? 0) / 60).toFixed(2)}h
                      {procedure.modalidade !== "individual" && (
                        <> ÷ {procedure.maxCapacity ?? 1} cap.</>
                      )}
                    </p>
                  </div>
                  {overheadData.procedureStats && (
                    <div className="text-right">
                      {overheadData.procedureStats.avgActualParticipants !== null ? (
                        <>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                            Overhead real / part.
                          </p>
                          <p className="text-base font-bold text-slate-700">
                            {formatCurrency(overheadData.procedureStats.fixedCostPerSessionReal)}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Média {overheadData.procedureStats.avgActualParticipants} part.
                            · {overheadData.procedureStats.uniqueCompletedSessions} sessões
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                            Overhead total / mês
                          </p>
                          <p className="text-base font-bold text-slate-700">
                            {formatCurrency(overheadData.procedureStats.fixedCostAllocatedMonthly)}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {overheadData.procedureStats.confirmedAppointments} atend.
                            · {overheadData.procedureStats.totalHoursUsed}h
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {overheadData.schedules.length > 0 && (
                  <div className="px-3 py-2 text-[10px] text-slate-400 flex flex-wrap gap-3">
                    {overheadData.schedules.map((s, i) => (
                      <span key={i}>{s.name}: {s.startTime}–{s.endTime} · {s.workingDaysInMonth} dias · {s.hoursInMonth}h</span>
                    ))}
                  </div>
                )}

                {overheadData.totalAvailableHours === 0 && (
                  <div className="px-3 py-2 text-[10px] text-amber-600 bg-amber-50">
                    Nenhuma agenda ativa encontrada. Cadastre a agenda da clínica para calcular automaticamente.
                  </div>
                )}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                Sem dados de agenda/despesas para o período selecionado.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Preço cobrado pela clínica (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={costForm.priceOverride}
                onChange={e => setCostForm(f => ({ ...f, priceOverride: e.target.value }))}
                placeholder={`Padrão: ${formatCurrency(procedure.price ?? 0)}`}
                className="rounded-xl"
              />
              <p className="text-[10px] text-slate-400">Deixe em branco para usar o preço base.</p>
            </div>
            <div className="space-y-1">
              <Label>Custo variável / sessão (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={costForm.variableCost}
                onChange={e => setCostForm(f => ({ ...f, variableCost: e.target.value }))}
                placeholder="0,00"
                className="rounded-xl"
              />
              <p className="text-[10px] text-slate-400">Materiais, insumos por sessão.</p>
            </div>
          </div>

          {(() => {
            const price = Number(costForm.priceOverride || procedure.effectivePrice || procedure.price || 0);
            const fixed = computedFixedCostPerSession ?? 0;
            const variable = Number(costForm.variableCost || 0);
            const total = fixed + variable;
            if (!price) return null;
            const m = ((price - total) / price) * 100;
            return (
              <div className={cn(
                "rounded-xl border px-4 py-3",
                m >= 60 ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                         : m >= 35 ? "bg-amber-50 border-amber-100 text-amber-800"
                         : "bg-red-50 border-red-100 text-red-800"
              )}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Margem por sessão</span>
                  <span className="text-xl font-bold">{m.toFixed(1)}%</span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 text-[11px] opacity-80 gap-x-2">
                  <span>Preço: {formatCurrency(price)}</span>
                  <span>Overhead: {formatCurrency(fixed)}</span>
                  <span>Variável: {formatCurrency(variable)}</span>
                </div>
              </div>
            );
          })()}

          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              value={costForm.notes}
              onChange={e => setCostForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Ex: Inclui material descartável, taxa de sala..."
              className="rounded-xl resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl"
            onClick={onSave}
            disabled={isSaving}
          >
            <DollarSign className="mr-1.5 h-4 w-4" />
            {isSaving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
