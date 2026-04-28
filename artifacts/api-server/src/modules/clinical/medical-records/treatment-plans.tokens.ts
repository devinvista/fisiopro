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
} from "@workspace/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { resolveItemKind } from "./treatment-plans.acceptance.js";

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
  totalSessions: number | null;
  unitPrice: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  effectivePrice: string;
  estimatedTotal: string;
}

export interface PublicPlanSnapshot {
  planId: number;
  patientName: string;
  status: string;
  acceptedAt: string | null;
  objectives: string | null;
  techniques: string | null;
  frequency: string | null;
  estimatedSessions: number | null;
  startDate: string | null;
  items: PublicPlanSnapshotItem[];
  totalEstimatedRevenue: string;
  expiresAt: string;
}

/**
 * Snapshot público enviado para a página `/aceite/:token`. NÃO inclui dados
 * sensíveis do paciente (CPF, telefone, endereço) — apenas o nome e os termos
 * comerciais necessários para a leitura/aceitação.
 */
export async function loadPublicPlanSnapshot(planId: number): Promise<PublicPlanSnapshot | null> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) return null;

  const [patient] = await db
    .select({ name: patientsTable.name })
    .from(patientsTable)
    .where(eq(patientsTable.id, plan.patientId))
    .limit(1);

  const rows = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      packageName: packagesTable.name,
      packageType: packagesTable.packageType,
      packageProcedureId: packagesTable.procedureId,
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
    const monthly = Number(r.unitMonthlyPrice ?? 0);
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
      totalSessions: r.totalSessions,
      unitPrice: r.unitPrice,
      unitMonthlyPrice: r.unitMonthlyPrice,
      discount: r.discount,
      effectivePrice: effective.toFixed(2),
      estimatedTotal: estimatedTotal.toFixed(2),
    };
  });

  return {
    planId: plan.id,
    patientName: patient?.name ?? "Paciente",
    status: plan.status,
    acceptedAt: plan.acceptedAt ? plan.acceptedAt.toISOString() : null,
    objectives: plan.objectives,
    techniques: plan.techniques,
    frequency: plan.frequency,
    estimatedSessions: plan.estimatedSessions,
    startDate: plan.startDate,
    items,
    totalEstimatedRevenue: totalRevenue.toFixed(2),
    expiresAt: "",
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
