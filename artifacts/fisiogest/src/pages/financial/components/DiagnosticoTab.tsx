/**
 * DiagnosticoTab — Diagnóstico e reparo de receita não reconhecida.
 *
 * Lista agendamentos concluídos vinculados a faturas de plano mensal que
 * não possuem lançamento contábil de reconhecimento de receita, e permite
 * acionar o reconhecimento retroativamente com um clique.
 *
 * Endpoints:
 *  GET  /api/financial/accounting/repair-revenue  → diagnóstico
 *  POST /api/financial/accounting/repair-revenue  → reparo
 *
 * Gating: feature `financial.view.accounting`
 */
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, Stethoscope, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetchJson } from "@/lib/api";
import { authHeaders, formatCurrency } from "../utils";

type DiagItem = {
  appointmentId: number;
  appointmentDate: string;
  monthlyInvoiceId: number;
  patientName: string;
  invoiceAmount: number;
  recognizedAmount: number;
  invoiceStatus: string;
  transactionType: string;
  clinicId: number;
};

type DiagResponse = {
  count: number;
  appointments: DiagItem[];
};

type RepairResponse = {
  found: number;
  repaired: number;
  skipped: number;
  errors: Array<{ appointmentId: number; invoiceId: number; error: string }>;
};

type Phase = "idle" | "diagnosing" | "repairing" | "done";

function fmtDate(d: string) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

function invoiceStatusLabel(s: string) {
  const map: Record<string, string> = {
    pago: "Pago",
    pendente: "Pendente",
    vencido: "Vencido",
    cancelado: "Cancelado",
    estornado: "Estornado",
  };
  return map[s] ?? s;
}

function invoiceStatusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "pago") return "default";
  if (s === "pendente" || s === "vencido") return "secondary";
  return "outline";
}

export function DiagnosticoTab() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [diag, setDiag] = useState<DiagResponse | null>(null);
  const [repair, setRepair] = useState<RepairResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function diagnose() {
    setPhase("diagnosing");
    setError(null);
    setRepair(null);
    try {
      const data = await apiFetchJson<DiagResponse>(
        "/api/financial/accounting/repair-revenue",
      );
      setDiag(data);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao buscar diagnóstico");
    } finally {
      setPhase("idle");
    }
  }

  async function runRepair() {
    if (!diag || diag.count === 0) return;
    setPhase("repairing");
    setError(null);
    try {
      const res = await fetch("/api/financial/accounting/repair-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? `HTTP ${res.status}`);
      }
      const data: RepairResponse = await res.json();
      setRepair(data);
      setDiag(null);
      setPhase("done");
    } catch (err: any) {
      setError(err?.message ?? "Erro ao executar reparo");
      setPhase("idle");
    }
  }

  const isLoading = phase === "diagnosing" || phase === "repairing";

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-primary" />
            Diagnóstico de Receita
          </CardTitle>
          <p className="text-xs text-slate-500 leading-relaxed">
            Detecta agendamentos <strong>concluídos</strong> de planos mensais que não
            possuem lançamento contábil de reconhecimento de receita. O reparo aciona
            o reconhecimento retroativamente — operação idempotente e segura.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={diagnose}
              disabled={isLoading}
              variant="outline"
              className="rounded-xl"
            >
              {phase === "diagnosing"
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <RefreshCw className="w-4 h-4 mr-2" />}
              Diagnosticar
            </Button>

            {diag && diag.count > 0 && (
              <Button
                onClick={runRepair}
                disabled={isLoading}
                className="rounded-xl"
              >
                {phase === "repairing"
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : <Wrench className="w-4 h-4 mr-2" />}
                Reparar {diag.count} {diag.count === 1 ? "agendamento" : "agendamentos"}
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Repair result */}
          {phase === "done" && repair && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Reparo concluído
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3 text-center border border-emerald-100">
                  <div className="text-2xl font-bold text-emerald-700">{repair.repaired}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Reconhecidos</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-slate-100">
                  <div className="text-2xl font-bold text-slate-600">{repair.skipped}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Ignorados</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-red-100">
                  <div className="text-2xl font-bold text-red-600">{repair.errors.length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Erros</div>
                </div>
              </div>
              {repair.errors.length > 0 && (
                <div className="text-xs text-red-600 mt-2 space-y-1">
                  {repair.errors.map((e, i) => (
                    <div key={i} className="bg-white border border-red-100 rounded-lg px-3 py-1.5">
                      Agendamento #{e.appointmentId} (fatura #{e.invoiceId}): {e.error}
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPhase("idle"); setRepair(null); }}
                className="rounded-lg mt-1"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Novo diagnóstico
              </Button>
            </div>
          )}

          {/* Diagnostic result — empty */}
          {diag && diag.count === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Nenhuma pendência encontrada. Todos os agendamentos concluídos possuem receita reconhecida.
            </div>
          )}

          {/* Diagnostic result — list */}
          {diag && diag.count > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{diag.count}</strong>{" "}
                  {diag.count === 1
                    ? "agendamento sem reconhecimento de receita encontrado."
                    : "agendamentos sem reconhecimento de receita encontrados."}
                  {" "}Clique em <strong>Reparar</strong> para corrigir.
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b">
                      <th className="py-2 pr-3">Paciente</th>
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Fatura #</th>
                      <th className="py-2 pr-3">Status fatura</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                      <th className="py-2 pr-3 text-right">Reconhecido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diag.appointments.map((a) => (
                      <tr key={`${a.appointmentId}`} className="border-b hover:bg-slate-50">
                        <td className="py-2 pr-3 font-medium text-slate-800">{a.patientName}</td>
                        <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{fmtDate(a.appointmentDate)}</td>
                        <td className="py-2 pr-3 text-slate-500 font-mono text-xs">#{a.monthlyInvoiceId}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={invoiceStatusVariant(a.invoiceStatus)} className="text-xs">
                            {invoiceStatusLabel(a.invoiceStatus)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-700">{formatCurrency(a.invoiceAmount)}</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{formatCurrency(a.recognizedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Idle state */}
          {!diag && phase === "idle" && !repair && (
            <div className="py-8 text-center text-sm text-slate-400">
              Clique em <strong className="text-slate-600">Diagnosticar</strong> para verificar se há pendências.
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
