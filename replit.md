# FisioGest Pro

## Overview

FisioGest Pro is a comprehensive SaaS clinic management platform designed for physiotherapists, aestheticians, and Pilates instructors. It offers electronic health records, scheduling, financial management, reporting, and compliance with COFFITO regulations. The project aims to provide a modern, efficient, and user-friendly solution for clinic management, focusing on usability and data integrity.

The project is a **pnpm monorepo** hosted on Replit, divided into three artifacts: frontend, API, and a mockup-sandbox. These are served by Replit's shared reverse proxy on port 80.

**Default Language**: Brazilian Portuguese (pt-BR)
**Currency**: Brazilian Real (BRL — R$)
**Measurements**: International System (SI) — kg, cm, °C
**Date Format**: dd/MM/yyyy (e.g., 18/03/2026)
**Time Format**: HH:mm — 24 hours (e.g., 14:30)
**Decimal Separator**: comma (e.g., R$ 1.250,00)
**Thousands Separator**: dot (e.g., 1.250)
**Default Time Zone**: America/Sao_Paulo (UTC-3 / UTC-2 during daylight saving)

## Recent Changes

**30/04/2026 — Sprint 15 F4 completo: aceite público v2 com calendário antes da assinatura**
- **Helper único de enumeração — `treatment-plans.preview.ts`:** novo `enumeratePlanAppointments(planId)` reaproveita os helpers exportados de `materialization.ts` (`parseWeekDays`, `parseStartTimesByDay`, `enumerateDates`, `enumerateFirstN`, `addMonths`, `monthFirstDay`, `lastDayOfMonth`, `addMinutesToTime`, `resolveStartTimeForDate`) para enumerar TODAS as consultas que `materializeTreatmentPlan` criaria, sem persistir nada. Garante que o que o paciente vê no preview é **exatamente** o que será criado no aceite (única fonte de verdade). Para itens recorrentes mensais respeita janelas por mês de competência (primeiro mês começa no `startDate` real do plano, último mês honra `addMonths(startDate, durationMonths)`); para pacotes/avulsos usa `enumerateFirstN` com cap `totalSessions`. Itens sem agenda configurada (sem `weekDays`+horário, ou pacote sem `scheduleId`) são silenciosamente pulados e reportados em `itemsWithoutSchedule[]`. Saída ordenada por (data, horário). Resolução de `procedureName` cobre fallback do `packageProcedureId` quando o item não tem `procedureId` próprio (2ª query consolidada).
- **Snapshot público — `loadPublicPlanSnapshot`:** ganhou 3 campos novos: `useV2AcceptanceFlow: boolean` (vem da clínica via `clinicsTable.useV2AcceptanceFlow`), `appointmentsPreview: PublicPlanAppointmentPreview[]` e `itemsWithoutSchedule: number[]`. Falha do enumerador é capturada em `try/catch` para não derrubar o snapshot inteiro — paciente sempre consegue abrir o contrato. Tipo público omite `procedureDuration` interna; mantém só o que a UI precisa (`date`, `startTime`, `endTime`, `procedureName`, `professionalName`, `monthRef`, `itemId`, `itemKind`).
- **Endpoint autenticado para o editor — `GET /api/patients/:patientId/treatment-plans/:planId/preview-appointments`:** chamado pelo wizard v2 para mostrar o calendário em tempo real conforme a agenda é configurada (requer `medical.read`). Mesmo helper, mesmo formato — sem duplicação de lógica.
- **Cache:** `Cache-Control: no-store` adicionado ao `GET /api/public/treatment-plans/by-token/:token` — snapshot é dinâmico (status do plano + agenda mudam) e proxies/CDN intermediários nunca devem cachear.
- **Frontend `aceite.tsx`:** quando `useV2AcceptanceFlow=true`, renderiza nova seção "Sua agenda" antes do painel de assinatura — agrupada por mês via `<details>` (auto-aberto quando ≤2 meses), com data formatada em pt-BR (`seg, 04 mai`), horário monoespaçado, procedimento e profissional. Quando `appointmentsPreview` está vazio: aviso âmbar "Aguardando configuração de agenda pela clínica" + alerta inline no painel de assinatura + botão **desabilitado** com tooltip explicativo. Submit alterna entre `/accept` (v1) e `/accept-and-materialize` (v2) via flag, e o label do botão muda de "Assinar e aceitar contrato" para "Assinar e iniciar plano". Helpers locais `formatMonthRef` e `formatDateLong` traduzem ISO para pt-BR sem dependências extras.
- **Testes — `treatment-plans.preview.test.ts` (7 casos):** plano sem `startDate` retorna vazio; item recorrente sem `weekDays` cai em `itemsWithoutSchedule`; recorrente multi-mês enumera maio+junho de 2026 corretamente (8 + 9 ocorrências em segundas/quartas, monthRefs agrupados); recorrente com `startDate=15/05` exclui datas anteriores ao dia 15 dentro do primeiro mês; pacote sem `scheduleId` cai em `itemsWithoutSchedule`; pacote com `scheduleId` honra cap `totalSessions=4` (apenas 4 datas); ordenação intercalada por (data, horário) quando dois itens compartilham mesmo dia. DB mockado via fila `selectQueue` que devolve arrays controlados em ordem. Convenção de `weekDays` esclarecida: persiste como string de nomes em inglês ("monday,wednesday"), não índices numéricos — `parseWeekDays` faz lookup case-insensitive em `WEEK_DAY_INDEX`.
- **Estado validado:** **426/426 testes verdes** (419 → 426, +7 novos); typecheck OK em `api-server` e `fisiogest`; workflow `Start application` rodando, schedulers todos inicializados. Fluxo legado intocado — clínicas sem `useV2AcceptanceFlow` continuam vendo aceite v1 sem alteração visual.
- **Arquivos novos:** `artifacts/api-server/src/modules/clinical/medical-records/treatment-plans.preview.ts`, `artifacts/api-server/src/modules/clinical/medical-records/treatment-plans.preview.test.ts`. **Editados:** `treatment-plans.tokens.ts`, `medical-records.routes.ts`, `public.routes.ts`, `artifacts/fisiogest/src/pages/public/aceite.tsx`.

