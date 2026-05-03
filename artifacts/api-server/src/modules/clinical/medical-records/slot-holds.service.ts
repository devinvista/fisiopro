/**
 * Sistema de holds para slots da agenda do plano.
 *
 * Entre o passo "Agenda" e o "Contrato + aceite atômico", o paciente/operador
 * escolhe horários que ainda não viraram appointments reais. Este módulo
 * impede que outro paciente roube esses slots durante a janela de aceite.
 *
 * Design:
 *   - Holds vivem como JSON na coluna `treatment_plans.slot_holds_json` +
 *     timestamp `slot_holds_expires_at` (TTL default 15min).
 *   - Quando criamos/renovamos hold de um plano, validamos que cada slot:
 *       (a) não conflita com appointment EXISTENTE não-cancelado/faltou/remarcado;
 *       (b) não conflita com hold VIVO (`expires_at > now()`) de OUTRO plano.
 *   - Conflito = mesma `(date, scheduleId)` E intervalos `[start,end)` se
 *     sobrepõem.
 *   - Se algum slot conflita, NADA é persistido — devolvemos a lista para
 *     a UI mostrar e o usuário escolher outro horário.
 *
 * Idempotência: criar hold sobre um plano que já tem hold ATIVO
 * SUBSTITUI o anterior (não acumula). É a UI quem rebatiza o array
 * completo a cada mudança.
 *
 * Holds expirados: a query de conflito filtra por `expires_at > now()`,
 * então holds mortos não bloqueiam mesmo antes do cleanup. O job
 * `slotHoldsCleanup` apenas reduz o tamanho da tabela.
 */
import { db } from "@workspace/db";
import {
  treatmentPlansTable,
  appointmentsTable,
  treatmentPlanProceduresTable,
} from "@workspace/db";
import { and, eq, ne, sql, isNotNull, inArray } from "drizzle-orm";
import { HttpError } from "../../../utils/httpError.js";
import { enumeratePlanAppointments } from "./treatment-plans.preview.js";

/** TTL padrão de um hold em minutos — combinado com a UX do wizard. */
export const DEFAULT_HOLD_TTL_MINUTES = 30;

/** Janela máxima permitida (evita holds eternos por bug de cliente). */
export const MAX_HOLD_TTL_MINUTES = 120;

export interface HoldSlot {
  /** ID do `treatment_plan_procedures` ao qual o slot pertence. */
  itemId: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  /** ID da `schedules` (consultório/sala). */
  scheduleId: number;
  /** ID do procedimento (resolvido — pacote OU item próprio). */
  procedureId: number;
}

export interface HoldConflict {
  /** Origem do conflito. */
  source: "appointment" | "hold";
  /** ID do plano dono do hold conflitante (apenas quando `source='hold'`). */
  conflictingPlanId?: number;
  /** ID do appointment conflitante (apenas quando `source='appointment'`). */
  conflictingAppointmentId?: number;
  /** Slot do plano corrente que falhou. */
  slot: HoldSlot;
  /** Mensagem amigável para a UI. */
  message: string;
}

export interface HoldStatus {
  /** Slots em hold. Vazio quando não há hold ativo. */
  slots: HoldSlot[];
  /** ISO timestamp de expiração; null quando inexistente/expirado. */
  expiresAt: string | null;
  /** Segundos restantes (>= 0) ou null se inexistente/expirado. */
  ttlSecondsRemaining: number | null;
}

// ─── Helpers de tempo (HH:MM) ─────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** True se [aStart,aEnd) ∩ [bStart,bEnd) ≠ ∅. */
function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) &&
         timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/** True se dois slots compartilham (date, scheduleId) E overlap temporal. */
function slotsConflict(a: HoldSlot, b: HoldSlot): boolean {
  if (a.date !== b.date) return false;
  if (a.scheduleId !== b.scheduleId) return false;
  return intervalsOverlap(a.startTime, a.endTime, b.startTime, b.endTime);
}

// ─── Parsing seguro do JSON persistido ────────────────────────────────────

