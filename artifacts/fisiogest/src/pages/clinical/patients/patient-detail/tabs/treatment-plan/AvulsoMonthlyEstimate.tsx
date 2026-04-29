import { useMemo } from "react";
import { TrendingUp, Info } from "lucide-react";
import { fmtCur } from "../../utils/format";

type PlanItem = {
  id: number;
  procedureName?: string | null;
  packageName?: string | null;
  packageId?: number | null;
  packageType?: string | null;
  sessionsPerWeek?: number | null;
  totalSessions?: number | null;
  unitPrice?: string | number | null;
  price?: string | number | null;
  discount?: string | number | null;
};

interface Props {
  planItems: PlanItem[];
  durationMonths: number;
}

/**
 * Estima quanto, mês a mês, o paciente deve pagar pelos procedimentos
 * AVULSOS (sem packageId) ou pacotes "sessões" (não recorrentes mensais).
 * Pacotes mensais já viraram parcelas fixas no PlanInstallmentsPanel.
 */
export function AvulsoMonthlyEstimate({ planItems, durationMonths }: Props) {
  const avulsoItems = useMemo(
    () => planItems.filter((i) => i.packageType !== "mensal"),
    [planItems],
  );

  if (avulsoItems.length === 0) return null;

  const total = avulsoItems.reduce((sum, i) => {
    const unit = Number(i.unitPrice ?? i.price ?? 0);
    const sessions = Number(i.totalSessions ?? 1);
    const disc = Number(i.discount ?? 0);
    return sum + Math.max(0, unit * sessions - disc);
  }, 0);

  const months = Math.max(1, durationMonths);
  const perMonth = total / months;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-amber-700" />
        <h4 className="text-sm font-semibold text-slate-700">
          Estimativa de avulsos / pagos por sessão
        </h4>
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed">
        Procedimentos avulsos e pacotes de sessões não geram parcelas fixas.
        Eles são cobrados conforme o atendimento. Abaixo, a média mensal projetada
        para o período de vigência do plano.
      </p>

      <div className="space-y-1 text-xs">
        {avulsoItems.map((i) => {
          const unit = Number(i.unitPrice ?? i.price ?? 0);
          const sessions = Number(i.totalSessions ?? 1);
          const disc = Number(i.discount ?? 0);
          const net = Math.max(0, unit * sessions - disc);
          const label = i.packageName ?? i.procedureName ?? "—";
          return (
            <div
              key={i.id}
              className="flex justify-between items-center py-1 border-b border-amber-200/60 last:border-0"
            >
              <span className="text-slate-700 truncate max-w-[60%]">
                {label}
                <span className="text-slate-400 font-normal">
                  {" "}· {sessions} sess. × {fmtCur(unit)}
                </span>
              </span>
              <span className="font-medium text-slate-700">{fmtCur(net)}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200/60">
        <div className="rounded-lg bg-white border border-amber-200 p-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Total no período
          </p>
          <p className="text-base font-bold text-amber-700">{fmtCur(total)}</p>
          <p className="text-[10px] text-slate-500">{months} {months === 1 ? "mês" : "meses"}</p>
        </div>
        <div className="rounded-lg bg-white border border-amber-200 p-2.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Média / mês
          </p>
          <p className="text-base font-bold text-amber-700">{fmtCur(perMonth)}</p>
          <p className="text-[10px] text-slate-500">estimativa</p>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Os valores reais aparecerão no extrato à medida que as sessões forem
        realizadas e cobradas individualmente.
      </p>
    </div>
  );
}
