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

**30/04/2026 — Sprint Financeiro 14 (Hardening): correção de 2 bugs contábeis críticos no fechamento mensal e cancelamento de plano**
- **Bug-fix #1 — `end-of-month-closure.service.ts`:** (a) filtro ampliado para `inArray(transactionType, ['faturaPlano','faturaPlanoAvulsoMensal'])` — antes ignorava P4 e elas nunca eram fechadas; (b) detecção do modo P3/P4 via `SELECT` em `accountingJournalEntriesTable` (eventType='deferred_receivable', status='posted'): quando existe deferred, força `postWalletUsage` mesmo com fatura `pendente`. Antes, fatura P3 pendente caía em `postReceivableRevenue` e criava recebível duplicado em cima do deferred do aceite; (c) default `revenueAccountCode` por tipo: `4.1.1` para `faturaPlanoAvulsoMensal`, `4.1.2` para `faturaPlano`.
- **Bug-fix #2 — `treatment-plans.cancel.ts`:** novo helper `postPartialDeferredReversal` em `accounting.service.ts` (`D 2.1.1 / C 1.1.2`, eventType `deferred_receivable_partial_reversal`). Caso `recognitionCreditsConsumed > 0` (parcialmente reconhecida, não paga) deixou de ser enganosamente marcado como `paidInvoiceIds` com skip — agora posta estorno parcial pelo saldo restante (`amount − recognizedAmount`), preservando as fragmentas já reconhecidas (regime de competência), e marca a fatura como `cancelado`. `CancelTreatmentPlanResult` ganhou `partialReversalsPosted` e `partiallyConsumedInvoiceIds`. `paidInvoiceIds` voltou a significar exclusivamente "faturas já pagas que requerem ressarcimento manual".
- **Estado validado:** typecheck verde, lint sem novos errors, suite **408/408 verdes** (405 → 408, +3 novos: end-of-month P3 pendente → walletUsage; end-of-month P4 com default 4.1.1; cancel com consumed>0 postando estorno parcial; +1 ajuste do edge case residual=0). Workflow `Start application` rodando.
- **Pendência conhecida (não bloqueante):** `accDeferredOutstanding` em `/reconciliation` ainda não subtrai settlements quando uma fatura P3 paga consome o adiantamento — gera diff cosmético no relatório e fica para sprint futura. Documentado em `sprints/plano-financeiro.md`.

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