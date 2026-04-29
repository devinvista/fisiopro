/**
 * Endpoints HTTP para o job `monthlyPlanBilling` (Sprint 3+).
 *
 * Permite à UI exibir status do último run, próximas cobranças (faturas que
 * serão geradas nos próximos 7 dias) e disparar execução manual do job.
 *
 * Mounted em `/api/treatment-plans/billing` (ver `modules/index.ts`).
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  billingRunLogsTable,
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
  proceduresTable,
  patientsTable,
} from "@workspace/db";
import { and, desc, eq, isNotNull, like } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { runMonthlyPlanBilling } from "./monthly-plan-billing.service.js";
import { nowBRT } from "../../../utils/dateUtils.js";

const router: IRouter = Router();
router.use(authMiddleware);

/**
 * GET /api/treatment-plans/billing/status
 * Retorna:
 *  - lastRun: última execução do job `monthlyPlanBilling`
 *  - upcoming: itens recorrentes cujo próximo `billingDay` cai nos próximos 7 dias
 *  - upcomingTotal / upcomingCount
 *
 * Schema de resposta compatível com o painel `RecurringPackagesPanel`.
 */
router.get(
  "/status",
  requirePermission("financial.read"),
  async (req: AuthRequest, res) => {
    try {
      // Filtra logs do job `monthlyPlanBilling` pelo prefixo no `triggeredBy`
      // (a tabela `billing_run_logs` é compartilhada entre jobs e não tem
      // coluna de discriminador — ver comentário em `persistRunLog`).
      const logConditions: any[] = [
        like(billingRunLogsTable.triggeredBy, "monthlyPlanBilling:%"),
      ];
      if (!req.isSuperAdmin && req.clinicId) {
        logConditions.push(eq(billingRunLogsTable.clinicId, req.clinicId));
      }

      const [lastRun] = await db
        .select()
        .from(billingRunLogsTable)
        .where(and(...logConditions))
        .orderBy(desc(billingRunLogsTable.ranAt))
        .limit(1);

      // Próximas cobranças: itens `recorrenteMensal` de planos aceitos
      // ativos cujo `billingDay` cai entre hoje e hoje+7. Calculado no JS
      // pois a comparação por dia do mês não bate trivialmente em SQL
      // (precisaria computar billingDay relativo ao mês corrente).
      const today = nowBRT();
      const todayDay = today.day;
      const todayY = today.year;
      const todayM = today.month;

      const itemConditions: any[] = [
        eq(treatmentPlanProceduresTable.kind, "recorrenteMensal"),
        eq(treatmentPlansTable.status, "ativo"),
        isNotNull(treatmentPlansTable.acceptedAt),
      ];
      if (!req.isSuperAdmin && req.clinicId) {
        itemConditions.push(eq(treatmentPlansTable.clinicId, req.clinicId));
      }

      const items = await db
        .select({
          itemId: treatmentPlanProceduresTable.id,
          planId: treatmentPlansTable.id,
          patientName: patientsTable.name,
          procedureName: proceduresTable.name,
          packageName: packagesTable.name,
          unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
          packageMonthlyPrice: packagesTable.monthlyPrice,
          packageBillingDay: packagesTable.billingDay,
        })
        .from(treatmentPlanProceduresTable)
        .innerJoin(
          treatmentPlansTable,
          eq(treatmentPlanProceduresTable.treatmentPlanId, treatmentPlansTable.id),
        )
        .leftJoin(
          patientsTable,
          eq(treatmentPlansTable.patientId, patientsTable.id),
        )
        .leftJoin(
          packagesTable,
          eq(treatmentPlanProceduresTable.packageId, packagesTable.id),
        )
        .leftJoin(
          proceduresTable,
          eq(treatmentPlanProceduresTable.procedureId, proceduresTable.id),
        )
        .where(and(...itemConditions));

      const pad = (n: number) => String(n).padStart(2, "0");
      const upcoming = items
        .map((it) => {
          const day = it.packageBillingDay ?? 10;
          // próxima data deste mês (se ainda não passou) ou do próximo
          let y = todayY, m = todayM;
          if (day < todayDay) {
            m += 1;
            if (m > 12) { m = 1; y += 1; }
          }
          const nextBillingDate = `${y}-${pad(m)}-${pad(Math.min(day, 28))}`;
          // Pacote mensalidade: o valor mensal pode estar somente no pacote.
          const amount = Number(it.unitMonthlyPrice ?? it.packageMonthlyPrice ?? 0);
          return {
            id: it.itemId,
            patientName: it.patientName ?? `Paciente #${it.planId}`,
            procedureName:
              it.packageName ?? it.procedureName ?? "Recorrente mensal",
            amount,
            nextBillingDate,
          };
        })
        .filter((u) => {
          // janela de 7 dias a partir de hoje
          const target = new Date(u.nextBillingDate + "T00:00:00");
          const now = new Date(`${todayY}-${pad(todayM)}-${pad(todayDay)}T00:00:00`);
          const diff = (target.getTime() - now.getTime()) / 86400000;
          return diff >= 0 && diff <= 7;
        })
        .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

      const upcomingTotal = upcoming.reduce((s, u) => s + u.amount, 0);

      res.json({
        lastRun: lastRun ?? null,
        upcoming,
        upcomingTotal,
        upcomingCount: upcoming.length,
      });
    } catch (err) {
      console.error("[treatment-plans/billing/status]", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

/**
 * POST /api/treatment-plans/billing/run
 * Dispara `runMonthlyPlanBilling` manualmente. Schema de resposta
 * compatível com o painel: `{ generated, skipped, processed, errors }`
 * mais `recordIds` (vazio aqui — o serviço ainda não retorna a lista
 * agregada de invoiceIds, apenas em `details[]`).
 */
router.post(
  "/run",
  requirePermission("financial.write"),
  async (req: AuthRequest, res) => {
    try {
      const toleranceDays =
        req.body?.toleranceDays !== undefined
          ? Math.max(0, Math.min(7, parseInt(req.body.toleranceDays)))
          : 5;

      const clinicId = req.isSuperAdmin
        ? req.body?.clinicId ?? undefined
        : req.clinicId ?? undefined;

      const result = await runMonthlyPlanBilling({
        clinicId,
        toleranceDays,
        triggeredBy: "manual",
      });

      const recordIds = result.details
        .filter((d) => d.action === "generated" && d.invoiceId)
        .map((d) => d.invoiceId as number);

      res.json({
        generated: result.generated + result.gapFilled,
        skipped: result.skipped,
        processed: result.processed,
        errors: result.errors,
        recordIds,
      });
    } catch (err) {
      console.error("[treatment-plans/billing/run]", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

export default router;
