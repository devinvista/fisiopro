/**
 * Sprint 2 — Tokens públicos de aceite de plano de tratamento.
 *
 * Permite gerar uma URL única (válida por 7 dias) que o paciente abre num
 * navegador externo (sem login) para revisar e aceitar o plano. O token é
 * consumido na primeira aceitação bem-sucedida.
 *
 * Política:
 *   - Cada plano admite no máximo 1 token ATIVO (não usado e não expirado).
 *     Chamar `generatePublicAcceptanceLink` em sequência reaproveita o token
 *     vigente — o profissional pode reenviar a URL sem multiplicar registros.
 *   - Após aceite, o token é "queimado" (`used_at = now()`).
 *   - Após `expires_at`, o token é tratado como expirado.
 */
import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  treatmentPlanAcceptanceTokensTable,
  treatmentPlansTable,
  patientsTable,
  proceduresTable,
  packagesTable,
  treatmentPlanProceduresTable,
  clinicsTable,
  clinicContractClausesTable,
} from "@workspace/db";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { resolveItemKind } from "./treatment-plans.acceptance.js";
import { enumeratePlanAppointments, type AppointmentPreviewRow } from "./treatment-plans.preview.js";

const TOKEN_TTL_DAYS = 7;

export interface PublicLinkResult {
  token: string;
  url: string;
  expiresAt: string;
  reused: boolean;
}

/**
 * Cria (ou reaproveita) um token de aceite público para o plano informado.
 * Validações de domínio (plano existir, pertencer ao paciente, status válido,
 * ainda não aceito) são feitas aqui — falhas viram exceção HTTP via callsite.
 */
export async function generatePublicAcceptanceLink(opts: {
  planId: number;
  patientId: number;
  createdBy: number | null;
  baseUrl: string;
}): Promise<PublicLinkResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(
      and(
        eq(treatmentPlansTable.id, opts.planId),
        eq(treatmentPlansTable.patientId, opts.patientId),
      ),
    )
    .limit(1);
  if (!plan) {
    const err = new Error("Plano de tratamento não encontrado");
    (err as any).status = 404;
    throw err;
  }
  if (plan.acceptedAt) {
    const err = new Error("Plano já foi aceito — não é possível gerar link de aceite.");
    (err as any).status = 409;
    throw err;
  }

  // Reuso: existe token ainda ativo?
  const now = new Date();
  const [active] = await db
    .select()
    .from(treatmentPlanAcceptanceTokensTable)
    .where(
      and(
        eq(treatmentPlanAcceptanceTokensTable.planId, opts.planId),
        isNull(treatmentPlanAcceptanceTokensTable.usedAt),
        gt(treatmentPlanAcceptanceTokensTable.expiresAt, now),
      ),
    )
    .orderBy(desc(treatmentPlanAcceptanceTokensTable.createdAt))
    .limit(1);

  if (active) {
    return {
      token: active.token,
      url: buildAcceptanceUrl(opts.baseUrl, active.token),
      expiresAt: active.expiresAt.toISOString(),
      reused: true,
    };
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(treatmentPlanAcceptanceTokensTable).values({
    planId: opts.planId,
    token,
    expiresAt,
    createdBy: opts.createdBy,
  });

  return {
    token,
    url: buildAcceptanceUrl(opts.baseUrl, token),
    expiresAt: expiresAt.toISOString(),
    reused: false,
  };
}

function buildAcceptanceUrl(baseUrl: string, token: string): string {
  const trimmed = (baseUrl || "").replace(/\/+$/, "");
  return `${trimmed}/aceite/${token}`;
}

export type AcceptanceTokenStatus = "valid" | "expired" | "used" | "not_found";

export interface AcceptanceTokenLookup {
  status: AcceptanceTokenStatus;
  tokenRow?: typeof treatmentPlanAcceptanceTokensTable.$inferSelect;
}

export async function lookupAcceptanceToken(token: string): Promise<AcceptanceTokenLookup> {
  if (!token || token.length < 16) return { status: "not_found" };
  const [row] = await db
    .select()
    .from(treatmentPlanAcceptanceTokensTable)
    .where(eq(treatmentPlanAcceptanceTokensTable.token, token))
    .limit(1);
  if (!row) return { status: "not_found" };
  if (row.usedAt) return { status: "used", tokenRow: row };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired", tokenRow: row };
  return { status: "valid", tokenRow: row };
}