**30/04/2026 — Sprint 15 F3 completo: wizard reordenado em 4 etapas atrás da flag `useV2AcceptanceFlow`**
- **Wizard v2 (4 etapas):** `PlanStepper.tsx` reescrito para suportar dois modos — v1 (legado, 3 etapas: itens/agenda/aceite) e v2 (4 etapas: itens/cobranca/agenda/contrato). Aceita props `v2: boolean` e `billingConfigured: boolean`. Em v2, gates de avanço por etapa: `cobranca` exige ≥1 item; `agenda` exige cobrança configurada; `contrato` exige agenda configurada. UI mostra ícones distintos (`CreditCard`, `CalendarRange`, `FileSignature`) e títulos enxutos por etapa.
- **Novo `ContractAcceptanceBlock.tsx`:** componente de assinatura para v2. Usa `GET /atomic-validation` para puxar pendências + `clauses[]` num único call (cache 30s); renderiza checklist visual de pré-requisitos (itens, cobrança, agenda); mostra cláusulas obrigatórias com checkboxes e cláusulas opcionais expansíveis; chama `POST /accept-and-materialize` (presencial: dialog com confirmação; público: copia link com token). Toast de sucesso reporta `appointmentsCreated` + `invoicesCreated` reais.
- **`AcceptanceScheduleEditor.tsx`:** removido `enabled: isAccepted` da query de agendas — agora habilita assim que o componente monta. Prop `isAccepted` mantida na interface por compat retro (renomeada para `_isAccepted` internamente). Em v1, parent já oculta o editor antes do aceite, então comportamento não muda; em v2, montagem ANTES do aceite passa a ser legítima.
- **`TreatmentPlanTab.tsx`:** lê `useV2AcceptanceFlow()` no topo; estado `currentStep` usa `'cobranca'|'agenda'|'contrato'` quando v2 ativa; auto-advance a partir de `itens` pula para `cobranca` (v2) ou `agenda` (v1); `<PlanStepper>` recebe props `v2` + `billingConfigured`. Render condicional: 3 novos componentes locais — `StepCobrancaV2` (envolve `BillingSettingsBlock` + botões salvar/avançar), `StepAgendaV2` (envolve `AcceptanceScheduleEditor` + valida `monthlyMissingCount=0` antes de avançar), `StepContratoV2` (envolve `ContractAcceptanceBlock` + após iniciado mostra parcelas/estimativa/fechamento mensal/`MaterializeBlock` para reverter). Caminhos v1 ficam atrás de `!v2`.
- **Estado validado:** **419/419 testes verdes** (mantido); typecheck OK; lint 0 erros / 2816 warnings (idêntico à baseline anterior); workflow `Start application` rodando, app renderiza sem erros no preview. Flag fica `false` por default — UX legada permanece intocada até a clínica explicitamente flipar `clinics.use_v2_acceptance_flow=true` via `PATCH /api/clinics/current`. Próximos: F4 (aceite público v2 com calendário), F5 (holds), F6 (rollout + deprecar fluxo legado).

**30/04/2026 — Sprint 15 (F1+F2 bug-fixes + F3 fundação): integridade do orquestrador atômico e flag `useV2AcceptanceFlow`**
- **Bug-fixes em F1+F2 (3 issues identificadas em revisão):** (1) `validatePlanForAtomicAccept` retornava `ok: items.length > 0 && errors.length === 0` quando entrava no early-return de "0 itens" — confuso e tecnicamente correto mas semanticamente ambíguo; agora retorna explicitamente `ok: false`. (2) Caminho idempotente do `acceptAndMaterializePlan` (já aceito + materializado) devolvia `MaterializeResult` com contadores zerados — front-end reportaria "0 consultas, 0 faturas criadas" mesmo com dezenas existentes. Adicionado helper `getExistingMaterializationSummary(planId)` que computa via SQL agregado: appointments NÃO em ('cancelado','remarcado') via JOIN com `treatment_plan_procedures` (appointments só linkam por `treatmentPlanProcedureId`), faturas dos tipos `faturaPlano`/`faturaPlanoAvulsoMensal`/`vendaPacote` não canceladas, soma do `amount` (normalizado para 2 casas para casar com o formato emitido por `materializeTreatmentPlan`) e `COUNT(DISTINCT plan_month_ref)` para `monthsCovered`. (3) `GET /atomic-validation` retornava só pendências do plano mas a UI também precisa saber as cláusulas obrigatórias da clínica para mostrar checkboxes — sem isso o `POST /accept-and-materialize` falharia com `400 clause_required_missing` mesmo a UI tendo passado a validação. Endpoint agora resolve `clinicId` via `getPatientClinicId` (em paralelo com a validação) e devolve `clauses[]` com `{code, version, title, body, isRequired}` da clínica do paciente.
- **F3 — fundação para o wizard v2:** (a) Migration `0017_clinics_use_v2_acceptance_flow.sql` adiciona coluna boolean `use_v2_acceptance_flow` (DEFAULT FALSE, NOT NULL) em `clinics` — aplicada via `psql` (mesmo padrão de 0016 que também não está no journal `_journal.json`; o setup local usa `db:push` em vez de `db:migrate`). (b) Schema `lib/db/src/schema/clinics.ts` ganhou `useV2AcceptanceFlow: boolean(...).notNull().default(false)`. (c) `PATCH /api/clinics/current` ganhou whitelist do campo (só aceita boolean explícito; `null`/`undefined` são ignorados para preservar o NOT NULL). (d) Tipo `Clinic` em `pages/settings/configuracoes/types.ts` declara `useV2AcceptanceFlow?: boolean`. (e) Novo hook `artifacts/fisiogest/src/hooks/use-clinic-settings.ts` expõe `useClinicSettings()` (cache 5min, desabilitado para super-admin global) e `useV2AcceptanceFlow(): boolean` (atalho que retorna `false` durante o load para evitar flash de UI v2). Próximos passos pendentes em F3: `BillingConfigSection.tsx`, reorganizar `PlanStepper` para 4 etapas, renomear `AcceptanceScheduleEditor`/`AcceptanceBlock`, e plugar tudo em `TreatmentPlanTab` atrás da flag.
- **Estado validado:** typecheck verde; **419/419 testes verdes** (mantido; tests do orquestrador atualizados para mockar `appointmentsTable`/`financialRecordsTable` + `sql` template + chain `.innerJoin()`); workflow rodando.

