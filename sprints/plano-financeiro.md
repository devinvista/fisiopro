# Plano de Trabalho — Reforma do Financeiro do Plano de Tratamento

**Origem:** análise do fluxo financeiro proposto pelo usuário em 30/04/2026 (chat).
**Escopo total:** 5 sprints (P1–P5), ~25h de trabalho engenheirado.
**Estado base:** 351/351 testes vitest verdes, sistema com partidas dobradas, idempotência via `planMonthRef` e advisory locks.

---

## Princípios de Design (acordados)

1. **Reconhecimento fracionado da mensalidade** — não mais integral na 1ª sessão. Cada sessão concluída apropria `valor_mensal / N_créditos_mês` em `4.1.2`.
2. **Créditos como fato gerador unificado** — pacotes, mensalidades e avulsos do plano todos geram `session_credits` com política de validade configurável (já existente em `monthlyCreditValidityDays` / `replacementCreditValidityDays`).
3. **Resíduo do mês apropriado no último dia (job)** — sessões não realizadas dentro do mês têm a receita apropriada de qualquer forma, preservando o valor mensal contratado. Justificativa contratual: cláusula de "reagendamento intramensal".
4. **Aceite gera lançamento contábil** — não apenas operacional. D 1.1.2 / C 2.1.1 distribuído pelos meses já no aceite (mensalidades) ou na materialização (avulsos do plano).
5. **Avulsos do plano com preço diferenciado** — direito a preço inferior à tabela em troca de compromisso de continuidade. Lança ativo/passivo antecipado; receita só nasce no consumo. Rompimento → cobrança da diferença para tabela.
6. **Vencimento escolhido pelo paciente** — campo único e visível na Etapa 3 (Cobrança), com fallback para `packages.billingDay` e `clinic.defaultDueDays`.

---

## Sprint Financeiro 9 (P1) — Vencimento da mensalidade no plano

**Risco:** Baixo · **Estimativa:** 2h · **Bloqueia:** P2, P3.

- **Migration `0013_treatment_plans_monthly_due_day.sql`:**
  - `ALTER TABLE treatment_plans ADD COLUMN monthly_due_day INTEGER CHECK (monthly_due_day BETWEEN 1 AND 28);`
- **Schema (`lib/db/src/schema/medical-records.ts`):**
  - Adicionar `monthlyDueDay: integer("monthly_due_day")` em `treatmentPlansTable`.
- **Backend:**
  - Novo helper `resolveMonthlyDueDay(plan, packageRow, clinicSettings)` em `treatment-plans.billing-dates.ts`. Hierarquia: `plan.monthlyDueDay → package.billingDay → clinic.defaultDueDays → 10`.
  - Usar em `acceptPlanFinancials` (substitui `item.packageBillingDay ?? 10`).
  - Usar em `materializeTreatmentPlan` (mesmo trecho).
  - Usar em `monthlyPlanBilling.service.ts` (geração lazy).
- **Frontend:**
  - `BillingSettingsBlock.tsx`: adicionar campo "Dia do vencimento da mensalidade" **sempre visível** (não só em `mensalConsolidado`). Default = `clinic.defaultDueDays`. Placeholder explica fallback para o pacote.
  - Schema do form (`treatmentPlanFormSchema`): incluir `monthlyDueDay`.
- **Testes:**
  - `treatment-plans.billing-dates.test.ts`: 4 casos da hierarquia (plan / package / clinic / fallback).
  - `treatment-plans.acceptance.test.ts`: criação de fatura usa `plan.monthlyDueDay` quando definido.

**Critério de aceite:**
- Novo plano cria `faturaPlano` no dia escolhido pelo paciente (não mais herda do pacote silenciosamente).
- Planos pré-existentes (sem `monthlyDueDay`) continuam usando o `packages.billingDay` (compatibilidade).
- 351 + N testes verdes.

---

## Sprint Financeiro 10 (P2) — Reconhecimento fracionado da mensalidade

**Risco:** Alto · **Estimativa:** 6–8h · **Depende de:** P1 (não estritamente, mas ordem prática).