export interface PublicPlanSnapshotItem {
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

export interface PublicPlanSnapshotPatient {
  name: string;
  cpf: string | null;
  phone: string | null;
  birthDate: string | null;
}

export interface PublicPlanSnapshotClinic {
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

export interface PublicPlanSnapshotAcceptance {
  acceptedAt: string;
  acceptedBySignature: string | null;
  acceptedIp: string | null;
  acceptedDevice: string | null;
  acceptedVia: string;
}

/**
 * Sprint Financeiro 11 (P5) — cláusulas contratuais vigentes da clínica
 * (subset suficiente para que o paciente possa marcar/ler antes de assinar).
 */
export interface PublicPlanSnapshotClause {
  id: number;
  code: string;
  version: number;
  title: string;
  body: string;
  isRequired: boolean;
  sortOrder: number;
}

/**
 * Sprint 15 (F4) — preview da agenda (consultas que serão criadas pela
 * materialização). Vazio quando a clínica ainda não configurou agenda nos
 * itens; a UI usa isso para exibir aviso e bloquear o aceite.
 */
export interface PublicPlanAppointmentPreview {
  date: string;
  startTime: string;
  endTime: string;
  procedureName: string;
  professionalName: string | null;
  monthRef: string;
  itemId: number;
  itemKind: "recorrenteMensal" | "pacoteSessoes" | "avulso";
}

export interface PublicPlanSnapshot {
  planId: number;
  patient: PublicPlanSnapshotPatient;
  patientName: string;
  status: string;
  acceptedAt: string | null;
  acceptance: PublicPlanSnapshotAcceptance | null;
  objectives: string | null;
  techniques: string | null;
  frequency: string | null;
  estimatedSessions: number | null;
  startDate: string | null;
  responsibleProfessional: string | null;
  items: PublicPlanSnapshotItem[];
  totalEstimatedRevenue: string;
  expiresAt: string;
  clinic: PublicPlanSnapshotClinic | null;
  /**
   * Sprint Financeiro 11 (P5): cláusulas vigentes a serem aceitas/listadas.
   * Quando o plano já foi aceito (`acceptance != null`), as cláusulas
   * congeladas no momento do aceite vivem em `acceptedClauses`.
   */
  contractClauses: PublicPlanSnapshotClause[];
  acceptedClauses: PublicPlanSnapshotClause[] | null;
  /**
   * Sprint 15 (F4) — flag da clínica que controla o fluxo de aceite. Quando
   * `true`, a UI pública renderiza a agenda completa e usa o endpoint
   * `/accept-and-materialize` (atômico). Quando `false`, mantém o fluxo
   * legado (`/accept`).
   */
  useV2AcceptanceFlow: boolean;
  /**
   * Sprint 15 (F4) — consultas que serão criadas ao materializar o plano.
   * Vazio quando a clínica ainda não configurou agenda em nenhum item; a UI
   * exibe aviso "aguardando configuração da agenda" e bloqueia o aceite v2.
   */
  appointmentsPreview: PublicPlanAppointmentPreview[];
  /**
   * Sprint 15 (F4) — IDs dos itens que ainda não produziram preview por
   * falta de agenda (dias da semana, horário ou schedule). Usado pela UI
   * pública para explicar quais itens estão pendentes.
   */
  itemsWithoutSchedule: number[];
}

/**
 * Snapshot público enviado para a página `/aceite/:token`.
 *
 * Inclui o conjunto mínimo de dados necessários para renderizar o **contrato
 * completo** que o paciente está prestes a assinar (ou que já assinou): dados
 * de identificação do paciente (CPF/telefone/data de nascimento), dados da
 * clínica (CNPJ/CREFITO/políticas de cancelamento e no-show) e a trilha de
 * aceite (`acceptance`) quando o plano já foi assinado.
 *
 * O token é a credencial — entregue apenas ao próprio paciente — então a
 * exposição do CPF do paciente neste endpoint é equivalente a entregar o
 * contrato impresso a ele em mão.
 */
export async function loadPublicPlanSnapshot(planId: number): Promise<PublicPlanSnapshot | null> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) return null;

