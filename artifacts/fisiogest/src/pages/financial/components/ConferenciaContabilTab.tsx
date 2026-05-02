/**
 * ConferenciaContabilTab — Painel de conferência contábil por fatura mensal.
 *
 * Lista todas as faturas de plano mensal (faturaPlano e faturaPlanoAvulsoMensal)
 * do mês/ano selecionado, mostrando o status de reconhecimento de receita e,
 * ao expandir, as fragmentas individuais por sessão com:
 *  - Data de competência (data da sessão)
 *  - Valor proporcional (amount / N sessões)
 *  - Status da sessão (concluída, falta, pendente, cancelada)
 *  - Crédito de reposição gerado (se houver)
 *
 * Gating: feature `financial.view.accounting`
 */
import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Loader2, RefreshCw, Search, XCircle, AlertCircle,
  ArrowRightLeft, Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetchJson } from "@/lib/api";
import { formatCurrency } from "../utils";
import { MONTH_NAMES } from "../constants";

// ─── Types ──────────────────────────────────────────────────────────────────

type PlanInvoice = {
  id: number;
  amount: number;
  recognizedAmount: number;
  recognitionCreditsTotal: number | null;
  recognitionCreditsConsumed: number;
  invoiceStatus: string;
  transactionType: string;
  description: string | null;
  dueDate: string | null;
  planMonthRef: string | null;
  patientName: string;
  patientId: number;
  appointmentCount: number;
  entryCount: number;
};

type InvoiceFragment = {
  appointmentId: number;
  appointmentDate: string;
  appointmentStatus: string;
  entryId: number | null;
  entryDate: string | null;
  entryAmount: number | null;
  entryEventType: string | null;
  entryStatus: string | null;
  creditId: number | null;
  creditOrigin: string | null;
  creditStatus: string | null;
  creditQuantity: number | null;
  creditUsedQuantity: number | null;
};

type FragmentsResponse = {
  invoice: {
    id: number;
    amount: number;
    recognizedAmount: number;
    recognitionCreditsTotal: number | null;
    recognitionCreditsConsumed: number;
    invoiceStatus: string;
    transactionType: string;
    patientName: string;
    dueDate: string | null;
    planMonthRef: string | null;
  };
  fragments: InvoiceFragment[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

function fmtMonth(d: string | null | undefined) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m] = s.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[Number(m) - 1] ?? m}/${y}`;
}

type ApptStatus = "concluido" | "compareceu" | "falta" | "remarcado" | "cancelado" | "confirmado" | "pendente" | string;

function apptStatusLabel(s: ApptStatus) {
  const map: Record<string, string> = {
    concluido:  "Concluído",
    compareceu: "Compareceu",
    falta:      "Falta",
    remarcado:  "Remarcado",
    cancelado:  "Cancelado",
    confirmado: "Confirmado",
    pendente:   "Pendente",
  };
  return map[s] ?? s;
}

function ApptStatusIcon({ status }: { status: ApptStatus }) {
  if (status === "concluido" || status === "compareceu")
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (status === "falta")
    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (status === "cancelado")
    return <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  if (status === "remarcado")
    return <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />;
}

function CreditBadge({ origin, status, qty, used }: { origin: string | null; status: string | null; qty: number | null; used: number | null }) {
  if (!origin) return <span className="text-slate-300 text-xs">—</span>;
  const label = origin === "reposicaoFalta" ? "Falta" : "Remarcação";
  const isUsed = status === "consumido" || (used ?? 0) >= (qty ?? 1);
  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 ${isUsed ? "text-slate-400 border-slate-200" : "text-amber-600 border-amber-300 bg-amber-50"}`}
    >
      <Gift className="w-3 h-3" />
      {label} {isUsed ? "(usado)" : "(disponível)"}
    </Badge>
  );
}

function recognitionStatusInfo(invoice: PlanInvoice): {
  color: string;
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
} {
  const recognized = invoice.recognizedAmount;
  const total = invoice.amount;
  const pct = total > 0 ? recognized / total : 0;

  if (invoice.entryCount === 0)
    return { color: "text-amber-600", label: "Não reconhecida", variant: "outline" };
  if (pct >= 0.999)
    return { color: "text-emerald-600", label: "100% reconhecida", variant: "default" };
  return { color: "text-blue-600", label: `${Math.round(pct * 100)}% reconhecida`, variant: "secondary" };
}

// ─── Invoice Row (expandable) ─────────────────────────────────────────────────

