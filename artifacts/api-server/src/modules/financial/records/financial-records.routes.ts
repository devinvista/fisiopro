import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable, proceduresTable, sessionCreditsTable,
  usersTable, patientsTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, inArray, isNotNull, isNull, or, lt, desc } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { logAudit } from "../../../utils/auditLog.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import { validateBody, validateQuery } from "../../../utils/validate.js";
import { listQuerySchema } from "../../../utils/listQuery.js";
import { buildPage, clampLimit, decodeCursor } from "../../../utils/pagination.js";
import { z } from "zod/v4";

const listRecordsQuerySchema = listQuerySchema.extend({
  type: z.enum(["receita", "despesa"]).optional(),
  month: z.union([z.string(), z.number()]).optional().transform((v) => (v === undefined ? undefined : Number(v))),
  year: z.union([z.string(), z.number()]).optional().transform((v) => (v === undefined ? undefined : Number(v))),
});
import {
  allocateReceivable,
  postReceivableRevenue,
  postReceivableSettlement,
  postReversal,
} from "../../shared/accounting/accounting.service.js";
import {
  RECEIVABLE_TYPES,
  monthDateRange,
} from "../shared/financial-reports.service.js";
import { cascadeFaturaMensalAvulsoPayment } from "../payments/payment-cascade.js";
import {
  createRecordSchema, updateRecordSchema, updateRecordStatusSchema,
  reverseRecordSchema, listReversalsQuerySchema,
} from "../financial.schemas.js";
import { clinicCond } from "../financial.repository.js";

const router = Router();

