# Sprint 1 — Unificar Pacote Mensal e Assinatura

> **Objetivo:** mover a recorrência (`billingDay`, `monthlyAmount`, `nextBillingDate`, `status`) para `patient_packages`, eliminando a duplicação com `patient_subscriptions`.
> **Duração estimada:** 5 dias
> **Constraint:** _nenhuma_ alteração toca agendamentos com `date < 2026-04-30`.

## Estratégia

A unificação acontece em camadas, mantendo retrocompatibilidade durante toda a sprint:

1. **Camada de dados** — adicionar colunas ao `patient_packages` sem remover `patient_subscriptions` (read-mirror).
2. **Camada de migração** — copiar valores das subscriptions ativas para os pacotes correspondentes.
3. **Camada de escrita** — `patient-packages.routes.ts` passa a popular os novos campos no insert. A criação automática de subscription continua (será removida no fim da sprint quando os jobs estiverem migrados).
4. **Camada de leitura** — `billing.service.ts` e `consolidated-billing.service.ts` ganham uma rota alternativa que lê de `patient_packages` (atrás de feature flag `BILLING_FROM_PACKAGES=1`).
5. **Cutover** — flag ligada por padrão, criação automática de subscription removida, endpoints `POST /api/subscriptions` retornam 410 Gone.

## Entregáveis

| # | Item | Arquivo | Status |
|---|---|---|---|
| 1 | Doc da sprint | `sprints/sprint-1-unificar-pacotes.md` | ✅ |
| 2 | Schema com novos campos em `patient_packages` | `lib/db/src/schema/patient-packages.ts` | ✅ |
| 3 | Push do schema (`db:push`) | — | ✅ |
| 4 | Script de migração de subscriptions → packages | `scripts/migrate-subscriptions-to-packages.ts` | ✅ |
| 5 | Routes populam os novos campos | `artifacts/api-server/src/modules/catalog/patient-packages/patient-packages.routes.ts` | ✅ |
| 6 | Billing dual-source com flag | `billing.service.ts`, `consolidated-billing.service.ts`, `billing-lock.ts` (`withPackageBillingLock`) | ✅ |
| 7 | Endpoint `POST /api/subscriptions` retorna 410 | `subscriptions.routes.ts` | ✅ |
| 8 | Frontend: `RecurringPackageSection.tsx` lê de packages | `FinancialTab.tsx`, `RecurringPackageSection.tsx`, re-export legado em `SubscriptionsSection.tsx` | ✅ |
| 9 | Cutover (`LEGACY_AUTO_SUBSCRIPTION=0` por default) | `.env.example`, `patient-packages.routes.ts`, `appointments.billing.ts` | ✅ |
| 10 | Coluna `financial_records.patient_package_id` (+ índice parcial) | `lib/db/src/schema/financial.ts`, push direto via `ALTER TABLE` | ✅ |

## Status atual da rodada

**Concluído nesta rodada (cutover Sprint 1):**
- `runBilling` e `runConsolidatedBilling` agora têm caminho **novo (default)** lendo `patient_packages WHERE recurrence_status='ativa' AND recurrence_type IN ('mensal','faturaConsolidada')`. Cobranças vinculadas via `financial_records.patient_package_id`. Lock concorrente isolado em namespace negativo (`withPackageBillingLock`). Caminho legado preservado atrás de `BILLING_FROM_PACKAGES=0`.
- `appointments.billing.ts` no novo regime: linka `pendenteFatura` por `patient_package_id`; auto-cria a linha recorrente em `patient_packages` quando o preço veio de `plano_mensal_proporcional` e ainda não há recorrência ativa (substitui a antiga auto-criação de `patient_subscriptions`).
- `POST /api/subscriptions` agora responde **410 Gone** em pt-BR apontando para `POST /api/patients/:patientId/packages`. `GET/PUT/DELETE` permanecem ativos para gestão do legado.
- Default de `LEGACY_AUTO_SUBSCRIPTION` invertido: agora **desligado** (`=== "1"` para reativar). Pacotes recorrentes não geram mais espelho automático em `patient_subscriptions`.
- UI: `SubscriptionsSection` substituída por `RecurringPackageSection` (lê `/api/patients/:patientId/packages` e filtra por `recurrenceType`). Aba renomeada de "Assinaturas" → "Pacotes Recorrentes". `SubscriptionsSection.tsx` virou re-export para preservar imports antigos.
- Coluna `financial_records.patient_package_id` aplicada via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (push interativo do drizzle-kit estava bloqueado por prompt de outra tabela). Índice parcial `idx_financial_records_patient_package_id` criado.
- Test do `runBilling` atualizado para a shape do novo caminho (`pkg` em vez de `subscription`).
- Suíte de testes estabilizada (296/296 passando, 28/28 suites): mocks de `appointments.pricing.test.ts` ganharam `packagesTable` + `sql` (necessários após o JOIN com pacotes na resolução de preço); `RECEIVABLE_TYPES` no `financial-reports.service.test.ts` agora inclui `faturaPlano`; alias `@/` adicionado ao `vitest.config.ts` para resolver imports da UI nos schemas testados.
- Script `scripts/migrate-subscriptions-to-packages.ts` validado em dry-run (0 subscriptions ativas no banco — script fica disponível para clientes legados).

**Pendente (Sprint 6):**
- Drop definitivo de `patient_subscriptions` e remoção do bloco legado em `appointments.billing.ts`, `billing.service.ts`, `consolidated-billing.service.ts`.
- Remoção do re-export `SubscriptionsSection` → `RecurringPackageSection`.
- Remoção das envs `BILLING_FROM_PACKAGES` e `LEGACY_AUTO_SUBSCRIPTION` quando o legado for retirado.

## Schema (alvo)
```ts
patient_packages
├── billing_day        integer            (1..31, nullable enquanto não-recorrente)
├── monthly_amount     numeric(10,2)      (nullable)
├── next_billing_date  date               (nullable; calculado pela rotina)
├── recurrence_status  text               ('ativa'|'pausada'|'cancelada'|null)
└── recurrence_type    text               ('mensal'|'faturaConsolidada'|null)
```

## Critérios de aceite

- [x] Todas as `patient_subscriptions` ativas têm um `patient_package` correspondente com os mesmos `billing_day`/`monthly_amount` (script disponível, sem subscriptions ativas no momento).
- [x] Job `runBilling` passa a iterar em `patient_packages` quando `BILLING_FROM_PACKAGES=1` (default no cutover).
- [x] Nova venda de pacote mensal não cria mais `patient_subscription` (`LEGACY_AUTO_SUBSCRIPTION=0` por default).
- [x] UI continua funcionando (lê de packages via `RecurringPackageSection`).
- [ ] Métricas baseline da Sprint 0 batem (qtd de cobranças geradas no mês = mesmo número antes/depois) — validação fica para o primeiro ciclo mensal pós-cutover.