function InvoiceRow({ invoice }: { invoice: PlanInvoice }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FragmentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadFragments() {
    if (data) { setExpanded(e => !e); return; }
    setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchJson<FragmentsResponse>(
        `/api/financial/accounting/invoice-fragments/${invoice.id}`,
      );
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar fragmentas");
    } finally {
      setLoading(false);
    }
  }

  const status = recognitionStatusInfo(invoice);
  const ref = invoice.planMonthRef ?? invoice.dueDate;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={loadFragments}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">{invoice.patientName}</span>
            <span className="text-xs text-slate-400 font-mono">#{invoice.id}</span>
            {ref && (
              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                {fmtMonth(ref)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-xs text-slate-500">
              {formatCurrency(invoice.amount)} · {invoice.appointmentCount} sessão(ões)
            </span>
            <Badge variant={status.variant} className="text-xs">
              {status.label}
            </Badge>
            {invoice.entryCount > 0 && (
              <span className="text-xs text-slate-400">
                {invoice.entryCount} fragmenta(s) contábil(is)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold ${status.color}`}>
            {formatCurrency(invoice.recognizedAmount)}
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />
          }
        </div>
      </button>

      {/* Expanded fragments */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando fragmentas...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {data && (
            <FragmentsTable data={data} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fragments Detail Table ───────────────────────────────────────────────────

function FragmentsTable({ data }: { data: FragmentsResponse }) {
  const { invoice, fragments } = data;
  const total = invoice.amount;
  const recognized = invoice.recognizedAmount;
  const n = fragments.length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <span className="text-slate-400">Total fatura</span>
          <span className="font-bold text-slate-800">{formatCurrency(total)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <span className="text-slate-400">Reconhecido</span>
          <span className={`font-bold ${recognized >= total * 0.999 ? "text-emerald-700" : "text-amber-600"}`}>
            {formatCurrency(recognized)}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <span className="text-slate-400">Sessões</span>
          <span className="font-bold text-slate-800">{n}</span>
        </div>
        {n > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <span className="text-slate-400">Valor/sessão</span>
            <span className="font-bold text-slate-800">{formatCurrency(total / n)}</span>
          </div>
        )}
      </div>

      {/* Recognition progress bar */}
      {total > 0 && (
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, (recognized / total) * 100)}%` }}
          />
        </div>
      )}

      {/* Fragments table */}
      {fragments.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-4">
          Nenhuma sessão encontrada para esta fatura.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Data da Sessão</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Competência Contábil</th>
                <th className="py-2.5 px-3 text-right">Valor</th>
                <th className="py-2.5 px-3">Fragmenta</th>
                <th className="py-2.5 px-3">Crédito de Reposição</th>
              </tr>
            </thead>
            <tbody>
              {fragments.map((f, i) => (
                <tr
                  key={f.appointmentId}
                  className={`border-b border-slate-50 last:border-0 ${
                    f.appointmentStatus === "falta" ? "bg-red-50/30" :
                    f.appointmentStatus === "remarcado" ? "bg-amber-50/30" :
                    (f.appointmentStatus === "concluido" || f.appointmentStatus === "compareceu") ? "bg-emerald-50/20" : ""
                  }`}
                >
                  <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">
                    {i + 1}/{n}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 font-medium">
                    {fmtDate(f.appointmentDate)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <ApptStatusIcon status={f.appointmentStatus} />
                      <span className="text-xs text-slate-600">
                        {apptStatusLabel(f.appointmentStatus)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {f.entryDate ? (
                      <span className="text-xs text-slate-600">{fmtDate(f.entryDate)}</span>
                    ) : (
                      <span className="text-xs text-slate-300 italic">sem lançamento</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {f.entryAmount != null ? (
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(f.entryAmount)}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {f.entryId ? (
                      <div className="flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-slate-500 font-mono">#{f.entryId}</span>
                        <span className={`text-xs ${
                          f.entryEventType === "wallet_usage_revenue" ? "text-blue-500" : "text-purple-500"
                        }`}>
                          {f.entryEventType === "wallet_usage_revenue" ? "Adiant." : "Recebível"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>pendente</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <CreditBadge
                      origin={f.creditOrigin}
                      status={f.creditStatus}
                      qty={f.creditQuantity}
                      used={f.creditUsedQuantity}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export function ConferenciaContabilTab({ month, year }: { month: number; year: number }) {
  const [invoices, setInvoices] = useState<PlanInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ invoices: PlanInvoice[] }>(
        `/api/financial/accounting/plan-invoices?month=${month}&year=${year}`,
      );
      setInvoices(data.invoices ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar faturas");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? invoices.filter(inv =>
        inv.patientName.toLowerCase().includes(search.toLowerCase()) ||
        String(inv.id).includes(search.trim()),
      )
    : invoices;

  const totalRecognized = invoices.reduce((s, inv) => s + inv.recognizedAmount, 0);
  const totalAmount = invoices.reduce((s, inv) => s + inv.amount, 0);
  const fullyRecognized = invoices.filter(inv => inv.recognizedAmount >= inv.amount * 0.999).length;
  const pending = invoices.filter(inv => inv.entryCount === 0).length;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Conferência Contábil — {MONTH_NAMES[month - 1]} {year}
          </CardTitle>
          <p className="text-xs text-slate-500 leading-relaxed">
            Confira as fragmentas de receita de cada fatura mensal de plano.
            A 1ª sessão confirmada dispara o reconhecimento proporcional para todas as sessões do mês —
            cada uma com sua própria data de competência.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KPI strip */}
          {!loading && invoices.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <div className="text-lg font-bold text-slate-800">{invoices.length}</div>
                <div className="text-xs text-slate-500 mt-0.5">Faturas</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <div className="text-lg font-bold text-emerald-700">{fullyRecognized}</div>
                <div className="text-xs text-slate-500 mt-0.5">100% reconhecidas</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                <div className="text-lg font-bold text-amber-600">{pending}</div>
                <div className="text-xs text-slate-500 mt-0.5">Sem lançamento</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                <div className="text-sm font-bold text-blue-700">{formatCurrency(totalRecognized)}</div>
                <div className="text-xs text-slate-500 mt-0.5">de {formatCurrency(totalAmount)}</div>
              </div>
            </div>
          )}

          {/* Search + reload */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Buscar paciente ou # fatura…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 rounded-xl text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="rounded-xl h-9 shrink-0"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando faturas de {MONTH_NAMES[month - 1]}…
            </div>
          )}

          {/* Empty */}
          {!loading && !error && invoices.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">
              Nenhuma fatura de plano mensal encontrada para {MONTH_NAMES[month - 1]} {year}.
            </div>
          )}

          {/* Invoice list */}
          {!loading && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map(inv => (
                <InvoiceRow key={inv.id} invoice={inv} />
              ))}
            </div>
          )}

          {!loading && invoices.length > 0 && filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">
              Nenhuma fatura corresponde à busca.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
