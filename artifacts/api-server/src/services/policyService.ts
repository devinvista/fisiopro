/**
 * policyService — Políticas de agendamento por clínica
 *
 * Duas funções de execução com frequências distintas:
 *
 * runAutoConfirmPolicies() — a cada 15 minutos
 *   - Auto-confirmação: agendamentos com status "agendado" dentro da janela
 *     `autoConfirmHours` antes do horário marcado são confirmados pelo sistema.
 *
 * runEndOfDayPolicies() — uma vez ao final do dia (22:00 BRT)
 *   - No-show: agendamentos "agendado" ou "confirmado" do dia atual cujo horário
 *     já passou são marcados como "faltou". Garante tempo para ajustes manuais.
 *   - Taxa de no-show: se `noShowFeeEnabled`, gera lançamento financeiro de
 *     ausência para cada no-show detectado.
 *   - Auto-conclusão: agendamentos "compareceu" do dia atual cujo horário já
 *     passou são finalizados como "concluido".
 */

import { db } from "@workspace/db";
import {
  appointmentsTable,
  clinicsTable,
  patientsTable,
  proceduresTable,
  financialRecordsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logAudit } from "../utils/auditLog.js";
import { postReceivableRevenue } from "./accountingService.js";

export interface PolicyRunResult {
  autoConfirmed: number;
  autoCompleted: number;
  noShowMarked: number;
  noShowFeesGenerated: number;
  errors: number;
  details: Array<{ clinicId: number; action: string; appointmentId?: number; error?: string }>;
}

// ── Auto-confirmação — executa a cada 15 minutos ───────────────────────────

export async function runAutoConfirmPolicies(): Promise<PolicyRunResult> {
  const result: PolicyRunResult = {
    autoConfirmed: 0,
    autoCompleted: 0,
    noShowMarked: 0,
    noShowFeesGenerated: 0,
    errors: 0,
    details: [],
  };

  const clinics = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.isActive, true));

  for (const clinic of clinics) {
    try {
      if (!clinic.autoConfirmHours || clinic.autoConfirmHours <= 0) continue;

      const toAutoConfirm = await db
        .select({ id: appointmentsTable.id, patientId: appointmentsTable.patientId })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.clinicId, clinic.id),
            eq(appointmentsTable.status, "agendado"),
            sql`(
              (${appointmentsTable.date}::text || ' ' || ${appointmentsTable.startTime})::timestamp
              BETWEEN (NOW() AT TIME ZONE 'America/Sao_Paulo')
              AND ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '${sql.raw(String(clinic.autoConfirmHours))} hours')
            )`
          )
        );

      for (const appt of toAutoConfirm) {
        try {
          await db
            .update(appointmentsTable)
            .set({
              status: "confirmado",
              confirmedBy: "sistema",
              confirmedAt: new Date(),
            })
            .where(eq(appointmentsTable.id, appt.id));
          result.autoConfirmed++;
          result.details.push({ clinicId: clinic.id, action: "auto_confirmed", appointmentId: appt.id });
          await logAudit({
            userId: null,
            userName: "sistema",
            patientId: appt.patientId,
            action: "update",
            entityType: "appointment",
            entityId: appt.id,
            summary: "Status: agendado → confirmado (auto-confirmação pelo sistema)",
          });
        } catch (err: any) {
          result.errors++;
          result.details.push({ clinicId: clinic.id, action: "error", appointmentId: appt.id, error: String(err.message) });
        }
      }
    } catch (err: any) {
      result.errors++;
      result.details.push({ clinicId: clinic.id, action: "clinic_error", error: String(err.message) });
    }
  }

  return result;
}

// ── No-show + Auto-conclusão — executa ao final do dia (22:00 BRT) ─────────
// Processa apenas agendamentos do dia atual, garantindo que a equipe tenha
// o dia inteiro para preencher presenças e realizar ajustes manuais.

