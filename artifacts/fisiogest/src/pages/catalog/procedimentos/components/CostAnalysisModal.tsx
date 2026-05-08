import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, ChevronDown, ChevronUp, Wrench, Info, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "../constants";
import { Procedure, OverheadAnalysis } from "../types";
import { useState } from "react";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

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
  const [overheadOpen, setOverheadOpen] = useState(false);

  if (!procedure) return null;

  const price        = Number(costForm.priceOverride || procedure.effectivePrice || procedure.price || 0);
  const fixedEst     = computedFixedCostPerSession ?? 0;
  const variable     = Number(costForm.variableCost || 0);
  const totalCost    = fixedEst + variable;
  const margin       = price > 0 ? ((price - totalCost) / price) * 100 : 0;
  const marginGood   = margin >= 60;
  const marginOk     = margin >= 35;

  return (
    <Dialog open={!!procedure} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl shrink-0">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <span className="block text-foreground">Custos da Clínica</span>
              <span className="block text-sm font-normal text-muted-foreground truncate mt-0.5">
                {procedure.name}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Inputs: Preço + Custo variável ──────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Preço cobrado pela clínica</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={costForm.priceOverride}
                  onChange={e => setCostForm(f => ({ ...f, priceOverride: e.target.value }))}
                  placeholder={String(Number(procedure.price ?? 0).toFixed(2))}
                  className="pl-9 rounded-xl"
                />
              </div>
              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                <Info className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                Vazio = preço base ({formatCurrency(procedure.price ?? 0)})
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Custo variável / sessão</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">R$</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={costForm.variableCost}
                  onChange={e => setCostForm(f => ({ ...f, variableCost: e.target.value }))}
                  placeholder="0,00"
                  className="pl-9 rounded-xl"
                />
              </div>
              <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                <Info className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                Materiais e insumos por atendimento
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Observações</Label>
            <Textarea
              value={costForm.notes}
              onChange={e => setCostForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Ex: material descartável, taxa de sala, kit de higiene…"
              className="rounded-xl resize-none text-sm"
            />
          </div>

          {/* ── Margem resumo ───────────────────────────────────────────── */}
          {price > 0 && (
            <div className={cn(
              "rounded-2xl border px-4 py-3.5 space-y-2.5",
              marginGood ? "bg-emerald-50/70 border-emerald-100"
                : marginOk ? "bg-amber-50/70 border-amber-100"
                : "bg-rose-50/70 border-rose-100"
            )}>
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-semibold",
                  marginGood ? "text-emerald-800" : marginOk ? "text-amber-800" : "text-rose-800"
                )}>
                  Margem estimada por sessão
                </span>
                <span className={cn("text-2xl font-bold tabular-nums",
                  marginGood ? "text-emerald-700" : marginOk ? "text-amber-700" : "text-rose-700"
                )}>
                  {margin.toFixed(1)}%
                </span>
              </div>
              <div className={cn("grid grid-cols-3 gap-2 text-[11px]",
                marginGood ? "text-emerald-700" : marginOk ? "text-amber-700" : "text-rose-700"
              )}>
                <div>
                  <p className="opacity-60 font-bold uppercase text-[9px] tracking-wide mb-0.5">Receita</p>
                  <p className="font-bold tabular-nums">{formatCurrency(price)}</p>
                </div>
                <div>
                  <p className="opacity-60 font-bold uppercase text-[9px] tracking-wide mb-0.5">Overhead est.</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(fixedEst)}</p>
                </div>
                <div>
                  <p className="opacity-60 font-bold uppercase text-[9px] tracking-wide mb-0.5">Variável</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(variable)}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Overhead colapsável ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setOverheadOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left gap-3"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Análise de Overhead
                </span>
                <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal hidden sm:block">
                  calculado automaticamente a partir de despesas e agenda
                </span>
              </div>
              {overheadOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>

            {overheadOpen && (
              <div className="divide-y divide-border">
                {/* Period picker */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-card flex-wrap">
                  <span className="text-[11px] text-muted-foreground shrink-0">Período:</span>
                  <select
                    className="text-xs border border-border rounded-lg px-2 py-1 bg-card text-foreground"
                    value={analysisMonth}
                    onChange={e => setAnalysisMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    className="text-xs border border-border rounded-lg px-2 py-1 bg-card text-foreground"
                    value={analysisYear}
                    onChange={e => setAnalysisYear(Number(e.target.value))}
                  >
                    {[analysisYear - 1, analysisYear, analysisYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {overheadLoading ? (
                  <div className="px-4 py-5 text-center text-xs text-muted-foreground">Calculando…</div>
                ) : overheadData ? (
                  <>
                    <div className="grid grid-cols-3 px-4 py-3 gap-3 text-xs bg-card">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">Total despesas</p>
                        <p className="font-bold text-foreground tabular-nums">{formatCurrency(overheadData.totalOverhead)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">Horas disp.</p>
                        <p className="font-bold text-foreground tabular-nums">{overheadData.totalAvailableHours}h</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">Custo / hora</p>
                        <p className="font-bold text-emerald-700 tabular-nums">{formatCurrency(overheadData.costPerHour)}</p>
                      </div>
                    </div>

                    <div className="px-4 py-3 bg-emerald-50/50 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">
                          Overhead estimado / {procedure.modalidade !== "individual" ? "participante" : "sessão"}
                        </p>
                        <p className="text-lg font-bold text-emerald-700 tabular-nums">
                          {computedFixedCostPerSession !== null ? formatCurrency(computedFixedCostPerSession) : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatCurrency(overheadData.costPerHour)}/h × {((procedure.durationMinutes ?? 0) / 60).toFixed(2)}h
                          {procedure.modalidade !== "individual" && <> ÷ {procedure.maxCapacity ?? 1} cap.</>}
                        </p>
                      </div>

                      {overheadData.procedureStats && (
                        <div className="text-right">
                          {overheadData.procedureStats.avgActualParticipants !== null ? (
                            <>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">Overhead real</p>
                              <p className="text-lg font-bold text-foreground tabular-nums">
                                {formatCurrency(overheadData.procedureStats.fixedCostPerSessionReal)}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Média {overheadData.procedureStats.avgActualParticipants} part.
                                · {overheadData.procedureStats.uniqueCompletedSessions} sessões
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold mb-1">Overhead / mês</p>
                              <p className="text-lg font-bold text-foreground tabular-nums">
                                {formatCurrency(overheadData.procedureStats.fixedCostAllocatedMonthly)}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {overheadData.procedureStats.confirmedAppointments} atend.
                                · {overheadData.procedureStats.totalHoursUsed}h
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {overheadData.schedules.length > 0 && (
                      <div className="px-4 py-2 flex flex-wrap gap-2">
                        {overheadData.schedules.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            {s.name}: {s.startTime}–{s.endTime} · {s.workingDaysInMonth}d · {s.hoursInMonth}h
                          </span>
                        ))}
                      </div>
                    )}

                    {overheadData.totalAvailableHours === 0 && (
                      <div className="px-4 py-2.5 text-[11px] text-amber-700 bg-amber-50 flex items-center gap-1.5">
                        <Info className="w-3 h-3 shrink-0" />
                        Nenhuma agenda ativa. Cadastre a agenda da clínica para calcular o overhead.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-5 text-center text-xs text-muted-foreground">
                    Sem dados de agenda ou despesas para o período selecionado.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row bg-muted/30 p-4 -mx-6 -mb-6 border-t border-border mt-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto rounded-xl shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onSave}
            disabled={isSaving}
          >
            <DollarSign className="mr-1.5 h-4 w-4" />
            {isSaving ? "Salvando…" : "Salvar Custos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
