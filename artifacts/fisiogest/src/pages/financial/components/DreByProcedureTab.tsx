/**
 * DreByProcedureTab — Sprint 3 T8 (Categorização contábil por procedimento).
 *
 * Mostra a receita reconhecida no período agrupada por procedimento, com
 * a sub-conta contábil em que cada receita foi creditada.
 *
 * Endpoint: GET /api/financial/accounting/dre-by-procedure?from&to
 * Gating:   feature `financial.view.accounting`
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { formatCurrency } from "../utils";

type DreRow = {
  procedureId: number | null;
  procedureName: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  totalRevenue: number;
  entries: number;
};

type DreResponse = {
  from: string;
  to: string;
  total: number;
  rows: DreRow[];
};

function defaultRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

export function DreByProcedureTab() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [data, setData] = useState<DreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await apiFetchJson<DreResponse>(
        `/api/financial/accounting/dre-by-procedure?${params}`,
      );
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar DRE por procedimento");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupa linhas por procedimento (um procedimento pode ter mais de uma sub-conta).
  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ procedureName: string; total: number; rows: DreRow[] }>;
    const map = new Map<string, { procedureName: string; total: number; rows: DreRow[] }>();
    for (const r of data.rows) {
      const key = `${r.procedureId ?? "none"}::${r.procedureName}`;
      const cur = map.get(key) ?? { procedureName: r.procedureName, total: 0, rows: [] };
      cur.total += Number(r.totalRevenue);
      cur.rows.push(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            DRE por Procedimento
          </CardTitle>
          <p className="text-xs text-slate-500">
            Receita reconhecida no período, agrupada por procedimento e sub-conta
            contábil. Procedimentos sem sub-conta caem na conta padrão (4.1.1 / 4.1.2).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <Label htmlFor="dre-from" className="text-xs">De</Label>
              <Input
                id="dre-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="dre-to" className="text-xs">Até</Label>
              <Input
                id="dre-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={load} disabled={loading} className="rounded-xl w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-2">Atualizar</span>
              </Button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
              {error}
            </div>
          )}

          {data && (
            <div className="text-sm text-slate-600 mb-3">
              Receita total no período:{" "}
              <span className="font-semibold text-slate-900">{formatCurrency(data.total)}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Nenhuma receita reconhecida no período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-2 pr-3">Procedimento</th>
                    <th className="py-2 pr-3">Conta contábil</th>
                    <th className="py-2 pr-3 text-right">Lançamentos</th>
                    <th className="py-2 pr-3 text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <>
                      <tr key={`g-${g.procedureName}`} className="bg-slate-50 border-b">
                        <td className="py-2 pr-3 font-semibold text-slate-800" colSpan={3}>
                          {g.procedureName}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-900">
                          {formatCurrency(g.total)}
                        </td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={`r-${g.procedureName}-${r.accountId}`} className="border-b">
                          <td className="py-2 pr-3 pl-4 text-slate-600">↳</td>
                          <td className="py-2 pr-3 text-slate-700">
                            <span className="font-mono text-xs text-slate-500">{r.accountCode}</span>{" "}
                            — {r.accountName}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-500">{r.entries}</td>
                          <td className="py-2 pr-3 text-right text-slate-700">
                            {formatCurrency(Number(r.totalRevenue))}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
