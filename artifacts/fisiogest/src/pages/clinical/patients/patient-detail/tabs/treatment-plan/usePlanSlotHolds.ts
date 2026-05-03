/**
 * Hook para reservar slots do plano antes do aceite.
 *
 * Combina o preview da agenda (`/preview-appointments`) + scheduleId/procedureId
 * dos items + endpoint POST /holds para reservar os horários por TTL=15min.
 *
 * O resultado é uma promise que resolve `{ ok, conflicts? }`. Quando há
 * conflito (409), devolvemos a lista para a UI mostrar — não fazemos toast
 * aqui para deixar o caller decidir UX.
 */
import { apiFetch, apiFetchJson } from "@/lib/api";

export interface PlanItemForHold {
  id: number;
  scheduleId?: number | null;
  packageProcedureId?: number | null;
  procedureId?: number | null;
}

export interface HoldSlotPayload {
  itemId: number;
  date: string;
  startTime: string;
  endTime: string;
  scheduleId: number;
  procedureId: number;
}

export interface PlanHoldConflict {
  source: "appointment" | "hold";
  conflictingPlanId?: number;
  conflictingAppointmentId?: number;
  slot: HoldSlotPayload;
  message: string;
}

export interface PlanHoldResult {
  ok: boolean;
  conflicts?: PlanHoldConflict[];
  expiresAt?: string;
  ttlSecondsRemaining?: number;
}

interface PreviewAppointment {
  date: string;
  startTime: string;
  endTime: string;
  itemId: number;
}

interface PreviewResponse {
  appointments: PreviewAppointment[];
}

/**
 * Reserva (cria/renova hold) para todos os slots que serão materializados.
 * Faz preview → mapeia → POST /holds. Idempotente: chamadas repetidas
 * substituem hold anterior.
 *
 * @returns ok=true em sucesso ou ok=false + conflicts em 409.
 *          Erros HTTP "outros" são re-throw.
 */
export async function reservePlanSlots(
  patientId: number,
  planId: number,
  planItems: PlanItemForHold[],
  ttlMinutes?: number,
): Promise<PlanHoldResult> {
  // 1) Preview dos appointments do plano (read-only, sem persistência).
  const preview = await apiFetchJson<PreviewResponse>(
    `/api/patients/${patientId}/treatment-plans/${planId}/preview-appointments`,
  );

  if (!preview.appointments || preview.appointments.length === 0) {
    // Plano sem slots para reservar (ex.: tudo avulso sem agenda) — ok no-op.
    return { ok: true, conflicts: [] };
  }

  // 2) Resolve scheduleId + procedureId de cada slot via lookup nos items.
  //    Items SEM scheduleId (mensalidades sem agenda) são ignorados — não há
  //    slot real para reservar.
  const itemIndex = new Map<number, PlanItemForHold>();
  for (const it of planItems) itemIndex.set(it.id, it);

  const slots: HoldSlotPayload[] = [];
  for (const a of preview.appointments) {
    const item = itemIndex.get(a.itemId);
    if (!item) continue;
    if (item.scheduleId == null) continue;
    const procedureId = item.packageProcedureId ?? item.procedureId;
    if (procedureId == null) continue;
    slots.push({
      itemId: a.itemId,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      scheduleId: item.scheduleId,
      procedureId,
    });
  }

  if (slots.length === 0) return { ok: true, conflicts: [] };

  // 3) POST /holds usando apiFetch direto — precisamos do status cru para
  //    distinguir 409 (conflito esperado, devolvemos conflicts) de outros
  //    erros (re-throw).
  const res = await apiFetch(
    `/api/patients/${patientId}/treatment-plans/${planId}/holds`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots, ttlMinutes }),
    },
  );

  let body: unknown = null;
  try { body = await res.json(); } catch { /* sem body */ }

  if (res.status === 409) {
    const conflicts =
      (body as { issues?: { conflicts?: PlanHoldConflict[] } } | null)
        ?.issues?.conflicts ?? [];
    return { ok: false, conflicts };
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string } | null)?.message ??
      `Falha ao reservar horários (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const ok = body as { expiresAt?: string; ttlSecondsRemaining?: number } | null;
  return {
    ok: true,
    expiresAt: ok?.expiresAt,
    ttlSecondsRemaining: ok?.ttlSecondsRemaining,
  };
}

/** Libera o hold do plano. Idempotente. */
export async function releasePlanHold(
  patientId: number,
  planId: number,
): Promise<void> {
  try {
    await apiFetch(
      `/api/patients/${patientId}/treatment-plans/${planId}/holds`,
      { method: "DELETE" },
    );
  } catch {
    /* ignora — hold inexistente é idempotente */
  }
}
