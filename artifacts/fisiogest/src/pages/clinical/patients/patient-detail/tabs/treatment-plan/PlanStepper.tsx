import { Check, ClipboardList, PenLine, Wallet, Lock } from "lucide-react";

export type PlanStepKey = "itens" | "aceite" | "cobranca";

export type PlanStepStatus = "done" | "active" | "available" | "locked";

interface StepDef {
  key: PlanStepKey;
  label: string;
  hint: string;
  Icon: typeof ClipboardList;
}

const STEPS: StepDef[] = [
  { key: "itens", label: "Itens", hint: "O que será feito", Icon: ClipboardList },
  { key: "aceite", label: "Aceite & Agenda", hint: "Assinatura e horários", Icon: PenLine },
  { key: "cobranca", label: "Cobrança", hint: "Pagamento e iniciar", Icon: Wallet },
];

interface Props {
  current: PlanStepKey;
  hasItems: boolean;
  isAccepted: boolean;
  isStarted: boolean;
  aceiteStats?: { configured: number; total: number };
  onSelect: (step: PlanStepKey) => void;
}

function statusFor(
  step: PlanStepKey,
  current: PlanStepKey,
  hasItems: boolean,
  isAccepted: boolean,
  isStarted: boolean,
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
  if (current === "cobranca") return "active";
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

export function PlanStepper({ current, hasItems, isAccepted, isStarted, aceiteStats, onSelect }: Props) {
  const showAceiteCounter =
    !!aceiteStats && aceiteStats.total > 0 && hasItems && !isStarted;
  const aceiteAllSet =
    showAceiteCounter && aceiteStats!.configured === aceiteStats!.total;
  const aceitePending = showAceiteCounter
    ? aceiteStats!.total - aceiteStats!.configured
    : 0;
  return (
    <div
      className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm"
      role="tablist"
      aria-label="Etapas do plano de tratamento"
    >
      <ol className="flex items-stretch gap-1 sm:gap-2">
        {STEPS.map((step, idx) => {
          const status = statusFor(step.key, current, hasItems, isAccepted, isStarted);
          const styles = styleByStatus[status];
          const isLast = idx === STEPS.length - 1;
          const Icon = step.Icon;
          const showCheck = status === "done";
          const showLock = status === "locked";

          return (
            <li key={step.key} className="flex-1 flex items-stretch gap-1 sm:gap-2 min-w-0">
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
                    ? "opacity-70"
                    : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={`relative h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold transition-all ${styles.circle}`}
                >
                  {showCheck ? (
                    <Check className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={3} />
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
                    {step.key === "aceite" && showAceiteCounter && (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                          aceiteAllSet
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                        aria-label={
                          aceiteAllSet
                            ? `Todas as ${aceiteStats!.total} agendas definidas`
                            : `${aceiteStats!.configured} de ${aceiteStats!.total} agendas definidas`
                        }
                      >
                        {aceiteStats!.configured}/{aceiteStats!.total}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {step.key === "aceite" && showAceiteCounter
                      ? aceiteAllSet
                        ? "Todas as agendas definidas"
                        : `${aceitePending} pendente${aceitePending > 1 ? "s" : ""}`
                      : step.hint}
                  </span>
                </span>
                <span className={`sm:hidden text-xs truncate ${styles.label} flex items-center gap-1.5`}>
                  {step.label}
                  {step.key === "aceite" && showAceiteCounter && (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        aceiteAllSet
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {aceiteStats!.configured}/{aceiteStats!.total}
                    </span>
                  )}
                </span>
              </button>
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
  );
}
