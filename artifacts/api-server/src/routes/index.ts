import { Router, type IRouter } from "express";

// Cross-cutting / public
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import publicRouter from "./public.js";
import dashboardRouter from "./dashboard.js";
import storageRouter from "./storage.js";

// Clinical domain
import patientsRouter from "./clinical/patients.js";
import appointmentsRouter from "./clinical/appointments.js";
import schedulesRouter from "./clinical/schedules.js";
import medicalRecordsRouter from "./clinical/medical-records.js";
import blockedSlotsRouter from "./clinical/blocked-slots.js";
import patientJourneyRouter from "./clinical/patient-journey.js";
import patientPhotosRouter from "./clinical/patient-photos.js";

// Catalog domain (procedures, packages)
import proceduresRouter from "./catalog/procedures.js";
import packagesRouter from "./catalog/packages.js";
import patientPackagesRouter from "./catalog/patient-packages.js";
import treatmentPlanProceduresRouter from "./catalog/treatment-plan-procedures.js";

// Financial domain
import financialRouter from "./financial/financial.js";
import recurringExpensesRouter from "./financial/recurring-expenses.js";
import patientWalletRouter, { walletListRouter } from "./financial/patient-wallet.js";
import subscriptionsRouter from "./financial/subscriptions.js";
import reportsRouter from "./financial/reports.js";

// SaaS (plans, billing of the platform itself)
import saasPlanRouter from "./saas/saas-plans.js";
import couponsRouter from "./saas/coupons.js";

// Admin / governance
import clinicsRouter from "./admin/clinics.js";
import usersRouter from "./admin/users.js";
import auditLogRouter from "./admin/audit-log.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/public", publicRouter);
router.use("/auth", authRouter);

// Admin
router.use("/clinics", clinicsRouter);
router.use("/users", usersRouter);
router.use("/audit-log", auditLogRouter);

// Clinical
router.use("/patients", patientsRouter);
router.use("/patients/:patientId", medicalRecordsRouter);
router.use("/patients/:patientId", patientJourneyRouter);
router.use("/patients/:patientId/photos", patientPhotosRouter);
router.use("/patients/:patientId/packages", patientPackagesRouter);
router.use("/patients/:patientId", patientWalletRouter);
router.use("/", walletListRouter);
router.use("/appointments", appointmentsRouter);
router.use("/schedules", schedulesRouter);
router.use("/blocked-slots", blockedSlotsRouter);

// Catalog
router.use("/procedures", proceduresRouter);
router.use("/packages", packagesRouter);
router.use("/treatment-plans/:planId/procedures", treatmentPlanProceduresRouter);

// Financial
router.use("/financial", financialRouter);
router.use("/recurring-expenses", recurringExpensesRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/reports", reportsRouter);

// Cross-cutting
router.use("/dashboard", dashboardRouter);
router.use("/storage", storageRouter);

// SaaS (mounted at root because they declare their own paths)
router.use("/", couponsRouter);
router.use("/", saasPlanRouter);

export default router;
