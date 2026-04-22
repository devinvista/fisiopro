import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Edit2, Link2, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "../../utils";
import { MONTH_NAMES } from "../../constants";

type TypeFilter = "all" | "receita" | "despesa";

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  pago: { label: "Pago", dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50" },
  pendente: { label: "Pendente", dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  estornado: { label: "Estornado", dot: "bg-red-400", text: "text-red-600", bg: "bg-red-50" },
  cancelado: { label: "Cancelado", dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50" },
};

export function RecordsTable({
  records,
  recLoading,
  month,
  year,
  typeFilter,
  setTypeFilter,
  totalReceitas,
  totalDespesas,
  onNew,
  onEdit,
  onDelete,
}: {
  records: any[];
  recLoading: boolean;
  month: number;
  year: number;
  typeFilter: TypeFilter;
  setTypeFilter: (v: TypeFilter) => void;
  totalReceitas: number;
  totalDespesas: number;
  onNew: () => void;
  onEdit: (record: any) => void;
  onDelete: (info: { id: number; description: string; amount: number }) => void;
}) {
  return (
    <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
      <CardHeader className="pb-0 px-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-800">Lançamentos</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">{records.length} registro(s) · {MONTH_NAMES[month - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
              {(["all", "receita", "despesa"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${typeFilter === t
                    ? "bg-white shadow-sm text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {t === "all" ? "Todos" : t === "receita" ? "Entradas" : "Saídas"}
                </button>
              ))}
            </div>
            <Button
              onClick={onNew}
              size="sm"
              className="rounded-xl h-8 px-3 text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Novo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 mt-4">
        {recLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-16 bg-slate-100 animate-pulse rounded" />
                <div className="h-4 flex-1 bg-slate-100 animate-pulse rounded" />
                <div className="h-4 w-20 bg-slate-100 animate-pulse rounded" />
                <div className="h-4 w-16 bg-slate-100 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Adicione receitas e despesas para visualizar os lançamentos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data/Vencimento</th>
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Categoria</th>
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Pagamento</th>
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Status</th>
                  <th className="py-2.5 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                  <th className="py-2.5 px-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const rec = record as any;
                  const recStatus: string = rec.status ?? "pago";
                  const dueDate = rec.dueDate ? new Date(rec.dueDate + "T12:00:00") : null;
                  const paymentDate = rec.paymentDate ? new Date(rec.paymentDate + "T12:00:00") : null;
                  const displayDate = paymentDate ?? dueDate ?? new Date(record.createdAt);

                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const daysOverdue = (recStatus === "pendente" && dueDate)
                    ? Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
                    : 0;
                  const isOverdue = daysOverdue > 0;

                  const statusInfo = isOverdue
                    ? { label: `Vencido há ${daysOverdue}d`, dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" }
                    : (STATUS_CFG[recStatus] ?? { label: recStatus, dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50" });

                  return (
                    <tr
                      key={record.id}
                      className={`group border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${isOverdue ? "bg-red-50/30" : ""}`}
                    >
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <p className="text-xs tabular-nums text-slate-700 font-medium">
                          {format(displayDate, "dd/MM/yy")}
                        </p>
                        {dueDate && recStatus === "pendente" && (
                          <p className={`text-[10px] tabular-nums ${isOverdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                            Venc. {format(dueDate, "dd/MM/yy")}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-sm font-medium text-slate-800 max-w-[180px] truncate">
                        {record.description}
                      </td>
                      <td className="py-3.5 px-5 hidden md:table-cell">
                        <div className="flex flex-col gap-1">
                          {rec.transactionType === "faturaConsolidada" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide w-fit">
                              Fatura Consolidada
                            </span>
                          )}
                          {rec.transactionType === "pendenteFatura" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide w-fit">
                              Sessão (Pendente Fatura)
                            </span>
                          )}
                          {rec.procedureName ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium w-fit">
                              <Link2 className="w-3 h-3" />
                              {rec.procedureName}
                            </span>
                          ) : record.category ? (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full w-fit">
                              {record.category}
                            </span>
                          ) : !rec.transactionType && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 hidden lg:table-cell">
                        {rec.paymentMethod ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">
                            {rec.paymentMethod}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-5 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className={`py-3.5 px-5 text-sm font-bold text-right whitespace-nowrap tabular-nums ${record.type === "receita" ? "text-emerald-600" : "text-red-600"}`}>
                        {record.type === "receita" ? "+" : "−"}{formatCurrency(Number(record.amount))}
                      </td>
                      <td className="py-3.5 px-3 w-20">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => onEdit(record)}
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-300 hover:text-blue-600 transition-all"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete({ id: record.id, description: record.description, amount: Number(record.amount) })}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-500 transition-all"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {records.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={6} className="py-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">
                      Totais do período
                    </td>
                    <td colSpan={2} className="py-3 px-5 md:hidden" />
                    <td className="py-3 px-5 text-right">
                      {typeFilter !== "despesa" && (
                        <p className="text-sm font-bold text-emerald-600 tabular-nums">+{formatCurrency(totalReceitas)}</p>
                      )}
                      {typeFilter !== "receita" && (
                        <p className="text-sm font-bold text-red-600 tabular-nums">−{formatCurrency(totalDespesas)}</p>
                      )}
                      {typeFilter === "all" && (
                        <p className={`text-sm font-extrabold mt-0.5 tabular-nums ${totalReceitas - totalDespesas >= 0 ? "text-indigo-600" : "text-red-700"}`}>
                          {formatCurrency(totalReceitas - totalDespesas)}
                        </p>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