- **Migration `0014_fatura_plano_recognition_split.sql`:**
  - `ALTER TABLE financial_records ADD COLUMN recognized_amount NUMERIC(12,2) DEFAULT '0';`
  - `ALTER TABLE financial_records ADD COLUMN recognition_credits_total INTEGER;`
  - `ALTER TABLE financial_records ADD COLUMN recognition_credits_consumed INTEGER DEFAULT 0;`
- **Schema:** novos campos em `financialRecordsTable`.
- **Backend — reescrita do reconhecimento:**
  - Renomear `recognizeMonthlyInvoiceRevenue` → `recognizeMonthlyInvoiceRevenuePartial(invoiceId, appointmentId, appointmentDate)`.
  - Algoritmo:
    1. Advisory lock `pg_advisory_xact_lock(invoiceId)`.
    2. Re-lê fatura: se `recognition_credits_total IS NULL`, calcula a partir do pool de créditos do mês (associa à `treatmentPlanProcedure.sessionsPerWeek × semanas_do_mês`) e persiste.
    3. Calcula `share = invoice.amount / credits_total`.
    4. Se `recognized_amount + share > invoice.amount`, ajusta `share = invoice.amount - recognized_amount` (último crédito recebe resíduo positivo).
    5. Posta D 1.1.2 ou 2.1.1 / C 4.1.2 (sub-conta do procedimento) por `share`.
    6. Atualiza `recognized_amount += share`, `recognition_credits_consumed += 1`.
- **Novo job `endOfMonthRevenueClosure`:**
  - Cron: `30 23 * * *` (verifica diariamente; só age se `today` é o último dia do mês BRT).
  - Para cada `faturaPlano` com `recognition_credits_consumed < recognition_credits_total` e `status NOT IN ('cancelado', 'estornado')`:
    - Calcula `residual = invoice.amount - recognized_amount`.
    - Se `residual > 0`: posta uma única entry "Apropriação de resíduo do mês — fatura #X" com tipo `endOfMonthClosure`.
    - Atualiza `recognition_credits_consumed = recognition_credits_total` e `recognized_amount = invoice.amount`.
- **Atualização da cascata de estorno (B12 expandido):**
  - Quando uma sessão sai do estado "concluído" e era a única confirmada do mês: estorna SOMENTE o `share` proporcional (não a entry inteira).
- **Testes (vitest):**
  - `revenue-recognition.partial.test.ts`: 5 casos (1 sessão, todas as N, paciente parou no meio + resíduo no fim do mês, sub-conta dinâmica, resíduo de centavos).
  - `endOfMonthClosure.test.ts`: 3 casos (mês fechou com saldo, mês fechou completo no-op, mês com fatura cancelada não toca).
  - Atualizar `revenue-recognition.race.test.ts` (B10) para o novo algoritmo.
- **Doc:** atualizar `docs/FINANCEIRO.md` §6.9, §7.4 e §9.

**Critério de aceite:**
- DRE de mês com 8 sessões realizadas exibe 8 entries de R$ 100 (mensalidade R$ 800).
- DRE de mês com 5 sessões realizadas + closure exibe 5 entries de R$ 100 + 1 entry de R$ 300.
- Estorno de sessão única: estorna só seu `share`, não a fatura inteira.
- 351 + ~10 testes verdes.

---

## Sprint Financeiro 11 (P5) — Cláusulas contratuais configuráveis

**Risco:** Médio · **Estimativa:** 4h · **Depende de:** nada (paralelizável).

- **Migration `0015_clinic_contract_clauses.sql`:**
  - `CREATE TABLE clinic_contract_clauses (id, clinic_id, code, title, body, version, is_active, is_required, sort_order, created_at, updated_at)`.
  - `ALTER TABLE treatment_plans ADD COLUMN accepted_clauses_json TEXT;` (snapshot LGPD).
- **Schema + endpoints:**
  - `GET/POST/PUT/DELETE /api/clinics/current/contract-clauses` (permissão `settings.manage`).
  - `acceptPatientTreatmentPlan` agora exige `acceptedClauseCodes: string[]` no payload e persiste snapshot em `accepted_clauses_json`.
