import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable, proceduresTable, sessionCreditsTable, patientsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import type { AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { logAudit } from "../../../utils/auditLog.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import { validateBody } from "../../../utils/validate.js";
import {
  ACCOUNT_CODES,
  allocateReceivable,
  getAccountingBalances,
  postCashAdvance,
  postCashReceipt,
  postReceivableRevenue,
  postReceivableSettlement,
} from "../../shared/accounting/accounting.service.js";
import { RECEIVABLE_TYPES } from "../shared/financial-reports.service.js";
import { createPaymentSchema } from "../financial.schemas.js";
import { assertPatientInClinic } from "../financial.repository.js";
import {
  cascadeFaturaMensalAvulsoPayment,
  countPendingChildren,
} from "./payment-cascade.js";

const router = Router();

router.get("/patients/:patientId/history", requirePermission("financial.read"), async (req, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (!await assertPatientInClinic(patientId, req as AuthRequest)) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este paciente" });
      return;
    }

    const records = await db
      .select({
        id: financialRecordsTable.id,
        type: financialRecordsTable.type,
        amount: financialRecordsTable.amount,
        description: financialRecordsTable.description,
        category: financialRecordsTable.category,
        transactionType: financialRecordsTable.transactionType,
        status: financialRecordsTable.status,
        dueDate: financialRecordsTable.dueDate,
        paymentDate: financialRecordsTable.paymentDate,
        paymentMethod: financialRecordsTable.paymentMethod,
        appointmentId: financialRecordsTable.appointmentId,
        procedureId: financialRecordsTable.procedureId,
        subscriptionId: financialRecordsTable.subscriptionId,
        procedureName: proceduresTable.name,
        createdAt: financialRecordsTable.createdAt,
      })
      .from(financialRecordsTable)
      .leftJoin(proceduresTable, eq(financialRecordsTable.procedureId, proceduresTable.id))
      .where(eq(financialRecordsTable.patientId, patientId))
      .orderBy(financialRecordsTable.createdAt);

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/patients/:patientId/summary", requirePermission("financial.read"), async (req, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (!await assertPatientInClinic(patientId, req as AuthRequest)) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este paciente" });
      return;
    }

    const balances = await getAccountingBalances({
      clinicId: (req as AuthRequest).isSuperAdmin ? null : (req as AuthRequest).clinicId,
      patientId,
    });
    const balanceByCode = new Map(balances.map((row) => [row.code, { debit: Number(row.debit), credit: Number(row.credit) }]));
    const totalAReceber = Math.max(0, (balanceByCode.get(ACCOUNT_CODES.receivables)?.debit ?? 0) - (balanceByCode.get(ACCOUNT_CODES.receivables)?.credit ?? 0));
    const totalPago = balanceByCode.get(ACCOUNT_CODES.cash)?.debit ?? 0;
    const saldoCarteiraAdiantamentos = Math.max(0, (balanceByCode.get(ACCOUNT_CODES.customerAdvances)?.credit ?? 0) - (balanceByCode.get(ACCOUNT_CODES.customerAdvances)?.debit ?? 0));
    const saldo = totalAReceber;

    const credits = await db
      .select()
      .from(sessionCreditsTable)
      .where(eq(sessionCreditsTable.patientId, patientId));

    const totalSessionCredits = credits.reduce((s, c) => s + (c.quantity - c.usedQuantity), 0);

    res.json({
      totalAReceber,
      totalPago,
      saldo,
      saldoCarteiraAdiantamentos,
      totalSessionCredits,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/patients/:patientId/payment", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (!await assertPatientInClinic(patientId, req)) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este paciente" });
      return;
    }
    const body = validateBody(createPaymentSchema, req.body, res);
    if (!body) return;
    const { amount, paymentMethod, description, procedureId, paymentDate: paymentDateInput } = body;
    const numAmount = Number(amount);

    // Permite registrar pagamento com data passada (até hoje); default = hoje.
    const today = paymentDateInput || todayBRT();

    const [patient] = await db.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, patientId));

    const [record] = await db.transaction(async (tx) => {
      const [paymentRecord] = await tx
        .insert(financialRecordsTable)
        .values({
          type: "receita",
          amount: String(numAmount),
          description: description || `Pagamento — ${patient?.name ?? "Paciente"}`,
          category: "Pagamento",
          patientId,
          procedureId: procedureId ? parseInt(String(procedureId)) : null,
          transactionType: "pagamento",
          status: "pago",
          paymentDate: today,
          paymentMethod: paymentMethod || null,
          clinicId: req.clinicId ?? null,
        })
        .returning();

      // PR-FIN6-4 (B4): filtro multi-tenant. Usuário comum: limita ao
      // `req.clinicId`. Super-admin sem clínica explícita: vê todas as
      // pendências do paciente (cenários de teste / consolidação).
      const pendingConditions: any[] = [
        eq(financialRecordsTable.patientId, patientId),
        eq(financialRecordsTable.status, "pendente"),
        inArray(financialRecordsTable.transactionType, [...RECEIVABLE_TYPES, "vendaPacote"]),
      ];
      if (req.clinicId) {
        pendingConditions.push(eq(financialRecordsTable.clinicId, req.clinicId));
      }
      const pendingRecords = await tx
        .select()
        .from(financialRecordsTable)
        .where(and(...pendingConditions))
        .orderBy(financialRecordsTable.dueDate, financialRecordsTable.createdAt);

      let remaining = numAmount;
      let primaryEntryId: number | null = null;
      // Sprint 4 — IDs de filhos cascateados nesta transação. Quando uma
      // `faturaMensalAvulso` é paga, marcamos seus filhos como `pago` em
      // bloco; eles ainda aparecem em `pendingRecords` (snapshot anterior),
      // então pulamos para não dupli-settlear.
      const cascadedChildIds = new Set<number>();

      for (const pending of pendingRecords) {
        if (remaining <= 0) break;
        if (cascadedChildIds.has(pending.id)) continue;
        const allocationAmount = Math.min(remaining, Number(pending.amount));
        let receivableEntryId = pending.accountingEntryId ?? pending.recognizedEntryId;

        // ── faturaPlano paga ANTES da 1ª sessão do mês ───────────────────
        // Não reconhece receita aqui — vai para Adiantamentos de Cliente
        // (passivo). A receita só é reconhecida na 1ª confirmação de sessão
        // do mês (em applyBillingRules → recognizeMonthlyInvoiceRevenue),
        // momento em que o adiantamento é consumido (D: Adiantamentos /
        // C: Receita).
        const isFaturaPlanoPrepaid =
          pending.transactionType === "faturaPlano" && !receivableEntryId;

        if (isFaturaPlanoPrepaid) {
          const advanceEntry = await postCashAdvance({
            clinicId: pending.clinicId ?? req.clinicId ?? null,
            entryDate: today,
            amount: allocationAmount,
            description: `Pagamento antecipado de fatura mensal — ${pending.description}`,
            sourceType: "financial_record",
            sourceId: paymentRecord.id,
            patientId,
            appointmentId: pending.appointmentId,
            procedureId: pending.procedureId,
            subscriptionId: pending.subscriptionId,
            financialRecordId: paymentRecord.id,
          }, tx as any);
          primaryEntryId ??= advanceEntry.id;

          if (allocationAmount >= Number(pending.amount)) {
            await tx
              .update(financialRecordsTable)
              .set({ status: "pago", paymentDate: today, paymentMethod: paymentMethod || null, settlementEntryId: advanceEntry.id })
              .where(eq(financialRecordsTable.id, pending.id));
            // Promove pool de créditos prepago → disponivel
            const { promotePrepaidCreditsForFinancialRecord } =
              await import("../../clinical/medical-records/treatment-plans.materialization.js");
            await promotePrepaidCreditsForFinancialRecord(pending.id);
          }
          remaining = Math.round((remaining - allocationAmount) * 100) / 100;
          continue;
        }

        // ── faturaMensalAvulso (consolidador, Sprint 4) ──────────────────
        // Os filhos JÁ reconheceram receita ao serem materializados (sessão
        // confirmada). O parent NÃO tem receita própria — apenas posta o
        // settlement (D Caixa / C Recebíveis) e aloca contra o
        // `recognizedEntryId` de cada filho. Em seguida cascateia o status
        // `pago` para os filhos. Pagamento parcial não cascateia.
        if (pending.transactionType === "faturaMensalAvulso") {
          // Sprint 4 (B2) — Pagamento parcial NÃO cascateia, e tampouco posta
          // settlement no parent. O parent é apenas um "agrupador" sem receita
          // própria; quem carrega o recebível contabilmente são os filhos.
          // Pulamos o parent e deixamos o loop alocar contra os filhos
          // individualmente (cada filho tem seu `recognizedEntryId`).
          if (allocationAmount < Number(pending.amount)) {
            continue;
          }
          const settlementEntry = await postReceivableSettlement({
            clinicId: pending.clinicId ?? req.clinicId ?? null,
            entryDate: today,
            amount: allocationAmount,
            description: `Baixa de fatura mensal de avulsos — ${pending.description}`,
            sourceType: "financial_record",
            sourceId: paymentRecord.id,
            patientId,
            appointmentId: pending.appointmentId,
            procedureId: pending.procedureId,
            subscriptionId: pending.subscriptionId,
            financialRecordId: paymentRecord.id,
          }, tx as any);
          primaryEntryId ??= settlementEntry.id;

          if (allocationAmount >= Number(pending.amount)) {
            const cascade = await cascadeFaturaMensalAvulsoPayment({
              tx,
              parent: {
                id: pending.id,
                clinicId: pending.clinicId ?? req.clinicId ?? null,
                patientId,
                amount: pending.amount,
              },
              paymentDate: today,
              paymentMethod: paymentMethod || null,
              settlementEntryId: settlementEntry.id,
            });
            for (const cid of cascade.cascadedChildIds) cascadedChildIds.add(cid);

            await tx
              .update(financialRecordsTable)
              .set({
                status: "pago",
                paymentDate: today,
                paymentMethod: paymentMethod || null,
                settlementEntryId: settlementEntry.id,
              })
              .where(eq(financialRecordsTable.id, pending.id));
          }
          remaining = Math.round((remaining - allocationAmount) * 100) / 100;
          continue;
        }

        // PR-FIN6-3 (B5): vendaPacote SEM accountingEntryId é um caso legado
        // (registro criado fora do fluxo `postPackageSale`). Antes, o código
        // pulava a recognition mas seguia para `postReceivableSettlement`,
        // gerando D Caixa / C Recebíveis sem saldo de Recebíveis prévio →
        // recebível negativo. Agora, redirecionamos para `postCashAdvance`
        // (D Caixa / C Adiantamentos), que é a contabilização correta de uma
        // venda de pacote: passivo até a execução das sessões.
        if (!receivableEntryId && pending.transactionType === "vendaPacote") {
          const advanceEntry = await postCashAdvance({
            clinicId: pending.clinicId ?? req.clinicId ?? null,
            entryDate: today,
            amount: allocationAmount,
            description: `Pagamento de venda de pacote (legado, sem entry prévio) — ${pending.description}`,
            sourceType: "financial_record",
            sourceId: paymentRecord.id,
            patientId,
            appointmentId: pending.appointmentId,
            procedureId: pending.procedureId,
            patientPackageId: pending.patientPackageId,
            subscriptionId: pending.subscriptionId,
            financialRecordId: paymentRecord.id,
          }, tx as any);
          primaryEntryId ??= advanceEntry.id;

          if (allocationAmount >= Number(pending.amount)) {
            await tx
              .update(financialRecordsTable)
              .set({
                status: "pago",
                paymentDate: today,
                paymentMethod: paymentMethod || null,
                accountingEntryId: advanceEntry.id,
                settlementEntryId: advanceEntry.id,
              })
              .where(eq(financialRecordsTable.id, pending.id));
          }
          remaining = Math.round((remaining - allocationAmount) * 100) / 100;
          continue;
        }

        if (!receivableEntryId && pending.transactionType !== "vendaPacote") {
          const recognitionEntry = await postReceivableRevenue({
            clinicId: pending.clinicId ?? req.clinicId ?? null,
            entryDate: pending.dueDate ?? today,
            amount: Number(pending.amount),
            description: pending.description,
            sourceType: "financial_record",
            sourceId: pending.id,
            patientId,
            appointmentId: pending.appointmentId,
            procedureId: pending.procedureId,
            subscriptionId: pending.subscriptionId,
            financialRecordId: pending.id,
          }, tx as any);
          receivableEntryId = recognitionEntry.id;
          await tx
            .update(financialRecordsTable)
            .set({ accountingEntryId: recognitionEntry.id, recognizedEntryId: recognitionEntry.id })
            .where(eq(financialRecordsTable.id, pending.id));
        }

        const paymentEntry = await postReceivableSettlement({
          clinicId: pending.clinicId ?? req.clinicId ?? null,
          entryDate: today,
          amount: allocationAmount,
          description: `Baixa de recebível — ${pending.description}`,
          sourceType: "financial_record",
          sourceId: paymentRecord.id,
          patientId,
          appointmentId: pending.appointmentId,
          procedureId: pending.procedureId,
          subscriptionId: pending.subscriptionId,
          financialRecordId: paymentRecord.id,
        }, tx as any);
        primaryEntryId ??= paymentEntry.id;

        if (receivableEntryId) {
          await allocateReceivable({
            clinicId: pending.clinicId ?? req.clinicId ?? null,
            paymentEntryId: paymentEntry.id,
            receivableEntryId,
            patientId,
            amount: allocationAmount,
            allocatedAt: today,
          }, tx as any);
        }

        if (allocationAmount >= Number(pending.amount)) {
          await tx
            .update(financialRecordsTable)
            .set({ status: "pago", paymentDate: today, paymentMethod: paymentMethod || null, settlementEntryId: paymentEntry.id })
            .where(eq(financialRecordsTable.id, pending.id));
          // Sprint 2 — Trigger pós-pagamento de plano: promove pool mensal
          // `pendentePagamento` → `disponivel` quando a fatura faturaPlano
          // (modo prepago) é integralmente paga.
          if (pending.transactionType === "faturaPlano") {
            const { promotePrepaidCreditsForFinancialRecord } =
              await import("../../clinical/medical-records/treatment-plans.materialization.js");
            await promotePrepaidCreditsForFinancialRecord(pending.id);
          }
        }

        remaining = Math.round((remaining - allocationAmount) * 100) / 100;
      }

      if (remaining > 0) {
        const directEntry = await postCashReceipt({
          clinicId: req.clinicId ?? null,
          entryDate: today,
          amount: remaining,
          description: description || `Pagamento direto — ${patient?.name ?? "Paciente"}`,
          sourceType: "financial_record",
          sourceId: paymentRecord.id,
          patientId,
          procedureId: procedureId ? parseInt(String(procedureId)) : null,
          financialRecordId: paymentRecord.id,
        }, tx as any);
        primaryEntryId ??= directEntry.id;
      }

      await tx
        .update(financialRecordsTable)
        .set({ accountingEntryId: primaryEntryId, settlementEntryId: primaryEntryId })
        .where(eq(financialRecordsTable.id, paymentRecord.id));

      return [paymentRecord];
    });

    await logAudit({
      userId: req.userId,
      action: "create",
      entityType: "financial_record",
      entityId: record.id,
      patientId,
      summary: `Pagamento registrado: R$ ${numAmount.toFixed(2)} — ${paymentMethod ?? ""}`,
    });

    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/patients/:patientId/credits", requirePermission("financial.read"), async (req, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (!await assertPatientInClinic(patientId, req as AuthRequest)) {
      res.status(403).json({ error: "Forbidden", message: "Acesso negado a este paciente" });
      return;
    }

    const credits = await db
      .select({
        credit: sessionCreditsTable,
        procedure: proceduresTable,
      })
      .from(sessionCreditsTable)
      .leftJoin(proceduresTable, eq(sessionCreditsTable.procedureId, proceduresTable.id))
      .where(eq(sessionCreditsTable.patientId, patientId));

    const withBalance = credits.map(({ credit, procedure }) => ({
      ...credit,
      procedure,
      availableCount: credit.quantity - credit.usedQuantity,
    }));

    const totalAvailable = withBalance.reduce((s, c) => s + c.availableCount, 0);
    res.json({ credits: withBalance, totalAvailable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
