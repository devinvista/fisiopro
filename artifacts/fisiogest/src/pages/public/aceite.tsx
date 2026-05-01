/**
 * Página pública `/aceite/:token` — exibe o **contrato completo** do plano de
 * tratamento que o paciente está prestes a assinar (ou que já assinou).
 *
 * Princípio (unificado): o termo de aceite e o contrato são o **mesmo**
 * documento. Antes do aceite, a linha de assinatura do paciente fica em
 * branco e os campos de assinatura digital ficam visíveis abaixo do contrato.
 * Após o aceite, o mesmo contrato passa a renderizar a trilha LGPD imutável
 * (nome digitado, data, IP, dispositivo, via) no lugar da linha de assinatura,
 * e os campos de assinatura desaparecem.
 *
 * Sem auth — a posse do token é a credencial.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { API_BASE } from "@/lib/api";
import {
  Loader2, CheckCircle2, AlertCircle, ShieldCheck, Printer, ShieldAlert,
  CalendarDays, Clock, User as UserIcon,
} from "lucide-react";
import {
  generateContractHTML,
  CONTRACT_PRINT_CSS,
  printDocument,
} from "@/pages/clinical/patients/patient-detail/utils/print-html";
import type {
  PatientBasic,
  ClinicInfo,
  PlanProcedureItem,
} from "@/pages/clinical/patients/patient-detail/types";

interface PublicPlanItem {
  id: number;
  kind: "recorrenteMensal" | "pacoteSessoes" | "avulso";
  procedureName: string;
  packageName: string | null;
  packageType: string | null;
  totalSessions: number | null;
  sessionsPerWeek: number;
  unitPrice: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  effectivePrice: string;
  estimatedTotal: string;
}

interface PublicPlanPatient {
  name: string;
  cpf: string | null;
  phone: string | null;
  birthDate: string | null;
}

interface PublicPlanClinic {
  name: string;
  type: string | null;
  cnpj: string | null;
  cpf: string | null;
  crefito: string | null;
  responsibleTechnical: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  logoUrl: string | null;
  cancellationPolicyHours: number | null;
  noShowFeeEnabled: boolean;
  noShowFeeAmount: string | null;
}

interface PublicPlanAcceptance {
  acceptedAt: string;
  acceptedBySignature: string | null;
  acceptedIp: string | null;
  acceptedDevice: string | null;
  acceptedVia: string;
}

interface PublicContractClause {
  id: number;
  code: string;
  title: string;
  body: string;
  version: number;
  isRequired: boolean;
  sortOrder: number;
}

interface PublicAcceptedClause {
  code: string;
  title: string;
  body: string;
  version: number;
}

interface PublicAppointmentPreview {
  date: string;
  startTime: string;
  endTime: string;
  procedureName: string;
  professionalName: string | null;
  monthRef: string;
  itemId: number;
  itemKind: "recorrenteMensal" | "pacoteSessoes" | "avulso";
}

interface PublicPlanSnapshot {
  planId: number;
  patient: PublicPlanPatient;
  patientName: string;
  status: string;
  acceptedAt: string | null;
  acceptance: PublicPlanAcceptance | null;
  objectives: string | null;
  techniques: string | null;
  frequency: string | null;
  estimatedSessions: number | null;
  startDate: string | null;
  durationMonths: number | null;
  responsibleProfessional: string | null;
  items: PublicPlanItem[];
  totalEstimatedRevenue: string;
  expiresAt: string;
  clinic: PublicPlanClinic | null;
  contractClauses: PublicContractClause[];
  acceptedClauses: PublicAcceptedClause[];
  // Sprint 15 — agenda real exibida antes do aceite atômico.
  appointmentsPreview?: PublicAppointmentPreview[];
  itemsWithoutSchedule?: number[];
}

const MONTH_LABELS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
function formatMonthRef(monthRef: string): string {
  const [y, m] = monthRef.split("-").map(Number);
  if (!y || !m) return monthRef;
  return `${MONTH_LABELS_PT[m - 1] ?? ""} de ${y}`;
}
function formatDateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  });
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; snapshot: PublicPlanSnapshot }
  | { kind: "error"; status: number; message: string };

/**
 * Adapta o snapshot público para os tipos que `generateContractHTML` espera.
 * `PlanProcedureItem` foi pensado para o contexto interno (com `packageId`,
 * `procedureId`, etc.), mas só `packageType`, `totalSessions`,
 * `sessionsPerWeek`, `price`, `monthlyPrice` e `discount` são lidos pelo
 * gerador. Os demais campos viram `null`/`undefined`.
 */
