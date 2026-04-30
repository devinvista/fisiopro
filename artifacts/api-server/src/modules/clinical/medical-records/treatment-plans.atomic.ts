/**
 * Sprint 15 (F1) — Orquestrador atômico de aceite + materialização.
 *
 * Encapsula o novo fluxo onde:
 *
 *   itens → cobrança → AGENDA → CONTRATO → ACEITE → materialização atômica
 *
 * Em vez de o aceite contábil acontecer ANTES da escolha de horários
 * (fluxo legado, vide `medical-records.service.ts/acceptPatientTreatmentPlan`),
 * este orquestrador garante que:
 *
 *   1) o plano só é aceito se a agenda já estiver configurada (validação prévia);
 *   2) aceite + materialização rodam em sequência e, em caso de falha do
 *      segundo passo, o aceite é REVERTIDO (rollback explícito) — restaurando
 *      o plano ao estado de "rascunho".
 *
 * Endpoints legados (`POST /accept` + `POST /materialize`) continuam funcionando
 * para backward compatibility — esta é uma camada NOVA, não um retrofit.
 *
 * Idempotência:
 *   - Se o plano já foi aceito E materializado, retorna o estado atual sem
 *     reprocessar (200 OK). Não lança.
 *   - Se aceito mas não materializado (estado intermediário do fluxo legado),
 *     apenas materializa.
 */
