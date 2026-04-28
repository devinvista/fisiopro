# Sprint 6 — Limpeza final (drop `patient_subscriptions`)

**Status:** Entregue — 28/04/2026
**Predecessoras:** Sprints 0–5 (Entregues)

## Objetivo

Remover por completo o domínio legado de `patient_subscriptions` do código e do banco. A nova arquitetura unifica recorrência em `patient_packages` (cobrança mensal) e em `treatment_plans` + `treatment_plan_procedures` (faturas mensais materializadas), conforme entregue nos Sprints 1–5.

## Pré-condições verificadas

- Apenas 1 linha em `patient_subscriptions` (id=1, status `cancelada`, criada como espelho de plano #52). Backup gravado em `sprints/_baselines/sprint-6-patient-subscriptions.json`.
- Tabela `subscription_billing_logs` não existia (referência morta no schema antigo).
- Coluna `audit_log.subscription_id` não existia no banco (apenas no schema TypeScript desatualizado).
- Variáveis `BILLING_FROM_PACKAGES != "0"` e `LEGACY_AUTO_SUBSCRIPTION = "0"` já eram defaults — branches legados eram código morto em produção.

## Mudanças entregues

### Schema (`lib/db`)
- Removido arquivo `lib/db/src/schema/subscriptions.ts` e seu export em `index.ts`.
- Removida FK `accounting_journal_entries.subscription_id → patient_subscriptions.id` (campo permanece como `integer` puro para preservar lançamentos contábeis históricos).
- Campo `financial_records.subscription_id` permanece como `integer` puro (já era, sem FK) — mantém vínculo histórico para auditoria.
- Removida feature `module.patient_subscriptions` do catálogo (`lib/shared-constants/src/plan-features.ts`).
- Removidos `PATIENT_SUBSCRIPTION_STATUSES` e labels (`lib/shared-constants/src/statuses.ts`).

### Backend
- Deletado `artifacts/api-server/src/modules/financial/subscriptions/` (rotas e diretório completo).
- Deletado `consolidated-billing.service.ts` (substituído por `monthly-plan-billing.service.ts` desde Sprint 3).
- `billing.service.ts` reduzido ao único caminho `runBillingFromPackages`.
- `appointments.billing.ts` reduzido ao único caminho via `patient_packages`.
- `patient-packages.routes.ts` sem mais o bloco `LEGACY_AUTO_SUBSCRIPTION`.
- `billing-lock.ts` mantém apenas `withPackageBillingLock`.
- `scheduler/index.ts` e `scheduler/jobs/billing.job.ts` sem mais `consolidatedBillingJob`.
- `modules/index.ts` sem mais `subscriptionsRouter` (rota `/api/subscriptions/*` deixou de existir).
- Limpas referências em `financial.repository.ts`, `financial-payments.routes.ts`, `financial-records.routes.ts`, `appointments.service.test.ts`.

### Frontend
- Deletado `SubscriptionsSection.tsx` (já era re-export do novo `RecurringPackageSection`).
- `RecurringPackageSection.tsx` deixou de exigir feature `module.patient_subscriptions`.
- `LancamentosTab.tsx` sem mais o fetch e o handler de `/api/subscriptions/...`.
- `RecurringPackagesPanel.tsx` reduzido a uma única fonte (planos de tratamento aceitos).

### Scripts removidos (one-shot já executados)
- `scripts/migrate-subscriptions-to-packages.ts` — convertia subscriptions em packages (Sprint 5).
- `artifacts/api-server/src/scripts/migrate-legacy-plans.ts` — convertia subscriptions órfãs em planos legados (Sprint 5).
- `artifacts/api-server/src/scripts/backfill-treatment-plans-v2.ts` — backfill v2 (Sprint 5).
- `scripts/baseline-metrics.ts` — coletor de baseline pré-redesign (Sprint 0).

### Banco
- `pnpm db:push --force` aplicado para dropar `patient_subscriptions` e a FK em `accounting_journal_entries`.

### Documentação
- `replit.md`, `docs/financial.md`, `docs/clinical.md`, `.env.example` atualizados.

## Validação

- `pnpm typecheck` passa em todos os pacotes.
- `pnpm test` mantém suite verde (esperado 318/318, conforme baseline pós-Sprint 5).
- `\dt patient_subscriptions` no Postgres retorna "no relation".
- `accounting_journal_entries.subscription_id` permanece como `integer` (sem FK) — lançamentos históricos preservados.