**30/04/2026 — Sprint 15 (F1+F2): orquestrador atômico de aceite + materialização do plano**
- **Problema atacado:** o fluxo legado aceitava o plano (criava faturas + reconhecimento contábil) ANTES do paciente escolher horários no calendário. Resultado: faturas geradas para um plano que ainda não tinha agenda, e materialização posterior podia falhar deixando o sistema em estado inconsistente (aceite contabilizado mas sem appointments). Plano completo em `sprints/SPRINT-15-fluxo-aceite-v2.md` (6 fases).
- **F1 — Orquestrador (`treatment-plans.atomic.ts`):** novo módulo com 3 funções. (a) `validatePlanForAtomicAccept(planId)` — checa pré-condições estruturais: plano tem `startDate`, ≥1 item; itens recorrentes/pacotes têm `weekDays` + horário (mapa por dia OU `defaultStartTime`) + `scheduleId`; itens avulsos exigem `unitPrice > 0` (não precisam de agenda). Retorna `{ ok, errors[] }` com mensagens acionáveis para a UI. (b) `acceptAndMaterializePlan({ patientId, planId, ctx, trail, materializeOpts? })` — orquestra `acceptPatientTreatmentPlan` → `materializeTreatmentPlan` em sequência; se materialize falha, executa **rollback compensatório**: `dematerializeTreatmentPlan` (remove faturas pendentes + journal entries que o materialize criou) + `revertPlanAcceptance` (zera campos de trilha LGPD). Idempotente: se já aceito+materializado retorna estado atual; se aceito mas não materializado, executa só o materialize. (c) `revertPlanAcceptance(planId)` — reset atômico dos 8 campos de aceite (`acceptedAt`, `acceptedBy`, `acceptedBySignature`, `acceptedIp`, `acceptedDevice`, `acceptedVia`, `frozenPricesJson`, `acceptedClausesJson`).
- **Decisão de arquitetura:** NÃO usar uma única transação envolvendo materialize (1080 linhas, refator profundo arriscado). Em vez disso, rollback compensatório explícito — `dematerialize` já trata cleanup de faturas+entries, então só faltava reverter os campos do aceite. Trade-off documentado nos riscos do plano.
- **F2 — Endpoints atômicos:** (a) `POST /api/patients/:patientId/treatment-plans/:planId/accept-and-materialize` (presencial, requer `medical.write`) em `medical-records.routes.ts`; (b) `POST /api/public/treatment-plans/by-token/:token/accept-and-materialize` em `public.routes.ts` — mesmo contrato, sem auth (posse do token = credencial), traduz HttpError do orquestrador para PublicError preservando códigos HTTP; (c) `GET /api/patients/:patientId/treatment-plans/:planId/atomic-validation` — endpoint read-only para a UI mostrar checklist de pendências antes de habilitar o botão "Assinar e iniciar plano". Endpoints legados (`POST /accept` + `POST /materialize`) **permanecem intactos** para compat — F6 vai deprecá-los após estabilidade.
- **Testes (`treatment-plans.atomic.test.ts`):** 11 novos testes com mock pesado de `@workspace/db` (chain `select.from.[leftJoin].where.[limit]`) e dos serviços orquestrados. Cobrem: validate ok/erro (weekDays, startTimes, unitPrice, startDate); orquestrador caminho feliz (ordem accept→materialize); rollback (materialize falha → dematerialize + revert + 400); idempotência (já aceito+materializado → no-op); falha de validação prévia (sem chamar accept). Ajuste fino do mock chain para suportar tanto `await db.select().from().where().limit(1)` quanto `await db.select().from().leftJoin().where()`.
- **Estado validado:** typecheck verde; **419/419 testes verdes** (408 → 419, +11 novos); workflow `Start application` rodando. F3–F6 (frontend wizard reordenado, aceite público v2, sistema de holds, rollout) ficam como próximos sprints — escopo grande demais para um único turno; documentados no plano.
- **Arquivos novos:** `sprints/SPRINT-15-fluxo-aceite-v2.md`, `artifacts/api-server/src/modules/clinical/medical-records/treatment-plans.atomic.ts`, `artifacts/api-server/src/modules/clinical/medical-records/treatment-plans.atomic.test.ts`. **Editados:** `medical-records.routes.ts`, `public.routes.ts`.

**30/04/2026 — Auditoria pós-import + remoção de aviso de deprecation do driver `pg`**
- **Análise completa**: `pnpm typecheck` verde; `pnpm test` 408/408 verdes; `pnpm lint` 0 erros (2.814 warnings cosméticos restantes — todos `imports/vars não usados` em arquivos grandes de `settings/configuracoes` e `saas/superadmin` herdados de refatorações anteriores; nenhum bloqueia build, runtime ou testes). Nenhum erro de TypeScript, nenhuma rota quebrada, nenhum bug funcional encontrado.
- **Fix `lib/db/src/index.ts`**: o driver `pg` emitia `SECURITY WARNING: The SSL modes 'prefer','require','verify-ca' are treated as aliases for 'verify-full'` na inicialização do Pool porque `pg-connection-string` parseia `sslmode=require` da `DATABASE_URL` (Neon). Solução: extrair `sslmode` da URL via regex, derivar a config `ssl: { rejectUnauthorized: sslmode in {'verify-ca','verify-full'} }` e remover o param `sslmode` da connectionString antes de passá-la ao `Pool`. Resultado: aviso eliminado em dev e nos testes; comportamento de TLS preservado (Neon continua exigindo TLS, sem verify de cert por compatibilidade com `require`).
- **Lint autofix**: `pnpm lint:fix` aplicado (1 ajuste autofixável, restante manual).
- **Estado validado**: workflow `Start application` reiniciado, frontend (5000), api-server (8080) e mockup-sandbox (8081) up; landing renderizando; `Server listening on port 8080` sem warnings; 6 schedulers agendados; 408/408 testes ainda verdes; typecheck ainda verde.

**30/04/2026 — Sprint Financeiro 14 (Hardening): correção de 2 bugs contábeis críticos no fechamento mensal e cancelamento de plano**
- **Bug-fix #1 — `end-of-month-closure.service.ts`:** (a) filtro ampliado para `inArray(transactionType, ['faturaPlano','faturaPlanoAvulsoMensal'])` — antes ignorava P4 e elas nunca eram fechadas; (b) detecção do modo P3/P4 via `SELECT` em `accountingJournalEntriesTable` (eventType='deferred_receivable', status='posted'): quando existe deferred, força `postWalletUsage` mesmo com fatura `pendente`. Antes, fatura P3 pendente caía em `postReceivableRevenue` e criava recebível duplicado em cima do deferred do aceite; (c) default `revenueAccountCode` por tipo: `4.1.1` para `faturaPlanoAvulsoMensal`, `4.1.2` para `faturaPlano`.
- **Bug-fix #2 — `treatment-plans.cancel.ts`:** novo helper `postPartialDeferredReversal` em `accounting.service.ts` (`D 2.1.1 / C 1.1.2`, eventType `deferred_receivable_partial_reversal`). Caso `recognitionCreditsConsumed > 0` (parcialmente reconhecida, não paga) deixou de ser enganosamente marcado como `paidInvoiceIds` com skip — agora posta estorno parcial pelo saldo restante (`amount − recognizedAmount`), preservando as fragmentas já reconhecidas (regime de competência), e marca a fatura como `cancelado`. `CancelTreatmentPlanResult` ganhou `partialReversalsPosted` e `partiallyConsumedInvoiceIds`. `paidInvoiceIds` voltou a significar exclusivamente "faturas já pagas que requerem ressarcimento manual".
- **Estado validado:** typecheck verde, lint sem novos errors, suite **408/408 verdes** (405 → 408, +3 novos: end-of-month P3 pendente → walletUsage; end-of-month P4 com default 4.1.1; cancel com consumed>0 postando estorno parcial; +1 ajuste do edge case residual=0). Workflow `Start application` rodando.
- **Bug-fix #3 — `/api/reports/reconciliation`:** `accDeferredOutstanding` agora é genuinamente líquido: `gross − allocated − partialReversed`. (a) `gross` = SUM(débito 1.1.2 dos `deferred_receivable` posted); (b) `allocated` = SUM(`receivable_allocations.amount` cujo `receivable_entry_id` aponta pra um deferred posted) — captura as liquidações P3; (c) `partialReversed` = SUM(crédito 1.1.2 dos `deferred_receivable_partial_reversal` posted) — captura os estornos parciais do fix #2. Reversões integrais já são excluídas pelo filtro `status='posted'`. Resposta JSON ganhou `accounting.deferredReceivablesBreakdown` (gross/allocated/partialReversed) para auditoria. Diff cosmético eliminado.

