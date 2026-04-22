import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, sessionCreditsTable, clinicsTable,
  patientSubscriptionsTable, patientWalletTable, patientWalletTransactionsTable,
  patientPackagesTable, procedureCostsTable,
} from "@workspace/db";
import { eq, and, gt, sql, desc } from "drizzle-orm";
import { todayBRT } from "../../utils/dateUtils.js";
import {
  postPackageCreditUsage, postReceivableRevenue, postWalletUsage,
} from "../../services/accountingService.js";
import { addDaysToDate, monthRangeFromDate } from "./appointments.helpers.js";
import {
  getWithDetails, resolveMonthlyPackageCreditPolicy, countAbsenceCreditsInMonth,
} from "./appointments.repository.js";

// ─── Billing rules ────────────────────────────────────────────────────────────
export async function applyBillingRules(
  appointmentId: number,
  newStatus: string,
  oldStatus: string,
  clinicId?: number | null
): Promise<void> {
  if (newStatus === oldStatus) return;

  const details = await getWithDetails(appointmentId);
  if (!details || !details.procedure) return;

  const procedure = details.procedure;
  const billingType: string = procedure.billingType ?? "porSessao";
  const patientId = details.patientId;
  const procedureId = details.procedureId;
  const patientName = details.patient?.name ?? "Paciente";
  const today = todayBRT();
  const appointmentDate: string = (details as any).date ?? today;

  const confirmedStatuses = ["compareceu", "concluido"];
  const canceledStatuses = ["cancelado"];
  const absenceCreditStatuses = ["cancelado", "faltou"];

  const resolvedClinicId = clinicId ?? details.clinicId ?? null;

  // Busca prazo de vencimento configurado pela clínica (padrão: 3 dias)
  let clinicDueDays = 3;
  if (resolvedClinicId) {
    const [clinicSettings] = await db
      .select({ defaultDueDays: clinicsTable.defaultDueDays })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, resolvedClinicId))
      .limit(1);
    clinicDueDays = clinicSettings?.defaultDueDays ?? 3;
  }
  const dueDatePorSessao = addDaysToDate(appointmentDate, clinicDueDays);

  // Resolve effective price: clinic override takes precedence over base procedure price
  let effectivePrice = String(procedure.price);
  if (resolvedClinicId && procedureId) {
    const [clinicCostRow] = await db
      .select({ priceOverride: procedureCostsTable.priceOverride })
      .from(procedureCostsTable)
      .where(
        and(
          eq(procedureCostsTable.procedureId, procedureId),
          eq(procedureCostsTable.clinicId, resolvedClinicId)
        )
      )
      .limit(1);
    if (clinicCostRow?.priceOverride) {
      effectivePrice = String(clinicCostRow.priceOverride);
    }
  }

  // ── BILLING: attendance → billing logic by type ────────────────────────────
  if (confirmedStatuses.includes(newStatus) && !confirmedStatuses.includes(oldStatus)) {

    // ── Priority 1: fatura consolidada subscription ────────────────────────
    const consolidatedConditions: any[] = [
      eq(patientSubscriptionsTable.patientId, patientId),
      eq(patientSubscriptionsTable.procedureId, procedureId),
      eq(patientSubscriptionsTable.status, "ativa"),
      eq(patientSubscriptionsTable.subscriptionType, "faturaConsolidada"),
    ];
    if (resolvedClinicId) {
      consolidatedConditions.push(eq(patientSubscriptionsTable.clinicId, resolvedClinicId));
    }

    const [consolidatedSub] = await db
      .select()
      .from(patientSubscriptionsTable)
      .where(and(...consolidatedConditions))
      .limit(1);

    if (consolidatedSub) {
      // Não cobra agora — acumula para a fatura mensal consolidada
      const existingPendente = await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.appointmentId, appointmentId),
            eq(financialRecordsTable.transactionType, "pendenteFatura")
          )
        )
        .limit(1);

      if (existingPendente.length === 0) {
        const [pendingInvoiceItem] = await db.insert(financialRecordsTable).values({
          type:            "receita",
          amount:          effectivePrice,
          description:     `[Aguardando fatura] ${procedure.name} - ${patientName}`,
          category:        procedure.category,
          appointmentId,
          patientId,
          procedureId,
          transactionType: "pendenteFatura",
          status:          "pendente",
          dueDate:         appointmentDate,
          subscriptionId:  consolidatedSub.id,
          clinicId:        resolvedClinicId,
        }).returning();

        const entry = await postReceivableRevenue({
          clinicId: resolvedClinicId,
          entryDate: appointmentDate,
          amount: Number(effectivePrice),
          description: `Receita em fatura consolidada — ${procedure.name} - ${patientName}`,
          sourceType: "financial_record",
          sourceId: pendingInvoiceItem.id,
          patientId,
          appointmentId,
          procedureId,
          subscriptionId: consolidatedSub.id,
          financialRecordId: pendingInvoiceItem.id,
        });

        await db
          .update(financialRecordsTable)
          .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
          .where(eq(financialRecordsTable.id, pendingInvoiceItem.id));
      }
      return;
    }

    // ── Priority 2: por sessão (crédito de sessão → carteira → a receber) ──
    if (billingType === "porSessao") {
      await db.transaction(async (tx) => {
        // 2a. Verifica créditos de sessão
        const availableCredit = await tx
          .select()
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              gt(sql`${sessionCreditsTable.quantity} - ${sessionCreditsTable.usedQuantity}`, 0)
            )
          )
          .limit(1);

        if (availableCredit.length > 0) {
          const credit = availableCredit[0];
          await tx
            .update(sessionCreditsTable)
            .set({ usedQuantity: credit.usedQuantity + 1 })
            .where(eq(sessionCreditsTable.id, credit.id));

          if (credit.patientPackageId) {
            const [patientPackage] = await tx
              .select({ usedSessions: patientPackagesTable.usedSessions, totalSessions: patientPackagesTable.totalSessions, price: patientPackagesTable.price })
              .from(patientPackagesTable)
              .where(eq(patientPackagesTable.id, credit.patientPackageId))
              .limit(1);

            if (patientPackage && patientPackage.usedSessions < patientPackage.totalSessions) {
              await tx
                .update(patientPackagesTable)
                .set({ usedSessions: patientPackage.usedSessions + 1 })
                .where(eq(patientPackagesTable.id, credit.patientPackageId));
            }
          }

          const [creditUsageRecord] = await tx.insert(financialRecordsTable).values({
            type:            "receita",
            amount:          "0",
            description:     `Uso de crédito #${credit.id} — ${procedure.name} - ${patientName}`,
            category:        procedure.category,
            appointmentId,
            patientId,
            procedureId,
            transactionType: "usoCredito",
            status:          "pago",
            dueDate:         today,
            clinicId:        resolvedClinicId,
          }).returning();

          if (credit.patientPackageId) {
            const [packageForRevenue] = await tx
              .select({ price: patientPackagesTable.price, totalSessions: patientPackagesTable.totalSessions, usedSessions: patientPackagesTable.usedSessions })
              .from(patientPackagesTable)
              .where(eq(patientPackagesTable.id, credit.patientPackageId))
              .limit(1);

            const unitAmount = packageForRevenue && packageForRevenue.totalSessions > 0
              ? Number(packageForRevenue.price) / packageForRevenue.totalSessions
              : 0;

            if (unitAmount > 0) {
              const entry = await postPackageCreditUsage({
                clinicId: resolvedClinicId,
                entryDate: appointmentDate,
                amount: unitAmount,
                description: `Receita reconhecida por crédito — ${procedure.name} - ${patientName}`,
                sourceType: "session_credit",
                sourceId: credit.id,
                patientId,
                appointmentId,
                procedureId,
                patientPackageId: credit.patientPackageId,
                financialRecordId: creditUsageRecord.id,
              }, tx as any);

              await tx
                .update(financialRecordsTable)
                .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
                .where(eq(financialRecordsTable.id, creditUsageRecord.id));
            }
          }
          return;
        }

        // 2b. Verifica carteira de crédito (R$)
        if (resolvedClinicId) {
          const [wallet] = await tx
            .select()
            .from(patientWalletTable)
            .where(
              and(
                eq(patientWalletTable.patientId, patientId),
                eq(patientWalletTable.clinicId, resolvedClinicId)
              )
            )
            .limit(1);

          if (wallet && Number(wallet.balance) >= Number(effectivePrice)) {
            const newBalance = (Number(wallet.balance) - Number(effectivePrice)).toFixed(2);

            await tx
              .update(patientWalletTable)
              .set({ balance: newBalance, updatedAt: new Date() })
              .where(eq(patientWalletTable.id, wallet.id));

            const [fr] = await tx.insert(financialRecordsTable).values({
              type:            "receita",
              amount:          effectivePrice,
              description:     `Débito carteira — ${procedure.name} - ${patientName}`,
              category:        procedure.category,
              appointmentId,
              patientId,
              procedureId,
              transactionType: "usoCarteira",
              status:          "pago",
              dueDate:         today,
              clinicId:        resolvedClinicId,
            }).returning();

            const [walletTransaction] = await tx.insert(patientWalletTransactionsTable).values({
              walletId:          wallet.id,
              patientId,
              clinicId:          resolvedClinicId,
              amount:            `-${effectivePrice}`,
              type:              "debito",
              description:       `Sessão: ${procedure.name} — consulta #${appointmentId}`,
              appointmentId,
              financialRecordId: fr.id,
            }).returning();

            const entry = await postWalletUsage({
              clinicId: resolvedClinicId,
              entryDate: appointmentDate,
              amount: Number(effectivePrice),
              description: `Receita por uso de carteira — ${procedure.name} - ${patientName}`,
              sourceType: "patient_wallet_transaction",
              sourceId: walletTransaction.id,
              patientId,
              appointmentId,
              procedureId,
              walletTransactionId: walletTransaction.id,
              financialRecordId: fr.id,
            }, tx as any);

            await tx
              .update(financialRecordsTable)
              .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
              .where(eq(financialRecordsTable.id, fr.id));
            return;
          }
        }

        // 2c. Gera lançamento a receber com vencimento 3 dias após a sessão
        const existing = await tx
          .select()
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.appointmentId, appointmentId),
              eq(financialRecordsTable.transactionType, "creditoAReceber")
            )
          )
          .limit(1);

        if (existing.length === 0) {
          const [receivableRecord] = await tx.insert(financialRecordsTable).values({
            type:            "receita",
            amount:          effectivePrice,
            description:     `${procedure.name} - ${patientName}`,
            category:        procedure.category,
            appointmentId,
            patientId,
            procedureId,
            transactionType: "creditoAReceber",
            status:          "pendente",
            dueDate:         dueDatePorSessao,
            clinicId:        resolvedClinicId,
          }).returning();

          const entry = await postReceivableRevenue({
            clinicId: resolvedClinicId,
            entryDate: appointmentDate,
            amount: Number(effectivePrice),
            description: `A receber por sessão — ${procedure.name} - ${patientName}`,
            sourceType: "financial_record",
            sourceId: receivableRecord.id,
            patientId,
            appointmentId,
            procedureId,
            financialRecordId: receivableRecord.id,
          }, tx as any);

          await tx
            .update(financialRecordsTable)
            .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
            .where(eq(financialRecordsTable.id, receivableRecord.id));
        }
      });
    }
  }

  // ── ROLLBACK: compareceu/concluido → cancelado → cancela lançamentos pendentes
  if (canceledStatuses.includes(newStatus) && confirmedStatuses.includes(oldStatus)) {
    await db
      .update(financialRecordsTable)
      .set({ status: "cancelado" })
      .where(
        and(
          eq(financialRecordsTable.appointmentId, appointmentId),
          sql`${financialRecordsTable.transactionType} IN ('creditoAReceber', 'pendenteFatura')`,
          eq(financialRecordsTable.status, "pendente")
        )
      );

    // Estorna uso de carteira se aplicável
    const walletUsage = await db
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.appointmentId, appointmentId),
          eq(financialRecordsTable.transactionType, "usoCarteira"),
          eq(financialRecordsTable.status, "pago")
        )
      )
      .limit(1);

    if (walletUsage.length > 0 && resolvedClinicId) {
      const fr = walletUsage[0];
      const [wallet] = await db
        .select()
        .from(patientWalletTable)
        .where(
          and(
            eq(patientWalletTable.patientId, patientId),
            eq(patientWalletTable.clinicId, resolvedClinicId)
          )
        )
        .limit(1);

      if (wallet) {
        const restoredBalance = (Number(wallet.balance) + Number(fr.amount)).toFixed(2);
        await db
          .update(patientWalletTable)
          .set({ balance: restoredBalance, updatedAt: new Date() })
          .where(eq(patientWalletTable.id, wallet.id));

        await db.insert(patientWalletTransactionsTable).values({
          walletId:          wallet.id,
          patientId,
          clinicId:          resolvedClinicId,
          amount:            String(fr.amount),
          type:              "estorno",
          description:       `Estorno de cancelamento — consulta #${appointmentId}`,
          appointmentId,
          financialRecordId: fr.id,
        });

        await db
          .update(financialRecordsTable)
          .set({ status: "estornado" })
          .where(eq(financialRecordsTable.id, fr.id));
      }
    }

    const creditUsage = await db
      .select()
      .from(financialRecordsTable)
      .where(
        and(
          eq(financialRecordsTable.appointmentId, appointmentId),
          eq(financialRecordsTable.transactionType, "usoCredito"),
          eq(financialRecordsTable.status, "pago")
        )
      )
      .limit(1);

    if (creditUsage.length > 0) {
      await db.transaction(async (tx) => {
        const [credit] = await tx
          .select()
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              gt(sessionCreditsTable.usedQuantity, 0)
            )
          )
          .orderBy(desc(sessionCreditsTable.createdAt))
          .limit(1);

        if (credit) {
          await tx
            .update(sessionCreditsTable)
            .set({ usedQuantity: Math.max(0, credit.usedQuantity - 1) })
            .where(eq(sessionCreditsTable.id, credit.id));

          if (credit.patientPackageId) {
            const [patientPackage] = await tx
              .select({ usedSessions: patientPackagesTable.usedSessions })
              .from(patientPackagesTable)
              .where(eq(patientPackagesTable.id, credit.patientPackageId))
              .limit(1);

            if (patientPackage && patientPackage.usedSessions > 0) {
              await tx
                .update(patientPackagesTable)
                .set({ usedSessions: patientPackage.usedSessions - 1 })
                .where(eq(patientPackagesTable.id, credit.patientPackageId));
            }
          }
        }

        await tx
          .update(financialRecordsTable)
          .set({ status: "estornado" })
          .where(eq(financialRecordsTable.id, creditUsage[0].id));
      });
    }
  }

  // ── BILLING: absence/cancellation on monthly plan → generate limited session credit ─────────
  if (absenceCreditStatuses.includes(newStatus) && !absenceCreditStatuses.includes(oldStatus) && !confirmedStatuses.includes(oldStatus)) {
    if (billingType === "mensal") {
      await db.transaction(async (tx) => {
        const { patientPackageId, absenceCreditLimit } = await resolveMonthlyPackageCreditPolicy(tx, patientId, procedureId, resolvedClinicId);
        if (absenceCreditLimit !== null) {
          if (absenceCreditLimit <= 0) {
            await tx.insert(financialRecordsTable).values({
              type:            "receita",
              amount:          "0",
              description:     `Crédito não gerado — limite de faltas zerado — ${procedure.name} - ${patientName}`,
              category:        procedure.category,
              appointmentId,
              patientId,
              procedureId,
              transactionType: "creditoSessao",
              status:          "cancelado",
              dueDate:         today,
              clinicId:        resolvedClinicId,
            });
            return;
          }

          const { startDate, endDate } = monthRangeFromDate(appointmentDate);
          const alreadyGranted = await countAbsenceCreditsInMonth(tx, patientId, procedureId, startDate, endDate, resolvedClinicId);
          if (alreadyGranted >= absenceCreditLimit) {
            await tx.insert(financialRecordsTable).values({
              type:            "receita",
              amount:          "0",
              description:     `Crédito não gerado — limite mensal de ${absenceCreditLimit} falta(s) atingido — ${procedure.name} - ${patientName}`,
              category:        procedure.category,
              appointmentId,
              patientId,
              procedureId,
              transactionType: "creditoSessao",
              status:          "cancelado",
              dueDate:         today,
              clinicId:        resolvedClinicId,
            });
            return;
          }
        }

        await tx
          .insert(sessionCreditsTable)
          .values({
            patientId,
            procedureId,
            quantity: 1,
            usedQuantity: 0,
            sourceAppointmentId: appointmentId,
            patientPackageId,
            clinicId: resolvedClinicId,
            notes: `Crédito por ${newStatus === "faltou" ? "falta" : "cancelamento"} — ${procedure.name}`,
          });

        await tx.insert(financialRecordsTable).values({
          type:            "receita",
          amount:          "0",
            description:     `Crédito de sessão gerado por ${newStatus === "faltou" ? "falta" : "cancelamento"} — ${procedure.name} - ${patientName}`,
          category:        procedure.category,
          appointmentId,
          patientId,
          procedureId,
          transactionType: "creditoSessao",
          status:          "pago",
          dueDate:         today,
          clinicId:        resolvedClinicId,
        });
      });
    }
  }

  // ── ROLLBACK: faltou → agendado → cancel no-show fee if pending ───────────
  if (newStatus === "agendado" && oldStatus === "faltou") {
    await db
      .update(financialRecordsTable)
      .set({ status: "cancelado" })
      .where(
        and(
          eq(financialRecordsTable.appointmentId, appointmentId),
          eq(financialRecordsTable.transactionType, "taxaNoShow"),
          eq(financialRecordsTable.status, "pendente")
        )
      );
  }

  // ── ROLLBACK: absence/cancellation → active state → remove available absence credit ───────────
  if (["agendado", "remarcado"].includes(newStatus) && absenceCreditStatuses.includes(oldStatus)) {
    await db.transaction(async (tx) => {
      const [credit] = await tx
        .select()
        .from(sessionCreditsTable)
        .where(
          and(
            eq(sessionCreditsTable.sourceAppointmentId, appointmentId),
            eq(sessionCreditsTable.patientId, patientId),
            eq(sessionCreditsTable.procedureId, procedureId)
          )
        )
        .limit(1);

      if (credit) {
        await tx
          .update(sessionCreditsTable)
          .set({ quantity: credit.usedQuantity })
          .where(eq(sessionCreditsTable.id, credit.id));
      }

      await tx
        .update(financialRecordsTable)
        .set({ status: "cancelado" })
        .where(
          and(
            eq(financialRecordsTable.appointmentId, appointmentId),
            eq(financialRecordsTable.transactionType, "creditoSessao")
          )
        );
    });
  }
}
