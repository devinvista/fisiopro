import { Response, NextFunction } from "express";
import { planHasFeature, type Feature } from "@workspace/db";
import type { AuthRequest } from "./auth.js";
import { getPlanLimits } from "./subscription.js";

/**
 * Bloqueia acesso a uma rota se o plano da clínica logada não inclui a feature.
 *
 * - SuperAdmin sempre passa.
 * - Carrega `subscriptionInfo` sob demanda se ainda não estiver populada.
 * - Fonte de verdade da matriz de features: `subscriptionInfo.features`, que já
 *   foi resolvida via `resolvePlanFeatures(planName, plan.features)` — ou seja,
 *   considera primeiro a coluna jsonb e cai no hardcoded como default.
 * - Sem `clinicId` → libera (compat com rotas pré-multiclínica). Para
 *   fail-closed, troque para `return res.status(403).json(...)`.
 */
export function requireFeature(feature: Feature) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.isSuperAdmin) return next();

    if (!req.subscriptionInfo && req.clinicId) {
      req.subscriptionInfo = await getPlanLimits(req.clinicId);
    }

    const info = req.subscriptionInfo;
    const planName = info?.planName ?? null;
    if (!planName) return next();

    // Preferência: array já resolvido no middleware de subscription
    // (DB → fallback hardcoded). Se por qualquer motivo não estiver presente,
    // cai diretamente no hardcoded para nunca abrir a rota indevidamente.
    const allowed = info?.features
      ? info.features.includes(feature)
      : planHasFeature(planName, feature);

    if (!allowed) {
      res.status(403).json({
        error: "Forbidden",
        planRestricted: true,
        feature,
        currentPlan: planName,
        message: `Recurso "${feature}" indisponível no plano ${planName}. Faça upgrade para acessar.`,
      });
      return;
    }
    next();
  };
}
