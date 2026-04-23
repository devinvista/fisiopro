import { Router } from "express";
import { db } from "@workspace/db";
import { financialRecordsTable, appointmentsTable, proceduresTable } from "@workspace/db";
import { and, eq, sql, gte, lte } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { nowBRT } from "../../../utils/dateUtils.js";
import { recordDateFilter, revenueSummarySql } from "../shared/financial-reports.service.js";

/**
 * Data efetiva do registro financeiro para fins de relatório:
 * 1. paymentDate (se pago)
 * 2. dueDate (se a vencer)
 * 3. DATE(createdAt) (fallback)
 *
 * Espelha a regra usada por `recordDateFilter` no `financial-reports.service`.
 */
const effectiveDateSql = sql<string>`COALESCE(${financialRecordsTable.paymentDate}::date, ${financialRecordsTable.dueDate}::date, DATE(${financialRecordsTable.createdAt}))`;

const router = Router();
router.use(authMiddleware);

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

router.get("/monthly-revenue", requirePermission("reports.read"), async (req: AuthRequest, res) => {
  try {
    const year = parseInt(req.query.year as string) || nowBRT().year;
    const yearStartStr = `${year}-01-01`;
    const yearEndStr = `${year}-12-31`;

    const clinicFilter = req.isSuperAdmin || !req.clinicId ? null : eq(financialRecordsTable.clinicId, req.clinicId);
    const dateInYear = recordDateFilter(yearStartStr, yearEndStr);
    const monthExpr = sql<number>`EXTRACT(MONTH FROM ${effectiveDateSql})::int`;

    // Receita: usa regra completa (exclui estornado/cancelado e tipos não-competência)
    const revenueRows = await db
      .select({
        month: monthExpr,
        total: sql<number>`SUM(${financialRecordsTable.amount}::numeric)`,
      })
      .from(financialRecordsTable)
      .where(and(...[clinicFilter, revenueSummarySql(), dateInYear].filter(Boolean) as any[]))
      .groupBy(monthExpr);

    const revenueByMonth: number[] = new Array(13).fill(0);
    for (const r of revenueRows) {
      if (r.month >= 1 && r.month <= 12) revenueByMonth[r.month] = Number(r.total);
    }

    // Despesas: aplica mesma regra de data efetiva
    const expenseRows = await db
      .select({
        month: monthExpr,
        total: sql<number>`SUM(${financialRecordsTable.amount}::numeric)`,
      })
      .from(financialRecordsTable)
      .where(and(...[
        clinicFilter,
        eq(financialRecordsTable.type, "despesa"),
        sql`${financialRecordsTable.status} NOT IN ('estornado', 'cancelado')`,
        dateInYear,
      ].filter(Boolean) as any[]))
      .groupBy(monthExpr);

    const result = [];
    for (let month = 1; month <= 12; month++) {
      const revenue = revenueByMonth[month];
      const expenses = Number(expenseRows.find((r) => r.month === month)?.total ?? 0);
      result.push({ month, monthName: MONTH_NAMES[month - 1], revenue, expenses, profit: revenue - expenses });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/procedure-revenue", requirePermission("reports.read"), async (req: AuthRequest, res) => {
  try {
    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year = parseInt(req.query.year as string) || brt.year;
    const { startDate, endDate } = monthDateRange(year, month);

    const clinicId = req.isSuperAdmin || !req.clinicId ? null : req.clinicId;

    // Estratégia: resolver o procedure_id de cada financial_record numa subquery
    // (direto via fr.procedure_id; via fr.appointment_id → appointments.procedure_id como fallback),
    // depois juntar com procedures. Evita o cross-product que ocorria ao fazer
    // procedures × appointments × financial_records num único JOIN.
    const clinicCond = clinicId ? sql`AND fr.clinic_id = ${clinicId}` : sql``;
    const startCond = sql`${startDate}`;
    const endCond = sql`${endDate}`;

    const rows = await db.execute<{
      procedure_id: number;
      procedure_name: string;
      category: string | null;
      total_revenue: string | number;
      total_sessions: string | number;
    }>(sql`
      WITH fr_resolved AS (
        SELECT fr.id, fr.amount,
               COALESCE(fr.procedure_id, a.procedure_id) AS resolved_procedure_id
        FROM financial_records fr
        LEFT JOIN appointments a ON a.id = fr.appointment_id
        WHERE fr.type = 'receita'
          AND fr.status NOT IN ('estornado', 'cancelado')
          AND (fr.transaction_type IS NULL OR fr.transaction_type NOT IN ('depositoCarteira', 'vendaPacote', 'pagamento', 'faturaConsolidada'))
          AND COALESCE(fr.payment_date::date, fr.due_date::date, DATE(fr.created_at))
              BETWEEN ${startCond}::date AND ${endCond}::date
          ${clinicCond}
      )
      SELECT p.id AS procedure_id,
             p.name AS procedure_name,
             p.category,
             COALESCE(SUM(fr.amount::numeric), 0) AS total_revenue,
             COUNT(fr.id) AS total_sessions
      FROM procedures p
      LEFT JOIN fr_resolved fr ON fr.resolved_procedure_id = p.id
      GROUP BY p.id, p.name, p.category
      ORDER BY COALESCE(SUM(fr.amount::numeric), 0) DESC
    `);

    const results = (rows as unknown as { rows: any[] }).rows ?? (rows as unknown as any[]);

    res.json(
      results.map((r: any) => {
        const totalRevenue = Number(r.total_revenue ?? r.totalRevenue ?? 0);
        const totalSessions = Number(r.total_sessions ?? r.totalSessions ?? 0);
        return {
          procedureId: r.procedure_id ?? r.procedureId,
          procedureName: r.procedure_name ?? r.procedureName,
          category: r.category,
          totalRevenue,
          totalSessions,
          averageTicket: totalSessions > 0 ? totalRevenue / totalSessions : 0,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/schedule-occupation", requirePermission("reports.read"), async (req, res) => {
  try {
    const brt = nowBRT();
    const month = parseInt(req.query.month as string) || brt.month;
    const year = parseInt(req.query.year as string) || brt.year;
    const { startDate, endDate } = monthDateRange(year, month);

    const appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(gte(appointmentsTable.date, startDate), lte(appointmentsTable.date, endDate)));

    const totalSlots = appointments.length;
    const occupiedSlots = appointments.filter((a) =>
      ["concluido", "agendado", "confirmado"].includes(a.status)
    ).length;
    const canceledCount = appointments.filter((a) => a.status === "cancelado").length;
    const noShowCount = appointments.filter((a) => a.status === "faltou").length;

    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDayOfWeek: Record<string, number> = {};
    dayNames.forEach((d) => { byDayOfWeek[d] = 0; });

    for (const appt of appointments) {
      const dayOfWeek = new Date(appt.date + "T12:00:00").getDay();
      byDayOfWeek[dayNames[dayOfWeek]]++;
    }

    const activePatients = new Set(
      appointments
        .filter((a) => !["cancelado"].includes(a.status))
        .map((a) => a.patientId)
    ).size;

    const noShowRate = totalSlots > 0 ? (noShowCount / totalSlots) * 100 : 0;

    res.json({
      totalSlots,
      occupiedSlots,
      occupationRate: totalSlots > 0 ? (occupiedSlots / totalSlots) * 100 : 0,
      canceledCount,
      noShowCount,
      noShowRate,
      activePatients,
      byDayOfWeek: dayNames.map((d) => ({ dayOfWeek: d, count: byDayOfWeek[d] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
