import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api";

interface Props {
  patientId: number;
}

const labelsByOrigin: Record<string, string> = {
  mensal: "Pacote mensal",
  avulso: "Avulso",
  pacoteFechado: "Pacote fechado",
  reposicaoFalta: "Reposição (falta)",
  reposicaoRemarcacao: "Reposição (cancelamento)",
  cortesia: "Cortesia",
  ajuste: "Ajuste manual",
};

const labelsByStatus: Record<string, string> = {
  disponivel: "Disponível",
  pendentePagamento: "Pendente pagamento",
  consumido: "Consumido",
  expirado: "Expirado",
  estornado: "Estornado",
};

const colorByStatus: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pendentePagamento: "bg-amber-100 text-amber-700 border-amber-200",
  consumido: "bg-slate-100 text-slate-600 border-slate-200",
  expirado: "bg-red-100 text-red-700 border-red-200",
  estornado: "bg-purple-100 text-purple-700 border-purple-200",
};

export function CreditsStatementBlock({ patientId }: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/patients/${patientId}/session-credits/statement`],
    queryFn: () =>
      apiFetchJson<any>(`/api/patients/${patientId}/session-credits/statement`),
    enabled: open && !!patientId,
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Extrato de créditos do paciente
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {isLoading && (
            <div className="text-center py-6">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary opacity-30" />
            </div>
          )}
          {!isLoading && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {(["disponivel", "pendentePagamento", "consumido", "expirado", "estornado"] as const).map((s) => (
                  <div key={s} className={`rounded-lg border px-2 py-2 ${colorByStatus[s]}`}>
                    <p className="text-[11px] font-medium">{labelsByStatus[s]}</p>
                    <p className="text-base font-bold">
                      {data.totalsByStatus?.[s]?.remaining ?? 0}
                    </p>
                  </div>
                ))}
              </div>
              {Array.isArray(data.entries) && data.entries.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  Nenhum crédito registrado.
                </p>
              )}
              {Array.isArray(data.entries) && data.entries.length > 0 && (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 bg-slate-50">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Procedimento</th>
                        <th className="px-3 py-2 font-medium">Origem</th>
                        <th className="px-3 py-2 font-medium">Mês ref.</th>
                        <th className="px-3 py-2 font-medium">Validade</th>
                        <th className="px-3 py-2 font-medium text-right">Restante</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.entries.slice(0, 50).map((e: any) => (
                        <tr key={e.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-slate-700">{e.procedureName ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {labelsByOrigin[e.origin] ?? e.origin}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{e.monthRef ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {e.validUntil
                              ? new Date(e.validUntil).toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {Math.max(0, (e.quantity ?? 0) - (e.usedQuantity ?? 0))}
                            <span className="text-slate-400 font-normal"> / {e.quantity}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded px-1.5 py-0.5 border text-[10px] ${colorByStatus[e.status] ?? ""}`}>
                              {labelsByStatus[e.status] ?? e.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.entries.length > 50 && (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      Exibindo 50 de {data.entries.length} créditos.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
