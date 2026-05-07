import { Check, ClipboardList, Wallet, Lock, AlertTriangle, CalendarDays, ScrollText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type PlanStepKey = "itens" | "cobranca" | "agenda" | "contrato";

export type PlanStepStatus = "done" | "active" | "available" | "locked";

interface StepDef {
  key: PlanStepKey;
  label: string;
  hint: string;
  Icon: typeof ClipboardList;
}

const STEPS: StepDef[] = [
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
  aceiteStats?: { configured: number; total: number };
  monthlyMissingCount?: number;
  billingConfigured?: boolean;
  onSelect: (step: PlanStepKey) => void;
}

function statusFor(
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
    if (isStarted) return "done";
    if (monthlyMissingCount === 0 && hasItems) return "available";
    return "available";
  }
  if (!hasItems) return "locked";
  if (monthlyMissingCount > 0 && !isStarted) return "locked";
  if (current === "contrato") return "active";
  if (isStarted) return "done";
  return "available";
}

export function PlanStepper({
  current, hasItems, isAccepted, isStarted,
  aceiteStats, monthlyMissingCount = 0, billingConfigured = false, onSelect,
}: Props) {
  const showCounter = !!aceiteStats && aceiteStats.total > 0 && hasItems && !isStarted;
  const allSet = showCounter && aceiteStats!.configured === aceiteStats!.total;
  const pending = showCounter ? aceiteStats!.total - aceiteStats!.configured : 0;
  const scheduleBlocked = hasItems && !isStarted && monthlyMissingCount > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <ol className="flex">
          {STEPS.map((step, idx) => {
            const status = statusFor(
              step.key, current, hasItems, isAccepted, isStarted,
              monthlyMissingCount, billingConfigured,
            );
            const isLast = idx === STEPS.length - 1;
            const isDone = status === "done";
            const isActive = status === "active";
            const isLocked = status === "locked";
            const blockedBySchedule = step.key === "contrato" && isLocked && scheduleBlocked;
            const Icon = step.Icon;

            const buttonContent = (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={isLocked}
                onClick={() => !isLocked && onSelect(step.key)}
                className={[
                  "w-full flex items-center gap-2.5 px-3 py-3.5 text-left transition-colors relative group",
                  isActive ? "bg-primary/5" : isLocked ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer",
                ].join(" ")}
              >
                {/* Step circle */}
                <span className={[
                  "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  isDone
                    ? "bg-emerald-500 text-white shadow-sm"
                    : isActive
                    ? "bg-primary text-white shadow-md shadow-primary/30 ring-4 ring-primary/10"
                    : blockedBySchedule
                    ? "bg-amber-100 text-amber-600 border border-amber-300"
                    : isLocked
                    ? "bg-slate-100 text-slate-300 border border-slate-200"
                    : "bg-white text-slate-500 border border-slate-300 group-hover:border-primary/40",
                ].join(" ")}>
                  {isDone ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : blockedBySchedule ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : isLocked && !blockedBySchedule ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </span>

                {/* Labels (hidden on mobile for non-active) */}
                <span className="min-w-0 hidden sm:flex flex-col leading-tight">
                  <span className={[
                    "text-xs font-semibold flex items-center gap-1.5",
                    isDone ? "text-slate-600" : isActive ? "text-primary" : isLocked ? "text-slate-300" : "text-slate-600",
                  ].join(" ")}>
                    {step.label}
                    {step.key === "agenda" && showCounter && (
                      <span className={[
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                        allSet
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200",
                      ].join(" ")}>
                        {aceiteStats!.configured}/{aceiteStats!.total}
                      </span>
                    )}
                    {blockedBySchedule && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-amber-100 text-amber-800 border border-amber-300">
                        {monthlyMissingCount}
                      </span>
                    )}
                  </span>
                  <span className={[
                    "text-[10px] truncate",
                    blockedBySchedule ? "text-amber-600" : isActive ? "text-primary/60" : "text-slate-400",
                  ].join(" ")}>
                    {step.key === "agenda" && showCounter
                      ? allSet ? "Todas definidas" : `${pending} pendente${pending > 1 ? "s" : ""}`
                      : blockedBySchedule ? "Configure as agendas"
                      : step.hint}
                  </span>
                </span>

                {/* Mobile: step number badge */}
                <span className={[
                  "sm:hidden text-[10px] font-bold",
                  isActive ? "text-primary" : isLocked ? "text-slate-300" : "text-slate-400",
                ].join(" ")}>
                  {idx + 1}
                </span>

                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );

            return (
              <li key={step.key} className={["flex-1 min-w-0", !isLast ? "border-r border-slate-100" : ""].join(" ")}>
                {blockedBySchedule ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="block outline-none">
                        {buttonContent}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-amber-600 text-white max-w-xs text-xs">
                      {monthlyMissingCount === 1
                        ? "1 item recorrente sem agenda. Volte para Agenda e configure o dia e horário."
                        : `${monthlyMissingCount} itens recorrentes sem agenda. Volte para Agenda e configure os dias e horários.`}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  buttonContent
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </TooltipProvider>
  );
}