- **Frontend:**
  - `AcceptanceBlock.tsx`: lista cláusulas ativas da clínica com checkbox "li e aceito" obrigatório para `is_required=true`.
  - Nova aba em `Configurações → Plano de Tratamento → Cláusulas`: CRUD com versionamento.
- **Seeds (3 cláusulas padrão):**
  - `REAGENDAMENTO_INTRAMENSAL` — falta sem reagendamento no mês não gera crédito futuro nem reembolso.
  - `PRECO_DIFERENCIADO` — rompimento autoriza recálculo das sessões realizadas pelo preço de tabela.
  - `TITULO_EXECUTIVO` — aceite constitui título executivo extrajudicial (CPC art. 784, III).
- **Testes:**
  - `contract-clauses.test.ts`: CRUD + versionamento + restrição de delete em uso.
  - `acceptance.clauses.test.ts`: aceite sem cláusula obrigatória → 400.

**Critério de aceite:**
- Clínica configura suas cláusulas em Configurações.
- Aceite mostra cláusulas e exige checkbox para as obrigatórias.
- `frozen_prices_json` + `accepted_clauses_json` formam o "contrato congelado" auditável.

---

## Sprint Financeiro 12 (P3) — Aceite contábil antecipado para mensalidades

**Risco:** Alto · **Estimativa:** 6h · **Depende de:** P1 + P2.

- **Backend:**
  - `acceptPlanFinancials` (item `recorrenteMensal`): além de criar `faturaPlano` do mês 0, também posta `D 1.1.2 / C 2.1.1` para CADA mês da vigência (`durationMonths`).
  - Cada entry tem `sourceType='financial_record'`, `sourceId = faturaPlano.id` (criada lazy aqui se ainda não existir, sem journal).
  - `materializeTreatmentPlan`: idempotente — se entry já existe para o mês, skip.
  - **Cancelamento do plano** (novo): `POST /api/treatment-plans/:planId/cancel` posta `postReversal` em todas as `faturaPlano` futuras não consumidas (com cláusula de "extinção contratual"). Mantém o que já foi reconhecido.
  - **Pagamento da mensalidade** (no `/payment` ou `PATCH /status='pago'`): vira `postReceivableSettlement` puro (D 1.1.1 / C 1.1.2). Não mais `postCashAdvance`.
- **Conciliação (§10):** novo diff "Recebíveis mensais antecipados esperados vs realizados".
- **Testes:**
  - `acceptance.advance-receivable.test.ts`: aceite de plano 12 meses → 12 entries D 1.1.2 / C 2.1.1.
  - `cancel-plan.test.ts`: cancelamento estorna só os meses não consumidos.
  - Atualiza `payment.test.ts` para o novo fluxo.

**Critério de aceite:**
- Aceite de plano 12×R$ 800 deixa imediatamente R$ 9.600 em 1.1.2 (Recebíveis) e R$ 9.600 em 2.1.1 (Adiantamentos).
- Conforme as sessões acontecem, o 2.1.1 desce e 4.1.2 sobe (P2).
- Pagamento mensal desce 1.1.2 e sobe 1.1.1.

---

## Sprint Financeiro 13 (P4) — Aceite contábil antecipado para avulsos do plano

**Risco:** Médio-Alto · **Estimativa:** 5h · **Depende de:** P3 + P5.

- **Backend:**
  - `acceptPlanFinancials` (item `avulso`): estima `sessions_per_month = sessionsPerWeek × semanas_úteis_mês` para cada mês da vigência. Posta `D 1.1.2 / C 2.1.1` por `(unitPrice − discount) × sessões_estimadas_mês`.
  - `applyBillingRules` (sessão avulsa concluída em plano): apropria 1 crédito (D 2.1.1 / C 4.1.1) em vez de criar recebível novo (B5-style).
  - **Cobrança de diferença em rompimento** (`POST /api/treatment-plans/:planId/cancel?recalculate=true`): para cada sessão consumida com preço diferenciado, posta `D 1.1.2 / C 4.1.1` pela diferença `(preço_tabela − preço_plano)`. Cláusula `PRECO_DIFERENCIADO` deve estar aceita.