  const [patient] = await db
    .select({
      name: patientsTable.name,
      cpf: patientsTable.cpf,
      phone: patientsTable.phone,
      birthDate: patientsTable.birthDate,
      clinicId: patientsTable.clinicId,
    })
    .from(patientsTable)
    .where(eq(patientsTable.id, plan.patientId))
    .limit(1);

  // Sprint Financeiro 11 (P5): cláusulas vigentes da clínica do paciente.
  const clinicIdForClauses = patient?.clinicId ?? null;
  const clausesRows = clinicIdForClauses
    ? await db
        .select({
          id: clinicContractClausesTable.id,
          code: clinicContractClausesTable.code,
          version: clinicContractClausesTable.version,
          title: clinicContractClausesTable.title,
          body: clinicContractClausesTable.body,
          isRequired: clinicContractClausesTable.isRequired,
          sortOrder: clinicContractClausesTable.sortOrder,
        })
        .from(clinicContractClausesTable)
        .where(
          and(
            eq(clinicContractClausesTable.clinicId, clinicIdForClauses),
            eq(clinicContractClausesTable.isActive, true),
          ),
        )
        .orderBy(asc(clinicContractClausesTable.sortOrder), asc(clinicContractClausesTable.code))
    : [];

  // Cláusulas congeladas no aceite (se houver) — vivem no JSON do plano.
  let acceptedClauses: PublicPlanSnapshotClause[] | null = null;
  if (plan.acceptedClausesJson) {
    try {
      const parsed = JSON.parse(plan.acceptedClausesJson) as { items?: unknown };
      if (parsed && Array.isArray(parsed.items)) {
        acceptedClauses = parsed.items.map((it: any) => ({
          id: Number(it.id ?? 0),
          code: String(it.code ?? ""),
          version: Number(it.version ?? 1),
          title: String(it.title ?? ""),
          body: String(it.body ?? ""),
          isRequired: !!it.isRequired,
          sortOrder: 0,
        }));
      }
    } catch {
      acceptedClauses = null;
    }
  }

  const [clinicRow] = await db
    .select({
      name: clinicsTable.name,
      type: clinicsTable.type,
      cnpj: clinicsTable.cnpj,
      cpf: clinicsTable.cpf,
      crefito: clinicsTable.crefito,
      responsibleTechnical: clinicsTable.responsibleTechnical,
      phone: clinicsTable.phone,
      email: clinicsTable.email,
      address: clinicsTable.address,
      website: clinicsTable.website,
      logoUrl: clinicsTable.logoUrl,
      cancellationPolicyHours: clinicsTable.cancellationPolicyHours,
      noShowFeeEnabled: clinicsTable.noShowFeeEnabled,
      noShowFeeAmount: clinicsTable.noShowFeeAmount,
      useV2AcceptanceFlow: clinicsTable.useV2AcceptanceFlow,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.isActive, true))
    .limit(1);

  const rows = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      sessionsPerWeek: treatmentPlanProceduresTable.sessionsPerWeek,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      packageName: packagesTable.name,
      packageType: packagesTable.packageType,
      packageProcedureId: packagesTable.procedureId,
      packageMonthlyPrice: packagesTable.monthlyPrice,
      procedureName: proceduresTable.name,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .leftJoin(proceduresTable, eq(proceduresTable.id, sql`COALESCE(${packagesTable.procedureId}, ${treatmentPlanProceduresTable.procedureId})`))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

  let totalRevenue = 0;
  const items: PublicPlanSnapshotItem[] = rows.map((r) => {
    const kind = resolveItemKind({
      kind: r.kind,
      packageId: r.packageId,
      packageType: r.packageType,
    });
    const unit = Number(r.unitPrice ?? 0);
    // Pacote mensalidade: valor mensal vive em `packages.monthly_price`
    // quando o item não tem `unitMonthlyPrice` próprio.
    const monthly = Number(r.unitMonthlyPrice ?? r.packageMonthlyPrice ?? 0);
    const discount = Number(r.discount ?? 0);
    let effective = 0;
    let estimatedTotal = 0;
    if (kind === "pacoteSessoes") {
      effective = Math.max(0, unit - discount);
      estimatedTotal = effective * (r.totalSessions ?? 0);
    } else if (kind === "recorrenteMensal") {
      effective = Math.max(0, monthly - discount);
      estimatedTotal = effective; // valor mensal — total contratual depende do horizonte
    }
    totalRevenue += estimatedTotal;
    return {
      id: r.id,
      kind,
      procedureName: r.procedureName ?? "Procedimento",
      packageName: r.packageName ?? null,
      packageType: r.packageType ?? null,
      totalSessions: r.totalSessions,
      sessionsPerWeek: r.sessionsPerWeek ?? 1,
      unitPrice: r.unitPrice,
      unitMonthlyPrice: r.unitMonthlyPrice,
      discount: r.discount,
      effectivePrice: effective.toFixed(2),
      estimatedTotal: estimatedTotal.toFixed(2),
    };
  });

