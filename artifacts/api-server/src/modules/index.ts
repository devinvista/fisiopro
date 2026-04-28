import { Router, type IRouter } from "express";

// Cross-cutting / public
import healthRouter from "./health/health.routes.js";
import authRouter from "./auth/auth.routes.js";
import publicRouter from "./public/public.routes.js";
import dashboardRouter from "./dashboard/dashboard.routes.js";
import storageRouter from "./storage/storage.routes.js";

// Clinical domain
import patientsRouter from "./clinical/patients/patients.routes.js";
import appointmentsRouter from "./clinical/appointments/appointments.routes.js";
import schedulesRouter from "./clinical/schedules/schedules.routes.js";
import medicalRecordsRouter from "./clinical/medical-records/medical-records.routes.js";
import blockedSlotsRouter from "./clinical/blocked-slots/blocked-slots.routes.js";
import patientJourneyRouter from "./clinical/patient-journey/patient-journey.routes.js";
import patientPhotosRouter from "./clinical/patient-photos/patient-photos.routes.js";
import sessionCreditsRouter from "./clinical/session-credits/session-credits.routes.js";

// Catalog domain (procedures, packages)
import proceduresRouter from "./catalog/procedures/procedures.routes.js";
import packagesRouter from "./catalog/packages/packages.routes.js";
import patientPackagesRouter from "./catalog/patient-packages/patient-packages.routes.js";
import treatmentPlanProceduresRouter from "./catalog/treatment-plan-procedures/treatment-plan-procedures.routes.js";

// Financial domain
import financialRouter from "./financial/financial.routes.js";
import recurringExpensesRouter from "./financial/recurring-expenses/recurring-expenses.routes.js";
import clinicFinancialSettingsRouter from "./financial/settings/clinic-financial-settings.routes.js";
import patientWalletRouter, { walletListRouter } from "./financial/patient-wallet/patient-wallet.routes.js";
import subscriptionsRouter from "./financial/subscriptions/subscriptions.routes.js";
import reportsRouter from "./financial/reports/reports.routes.js";

// SaaS (plans, billing of the platform itself)
import saasPlanRouter from "./saas/saas-plans/saas-plans.routes.js";
import couponsRouter from "./saas/coupons/coupons.routes.js";
import saasBillingRouter from "./saas/billing/billing.routes.js";

// Webhooks (no auth, validated by gateway-specific tokens)
import webhooksRouter from "./webhooks/webhooks.routes.js";

// LGPD (políticas versionadas + portabilidade de dados)
import lgpdRouter from "./lgpd/lgpd.routes.js";

// Admin / governance
import clinicsRouter from "./admin/clinics/clinics.routes.js";
import usersRouter from "./admin/users/users.routes.js";
import auditLogRouter from "./admin/audit-log/audit-log.routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/public", publicRouter);
router.use("/auth", authRouter);

// Webhooks (sem auth — token validado dentro do handler).
// IMPORTANTE: precisa vir antes dos roteadores que aplicam authMiddleware no
// próprio router (ex.: saasBillingRouter montado em "/"), senão a auth global
// intercepta e o webhook nunca chega ao handler.
router.use("/webhooks", webhooksRouter);

// LGPD — endpoints públicos de leitura de política + autenticados (aceite e
// portabilidade). O router internamente aplica authMiddleware após as rotas
// públicas.
router.use("/lgpd", lgpdRouter);

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
router.use("/", sessionCreditsRouter); // GET /patients/:patientId/session-credits/statement
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
router.use("/clinics/current/financial-settings", clinicFinancialSettingsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/reports", reportsRouter);

// Cross-cutting
router.use("/dashboard", dashboardRouter);
router.use("/storage", storageRouter);

// SaaS (mounted at root because they declare their own paths)
router.use("/", couponsRouter);
router.use("/", saasPlanRouter);
router.use("/", saasBillingRouter);

export default router;