function snapshotToContractInputs(snap: PublicPlanSnapshot): {
  patient: PatientBasic;
  plan: {
    objectives?: string;
    techniques?: string;
    frequency?: string;
    estimatedSessions?: string | number;
    status?: string;
    startDate?: string;
    responsibleProfessional?: string;
  };
  items: PlanProcedureItem[];
  clinic: ClinicInfo | null;
} {
  return {
    patient: {
      name: snap.patient.name,
      cpf: snap.patient.cpf,
      phone: snap.patient.phone,
      birthDate: snap.patient.birthDate,
    },
    plan: {
      objectives: snap.objectives ?? undefined,
      techniques: snap.techniques ?? undefined,
      frequency: snap.frequency ?? undefined,
      estimatedSessions: snap.estimatedSessions ?? undefined,
      status: snap.status,
      startDate: snap.startDate ?? undefined,
      durationMonths: snap.durationMonths ?? undefined,
      responsibleProfessional: snap.responsibleProfessional ?? undefined,
    },
    items: snap.items.map<PlanProcedureItem>((it) => ({
      id: it.id,
      planId: snap.planId,
      packageId: it.kind === "avulso" ? null : 1, // sentinel — gerador só checa truthy
      procedureId: null,
      sessionsPerWeek: it.sessionsPerWeek,
      totalSessions: it.totalSessions,
      packageName: it.packageName,
      procedureName: it.procedureName,
      packageType: it.packageType,
      monthlyPrice: it.unitMonthlyPrice,
      unitMonthlyPrice: it.unitMonthlyPrice,
      price: it.unitPrice,
      unitPrice: it.unitPrice,
      discount: it.discount,
    })),
    clinic: snap.clinic
      ? {
          name: snap.clinic.name,
          type: snap.clinic.type,
          cnpj: snap.clinic.cnpj,
          cpf: snap.clinic.cpf,
          crefito: snap.clinic.crefito,
          responsibleTechnical: snap.clinic.responsibleTechnical,
          phone: snap.clinic.phone,
          email: snap.clinic.email,
          address: snap.clinic.address,
          website: snap.clinic.website,
          logoUrl: snap.clinic.logoUrl,
          cancellationPolicyHours: snap.clinic.cancellationPolicyHours,
          noShowFeeEnabled: snap.clinic.noShowFeeEnabled,
          noShowFeeAmount: snap.clinic.noShowFeeAmount,
        }
      : null,
  };
}

