import { Check, ClipboardList, PenLine, Wallet, Lock, AlertTriangle, CalendarDays, ScrollText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ───────────────────────────────────────────────────────────────────────────
// PlanStepper — suporta dois layouts:
//   • v1 (legado, 3 etapas): itens → aceite → cobranca
//   • v2 (Sprint 15): itens → cobranca → agenda → contrato
//     No v2 o aceite é movido para o final e dispara o materialize na MESMA
//     transação (endpoint /accept-and-materialize), eliminando o estado
//     "aceito mas não materializado".
// ───────────────────────────────────────────────────────────────────────────

export type PlanStepKey =
  | "itens"
  | "aceite"      // v1
  | "cobranca"
  | "agenda"      // v2
  | "contrato";   // v2

export type PlanStepStatus = "done" | "active" | "available" | "locked";

interface StepDef {
  key: PlanStepKey;
  label: string;
  hint: string;
  Icon: typeof ClipboardList;
}

const STEPS_V1: StepDef[] = [
  { key: "itens",    label: "Itens",            hint: "O que será feito",          Icon: ClipboardList },
  { key: "aceite",   label: "Aceite & Agenda",  hint: "Assinatura e horários",     Icon: PenLine },
  { key: "cobranca", label: "Cobrança",         hint: "Pagamento e iniciar",       Icon: Wallet },
];

const STEPS_V2: StepDef[] = [
  { key: "itens",    label: "Itens",     hint: "O que será feito",          Icon: ClipboardList },
  { key: "cobranca", label: "Cobrança",  hint: "Como o paciente vai pagar", Icon: Wallet },
  { key: "agenda",   label: "Agenda",    hint: "Dias e horários",           Icon: CalendarDays },
  { key: "contrato", label: "Contrato",  hint: "Assinar e iniciar",         Icon: ScrollText },
];

interface Props {
  current: PlanStepKey;
  hasItems: boolean;
  isAccepted: boolean;
  isStarted: boolean;
  /** Quando true, usa o layout v2 (4 etapas). Default: false (v1). */
  v2?: boolean;
  /** v1: stats da etapa "aceite". v2: stats da etapa "agenda". */
  aceiteStats?: { configured: number; total: number };
  monthlyMissingCount?: number;
  /** v2: indica se a etapa "cobrança" foi salva (libera "agenda"). */
  billingConfigured?: boolean;
  onSelect: (step: PlanStepKey) => void;
}

function statusForV1(
  step: PlanStepKey,
  current: PlanStepKey,
  hasItems: boolean,
  isAccepted: boolean,
  isStarted: boolean,
  monthlyMissingCount: number,
): PlanStepStatus {
  if (step === "itens") {
    if (current === "itens") return "active";
    if (hasItems) return "done";
    return "available";
  }
  if (step === "aceite") {
    if (!hasItems) return "locked";
    if (current === "aceite") return "active";
    if (isAccepted) return "done";
    return "available";
  }
  // cobranca
  if (!isAccepted) return "locked";
  if (!isStarted && monthlyMissingCount > 0) return "locked";
  if (current === "cobranca") return "active";
  if (isStarted) return "done";
  return "available";
}

function statusForV2(
  step: PlanStepKey,
  current: PlanStepKey,
  hasItems: boolean,
  isAccepted: boolean,
  isStarted: boolean,
  monthlyMissingCount: number,
  billingConfigured: boolean,
): PlanStepStatus {
  if (step === "itens") {
    if (current === "itens") return "active";
    if (hasItems) return "done";
    return "available";
  }
  if (step === "cobranca") {
    if (!hasItems) return "locked";
    if (current === "cobranca") return "active";
    if (billingConfigured || isAccepted) return "done";
    return "available";
  }
  if (step === "agenda") {
    if (!hasItems) return "locked";
    if (current === "agenda") return "active";
    // Considerada concluída quando todos os mensais têm agenda OU quando o
    // plano já está aceito+materializado (ponto sem volta no fluxo v2).
    if (isStarted) return "done";
    if (monthlyMissingCount === 0 && hasItems) return "available";
    return "available";
  }
  // contrato
  if (!hasItems) return "locked";
  if (monthlyMissingCount > 0 && !isStarted) return "locked";
  if (current === "contrato") return "active";
  if (isStarted) return "done";
  return "available";
}

const styleByStatus: Record<PlanStepStatus, { circle: string; label: string; line: string }> = {
  done: {
    circle: "bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200",
    label: "text-slate-700",
    line: "bg-emerald-300",
  },
  active: {
    circle: "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30 ring-4 ring-primary/15",
    label: "text-primary font-semibold",
    line: "bg-slate-200",
  },
  available: {
    circle: "bg-white text-slate-500 border-slate-300 hover:border-primary/50 hover:text-primary",
    label: "text-slate-500",
    line: "bg-slate-200",
  },
  locked: {
    circle: "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed",
    label: "text-slate-300",
    line: "bg-slate-200",
  },
};

export function PlanStepper({
  current,
  hasItems,
  isAccepted,
  isStarted,
  v2 = false,
  aceiteStats,
  monthlyMissingCount = 0,
  billingConfigured = false,
  onSelect,
}: Props) {
  const STEPS = v2 ? STEPS_V2 : STEPS_V1;

  // Em v1 o contador aparece na etapa "aceite". Em v2, na etapa "agenda".
  const counterStepKey: PlanStepKey = v2 ? "agenda" : "aceite";
  const showCounter =
    !!aceiteStats && aceiteStats.total > 0 && hasItems && !isStarted;
  const allSet =
    showCounter && aceiteStats!.configured === aceiteStats!.total;
  const pending = showCounter ? aceiteStats!.total - aceiteStats!.configured : 0;

  // Etapa que pode ficar bloqueada por agenda pendente:
  //   v1: "cobranca" (depois do aceite)
  //   v2: "contrato" (último passo, exige todas as agendas)
  const scheduleGatedKey: PlanStepKey = v2 ? "contrato" : "cobranca";
  const scheduleBlocked = v2
    ? hasItems && !isStarted && monthlyMissingCount > 0
    : isAccepted && !isStarted && monthlyMissingCount > 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div
      className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm"
      role="tablist"
      aria-label="Etapas do plano de tratamento"
    >
      <ol className="flex items-stretch gap-1 sm:gap-2">
        {STEPS.map((step, idx) => {
          const status = v2
            ? statusForV2(step.key, current, hasItems, isAccepted, isStarted, monthlyMissingCount, billingConfigured)
            : statusForV1(step.key, current, hasItems, isAccepted, isStarted, monthlyMissingCount);
          const styles = styleByStatus[status];
          const isLast = idx === STEPS.length - 1;
          const Icon = step.Icon;
          const showCheck = status === "done";
          const blockedByScheduleHere =
            step.key === scheduleGatedKey && status === "locked" && scheduleBlocked;
          const showLock = status === "locked" && !blockedByScheduleHere;
          const showWarning = blockedByScheduleHere;

          const buttonEl = (
            <button
              type="button"
              role="tab"
              aria-selected={status === "active"}
              disabled={status === "locked"}
              onClick={() => status !== "locked" && onSelect(step.key)}
              className={`flex-1 min-w-0 flex items-center gap-2 sm:gap-3 rounded-xl px-2 py-2 sm:px-3 sm:py-2.5 text-left transition-colors ${
                status === "active"
                  ? "bg-primary/5"
                  : status === "locked"
                  ? blockedByScheduleHere
                    ? "opacity-90 bg-amber-50/40"
                    : "opacity-70"
                  : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`relative h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${styles.circle}`}
              >
                {showCheck ? (
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={3} />
                ) : showWarning ? (
                  <AlertTriangle className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.5} />
                ) : showLock ? (
                  <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <>
                    <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white border border-slate-200 text-[9px] font-bold text-slate-600 flex items-center justify-center">
                      {idx + 1}
                    </span>
                  </>
                )}
              </span>
              <span className="min-w-0 hidden sm:flex flex-col leading-tight">
                <span className={`text-xs ${styles.label} flex items-center gap-1.5`}>
                  {step.label}
                  {step.key === counterStepKey && showCounter && (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        allSet
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                      aria-label={
                        allSet
                          ? `Todas as ${aceiteStats!.total} agendas definidas`
                          : `${aceiteStats!.configured} de ${aceiteStats!.total} agendas definidas`
                      }
                    >
                      {aceiteStats!.configured}/{aceiteStats!.total}
                    </span>
                  )}
                  {blockedByScheduleHere && (
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-amber-100 text-amber-800 border border-amber-300"
                      aria-label={`${monthlyMissingCount} item(ns) recorrente(s) sem agenda`}
                    >
                      {monthlyMissingCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] truncate ${blockedByScheduleHere ? "text-amber-700" : "text-slate-400"}`}>
                  {step.key === counterStepKey && showCounter
                    ? allSet
                      ? "Todas as agendas definidas"
                      : `${pending} pendente${pending > 1 ? "s" : ""}`
                    : blockedByScheduleHere
                    ? "Defina as agendas dos itens"
                    : step.hint}
                </span>
              </span>
              <span className={`sm:hidden text-xs truncate ${styles.label} flex items-center gap-1.5`}>
                {step.label}
                {step.key === counterStepKey && showCounter && (
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      allSet
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {aceiteStats!.configured}/{aceiteStats!.total}
                  </span>
                )}
                {blockedByScheduleHere && (
                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-amber-100 text-amber-800 border border-amber-300">
                    {monthlyMissingCount}
                  </span>
                )}
              </span>
            </button>
          );

          return (
            <li key={step.key} className="flex-1 flex items-stretch gap-1 sm:gap-2 min-w-0">
              {blockedByScheduleHere ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="flex-1 min-w-0 flex outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-xl">
                      {buttonEl}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-amber-600 text-white max-w-xs">
                    {monthlyMissingCount === 1
                      ? `1 item recorrente está sem agenda definida. Volte para a etapa ${v2 ? "Agenda" : "Aceite & Agenda"} e configure o dia e o horário antes de avançar.`
                      : `${monthlyMissingCount} itens recorrentes estão sem agenda definida. Volte para a etapa ${v2 ? "Agenda" : "Aceite & Agenda"} e configure os dias e horários antes de avançar.`}
                  </TooltipContent>
                </Tooltip>
              ) : (
                buttonEl
              )}
              {!isLast && (
                <span
                  aria-hidden
                  className={`hidden sm:block w-6 self-center h-0.5 rounded-full ${styles.line}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
    </TooltipProvider>
  );
}