- **Conciliação:** estende para incluir avulsos antecipados.
- **Testes:**
  - `acceptance.avulso-advance.test.ts`: plano com 2 itens avulsos × 6 meses → 12 entries D 1.1.2 / C 2.1.1.
  - `cancel-plan.recalc-difference.test.ts`: cancelamento com `recalculate=true` cobra diferença para tabela.

**Critério de aceite:**
- Avulso 1x/sem em plano de 6 meses lança recebível antecipado.
- Cancelamento sem cláusula `PRECO_DIFERENCIADO` aceita → não cobra diferença (só estorna futuro).
- Cancelamento com cláusula → cobra diferença e estorna futuro.

---

## Riscos Transversais

- **Migração de dados existentes:** todos os planos vigentes (com `materializedAt IS NOT NULL`) seguem o modelo antigo (recognized_credits_total NULL = sinaliza "modelo legado"). Apenas planos novos usam o fracionado.
- **Conciliação durante a transição:** o endpoint de reconciliação precisa entender as duas convenções (ou rodar uma migração one-shot que recalcula tudo — decisão pendente).
- **Performance:** o reconhecimento fracionado posta N entries em vez de 1. Em 351 testes pequenos é insignificante; em prod com clínica grande, monitorar `revenue_recognized_total`.
- **UX de cancelamento:** hoje o cancelamento de plano é silencioso. P3/P4 exigem fluxo formal com motivo e cláusula aceita.

---

## Cronograma Sugerido

| Semana | Sprint | Entregável |
|---|---|---|
| 1 | **P1** | Vencimento por plano funcional, com testes. |
| 2–3 | **P2** | Reconhecimento fracionado + job de fechamento mensal. |
| 4 | **P5** | Cláusulas configuráveis + UI. |
| 5–6 | **P3** | Aceite contábil antecipado de mensalidades. |
| 7 | **P4** | Aceite contábil antecipado de avulsos + cobrança de diferença. |
| 8 | **Hardening** | Migração de dados antigos (opcional), monitoração, documentação final. |

---

## Status Atual

- [x] **Sprint 9 (P1)** — concluída em 30/04/2026.
  - Migration `0013_treatment_plans_monthly_due_day.sql` aplicada.
  - Helper `resolveMonthlyDueDay` em `treatment-plans.billing-dates.ts`.
  - Backend integrado: aceite, materialização e cobrança lazy.
  - UI: campo "Dia do vencimento da mensalidade" sempre visível em `BillingSettingsBlock`.
  - Testes: 6 novos casos do helper. Suite total: **357/357 verdes** (351 → 357).
- [x] **Sprint 10 (P2)** — concluída em 30/04/2026.
  - Migration `0014_financial_records_recognition_split.sql` aplicada (3 colunas + 4 CHECKs).
  - Schema: `recognizedAmount`, `recognitionCreditsTotal`, `recognitionCreditsConsumed` em `financialRecordsTable`.
  - Reescrita do `treatment-plans.revenue-recognition.ts`:
    - Nova função `recognizeMonthlyInvoiceRevenuePartial` com advisory lock por fatura, bootstrap do pool via COUNT de appointments, idempotência por (fatura, sessão) via lookup em `accounting_journal_entries`, share por fragmenta com último absorvendo resíduo.
    - Faturas legadas (sentinel populado + total NULL) → no-op preservando comportamento.
    - Alias `recognizeMonthlyInvoiceRevenue` mantido (delega).
  - B12 atualizado em `appointments.billing.ts`: estorno granular por share no modelo fracionado, comportamento legado preservado.
  - Novo job `endOfMonthRevenueClosure` (`30 7 * * *` UTC = `04:30 BRT`) + service `runEndOfMonthRevenueClosure`. Apropria resíduo do mês no último dia, idempotente, com TX + advisory lock por fatura. Registrado em `scheduler/index.ts`.
  - Helper `reverseFaturaPlanoFragments` em `payment-cascade.ts` para estornar TODAS as fragmentas de uma `faturaPlano` quando estornada manualmente. Plugado nos 3 sites de estorno (PATCH /status, PATCH /estorno, DELETE) em `financial-records.routes.ts`.
  - Testes: 16 novos casos (`treatment-plans.revenue-recognition.test.ts` × 8, `end-of-month-closure.service.test.ts` × 5, `payment-cascade.fragments.test.ts` × 2, `payment-cascade.test.ts` × 1 helper compartilhado). Suite total: **373/373 verdes** (357 → 373).