export async function runEndOfDayPolicies(): Promise<PolicyRunResult> {
  const result: PolicyRunResult = {
    autoConfirmed: 0,
    autoCompleted: 0,
    noShowMarked: 0,
    noShowFeesGenerated: 0,
    errors: 0,
    details: [],
  };

  const clinics = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.isActive, true));

  for (const clinic of clinics) {
    try {
      // ── NO-SHOW DETECTION ────────────────────────────────────────────────
      // Apenas agendamentos de hoje cujo horário já passou
      const noShowCandidates = await db
        .select({
          id: appointmentsTable.id,
          patientId: appointmentsTable.patientId,
          procedureId: appointmentsTable.procedureId,
          date: appointmentsTable.date,
          endTime: appointmentsTable.endTime,
        })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.clinicId, clinic.id),
            inArray(appointmentsTable.status, ["agendado", "confirmado"]),
            sql`${appointmentsTable.date} = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
            sql`(
              (${appointmentsTable.date}::text || ' ' || ${appointmentsTable.endTime})::timestamp
              < NOW() AT TIME ZONE 'America/Sao_Paulo'
            )`
          )
        );

      for (const appt of noShowCandidates) {
        try {
          await db
            .update(appointmentsTable)
            .set({ status: "faltou" })
            .where(eq(appointmentsTable.id, appt.id));
          result.noShowMarked++;
          result.details.push({ clinicId: clinic.id, action: "no_show_marked", appointmentId: appt.id });
          await logAudit({
            userId: null,
            userName: "sistema",
            patientId: appt.patientId,
            action: "update",
            entityType: "appointment",
            entityId: appt.id,
            summary: "Status: agendado/confirmado → faltou (fechamento automático do dia)",
          });

          // ── NO-SHOW FEE ──────────────────────────────────────────────────
          if (clinic.noShowFeeEnabled && clinic.noShowFeeAmount) {
            const existing = await db
              .select({ id: financialRecordsTable.id })
              .from(financialRecordsTable)
              .where(
                and(
                  eq(financialRecordsTable.appointmentId, appt.id),
                  eq(financialRecordsTable.transactionType, "taxaNoShow")
                )
              )
              .limit(1);

            if (existing.length === 0) {
              const [patient] = await db
                .select({ name: patientsTable.name })
                .from(patientsTable)
                .where(eq(patientsTable.id, appt.patientId))
                .limit(1);
              const [procedure] = await db
                .select({ name: proceduresTable.name, category: proceduresTable.category })
                .from(proceduresTable)
                .where(eq(proceduresTable.id, appt.procedureId))
                .limit(1);

              const feeAmount = Number(clinic.noShowFeeAmount);
              const feeDescription = `Taxa de não comparecimento — ${procedure?.name ?? "Procedimento"} · ${patient?.name ?? "Paciente"}`;

              // 1. Cria o registro financeiro operacional
              const [noShowRecord] = await db.insert(financialRecordsTable).values({
                type: "receita",
                amount: String(feeAmount),
                description: feeDescription,
                category: procedure?.category ?? "Outros",
                appointmentId: appt.id,
                patientId: appt.patientId,
                procedureId: appt.procedureId,
                transactionType: "taxaNoShow",
                status: "pendente",
                dueDate: appt.date,
                clinicId: clinic.id,
              }).returning();

              // 2. Lança no ledger de partidas dobradas:
              //    Débito 1.1.2 Contas a Receber / Crédito 4.1.1 Receita de Atendimentos
              const accountingEntry = await postReceivableRevenue({
                clinicId: clinic.id,
                entryDate: appt.date,
                amount: feeAmount,
                description: `A receber — ${feeDescription}`,
                eventType: "no_show_fee",
                sourceType: "financial_record",
                sourceId: noShowRecord.id,
                patientId: appt.patientId,
                appointmentId: appt.id,
                procedureId: appt.procedureId,
              });

              // 3. Vincula o lançamento contábil ao registro financeiro
              await db
                .update(financialRecordsTable)
                .set({ accountingEntryId: accountingEntry.id })
                .where(eq(financialRecordsTable.id, noShowRecord.id));

              result.noShowFeesGenerated++;
              result.details.push({ clinicId: clinic.id, action: "no_show_fee_generated", appointmentId: appt.id });
            }
          }
        } catch (err: any) {
          result.errors++;
          result.details.push({ clinicId: clinic.id, action: "error", appointmentId: appt.id, error: String(err.message) });
        }
      }

      // ── AUTO-COMPLETE: compareceu → concluido ────────────────────────────
      // Apenas agendamentos de hoje com status "compareceu" cujo horário já passou
      const toAutoComplete = await db
        .select({ id: appointmentsTable.id, patientId: appointmentsTable.patientId })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.clinicId, clinic.id),
            eq(appointmentsTable.status, "compareceu"),
            sql`${appointmentsTable.date} = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
            sql`(
              (${appointmentsTable.date}::text || ' ' || ${appointmentsTable.endTime})::timestamp
              < NOW() AT TIME ZONE 'America/Sao_Paulo'
            )`
          )
        );

      for (const appt of toAutoComplete) {
        try {
          await db
            .update(appointmentsTable)
            .set({ status: "concluido" })
            .where(eq(appointmentsTable.id, appt.id));
          result.autoCompleted++;
          result.details.push({ clinicId: clinic.id, action: "auto_completed", appointmentId: appt.id });
          await logAudit({
            userId: null,
            userName: "sistema",
            patientId: appt.patientId,
            action: "update",
            entityType: "appointment",
            entityId: appt.id,
            summary: "Status: compareceu → concluido (auto-conclusão pelo sistema)",
          });
        } catch (err: any) {
          result.errors++;
          result.details.push({ clinicId: clinic.id, action: "error", appointmentId: appt.id, error: String(err.message) });
        }
      }

    } catch (err: any) {
      result.errors++;
      result.details.push({ clinicId: clinic.id, action: "clinic_error", error: String(err.message) });
    }
  }

  return result;
}
