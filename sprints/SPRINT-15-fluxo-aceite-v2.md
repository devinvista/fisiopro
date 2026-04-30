# Sprint 15 — Reforma do Fluxo de Aceite (v2)

**Origem:** análise solicitada em 30/04/2026 — paciente assina contrato com base em "visão estimada", e horários reais só são escolhidos depois do aceite.
**Estado base:** 408/408 testes vitest verdes, P1–P5 financeiros (Sprints 9–14) entregues.
**Escopo total:** 6 fases (F1–F6).

---

## Diagnóstico — fluxo atual (mapeado)

```
[1] ITENS         TreatmentPlanItemsSection      → preview financeiro estimado
[2] ACEITE  ⚠️    AcceptanceBlock                → assina contrato com estimativa
                  acceptPatientTreatmentPlan
                  ↳ snapshot frozen_prices_json
                  ↳ acceptPlanFinancials (tx)
                      • N financial_records (P3 / P4 / vendaPacote)
                      • N postDeferredReceivable (D 1.1.2 / C 2.1.1)
                      • session_credits (pacotes)
[3] COBRANÇA      AcceptanceScheduleEditor       → escolhe weekDays + horários
                  PUT /procedures/:id            → enabled=isAccepted
[4] "Iniciar"     materializeTreatmentPlan       → cria appointments + faturas
                  (botão dedicado)               → linka monthlyInvoiceId
```

### Problemas concretos