- [x] **Sprint 11 (P5)** — concluída em 30/04/2026.
  - Migration `0015_clinic_contract_clauses.sql` aplicada (tabela `clinic_contract_clauses` + `treatment_plans.accepted_clauses_json`).
  - Service `contract-clauses.service.ts` (CRUD + versionamento + seedDefaults + buildAcceptedClausesSnapshot).
  - Routes `/api/clinics/current/contract-clauses` (GET/POST/PUT/DELETE/seed-defaults).
  - Aceite presencial + público com checkboxes de cláusulas (bloqueia confirmação até obrigatórias marcadas).
  - UI Configurações → Cláusulas: CRUD completo + carregar padrões.
  - Testes: 15 novos casos. Suite total: **388/388 verdes** (373 → 388).
- [x] **Sprint 12 (P3)** — concluída em 30/04/2026.
  - Migration `0016_treatment_plans_cancellation.sql` aplicada (3 colunas: `cancellation_reason`, `cancelled_at`, `cancelled_by`).
  - Helper `postDeferredReceivable` em `accounting.service.ts` (D 1.1.2 / C 2.1.1, eventType='deferred_receivable').
  - `acceptPlanFinancials` reescrito: cria todas as faturas mensais da vigência (default 12) + posta `postDeferredReceivable` por fatura (idempotente).
  - `recognizeMonthlyInvoiceRevenuePartial` ramifica P3 vs legado: detecta P3 via SELECT do deferred → sempre `postWalletUsage` mesmo com fatura `pendente`.
  - Settlement em `financial-payments.routes.ts`: P3 → `postReceivableSettlement` + `allocateReceivable`; legado → `postCashAdvance`.
  - Novo endpoint `POST /api/treatment-plans/:planId/cancel` + service `treatment-plans.cancel.ts`: estorna deferred das faturas não consumidas, marca canceladas, persiste auditoria. Faturas pagas/parcialmentePago listadas como `paidInvoiceIds` para ressarcimento manual.
  - Relatório `/reconciliation` ampliado com diff `deferredReceivables` (esperado vs realizado).
  - Testes: 7 novos casos (revenue-recognition modo P3 × 1, treatment-plan-cancel × 6). Suite total: **395/395 verdes** (388 → 395).
- [x] **Sprint 13 (P4)** — concluída em 30/04/2026.
  - `acceptPlanFinancials` ramo `kind='avulso'`: cria 1 fatura `transactionType='faturaPlanoAvulsoMensal'` por (item × mês) com `amount = sessionsPerMonth × effectivePrice` (sessões/mês = `sessionsPerWeek × 4`) e posta `D 1.1.2 / C 2.1.1` (`postDeferredReceivable`). Idempotente por `(planId, itemId, transactionType, planMonthRef)` + `(sourceId, eventType)`.
  - `PlanItem` ganhou `sessionsPerWeek` no loader; `recognition_credits_total = sessionsPerMonth`; `priceSource='plano_avulso_estimado'`.
  - `recognizeMonthlyInvoiceRevenuePartial` aceita `faturaPlanoAvulsoMensal`; novo `countAvulsoSessions` recalcula pool por (item, mês) na primeira chamada.
  - `appointments.billing.ts` resolve `monthlyInvoiceId` lazy via lookup `(treatmentPlanProcedureId, planMonthRef='YYYY-MM-01', transactionType='faturaPlanoAvulsoMensal')` antes do reconhecimento — appointments avulsos continuam materializados com `monthlyInvoiceId=null`.
  - `treatment-plans.cancel.ts`: query expandida para `inArray(transactionType, ['faturaPlano','faturaPlanoAvulsoMensal'])`. Novo flag `recalculate=true` (verifica cláusula `PRECO_DIFERENCIADO` em `acceptedClausesJson`): para cada appointment `compareceu/concluido` ligado a item `kind='avulso'`, calcula `diff = procedures.price − effectivePrice`; se `diff > 0`, cria FR `transactionType='priceDifference'` (`priceSource='preco_tabela'`) e posta `D 1.1.2 / C 4.1.1` via `postReceivableRevenue` com `eventType='price_difference'`. Idempotente por `(appointmentId, eventType='price_difference', reversalOfEntryId IS NULL)`. Itens `kind='recorrenteMensal'` são pulados.
  - Endpoint `POST /api/treatment-plans/:planId/cancel` aceita `{ reason, recalculate? }`; resposta inclui `recalculatedAppointments`, `priceDifferenceTotal`, `recalculateSkippedReason`.
  - `/reconciliation`: operacional `deferredReceivablesOutstanding` agora soma `faturaPlano` **e** `faturaPlanoAvulsoMensal` em aberto com deferred postado. Tabela §10 da doc atualizada.
  - Testes: 10 novos casos (`treatment-plans.acceptance-avulso` × 4, `treatment-plans.cancel-recalc` × 6). Suite total: **405/405 verdes** (395 → 405).

