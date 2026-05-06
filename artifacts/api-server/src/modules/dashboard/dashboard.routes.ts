import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  patientsTable,
  patientClinicsTable,
  proceduresTable,
  financialRecordsTable,
  treatmentPlansTable,
  anamnesisTable,
  evaluationsTable,
  dischargeSummariesTable,
} from "@workspace/db";
import { eq, and, sql, gte, gt, lte, isNull, inArray, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/rbac.js";
import { todayBRT, nowBRT, monthDateRangeBRT } from "../../utils/dateUtils.js";
import { revenueSummarySql, recordDateFilter } from "../financial/shared/financial-reports.service.js";

const router = Router();
router.use(authMiddleware);

function apptClinicFilter(req: AuthRequest) {
  if (!req.clinicId) return null;
  return eq(appointmentsTable.clinicId, req.clinicId);
}

function patientClinicFilter(req: AuthRequest) {
  if (!req.clinicId) return null;
  return inArray(
    patientsTable.id,
    db
      .select({ id: patientClinicsTable.patientId })
      .from(patientClinicsTable)
      .where(and(
        eq(patientClinicsTable.clinicId, req.clinicId),
        isNull(patientClinicsTable.deletedAt),
      )),
  );
}

function financialClinicFilter(req: AuthRequest) {
  if (!req.clinicId) return null;
  return eq(financialRecordsTable.clinicId, req.clinicId);
}

router.get("/", requirePermission("patients.read"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const today = todayBRT();
    const { year, month } = nowBRT();
    const { startDate, endDate } = monthDateRangeBRT(year, month);

    const apptFilter = apptClinicFilter(authReq);
    const patFilter = patientClinicFilter(authReq);
    const finFilter = financialClinicFilter(authReq);

    const todayAppts = await db
      .select({
        appointment: appointmentsTable,
        patient: patientsTable,
        procedure: proceduresTable
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(
        and(
          eq(appointmentsTable.date, today),
          sql`${appointmentsTable.status} NOT IN ('cancelado', 'remarcado')`,
          apptFilter ?? undefined
        )
      )
      .orderBy(appointmentsTable.startTime);

    const upcomingAppts = await db
      .select({
        appointment: appointmentsTable,
        patient: patientsTable,
        procedure: proceduresTable
      })
      .from(appointmentsTable)
      .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
      .leftJoin(proceduresTable, eq(appointmentsTable.procedureId, proceduresTable.id))
      .where(
        and(
          gt(appointmentsTable.date, today),
          sql`${appointmentsTable.status} NOT IN ('cancelado', 'concluido', 'faltou', 'remarcado')`,
          apptFilter ?? undefined
        )
      )
      .orderBy(appointmentsTable.date, appointmentsTable.startTime)
      .limit(5);

    const revenueResult = await db.select({
      total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)`
    })
      .from(financialRecordsTable)
      .where(
        and(
          revenueSummarySql(),
          recordDateFilter(startDate, endDate),
          finFilter ?? undefined
        )
      );

    const totalPatientsResult = await db
      .select({ count: sql<number>`count(distinct ${treatmentPlansTable.patientId})` })
      .from(treatmentPlansTable)
      .innerJoin(patientsTable, eq(treatmentPlansTable.patientId, patientsTable.id))
      .where(and(eq(treatmentPlansTable.status, "ativo"), patFilter ?? undefined));

    const totalMonthAppts = await db.select({ count: sql<number>`count(*)` })
      .from(appointmentsTable)
      .where(
        and(
          gte(appointmentsTable.date, startDate),
          lte(appointmentsTable.date, endDate),
          sql`${appointmentsTable.status} NOT IN ('cancelado', 'remarcado')`,
          apptFilter ?? undefined
        )
      );

    const completedMonthAppts = await db.select({ count: sql<number>`count(*)` })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.status, "concluido"),
          gte(appointmentsTable.date, startDate),
          lte(appointmentsTable.date, endDate),
          apptFilter ?? undefined
        )
      );

    const noShowMonthAppts = await db.select({ count: sql<number>`count(*)` })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.status, "faltou"),
        gte(appointmentsTable.date, startDate),
        lte(appointmentsTable.date, endDate),
        apptFilter ?? undefined
      ));

    const totalMonth = Number(totalMonthAppts[0]?.count ?? 0);
    const completedMonth = Number(completedMonthAppts[0]?.count ?? 0);
    const noShowMonth = Number(noShowMonthAppts[0]?.count ?? 0);

    const { month: todayMonth, day: todayDay } = nowBRT();
    const birthdayFilters = [
      sql`EXTRACT(MONTH FROM ${patientsTable.birthDate}) = ${todayMonth}`,
      sql`EXTRACT(DAY FROM ${patientsTable.birthDate}) = ${todayDay}`,
      isNull(patientsTable.deletedAt),
    ];
    if (patFilter) birthdayFilters.push(patFilter);

    const birthdayPatients = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        birthDate: patientsTable.birthDate,
        phone: patientsTable.phone,
        email: patientsTable.email,
      })
      .from(patientsTable)
      .where(and(...birthdayFilters))
      .orderBy(patientsTable.name);

    res.json({
      todayAppointments: todayAppts.map(({ appointment, patient, procedure }) => ({ ...appointment, patient, procedure })),
      upcomingAppointments: upcomingAppts.map(({ appointment, patient, procedure }) => ({ ...appointment, patient, procedure })),
      monthlyRevenue: Number(revenueResult[0]?.total ?? 0),
      totalPatients: Number(totalPatientsResult[0]?.count ?? 0),
      todayTotal: todayAppts.length,
      occupationRate: totalMonth > 0 ? (completedMonth / totalMonth) * 100 : 0,
      noShowCount: noShowMonth,
      noShowRate: totalMonth > 0 ? (noShowMonth / totalMonth) * 100 : 0,
      birthdayPatients,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Patient Pipeline: onboarding + nearing completion ──────────────────────────
router.get("/patient-pipeline", requirePermission("patients.read"), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const clinicId = authReq.clinicId;

    if (!clinicId) {
      res.json({ onboarding: [], nearingCompletion: [] });
      return;
    }

    // 1. Get patients joined to this clinic (most recent first, last 60)
    const clinicPatientRows = await db
      .select({
        patientId: patientClinicsTable.patientId,
        joinedAt: patientClinicsTable.createdAt,
      })
      .from(patientClinicsTable)
      .where(and(
        eq(patientClinicsTable.clinicId, clinicId),
        isNull(patientClinicsTable.deletedAt),
      ))
      .orderBy(desc(patientClinicsTable.createdAt))
      .limit(60);

    if (clinicPatientRows.length === 0) {
      res.json({ onboarding: [], nearingCompletion: [] });
      return;
    }

    const allPatientIds = clinicPatientRows.map(r => r.patientId);

    // 2. Find which patients have at least one completed appointment
    const completedApptRows = await db
      .select({ patientId: appointmentsTable.patientId })
      .from(appointmentsTable)
      .where(and(
        inArray(appointmentsTable.patientId, allPatientIds),
        eq(appointmentsTable.clinicId, clinicId),
        sql`${appointmentsTable.status} IN ('concluido', 'presenca')`,
      ));

    const patientsWithFirstSession = new Set(completedApptRows.map(r => r.patientId));

    // 3. Onboarding = no first session yet
    const onboardingRows = clinicPatientRows.filter(r => !patientsWithFirstSession.has(r.patientId));
    const onboardingIds = onboardingRows.map(r => r.patientId);

    let onboardingResult: {
      patientId: number;
      name: string;
      phone: string | null;
      stage: string;
      joinedAt: Date | null;
      daysSinceJoined: number;
    }[] = [];

    if (onboardingIds.length > 0) {
      const [patientRows, anamnesisRows, evaluationRows, treatmentPlanRows, anyApptRows] = await Promise.all([
        db.select({ id: patientsTable.id, name: patientsTable.name, phone: patientsTable.phone })
          .from(patientsTable)
          .where(and(inArray(patientsTable.id, onboardingIds), isNull(patientsTable.deletedAt))),
        db.select({ patientId: anamnesisTable.patientId })
          .from(anamnesisTable)
          .where(inArray(anamnesisTable.patientId, onboardingIds)),
        db.select({ patientId: evaluationsTable.patientId })
          .from(evaluationsTable)
          .where(inArray(evaluationsTable.patientId, onboardingIds)),
        db.select({ patientId: treatmentPlansTable.patientId })
          .from(treatmentPlansTable)
          .where(inArray(treatmentPlansTable.patientId, onboardingIds)),
        db.select({ patientId: appointmentsTable.patientId })
          .from(appointmentsTable)
          .where(and(
            inArray(appointmentsTable.patientId, onboardingIds),
            eq(appointmentsTable.clinicId, clinicId),
          )),
      ]);

      const hasAnamnesis = new Set(anamnesisRows.map(r => r.patientId));
      const hasEvaluation = new Set(evaluationRows.map(r => r.patientId));
      const hasTreatmentPlan = new Set(treatmentPlanRows.map(r => r.patientId));
      const hasAnyAppt = new Set(anyApptRows.map(r => r.patientId));
      const joinedAtMap = new Map(onboardingRows.map(r => [r.patientId, r.joinedAt]));
      const patientMap = new Map(patientRows.map(p => [p.id, p]));

      const getStage = (id: number): string => {
        if (!hasAnamnesis.has(id)) return "anamnese";
        if (!hasEvaluation.has(id)) return "avaliacao";
        if (!hasTreatmentPlan.has(id)) return "plano_tratamento";
        if (!hasAnyAppt.has(id)) return "agendamento";
        return "aguardando_sessao";
      };

      const now = Date.now();
      onboardingResult = onboardingIds
        .map(id => {
          const p = patientMap.get(id);
          if (!p) return null;
          const joinedAt = joinedAtMap.get(id) ?? null;
          const daysSinceJoined = joinedAt
            ? Math.floor((now - new Date(joinedAt).getTime()) / 86_400_000)
            : 0;
          return {
            patientId: id,
            name: p.name,
            phone: p.phone ?? null,
            stage: getStage(id),
            joinedAt,
            daysSinceJoined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 10);
    }

    // 4. Nearing completion: active plans with ≥ 80% sessions done
    const activePlans = await db
      .select({
        planId: treatmentPlansTable.id,
        patientId: treatmentPlansTable.patientId,
        estimatedSessions: treatmentPlansTable.estimatedSessions,
        status: treatmentPlansTable.status,
        startDate: treatmentPlansTable.startDate,
      })
      .from(treatmentPlansTable)
      .where(and(
        eq(treatmentPlansTable.clinicId, clinicId),
        sql`${treatmentPlansTable.status} IN ('ativo', 'vigente')`,
        sql`${treatmentPlansTable.estimatedSessions} IS NOT NULL`,
        sql`${treatmentPlansTable.estimatedSessions} > 0`,
      ));

    let nearingCompletion: {
      patientId: number;
      planId: number;
      name: string;
      phone: string | null;
      completedSessions: number;
      totalSessions: number;
      pct: number;
      planStatus: string;
    }[] = [];

    if (activePlans.length > 0) {
      const planPatientIds = [...new Set(activePlans.map(p => p.patientId))];

      const [completedCountRows, nearingPatientRows] = await Promise.all([
        db.select({
          patientId: appointmentsTable.patientId,
          count: sql<number>`count(*)::int`,
        })
          .from(appointmentsTable)
          .where(and(
            inArray(appointmentsTable.patientId, planPatientIds),
            eq(appointmentsTable.clinicId, clinicId),
            sql`${appointmentsTable.status} IN ('concluido', 'presenca')`,
          ))
          .groupBy(appointmentsTable.patientId),
        db.select({ id: patientsTable.id, name: patientsTable.name, phone: patientsTable.phone })
          .from(patientsTable)
          .where(and(inArray(patientsTable.id, planPatientIds), isNull(patientsTable.deletedAt))),
      ]);

      const completedCountMap = new Map(completedCountRows.map(r => [r.patientId, Number(r.count)]));
      const nearingPatientMap = new Map(nearingPatientRows.map(p => [p.id, p]));

      nearingCompletion = activePlans
        .filter(plan => {
          const completed = completedCountMap.get(plan.patientId) ?? 0;
          const total = plan.estimatedSessions ?? 0;
          if (total === 0) return false;
          return (completed / total) >= 0.8;
        })
        .map(plan => {
          const completed = completedCountMap.get(plan.patientId) ?? 0;
          const total = plan.estimatedSessions!;
          const pct = Math.min(100, Math.round((completed / total) * 100));
          const patient = nearingPatientMap.get(plan.patientId);
          return {
            patientId: plan.patientId,
            planId: plan.planId,
            name: patient?.name ?? "—",
            phone: patient?.phone ?? null,
            completedSessions: completed,
            totalSessions: total,
            pct,
            planStatus: plan.status ?? "ativo",
          };
        })
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 8);
    }

    res.json({ onboarding: onboardingResult, nearingCompletion });
  } catch (err) {
    console.error("[dashboard/patient-pipeline] error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
