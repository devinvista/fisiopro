import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialRecordsTable, proceduresTable, sessionCreditsTable, patientsTable,
  patientWalletTable, patientWalletTransactionsTable,
  accountingJournalEntriesTable, appointmentsTable,
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

    let walletCreditedAmount = 0;
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
      // IDs de filhos cascateados nesta transação. Quando uma
      // `faturaMensalAvulso` é paga, marcamos seus filhos em bloco;
      // eles ainda aparecem em `pendingRecords` (snapshot anterior),
      // então pulamos para não dupli-settlear.
      const cascadedChildIds = new Set<number>();

      for (const pending of pendingRecords) {
        if (remaining <= 0) break;
        if (cascadedChildIds.has(pending.id)) continue;
        const allocationAmount = Math.min(remaining, Number(pending.amount));
        let receivableEntryId = pending.accountingEntryId ?? pending.recognizedEntryId;

        // ── faturaPlano paga ANTES da 1ª sessão do mês ───────────────────
        // Branching por modo de pagamento:
        //   • Com deferred_receivable (pré-pago): o recebível (1.1.2) e o
        //     adiantamento (2.1.1) já existem desde o aceite. O pagamento é
        //     apenas SETTLEMENT puro — D Caixa / C Recebíveis. O adiantamento
        //     (2.1.1) é consumido sessão a sessão no reconhecimento de receita.
        //   • Sem deferred_receivable (pós-pago/histórico): D Caixa / C
        //     Adiantamentos — a receita nasce na 1ª sessão confirmada.
        const isFaturaPlanoPrepaid =
          pending.transactionType === "faturaPlano" && !receivableEntryId;

        if (isFaturaPlanoPrepaid) {
          const [deferredEntry] = await tx
            .select({ id: accountingJournalEntriesTable.id })
            .from(accountingJournalEntriesTable)
            .where(
              and(
                eq(accountingJournalEntriesTable.sourceType, "financial_record"),
                eq(accountingJournalEntriesTable.sourceId, pending.id),
                eq(accountingJournalEntriesTable.eventType, "deferred_receivable"),
                eq(accountingJournalEntriesTable.status, "posted"),
              ),
            )
            .limit(1);

          let mainEntryId: number;
          if (deferredEntry) {
            // P3: settlement puro — D Caixa / C Recebíveis.
            const settleEntry = await postReceivableSettlement({
              clinicId: pending.clinicId ?? req.clinicId ?? null,
              entryDate: today,
              amount: allocationAmount,
              description: `Pagamento de fatura mensal antecipada — ${pending.description}`,
              sourceType: "financial_record",
              sourceId: paymentRecord.id,
              patientId,
              appointmentId: pending.appointmentId,
              procedureId: pending.procedureId,
              subscriptionId: pending.subscriptionId,
              financialRecordId: paymentRecord.id,
            }, tx as any);
            mainEntryId = settleEntry.id;
            // Aloca contra o recebível antecipado para conciliação.
            await allocateReceivable({
              clinicId: pending.clinicId ?? req.clinicId ?? null,
              paymentEntryId: settleEntry.id,
              receivableEntryId: deferredEntry.id,
              patientId,
              amount: allocationAmount,
              allocatedAt: today,
            }, tx as any);
          } else {
            // Sem adiantamento pré-pago: D Caixa / C Adiantamentos (pós-pago).
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
            mainEntryId = advanceEntry.id;
          }
          primaryEntryId ??= mainEntryId;

          if (allocationAmount >= Number(pending.amount)) {
            await tx
              .update(financialRecordsTable)
              .set({ status: "pago", paymentDate: today, paymentMethod: paymentMethod || null, settlementEntryId: mainEntryId })
              .where(eq(financialRecordsTable.id, pending.id));
            // Promove pool de créditos prepago → disponivel
            const { promotePrepaidCreditsForFinancialRecord } =
              await import("../../clinical/medical-records/treatment-plans.materialization.js");
            await promotePrepaidCreditsForFinancialRecord(pending.id);
          }
          remaining = Math.round((remaining - allocationAmount) * 100) / 100;
          continue;
        }

        // ── faturaMensalAvulso (consolidador de avulsos do mês) ─────────
        // Os filhos (sessões avulsas) já reconheceram receita individualmente.
        // O parent não tem receita própria — posta apenas o settlement
        // (D Caixa / C Recebíveis) e cascateia `pago` para os filhos.
        // Pagamento parcial não cascateia.
        if (pending.transactionType === "faturaMensalAvulso") {
          // Pagamento parcial NÃO cascateia: o parent é apenas um agrupador
          // sem receita própria. Cada filho carrega seu `recognizedEntryId`.
          // Pulamos o parent e deixamos o loop alocar contra os filhos.
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

        // vendaPacote SEM accountingEntryId: registro criado fora do fluxo
        // `postPackageSale` (dados históricos). Usar `postCashAdvance`
        // (D Caixa / C Adiantamentos) — correto para venda de pacote,
        // que é passivo até a execução das sessões. Evita recebível negativo
        // que ocorreria com `postReceivableSettlement` sem entry prévio.
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

        // Registro sem entry de recebível prévia.
        // Distingue entre dados históricos (serviço já prestado, sem registro contábil)
        // e pagamento antecipado de avulso (serviço ainda não prestado).
        //
        // Para registros com `recognizedEntryId` herdado de uma baixa parcial anterior
        // (Fix: o restante do split herda a referência contábil do original), este
        // bloco não é executado — o `receivableEntryId` já está preenchido.
        if (!receivableEntryId && pending.transactionType !== "vendaPacote") {
          // Verifica se o serviço foi prestado consultando o status do agendamento.
          // Se confirmado (compareceu/concluido) → histórico sem contabilização.
          // Se não confirmado ou sem agendamento → pagamento antecipado de avulso.
          let serviceRendered = true; // padrão conservador para tipos sem appointment (histórico)
          if (pending.appointmentId) {
            const [appt] = await (tx as any)
              .select({ status: appointmentsTable.status })
              .from(appointmentsTable)
              .where(eq(appointmentsTable.id, pending.appointmentId))
              .limit(1);
            const confirmedStatuses = ["compareceu", "concluido"];
            serviceRendered = confirmedStatuses.includes(appt?.status ?? "");
          }

          if (serviceRendered) {
            // Dados históricos: serviço prestado sem registro contábil préio.
            // Reconhece receita retroativamente (D Recebíveis / C Receita).
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
          } else {
            // Pagamento antecipado de avulso: serviço ainda não prestado.
            // D Caixa / C Adiantamentos — crédito do cliente, SEM reconhecer receita.
            // A receita será reconhecida quando o agendamento for confirmado
            // (applyBillingRules → postWalletUsage, D Adiantamentos / C Receita).
            const advanceEntry = await postCashAdvance({
              clinicId: pending.clinicId ?? req.clinicId ?? null,
              entryDate: today,
              amount: allocationAmount,
              eventType: "cash_advance_avulso",
              description: `Pagamento antecipado de avulso — ${pending.description}`,
              sourceType: "financial_record",
              sourceId: pending.id,
              patientId,
              appointmentId: pending.appointmentId,
              procedureId: pending.procedureId,
              financialRecordId: pending.id,
            }, tx as any);

            if (allocationAmount >= Number(pending.amount)) {
              await tx
                .update(financialRecordsTable)
                .set({
                  status: "pago",
                  paymentDate: today,
                  paymentMethod: paymentMethod || null,
                  settlementEntryId: advanceEntry.id,
                })
                .where(eq(financialRecordsTable.id, pending.id));
            }
            primaryEntryId ??= advanceEntry.id;
            remaining = Math.round((remaining - allocationAmount) * 100) / 100;
            continue;
          }
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
          // Pós-pagamento de faturaPlano prepago: promove pool mensal
          // `pendentePagamento` → `disponivel`.
          if (pending.transactionType === "faturaPlano") {
            const { promotePrepaidCreditsForFinancialRecord } =
              await import("../../clinical/medical-records/treatment-plans.materialization.js");
            await promotePrepaidCreditsForFinancialRecord(pending.id);
          }
        }

        remaining = Math.round((remaining - allocationAmount) * 100) / 100;
      }

      // PR-FIN7-1 (B8 + B15): saldo remanescente (pago acima das pendências)
      // NÃO é receita imediata — vai para Adiantamentos de Cliente (2.1.1)
      // e é creditado na carteira digital do paciente para uso futuro.
      if (remaining > 0) {
        const advEntry = await postCashAdvance({
          clinicId: req.clinicId ?? null,
          entryDate: today,
          amount: remaining,
          description: description || `Saldo creditado na carteira — ${patient?.name ?? "Paciente"}`,
          sourceType: "financial_record",
          sourceId: paymentRecord.id,
          patientId,
          procedureId: procedureId ? parseInt(String(procedureId)) : null,
          financialRecordId: paymentRecord.id,
        }, tx as any);
        primaryEntryId ??= advEntry.id;

        // Upsert da carteira do paciente.
        const walletClinicId = req.clinicId ?? null;
        const walletConditions: Parameters<typeof and>[0][] = [
          eq(patientWalletTable.patientId, patientId),
        ];
        if (walletClinicId) walletConditions.push(eq(patientWalletTable.clinicId, walletClinicId));

        // PR-FIN8-4 (B14): SELECT … FOR UPDATE serializa upserts concorrentes.
        const [existingWallet] = await tx
          .select()
          .from(patientWalletTable)
          .where(and(...walletConditions))
          .for("update")
          .limit(1);

        let walletId: number;
        if (existingWallet) {
          const newBalance = (Number(existingWallet.balance) + remaining).toFixed(2);
          await tx
            .update(patientWalletTable)
            .set({ balance: newBalance, updatedAt: new Date() })
            .where(eq(patientWalletTable.id, existingWallet.id));
          walletId = existingWallet.id;
        } else {
          const [newWallet] = await tx
            .insert(patientWalletTable)
            .values({ patientId, clinicId: walletClinicId, balance: remaining.toFixed(2) })
            .returning({ id: patientWalletTable.id });
          walletId = newWallet.id;
        }

        await tx.insert(patientWalletTransactionsTable).values({
          walletId,
          patientId,
          clinicId: walletClinicId,
          amount: remaining.toFixed(2),
          type: "credito",
          description:
            description || `Saldo remanescente creditado na carteira — ${patient?.name ?? "Paciente"}`,
          financialRecordId: paymentRecord.id,
        });

        walletCreditedAmount = remaining;
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

    // PR-FIN7-1 (B15): informa o cliente quando saldo foi creditado na carteira.
    const responseBody = walletCreditedAmount > 0
      ? { ...record, walletCredited: walletCreditedAmount }
      : record;
    res.status(201).json(responseBody);
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