- [x] **Sprint 14 (Hardening)** — concluída em 30/04/2026.
  - **Bug-fix #1 — `end-of-month-closure.service.ts`:**
    - Filtro de candidatos ampliado: `inArray(transactionType, ['faturaPlano','faturaPlanoAvulsoMensal'])` — antes ignorava as faturas P4 e elas nunca eram fechadas.
    - Detecção do modo P3/P4 via `SELECT` em `accountingJournalEntriesTable` (eventType='deferred_receivable', status='posted'): quando existe deferred, força `postWalletUsage` mesmo com fatura `pendente`. Antes, `pendente` caía em `postReceivableRevenue` e criava recebível duplicado em cima do deferred do aceite.
    - Default `revenueAccountCode` por tipo: `4.1.1` para `faturaPlanoAvulsoMensal` (receita por sessão), `4.1.2` para `faturaPlano` (receita de pacotes/mensalidades).
  - **Bug-fix #2 — `treatment-plans.cancel.ts`:**
    - Novo helper `postPartialDeferredReversal` em `accounting.service.ts` (`D 2.1.1 / C 1.1.2` com eventType `deferred_receivable_partial_reversal`).
    - Caso `recognitionCreditsConsumed > 0` (fatura parcialmente reconhecida, não paga) deixou de ser enganosamente marcado como `paidInvoiceIds` com skip. Agora posta estorno parcial pelo saldo restante (`amount − recognizedAmount`), preservando as fragmentas já reconhecidas (regime de competência), e marca a fatura como `cancelado`.
    - `CancelTreatmentPlanResult` ganhou `partialReversalsPosted` e `partiallyConsumedInvoiceIds`. `paidInvoiceIds` voltou a significar exatamente "faturas já pagas que requerem ressarcimento manual".
  - **Testes:** 3 novos casos (`end-of-month-closure` × 2 — modo P3 pendente + P4 com 4.1.1; `treatment-plan-cancel` × 1 — estorno parcial; ajuste de mocks legados). Suite total: **408/408 verdes** (405 → 408). Typecheck e lint sem regressões.
  - **Bug-fix #3 — `/api/reports/reconciliation`:** `accDeferredOutstanding` agora é genuinamente líquido: `gross − allocated − partialReversed`. (a) `gross` = SUM(débito 1.1.2 dos `deferred_receivable` posted); (b) `allocated` = SUM(`receivable_allocations.amount` cujo `receivable_entry_id` é um deferred posted) — captura as liquidações P3; (c) `partialReversed` = SUM(crédito 1.1.2 dos `deferred_receivable_partial_reversal` posted) — captura os estornos parciais introduzidos no fix #2. Reversões integrais já são excluídas pelo filtro `status='posted'`. Resposta JSON ganhou `accounting.deferredReceivablesBreakdown` (gross/allocated/partialReversed) para auditoria. O diff cosmético deixou de existir.
