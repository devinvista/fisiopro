/**
 * Sprint 2 — Aceitação financeira de plano de tratamento.
 *
 * Quando o paciente aceita formalmente o plano, o sistema gera APENAS o
 * necessário para "fechar a venda":
 *
 *   - Itens `pacoteSessoes` (kind ou packageType="sessoes"): cria uma
 *     `vendaPacote` em `financial_records` (status=pendente) + N créditos
 *     em `session_credits` (status=`disponivel` ou `pendentePagamento`
 *     conforme paymentMode do plano/pacote).
 *
 *   - Itens `recorrenteMensal` (kind ou packageType="mensal"): cria a
 *     `faturaPlano` do MÊS CORRENTE apenas (próximas serão geradas mês a mês
 *     pelo job de billing — Sprint 3). Status `pendente`, dueDate no
 *     billingDay do pacote (clamped ao último dia do mês).
 *
 *   - Itens `avulso` (sem packageId): nenhum efeito agora — cobrança ocorre
 *     na conclusão de cada atendimento.
 *
 * NÃO cria `appointments`. A geração da agenda continua sendo a ação
 * operacional `materializeTreatmentPlan` (separada e a ser substituída por
 * grade lazy no Sprint 4).
 *
 * Idempotência: opera em transação e usa o mesmo princípio do `acceptedAt`
 * — invocar duas vezes com o plano já aceito não duplica registros (a função
 * é chamada uma única vez, do `acceptPatientTreatmentPlan`).
 */
import { db } from "@workspace/db";
import {
  financialRecordsTable,
  treatmentPlanProceduresTable,
  treatmentPlansTable,
  packagesTable,
  proceduresTable,
  patientsTable,
  sessionCreditsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export interface AcceptPlanFinancialsResult {
  planId: number;
  invoicesCreated: number;
  creditsCreated: number;
  totalImmediateCharge: string;
}

interface PlanItem {
  id: number;
  kind: string | null;
  procedureId: number | null;
  packageId: number | null;
  unitPrice: string | null;
  unitMonthlyPrice: string | null;
  discount: string | null;
  totalSessions: number | null;
  packageType: string | null;
  packageBillingDay: number | null;
  packageProcedureId: number | null;
  packagePaymentMode: string | null;
  packageName: string | null;
}

/**
 * Resolve o tipo (kind) de um item, derivando dos campos legados quando o
 * `kind` ainda não foi preenchido (planos pré-Sprint 2).
 */
export function resolveItemKind(item: {
  kind: string | null;
  packageId: number | null;
  packageType: string | null;
}): "recorrenteMensal" | "pacoteSessoes" | "avulso" {
  if (item.kind === "recorrenteMensal") return "recorrenteMensal";
  if (item.kind === "pacoteSessoes") return "pacoteSessoes";
  if (item.kind === "avulso") return "avulso";
  if (item.packageId != null) {
    if (item.packageType === "mensal" || item.packageType === "faturaConsolidada") {
      return "recorrenteMensal";
    }
    return "pacoteSessoes";
  }
  return "avulso";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function todayBRT(): { y: number; m: number; d: number; iso: string } {
  // Para fins de aceite, usamos a data atual em BRT — o teste de unidade
  // pode passar a data como override pelo callsite (acceptPlanFinancials).
  const tz = "America/Sao_Paulo";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d, iso: `${y}-${pad(m)}-${pad(d)}` };
}

async function loadAcceptanceItems(planId: number): Promise<PlanItem[]> {
  return db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      procedureId: treatmentPlanProceduresTable.procedureId,
      packageId: treatmentPlanProceduresTable.packageId,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      discount: treatmentPlanProceduresTable.discount,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      packageType: packagesTable.packageType,
      packageBillingDay: packagesTable.billingDay,
      packageProcedureId: packagesTable.procedureId,
      packagePaymentMode: packagesTable.paymentMode,
      packageName: packagesTable.name,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));
}

/**
 * Gera o efeito financeiro do aceite. Idempotente por desenho: a função
 * deve ser chamada apenas no momento do aceite (acceptedAt → not null).
 *
 * Retorna contagens para auditoria/UX.
 */
