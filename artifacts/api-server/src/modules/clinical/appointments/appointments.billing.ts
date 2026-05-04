import { db } from "@workspace/db";
import {
  appointmentsTable, financialRecordsTable, sessionCreditsTable,
  patientWalletTable, patientWalletTransactionsTable,
  patientPackagesTable, treatmentPlansTable, packagesTable, clinicsTable,
} from "@workspace/db";
import { eq, and, gt, sql, asc, desc, inArray } from "drizzle-orm";
import { todayBRT } from "../../../utils/dateUtils.js";
import {
  postPackageCreditUsage, postReceivableRevenue, postWalletUsage, resolveAccountCodeById,
} from "../../shared/accounting/accounting.service.js";
import { recognizeMonthlyInvoiceRevenuePartial } from "../medical-records/treatment-plans.revenue-recognition.js";
import { addDaysToDate, monthRangeFromDate } from "./appointments.helpers.js";
import {
  getWithDetails, resolveMonthlyPackageCreditPolicy, countAbsenceCreditsInMonth,
} from "./appointments.repository.js";
import { resolveEffectivePrice } from "./appointments.pricing.js";
import { ensureAutoEvolutionForAppointment } from "../medical-records/medical-records.repository.js";
import { getClinicFinancialSettings } from "../../financial/settings/clinic-financial-settings.service.js";
import type { AppointmentStatus } from "@workspace/shared-constants";

// ─── Política de validade de créditos ────────────────────────────────────────
/**
 * Resolve a validade (em dias) do crédito de reposição (falta/remarcação)
 * para um plano de tratamento. Hierarquia:
 *   1. `treatment_plans.replacement_credit_validity_days` (override do plano)
 *   2. `packages.replacement_credit_validity_days` (default do pacote)
 *   3. 30 dias (fallback do sistema)
 */
async function resolveReplacementValidityDays(
  treatmentPlanId: number | null,
  patientPackageId?: number | null,
): Promise<number> {
  if (treatmentPlanId) {
    const [plan] = await db
      .select({
        override: treatmentPlansTable.replacementCreditValidityDays,
      })
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.id, treatmentPlanId))
      .limit(1);
    if (plan?.override != null) return plan.override;
  }

  if (patientPackageId) {
    const [pkg] = await db
      .select({ days: packagesTable.replacementCreditValidityDays })
      .from(patientPackagesTable)
      .innerJoin(packagesTable, eq(packagesTable.id, patientPackagesTable.packageId))
      .where(eq(patientPackagesTable.id, patientPackageId))
      .limit(1);
    if (pkg?.days != null) return pkg.days;
  }

  return 30;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Política de cancelamento com janela de antecedência ─────────────────────
//
// Resolve a política aplicável a um cancelamento:
//   • janela = `clinics.cancellation_window_hours` (default 24)
//   • política = `clinics.late_cancellation_policy` (default "creditoNormal")
//
// Se não há clínica resolvida ou o appointment está SEM hora de início,
// a política é "creditoNormal" (comportamento legado).
//
// `late = true` quando faltam menos de `windowHours` horas para o
// horário do appointment (em BRT). Para cancelamentos com `appointmentDate`
// no passado, `late = true` (o paciente já passou da janela).
type LateCancellationPolicy = "creditoNormal" | "semCredito" | "taxa";

interface CancellationDecision {
  isLate: boolean;
  policy: LateCancellationPolicy;
  windowHours: number;
}

