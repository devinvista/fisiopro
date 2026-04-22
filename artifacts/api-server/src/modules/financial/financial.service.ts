// ─── Financial Service ────────────────────────────────────────────────────────
// Thin orchestration layer for complex multi-step financial operations.
// Heavy accounting logic lives in ../_shared/accounting/accounting.service.ts

import { db } from "@workspace/db";
import {
  financialRecordsTable,
  patientSubscriptionsTable,
  sessionCreditsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  allocateReceivable,
  postReceivableSettlement,
  postReversal,
} from "../_shared/accounting/accounting.service.js";
import { RECEIVABLE_TYPES, monthlyCreditQuantity } from "./_shared/financial-reports.service.js";
import { todayBRT } from "../../utils/dateUtils.js";
import { clinicCond, resolvePackageForSubscription } from "./financial.repository.js";
import type { AuthRequest } from "../../middleware/auth.js";

// ─── Update record status with accounting side-effects ─────────────────────────

export async function updateRecordStatusWithAccounting(
  id: number,
  req: AuthRequest,
  status: "pendente" | "pago" | "cancelado" | "estornado",
  paymentDate?: string | null,
  paymentMethod?: string | null,
) {
  const cc = clinicCond(req);
  const existingWhere = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);

  const [existing] = await db.select().from(financialRecordsTable).where(existingWhere);
  if (!existing) return null;

  const [record] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(financialRecordsTable)
      .set({
        status,
        paymentDate: paymentDate || undefined,
        paymentMethod: paymentMethod || undefined,
      })
      .where(existingWhere)
      .returning();

    if (!updated) return [];

    if (status === "pago" && existing.status !== "pago" && [...RECEIVABLE_TYPES, "vendaPacote"].includes(existing.transactionType ?? "")) {
      const settlement = await postReceivableSettlement({
        clinicId: existing.clinicId ?? req.clinicId ?? null,
        entryDate: paymentDate || todayBRT(),
        amount: Number(existing.amount),
        description: `Baixa de recebível — ${existing.description}`,
        sourceType: "financial_record",
        sourceId: existing.id,
        patientId: existing.patientId,
        appointmentId: existing.appointmentId,
        procedureId: existing.procedureId,
        subscriptionId: existing.subscriptionId,
        financialRecordId: existing.id,
      }, tx as any);

      if (existing.accountingEntryId || existing.recognizedEntryId) {
        await allocateReceivable({
          clinicId: existing.clinicId ?? req.clinicId ?? null,
          paymentEntryId: settlement.id,
          receivableEntryId: existing.accountingEntryId ?? existing.recognizedEntryId!,
          patientId: existing.patientId!,
          amount: Number(existing.amount),
          allocatedAt: paymentDate || todayBRT(),
        }, tx as any);
      }

      await tx.update(financialRecordsTable)
        .set({ settlementEntryId: settlement.id })
        .where(eq(financialRecordsTable.id, existing.id));

      updated.settlementEntryId = settlement.id;
    }

    if ((status === "cancelado" || status === "estornado") && existing.status !== status) {
      const entryId = existing.accountingEntryId ?? existing.recognizedEntryId ?? existing.settlementEntryId;
      if (entryId) {
        await postReversal(entryId, {
          clinicId: existing.clinicId ?? req.clinicId ?? null,
          entryDate: todayBRT(),
          description: `Estorno/cancelamento — ${existing.description}`,
          sourceType: "financial_record",
          sourceId: existing.id,
          patientId: existing.patientId,
          appointmentId: existing.appointmentId,
          procedureId: existing.procedureId,
          subscriptionId: existing.subscriptionId,
          financialRecordId: existing.id,
        }, tx as any);
      }
    }

    return [updated];
  });

  if (!record) return null;

  // Generate session_credit automatically when subscription billing is paid
  if (status === "pago" && existing.status !== "pago" && existing.subscriptionId != null) {
    try {
      const [sub] = await db.select().from(patientSubscriptionsTable)
        .where(eq(patientSubscriptionsTable.id, existing.subscriptionId));

      if (sub && sub.subscriptionType !== "faturaConsolidada" && existing.transactionType !== "faturaConsolidada") {
        const patientPackage = await resolvePackageForSubscription(sub, req.clinicId);
        const quantity = monthlyCreditQuantity(patientPackage?.sessionsPerWeek);
        await db.insert(sessionCreditsTable).values({
          patientId: sub.patientId,
          procedureId: sub.procedureId,
          quantity,
          usedQuantity: 0,
          patientPackageId: patientPackage?.id ?? null,
          clinicId: sub.clinicId ?? req.clinicId ?? null,
          notes: `Créditos gerados automaticamente — mensalidade #${record.id} paga (${quantity} sessão${quantity === 1 ? "" : "ões"})`,
        });
        console.log(`[session-credit] ${quantity} crédito(s) gerado(s) para paciente #${sub.patientId} / procedimento #${sub.procedureId} — registro financeiro #${record.id}`);
      }
    } catch (creditErr) {
      console.error("[session-credit] Erro ao gerar crédito de sessão:", creditErr);
    }
  }

  return record;
}

// ─── Apply estorno (reversal) ─────────────────────────────────────────────────

export async function applyEstorno(id: number, req: AuthRequest) {
  const cc = clinicCond(req);
  const whereClause = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);

  const [record] = await db.select().from(financialRecordsTable).where(whereClause);
  if (!record) return { error: "not_found" as const };
  if (record.status === "estornado" || record.status === "cancelado") return { error: "already_reversed" as const };

  const [updated] = await db.transaction(async (tx) => {
    const [u] = await tx.update(financialRecordsTable).set({ status: "estornado" }).where(whereClause).returning();
    const entryId = record.accountingEntryId ?? record.recognizedEntryId ?? record.settlementEntryId;
    if (entryId) {
      await postReversal(entryId, {
        clinicId: record.clinicId ?? req.clinicId ?? null,
        entryDate: todayBRT(),
        description: `Estorno — ${record.description}`,
        sourceType: "financial_record",
        sourceId: record.id,
        patientId: record.patientId,
        appointmentId: record.appointmentId,
        procedureId: record.procedureId,
        subscriptionId: record.subscriptionId,
        financialRecordId: record.id,
        createdBy: req.userId ?? null,
      }, tx as any);
    }
    return [u];
  });

  return { record: updated, original: record };
}