**30/04/2026 — Sprint Financeiro 13 (P4): aceite contábil antecipado para avulsos do plano + cobrança da diferença em rompimento**
- **`acceptPlanFinancials` ramo `kind='avulso'`:** o aceite agora gera 1 fatura por (item avulso × mês de vigência) com `transactionType='faturaPlanoAvulsoMensal'`, `amount = sessionsPerMonth × effectivePrice` (sessões/mês = `sessionsPerWeek × 4`, default 1), `recognitionCreditsTotal = sessionsPerMonth`, `priceSource='plano_avulso_estimado'`. Para cada fatura criada, posta `D 1.1.2 / C 2.1.1` (`postDeferredReceivable`). Idempotência por `(treatmentPlanId, treatmentPlanProcedureId, transactionType, planMonthRef)` na fatura e `(sourceType, sourceId, eventType='deferred_receivable')` no entry.
- **PlanItem ganhou `sessionsPerWeek`** no loader (`loadAcceptanceItems`).
- **`treatment-plans.revenue-recognition.ts`** aceita `faturaPlanoAvulsoMensal`; novo `countAvulsoSessions` recalcula o pool por (item, mês) na primeira chamada quando `recognition_credits_total IS NULL`.
- **`appointments.billing.ts` resolve `monthlyInvoiceId` lazy:** appointments avulso continuam materializados com `monthlyInvoiceId=null`. Antes do reconhecimento, faz lookup `(treatmentPlanProcedureId, planMonthRef='YYYY-MM-01', transactionType='faturaPlanoAvulsoMensal')` e atualiza o appointment.
- **`treatment-plans.cancel.ts` ampliado:** query agora cobre `inArray(transactionType, ['faturaPlano','faturaPlanoAvulsoMensal'])` para estornar `deferred_receivable` de ambos os tipos no rompimento. Novo parâmetro opcional `recalculate` (boolean): quando `true` e a cláusula `PRECO_DIFERENCIADO` está aceita em `acceptedClausesJson`, para cada appointment `compareceu/concluido` ligado a item `kind='avulso'`: calcula `diff = procedures.price − effectivePrice (unitPrice − discount)`, e quando `diff > 0` cria FR `transactionType='priceDifference'` (`priceSource='preco_tabela'`) e posta `D 1.1.2 / C 4.1.1` via `postReceivableRevenue` com `eventType='price_difference'`. Idempotente por `(appointmentId, eventType='price_difference', reversalOfEntryId IS NULL)`. Itens `kind='recorrenteMensal'` são pulados (mensalidade vendeu o mês). Resposta enriquecida com `recalculatedAppointments`, `priceDifferenceTotal`, `recalculateSkippedReason` (`null` ou `'clause_not_accepted'`).
- **Endpoint `POST /api/treatment-plans/:planId/cancel`** agora aceita `{ reason, recalculate?: boolean }`.
- **Reconciliation (`/api/reports/reconciliation`):** o operacional `deferredReceivablesOutstanding` passa a somar `faturaPlano` **e** `faturaPlanoAvulsoMensal` em aberto com `deferred_receivable` postado e não estornado. Tabela §10 da doc atualizada.
- **Estado validado:** `pnpm typecheck` verde, suite **405/405 verdes** (395 → 405, +10 novos: `treatment-plans.acceptance-avulso` × 4 — 3 meses × 1 item criando 3 faturas e 3 deferred, skip por unitPrice ≤ 0, skip sem procedureId, idempotência total; `treatment-plans.cancel-recalc` × 6 — recalculate=false zerado, recalculate=true sem cláusula → skip, 3 appts gerando 3× price_difference, diff ≤ 0 não posta, kind=recorrenteMensal pulado, idempotência por appointment).

**30/04/2026 — Sprint Financeiro 12 (P3): aceite contábil antecipado para mensalidades + cancelamento formal de plano**
- **Migration `0016_treatment_plans_cancellation.sql`** adiciona 3 colunas em `treatment_plans`: `cancellation_reason` (TEXT), `cancelled_at` (TIMESTAMP), `cancelled_by` (INTEGER). Schema Drizzle atualizado em `medical-records.ts`. Idempotente.
- **Helper `postDeferredReceivable` em `accounting.service.ts`:** posta `D 1.1.2 (Recebíveis) / C 2.1.1 (Adiantamentos)` com `eventType='deferred_receivable'`. Idempotência por `(sourceType='financial_record', sourceId=fatura.id, eventType)`.
- **`acceptPlanFinancials` (ramo `recorrenteMensal`)** reescrito: agora cria TODAS as faturas mensais da vigência (`durationMonths`, default 12) já no aceite e posta `postDeferredReceivable` por fatura. Vencimento via `planInstallmentDueDate(start, billingDay, m)` (1ª nunca antes do `startDate`). Apenas mês 0 conta em `totalImmediateCharge`. Sub-conta de receita (4.1.2) resolvida pelo `procedure.accountingAccountId`. Idempotência forte por `(plano, item, planMonthRef)` + por `(sourceId, eventType)` para o entry.
- **`treatment-plans.revenue-recognition.ts` ramifica P3 vs legado:** detecta P3 via SELECT do `deferred_receivable` postado para a fatura. Se P3 → `postWalletUsage` (D 2.1.1 / C 4.1.2) MESMO com fatura `pendente`; se legado → mantém `pago=walletUsage / pendente=receivableRevenue`. Garante coerência: o passivo (2.1.1) já existe desde o aceite, então cada fragmenta sempre desce do adiantamento.
- **`financial-payments.routes.ts` ramifica P3 vs legado no settlement:** se a fatura tem `deferred_receivable` → `postReceivableSettlement` + `allocateReceivable` contra o entry antecipado (paga sem mexer em 4.1.2); se legado → mantém `postCashAdvance` (D 1.1.1 / C 2.1.1).
- **Novo endpoint `POST /api/treatment-plans/:planId/cancel`** + service `treatment-plans.cancel.ts`: estorna `deferred_receivable` (postReversal) das faturas mensais NÃO consumidas (`recognitionCreditsConsumed=0` AND status IN `pendente`/`vencido`), marca cada uma como `cancelado` e atualiza `treatment_plans` (`status='cancelado'`, `cancellation_reason`, `cancelled_at`, `cancelled_by`). Faturas pagas/parcialmentePago e faturas com receita já reconhecida ficam fora (lista retornada como `paidInvoiceIds` para ressarcimento manual). Validação: `reason` obrigatório com mínimo 3 caracteres. Idempotente: 2ª chamada em plano cancelado é no-op.
- **Relatório `/api/reports/reconciliation` ampliado (§10):** novo diff `deferredReceivables` = `operational.deferredReceivablesOutstanding` (soma das `faturaPlano` em aberto com `deferred_receivable` postado) − `accounting.deferredReceivablesOutstanding` (soma dos débitos em 1.1.2 dos `deferred_receivable` postados, JOIN entre `accountingJournalEntries`/`accountingJournalLines`/`accountingAccounts`). Compõe o `ok` final junto com `pendingReceivables` e `orphans`. Resposta inclui contador de faturas (`deferredReceivablesCount`) para auditoria operacional.
- **Estado validado:** typecheck verde, suite **395/395 verdes** (388 → 395, +7 novos: revenue-recognition modo P3 × 1, treatment-plan-cancel × 6 — motivo curto, plano já cancelado, 12 faturas pendentes, mistura paga/pendente, recognitionCreditsConsumed>0, sem deferred_receivable). Migration aplicada via `psql`. Workflow `Start application` rodando.