async function resolveCancellationDecision(
  clinicId: number | null,
  newStatus: string,
  oldStatus: string,
  appointmentDate: string,
  appointmentStartTime: string | null,
): Promise<CancellationDecision> {
  // Política só importa para cancelamentos saindo de estado ativo.
  // No-show ("faltou") é por definição além da janela e não é coberto aqui.
  const isCancel = newStatus === "cancelado" && (oldStatus === "agendado" || oldStatus === "confirmado");
  let windowHours = 24;
  let policy: LateCancellationPolicy = "creditoNormal";
  if (clinicId) {
    const [clinic] = await db
      .select({
        windowHours: clinicsTable.cancellationWindowHours,
        policy: clinicsTable.lateCancellationPolicy,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    if (clinic) {
      if (typeof clinic.windowHours === "number") windowHours = clinic.windowHours;
      const p = clinic.policy as LateCancellationPolicy | null;
      if (p === "semCredito" || p === "taxa" || p === "creditoNormal") policy = p;
    }
  }
  if (!isCancel) return { isLate: false, policy, windowHours };

  // Calcula horas restantes (apptStart - now) em BRT (Sao_Paulo).
  // Comparação SQL pois o servidor pode estar em outro fuso.
  const startTime = appointmentStartTime ?? "00:00";
  const [{ hoursUntil }] = await db.execute<{ hoursUntil: number | null }>(
    sql`SELECT EXTRACT(EPOCH FROM (
          (${appointmentDate}::date + ${startTime}::time)
          - (NOW() AT TIME ZONE 'America/Sao_Paulo')
        )) / 3600.0 AS "hoursUntil"`,
  ) as unknown as [{ hoursUntil: number | null }];
  const hours = typeof hoursUntil === "number" ? hoursUntil : 0;
  const isLate = hours < windowHours;
  return { isLate, policy, windowHours };
}

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

  // satisfies garante que só valores válidos de AppointmentStatus são usados
  const confirmedStatuses: string[] = ["compareceu", "concluido"] satisfies AppointmentStatus[];
  const canceledStatuses: string[] = ["cancelado"] satisfies AppointmentStatus[];
  const absenceCreditStatuses: string[] = ["cancelado", "faltou"] satisfies AppointmentStatus[];

  const resolvedClinicId = clinicId ?? details.clinicId ?? null;

  // ── Refator pós-sprint financeiro: planos materializados ─────────────────
  // Se o appointment foi gerado pela materialização do plano de tratamento
  // (`treatment_plan_procedure_id` preenchido), o financeiro já está
  // resolvido pela fatura mensal pré-criada. O billing engine se torna
  // NO-OP para presença/conclusão e gera apenas crédito de sessão para faltas.
  const planProcId: number | null = (details as any).treatmentPlanProcedureId ?? null;
  if (planProcId) {
    // Sprint Financeiro 13 (P4) — Resolução lazy do `monthlyInvoiceId`
    // para itens avulso do plano (cuja materialização não vincula a fatura).
    // Procuramos a `faturaPlanoAvulsoMensal` para o (item, mês de competência)
    // dessa sessão. Se existir, o reconhecimento segue o mesmo fluxo P3.
    let resolvedMonthlyInvoiceId: number | null =
      (details as any).monthlyInvoiceId ?? null;
    if (resolvedMonthlyInvoiceId == null) {
      const apptMonthStart = monthRangeFromDate(appointmentDate).startDate;
      const [avulsoInvoice] = await db
        .select({ id: financialRecordsTable.id })
        .from(financialRecordsTable)
        .where(
          and(
            eq(financialRecordsTable.treatmentPlanProcedureId, planProcId),
            eq(financialRecordsTable.transactionType, "faturaPlanoAvulsoMensal"),
            eq(financialRecordsTable.planMonthRef, apptMonthStart),
          ),
        )
        .orderBy(financialRecordsTable.id)
        .limit(1);
      if (avulsoInvoice) {
        resolvedMonthlyInvoiceId = avulsoInvoice.id;
      }
    }
    (details as any).monthlyInvoiceId = resolvedMonthlyInvoiceId;
    const confirmedSet: string[] = ["compareceu", "concluido"] satisfies AppointmentStatus[];
    const absenceSet: string[] = ["faltou"] satisfies AppointmentStatus[];

    if (confirmedSet.includes(newStatus) && !confirmedSet.includes(oldStatus)) {
      // Garante a evolução clínica.
      try {
        await ensureAutoEvolutionForAppointment(
          patientId,
          appointmentId,
          (procedure as any)?.durationMinutes ?? null,
        );
      } catch (err) {
        console.error("[applyBillingRules] failed to create auto evolution:", err);
      }

      // ── Reconhecimento de receita por entrega ───────────────────────────
      // mensalConsolidado: reconhece a fatura mensal estimada (faturaPlanoAvulsoMensal)
      // na 1ª confirmação do mês. Idempotente.
      //
      // porSessao: não há fatura mensal pré-criada → monthlyInvoiceId é null.
      // Neste caso NÃO retornamos — o código cai para o billing por sessão
      // padrão (Priority 2) logo abaixo do bloco `if (planProcId)`.
      const monthlyInvoiceId: number | null =
        (details as any).monthlyInvoiceId ?? null;
      if (monthlyInvoiceId) {
        try {
          await recognizeMonthlyInvoiceRevenuePartial({
            monthlyInvoiceId,
            appointmentId,
            appointmentDate,
          });
        } catch (err) {
          console.error(
            `[applyBillingRules] failed to recognize monthly revenue — invoiceId=${monthlyInvoiceId} appointmentId=${appointmentId}:`,
            err,
          );
        }
        return; // mensalConsolidado: encerrado aqui
      }
      // porSessao: não retorna — cai para per-session billing abaixo
    } else if (absenceSet.includes(newStatus) && !absenceSet.includes(oldStatus)) {
      // Falta em plano materializado SEMPRE gera crédito de sessão (a vaga
      // foi paga, o paciente tem direito a remarcar). Não há estorno.
      const { sessionCreditsTable: scTable } = await import("@workspace/db");
      // Idempotência: evita criar dois créditos se o status oscilar.
      const existing = await db
        .select({ id: scTable.id })
        .from(scTable)
        .where(eq(scTable.sourceAppointmentId, appointmentId))
        .limit(1);
      if (existing.length === 0 && procedureId) {
        const planId = (details as any).treatmentPlanId ?? null;
        const validityDays = await resolveReplacementValidityDays(planId, null);
        const validUntil = addDaysISO(appointmentDate, validityDays);
        await db.insert(scTable).values({
          patientId,
          procedureId,
          quantity: 1,
          usedQuantity: 0,
          sourceAppointmentId: appointmentId,
          clinicId: resolvedClinicId,
          origin: "reposicaoFalta",
          status: "disponivel",
          validUntil,
          notes: `Falta em ${appointmentDate} — plano #${planId ?? planProcId}. Crédito de reposição válido até ${validUntil}.`,
        });
      }
      return;
    // ── Cancelamento em plano materializado ──────────────────────────────
    // Cancelamentos respeitam a janela `cancellationWindowHours` da clínica.
    // Quando dentro da janela e a política for `semCredito`/`taxa`, NÃO gera
    // o crédito de reposição padrão (e taxa fica para o roadmap futuro).
    } else if (newStatus === "cancelado" && (oldStatus === "agendado" || oldStatus === "confirmado")) {
      const startTime = (details as any).startTime ?? null;
      const decision = await resolveCancellationDecision(
        resolvedClinicId,
        newStatus,
        oldStatus,
        appointmentDate,
        startTime,
      );

      if (procedureId) {
        const { sessionCreditsTable: scTable } = await import("@workspace/db");
        const existing = await db
          .select({ id: scTable.id })
          .from(scTable)
          .where(eq(scTable.sourceAppointmentId, appointmentId))
          .limit(1);
        if (existing.length === 0) {
          const planId = (details as any).treatmentPlanId ?? null;
          const validityDays = await resolveReplacementValidityDays(planId, null);
          const validUntil = addDaysISO(appointmentDate, validityDays);

          if (!decision.isLate || decision.policy === "creditoNormal") {
            await db.insert(scTable).values({
              patientId,
              procedureId,
              quantity: 1,
              usedQuantity: 0,
              sourceAppointmentId: appointmentId,
              clinicId: resolvedClinicId,
              origin: "reposicaoRemarcacao",
              status: "disponivel",
              validUntil,
              notes:
                `Cancelamento em ${appointmentDate}` +
                (decision.isLate
                  ? ` (dentro da janela de ${decision.windowHours}h, política=creditoNormal)`
                  : ` (fora da janela de ${decision.windowHours}h)`) +
                `. Crédito de reposição válido até ${validUntil}.`,
            });
          } else {
            // Política `semCredito` ou `taxa`: deixa marca contábil "0,00"
            // como auditoria do bloqueio. Implementação de cobrança de taxa
            // fica para módulo de no-show fee.
            await db.insert(financialRecordsTable).values({
              type: "receita",
              amount: "0",
              description:
                `Crédito não gerado — cancelamento dentro da janela de ${decision.windowHours}h ` +
                `(política=${decision.policy}) — ${procedure.name} - ${patientName}`,
              category: procedure.category,
              appointmentId,
              patientId,
              procedureId,
              transactionType: "creditoSessao",
              status: "cancelado",
              dueDate: today,
              clinicId: resolvedClinicId,
            });
          }
        }
      }
      return;
    // ── Modelo "1ª sessão = 100%": SEM estorno em planos materializados ──────
    //
    // A receita mensal é reconhecida INTEGRALMENTE na 1ª confirmação do mês
    // (fato gerador = competência do mês contratado). Quando uma sessão sai
    // do estado confirmado — por reagendamento, correção ou cancelamento —
    // a receita NÃO é estornada, pois o vínculo é com o mês/fatura, não com
    // a sessão individual. Créditos de sessão garantem o direito do paciente
    // à reposição sem impacto no resultado contábil do mês.
    } else if (!confirmedSet.includes(newStatus) && confirmedSet.includes(oldStatus)) {
      return; // no-op — receita permanece reconhecida pela competência do mês
    } else if (!confirmedSet.includes(newStatus)) {
      // Outros status (agendado→agendado etc.) — no-op.
      return;
    }
    // Chegando aqui: confirmado sem fatura mensal (avulsoBillingMode=porSessao).
    // Cai para o billing por sessão padrão abaixo.
  }

  // Busca prazo de vencimento configurado pela clínica (padrão: 3 dias).
  // Fallback automático para `clinics.default_due_days` quando não há settings.
  let clinicDueDays = 3;
  if (resolvedClinicId) {
    const settings = await getClinicFinancialSettings(resolvedClinicId);
    clinicDueDays = settings.defaultDueDays;
  }
  const dueDatePorSessao = addDaysToDate(appointmentDate, clinicDueDays);

  // Resolve effective price aplicando a hierarquia oficial:
  //   1) plano de tratamento ativo do paciente (com desconto)
  //   2) override de preço da clínica (procedure_costs.priceOverride)
  //   3) preço de tabela do procedimento
  // Ver: artifacts/api-server/src/modules/clinical/appointments/appointments.pricing.ts
  const priceResolution = await resolveEffectivePrice(patientId, procedureId, resolvedClinicId, appointmentDate);
  const effectivePrice = priceResolution.effectivePrice;
  const priceAuditFields = {
    priceSource: priceResolution.priceSource,
    originalUnitPrice: priceResolution.originalUnitPrice,
    treatmentPlanId: priceResolution.treatmentPlanId,
  };

  // Categorização contábil por procedimento.
  // Se o procedimento tem sub-conta de receita (`procedures.accounting_account_id`),
  // resolve o código e propaga para todos os postings de receita.
  // Fallback automático para a conta padrão (`4.1.1`/`4.1.2`) quando ausente.
  const procedureRevenueAccountCode = await resolveAccountCodeById(
    (procedure as any).accountingAccountId ?? null,
    "4.1.1", // ACCOUNT_CODES.serviceRevenue (default)
    resolvedClinicId,
  );
  const procedurePackageRevenueAccountCode = await resolveAccountCodeById(
    (procedure as any).accountingAccountId ?? null,
    "4.1.2", // ACCOUNT_CODES.packageRevenue (default)
    resolvedClinicId,
  );

  // ── BILLING: attendance → billing logic by type ────────────────────────────
  if (confirmedStatuses.includes(newStatus) && !confirmedStatuses.includes(oldStatus)) {

    // Cria stub de evolução clínica automática (idempotente por appointmentId).
    // Falhas aqui não devem bloquear o billing — apenas logar.
    try {
      await ensureAutoEvolutionForAppointment(
        patientId,
        appointmentId,
        (procedure as any)?.durationMinutes ?? null,
      );
    } catch (err) {
      console.error("[applyBillingRules] failed to create auto evolution:", err);
    }

    // ── Priority 1 (retrocompatibilidade): faturaConsolidada via patient_packages ──
    // O tipo `faturaConsolidada` foi descontinuado da UI; novos planos usam
    // `faturaPlano` via materialização. Este bloco preserva o comportamento
    // para pacientes com `patient_packages.recurrenceType='faturaConsolidada'`
    // já existentes no banco (dados históricos migrados ou criados por acesso
    // direto). Não cria novos registros deste tipo para planos novos.
    //
    // BUG-FIX: agendamentos de planos materializados (planProcId preenchido)
    // com avulsoBillingMode='porSessao' caíam aqui erroneamente porque
    // resolveEffectivePrice devolvia 'plano_mensal_proporcional' (item num
    // pacote mensal), fazendo o Priority 1 auto-criar uma faturaConsolidada e
    // retornar antes do Priority 2 (creditoAReceber). Planos materializados
    // devem pular o Priority 1 e ir direto ao Priority 2 (porSessao).
    if (!planProcId) {
      const pkgConditions: any[] = [
        eq(patientPackagesTable.patientId, patientId),
        eq(patientPackagesTable.procedureId, procedureId),
        eq(patientPackagesTable.recurrenceStatus, "ativa"),
        eq(patientPackagesTable.recurrenceType, "faturaConsolidada"),
      ];
      if (resolvedClinicId) {
        pkgConditions.push(eq(patientPackagesTable.clinicId, resolvedClinicId));
      }

      let [recurringPkg] = await db
        .select()
        .from(patientPackagesTable)
        .where(and(...pkgConditions))
        .orderBy(desc(patientPackagesTable.createdAt))
        .limit(1);

      if (!recurringPkg && priceResolution.priceSource === "plano_mensal_proporcional" && priceResolution.monthlyPlan) {
        const monthly = priceResolution.monthlyPlan;
        const startDate = monthly.monthStartDate;
        const [created] = await db
          .insert(patientPackagesTable)
          .values({
            patientId,
            packageId: monthly.packageId ?? null,
            procedureId,
            name: `Pacote mensal — ${procedure.name} (${patientName})`,
            totalSessions: 0,
            usedSessions: 0,
            sessionsPerWeek: 1,
            startDate,
            price: monthly.monthlyAmount,
            paymentStatus: "pendente",
            clinicId: resolvedClinicId,
            notes: `Auto-criado a partir do plano #${priceResolution.treatmentPlanId} (pacote mensal #${monthly.packageId})`,
            billingDay: monthly.billingDay,
            monthlyAmount: monthly.monthlyAmount,
            recurrenceStatus: "ativa",
            recurrenceType: "faturaConsolidada",
          })
          .returning();
        recurringPkg = created;
      }

      if (recurringPkg) {
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
            type:             "receita",
            amount:           effectivePrice,
            description:      `[Aguardando fatura] ${procedure.name} - ${patientName}`,
            category:         procedure.category,
            appointmentId,
            patientId,
            procedureId,
            transactionType:  "pendenteFatura",
            status:           "pendente",
            dueDate:          appointmentDate,
            patientPackageId: recurringPkg.id,
            clinicId:         resolvedClinicId,
            ...priceAuditFields,
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
            patientPackageId: recurringPkg.id,
            financialRecordId: pendingInvoiceItem.id,
            revenueAccountCode: procedureRevenueAccountCode,
          });

          await db
            .update(financialRecordsTable)
            .set({ recognizedEntryId: entry.id, accountingEntryId: entry.id })
            .where(eq(financialRecordsTable.id, pendingInvoiceItem.id));
        }
        return;
      }
    }

    // ── Priority 2: por sessão (crédito de sessão → carteira → a receber) ──
    if (billingType === "porSessao") {
      await db.transaction(async (tx) => {
        // 2a. Verifica créditos de sessão (FIFO por vencimento)
        // Apenas créditos `disponivel` e ainda não vencidos. Pendentes de
        // pagamento (modo prepago) e expirados ficam fora.
        const todayISO = todayBRT();
        const availableCredit = await tx
          .select()
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              eq(sessionCreditsTable.status, "disponivel"),
              gt(sql`${sessionCreditsTable.quantity} - ${sessionCreditsTable.usedQuantity}`, 0),
              sql`(${sessionCreditsTable.validUntil} IS NULL OR ${sessionCreditsTable.validUntil} >= ${todayISO}::date)`
            )
          )
          .orderBy(
            sql`${sessionCreditsTable.validUntil} ASC NULLS LAST`,
            asc(sessionCreditsTable.id),
          )
          .limit(1);

        if (availableCredit.length > 0) {
          const credit = availableCredit[0];
          const newUsed = credit.usedQuantity + 1;
          // Se este consumo zera o saldo da linha, marcar como `consumido`.
          const becameFullyConsumed = newUsed >= credit.quantity;
          await tx
            .update(sessionCreditsTable)
            .set({
              usedQuantity: newUsed,
              consumedByAppointmentId: appointmentId,
              ...(becameFullyConsumed ? { status: "consumido" as const } : {}),
            })
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
            ...priceAuditFields,
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
                revenueAccountCode: procedurePackageRevenueAccountCode,
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
        // PR-FIN8-4 (B14): SELECT … FOR UPDATE serializa débitos concorrentes
        // sobre a mesma carteira. Sem o lock, dois confirms simultâneos liam
        // o mesmo saldo e debitavam em dobro (race window entre SELECT e UPDATE).
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
            .for("update")
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
              ...priceAuditFields,
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
              revenueAccountCode: procedureRevenueAccountCode,
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
          // Roll-up de avulsos: quando o paciente está num plano aceito, vincula
          // esta linha à `faturaPlano` do mês (`parent_record_id`). Ao pagar a
          // fatura mensal, todos os filhos são marcados em cascata. Sem
          // `faturaPlano` (plano só com itens avulso), `parentRecordId` fica null
          // e o item é consolidado por `closeAvulsoMonth` em `faturaMensalAvulso`.
          let parentRecordId: number | null = null;
          const apptMonthRef = priceResolution.treatmentPlanId
            ? monthRangeFromDate(appointmentDate).startDate
            : null;
          if (priceResolution.treatmentPlanId) {
            // Busca determinística do parent: ordena por id ASC para que
            // execuções concorrentes sempre escolham o MESMO parent quando
            // houver múltiplas `faturaPlano` no mesmo mês.
            const [parentInvoice] = await tx
              .select({ id: financialRecordsTable.id })
              .from(financialRecordsTable)
              .where(
                and(
                  eq(financialRecordsTable.treatmentPlanId, priceResolution.treatmentPlanId),
                  eq(financialRecordsTable.transactionType, "faturaPlano"),
                  eq(financialRecordsTable.planMonthRef, apptMonthRef!),
                ),
              )
              .orderBy(financialRecordsTable.id)
              .limit(1);
            if (parentInvoice) parentRecordId = parentInvoice.id;
          }

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
            parentRecordId,
            // Sempre persiste a competência para lançamentos de plano (com ou
            // sem parent). Sem isso, a consolidação mensal de avulsos
            // (`closeAvulsoMonth`) cai no fallback de `dueDate`, que vaza
            // para o mês seguinte em sessões dos últimos dias.
            ...(apptMonthRef ? { planMonthRef: apptMonthRef } : {}),
            ...priceAuditFields,
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
            revenueAccountCode: procedureRevenueAccountCode,
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
      // PR-FIN8-4 (B14): estorno da carteira agora roda em transação ACID com
      // SELECT … FOR UPDATE. Antes, SELECT + UPDATE em conexões separadas
      // permitia perder o crédito se outro débito concorrente lesse o mesmo
      // saldo entre as duas chamadas.
      await db.transaction(async (tx) => {
        const [wallet] = await tx
          .select()
          .from(patientWalletTable)
          .where(
            and(
              eq(patientWalletTable.patientId, patientId),
              eq(patientWalletTable.clinicId, resolvedClinicId)
            )
          )
          .for("update")
          .limit(1);

        if (wallet) {
          const restoredBalance = (Number(wallet.balance) + Number(fr.amount)).toFixed(2);
          await tx
            .update(patientWalletTable)
            .set({ balance: restoredBalance, updatedAt: new Date() })
            .where(eq(patientWalletTable.id, wallet.id));

          await tx.insert(patientWalletTransactionsTable).values({
            walletId:          wallet.id,
            patientId,
            clinicId:          resolvedClinicId,
            amount:            String(fr.amount),
            type:              "estorno",
            description:       `Estorno de cancelamento — consulta #${appointmentId}`,
            appointmentId,
            financialRecordId: fr.id,
          });

          await tx
            .update(financialRecordsTable)
            .set({ status: "estornado" })
            .where(eq(financialRecordsTable.id, fr.id));
        }
      });
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
        // Estorno preciso: localiza o crédito que foi consumido por este
        // appointment (consumedByAppointmentId) e o devolve ao saldo.
        // Fallback: se não encontrou (créditos legados sem o vínculo), usa
        // a heurística antiga (mais recente com usedQuantity > 0).
        let [credit] = await tx
          .select()
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              eq(sessionCreditsTable.consumedByAppointmentId, appointmentId)
            )
          )
          .limit(1);

        if (!credit) {
          [credit] = await tx
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
        }

        if (credit) {
          await tx
            .update(sessionCreditsTable)
            .set({
              usedQuantity: Math.max(0, credit.usedQuantity - 1),
              status: "disponivel",
              consumedByAppointmentId: null,
            })
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
    // Verifica janela de cancelamento (apenas para "cancelado").
    const lateDecision =
      newStatus === "cancelado"
        ? await resolveCancellationDecision(
            resolvedClinicId,
            newStatus,
            oldStatus,
            appointmentDate,
            (details as any).startTime ?? null,
          )
        : null;
    if (lateDecision && lateDecision.isLate && lateDecision.policy !== "creditoNormal") {
      await db.insert(financialRecordsTable).values({
        type: "receita",
        amount: "0",
        description:
          `Crédito não gerado — cancelamento dentro da janela de ${lateDecision.windowHours}h ` +
          `(política=${lateDecision.policy}) — ${procedure.name} - ${patientName}`,
        category: procedure.category,
        appointmentId,
        patientId,
        procedureId,
        transactionType: "creditoSessao",
        status: "cancelado",
        dueDate: today,
        clinicId: resolvedClinicId,
      });
      return;
    }
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

        const validityDays = await resolveReplacementValidityDays(null, patientPackageId);
        const validUntil = addDaysISO(appointmentDate, validityDays);
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
            origin: "reposicaoFalta",
            status: "disponivel",
            validUntil,
            notes: `Crédito por ${newStatus === "faltou" ? "falta" : "cancelamento"} — ${procedure.name} (válido até ${validUntil})`,
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
        // Reverte o crédito: marca como `estornado`. Quantity é zerado para
        // que o crédito não possa mais ser consumido por engano.
        await tx
          .update(sessionCreditsTable)
          .set({
            quantity: credit.usedQuantity,
            status: "estornado",
            notes: `${credit.notes ?? ""}\n[estornado em ${todayBRT()}: appt voltou a status ativo]`,
          })
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