export default function AceitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptedClauseCodes, setAcceptedClauseCodes] = useState<Set<string>>(new Set());

  function toggleClause(code: string) {
    setAcceptedClauseCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function loadSnapshot() {
    try {
      const res = await fetch(`${API_BASE}/api/public/treatment-plans/by-token/${token}`, {
        credentials: "omit",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          kind: "error",
          status: res.status,
          message: body?.message ?? "Não foi possível carregar o plano.",
        });
        return;
      }
      setState({ kind: "ok", snapshot: body });
    } catch {
      setState({
        kind: "error",
        status: 0,
        message: "Falha de rede. Tente novamente em instantes.",
      });
    }
  }

  useEffect(() => {
    if (!token) return;
    void loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const snapshot = state.kind === "ok" ? state.snapshot : null;

  const contractHtml = useMemo(() => {
    if (!snapshot) return "";
    const { patient, plan, items, clinic } = snapshotToContractInputs(snapshot);
    // Bug 3 fix: pass custom clauses into the contract HTML so they appear in
    // the printed body. Use frozen accepted clauses when already signed, otherwise
    // use the current active clauses from the clinic.
    const clauses = snapshot.acceptance
      ? (snapshot.acceptedClauses ?? [])
      : (snapshot.contractClauses ?? []);
    return generateContractHTML(patient, plan, items, clinic, snapshot.acceptance, clauses);
  }, [snapshot]);

  const requiredClauseCodes = useMemo(
    () => (snapshot?.contractClauses ?? []).filter((c) => c.isRequired).map((c) => c.code),
    [snapshot],
  );
  const allRequiredAccepted = requiredClauseCodes.every((c) => acceptedClauseCodes.has(c));

  // Sprint 15 — aceite atômico: requer agenda preview não-vazia para liberar
  // o botão. A clínica precisa configurar dias/horários antes do paciente assinar.
  const previewAppointments = snapshot?.appointmentsPreview ?? [];
  const needsSchedule = previewAppointments.length === 0;

  // Agrupa o preview por mês (YYYY-MM-01) preservando a ordem do backend.
  const previewByMonth = useMemo(() => {
    const groups = new Map<string, PublicAppointmentPreview[]>();
    for (const a of previewAppointments) {
      const arr = groups.get(a.monthRef) ?? [];
      arr.push(a);
      groups.set(a.monthRef, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [previewAppointments]);

  async function handleSubmit() {
    if (!signature.trim() || !agreed || !allRequiredAccepted || submitting) return;
    if (needsSchedule) return; // proteção extra além do disabled do botão.
    setSubmitting(true);
    setSubmitError(null);
    // Aceite atômico: assina + materializa numa única transação.
    try {
      const res = await fetch(
        `${API_BASE}/api/public/treatment-plans/by-token/${token}/accept-and-materialize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({
            signature: signature.trim(),
            acceptedClauseCodes: Array.from(acceptedClauseCodes),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body?.message ?? "Não foi possível registrar o aceite.");
        return;
      }
      // Recarrega o snapshot — agora com a trilha de aceite preenchida —
      // para que o contrato seja re-renderizado com a assinatura digital.
      await loadSnapshot();
    } catch {
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
          <h1 className="text-xl font-semibold text-slate-800">
            Não foi possível abrir este link
          </h1>
          <p className="text-sm text-slate-600">{state.message}</p>
          <p className="text-xs text-slate-400">
            Entre em contato com a clínica para solicitar um novo link.
          </p>
        </div>
      </PublicShell>
    );
  }

  const snap = snapshot!;
  const isAccepted = !!snap.acceptance;

  return (
    <PublicShell wide>
      {/* Estilos do contrato escopados em .doc-root para isolar do app */}
      <style dangerouslySetInnerHTML={{ __html: CONTRACT_PRINT_CSS }} />

      {/* Cabeçalho de status */}
      {isAccepted ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-800">Contrato assinado</p>
            <p className="text-emerald-700 mt-0.5">
              Assinado em{" "}
              {new Date(snap.acceptance!.acceptedAt).toLocaleString("pt-BR")} —{" "}
              {labelVia(snap.acceptance!.acceptedVia)}. A trilha de aceite (nome,
              data, IP e dispositivo) está registrada no rodapé do contrato
              abaixo.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Aguardando sua assinatura</p>
            <p className="text-amber-700 mt-0.5">
              Leia o contrato abaixo. Para aceitar, digite seu nome completo no
              campo de assinatura ao final e confirme. Capturamos data, IP e
              dispositivo para a trilha de auditoria (LGPD).
            </p>
          </div>
        </div>
      )}

      {/* Botão de impressão (sempre disponível) */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            const { patient, plan, items, clinic } = snapshotToContractInputs(snap);
            const printClauses = snap.acceptance
              ? (snap.acceptedClauses ?? [])
              : (snap.contractClauses ?? []);
            const html = generateContractHTML(patient, plan, items, clinic, snap.acceptance, printClauses);
            printDocument(html, `Contrato — ${snap.patient.name}`);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir / Salvar PDF
        </button>
      </div>

      {/* Contrato (mesmo HTML usado na impressão) */}
      <div
        className="doc-root rounded-lg border border-slate-200 p-5 sm:p-8 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: contractHtml }}
      />

      {/* Snapshot imutável de cláusulas aceitas (após assinatura) */}
      {isAccepted && snap.acceptedClauses.length > 0 && (
        <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="text-base font-semibold text-emerald-900 mb-3">
            Cláusulas aceitas no momento da assinatura
          </h2>
          <ul className="space-y-3">
            {snap.acceptedClauses.map((c) => (
              <li key={c.code} className="rounded-lg bg-white p-3 border border-emerald-100">
                <p className="text-sm font-medium text-slate-800">
                  {c.title}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                    v{c.version}
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sprint 15 — Sua agenda (preview real das consultas).
          Renderizado antes da assinatura para o paciente conferir. */}
      {!isAccepted && (
        <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-semibold text-blue-900">
              Sua agenda
            </h2>
          </div>
          {previewAppointments.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 leading-relaxed">
                <p className="font-semibold">Aguardando configuração de agenda pela clínica.</p>
                <p className="mt-1">
                  A clínica ainda não definiu os dias e horários das suas
                  consultas. Entre em contato para combinar os horários — assim
                  que estiver pronto, este link mostrará a agenda completa e
                  você poderá assinar.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-blue-800/80 mb-3 leading-relaxed">
                Estas são as consultas que serão criadas automaticamente na
                sua agenda assim que você assinar o contrato. Total:{" "}
                <strong>{previewAppointments.length} consulta{previewAppointments.length === 1 ? "" : "s"}</strong>
                {" "}em <strong>{previewByMonth.length} mês{previewByMonth.length === 1 ? "" : "es"}</strong>.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {previewByMonth.map(([monthRef, list]) => (
                  <details
                    key={monthRef}
                    open={previewByMonth.length <= 2}
                    className="rounded-lg bg-white border border-blue-100"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between text-sm font-medium text-slate-800">
                      <span className="capitalize">{formatMonthRef(monthRef)}</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        {list.length} consulta{list.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <ul className="px-3 pb-3 pt-1 space-y-1.5">
                      {list.map((a, i) => (
                        <li
                          key={`${a.date}-${a.startTime}-${a.itemId}-${i}`}
                          className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 gap-y-0.5 text-xs text-slate-700 border-l-2 border-blue-200 pl-2.5"
                        >
                          <span className="font-medium text-slate-800 capitalize">
                            {formatDateLong(a.date)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-600 font-mono">
                            <Clock className="w-3 h-3" />
                            {a.startTime}–{a.endTime}
                          </span>
                          <span className="text-slate-700 col-span-3 sm:col-span-1">
                            {a.procedureName}
                            {a.professionalName && (
                              <span className="ml-1.5 inline-flex items-center gap-1 text-slate-500">
                                <UserIcon className="w-3 h-3" />
                                {a.professionalName}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
              <p className="text-[11px] text-blue-700/80 mt-3 pt-2 border-t border-blue-100">
                Caso algum horário não funcione para você, entre em contato com
                a clínica antes de assinar.
              </p>
            </>
          )}
        </section>
      )}

      {/* Painel de assinatura — só aparece se ainda não assinado */}
      {!isAccepted && (
        <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-800">
              Assinatura digital
            </h2>
            <p className="text-xs text-slate-600">
              Ao confirmar, você declara ter lido o contrato acima e concordar
              com todas as cláusulas, valores e procedimentos. A clínica emitirá
              as faturas iniciais correspondentes.
            </p>
          </div>

          {snap.contractClauses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">
                Cláusulas contratuais
              </h3>
              <ul className="space-y-2">
                {snap.contractClauses.map((c) => {
                  const checked = acceptedClauseCodes.has(c.code);
                  return (
                    <li
                      key={c.id}
                      className={`rounded-lg p-3 border ${
                        checked
                          ? "border-emerald-200 bg-white"
                          : c.isRequired
                            ? "border-amber-200 bg-amber-50/40"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4"
                          checked={checked}
                          onChange={() => toggleClause(c.code)}
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                            {c.title}
                            {c.isRequired && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-normal">
                                <ShieldAlert className="w-3 h-3" /> obrigatória
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-600 leading-relaxed">
                            {c.body}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!allRequiredAccepted && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Marque todas as cláusulas obrigatórias para concluir o aceite.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="sig">
              Nome completo (assinatura)
            </label>
            <input
              id="sig"
              className="w-full h-12 px-3 rounded-lg border border-slate-300 focus:border-primary outline-none text-base bg-white"
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
              Li e concordo com os procedimentos, valores e condições deste
              contrato de prestação de serviços.
            </span>
          </label>
          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {submitError}
            </p>
          )}
          {needsSchedule && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              A clínica precisa configurar a agenda das suas consultas antes
              que você possa assinar.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !signature.trim() ||
              !agreed ||
              !allRequiredAccepted ||
              submitting ||
              needsSchedule
            }
            title={needsSchedule ? "Aguardando configuração de agenda pela clínica" : undefined}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Assinar e iniciar plano
          </button>
          {snap.expiresAt && (
            <p className="text-[11px] text-slate-400 text-center">
              Link válido até{" "}
              {new Date(snap.expiresAt).toLocaleDateString("pt-BR")}
            </p>
          )}
        </section>
      )}
    </PublicShell>
  );
}

function labelVia(via: string): string {
  if (via === "link") return "assinatura digital (link público)";
  if (via === "presencial") return "assinatura presencial";
  if (via === "legado") return "registro legado";
  return via;
}

function PublicShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:py-12">
      <div
        className={`${wide ? "max-w-4xl" : "max-w-xl"} mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8`}
      >
        {children}
      </div>
    </div>
  );
}