**30/04/2026 — Sprint Financeiro 11 (P5): cláusulas contratuais configuráveis no aceite do plano**
- **Migration `0015_clinic_contract_clauses.sql`** cria `clinic_contract_clauses` (id, clinic_id FK ON DELETE CASCADE, code, title, body, version DEFAULT 1, is_active DEFAULT TRUE, is_required DEFAULT FALSE, sort_order DEFAULT 0, timestamps), índice por `clinic_id` e índice único `(clinic_id, code, version)` permitindo histórico de versões. Adiciona coluna `accepted_clauses_json` (TEXT) em `treatment_plans` para o snapshot congelado das cláusulas aceitas no momento do aceite.
- **Schema `lib/db/src/schema/clinic-contract-clauses.ts`** + reexport em `index.ts` + campo `acceptedClausesJson` adicionado a `treatmentPlans`. Ambos os tipos `Insert/Select` exportados.
- **Service `contract-clauses.service.ts`** com CRUD por clínica: `listForClinic({includeInactive})`, `getById`, `create` (auto-incrementa version e desativa anteriores se code já existe = "publicar nova versão"), `update` (toggle isRequired/isActive/sortOrder), `softDelete` (is_active=false), `hardDelete` (bloqueia se cláusula em uso por algum plano via varredura JSON). Helper `seedDefaults` insere as 3 cláusulas-padrão (REAGENDAMENTO_INTRAMENSAL, PRECO_DIFERENCIADO, TITULO_EXECUTIVO) idempotentemente apenas se a clínica não tiver cláusulas. Helper `buildAcceptedClausesSnapshot` usado pelo aceite: valida que todas as is_required=true foram marcadas (`HttpError.badRequest('Cláusula obrigatória não aceita: …', issues=[{code, code:'clause_required_missing'}])`) e devolve JSON com `{acceptedAt, items:[{code, version, title, body, isRequired}]}`.
- **Routes `contract-clauses.routes.ts`** registradas em `/api/clinics/current/contract-clauses` (GET com `?includeInactive=1`, POST, PUT/:id, DELETE/:id com `?hard=1`, POST /seed-defaults), todas exigem `settings.manage` + `req.clinicId` resolvido pelo JWT. Validação Zod nos payloads.
- **Aceite (presencial e público) com cláusulas:** `acceptPatientTreatmentPlan` aceita novo campo `acceptedClauseCodes: string[]`, chama `buildAcceptedClausesSnapshot`, e passa o JSON serializado como 6º arg para `repo.acceptTreatmentPlan` que persiste em `accepted_clauses_json`. Snapshot público (`loadPublicPlanSnapshot`) ampliado com dois novos campos: `contractClauses` (cláusulas vigentes da clínica do paciente, ordenadas por sortOrder) e `acceptedClauses` (parsed do JSON congelado quando o plano já está aceito).
- **Front-end Configurações → Cláusulas** (nova seção): `ClausulasSection.tsx` com CRUD completo — lista (toggle "incluir inativas"), criar/versionar (modal com title/body/required/sortOrder), edição inline de toggles, soft/hard delete, botão "Carregar cláusulas-padrão" quando vazio. Registrada em `components/index.ts`, `constants.ts SECTIONS` (icon FileText, permission `settings.manage`), `helpers.ts Section` type/getHashSection, e `index.tsx` render switch.
- **Front-end aceite (interno + público):** `AcceptanceBlock.tsx` busca cláusulas via React Query quando o dialog presencial abre, renderiza checkboxes (badge "obrigatória" + amber bg), bloqueia botão de confirmar até todas as obrigatórias estarem marcadas, e envia `acceptedClauseCodes` no POST. Página pública `aceite.tsx` recebe cláusulas no snapshot, renderiza checkboxes na sessão de assinatura (com aviso âmbar quando faltam obrigatórias), bloqueia o botão até allRequiredAccepted, e mostra um bloco verde "Cláusulas aceitas no momento da assinatura" (com versão) após o aceite.
- **Estado validado:** typecheck verde, suite **388/388 verdes** (373 → 388, +15 novos: contract-clauses CRUD/versionamento × 12, acceptance.clauses (sem obrigatória → 400, com todas → ok) × 4, treatment-plan-accept (mock buildAcceptedClausesSnapshot) × 1 atualizado). Workflow `Start application` reiniciado, migration 0015 aplicada via `psql`, endpoint `seed-defaults` validado em runtime (3 cláusulas inseridas) e listagem retornando JSON correto.

