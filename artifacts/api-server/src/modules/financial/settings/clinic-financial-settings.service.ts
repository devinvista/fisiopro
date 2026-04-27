/**
 * Serviço de leitura/escrita de `clinic_financial_settings` (Sprint 2 — T5).
 *
 * Encapsula a leitura com fallback em `clinics.default_due_days` (compat com
 * clínicas que ainda não criaram a linha de settings).
 */
import { db } from "@workspace/db";
import {
  clinicFinancialSettingsTable,
  clinicsTable,
  type ClinicFinancialSettings,
  type UpdateClinicFinancialSettings,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export interface ResolvedFinancialSettings {
  clinicId: number;
  monthlyExpenseBudget: number | null;
  monthlyRevenueGoal: number | null;
  cashReserveTarget: number | null;
  defaultDueDays: number;
  /** true se a linha já existe em `clinic_financial_settings`; false = fallback. */
  configured: boolean;
}

function toNumberOrNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToResolved(row: ClinicFinancialSettings): ResolvedFinancialSettings {
  return {
    clinicId: row.clinicId,
    monthlyExpenseBudget: toNumberOrNull(row.monthlyExpenseBudget),
    monthlyRevenueGoal: toNumberOrNull(row.monthlyRevenueGoal),
    cashReserveTarget: toNumberOrNull(row.cashReserveTarget),
    defaultDueDays: row.defaultDueDays,
    configured: true,
  };
}

/**
 * Retorna as configurações da clínica. Se a linha não existir, devolve um
 * objeto com `configured: false` e `defaultDueDays` lido de `clinics`.
 */
export async function getClinicFinancialSettings(clinicId: number): Promise<ResolvedFinancialSettings> {
  const [row] = await db
    .select()
    .from(clinicFinancialSettingsTable)
    .where(eq(clinicFinancialSettingsTable.clinicId, clinicId))
    .limit(1);

  if (row) return rowToResolved(row);

  const [clinic] = await db
    .select({ defaultDueDays: clinicsTable.defaultDueDays })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  return {
    clinicId,
    monthlyExpenseBudget: null,
    monthlyRevenueGoal: null,
    cashReserveTarget: null,
    defaultDueDays: clinic?.defaultDueDays ?? 3,
    configured: false,
  };
}

function normalizeNumeric(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/**
 * Upsert: cria a linha se não existir, ou atualiza apenas os campos enviados.
 * Sempre devolve a versão resolvida pós-update.
 */
export async function upsertClinicFinancialSettings(
  clinicId: number,
  patch: UpdateClinicFinancialSettings,
): Promise<ResolvedFinancialSettings> {
  const [existing] = await db
    .select()
    .from(clinicFinancialSettingsTable)
    .where(eq(clinicFinancialSettingsTable.clinicId, clinicId))
    .limit(1);

  // Construímos os updates apenas com chaves explicitamente presentes no patch.
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if ("monthlyExpenseBudget" in patch) updates.monthlyExpenseBudget = normalizeNumeric(patch.monthlyExpenseBudget);
  if ("monthlyRevenueGoal" in patch) updates.monthlyRevenueGoal = normalizeNumeric(patch.monthlyRevenueGoal);
  if ("cashReserveTarget" in patch) updates.cashReserveTarget = normalizeNumeric(patch.cashReserveTarget);
  if ("defaultDueDays" in patch && patch.defaultDueDays !== undefined) updates.defaultDueDays = patch.defaultDueDays;

  if (existing) {
    const [updated] = await db
      .update(clinicFinancialSettingsTable)
      .set(updates)
      .where(eq(clinicFinancialSettingsTable.clinicId, clinicId))
      .returning();
    return rowToResolved(updated);
  }

  const [created] = await db
    .insert(clinicFinancialSettingsTable)
    .values({
      clinicId,
      monthlyExpenseBudget: (updates.monthlyExpenseBudget as string | null) ?? null,
      monthlyRevenueGoal: (updates.monthlyRevenueGoal as string | null) ?? null,
      cashReserveTarget: (updates.cashReserveTarget as string | null) ?? null,
      defaultDueDays: (updates.defaultDueDays as number | undefined) ?? 3,
    })
    .returning();
  return rowToResolved(created);
}
