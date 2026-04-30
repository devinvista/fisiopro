# Migração v1 → v2 do fluxo de aceite — CONCLUÍDA

**Status:** ✅ Concluída em 30/04/2026 (Sprint 15 — F7).

O fluxo legado v1 (aceite antes da agenda) foi 100% removido do produto. Todas
as clínicas operam exclusivamente no fluxo v2 (cobrança → agenda → contrato
atômico via `POST /accept-and-materialize`).

## O que foi removido

### Banco
- Migration `0019_remove_v1_acceptance_flow.sql`: `UPDATE clinics SET use_v2_acceptance_flow = TRUE` + `ALTER TABLE clinics DROP COLUMN use_v2_acceptance_flow`.
- Coluna `useV2AcceptanceFlow` removida de `lib/db/src/schema/clinics.ts`.

### Backend
- `POST /api/patients/:patientId/treatment-plans/:planId/accept` (medical-records.routes).
- `POST /api/public/treatment-plans/by-token/:token/accept` (public.routes).
- `useV2AcceptanceFlow` do PATCH whitelist (clinics.routes), do snapshot público e do tipo `PublicPlanSnapshot` (treatment-plans.tokens.ts).

### Frontend
- `AcceptanceBlock.tsx` (deletado).
- `AcceptanceScheduleEditor.tsx` → `PlanScheduleEditor.tsx` (prop `isAccepted` removida).
- `StepAceite` e `StepCobranca` (variantes v1) deletados de `TreatmentPlanTab.tsx`.
- `StepCobrancaV2`/`StepAgendaV2`/`StepContratoV2` renomeados para `StepCobranca`/`StepAgenda`/`StepContrato` (sufixo V2 não faz mais sentido).
- Hook `useV2AcceptanceFlow()` e campo `useV2AcceptanceFlow` do tipo `Clinic` removidos.
- Toggle v1/v2 removido de `ClinicaSection.tsx` (Configurações → Clínica).
- `PlanStepper.tsx` simplificado: 4 etapas únicas (itens → cobrança → agenda → contrato).
- `aceite.tsx` agora sempre chama `/accept-and-materialize`.

## O que foi mantido

- `acceptPatientTreatmentPlan` (service): building block usado internamente por `acceptAndMaterializePlan`.
- `materializeTreatmentPlan` standalone: ferramenta de reparo para casos excepcionais (planos materializados parcialmente).
- `POST /materialize` legado: segue como rota de reparo administrativo.

## Validação final

- `pnpm typecheck` — ✅ verde (api-server + fisiogest).
- `pnpm test` — ✅ 426/426 verdes (45 arquivos).
- App rodando: `Start application` workflow OK, dashboard renderiza.

Para o histórico completo de cada fase (F1–F7), ver `sprints/SPRINT-15-fluxo-aceite-v2.md`.
