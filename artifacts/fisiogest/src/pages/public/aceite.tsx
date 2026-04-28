/**
 * Sprint 2 — Página pública de aceite de plano de tratamento.
 *
 * Acessada por link único: `/aceite/:token`. Sem autenticação. O paciente:
 *   1. visualiza o termo (objetivos, técnicas, frequência) e os valores;
 *   2. digita o nome completo como assinatura;
 *   3. marca "li e concordo";
 *   4. confirma o aceite — o backend congela preços, gera fatura inicial
 *      e/ou créditos e marca o token como consumido.
 *
 * Mobile-first: layout de cartão único com tipografia legível, suficiente
 * para uso em celular sem necessidade de instalar app.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { API_BASE } from "@/lib/api";
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

interface PublicPlanItem {
  id: number;
  kind: "recorrenteMensal" | "pacoteSessoes" | "avulso";
  procedureName: string;
  packageName: string | null;
  totalSessions: number | null;
  unitPrice: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  effectivePrice: string;
  estimatedTotal: string;
}

interface PublicPlanSnapshot {
  planId: number;
  patientName: string;
  status: string;
  acceptedAt: string | null;
  objectives: string | null;
  techniques: string | null;
  frequency: string | null;
  estimatedSessions: number | null;
  startDate: string | null;
  items: PublicPlanItem[];
  totalEstimatedRevenue: string;
  expiresAt: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: PublicPlanSnapshot }
  | { kind: "error"; status: number; message: string };

function formatBRL(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function kindLabel(kind: PublicPlanItem["kind"]): string {
  if (kind === "recorrenteMensal") return "Mensal recorrente";
  if (kind === "pacoteSessoes") return "Pacote de sessões";
  return "Por sessão";
}

export default function AceitePage() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const token = params?.token ?? "";
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/public/treatment-plans/by-token/${token}`, {
          credentials: "omit",
        });
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setState({
            kind: "error",
            status: res.status,
            message: body?.message ?? "Não foi possível carregar o plano.",
          });
          return;
        }
        setState({ kind: "ok", snapshot: body });
      } catch (err: any) {
        if (!alive) return;
        setState({
          kind: "error",
          status: 0,
          message: "Falha de rede. Tente novamente em instantes.",
        });
      }
    }
    if (token) void load();
    return () => {
      alive = false;
    };
  }, [token]);

  const snapshot = state.kind === "ok" ? state.snapshot : null;
  const totalMensal = useMemo(
    () =>
      snapshot
        ? snapshot.items
            .filter((i) => i.kind === "recorrenteMensal")
            .reduce((acc, i) => acc + Number(i.estimatedTotal), 0)
        : 0,
    [snapshot],
  );
  const totalAVista = useMemo(
    () =>
      snapshot
        ? snapshot.items
            .filter((i) => i.kind === "pacoteSessoes")
            .reduce((acc, i) => acc + Number(i.estimatedTotal), 0)
        : 0,
    [snapshot],
  );

  async function handleSubmit() {
    if (!signature.trim() || !agreed || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/public/treatment-plans/by-token/${token}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({ signature: signature.trim() }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body?.message ?? "Não foi possível registrar o aceite.");
        return;
      }
      setDone(true);
    } catch (err) {
      setSubmitError("Falha de rede. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <PublicShell>
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PublicShell>
    );
  }

  if (state.kind === "error") {
    return (
      <PublicShell>
        <div className="text-center space-y-4 py-10">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-800">Não foi possível abrir este link</h1>
          <p className="text-sm text-slate-600">{state.message}</p>
          <p className="text-xs text-slate-400">
            Entre em contato com a clínica para solicitar um novo link.
          </p>
        </div>
      </PublicShell>
    );
  }

  if (done) {
    return (
      <PublicShell>
        <div className="text-center space-y-4 py-10">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-semibold text-slate-800">Aceite registrado!</h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Recebemos sua confirmação. A clínica entrará em contato para combinar os
            próximos passos. Pode fechar esta página.
          </p>
        </div>
      </PublicShell>
    );
  }

  if (snapshot!.acceptedAt) {
    return (
      <PublicShell>
        <div className="text-center space-y-4 py-10">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-semibold text-slate-800">Plano já aceito</h1>
          <p className="text-sm text-slate-600">
            Este plano foi aceito em{" "}
            {new Date(snapshot!.acceptedAt!).toLocaleString("pt-BR")}.
          </p>
        </div>
      </PublicShell>
    );
  }

  const snap = snapshot!;
  return (
    <PublicShell>
      <div className="space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-primary font-semibold">
            Plano de tratamento
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">{snap.patientName}</h1>
          <p className="text-xs text-slate-400">
            Link válido até {new Date(snap.expiresAt).toLocaleDateString("pt-BR")}
          </p>
        </header>

        {snap.objectives && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-700">Objetivos</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">{snap.objectives}</p>
          </section>
        )}

        {(snap.frequency || snap.estimatedSessions || snap.startDate) && (
          <section className="grid grid-cols-2 gap-3 text-xs">
            {snap.frequency && (
              <Stat label="Frequência" value={snap.frequency} />
            )}
            {snap.estimatedSessions && (
              <Stat label="Sessões estimadas" value={String(snap.estimatedSessions)} />
            )}
            {snap.startDate && (
              <Stat
                label="Início previsto"
                value={new Date(snap.startDate + "T00:00:00").toLocaleDateString("pt-BR")}
              />
            )}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Itens do plano</h2>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {snap.items.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">Nenhum item.</p>
            )}
            {snap.items.map((item) => (
              <div key={item.id} className="p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {item.procedureName}
                    </p>
                    {item.packageName && (
                      <p className="text-xs text-slate-500 truncate">{item.packageName}</p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">
                      {kindLabel(item.kind)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.kind === "pacoteSessoes" && (
                      <>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatBRL(item.estimatedTotal)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.totalSessions}× {formatBRL(item.effectivePrice)}
                        </p>
                      </>
                    )}
                    {item.kind === "recorrenteMensal" && (
                      <>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatBRL(item.estimatedTotal)}
                          <span className="text-xs text-slate-400">/mês</span>
                        </p>
                      </>
                    )}
                    {item.kind === "avulso" && (
                      <p className="text-xs text-slate-500">Cobrança por sessão</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 space-y-1 text-sm">
            {totalAVista > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total à vista (pacotes):</span>
                <span className="font-semibold text-slate-800">{formatBRL(totalAVista)}</span>
              </div>
            )}
            {totalMensal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mensalidade recorrente:</span>
                <span className="font-semibold text-slate-800">
                  {formatBRL(totalMensal)}
                  <span className="text-xs text-slate-400">/mês</span>
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>
              Ao aceitar, você confirma a leitura do plano e autoriza a clínica a
              gerar as faturas iniciais correspondentes. Capturamos data, IP e
              dispositivo para a trilha de auditoria (LGPD).
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="sig">
              Nome completo (assinatura)
            </label>
            <input
              id="sig"
              className="w-full h-12 px-3 rounded-lg border border-slate-200 focus:border-primary outline-none text-base"
              placeholder="Ex.: Maria da Silva Souza"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              autoComplete="name"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              Li e concordo com os procedimentos, valores e condições deste plano de
              tratamento.
            </span>
          </label>
          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {submitError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!signature.trim() || !agreed || submitting}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Aceitar plano
          </button>
        </section>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:py-12">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}
