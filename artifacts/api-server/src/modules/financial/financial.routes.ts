/**
 * financial.routes — montador fino do módulo financeiro.
 *
 * Subáreas (cada arquivo registra suas próprias rotas relativas):
 *  - dashboard/   → GET /dashboard
 *  - records/     → CRUD + status + estorno em /records
 *  - payments/    → /patients/:patientId/{history, summary, payment, credits, subscriptions}
 *  - analytics/   → /cost-per-procedure, /dre
 *  - projection/  → /cash-flow-projection
 */
import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import dashboardRoutes from "./dashboard/financial-dashboard.routes.js";
import recordsRoutes from "./records/financial-records.routes.js";
import paymentsRoutes from "./payments/financial-payments.routes.js";
import analyticsRoutes from "./analytics/financial-analytics.routes.js";
import projectionRoutes from "./projection/cash-flow-projection.routes.js";
import accountingRoutes from "./accounting/accounting.routes.js";

const router = Router();
router.use(authMiddleware);

router.use(dashboardRoutes);
router.use(recordsRoutes);
router.use(paymentsRoutes);
router.use(analyticsRoutes);
router.use(projectionRoutes);
router.use(accountingRoutes);

export default router;