export async function acceptPlanFinancials(
  planId: number,
  opts: { now?: { y: number; m: number; d: number; iso: string } } = {},
): Promise<AcceptPlanFinancialsResult> {
  const [plan] = await db
    .select()
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) throw new Error(`Plano #${planId} não encontrado`);

  const items = await loadAcceptanceItems(planId);
  if (items.length === 0) {
    return {
      planId,
      invoicesCreated: 0,
      creditsCreated: 0,
      totalImmediateCharge: "0.00",
    };
  }

  const [patient] = await db
    .select({ name: patientsTable.name })
    .from(patientsTable)
    .where(eq(patientsTable.id, plan.patientId))
    .limit(1);
  const patientName = patient?.name ?? `paciente#${plan.patientId}`;

  const now = opts.now ?? todayBRT();
  const monthRef = `${now.y}-${pad(now.m)}-01`;
  const planPaymentMode = (plan.paymentMode || "postpago") as "prepago" | "postpago";

  let invoicesCreated = 0;
  let creditsCreated = 0;
  let totalImmediateCharge = 0;

  await db.transaction(async (tx) => {
    for (const item of items) {
      const kind = resolveItemKind(item);

      if (kind === "avulso") {
        continue;
      }

      const procedureId = item.packageProcedureId ?? item.procedureId;
      if (!procedureId) continue;

      const [procedure] = await tx
        .select({
          name: proceduresTable.name,
          category: proceduresTable.category,
          price: proceduresTable.price,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, procedureId))
        .limit(1);
      if (!procedure) continue;

      // ─── Pacote por sessões: 1 fatura à vista + N créditos ───────────────
      if (kind === "pacoteSessoes") {
        const sessions = item.totalSessions ?? 0;
        if (sessions <= 0) continue;

        const unit = Number(item.unitPrice ?? 0);
        const discount = Math.max(0, Number(item.discount ?? 0));
        const effective = Math.max(0, unit - discount);
        const totalPackagePrice = effective * sessions;

        const itemPaymentMode = (item.packagePaymentMode || planPaymentMode) as
          | "prepago"
          | "postpago";

        // 1) Fatura à vista (status pendente).
        if (totalPackagePrice > 0) {
          // Idempotência: evita criar 2 vendaPacote para o mesmo item do plano.
          const [exists] = await tx
            .select({ id: financialRecordsTable.id })
            .from(financialRecordsTable)
            .where(
              and(
                eq(financialRecordsTable.treatmentPlanId, planId),
                eq(financialRecordsTable.treatmentPlanProcedureId, item.id),
                eq(financialRecordsTable.transactionType, "vendaPacote"),
              ),
            )
            .limit(1);
          if (!exists) {
            await tx.insert(financialRecordsTable).values({
              type: "receita",
              amount: totalPackagePrice.toFixed(2),
              description: `Aceite de plano #${planId} — pacote ${item.packageName ?? procedure.name} — ${patientName}`,
              category: "Pacote",
              patientId: plan.patientId,
              procedureId,
              clinicId: plan.clinicId,
              transactionType: "vendaPacote",
              status: "pendente",
              dueDate: now.iso,
              treatmentPlanId: planId,
              treatmentPlanProcedureId: item.id,
              priceSource: "plano_tratamento",
              originalUnitPrice: procedure.price,
            });
            invoicesCreated++;
            totalImmediateCharge += totalPackagePrice;
          }
        }

        // 2) Créditos de sessão.
        const [creditsExist] = await tx
          .select({ id: sessionCreditsTable.id })
          .from(sessionCreditsTable)
          .where(
            and(
              eq(sessionCreditsTable.patientId, plan.patientId),
              eq(sessionCreditsTable.procedureId, procedureId),
              sql`${sessionCreditsTable.notes} LIKE ${`%plano #${planId}/item ${item.id}%`}`,
            ),
          )
          .limit(1);
        if (!creditsExist) {
          await tx.insert(sessionCreditsTable).values({
            patientId: plan.patientId,
            procedureId,
            quantity: sessions,
            usedQuantity: 0,
            clinicId: plan.clinicId,
            origin: "compraPacote",
            status: itemPaymentMode === "prepago" ? "pendentePagamento" : "disponivel",
            notes: `Créditos do aceite — plano #${planId}/item ${item.id} — pacote ${item.packageName ?? procedure.name}`,
          });
          creditsCreated++;
        }
        continue;
      }

      // ─── Recorrente mensal: somente fatura do mês corrente ───────────────
      if (kind === "recorrenteMensal") {
        const monthlyAmount = Math.max(
          0,
          Number(item.unitMonthlyPrice ?? 0) - Number(item.discount ?? 0),
        );
        if (monthlyAmount <= 0) continue;

        const billingDay = item.packageBillingDay ?? 10;
        const lastDay = lastDayOfMonth(now.y, now.m);
        const dueDay = Math.min(billingDay, lastDay);
        const dueDate = `${now.y}-${pad(now.m)}-${pad(dueDay)}`;

        // Idempotência: 1 fatura por (plano, item, mês).
        const [exists] = await tx
          .select({ id: financialRecordsTable.id })
          .from(financialRecordsTable)
          .where(
            and(
              eq(financialRecordsTable.treatmentPlanId, planId),
              eq(financialRecordsTable.treatmentPlanProcedureId, item.id),
              eq(financialRecordsTable.transactionType, "faturaPlano"),
              eq(financialRecordsTable.planMonthRef, monthRef),
            ),
          )
          .limit(1);

        if (!exists) {
          await tx.insert(financialRecordsTable).values({
            type: "receita",
            amount: monthlyAmount.toFixed(2),
            description: `Aceite de plano #${planId} — ${procedure.name} — ${patientName} — ${monthRef.slice(0, 7)}`,
            category: procedure.category,
            patientId: plan.patientId,
            procedureId,
            clinicId: plan.clinicId,
            transactionType: "faturaPlano",
            status: "pendente",
            dueDate,
            treatmentPlanId: planId,
            treatmentPlanProcedureId: item.id,
            planMonthRef: monthRef,
            priceSource: "plano_mensal_proporcional",
            originalUnitPrice: procedure.price,
          });
          invoicesCreated++;
          totalImmediateCharge += monthlyAmount;
        }
      }
    }
  });

  return {
    planId,
    invoicesCreated,
    creditsCreated,
    totalImmediateCharge: totalImmediateCharge.toFixed(2),
  };
}