function parseHoldsSafe(raw: string | null | undefined): HoldSlot[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((h): h is HoldSlot =>
      h && typeof h === "object" &&
      typeof h.itemId === "number" &&
      typeof h.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) &&
      typeof h.startTime === "string" && /^\d{2}:\d{2}$/.test(h.startTime) &&
      typeof h.endTime === "string" && /^\d{2}:\d{2}$/.test(h.endTime) &&
      typeof h.scheduleId === "number" &&
      typeof h.procedureId === "number",
    );
  } catch {
    return [];
  }
}

// ─── Validação de input ───────────────────────────────────────────────────

function validateSlotShape(s: unknown): HoldSlot {
  if (!s || typeof s !== "object") {
    throw HttpError.badRequest("slot inválido", { code: "invalid_slot" });
  }
  const slot = s as Record<string, unknown>;
  const itemId = Number(slot.itemId);
  const scheduleId = Number(slot.scheduleId);
  const procedureId = Number(slot.procedureId);
  const date = String(slot.date ?? "");
  const startTime = String(slot.startTime ?? "");
  const endTime = String(slot.endTime ?? "");
  if (
    !Number.isFinite(itemId) || itemId <= 0 ||
    !Number.isFinite(scheduleId) || scheduleId <= 0 ||
    !Number.isFinite(procedureId) || procedureId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime) ||
    timeToMinutes(startTime) >= timeToMinutes(endTime)
  ) {
    throw HttpError.badRequest(
      "Slot mal formatado: itemId/scheduleId/procedureId numéricos, date YYYY-MM-DD, startTime/endTime HH:MM com end > start.",
      { code: "invalid_slot" },
    );
  }
  return { itemId, date, startTime, endTime, scheduleId, procedureId };
}

// ─── Conflitos com appointments existentes ────────────────────────────────

interface AppointmentRow {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  scheduleId: number | null;
}

async function findConflictingAppointments(
  slots: HoldSlot[],
): Promise<Array<{ slot: HoldSlot; appointmentId: number }>> {
  if (slots.length === 0) return [];

  // Otimização: agrupa por date para uma única query por data distinta.
  const dates = Array.from(new Set(slots.map((s) => s.date)));
  const scheduleIds = Array.from(new Set(slots.map((s) => s.scheduleId)));

  const rows: AppointmentRow[] = await db
    .select({
      id: appointmentsTable.id,
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
      scheduleId: appointmentsTable.scheduleId,
    })
    .from(appointmentsTable)
    .where(
      and(
        inArray(appointmentsTable.date, dates),
        inArray(appointmentsTable.scheduleId, scheduleIds),
        sql`${appointmentsTable.status} NOT IN ('cancelado','faltou','remarcado')`,
      ),
    );

  const out: Array<{ slot: HoldSlot; appointmentId: number }> = [];
  for (const slot of slots) {
    const hit = rows.find(
      (r) =>
        r.date === slot.date &&
        r.scheduleId === slot.scheduleId &&
        intervalsOverlap(slot.startTime, slot.endTime, r.startTime, r.endTime),
    );
    if (hit) out.push({ slot, appointmentId: hit.id });
  }
  return out;
}

// ─── Conflitos com holds vivos de outros planos ───────────────────────────

interface OtherPlanHoldRow {
  planId: number;
  json: string | null;
  expiresAt: Date | null;
}

async function loadLiveHoldsExcept(planId: number): Promise<OtherPlanHoldRow[]> {
  const rows = await db
    .select({
      planId: treatmentPlansTable.id,
      json: treatmentPlansTable.slotHoldsJson,
      expiresAt: treatmentPlansTable.slotHoldsExpiresAt,
    })
    .from(treatmentPlansTable)
    .where(
      and(
        ne(treatmentPlansTable.id, planId),
        isNotNull(treatmentPlansTable.slotHoldsJson),
        sql`${treatmentPlansTable.slotHoldsExpiresAt} > NOW()`,
      ),
    );
  return rows;
}

async function findConflictingHolds(
  slots: HoldSlot[],
  excludePlanId: number,
): Promise<Array<{ slot: HoldSlot; planId: number }>> {
  if (slots.length === 0) return [];
  const others = await loadLiveHoldsExcept(excludePlanId);
  if (others.length === 0) return [];
  const out: Array<{ slot: HoldSlot; planId: number }> = [];
  for (const slot of slots) {
    for (const other of others) {
      const otherSlots = parseHoldsSafe(other.json);
      const hit = otherSlots.find((b) => slotsConflict(slot, b));
      if (hit) {
        out.push({ slot, planId: other.planId });
        break; // 1 conflito por slot é suficiente para a UI
      }
    }
  }
  return out;
}

