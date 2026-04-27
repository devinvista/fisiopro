import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  RotateCcw, Loader2, FileText, User as UserIcon, Calendar, Search, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { formatCurrency } from "../utils";

type ReversalRow = {
  id: number;
  type: "receita" | "despesa";
  amount: string | number;
  originalAmount: string | number | null;
  description: string;
  category: string | null;
  status: string;
  reversalReason: string | null;
  reversedAt: string | null;
  reversedBy: number | null;
  reversedByName: string | null;
  patientId: number | null;
  patientName: string | null;
  procedureId: number | null;
  procedureName: string | null;
  paymentDate: string | null;
  createdAt: string;
};

type ReversalsResponse = {
  data: ReversalRow[];
  nextCursor?: string | null;
};

function isoToDate(s: string | null) {
  if (!s) return null;
  try { return parseISO(s); } catch { return null; }
}

export function EstornosTab() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ReversalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (!reset && nextCursor) params.set("cursor", nextCursor);
      const res = await apiFetchJson<ReversalsResponse>(`/api/financial/records/reversals?${params.toString()}`);
      const incoming = res.data ?? [];
      setItems((prev) => (reset ? incoming : [...prev, ...incoming]));
      setNextCursor(res.nextCursor ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar histórico de estornos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((it) =>
      (it.description ?? "").toLowerCase().includes(q) ||
      (it.patientName ?? "").toLowerCase().includes(q) ||
      (it.reversalReason ?? "").toLowerCase().includes(q) ||
      (it.reversedByName ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const totals = useMemo(() => {
    const totalAmount = filtered.reduce((s, it) => s + Number(it.originalAmount ?? it.amount ?? 0), 0);
    return { count: filtered.length, totalAmount };
  }, [filtered]);

  function exportCsv() {
    const rows = [
      ["Data Estorno", "Tipo", "Descrição", "Paciente", "Procedimento", "Valor Original", "Status", "Motivo", "Autor"],
      ...filtered.map((it) => [
        isoToDate(it.reversedAt) ? format(isoToDate(it.reversedAt)!, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
        it.type,
        (it.description ?? "").replaceAll(";", ","),
        (it.patientName ?? "").replaceAll(";", ","),
        (it.procedureName ?? "").replaceAll(";", ","),
        Number(it.originalAmount ?? it.amount ?? 0).toFixed(2),
        it.status,
        (it.reversalReason ?? "").replaceAll(";", ",").replaceAll("\n", " "),
        (it.reversedByName ?? "").replaceAll(";", ","),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estornos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Header / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total de Estornos</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">{totals.count}</p>
            <p className="text-xs text-slate-400 mt-0.5">no período filtrado</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Valor Estornado</p>
            <p className="text-2xl font-bold text-amber-600 tabular-nums mt-1">{formatCurrency(totals.totalAmount)}</p>
            <p className="text-xs text-slate-400 mt-0.5">soma dos valores originais</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Auditoria</p>
              <p className="text-xs text-slate-500 mt-0.5">Cada estorno registra autor, motivo e valor original.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-700">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-slate-500">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-xl mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-xl mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-slate-500">Buscar</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Descrição, paciente, autor ou motivo…"
                className="h-9 rounded-xl pl-9"
              />
            </div>
          </div>
          <div className="sm:col-span-4 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setFrom(""); setTo(""); setSearch(""); }}>
              Limpar
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </Button>
            <Button size="sm" className="rounded-xl" onClick={() => load(true)} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl bg-white overflow-hidden">
        <CardHeader className="pb-2 px-5 pt-4">
          <CardTitle className="text-sm font-bold text-slate-700">Histórico de Estornos</CardTitle>
          <p className="text-xs text-slate-400">{filtered.length} registro(s){nextCursor ? " · há mais para carregar" : ""}</p>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4 text-sm text-red-600 bg-red-50 border-y border-red-100">{error}</div>
          )}
          {loading && items.length === 0 ? (
            <div className="p-8 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Nenhum estorno no período</p>
              <p className="text-xs text-slate-400 mt-1">Quando um lançamento for estornado, ele aparecerá aqui com motivo e autor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lançamento</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paciente</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Motivo</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Autor</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const reversedDate = isoToDate(it.reversedAt);
                    const original = Number(it.originalAmount ?? it.amount ?? 0);
                    return (
                      <tr key={it.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium tabular-nums">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {reversedDate ? format(reversedDate, "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 ml-4">#{it.id}</p>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <p className="text-sm font-semibold text-slate-800 max-w-[260px] truncate">{it.description}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {it.procedureName && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                                <FileText className="w-2.5 h-2.5" /> {it.procedureName}
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                              {it.status}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top text-sm text-slate-700">
                          {it.patientName ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-4 align-top text-sm text-slate-700 max-w-[320px]">
                          <p className="line-clamp-3 break-words">{it.reversalReason ?? <span className="text-slate-300">— sem motivo —</span>}</p>
                        </td>
                        <td className="py-3 px-4 align-top text-sm text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="w-3 h-3 text-slate-400" />
                            {it.reversedByName ?? <span className="text-slate-300">—</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                          <p className="text-sm font-bold text-amber-600 tabular-nums">
                            {formatCurrency(original)}
                          </p>
                          {Number(it.amount) !== original && (
                            <p className="text-[10px] text-slate-400 line-through tabular-nums">
                              {formatCurrency(Number(it.amount))}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {nextCursor && (
                <div className="p-3 flex justify-center border-t border-slate-100">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => load(false)} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                    Carregar mais
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