router.get("/records", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const q = validateQuery(listRecordsQuerySchema, req.query, res);
    if (!q) return;

    const limit = clampLimit(q.limit);
    const cursor = decodeCursor(q.cursor);
    const conditions: any[] = [];

    const cc = clinicCond(req);
    if (cc) conditions.push(cc);
    if (q.type) conditions.push(eq(financialRecordsTable.type, q.type));
    if (q.month && q.year) {
      const { startDate, endDate } = monthDateRange(q.year, q.month);
      conditions.push(
        or(
          and(isNotNull(financialRecordsTable.paymentDate), gte(financialRecordsTable.paymentDate, startDate), lte(financialRecordsTable.paymentDate, endDate)),
          and(isNull(financialRecordsTable.paymentDate), isNotNull(financialRecordsTable.dueDate), gte(financialRecordsTable.dueDate, startDate), lte(financialRecordsTable.dueDate, endDate)),
          and(
            isNull(financialRecordsTable.paymentDate),
            isNull(financialRecordsTable.dueDate),
            gte(sql`DATE(${financialRecordsTable.createdAt})`, startDate),
            lte(sql`DATE(${financialRecordsTable.createdAt})`, endDate),
          ),
        )!,
      );
    }

    if (cursor) {
      conditions.push(
        or(
          lt(financialRecordsTable.createdAt, new Date(cursor.v as string)),
          and(
            eq(financialRecordsTable.createdAt, new Date(cursor.v as string)),
            lt(financialRecordsTable.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await db
      .select({
        id: financialRecordsTable.id,
        type: financialRecordsTable.type,
        amount: financialRecordsTable.amount,
        description: financialRecordsTable.description,
        category: financialRecordsTable.category,
        appointmentId: financialRecordsTable.appointmentId,
        patientId: financialRecordsTable.patientId,
        procedureId: financialRecordsTable.procedureId,
        transactionType: financialRecordsTable.transactionType,
        status: financialRecordsTable.status,
        paymentDate: financialRecordsTable.paymentDate,
        dueDate: financialRecordsTable.dueDate,
        paymentMethod: financialRecordsTable.paymentMethod,
        subscriptionId: financialRecordsTable.subscriptionId,
        procedureName: proceduresTable.name,
        createdAt: financialRecordsTable.createdAt,
      })
      .from(financialRecordsTable)
      .leftJoin(proceduresTable, eq(financialRecordsTable.procedureId, proceduresTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(financialRecordsTable.createdAt), desc(financialRecordsTable.id))
      .limit(limit + 1);

    res.json(
      buildPage(rows, limit, (row) => ({ v: row.createdAt!.toISOString(), id: row.id })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/records", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createRecordSchema, req.body, res);
    if (!body) return;
    const { type, amount, description, category, patientId, procedureId, paymentDate, dueDate, status, paymentMethod } = body;

    const today = todayBRT();
    const resolvedPaymentDate = status === "pendente" ? null : (paymentDate ?? today);
    const resolvedDueDate = dueDate ?? paymentDate ?? today;

    const [record] = await db
      .insert(financialRecordsTable)
      .values({
        type,
        amount: String(amount),
        description,
        category: category ?? null,
        patientId: patientId ?? null,
        procedureId: procedureId ?? null,
        clinicId: req.clinicId ?? null,
        paymentDate: resolvedPaymentDate,
        dueDate: resolvedDueDate,
        status: status ?? "pago",
        paymentMethod: paymentMethod ?? null,
      })
      .returning();

    const result = { ...record, procedureName: null as string | null };

    if (record.procedureId) {
      const [proc] = await db
        .select({ name: proceduresTable.name })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, record.procedureId));
      result.procedureName = proc?.name ?? null;
    }

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/records/:id", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateRecordSchema, req.body, res);
    if (!body) return;

    const cc = clinicCond(req);
    const whereClause = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);

    const [existing] = await db.select().from(financialRecordsTable).where(whereClause);
    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "Registro não encontrado" });
      return;
    }

    // PR-FIN6-1 (B2): bloqueia edição de campos contabilmente relevantes
    // (amount, type, status, paymentDate) quando o registro JÁ tem
    // lançamento contábil. A trilha correta é: estornar (`/estorno`) e
    // emitir um novo lançamento. Campos auxiliares (descrição, categoria,
    // dueDate, procedureId, paymentMethod) continuam editáveis.
    const isContabilizado =
      existing.accountingEntryId != null ||
      existing.recognizedEntryId != null ||
      existing.settlementEntryId != null;
    if (isContabilizado) {
      const lockedFields: string[] = [];
      if (body.amount !== undefined && Number(body.amount) !== Number(existing.amount)) lockedFields.push("amount");
      if (body.type !== undefined && body.type !== existing.type) lockedFields.push("type");
      if (body.status !== undefined && body.status !== existing.status) lockedFields.push("status");
      if (body.paymentDate !== undefined && body.paymentDate !== existing.paymentDate) lockedFields.push("paymentDate");
      if (lockedFields.length > 0) {
        res.status(409).json({
          error: "Conflict",
          code: "RECORD_ALREADY_POSTED",
          message:
            `Lançamento já contabilizado (entry #${existing.accountingEntryId ?? existing.recognizedEntryId ?? existing.settlementEntryId}). ` +
            `Campos bloqueados: ${lockedFields.join(", ")}. Use POST /records/${id}/estorno e emita um novo lançamento.`,
          lockedFields,
        });
        return;
      }
    }

    const updates: Record<string, any> = {};
    if (body.type !== undefined) updates.type = body.type;
    if (body.amount !== undefined) updates.amount = String(body.amount);
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.procedureId !== undefined) updates.procedureId = body.procedureId;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
    if (body.status !== undefined) updates.status = body.status;
    if (body.status === "pendente") {
      updates.paymentDate = null;
    } else if (body.paymentDate !== undefined) {
      updates.paymentDate = body.paymentDate;
    }

    const [record] = await db
      .update(financialRecordsTable)
      .set(updates)
      .where(whereClause)
      .returning();

    await logAudit({
      userId: req.userId,
      action: "update",
      entityType: "financial_record",
      entityId: id,
      patientId: record.patientId ?? null,
      summary: `Lançamento editado: ${record.description} (R$ ${Number(record.amount).toFixed(2)})`,
    });

    let procedureName: string | null = null;
    if (record.procedureId) {
      const [proc] = await db.select({ name: proceduresTable.name }).from(proceduresTable).where(eq(proceduresTable.id, record.procedureId));
      procedureName = proc?.name ?? null;
    }

    res.json({ ...record, procedureName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/records/:id/status", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateRecordStatusSchema, req.body, res);
    if (!body) return;
    const { status, paymentDate, paymentMethod, reversalReason } = body;

    const cc = clinicCond(req);
    const existingWhere = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);

    const [existing] = await db
      .select()
      .from(financialRecordsTable)
      .where(existingWhere);

    if (!existing) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const isReversingNow =
      (status === "cancelado" || status === "estornado") && existing.status !== status;

    if (isReversingNow && !reversalReason) {
      res.status(400).json({
        error: "Bad Request",
        message: "Motivo do estorno é obrigatório ao cancelar ou estornar um lançamento.",
      });
      return;
    }

    const [record] = await db.transaction(async (tx) => {
      const updateValues: Record<string, any> = {
        status,
        paymentDate: paymentDate || undefined,
        paymentMethod: paymentMethod || undefined,
      };
      if (isReversingNow) {
        updateValues.originalAmount = existing.originalAmount ?? existing.amount;
        updateValues.reversalReason = reversalReason;
        updateValues.reversedBy = req.userId ?? null;
        updateValues.reversedAt = new Date();
      }

      const [updated] = await tx
        .update(financialRecordsTable)
        .set(updateValues)
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

        await tx
          .update(financialRecordsTable)
          .set({ settlementEntryId: settlement.id })
          .where(eq(financialRecordsTable.id, existing.id));

        updated.settlementEntryId = settlement.id;

        // PR-FIN6-2 (B3): efeitos pós-pagamento que antes só rodavam em
        // POST /payment passam a rodar aqui também:
        //  • faturaPlano paga → promove pool de créditos prepago
        //    (`pendentePagamento` → `disponivel`).
        //  • faturaMensalAvulso paga → cascateia status para os filhos
        //    e aloca o settlement contra o reconhecimento de cada filho.
        if (existing.transactionType === "faturaPlano") {
          const { promotePrepaidCreditsForFinancialRecord } =
            await import("../../clinical/medical-records/treatment-plans.materialization.js");
          await promotePrepaidCreditsForFinancialRecord(existing.id);
        } else if (existing.transactionType === "faturaMensalAvulso") {
          await cascadeFaturaMensalAvulsoPayment({
            tx,
            parent: {
              id: existing.id,
              clinicId: existing.clinicId ?? req.clinicId ?? null,
              patientId: existing.patientId,
              amount: existing.amount,
            },
            paymentDate: paymentDate || todayBRT(),
            paymentMethod: paymentMethod || null,
            settlementEntryId: settlement.id,
          });
        }
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

    if (!record) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/records/:id/estorno", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(reverseRecordSchema, req.body, res);
    if (!body) return;

    const cc = clinicCond(req);
    const whereClause = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);

    const [record] = await db
      .select()
      .from(financialRecordsTable)
      .where(whereClause);

    if (!record) {
      res.status(404).json({ error: "Not Found", message: "Registro financeiro não encontrado" });
      return;
    }

    if (record.status === "estornado" || record.status === "cancelado") {
      res.status(400).json({ error: "Bad Request", message: "Registro já foi estornado ou cancelado" });
      return;
    }

    const reversedAt = new Date();
    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(financialRecordsTable)
        .set({
          status: "estornado",
          originalAmount: record.originalAmount ?? record.amount,
          reversalReason: body.reversalReason,
          reversedBy: req.userId ?? null,
          reversedAt,
        })
        .where(whereClause)
        .returning();

      const entryId = record.accountingEntryId ?? record.recognizedEntryId ?? record.settlementEntryId;
      if (entryId) {
        await postReversal(entryId, {
          clinicId: record.clinicId ?? req.clinicId ?? null,
          entryDate: todayBRT(),
          description: `Estorno — ${record.description} (motivo: ${body.reversalReason})`,
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

    await logAudit({
      userId: req.userId,
      action: "reverse",
      entityType: "financial_record",
      entityId: id,
      patientId: record.patientId ?? null,
      summary: `Estorno aplicado: ${record.description} (R$ ${Number(record.amount).toFixed(2)}) — motivo: ${body.reversalReason}`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Lista o histórico de estornos da clínica.
 * Filtra registros com `reversedAt IS NOT NULL` (ou seja, que passaram pelo
 * fluxo de estorno auditado a partir da Sprint 3 T9). Inclui o nome do usuário
 * que aplicou o estorno e o nome do paciente impactado.
 */
router.get("/records/reversals", requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const q = validateQuery(listReversalsQuerySchema, req.query, res);
    if (!q) return;

    const limit = clampLimit(q.limit ?? 50);
    const conditions: any[] = [isNotNull(financialRecordsTable.reversedAt)];

    const cc = clinicCond(req);
    if (cc) conditions.push(cc);

    if (q.from) conditions.push(gte(sql`DATE(${financialRecordsTable.reversedAt})`, q.from));
    if (q.to) conditions.push(lte(sql`DATE(${financialRecordsTable.reversedAt})`, q.to));

    if (q.cursor) {
      const cursor = decodeCursor(q.cursor);
      if (cursor) {
        conditions.push(
          or(
            lt(financialRecordsTable.reversedAt, new Date(cursor.v as string)),
            and(
              eq(financialRecordsTable.reversedAt, new Date(cursor.v as string)),
              lt(financialRecordsTable.id, cursor.id),
            ),
          )!,
        );
      }
    }

    const rows = await db
      .select({
        id: financialRecordsTable.id,
        type: financialRecordsTable.type,
        amount: financialRecordsTable.amount,
        originalAmount: financialRecordsTable.originalAmount,
        description: financialRecordsTable.description,
        category: financialRecordsTable.category,
        status: financialRecordsTable.status,
        reversalReason: financialRecordsTable.reversalReason,
        reversedAt: financialRecordsTable.reversedAt,
        reversedBy: financialRecordsTable.reversedBy,
        reversedByName: usersTable.name,
        patientId: financialRecordsTable.patientId,
        patientName: patientsTable.name,
        procedureId: financialRecordsTable.procedureId,
        procedureName: proceduresTable.name,
        paymentDate: financialRecordsTable.paymentDate,
        createdAt: financialRecordsTable.createdAt,
      })
      .from(financialRecordsTable)
      .leftJoin(usersTable, eq(financialRecordsTable.reversedBy, usersTable.id))
      .leftJoin(patientsTable, eq(financialRecordsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(financialRecordsTable.procedureId, proceduresTable.id))
      .where(and(...conditions))
      .orderBy(desc(financialRecordsTable.reversedAt), desc(financialRecordsTable.id))
      .limit(limit + 1);

    res.json(
      buildPage(rows, limit, (row) => ({ v: row.reversedAt!.toISOString(), id: row.id })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/records/:id", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const cc = clinicCond(req);
    const whereClause = cc ? and(eq(financialRecordsTable.id, id), cc) : eq(financialRecordsTable.id, id);
    const [record] = await db
      .select()
      .from(financialRecordsTable)
      .where(whereClause);

    if (!record) {
      res.status(404).json({ error: "Not Found", message: "Registro financeiro não encontrado" });
      return;
    }

    // PR-FIN6-1 (B1): receita com lançamento contábil exige estorno auditado.
    // Antes, o DELETE só fazia soft-delete (`status='estornado'`) sem postar
    // `postReversal`, deixando o journal e o operacional dessincronizados.
    // Agora o DELETE delega para o fluxo `/estorno`: se há accountingEntry,
    // exige `reversalReason` (query ou body) e posta o estorno espelhado.
    const hasAccountingEntry =
      record.type === "receita" &&
      (record.accountingEntryId != null ||
        record.recognizedEntryId != null ||
        record.settlementEntryId != null);

    if (record.type === "despesa") {
      await db.delete(financialRecordsTable).where(whereClause);
      await logAudit({
        userId: req.userId,
        action: "delete",
        entityType: "financial_record",
        entityId: id,
        patientId: record.patientId ?? null,
        summary: `Despesa removida: ${record.description} (R$ ${Number(record.amount).toFixed(2)})`,
      });
      res.status(204).send();
      return;
    }

    if (record.status === "estornado" || record.status === "cancelado") {
      // Já estornado: idempotente (204).
      res.status(204).send();
      return;
    }

    if (hasAccountingEntry) {
      const reversalReason =
        (req.body && typeof req.body.reversalReason === "string" ? req.body.reversalReason : undefined) ??
        (typeof req.query.reversalReason === "string" ? req.query.reversalReason : undefined);

      if (!reversalReason || reversalReason.length < 3) {
        res.status(400).json({
          error: "Bad Request",
          code: "REVERSAL_REASON_REQUIRED",
          message:
            "Receita já contabilizada — DELETE exige `reversalReason` (mínimo 3 caracteres) " +
            "para postar o estorno contábil. Envie no body ou na query string.",
        });
        return;
      }

      const reversedAt = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(financialRecordsTable)
          .set({
            status: "estornado",
            originalAmount: record.originalAmount ?? record.amount,
            reversalReason,
            reversedBy: req.userId ?? null,
            reversedAt,
          })
          .where(whereClause);

        const entryId = record.accountingEntryId ?? record.recognizedEntryId ?? record.settlementEntryId;
        if (entryId) {
          await postReversal(entryId, {
            clinicId: record.clinicId ?? req.clinicId ?? null,
            entryDate: todayBRT(),
            description: `Estorno via DELETE — ${record.description} (motivo: ${reversalReason})`,
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
      });

      await logAudit({
        userId: req.userId,
        action: "reverse",
        entityType: "financial_record",
        entityId: id,
        patientId: record.patientId ?? null,
        summary: `Estorno via DELETE: ${record.description} (R$ ${Number(record.amount).toFixed(2)}) — motivo: ${reversalReason}`,
      });
      res.status(204).send();
      return;
    }

    // Receita sem lançamento contábil (estado intermediário/legado): soft delete simples.
    await db
      .update(financialRecordsTable)
      .set({ status: "estornado" })
      .where(whereClause);

    await logAudit({
      userId: req.userId,
      action: "delete",
      entityType: "financial_record",
      entityId: id,
      patientId: record.patientId ?? null,
      summary: `Registro financeiro estornado (sem lançamento contábil): ${record.description} (R$ ${Number(record.amount).toFixed(2)})`,
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