  // Sprint 15 (F4) — preview da agenda (lista de consultas a serem criadas).
  // Vazio quando a clínica ainda não configurou agenda; a UI usa isso para
  // exibir aviso e bloquear o aceite v2.
  let previewAppointments: PublicPlanAppointmentPreview[] = [];
  let itemsWithoutSchedule: number[] = [];
  try {
    const previewResult = await enumeratePlanAppointments(planId);
    previewAppointments = previewResult.appointments.map<PublicPlanAppointmentPreview>(
      (a: AppointmentPreviewRow) => ({
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        procedureName: a.procedureName,
        professionalName: a.professionalName,
        monthRef: a.monthRef,
        itemId: a.itemId,
        itemKind: a.itemKind,
      }),
    );
    itemsWithoutSchedule = previewResult.itemsWithoutSchedule;
  } catch {
    // Falha de preview não pode quebrar o snapshot inteiro — o paciente
    // ainda precisa conseguir abrir o contrato.
    previewAppointments = [];
    itemsWithoutSchedule = [];
  }

  const acceptance: PublicPlanSnapshotAcceptance | null = plan.acceptedAt
    ? {
        acceptedAt: plan.acceptedAt.toISOString(),
        acceptedBySignature: plan.acceptedBySignature ?? null,
        acceptedIp: plan.acceptedIp ?? null,
        acceptedDevice: plan.acceptedDevice ?? null,
        acceptedVia: plan.acceptedVia ?? "presencial",
      }
    : null;

  return {
    planId: plan.id,
    patient: {
      name: patient?.name ?? "Paciente",
      cpf: patient?.cpf ?? null,
      phone: patient?.phone ?? null,
      birthDate: patient?.birthDate ?? null,
    },
    patientName: patient?.name ?? "Paciente",
    status: plan.status,
    acceptedAt: plan.acceptedAt ? plan.acceptedAt.toISOString() : null,
    acceptance,
    objectives: plan.objectives,
    techniques: plan.techniques,
    frequency: plan.frequency,
    estimatedSessions: plan.estimatedSessions,
    startDate: plan.startDate,
    responsibleProfessional: plan.responsibleProfessional ?? null,
    items,
    totalEstimatedRevenue: totalRevenue.toFixed(2),
    expiresAt: "",
    clinic: clinicRow
      ? {
          name: clinicRow.name,
          type: clinicRow.type ?? null,
          cnpj: clinicRow.cnpj ?? null,
          cpf: clinicRow.cpf ?? null,
          crefito: clinicRow.crefito ?? null,
          responsibleTechnical: clinicRow.responsibleTechnical ?? null,
          phone: clinicRow.phone ?? null,
          email: clinicRow.email ?? null,
          address: clinicRow.address ?? null,
          website: clinicRow.website ?? null,
          logoUrl: clinicRow.logoUrl ?? null,
          cancellationPolicyHours: clinicRow.cancellationPolicyHours ?? null,
          noShowFeeEnabled: !!clinicRow.noShowFeeEnabled,
          noShowFeeAmount: clinicRow.noShowFeeAmount ?? null,
        }
      : null,
    contractClauses: clausesRows.map((c) => ({ ...c, isRequired: !!c.isRequired })),
    acceptedClauses,
    useV2AcceptanceFlow: !!clinicRow?.useV2AcceptanceFlow,
    appointmentsPreview: previewAppointments,
    itemsWithoutSchedule,
  };
}

/**
 * Marca o token como usado. Idempotência é responsabilidade do callsite —
 * normalmente segue de imediato a chamada de `acceptPatientTreatmentPlan`.
 */
export async function consumeAcceptanceToken(token: string): Promise<void> {
  await db
    .update(treatmentPlanAcceptanceTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(treatmentPlanAcceptanceTokensTable.token, token));
}