import { db } from "@workspace/db";
import {
  treatmentPlansTable,
  treatmentPlanProceduresTable,
  packagesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { HttpError } from "../../../utils/httpError.js";
import {
  acceptPatientTreatmentPlan,
  type AcceptanceTrailInput,
  type AuthCtx,
} from "./medical-records.service.js";
import {
  materializeTreatmentPlan,
  dematerializeTreatmentPlan,
  type MaterializeOptions,
  type MaterializeResult,
} from "./treatment-plans.materialization.js";
import { resolveItemKind } from "./treatment-plans.acceptance.js";

export interface AtomicAcceptInput {
  patientId: number;
  planId: number;
  ctx: AuthCtx;
  trail: AcceptanceTrailInput;
  materializeOpts?: MaterializeOptions;
}

export interface AtomicAcceptResult {
  ok: true;
  planId: number;
  acceptance: {
    acceptedAt: string | null;
    via: string;
  };
  materialization: MaterializeResult;
  /** Quando true, o plano já estava aceito antes desta chamada. */
  wasAlreadyAccepted: boolean;
  /** Quando true, o plano já estava materializado antes desta chamada. */
  wasAlreadyMaterialized: boolean;
}

export interface ValidationError {
  itemId?: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

interface ItemForValidation {
  id: number;
  kind: string | null;
  packageId: number | null;
  packageType: string | null;
  weekDays: string | null;
  defaultStartTime: string | null;
  startTimesByDay: string | null;
  scheduleId: number | null;
  procedureId: number | null;
  packageProcedureId: number | null;
  totalSessions: number | null;
  unitMonthlyPrice: string | null;
  unitPrice: string | null;
}

/**
 * Valida pré-condições do plano para aceite atômico:
 *
 *  - Plano tem `startDate` e `durationMonths` (ou usa fallbacks).
 *  - Tem ≥ 1 item.
 *  - Itens recorrentes/pacotes têm `weekDays` (≥1) + cobertura de horário
 *    (mapa por dia OU defaultStartTime) + scheduleId.
 *  - Itens avulsos (sem agenda recorrente) são permitidos: não geram
 *    appointment, apenas faturas mensais estimadas.
 *
 * Retorna lista detalhada de problemas para a UI mostrar mensagens
 * acionáveis.
 */
export async function validatePlanForAtomicAccept(
  planId: number,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  const [plan] = await db
    .select({
      id: treatmentPlansTable.id,
      startDate: treatmentPlansTable.startDate,
      durationMonths: treatmentPlansTable.durationMonths,
      acceptedAt: treatmentPlansTable.acceptedAt,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);

  if (!plan) {
    errors.push({ field: "plan", message: `Plano #${planId} não encontrado.` });
    return { ok: false, errors };
  }

  if (!plan.startDate) {
    errors.push({
      field: "startDate",
      message: "Defina a data de início do plano antes de aceitar.",
    });
  }

  const items: ItemForValidation[] = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      kind: treatmentPlanProceduresTable.kind,
      packageId: treatmentPlanProceduresTable.packageId,
      weekDays: treatmentPlanProceduresTable.weekDays,
      defaultStartTime: treatmentPlanProceduresTable.defaultStartTime,
      startTimesByDay: treatmentPlanProceduresTable.startTimesByDay,
      scheduleId: treatmentPlanProceduresTable.scheduleId,
      procedureId: treatmentPlanProceduresTable.procedureId,
      totalSessions: treatmentPlanProceduresTable.totalSessions,
      unitMonthlyPrice: treatmentPlanProceduresTable.unitMonthlyPrice,
      unitPrice: treatmentPlanProceduresTable.unitPrice,
      packageType: packagesTable.packageType,
      packageProcedureId: packagesTable.procedureId,
    })
    .from(treatmentPlanProceduresTable)
    .leftJoin(packagesTable, eq(packagesTable.id, treatmentPlanProceduresTable.packageId))
    .where(eq(treatmentPlanProceduresTable.treatmentPlanId, planId));

  if (items.length === 0) {
    errors.push({
      field: "items",
      message: "Adicione ao menos um procedimento ao plano antes de aceitar.",
    });
    return { ok: items.length > 0 && errors.length === 0, errors };
  }

  for (const item of items) {
    const kind = resolveItemKind({
      kind: item.kind,
      packageId: item.packageId,
      packageType: item.packageType,
    });

    // Avulsos (sem pacote) NÃO precisam de agenda recorrente — são
    // contabilizados como faturas mensais estimadas + appointments criados
    // sob demanda. Permitimos seguir sem weekDays/horários.
    if (kind === "avulso") {
      const hasPrice = Number(item.unitPrice ?? 0) > 0;
      if (!hasPrice) {
        errors.push({
          itemId: item.id,
          field: "unitPrice",
          message: `Item #${item.id} (avulso) sem preço unitário definido.`,
        });
      }
      continue;
    }

    // Recorrentes mensais e pacotes de sessões PRECISAM de agenda configurada.
    const weekDays = parseWeekDaysSafe(item.weekDays);
    if (weekDays.length === 0) {
      errors.push({
        itemId: item.id,
        field: "weekDays",
        message:
          `Item #${item.id} (${kind === "recorrenteMensal" ? "mensalidade" : "pacote"}) ` +
          "sem dias da semana configurados.",
      });
      continue;
    }

    const startMap = parseStartTimesByDaySafe(item.startTimesByDay);
    const missing: string[] = [];
    for (const dayKey of weekDays) {
      const hasMapTime = startMap[dayKey] && /^\d{2}:\d{2}$/.test(startMap[dayKey]);
      const hasDefaultTime =
        item.defaultStartTime && /^\d{2}:\d{2}$/.test(item.defaultStartTime);
      if (!hasMapTime && !hasDefaultTime) {
        missing.push(dayKey);
      }
    }
    if (missing.length > 0) {
      errors.push({
        itemId: item.id,
        field: "startTimes",
        message: `Item #${item.id} sem horário definido para: ${missing.join(", ")}.`,
      });
    }

    if (!item.scheduleId) {
      errors.push({
        itemId: item.id,
        field: "scheduleId",
        message: `Item #${item.id} sem agenda (consultório/sala) selecionada.`,
      });
    }

    if (kind === "recorrenteMensal") {
      const hasMonthlyPrice = Number(item.unitMonthlyPrice ?? 0) > 0;
      if (!hasMonthlyPrice) {
        // Pode estar vivo no `packages.monthly_price` — não bloqueia aqui;
        // o materializeTreatmentPlan cuida do fallback. Apenas avisamos.
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseWeekDaysSafe(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((v) => typeof v === "string")
        .map((s: string) => s.toLowerCase());
    }
  } catch {
    /* ignore */
  }
  return [];
}

function parseStartTimesByDaySafe(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[String(k).toLowerCase()] = v;
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Aceita o plano e o materializa em uma única operação. Em caso de falha
 * na materialização, reverte o aceite via `dematerializeTreatmentPlan` +
 * `revertPlanAcceptance` para restaurar o estado de rascunho.
 *
 * Os dois passos NÃO compartilham uma única transação Postgres — a
 * `materializeTreatmentPlan` mantém sua própria transação interna, e o
 * aceite (`acceptPatientTreatmentPlan` → `acceptPlanFinancials`) também.
 * O rollback compensatório é feito em código, com idempotência forte
 * garantida por:
 *
 *   - `dematerializeTreatmentPlan` apaga `financial_records.status='pendente'`
 *     vinculados ao plano + journal entries correspondentes (cobre tanto
 *     o que `acceptPlanFinancials` postou quanto o que `materialize` criou).
 *   - `revertPlanAcceptance` zera `acceptedAt`, `frozenPricesJson`, trilha
 *     LGPD e `acceptedClausesJson` no `treatment_plans`.
 *
 * Quando todas as faturas estão `pendente` (que é o estado normal logo
 * após aceite), a soma desses dois rollbacks é equivalente a "como se
 * nada tivesse acontecido". Se alguma fatura estiver `pago` (caso raro
 * em rollback automático imediato), preservamos para evitar perda contábil
 * — esses casos exigem cancelTreatmentPlan manual.
 */
export async function acceptAndMaterializePlan(
  input: AtomicAcceptInput,
): Promise<AtomicAcceptResult> {
  const { patientId, planId, ctx, trail, materializeOpts } = input;

  // 1) Validação prévia. Falhas aqui são 400 (não chegam a tocar nada).
  const validation = await validatePlanForAtomicAccept(planId);
  if (!validation.ok) {
    throw HttpError.badRequest(
      "Plano não está pronto para aceite atômico — verifique a configuração da agenda e cobrança.",
      { code: "atomic_validation_failed", errors: validation.errors },
    );
  }

  // 2) Carrega estado atual para detectar idempotência.
  const [planBefore] = await db
    .select({
      id: treatmentPlansTable.id,
      acceptedAt: treatmentPlansTable.acceptedAt,
      materializedAt: treatmentPlansTable.materializedAt,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!planBefore) throw HttpError.notFound("Plano não encontrado.");

  const wasAlreadyAccepted = planBefore.acceptedAt != null;
  const wasAlreadyMaterialized = planBefore.materializedAt != null;

  // Se já está totalmente processado, devolve sem fazer nada.
  if (wasAlreadyAccepted && wasAlreadyMaterialized) {
    return {
      ok: true,
      planId,
      acceptance: {
        acceptedAt: planBefore.acceptedAt!.toISOString(),
        via: trail.via ?? "presencial",
      },
      materialization: {
        planId,
        appointmentsCreated: 0,
        invoicesCreated: 0,
        monthsCovered: 0,
        totalContractedAmount: "0.00",
      },
      wasAlreadyAccepted,
      wasAlreadyMaterialized,
    };
  }

  // 3) Aceite (idempotente: se já aceito retorna o plano sem reprocessar).
  let acceptedPlan: any;
  if (!wasAlreadyAccepted) {
    acceptedPlan = await acceptPatientTreatmentPlan(patientId, planId, ctx, trail);
  } else {
    acceptedPlan = planBefore;
  }

  // 4) Materialização. Em caso de falha, rollback compensatório.
  let materialization: MaterializeResult;
  try {
    materialization = await materializeTreatmentPlan(planId, materializeOpts ?? {});
  } catch (err) {
    // Rollback: limpa appointments + faturas pendentes + journal entries.
    // Depois reseta `acceptedAt` e snapshot do plano.
    try {
      await dematerializeTreatmentPlan(planId);
    } catch (rollbackErr) {
      // Se o rollback de materialização falhar, mantemos o estado e
      // anexamos a info à mensagem original — operador precisa intervir.
      throw new HttpError(
        500,
        `Falha ao materializar e ao reverter: ${(err as Error).message} | rollback: ${(rollbackErr as Error).message}`,
        { error: "atomic_rollback_failed" },
      );
    }
    if (!wasAlreadyAccepted) {
      try {
        await revertPlanAcceptance(planId);
      } catch (rollbackErr) {
        throw new HttpError(
          500,
          `Materialização falhou e dematerialização ok, mas reverter aceite falhou: ${(rollbackErr as Error).message}`,
          { error: "atomic_rollback_partial" },
        );
      }
    }
    throw HttpError.badRequest(
      `Falha ao materializar o plano: ${(err as Error).message}. Aceite revertido — corrija a configuração e tente de novo.`,
      { code: "atomic_materialize_failed" },
    );
  }

  // 5) Recarrega plano para pegar `acceptedAt` definitivo.
  const [planAfter] = await db
    .select({
      acceptedAt: treatmentPlansTable.acceptedAt,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);

  return {
    ok: true,
    planId,
    acceptance: {
      acceptedAt: planAfter?.acceptedAt?.toISOString() ?? null,
      via: trail.via ?? "presencial",
    },
    materialization,
    wasAlreadyAccepted,
    wasAlreadyMaterialized,
  };
}

/**
 * Reverte o aceite de um plano, retornando-o ao estado "rascunho":
 *  - `acceptedAt = null`
 *  - `acceptedBy = null`
 *  - `frozenPricesJson = null`
 *  - `acceptedClausesJson = null`
 *  - apaga trilha LGPD (signature/ip/device/via).
 *
 * NÃO toca em `financial_records` ou journal entries — assumimos que o
 * caller já chamou `dematerializeTreatmentPlan` antes para limpar isso.
 *
 * Uso esperado: rollback compensatório do `acceptAndMaterializePlan`
 * quando a materialização falha. NÃO é exposto como endpoint — usar
 * `cancelTreatmentPlan` para cancelamento operacional.
 */
export async function revertPlanAcceptance(planId: number): Promise<void> {
  await db
    .update(treatmentPlansTable)
    .set({
      acceptedAt: null,
      acceptedBy: null,
      frozenPricesJson: null,
      acceptedClausesJson: null,
      acceptedBySignature: null,
      acceptedIp: null,
      acceptedDevice: null,
      acceptedVia: null,
    })
    .where(eq(treatmentPlansTable.id, planId));
}