**30/04/2026 — Sprint Financeiro 10 (P2): reconhecimento fracionado da mensalidade do plano + job EOM**
- **Migration `0014_financial_records_recognition_split.sql`** adiciona 3 colunas em `financial_records`: `recognized_amount` (NUMERIC(12,2) DEFAULT '0'), `recognition_credits_total` (INTEGER NULL = sentinel "modelo legado"), `recognition_credits_consumed` (INTEGER DEFAULT 0). Quatro CHECKs garantem invariantes: consumed ≤ total, recognized ≤ amount, recognized = amount quando consumed = total.
- **Reescrita do `treatment-plans.revenue-recognition.ts`:** nova função `recognizeMonthlyInvoiceRevenuePartial(invoiceId, appointmentId, appointmentDate)` com (1) advisory lock por fatura, (2) bootstrap do pool via COUNT de appointments do mês quando `recognition_credits_total IS NULL`, (3) idempotência por (fatura, sessão) consultando `accounting_journal_entries`, (4) share fracionado (`amount / total`) com último crédito absorvendo resíduo positivo, (5) `postReceivableRevenue` para fatura pendente ou `postWalletUsage` para fatura paga, sub-conta `4.1.2` por procedimento. Faturas legadas (sentinel populado + total NULL) → no-op. Alias `recognizeMonthlyInvoiceRevenue` mantido.
- **B12 (`appointments.billing.ts`)** ramifica entre modelo fracionado e legado: fracionado estorna SOMENTE a fragmenta da sessão (busca via financialRecordId+appointmentId, postReversal, decrementa `recognition_credits_consumed`); legado preserva o estorno integral antigo.
- **Novo job `endOfMonthRevenueClosure` (`30 7 * * *` UTC = `04:30 BRT`)** + service `runEndOfMonthRevenueClosure` em `financial/billing/end-of-month-closure.service.ts`. Só age no último dia do mês BRT. Para cada `faturaPlano` viva com saldo residual: posta entry "Apropriação de resíduo do mês — fatura #X" pela diferença, marca `recognition_credits_consumed = total`. Idempotente (TX + advisory lock + dupla checagem). Registrado em `scheduler/index.ts`.
- **Helper `reverseFaturaPlanoFragments`** em `payment-cascade.ts` para estornar TODAS as fragmentas vivas de uma `faturaPlano` quando a fatura é estornada manualmente. Plugado nos 3 sites de estorno (`financial-records.routes.ts`: PATCH /status, PATCH /estorno, DELETE), ramificando entre `faturaPlano` fracionada e legado/genérico.
- **Estado validado:** typecheck verde, suite **373/373 verdes** (357 → 373, +16 novos: revenue-recognition × 8, end-of-month-closure × 5, payment-cascade.fragments × 2, helper compartilhado × 1). Workflow `Start application` reiniciado, log do scheduler confirma `endOfMonthRevenueClosure agendado (30 7 * * *)`.

