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

    const clinicFilter = req.isSuperAdmin || !req.clinicId ? null : eq(financialRecordsTable.clinicId, req.clinicId);

    // Junta financialRecords pelo procedureId (registro próprio) OU appointmentId (registro de agendamento),
    // usando a data efetiva (paymentDate → dueDate → createdAt) para não excluir pendentes.
    const results = await db
      .select({
        procedureId: proceduresTable.id,
        procedureName: proceduresTable.name,
        category: proceduresTable.category,
        totalRevenue: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`,
        totalSessions: sql<number>`COUNT(${financialRecordsTable.id})`,
      })
      .from(proceduresTable)
      .leftJoin(appointmentsTable, sql`${appointmentsTable.procedureId} = ${proceduresTable.id}`)
      .leftJoin(
        financialRecordsTable,
        and(
          sql`(${financialRecordsTable.procedureId} = ${proceduresTable.id} OR ${financialRecordsTable.appointmentId} = ${appointmentsTable.id})`,
          revenueSummarySql(),
          recordDateFilter(startDate, endDate),
          ...(clinicFilter ? [clinicFilter] : []),
        ),
      )
      .groupBy(proceduresTable.id, proceduresTable.name, proceduresTable.category)
      .orderBy(sql`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0) DESC`);

    res.json(
      results.map((r) => ({
        ...r,
        totalRevenue: Number(r.totalRevenue),
        totalSessions: Number(r.totalSessions),
        averageTicket:
          Number(r.totalSessions) > 0
            ? Number(r.totalRevenue) / Number(r.totalSessions)
            : 0,
      }))
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
