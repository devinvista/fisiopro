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
| 6 | Billing dual-source com flag | `billing.service.ts`, `consolidated-billing.service.ts` | ⏳ próxima rodada |
| 7 | Endpoint `POST /api/subscriptions` retorna 410 | `subscriptions.routes.ts` | ⏳ próxima rodada |
| 8 | Frontend: `SubscriptionsSection.tsx` lê de packages | — | ⏳ próxima rodada |
| 9 | Cutover (`LEGACY_AUTO_SUBSCRIPTION=0` por default) | `.env`, services | ⏳ próxima rodada |

## Status atual da rodada

**Concluído nesta rodada (Sprint 0 + Sprint 1 estrutural):**
- Schema unificado: `patient_packages` agora tem todos os campos de recorrência.
- Index `idx_patient_packages_recurrence` para os jobs futuros.
- Rota `POST /api/patient-packages` popula os novos campos sempre que o pacote é mensal/consolidada. A criação automática de `patient_subscriptions` continua atrás da env `LEGACY_AUTO_SUBSCRIPTION` (default `1`) para não quebrar os jobs antigos.
- Script de migração pronto, idempotente, dry-run por padrão. Sem subscriptions ativas no banco para migrar agora — script ficará disponível para clientes que tenham.

**Falta (próxima rodada do Sprint 1):**
- Refator dos jobs `runBilling` e `runConsolidatedBilling` para iterar em `patient_packages` (atrás de `BILLING_FROM_PACKAGES=1`).
- Cutover: ligar a flag por default + remover criação automática de subscription (`LEGACY_AUTO_SUBSCRIPTION=0`).
- `POST /api/subscriptions` → 410 Gone com mensagem orientando a usar pacotes.
- Migrar UI (`SubscriptionsSection.tsx` vira `RecurringPackageSection.tsx`).
- Drop final de `patient_subscriptions` fica para o Sprint 6.

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

- [ ] Todas as `patient_subscriptions` ativas têm um `patient_package` correspondente com os mesmos `billing_day`/`monthly_amount`.
- [ ] Job `runBilling` passa a iterar em `patient_packages` quando `BILLING_FROM_PACKAGES=1`.
- [ ] Nova venda de pacote mensal não cria mais `patient_subscription` (após cutover).
- [ ] UI continua funcionando (lê de packages).
- [ ] Métricas baseline da Sprint 0 batem (qtd de cobranças geradas no mês = mesmo número antes/depois).