**30/04/2026 — Bugfix crítico: duplicidade de fatura mensal no mês 0 do plano (Aceite + Materialização)**
- **Sintoma:** após aceitar e iniciar o plano, o mês corrente exibia DUAS cobranças com mesmo valor e mesmo vencimento — uma "Aceite de plano #N" (criada no aceite) e outra "Plano #N" (criada na materialização). O total a receber do paciente ficava dobrado naquele mês, divergindo do valor mensal contratado.
- **Causa:** `acceptPlanFinancials` insere a `faturaPlano` do mês 0 (chave: `treatment_plan_id` + `treatment_plan_procedure_id` + `plan_month_ref` + `transaction_type='faturaPlano'`). Em seguida `materializeTreatmentPlan` (chamado em "Iniciar plano") gerava as faturas para todos os meses **sem checar idempotência** nessa mesma chave — portanto reinseria o mês 0. O job mensal `monthly-plan-billing.service.ts` já fazia esta checagem; só a materialização eager estava sem.
- **Correção (`treatment-plans.materialization.ts`):** antes de inserir cada fatura mensal o código agora faz `SELECT` pela triple `(treatmentPlanId, treatmentPlanProcedureId, planMonthRef)` com `transactionType='faturaPlano'`. Se já existir, **reaproveita o ID** para vincular appointments e pool de créditos do mês, sem criar nova fatura nem somar duas vezes ao `totalContracted`. `monthsCoveredCount` é incrementado em ambos os ramos (plano coberto independentemente de quem criou a fatura).
- **Limpeza de dados existentes (`scripts/cleanup-duplicate-plan-invoices.ts`):** script idempotente em **dry-run por padrão** que agrupa `faturaPlano` duplicadas pela mesma triple, mantém a mais antiga (a do aceite), religa `appointments.monthly_invoice_id` para o ID mantido e remove as demais. Pula grupos onde alguma duplicata já está paga/parcialmente paga (caso requer estorno manual). Aceita `--clinic <id>`. Executado em produção: removeu 1 fatura órfã (plano #80, item #48, mês 2026-05-01) e religou 4 appointments.
- **Estado validado:** `pnpm typecheck` verde, `pnpm test` 351/351 verde.

**30/04/2026 — UX: facilitar localizar dia pendente no editor "Horário por dia" (AcceptanceScheduleEditor)**
- **Sintoma:** ao salvar uma mensalidade 2x/sem (Seg + Qua) com horário definido apenas para Segunda, o toast "Defina um horário para cada dia. Falta o horário em: Quarta." aparecia, mas o card do segundo dia ficava abaixo do dobra (cada card pode ter dezenas de slots ocupando bastante altura). O usuário não percebia que existia um card de Quarta logo abaixo do de Segunda.
- **Correção (`AcceptanceScheduleEditor.tsx`):**
  - **Resumo** "X/Y dias preenchidos · falta(m): Qua" no header da Etapa 3 (badge âmbar quando incompleto, esmeralda quando ok).
  - **Cards dos dias pendentes** com borda âmbar, fundo `amber-50/40` e mini-badge "escolha um horário" ao lado do nome do dia.
  - **Scroll automático** ao primeiro dia pendente quando `handleSave` falha por horário faltando, com **pulse visual** (`ring-2 ring-amber-400 animate-pulse`) por ~1.8s no card alvo.
  - Refs gerenciadas em `useRef<Map<WeekDayKey, HTMLDivElement|null>>` com setter por chave; `pulseDay` em state limpa-se via `setTimeout`.
- **Estado validado:** `pnpm --filter fisiogest typecheck` verde, `pnpm test` 351/351 verde.

**30/04/2026 — Bugfix: desconto na Previsão Financeira do Plano (procedimentos avulsos)**
- **Bug 1:** o campo "Desconto" em procedimentos avulsos era armazenado como abatimento fixo no total — entrar R$ 80 num procedimento de R$ 180 com 17 sessões resultava em `17 × 180 − 80 = R$ 2.980,00`, em vez do esperado `17 × (180 − 80) = R$ 1.700,00`.
- **Bug 2 (subjacente, descoberto em validação):** quando o usuário deixava "Total de sessões" vazio (plano "aberto" — estima-se pelas semanas de vigência × sessões/semana), o `handleAddSubmit` usava `Number(itemSessions) || 1` → multiplicava o desconto-por-sessão por **1**, gravando R$ 80 no banco. No display posterior, o sistema dividia por 104 sessões estimadas → "(-R$ 0,77/sessão)" e total `104 × (180 − 0,77) = R$ 18.640,00`.
- **Correção (`TreatmentPlanItemsSection.tsx`):** o desconto digitado para procedimento avulso passa a ter semântica **por sessão** (em R$ ou %), e o componente armazena `unitDisc × sessões` no campo `discount` do schema (mantendo a convenção de "desconto total" no banco — sem migração necessária).
  - `handleAddSubmit` (procedure): usa **a mesma fórmula** de `plannedSessionsForItem` (totalSessions explícito **ou** estimativa por vigência × spw) para calcular `sessCount` antes de armazenar `unitDisc × sessCount`. Garante consistência entre input e display, inclusive em planos "abertos" sem totalSessions.
  - `handleEditSave`: idem — usa `plannedSessionsForItem` quando `editSessions` está vazio.
  - `startEdit`: para avulso, divide o desconto armazenado pela mesma contagem (totalSessions ou estimativa) para exibir o valor por unidade no input.
  - **Preview** do form, **cabeçalho do item** ("(-R$ X/sessão)") e **linha da Previsão Financeira** atualizados para mostrar a fórmula `N × (preço − desconto/sessão) = total`. Preview ganha indicador "*estimativa pela vigência (N meses)" quando totalSessions está vazio.
  - **Labels** "Desconto (por sessão, opcional)" no add e "(por sessão)" no edit, somente para avulsos.
- **Pacotes/mensalidades intocados:** desconto continua incidindo sobre o preço-bundle (semântica original).
- **Estado validado:** `pnpm typecheck` verde, `pnpm test` 351/351 verde.

**30/04/2026 — Bugfix: persistência e materialização de horários por dia (planos)**
- **Bug 1 (POST `/api/treatment-plans/:planId/procedures`):** o campo `startTimesByDay` era desestruturado mas nunca gravado na criação do item — qualquer cliente que enviasse o mapa por dia perdia a configuração silenciosamente. Corrigido: o POST agora valida (formato HH:MM, chaves de dia válidas) e persiste como JSON, espelhando o PUT. Também aplica a mesma validação `weekDays.length ≤ sessionsPerWeek` que já existia no PUT.
- **Bug 2 (`materializeTreatmentPlan`, ramo `oneShotItems`):** o gate exigia `defaultStartTime`, ignorando `startTimesByDay`. Itens de pacote/avulso configurados *só* com mapa por dia (sem fallback) eram silenciosamente pulados na materialização. Corrigido: agora aceita qualquer fonte de horário (mapa por dia OU `defaultStartTime`).
- **Refator:** validação de `startTimesByDay` extraída para a helper `normalizeStartTimesByDay` em `treatment-plan-procedures.routes.ts` (fonte única para POST e PUT).
- **Estado validado:** `pnpm typecheck` verde, `pnpm test` 351/351 verde.

**30/04/2026 — Documentação financeira consolidada**
- **Novo doc canônico:** `docs/FINANCEIRO.md` reúne em 18 seções todo o módulo financeiro/contábil — modelo de dados, plano de contas (partidas dobradas), 13 fluxos canônicos com débito/crédito, endpoints REST, schedulers, SaaS billing Asaas, roadmap de gateways de pagamento ao paciente, auditoria de bugs B1–B15, sprints 1–8, riscos sistêmicos, governança, otimizações, conciliação e testes (351/351 verdes).
- **Documentos antigos virados em redirecionadores:** `docs/financial.md`, `docs/auditoria-financeira.md`, `docs/sprints/SPRINTS-FINANCEIRO.md` agora apontam para o consolidado. Specs em `docs/superpowers/specs/` preservados como ADR (decisão histórica).

**30/04/2026 — Manutenção pós-auditoria financeira (Sprint 8)**
- **Bug TypeScript corrigido:** `TreatmentPlanTab.tsx` (`StepItens`) não declarava a prop `isAccepted`, quebrando o typecheck. Prop adicionada à assinatura e à chamada (TS2304 resolvido).
- **Resiliência do scheduler:** `tryAcquireAdvisoryLock` agora aplica retry com backoff (3 tentativas, 200/400ms) para tolerar erros transitórios do Postgres serverless ("Control plane request failed" do Neon durante cold-start). Falha residual é logada como `warn` (não-fatal: a próxima janela do cron tenta novamente).
- **Estado validado:** `pnpm typecheck` verde, `pnpm test` 351/351 verde.

## User Preferences

Always import `useAuth` from `@/hooks/use-auth`. The `auth-context.tsx` exports only `AuthProvider` and `AuthContext`. The `useAuth` hook now exposes `refreshUser()` to refetch `/api/auth/me` and update the user in context (e.g., after LGPD policy acceptance, so the modal doesn't reappear on every page navigation).

Before adding any new dependency, confirm that it is compatible with Node 22, ESM, and pnpm workspaces. Before proposing a framework migration, validate that the target is within the official compatibility matrix.

**Important (backend):** Never use `new Date().toISOString()` or `new Date().getMonth()` for business calculations. Always use the functions in `artifacts/api-server/src/lib/dateUtils.ts`:
- `todayBRT()` → "YYYY-MM-DD" string in Brasília timezone
- `nowBRT()` → `{ year, month, day }` in Brasília timezone
- `monthDateRangeBRT(year, month)` → `{ startDate, endDate }` for a month

## System Architecture

**Maximum Compatibility Rule (Hosting):**
This rule takes precedence over any other technical choice. Any runtime, framework, or package manager dependency added to the project **MUST** be within the official hosting platform compatibility matrix. Any PR/refactoring that introduces technology outside this list must be rejected.

**Official Compatibility Matrix:**

| Category | Permitted Options | Project Choice |
|---|---|---|
| **Frontend** | Angular, Astro, Next.js, Nuxt, Parcel, **React**, React Router, Svelte, SvelteKit, **Vite**, Vue.js | **React 19 + Vite 7** |
| **Backend** | Astro, **Express**, Fastify, Hono, NestJS, Next.js, Nuxt, React Router, SvelteKit | **Express 5** |
| **Node.js** | 24.x, 22.x | **22.x (LTS)** |
| **Package Manager** | npm, yarn, **pnpm** | **pnpm 10** (workspaces) |

**Technical Stack:**
- **Node.js**: **22.x LTS**
- **Package Manager**: **pnpm 10.26** (workspace)
- **TypeScript**: 5.9
- **Frontend** (`artifacts/fisiogest`): **React 19 + Vite 7** + TailwindCSS v4 + shadcn/ui (new-york)
- **Backend** (`artifacts/api-server`): **Express 5**
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation**: Zod v4, drizzle-zod (`lib/api-zod`)
- **API client**: React Query hooks generated by Orval (`lib/api-client-react`)
- **Authentication**: JWT (jsonwebtoken) + bcryptjs
- **Authorization**: RBAC with `user_roles`, `roles_permissions` tables; roles: admin, profissional, secretaria
- **Charts**: Recharts
- **Icons**: Lucide React

**UI/UX Decisions:**
- **Logo**: mark "Cruz Clínica" + wordmark "FisioGest Pro". Exports `LogoMark`, `LogoWordmark`, and `LogoLockup` with `tone` and `inverted` props for light/dark backgrounds.
- **Primary Color**: Deep Teal `hsl(180 100% 25%)`
- **Sidebar Color**: Dark Teal `hsl(222 47% 11%)`
- **Typography**: Inter (body) + Outfit (headings / display)
- **Semantic Palette**: Tokens in `index.css` (`--success`, `--warning`, `--info`, `--destructive`) with foreground variants, exposed as Tailwind classes.
- **Custom Icons**: 24 clinical icons in `artifacts/fisiogest/src/components/icons.tsx` compatible with Lucide API.

**System Design Choices:**

**Scheduler (Background Jobs):**
- **Billing automático**: `0 9 * * *` (06:00 BRT) - `runBilling()` for recurring monthly charges.
- **Fatura consolidada**: `5 9 * * *` (06:05 BRT) - `runConsolidatedBilling()` generates unique monthly invoices.
- **Auto-confirmação**: `*/15 * * * *` (every 15 min) - `runAutoConfirmPolicies()` confirms appointments.
- **Fechamento do dia**: `0 22 * * *` (22:00 BRT) - `runEndOfDayPolicies()` handles no-show, absence fees, and auto-completion.
- **Verificação de assinaturas**: `0 10 * * *` (07:00 BRT) - `runSubscriptionCheck()` manages expired trials and overdue accounts.

**Financial Core:**
- Financial records use a formal double-entry accounting ledger (`accounting_accounts`, `accounting_journal_entries`, `accounting_journal_lines`, `receivable_allocations`).
- Revenue recognition occurs upon service delivery or consumption of credits/wallet balance.
- Payment cascades for consolidated invoices ensure correct revenue recognition.
- Robust audit trails for reversals with mandatory `reversalReason`.
- Accounting categorization by procedure via `procedures.accounting_account_id`.

**Treatment Plan as Formal Sale:**
- `POST /api/patients/:patientId/treatment-plans/:planId/accept` accepts a plan, generating a snapshot of prices (`frozen_prices_json`) and capturing LGPD trail data (signature, IP, user-agent).
- Remote acceptance via public link is supported (`/aceite/:token`).
- Financial effects of plan acceptance are idempotent and transactional, creating invoices and session credits.
- Lazy generation of monthly plan invoices (`faturaPlano`) via a daily job.
- **Initial scheduling cap**: in `AcceptanceScheduleEditor` and at materialization, the number of `weekDays` selected per plan item cannot exceed `sessionsPerWeek` (the contracted weekly frequency). Enforced in three layers: UX (block toggle + counter `X/N`), `PUT /api/treatment-plans/:planId/procedures/:itemId` (returns 400 `weekdays_exceed_sessions_per_week`), and `materializeTreatmentPlan` (sanity check). After materialization, reschedules and absence credits may exceed the limit — the rule applies only at the initial setup step.
- **Per-day start times**: each plan item supports a different start time per weekday (e.g. Mon 08:00 + Wed 10:00) via `treatment_plan_procedures.start_times_by_day` (text/JSON map, lowercase keys `monday`…`sunday`, values `HH:MM`). `defaultStartTime` is preserved as a legacy fallback (used when a day has no explicit entry). Layers:
  - **UI** (`AcceptanceScheduleEditor`): renders one slot picker per selected day, each fetching its own `/available-slots` (no more intersection across days). Auto-save sends both `startTimesByDay` (JSON map) and `defaultStartTime` (= first day's time) for compat.
  - **API** (`PUT/POST /api/treatment-plans/:planId/procedures/:itemId`): validates each map key is a valid weekday and each value matches `HH:MM`; persists as JSON string, or 400 `invalid_start_times_by_day`.
  - **Materialization** (`treatment-plans.materialization.ts`): `resolveStartTimeForDate(date, map, fallback)` picks the per-day time for each appointment; existence-lookup uses `inArray(startTime, candidateStartTimesArr)` and only re-binds an existing appointment whose actual `startTime` matches the expected one for that date.
  - **Preview/start guards** (`WeeklyAgendaPreview`, `MaterializeBlock`): each weekday slot looks up its own time from the map; "missing schedule" warning fires when any selected weekday lacks both a map entry and a `defaultStartTime`.

**Quantitative Limits Enforcement (SaaS Plans):**
- `enforceLimit(resource, options?)` middleware prevents actions when `maxPatients`, `maxUsers`, `maxSchedules`, or `maxProfessionals` limits are reached, returning a `402 Payment Required` error with details.
- Frontend displays `PlanLimitDialog` and usage badges in the sidebar.

**LGPD Compliance:**
- Versioned policy documents (`policy_documents`) and user acceptance records (`user_policy_acceptances`).
- Backend endpoints for policy retrieval, acceptance, and patient data export (portability).
- Frontend features a force-open modal for pending policies, and a patient data export button for superadmins.

**Architectural Conventions:**
- **Backend (`modules/<domain>/<feature>/`):** `routes.ts`, `service.ts`, `repository.ts` (Drizzle queries only), `schemas.ts` (Zod), optional `helpers.ts`, `errors.ts`, `service.test.ts`. Domains include `_shared/`, `auth/`, `health/`, `public/`, `dashboard/`, `storage/`, `clinical/`, `catalog/`, `financial/`, `saas/`, `admin/`.
- **Frontend (`pages/<domain>/<feature>/`):** `index.tsx` (orchestrator), `components/`, `hooks/`, `schemas/`.
- **Zod Shared Schemas**: Centralized in `src/schemas/` with `xxxFormSchema`, `xxxFormDefaults`, `buildXxxPayload(values)`, and `type XxxFormValues`.
- **HTTP Call Layer**: Uses `src/utils/api.ts` helpers (`apiFetch`, `apiFetchJson`, `apiSendJson`) for consistent authentication and error handling.
- **Import Conventions**: Orval-generated hooks from `@workspace/api-client-react`, shared types from `@workspace/api-zod` and `@workspace/db`, `useAuth` from `@/hooks/use-auth`.

**Observability:**
- **Backend Logger**: `lib/logger.ts` (pino + AsyncLocalStorage) with `requestId` and redaction.
- **Correlation ID**: `requestContext.ts` middleware generates/propagates `X-Request-Id`.
- **Sentry**: Optional integration (activated via `SENTRY_DSN_BACKEND` and `VITE_SENTRY_DSN`).
- **Scheduler**: Each CRON job is instrumented with duration logging and exception capture.

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Drizzle ORM**: Used for database interactions.
- **jsonwebtoken**: For JWT-based authentication.
- **bcryptjs**: For password hashing.
- **Recharts**: For data visualization and charting.
- **Lucide React**: For general UI icons.
- **TailwindCSS**: For styling and UI development.
- **shadcn/ui**: UI component library built on Radix UI and Tailwind CSS.
- **Orval**: API client generator for React Query hooks.
- **pino**: High-performance logger for Node.js.
- **pino-http**: HTTP logger for pino.
- **Asaas**: SaaS billing integration (for clinic subscriptions).
- **esbuild**: For backend bundling.
- **Vite**: Frontend build tool.
- **Rollup**: Used by Vite for production builds.
- **date-fns**: For date manipulation and formatting.
- **Zod**: For schema validation.
- **drizzle-zod**: Zod schemas derived from Drizzle schemas.