// ─── API pública ──────────────────────────────────────────────────────────

export interface CreateHoldsResult {
  ok: true;
  planId: number;
  slots: HoldSlot[];
  expiresAt: string;
  ttlSecondsRemaining: number;
}

/**
 * Cria ou renova holds para um plano. Substitui qualquer hold anterior do
 * MESMO plano (idempotente). Falha (409) se algum slot conflita com
 * appointment existente OU com hold vivo de outro plano.
 */
export async function createOrRenewHolds(
  planId: number,
  rawSlots: unknown[],
  ttlMinutes: number = DEFAULT_HOLD_TTL_MINUTES,
): Promise<CreateHoldsResult> {
  if (!Number.isFinite(planId) || planId <= 0) {
    throw HttpError.badRequest("planId inválido");
  }
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    throw HttpError.badRequest(
      "Envie pelo menos um slot em `slots`.",
      { code: "no_slots" },
    );
  }
  const ttl = Math.min(
    MAX_HOLD_TTL_MINUTES,
    Math.max(1, Math.round(Number(ttlMinutes) || DEFAULT_HOLD_TTL_MINUTES)),
  );

  // 1) Valida shape dos slots e que pertencem a items do plano.
  const slots = rawSlots.map(validateSlotShape);
  const itemIds = Array.from(new Set(slots.map((s) => s.itemId)));
  const items = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      treatmentPlanId: treatmentPlanProceduresTable.treatmentPlanId,
    })
    .from(treatmentPlanProceduresTable)
    .where(inArray(treatmentPlanProceduresTable.id, itemIds));
  for (const id of itemIds) {
    const it = items.find((x) => x.id === id);
    if (!it) {
      throw HttpError.badRequest(
        `Item #${id} não encontrado.`,
        { code: "invalid_item" },
      );
    }
    if (it.treatmentPlanId !== planId) {
      throw HttpError.badRequest(
        `Item #${id} não pertence ao plano #${planId}.`,
        { code: "item_plan_mismatch" },
      );
    }
  }

  // 2) Valida que o plano existe e ainda não foi materializado (hold em
  //    plano materializado não faz sentido — os appointments já existem).
  const [plan] = await db
    .select({
      id: treatmentPlansTable.id,
      materializedAt: treatmentPlansTable.materializedAt,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!plan) throw HttpError.notFound("Plano não encontrado.");
  if (plan.materializedAt) {
    throw HttpError.badRequest(
      "Plano já materializado — holds não se aplicam.",
      { code: "plan_already_materialized" },
    );
  }

  // 3) Detecta conflitos (appointments + holds de outros planos).
  const [aptHits, holdHits] = await Promise.all([
    findConflictingAppointments(slots),
    findConflictingHolds(slots, planId),
  ]);
  if (aptHits.length > 0 || holdHits.length > 0) {
    const conflicts: HoldConflict[] = [
      ...aptHits.map(({ slot, appointmentId }) => ({
        source: "appointment" as const,
        conflictingAppointmentId: appointmentId,
        slot,
        message: `Horário ${slot.date} ${slot.startTime} já tem consulta marcada nesta agenda.`,
      })),
      ...holdHits.map(({ slot, planId: otherPlanId }) => ({
        source: "hold" as const,
        conflictingPlanId: otherPlanId,
        slot,
        message: `Horário ${slot.date} ${slot.startTime} foi reservado por outro plano em andamento.`,
      })),
    ];
    throw new HttpError(
      409,
      "Slots conflitantes — escolha outros horários.",
      { issues: { code: "slot_conflict", conflicts } },
    );
  }

  // 4) Persiste. Substitui hold anterior do mesmo plano.
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
  await db
    .update(treatmentPlansTable)
    .set({
      slotHoldsJson: JSON.stringify(slots),
      slotHoldsExpiresAt: expiresAt,
    })
    .where(eq(treatmentPlansTable.id, planId));

  return {
    ok: true,
    planId,
    slots,
    expiresAt: expiresAt.toISOString(),
    ttlSecondsRemaining: ttl * 60,
  };
}

