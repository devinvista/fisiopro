# Sprint 3 — Geração Lazy de Faturas Mensais de Plano

> Status: ✅ Entregue (28/04/2026)
>
> Pré-requisitos: Sprints 0/1/2 (estabilização, unificação de
> `patient_packages`, aceite de plano + LGPD).

## Objetivo

Eliminar a geração antecipada de **12 meses de `faturaPlano`** no
aceite de planos com itens `recorrenteMensal`. A partir do Sprint 3:

- O aceite (`acceptPlanFinancials`) cria **somente a fatura do mês
  corrente** (já entregue na Sprint 2).
- Um job diário (`monthlyPlanBilling`) materializa as próximas
  faturas mês a mês, em **D-5 do `billingDay`**, com gap-fill
  determinístico para meses passados ainda ausentes.
- Sessões avulsas confirmadas dentro de um plano (kind `avulso`)
  passam a virar **linhas-filhas** da `faturaPlano` do mês via
  `parent_record_id`. Quando a fatura mensal for paga, o handler de
  pagamento cascateará para os filhos (Sprint 4 do refator
  financeiro).
- Um script de manutenção remove faturas futuras `pendente` legadas
  criadas pela materialização anterior.

## O que entrou no escopo

| Item | Caminho | Tipo |
| ---- | ------- | ---- |
| Serviço lazy idempotente | `artifacts/api-server/src/modules/financial/billing/monthly-plan-billing.service.ts` | Novo |
| Job de scheduler | `artifacts/api-server/src/scheduler/jobs/monthly-plan-billing.job.ts` | Novo |
| Registro no scheduler | `artifacts/api-server/src/scheduler/index.ts` | Update |
| Roll-up de avulsos no mês | `artifacts/api-server/src/modules/clinical/appointments/appointments.billing.ts` (bloco `creditoAReceber`) | Update |
| Script de limpeza | `artifacts/api-server/src/scripts/cleanup-future-faturaplano.ts` | Novo |
| Testes unitários (helpers) | `artifacts/api-server/src/modules/financial/billing/monthly-plan-billing.service.test.ts` | Novo (12 casos) |

## Como funciona o `runMonthlyPlanBilling`

### 1. Seleção de itens elegíveis

Itera sobre `treatment_plan_procedures` cujo plano está em
`vigente`/`ativo` e cujo pacote vinculado é `recurrenceType =
'recorrenteMensal'`. Filtros opcionais por `clinicId` e `planId`.

### 2. Lock por item

Antes de processar cada `(planId, itemId)`, adquire advisory lock
via `withMonthlyPlanItemLock` (namespace `-1_000_000 - itemId`)
para evitar dupla execução simultânea (ex.: scheduler + chamada
manual).

### 3. Janela de meses devidos

Para cada item:

- `startMonth` = `acceptedAt`/`startDate` do plano (mês 1).
- `endMonth` = mínimo entre `endDate` ou `startMonth + durationMonths`
  e o mês corrente em **BRT**.
- Para cada mês na janela, `isMonthDue(monthYear, monthMonth, today,
  billingDay, tolerance=5)` decide se já podemos materializar:
  - mês passado → sempre devido (gap-fill);
  - mês corrente → devido se `today.day >= max(1, billingDay - 5)`
    (com clamp do `billingDay` para o último dia do mês quando
    necessário, ex.: `billingDay=31` em fevereiro vira `28`).

### 4. Materialização idempotente

Insere a `faturaPlano` apenas se ainda não existir uma com a triple
`(treatmentPlanId, treatmentPlanProcedureId, planMonthRef)`. Em
seguida re-vincula appointments daquele mês cujo `monthlyInvoiceId`
estava nulo, espelhando o comportamento do aceite original.

### 5. Log de execução

Persiste uma linha em `billing_run_logs` com
`triggeredBy = "monthlyPlanBilling:<scheduler|manual>"`. O schema
de `billing_run_logs` é compartilhado entre todos os jobs e não
possui colunas para `jobName`/`durationMs`/`details`, então o
prefixo no `triggeredBy` é o que distingue a origem na UI.

### Cron

`30 9 * * *` UTC = **06:30 BRT**, logo após o `consolidatedBilling`
(`05 9 UTC = 06:05 BRT`).

## Roll-up de avulsos no mês

No bloco `creditoAReceber` em `appointments.billing.ts`
(`recurrenceType = porSessao`), após resolver o preço:

1. Se `priceResolution.treatmentPlanId` está definido (sessão veio
   de um item de plano);
2. e existe uma `faturaPlano` para
   `(treatmentPlanId, planMonthRef = mês de competência da sessão)`;
3. então o `creditoAReceber` herda `parent_record_id` daquela
   fatura (e `planMonthRef`).

Se o plano não tem item `recorrenteMensal` (apenas avulsos), não há
`faturaPlano` e o `parent_record_id` fica nulo — o item segue para
consolidação posterior em `faturaMensalAvulso` via
`closeAvulsoMonth`.

## Script `cleanup-future-faturaplano`

```bash
# Dry-run global
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/cleanup-future-faturaplano.ts

# Aplicar para um plano específico
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/cleanup-future-faturaplano.ts --apply --plan=42

# Restringir por clínica / mês de corte alternativo
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/cleanup-future-faturaplano.ts \
  --apply --clinic=7 --month=2026-05
```

Critérios (todas as condições):

- `transactionType = 'faturaPlano'`
- `status = 'pendente'`
- `recognizedEntryId IS NULL` (receita ainda não reconhecida)
- `planMonthRef > <mês de corte>` (default: mês corrente em BRT)
- plano em `vigente`/`ativo` com `acceptedAt` definido

Antes de excluir, zera `appointments.monthlyInvoiceId` em todos os
appointments que apontavam para a fatura. O job lazy re-vincula no
próximo run.

## Defaults

- `BILLING_FROM_PACKAGES=1` (mantido).
- `LEGACY_AUTO_SUBSCRIPTION=0` (mantido).
- Tolerância padrão do mês corrente: **5 dias** antes do
  `billingDay`.

## Validação

- ✅ `tsc --noEmit` em `@workspace/api-server` limpo.
- ✅ Suíte vitest: **314 testes passando** (302 baseline + 12
  novos para `iterMonths` / `isMonthDue`).
- ✅ Boot da workflow `Start application` registra
  `monthlyPlanBilling agendado (30 9 * * *)`.

## Próximos passos sugeridos (Sprint 4)

1. Cascatear `payment` de `faturaPlano` para todos os filhos com
   `parentRecordId = invoiceId`.
2. UI de "ver execuções do `monthlyPlanBilling`" filtrando
   `billing_run_logs.triggeredBy ILIKE 'monthlyPlanBilling:%'`.
3. Endpoint manual `POST /api/billing/monthly-plan/run` (admin) para
   acionar `runMonthlyPlanBilling({ triggeredBy: "manual" })`.
