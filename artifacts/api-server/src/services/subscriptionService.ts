/**
 * subscriptionService — gerenciamento automático de assinaturas SaaS das clínicas
 *
 * Jobs:
 *  - runSubscriptionCheck(): detecta trials expirados, renova períodos pagos,
 *    marca pagamentos vencidos, aplica período de carência e suspende clínicas
 *    inadimplentes.
 */

import { db } from "@workspace/db";
import { clinicSubscriptionsTable, subscriptionPlansTable, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { todayBRT, addDays } from "../utils/dateUtils.js";

const GRACE_PERIOD_DAYS = 7;

export interface SubscriptionCheckResult {
  trialsExpired: number;
  renewed: number;
  markedOverdue: number;
  suspended: number;
  errors: number;
  details: Array<{ clinicId: number; clinicName: string; action: string; reason?: string }>;
}

export async function runSubscriptionCheck(): Promise<SubscriptionCheckResult> {
  const result: SubscriptionCheckResult = {
    trialsExpired: 0,
    renewed: 0,
    markedOverdue: 0,
    suspended: 0,
    errors: 0,
    details: [],
  };

  const today = todayBRT();

  try {
    const rows = await db
      .select({
        sub: clinicSubscriptionsTable,
        clinic: { id: clinicsTable.id, name: clinicsTable.name },
        plan: subscriptionPlansTable,
      })
      .from(clinicSubscriptionsTable)
      .leftJoin(clinicsTable, eq(clinicSubscriptionsTable.clinicId, clinicsTable.id))
      .leftJoin(subscriptionPlansTable, eq(clinicSubscriptionsTable.planId, subscriptionPlansTable.id));

    for (const row of rows) {
      const { sub, clinic } = row;
      const clinicId = sub.clinicId;
      const clinicName = clinic?.name ?? `Clínica #${clinicId}`;

      try {
        // 1. Trial expirado → marcar como "active" aguardando pagamento OU suspender se não pago
        if (sub.status === "trial" && sub.trialEndDate && sub.trialEndDate < today) {
          if (sub.paymentStatus === "paid" || sub.paymentStatus === "free") {
            await db
              .update(clinicSubscriptionsTable)
              .set({
                status: "active",
                currentPeriodStart: sub.trialEndDate,
                currentPeriodEnd: addDays(sub.trialEndDate, 30),
                updatedAt: new Date(),
              })
              .where(eq(clinicSubscriptionsTable.id, sub.id));

            result.trialsExpired++;
            result.details.push({ clinicId, clinicName, action: "trial_converted", reason: "Trial expirado, pagamento confirmado → ativo" });
          } else {
            await db
              .update(clinicSubscriptionsTable)
              .set({ status: "active", paymentStatus: "overdue", updatedAt: new Date() })
              .where(eq(clinicSubscriptionsTable.id, sub.id));

            result.trialsExpired++;
            result.details.push({ clinicId, clinicName, action: "trial_expired_overdue", reason: "Trial expirado sem pagamento → vencido" });
          }
          continue;
        }

        // 2. Renovação automática: assinatura ativa + paga com período vencido
        // Ao expirar current_period_end de uma assinatura já paga, avança automaticamente
        // o período e marca o novo ciclo como "overdue" aguardando confirmação do próximo pagamento.
        if (
          sub.status === "active" &&
          sub.paymentStatus === "paid" &&
          sub.currentPeriodEnd &&
          sub.currentPeriodEnd < today
        ) {
          const newPeriodStart = sub.currentPeriodEnd;
          const newPeriodEnd = addDays(sub.currentPeriodEnd, 30);

          await db
            .update(clinicSubscriptionsTable)
            .set({
              currentPeriodStart: newPeriodStart,
              currentPeriodEnd: newPeriodEnd,
              paymentStatus: "overdue",
              updatedAt: new Date(),
            })
            .where(eq(clinicSubscriptionsTable.id, sub.id));

          result.renewed++;
          result.details.push({
            clinicId,
            clinicName,
            action: "period_renewed",
            reason: `Período renovado automaticamente: ${newPeriodStart} → ${newPeriodEnd}`,
          });
          continue;
        }

        // 3. Assinatura ativa com período vencido → marcar como overdue
        // Usa currentPeriodEnd se disponível; cai para trialEndDate quando o trial
        // expirou sem pagamento e currentPeriodEnd ainda não foi definido.
        if (sub.status === "active" && sub.paymentStatus !== "paid" && sub.paymentStatus !== "free") {
          const referenceDate = sub.currentPeriodEnd ?? sub.trialEndDate;
          if (referenceDate && referenceDate < today) {
            const updateFields: Partial<typeof clinicSubscriptionsTable.$inferInsert> = {
              paymentStatus: "overdue",
              updatedAt: new Date(),
            };
            // Se currentPeriodEnd estava nulo, ancorá-lo na data de referência para
            // que o cálculo de carência (passo 4) funcione corretamente.
            if (!sub.currentPeriodEnd && sub.trialEndDate) {
              updateFields.currentPeriodEnd = sub.trialEndDate;
            }
            await db
              .update(clinicSubscriptionsTable)
              .set(updateFields)
              .where(eq(clinicSubscriptionsTable.id, sub.id));

            result.markedOverdue++;
            result.details.push({ clinicId, clinicName, action: "marked_overdue", reason: "Período vencido sem pagamento" });
          }
          continue;
        }

        // 4. Overdue além do período de carência → suspender
        // currentPeriodEnd agora é sempre preenchido antes de chegar aqui (passo 3).
        if (sub.status === "active" && sub.paymentStatus === "overdue") {
          const referenceEnd = sub.currentPeriodEnd ?? sub.trialEndDate;
          if (referenceEnd) {
            const graceLimitDate = addDays(referenceEnd, GRACE_PERIOD_DAYS);
            if (today > graceLimitDate) {
              await db
                .update(clinicSubscriptionsTable)
                .set({ status: "suspended", updatedAt: new Date() })
                .where(eq(clinicSubscriptionsTable.id, sub.id));

              result.suspended++;
              result.details.push({
                clinicId,
                clinicName,
                action: "suspended",
                reason: `Inadimplente há mais de ${GRACE_PERIOD_DAYS} dias após vencimento`,
              });
            }
          }
        }
      } catch (err: any) {
        result.errors++;
        result.details.push({ clinicId, clinicName, action: "error", reason: err?.message ?? "Erro desconhecido" });
      }
    }
  } catch (err) {
    console.error("[subscriptionService] Falha crítica no runSubscriptionCheck:", err);
    result.errors++;
  }

  return result;
}