/** Libera (apaga) o hold do plano. No-op se não havia hold. */
export async function releaseHolds(planId: number): Promise<void> {
  await db
    .update(treatmentPlansTable)
    .set({ slotHoldsJson: null, slotHoldsExpiresAt: null })
    .where(eq(treatmentPlansTable.id, planId));
}

/** Lê estado atual do hold do plano. Retorna `slots=[]` se inexistente/expirado. */
export async function getHolds(planId: number): Promise<HoldStatus> {
  const [row] = await db
    .select({
      json: treatmentPlansTable.slotHoldsJson,
      expiresAt: treatmentPlansTable.slotHoldsExpiresAt,
    })
    .from(treatmentPlansTable)
    .where(eq(treatmentPlansTable.id, planId))
    .limit(1);
  if (!row) throw HttpError.notFound("Plano não encontrado.");
  const expiresAt = row.expiresAt;
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return { slots: [], expiresAt: null, ttlSecondsRemaining: null };
  }
  return {
    slots: parseHoldsSafe(row.json),
    expiresAt: expiresAt.toISOString(),
    ttlSecondsRemaining: Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    ),
  };
}

/**
 * Conflitos para a materialização do plano. Enumera o que será criado e
 * checa contra holds vivos de OUTROS planos. Usado pelo orquestrador
 * `acceptAndMaterializePlan` para falhar com 409 antes de materializar
 * (evita rollback caro).
 *
 * Não checa contra appointments — `materializeTreatmentPlan` já tem sua
 * própria validação de conflito.
 */
export async function findConflictsForPlanMaterialization(
  planId: number,
): Promise<HoldConflict[]> {
  const preview = await enumeratePlanAppointments(planId);
  if (preview.appointments.length === 0) return [];

  // Para checar holds, precisamos do scheduleId de cada slot. O preview já
  // contém date/startTime/endTime/itemId mas NÃO scheduleId — busca os
  // scheduleIds dos itens de uma vez.
  const itemIds = Array.from(new Set(preview.appointments.map((a) => a.itemId)));
  const itemRows = await db
    .select({
      id: treatmentPlanProceduresTable.id,
      scheduleId: treatmentPlanProceduresTable.scheduleId,
      procedureId: treatmentPlanProceduresTable.procedureId,
    })
    .from(treatmentPlanProceduresTable)
    .where(inArray(treatmentPlanProceduresTable.id, itemIds));
  const scheduleByItem = new Map<number, number | null>(
    itemRows.map((r) => [r.id, r.scheduleId]),
  );

  const slots: HoldSlot[] = preview.appointments
    .map((a) => {
      const sId = scheduleByItem.get(a.itemId);
      if (sId == null) return null; // sem agenda → mensalidades sem schedule
      return {
        itemId: a.itemId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        scheduleId: sId,
        procedureId: 0, // não usado na detecção
      } as HoldSlot;
    })
    .filter((s): s is HoldSlot => s !== null);

  if (slots.length === 0) return [];
  const hits = await findConflictingHolds(slots, planId);
  return hits.map(({ slot, planId: otherPlanId }) => ({
    source: "hold" as const,
    conflictingPlanId: otherPlanId,
    slot,
    message: `Horário ${slot.date} ${slot.startTime} foi reservado por outro plano em andamento.`,
  }));
}

/**
 * Limpa holds expirados. Idempotente. Retorna a quantidade de planos cujo
 * hold foi resetado. Holds expirados NÃO bloqueiam (queries filtram por
 * `expires_at > now()`), então isso é puramente higiene de dados.
 */
export async function purgeExpiredHolds(): Promise<{ cleared: number }> {
  const result = await db
    .update(treatmentPlansTable)
    .set({ slotHoldsJson: null, slotHoldsExpiresAt: null })
    .where(
      and(
        isNotNull(treatmentPlansTable.slotHoldsJson),
        sql`${treatmentPlansTable.slotHoldsExpiresAt} <= NOW()`,
      ),
    )
    .returning({ id: treatmentPlansTable.id });
  return { cleared: result.length };
}