| # | Problema |
|---|---|
| **A** | Contrato assinado SEM horário real anexado. Snapshot não congela quando o paciente vai ser atendido. |
| **B** | 12 `deferred_receivable` postados antes de qualquer agenda existir. Desistência = estorno em massa. |
| **C** | `postPartialDeferredReversal` (Sprint 14 Bug-fix #2) só existe porque a contabilidade andou na frente da operação. |
| **D** | Materialização manual pode ser esquecida → faturas vencem sem appointments. |
| **E** | Aceite público (`/aceite/:token`) mostra contrato sem datas. Risco probatório (CPC art. 784, III). |
| **F** | `paymentMode` / `monthlyDueDay` editáveis sem etapa formal — sem etapa "cobrança" no wizard. |

---

## Princípios de Design (v2)

1. **Contrato congela TUDO** — preço, cláusulas, **e calendário completo de consultas**.
2. **Contabilidade nasce com a operação** — `deferred_receivable` só após agenda confirmada.
3. **Aceite = ato único e atômico** — aceite + materialização numa única transação (ou rollback total).
4. **Holds de slots** — entre escolha e aceite, slots ficam "pré-reservados" com TTL 15min.
5. **Wizard 4 etapas** — Itens → Cobrança → Agenda → Contrato/Aceite.
6. **Compatibilidade** — feature flag por clínica; planos antigos continuam no fluxo legado.

---

## Fluxo proposto (4 etapas + commit atômico)

```
[1] ITENS                  (igual hoje)
[2] COBRANÇA  ◄── NOVA     • paymentMode (pré/pós-pago)
                           • monthlyDueDay
                           • avulsoBillingMode/Day
                           • preview de calendário de faturas
[3] AGENDA   ◄── HOJE      • por item: weekDays + slots por dia
              É PÓS-ACEITE • valida com /api/appointments/available-slots
                           • opcional: pré-reserva (TTL 15min)
[4] CONTRATO + ACEITE       Contrato agora inclui:
                           • preço congelado
                           • cláusulas obrigatórias
                           • CALENDÁRIO COMPLETO de consultas
                           • forma de cobrança e vencimentos
                           POST /accept-and-materialize
[5] EFEITO ATÔMICO          Em uma única operação:
    no servidor             • acceptTreatmentPlan (snapshot)
                            • applyPlanFinancials (faturas + deferred)
                            • materializeTreatmentPlan (appointments)
                            • tudo ou nada (rollback em caso de falha)
```

---

## Fases

### F1 — Orquestrador atômico (BACKEND, baixo risco)

**Estimativa:** 3h · **Risco:** Baixo · **Bloqueia:** F2.

- **Novo serviço** `acceptAndMaterializePlan(patientId, planId, ctx, trail, materializeOpts)` em `medical-records.service.ts`:
  - Valida pré-condições: itens existem; itens recorrentes/pacotes têm `weekDays` + horário; `startDate` definido; cláusulas obrigatórias aceitas.
  - Chama `acceptPatientTreatmentPlan(...)` (idempotente).
  - Chama `materializeTreatmentPlan(planId, materializeOpts)` (idempotente).
  - **Em caso de falha do segundo passo:** chama `dematerializeTreatmentPlan(planId)` + reverte aceite via novo helper `revertPlanAcceptance(planId)` (apaga `acceptedAt`, snapshot e `deferred_receivable` correspondentes).
  - Retorna `{ acceptance, materialization, ok: true }`.
- **Novo helper** `revertPlanAcceptance(planId)` — reverso simétrico de `acceptPlanFinancials` para uso interno. Usa `postPartialDeferredReversal` por fatura.
- **Validação prévia** `validatePlanForAtomicAccept(planId)`:
  - Cada item recorrente/pacote tem `weekDays` ≥ 1 e cobertura de horários completa.
  - Itens avulsos (sem agenda) são permitidos (não geram appointment).
  - Plano tem `startDate` e `durationMonths`.
  - Retorna `{ ok, errors[] }`.
- **Testes** (`treatment-plans.atomic.test.ts`):
  - feliz: aceite + materialização atômica gera N faturas + N appointments + N deferred.
  - falha de materialize → rollback total (sem appointments, sem faturas, sem deferred, sem snapshot, sem `acceptedAt`).
  - idempotente: chamar 2× retorna mesmo resultado.

**Critério de aceite:**
- 408 + 6 testes verdes.
- Endpoints legados intactos.
- `ts-check` sem novos erros.

---

### F2 — Endpoints atômicos (BACKEND, baixo risco)

**Estimativa:** 2h · **Risco:** Baixo · **Depende de:** F1.

- **Nova rota** `POST /api/patients/:patientId/treatment-plans/:planId/accept-and-materialize`
  - Body: `{ signature, acceptedClauseCodes[], materializeOpts? }`.
  - Chama `acceptAndMaterializePlan(...)`.
  - 400 se validação prévia falhar (lista os itens sem agenda).
  - 409 se plano já aceito **e** materializado.
- **Nova rota pública** `POST /api/public/treatment-plans/by-token/:token/accept-and-materialize`
  - Equivalente para aceite via link.
  - Snapshot público (`GET .../by-token/:token`) ganha campo `appointmentsPreview[]` calculado a partir dos itens + agenda configurada (não persiste nada).
- **Novo endpoint preview** `GET /api/patients/:patientId/treatment-plans/:planId/preview-appointments`
  - Retorna lista de `{ date, startTime, endTime, procedureName, professionalName }` sem inserir.
  - Usado pelo frontend para mostrar calendário no contrato.
  - Refatora a lógica de enumeração de `materializeTreatmentPlan` em helper compartilhado `enumeratePlanAppointments(plan, items)`.
- **Endpoints legados** (`/accept` + `/materialize`) continuam existindo. Não marcamos `@deprecated` ainda — F5/F6 fazem isso.
- **Testes** (`atomic-routes.test.ts`):
  - 200 fluxo feliz.
  - 400 sem horário em item recorrente.
  - 409 já aceito e materializado.
  - Aceite via link público também atômico.

**Critério de aceite:**
- 6 + 4 testes verdes.
- Smoke manual: novo endpoint produz mesmos artefatos contábeis que o fluxo legado quando agenda configurada.

---

### F3 — Reordenação do wizard (FRONTEND, médio risco)

**Estimativa:** 8h · **Risco:** Médio · **Depende de:** F2.

- **Feature flag** `clinics.use_v2_acceptance_flow` (default `false`):
  - Migration `0014_clinics_use_v2_acceptance_flow.sql` adiciona coluna boolean.
  - Backend expõe via `/api/clinics/me/settings`.
  - Frontend lê do contexto `useClinicSettings()`.
- **Novo `BillingConfigSection.tsx`**:
  - Extrai os campos de cobrança hoje espalhados em `TreatmentPlanItemsSection.tsx`.
  - Form único com: `paymentMode`, `monthlyDueDay`, `avulsoBillingMode`, `monthlyCreditValidityDays`.
  - Preview de calendário de vencimentos baseado em `startDate` + `durationMonths`.
- **Reorganização de `PlanStepper.tsx`**:
  - 4 etapas: `itens` → `cobranca` → `agenda` → `contrato`.
  - Renomeia `aceite` → `contrato`.
  - Gates por etapa: `cobranca` requer ≥1 item; `agenda` requer cobrança válida; `contrato` requer agenda configurada.
- **`AcceptanceScheduleEditor.tsx`** (renomear → `PlanScheduleEditor.tsx`):
  - Remove gate `enabled: isAccepted`.
  - Habilita ANTES do aceite quando flag v2 ativa.
  - Usa novo endpoint `/preview-appointments` para mostrar calendário em tempo real.
- **`AcceptanceBlock.tsx`** (renomear → `ContractAcceptanceBlock.tsx`):
  - Mostra contrato congelado COM calendário real (lista de N consultas).
  - Submete `POST /accept-and-materialize` (não mais `/accept`).
  - Toast atualizado: "Plano aceito e agenda criada. Faturas geradas."
- **`TreatmentPlanTab.tsx`**:
  - Lê flag para renderizar wizard v1 ou v2.
  - V2 reordena props e usa novos componentes.
- **Testes** (Vitest + Testing Library):
  - Wizard v2: gates funcionam corretamente.
  - `BillingConfigSection`: validação de campos.
  - `ContractAcceptanceBlock`: calendário renderiza.

**Critério de aceite:**
- Flag desligada → wizard v1 inalterado.
- Flag ligada → wizard v2 funciona end-to-end.
- 408 + N testes verdes.

---

### F4 — Aceite público v2 com calendário (FRONTEND, médio risco)

**Estimativa:** 4h · **Risco:** Médio · **Depende de:** F2 + F3.

- **`aceite.tsx` v2**:
  - Snapshot público inclui `appointmentsPreview[]`.
  - Renderiza seção "Sua agenda" antes da assinatura.
  - Cada consulta listada: data, horário, profissional, procedimento.
  - Sem snapshot de agenda (snap.appointmentsPreview vazio) → aviso "Aguardando configuração de agenda pela clínica" e botão de aceite desabilitado.
  - Submete `POST /by-token/:token/accept-and-materialize`.
- **Backend**: `loadPublicPlanSnapshot()` adiciona `appointmentsPreview` quando agenda configurada.
- **Cache headers**: `Cache-Control: no-store` no snapshot público (evita revalidações divergentes).
- **Testes**:
  - Snapshot inclui preview quando agenda configurada.
  - Aceite público v2 dispara fluxo atômico.

**Critério de aceite:**
- Paciente vê agenda real antes de assinar.
- Aceite via link gera tudo atomicamente.

---

### F5 — Sistema de holds (BACKEND + FRONTEND, médio risco) ✅ IMPLEMENTADO

**Implementado em:** 30/04/2026

- **Migration aplicada:** `db/migrations/0020_treatment_plan_slot_holds.sql`
  ```sql
  ALTER TABLE treatment_plans
    ADD COLUMN slot_holds_json TEXT,
    ADD COLUMN slot_holds_expires_at TIMESTAMP;
  CREATE INDEX idx_treatment_plans_holds_expires
    ON treatment_plans (slot_holds_expires_at)
    WHERE slot_holds_expires_at IS NOT NULL;
  ```
- **Schema:** `slotHoldsJson: text("slot_holds_json")`, `slotHoldsExpiresAt: timestamp("slot_holds_expires_at")` em `lib/db/src/schema/medical-records.ts`.
- **Endpoint** `POST /api/patients/:patientId/treatment-plans/:planId/holds`:
  - Body: `{ slots: [{ itemId, date, startTime, endTime, scheduleId, procedureId }], ttlMinutes? }` (default 15, máx 60).
  - Detecta conflito por (date, scheduleId) com overlap [start,end) contra appointments reais E holds vivos de outros planos.
  - Em conflito: 409 `{ message, issues: { code: "slot_conflict", conflicts: [...] } }`.
  - Em sucesso: substitui hold anterior do plano (idempotente) e devolve `{ expiresAt, ttlSecondsRemaining }`.
- **Endpoint** `DELETE /api/patients/:patientId/treatment-plans/:planId/holds` — libera hold (idempotente).
- **Endpoint** `GET /api/patients/:patientId/treatment-plans/:planId/holds` — devolve hold vivo + TTL restante.
- **Orquestrador** `treatment-plans.atomic.ts`:
  - **Step 1b**: antes de materializar, valida hold conflicts (`findConflictsForPlanMaterialization`). Em conflito → 409 `slot_conflict` com a mesma forma do POST.
  - **Step 6**: após sucesso, libera o hold próprio (`releaseHolds`).
- **Frontend**: `usePlanSlotHolds.ts` em `treatment-plan/` expõe `reservePlanSlots(patientId, planId, planItems, ttlMinutes?)` e `releasePlanHold(patientId, planId)`. Faz preview → mapeia para HoldSlot (com lookup de scheduleId/procedureId nos items) → POST. O botão **"Avançar para Contrato"** no `StepAgenda` agora reserva os slots antes de mudar de step. Em 409, toast destrutivo com até 3 conflitos. Plano já materializado (`isStarted`) pula a reserva.
- **Job de limpeza**: `scheduler/jobs/slot-holds-cleanup.job.ts` rodando `*/30 * * * *` (`purgeExpiredHolds`).
- **Testes**: `slot-holds.test.ts` (19 cenários) + mock no-op em `treatment-plans.atomic.test.ts`. Suíte total **445/445 verde**.

**Critério de aceite — atendido:**
- ✅ 2 pacientes não conseguem reservar mesmo slot (detecção por overlap, 409).
- ✅ Hold expira e libera automaticamente (TTL + job de limpeza).

---

### F6 — Rollout + deprecação (operacional, baixo risco)

**Estimativa:** 2h · **Risco:** Baixo · **Depende de:** F1–F5.

- **Ativar flag por padrão em clínicas novas:**
  - Migration `0016_default_v2_for_new_clinics.sql` muda DEFAULT para `true` em clínicas criadas após sprint.
  - Clínicas existentes recebem aviso na UI: "Novo fluxo de aceite disponível — ativar?".
- **Marcar `@deprecated`:**
  - `acceptPatientTreatmentPlan` (manter para compat).
  - `materializeTreatmentPlan` standalone (manter para reparos).
  - `POST /accept` legado (manter para compat).
  - `POST /materialize` legado (manter para reparos).
  - `AcceptanceBlock`/`AcceptanceScheduleEditor` (manter no bundle até remoção).
- **Documentação:**
  - Atualizar `replit.md` com novo fluxo.
  - Adicionar seção "Migração v1 → v2" em `sprints/`.
- **Removal scheduled:** após 90 dias com 100% das clínicas migradas.

**Critério de aceite:**
- Clínicas novas usam v2 por padrão.
- Nenhum endpoint legado removido.
- Documentação completa.

---

## Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Slot escolhido fica indisponível entre escolha e aceite | F5 (holds com TTL 15min) |
| Itens "abertos" (sem totalSessions) | calendário mostra sessões estimadas com asterisco; materializa só meses certos |
| Itens avulsos sem agenda recorrente | continuam sem appointments; contrato lista "sessões avulsas conforme demanda" |
| Compatibilidade com 1 plano ativo (#79 do paciente Adailton — agora apagado) | feature flag por clínica |
| Atomicidade de tx muito grande (50+ appts + 12 faturas) | tx única é viável (Postgres aguenta); rollback explícito em F1 garante consistência |
| Aceite público pelo celular | F4 — agenda já vem pré-sugerida pela clínica; paciente só confirma |

---

## O que NÃO muda

- Plano contábil (4.1.1, 4.1.2, 1.1.2, 2.1.1).
- Sprints financeiras 1–14 (P1–P5).
- Sistema de cláusulas (`clinic_contract_clauses` + `acceptedClausesJson`).
- Estorno parcial / cancelamento (`treatment-plans.cancel.ts`).
- Renegociação via `parent_plan_id`.
- Job de billing mensal (`monthlyPlanBilling.service.ts`).

---

## Outras melhorias menores (oportunistas)

1. `AcceptanceBlock.tsx:111` — usa fetch direto. Padronizar com `lib/api-client-react`.
2. `aceite.tsx:212-239` — adicionar `Cache-Control: no-store` no snapshot público.
3. `treatment_plans.status` — consolidar 6 valores em 4 (deprecar `ativo`/`encerrado` em favor de `vigente`/`concluido`).
4. `treatment_plan_procedures.kind` — backfill `UPDATE ... SET kind = derived_kind WHERE kind IS NULL`.
5. `materializeTreatmentPlan` ganha modo `dryRun: true` (em vez de função separada `previewMaterialization`).

---

## Estado de implementação (atualizado por sprint)

| Fase | Status | Data | Observações |
|---|---|---|---|
| F1 — Orquestrador atômico | ✅ Implementado | 30/04/2026 | `acceptAndMaterializePlan` + `revertPlanAcceptance` + `validatePlanForAtomicAccept`. Bug-fix 30/04: caminho idempotente (já aceito+materializado) agora devolve contadores REAIS via `getExistingMaterializationSummary` (appointments via JOIN com `treatment_plan_procedures`; faturas via tipo + status). Antes retornava zeros — front-end mostraria "0 consultas, 0 faturas" mesmo com dezenas existindo. |
| F2 — Endpoints atômicos | ✅ Implementado | 30/04/2026 | `POST /accept-and-materialize` (presencial + público) + `GET /atomic-validation`. Bug-fix 30/04: `/atomic-validation` agora inclui `clauses[]` (ativas da clínica) na resposta — sem isso, UI não saberia quais cláusulas são obrigatórias e o POST falharia com 400 `clause_required_missing` mesmo a validação de plano passando. `GET /preview-appointments` segue postergado para F3 (wizard usa `materializeTreatmentPlan` dry-run existente). |
| F3 — Wizard reordenado | ✅ Implementado | 30/04/2026 | Migration `0017` + coluna `clinics.use_v2_acceptance_flow` + PATCH whitelist + hook `useClinicSettings()`/`useV2AcceptanceFlow()`. `PlanStepper` agora suporta v1 (3) e v2 (4 etapas: itens/cobranca/agenda/contrato). `ContractAcceptanceBlock` chama `/accept-and-materialize` e usa `/atomic-validation` para cláusulas+erros. `AcceptanceScheduleEditor` perdeu o gate `enabled: isAccepted` (v1 segue gateado pelo pai). Em `TreatmentPlanTab.tsx`, render alterna entre v1 e v2 via flag — v2 monta `StepCobrancaV2` → `StepAgendaV2` → `StepContratoV2`. 419/419 testes verdes, 0 erros lint, typecheck OK. |
| F4 — Aceite público v2 | ✅ Implementado | 30/04/2026 | Novo helper `enumeratePlanAppointments(planId)` em `treatment-plans.preview.ts` reutiliza os helpers exportados de `materialization.ts` (`parseWeekDays`, `parseStartTimesByDay`, `enumerateDates`, `enumerateFirstN`, `addMonths`, `monthFirstDay`, `lastDayOfMonth`, `addMinutesToTime`, `resolveStartTimeForDate`) — única fonte de verdade entre preview e materialização real. Snapshot público (`loadPublicPlanSnapshot`) ganhou campos `useV2AcceptanceFlow`, `appointmentsPreview[]` e `itemsWithoutSchedule[]`; falha de preview é capturada em try/catch para não quebrar o snapshot. Endpoint autenticado `GET /api/patients/:patientId/treatment-plans/:planId/preview-appointments` exposto para o editor do plano. `Cache-Control: no-store` adicionado ao snapshot público. Frontend `aceite.tsx` renderiza seção "Sua agenda" agrupada por mês quando v2, exibe aviso + desabilita botão quando preview vazio, alterna entre `/accept` (v1) e `/accept-and-materialize` (v2), label do botão muda de "Assinar e aceitar contrato" para "Assinar e iniciar plano". 426/426 testes verdes (+7 em `treatment-plans.preview.test.ts`), typecheck OK em api-server e fisiogest. |
| F5 — Sistema de holds | ✅ Implementado | 30/04/2026 | Backend + frontend completos. Migration `0020_treatment_plan_slot_holds.sql` adiciona `slot_holds_json` (TEXT) + `slot_holds_expires_at` (TIMESTAMP) + índice parcial `idx_treatment_plans_holds_expires` (WHERE expires_at IS NOT NULL) em `treatment_plans`. Schema espelhado em `lib/db/src/schema/medical-records.ts`. Novo serviço `slot-holds.service.ts` (`createOrRenewHolds`, `releaseHolds`, `getHolds`, `purgeExpiredHolds`, `findConflictsForPlanMaterialization`) detecta colisões por (date, scheduleId) com overlap [start,end), considerando appointments reais E holds vivos de outros planos. Endpoints REST `POST/DELETE/GET /api/patients/:id/treatment-plans/:planId/holds` (TTL default 15min, máx 60). Orquestrador `treatment-plans.atomic.ts` agora valida hold conflicts antes de materializar (409 `slot_conflict` com lista) e libera o hold próprio após sucesso. Job `slotHoldsCleanup` (`*/30 * * * *`) registrado e rodando. Frontend: novo módulo `usePlanSlotHolds.ts` (`reservePlanSlots`+`releasePlanHold`) e botão "Avançar para Contrato" do `StepAgenda` agora reserva slots via preview→holds antes de mudar de step (em 409, toast destrutivo lista até 3 conflitos com instrução para voltar à Agenda; em rede, toast de erro). Plano já materializado pula a reserva. Testes: novo `slot-holds.test.ts` (19 cenários cobrindo create/renew/release/purge/conflict). Suíte total **445/445 verde**, typecheck api-server + fisiogest limpos. |
| F7 — Remoção total do v1 | ✅ Implementado | 30/04/2026 | **Sprint 15 CONCLUÍDA.** Migration `0019_remove_v1_acceptance_flow.sql` faz `UPDATE clinics SET use_v2_acceptance_flow = TRUE` e `DROP COLUMN`. Coluna removida de `lib/db/src/schema/clinics.ts`. Backend: removidos `POST /accept` (medical-records.routes), `POST /by-token/:token/accept` (public.routes), `useV2AcceptanceFlow` do PATCH whitelist (clinics.routes), do snapshot público e do tipo `PublicPlanSnapshot` (treatment-plans.tokens.ts). `acceptPatientTreatmentPlan` mantido (building block usado por `acceptAndMaterializePlan`); `materializeTreatmentPlan` standalone mantido (ferramenta de reparo). Frontend: `AcceptanceBlock.tsx` deletado; `AcceptanceScheduleEditor.tsx` → `PlanScheduleEditor.tsx` (renomeado export, removido prop `isAccepted`); hook `useV2AcceptanceFlow()` e campo `useV2AcceptanceFlow` do tipo `Clinic` removidos; toggle v1/v2 removido de `ClinicaSection.tsx`; `aceite.tsx` agora sempre chama `/accept-and-materialize`; `PlanStepper.tsx` simplificado para 4 etapas únicas; `TreatmentPlanTab.tsx` perdeu `StepAceite` (v1) e `StepCobranca` (v1); `StepCobrancaV2`/`StepAgendaV2`/`StepContratoV2` renomeados para `StepCobranca`/`StepAgenda`/`StepContrato`. 426/426 testes verdes, typecheck OK, app rodando. |
| F6 — Rollout + deprecação | ✅ Implementado | 30/04/2026 | Migration `0018_default_v2_for_new_clinics.sql` troca o DEFAULT da coluna `clinics.use_v2_acceptance_flow` para `TRUE` (clínicas novas nascem em v2; existentes não são tocadas). Schema `lib/db/src/schema/clinics.ts` reflete o novo default. Tags `@deprecated` adicionadas em: `acceptPatientTreatmentPlan` (service), `materializeTreatmentPlan` (standalone — segue como reparo), `POST /accept` (medical-records.routes), `POST /materialize` (treatment-plans-materialize.routes), `POST /by-token/:token/accept` (public.routes), `AcceptanceBlock.tsx`, `AcceptanceScheduleEditor.tsx` (este último com nota de que segue ATIVO em v2 e será renomeado). Em **Configurações → Clínica**, novo bloco "Novo fluxo de aceite de plano" com Switch + 2 mensagens contextuais (âmbar quando v1, verde quando v2); persiste via PATCH whitelist já existente. Documentação: novo guia `sprints/MIGRACAO-v1-para-v2.md` (TL;DR + UX + endpoints/componentes deprecados + cronograma de remoção + histórico de migrations). F5 (holds) deliberadamente pulado — feature independente, será priorizada depois. 426/426 testes verdes mantidos, typecheck OK em ambos os pacotes. |
