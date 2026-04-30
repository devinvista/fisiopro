# Financeiro & Contábil — FisioGest Pro (Documento Consolidado)

> **Última atualização:** 30/04/2026
> **Status do módulo:** auditável • 351/351 testes verdes • 15 bugs financeiros mapeados (14 resolvidos, 1 deferido para Sprint 9, 1 informativo)
>
> Este é o **documento canônico** do módulo financeiro/contábil. Substitui:
> - `docs/financial.md` (fluxo operacional)
> - `docs/auditoria-financeira.md` (mapa de bugs B1-B15)
> - `docs/sprints/SPRINTS-FINANCEIRO.md` (sprints 1-7 entregues)
> - `docs/superpowers/specs/2026-04-19-contabilidade-formal-design.md` (spec do ledger — preservado como ADR)
> - `docs/superpowers/specs/2026-04-26-asaas-saas-billing-design.md` (spec do gateway SaaS — preservado como ADR)

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Arquitetura do módulo](#2-arquitetura-do-módulo)
3. [Modelo de dados (tabelas)](#3-modelo-de-dados-tabelas)
4. [Plano de contas (partidas dobradas)](#4-plano-de-contas-partidas-dobradas)
5. [Catálogo de fluxos contábeis](#5-catálogo-de-fluxos-contábeis)
6. [Pipelines de cobrança ao paciente](#6-pipelines-de-cobrança-ao-paciente)
7. [Endpoints REST](#7-endpoints-rest)
8. [Schedulers (cron jobs)](#8-schedulers-cron-jobs)
9. [SaaS Billing — Asaas (clínica → plataforma)](#9-saas-billing--asaas-clínica--plataforma)
10. [Roadmap de integração de pagamento ao paciente](#10-roadmap-de-integração-de-pagamento-ao-paciente)
11. [Auditoria — bugs B1–B15](#11-auditoria--bugs-b1b15)
12. [Histórico de sprints (1–8)](#12-histórico-de-sprints-18)
13. [Riscos sistêmicos](#13-riscos-sistêmicos)
14. [Governança & observabilidade](#14-governança--observabilidade)
15. [Otimizações](#15-otimizações)
16. [Conciliação operacional × contábil](#16-conciliação-operacional--contábil)
17. [Testes](#17-testes)
18. [Glossário](#18-glossário)

---

## 1. Resumo executivo

O FisioGest Pro opera com **dois planos contábeis simultâneos e sincronizados**:

- **Camada operacional** (`financial_records`): exibida ao usuário. Cada linha é uma cobrança, pagamento, despesa, uso de carteira, etc. Mantida por compatibilidade e telas legadas.
- **Camada contábil formal** (`accounting_journal_entries` + `accounting_journal_lines`): **fonte de verdade** para DRE, balancete e KPIs. Partidas dobradas com débito = crédito sempre balanceado.

Princípios:

1. **Receita só é reconhecida no consumo** — sessão atendida, crédito de pacote consumido, mensalidade do plano atendida. Pagamento antecipado vira **passivo** (Adiantamentos de Clientes), não receita.
2. **Nada é apagado**: estornos criam lançamento espelho com `reversal_of_entry_id`. Trilha de auditoria obrigatória (`reversalReason`, `reversedBy`, `reversedAt`, `originalAmount`).
3. **Tudo é multitenant**: toda query filtra por `clinicId`. Plano de contas é por clínica (`ensureSystemAccounts`).
4. **Idempotência via chaves de competência**: `planMonthRef` para billing mensal; `pg_advisory_xact_lock` para reconhecimento concorrente; `UNIQUE(eventId)` para webhooks.
5. **Cobrança de paciente** continua manual (registro pelo operador da clínica). **Cobrança SaaS** (clínica → plataforma) é automática via Asaas com cartão recorrente em checkout hospedado.

**Estado atual auditável:** sistema atingiu o nível mínimo exigido por escritório contador externo (CFC/CRC) — todos os bugs de severidade alta/média resolvidos, suíte vitest com 351 testes verdes.

---

## 2. Arquitetura do módulo

### Estrutura de pastas (backend)

```
artifacts/api-server/src/modules/financial/
├── accounting/                  # Plano de contas + CRUD de sub-contas
├── analytics/                   # /financial/cost-per-procedure, /dre
├── billing/                     # billing.service.ts (cobrança recorrente)
├── dashboard/                   # KPIs financeiros
├── financial.routes.ts          # router agregador (monta sub-rotas)
├── patient-wallet/              # Carteira em R$ por paciente
├── payments/                    # POST /patients/:id/payment (alocação)
├── projection/                  # /cash-flow-projection
├── records/                     # CRUD de financial_records, /estorno
├── recurring-expenses/          # Despesas fixas (mensal/semanal/anual)
├── reports/                     # /reports/reconciliation, monthly-revenue, etc.
└── settings/                    # /clinics/current/financial-settings
```

### Helpers contábeis (`accounting.service.ts`)

| Helper | Lançamento | Uso |
|---|---|---|
| `postCashReceipt` | D 1.1.1 / C 4.1.x | Pagamento à vista no ato (legado — não mais chamado em `/payment`) |
| `postReceivableRevenue` | D 1.1.2 / C 4.1.x | Geração de recebível com receita imediata |
| `postReceivableSettlement` | D 1.1.1 / C 1.1.2 | Liquidação de recebível |
| `postWalletDeposit` | D 1.1.1 / C 2.1.1 | Depósito em carteira |
| `postWalletUsage` | D 2.1.1 / C 4.1.x | Uso de saldo da carteira em atendimento |
| `postPackageSale` | D 1.1.1 ou 1.1.2 / C 2.1.1 | Venda de pacote pré-pago |
| `postPackageCreditUsage` | D 2.1.1 / C 4.1.2 | Consumo de crédito de pacote |
| `postCashAdvance` | D 1.1.1 / C 2.1.1 | Adiantamento (substitui `postCashReceipt` em `/payment`) |
| `postExpense` | D 5.1.1 / C 1.1.1 | Despesa paga |
| `postReversal` | Inverte todas as linhas | Estorno (com `reversal_of_entry_id`) |

Todas as funções: `createJournalEntry` valida `Σdébitos = Σcréditos`; lançamentos vão sempre dentro de `db.transaction(...)`.

---

## 3. Modelo de dados (tabelas)

### 3.1 Camada contábil (`lib/db/src/schema/accounting.ts`)

| Tabela | Propósito |
|---|---|
| `accounting_accounts` | Plano de contas por clínica. Campos: `clinicId`, `code`, `name`, `type` (asset/liability/equity/revenue/expense), `normalBalance` (debit/credit), `isSystem`. |
| `accounting_journal_entries` | Cabeçalho de cada evento contábil. Campos: `entryDate`, `eventType`, `sourceType`, `sourceId`, `patientId`, `appointmentId`, `procedureId`, `patientPackageId`, `subscriptionId`, `walletTransactionId`, `financialRecordId`, `status` (posted/voided/reversed), `reversalOfEntryId`, `createdBy`. |
| `accounting_journal_lines` | Linhas de débito e crédito. Campos: `entryId`, `accountId`, `debitAmount`, `creditAmount`, `memo`. Constraint: nunca débito + crédito simultâneos; soma débitos = soma créditos por entry. |
| `receivable_allocations` | Aplicação de pagamentos contra títulos. Campos: `paymentEntryId`, `receivableEntryId`, `patientId`, `amount`, `allocatedAt`. Resolve "pagamento manual desconectado da cobrança". |

### 3.2 Camada operacional (`lib/db/src/schema/financial.ts`)

`financial_records` — estrutura única que comporta todos os eventos financeiros visíveis ao usuário.

Campos relevantes:
- **Identificação**: `clinicId`, `patientId`, `appointmentId`, `procedureId`, `treatmentPlanProcedureId`, `patientPackageId`, `parentRecordId` (para fatura mãe-filhos), `monthlyInvoiceId`.
- **Valor**: `amount`, `originalUnitPrice`, `originalAmount` (para estornos), `priceSource` (`tabela | override_clinica | plano_tratamento`).
- **Categoria**: `transactionType` (ver lista abaixo), `category` (texto livre/agrupador), `description`, `paymentMethod`.
- **Status temporal**: `status` (`pendente | pago | cancelado | estornado`), `dueDate`, `paymentDate`, `planMonthRef` (chave de idempotência mensal `YYYY-MM`).
- **Vínculos contábeis**: `accountingEntryId`, `recognizedEntryId`, `settlementEntryId`.
- **Trilha de estorno**: `reversalReason`, `reversedBy`, `reversedAt`.

**Transaction types** (gerados pelo sistema):
- `creditoAReceber` — sessão agendada gera crédito a receber
- `cobrancaSessao` — cobrança avulsa
- `cobrancaMensal` — billing automático de assinatura
- `pagamento` — registro de recebimento
- `usoCredito`, `creditoSessao`, `usoCarteira`, `depositoCarteira`
- `vendaPacote` — venda de pacote (passa por Adiantamentos)
- `pendenteFatura` — item operacional aguardando consolidação
- `faturaConsolidada`, `faturaMensalAvulso`, `faturaPlano` — faturas mãe que agrupam filhos
- `ajuste`, `estorno`, `despesa`

### 3.3 Operacional auxiliar

| Tabela | Arquivo | Uso |
|---|---|---|
| `patient_wallet` | `patient-wallet.ts` | Saldo em R$ por paciente. UPDATE serializado por `SELECT … FOR UPDATE`. |
| `patient_wallet_transactions` | `patient-wallet.ts` | Histórico de débitos/créditos da carteira. |
| `clinic_financial_settings` | `clinic-financial-settings.ts` | `monthlyExpenseBudget`, `monthlyRevenueGoal`, `cashReserveTarget`, `defaultDueDays`. |
| `billing_run_logs` | `billing-run-logs.ts` | Log de execuções do billing (status `running`/`ok`/`failed`, `runId` UUID). |
| `recurring_expenses` | (junto a financial.ts) | Despesas fixas mensal/semanal/anual com `monthlyBudget` (orçado pode diferir do cobrado). |

### 3.4 SaaS Billing (`saas-plans.ts`)

| Tabela | Propósito |
|---|---|
| `subscription_plans` | Catálogo de planos SaaS (essencial, profissional, premium). |
| `clinic_subscriptions` | Assinatura ativa de cada clínica. Campos Asaas: `asaasCustomerId`, `asaasSubscriptionId`, `asaasCheckoutUrl`, `billingMode` (`manual` ou `asaas_card`). |
| `asaas_webhook_events` | Eventos webhook recebidos. `UNIQUE(eventId)` garante idempotência. Resultados: `applied | duplicate | no_match | error`. |

---

## 4. Plano de contas (partidas dobradas)

| Código | Conta | Tipo | Saldo Normal |
|---|---|---|---|
| `1.1.1` | Caixa/Banco | Ativo | Débito |
| `1.1.2` | Contas a Receber | Ativo | Débito |
| `2.1.1` | Adiantamentos de Clientes | Passivo | Crédito |
| `3.1.1` | Patrimônio/Resultado Acumulado | PL | Crédito |
| `4.1.1` | Receita de Atendimentos | Receita | Crédito |
| `4.1.2` | Receita de Pacotes/Mensalidades Reconhecida | Receita | Crédito |
| `5.1.1` | Despesas Operacionais | Despesa | Débito |
| `5.1.2` | Estornos/Cancelamentos de Receita | Despesa | Débito |

**Sub-contas dinâmicas:** `procedures.accounting_account_id` permite rotear receita por procedimento para sub-contas customizáveis (ex.: `4.1.1.01 — RPG`, `4.1.1.02 — Pilates`). CRUD via `/api/financial/accounting/accounts`. Fallback para `4.1.1`/`4.1.2` quando o procedimento não tem sub-conta.

**Regras invariantes:**
- Todo lançamento valida `Σdébitos = Σcréditos` em `createJournalEntry` antes de persistir.
- Lançamentos `posted` nunca são editados — somente revertidos via `postReversal`.
- Cada `accounting_journal_lines` tem **ou** débito **ou** crédito (nunca ambos, nunca negativos).
- `getAccountingTotals(period)` → DRE e KPIs mensais.
- `getAccountingBalances()` → saldos correntes (Recebíveis, Adiantamentos).
- Auto-criação por clínica na primeira escrituração via `ensureSystemAccounts(clinicId)`.

---

## 5. Catálogo de fluxos contábeis

Catálogo completo dos 13 cenários canônicos. Cada um descreve débito (D) / crédito (C) e onde está implementado.

### 5.1 Sessão avulsa concluída e ainda não paga
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.2 Contas a Receber | valor | — |
| 4.1.x Receita de Atendimentos | — | valor |

Helper: `postReceivableRevenue`. Origem: `applyBillingRules` em `appointments.billing.ts`.

### 5.2 Pagamento de sessão avulsa pendente
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.1 Caixa/Banco | valor pago | — |
| 1.1.2 Contas a Receber | — | valor pago |

Helpers: `postReceivableSettlement` + `allocateReceivable`. Origem: `POST /patients/:id/payment`.

### 5.3 Pagamento direto no ato da sessão (legado)
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.1 Caixa/Banco | valor | — |
| 4.1.x Receita | — | valor |

Helper: `postCashReceipt`. **Não usado** no caminho moderno de `/payment` (substituído por `postCashAdvance` para resíduos — ver B8/PR-FIN7-1).

### 5.4 Depósito em carteira
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.1 Caixa/Banco | valor | — |
| 2.1.1 Adiantamentos | — | valor |

Helper: `postWalletDeposit`. Também atualiza `patient_wallet.balance` e cria `patient_wallet_transactions`.

### 5.5 Uso de carteira em atendimento
| Conta | Débito | Crédito |
|---|---:|---:|
| 2.1.1 Adiantamentos | valor usado | — |
| 4.1.x Receita | — | valor usado |

Helper: `postWalletUsage`. Também debita `patient_wallet`. **Race condition resolvida (B14):** UPDATE da carteira sob `SELECT … FOR UPDATE` em transação ACID.

### 5.6 Venda de pacote pago no ato
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.1 Caixa/Banco | valor | — |
| 2.1.1 Adiantamentos | — | valor |

Helper: `postPackageSale`. Também cria créditos operacionais de sessão.

### 5.7 Consumo de crédito de pacote
| Conta | Débito | Crédito |
|---|---:|---:|
| 2.1.1 Adiantamentos | valor unitário | — |
| 4.1.2 Receita de Pacotes | — | valor unitário |

Helper: `postPackageCreditUsage`. Valor unitário = `preço pacote / total sessões`. Resíduos de arredondamento → última sessão.

### 5.8 Venda de pacote pendente (não pago)
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.2 Contas a Receber | valor | — |
| 2.1.1 Adiantamentos | — | valor |

Quando paga: `postReceivableSettlement` (D Caixa / C Recebíveis).

### 5.9 Mensalidade paga antes das sessões
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.1 Caixa/Banco | valor | — |
| 2.1.1 Adiantamentos | — | valor |

Receita reconhecida proporcionalmente nas sessões consumidas.

### 5.10 Mensalidade gerada e não paga
| Conta | Débito | Crédito |
|---|---:|---:|
| 1.1.2 Contas a Receber | valor | — |
| 2.1.1 Adiantamentos | — | valor |

Quando paga: D Caixa / C Recebíveis.

### 5.11 Fatura consolidada
- Atendimento dentro de fatura consolidada reconhece receita normalmente (D 1.1.2 / C 4.1.x).
- A fatura mãe **NÃO posta receita** — apenas agrupa os títulos já reconhecidos pelos filhos.
- Quando paga: `postReceivableSettlement` na mãe + `cascadeFaturaMensalAvulsoPayment` propaga status para os filhos e aloca o settlement contra cada `recognizedEntryId`.
- **Estorno (Sprint 8):** `cascadeReversalForFaturaMensalAvulso` itera filhos não-estornados e posta `postReversal(child.recognizedEntryId)` espelhado, com trilha completa.

### 5.12 Despesa paga
| Conta | Débito | Crédito |
|---|---:|---:|
| 5.1.1 Despesas | valor | — |
| 1.1.1 Caixa | — | valor |

Helper: `postExpense`.

### 5.13 Cancelamento / estorno
**Princípio:** nunca apagar lançamento `posted`. Sempre criar inverso com `reversal_of_entry_id`.

3 caminhos de estorno (todos usam `postReversal`):
1. `PATCH /records/:id/status` → `cancelado | estornado`
2. `PATCH /records/:id/estorno` (motivo obrigatório, mín. 3 chars)
3. `DELETE /records/:id` (receita): exige `reversalReason` quando há `accountingEntryId` (B1 fix)

Trilha persistida: `originalAmount`, `reversalReason`, `reversedBy`, `reversedAt`.

---

## 6. Pipelines de cobrança ao paciente

### 6.1 Origens de receita (mapa unificado)

| Origem | Tipo | Reconhecimento | Conta principal |
|---|---|---|---|
| Sessão avulsa | `creditoAReceber` | Confirmação da sessão | 1.1.2 / 4.1.x |
| Carteira | `usoCarteira` | Débito da carteira | 2.1.1 / 4.1.x |
| Crédito de pacote | `usoCredito` | Crédito consumido | 2.1.1 / 4.1.2 |
| Pacote recorrente | `pendenteFatura` | Confirmação | 1.1.2 / 4.1.x |
| Plano materializado mensal | `faturaPlano` (mãe) + filhos | 1ª confirmação do mês reconhece valor integral | 1.1.2 ou 2.1.1 / 4.1.x |
| Avulso consolidado | `faturaMensalAvulso` | Filhos reconhecem; mãe só recebe settlement | — |
| Venda pacote pré-pago | `vendaPacote` | Não é receita (Adiantamentos) | 1.1.1 / 2.1.1 |

### 6.2 Resolução de preço (Sprint 1 — `resolveEffectivePrice`)

Hierarquia de fallback para `unit_price` em qualquer cobrança:
1. `treatment_plan_procedures.unitPrice − discount` (se plano `ativo` e procedimento listado)
2. `procedure_costs.priceOverride` (override por clínica)
3. `procedures.price` (tabela base)

Persistido em `financial_records.priceSource` (`tabela | override_clinica | plano_tratamento`) + `originalUnitPrice` (auditoria de margem).

### 6.3 Pagamento (`POST /patients/:id/payment`)

Algoritmo:
1. Cria `paymentRecord` (`pagamento`, status=`pago`, `clinicId` filtrado).
2. Lista `pendingRecords` (`RECEIVABLE_TYPES + vendaPacote`) **filtrados por `clinicId`** (B4 fix).
3. Aloca o valor pago em ordem de `(dueDate ASC, createdAt ASC)`. Para cada pendência:
   - `faturaPlano` sem `accountingEntryId` → `postCashAdvance` (D 1.1.1 / C 2.1.1).
   - `faturaMensalAvulso` → `postReceivableSettlement` + `cascadeFaturaMensalAvulsoPayment` para filhos.
   - `vendaPacote` legado sem entry → `postCashAdvance` (não settlement) (B5 fix).
   - Outros recebíveis → `postReceivableRevenue` (se necessário) + `postReceivableSettlement` + `allocateReceivable`.
4. **Se `remaining > 0`:** `postCashAdvance` (D 1.1.1 / C 2.1.1) + upsert `patient_wallet` com `SELECT … FOR UPDATE` + insert `patient_wallet_transactions(tipo='credito')`. Response inclui `walletCredited` (B8 + B15 fix).

### 6.4 Plano de tratamento como venda formal (Sprint 2)

`POST /api/patients/:patientId/treatment-plans/:planId/accept`:
- Snapshot dos preços vigentes em `frozen_prices_json`.
- Captura LGPD: `acceptedAt`, `acceptedBy`, IP, user-agent.
- Bloqueia `PUT` que altere preço/desconto/procedimentos (retorna 409 — exige renegociação via `parent_plan_id`).
- Aceite remoto via link público: `/aceite/:token`.
- Geração de `faturaPlano` materializada por mês via job cron `monthlyPlanBilling`.

### 6.5 Reconhecimento de receita do plano

`recognizeMonthlyInvoiceRevenue(invoiceId)` — chamada na **1ª confirmação** de sessão do mês:
1. `pg_advisory_xact_lock(invoiceId)` (B10 fix — race condition entre confirmações concorrentes).
2. Verifica `invoice.recognizedEntryId IS NULL`.
3. Posta receita integral da fatura.
4. Persiste `recognizedEntryId` na fatura mãe.

**Rollback (B12 fix):** ao desfazer status confirmado da última sessão do mês, `applyBillingRules` posta `postReversal(recognizedEntryId)` e zera a sentinel.

### 6.6 Idempotência do billing (`runBilling`)

Chave universal: `planMonthRef` (formato `YYYY-MM`) — substitui janela frágil `created_at >= monthStart` (B6 fix).
- Antes de qualquer insert: `SELECT 1 FROM financial_records WHERE patient_package_id = X AND plan_month_ref = 'YYYY-MM'`.
- Log em duas fases (B7 fix): `INSERT billing_run_logs(status='running', runId=UUID)` no início, `UPDATE status='ok'|'failed'` no fim. Pino logger estruturado.

---

## 7. Endpoints REST

### 7.1 Records (CRUD + estorno)
`artifacts/api-server/src/modules/financial/records/financial-records.routes.ts`

| Método | Rota | Permissão | Notas |
|---|---|---|---|
| GET | `/api/financial/records` | `financial.read` | Filtros: `from`, `to`, `status`, `transactionType`, `q`, `sort`, paginação cursor |
| POST | `/api/financial/records` | `financial.write` | Cria registro avulso |
| PATCH | `/api/financial/records/:id` | `financial.write` | **409 `RECORD_ALREADY_POSTED`** se tentar alterar `amount`/`type`/`status`/`paymentDate` em registro com entry contábil (B2 fix) |
| PATCH | `/api/financial/records/:id/status` | `financial.write` | Promove créditos prepago + cascata para filhos quando vai a `pago` (B3 fix); cascata de estorno quando vai a `estornado/cancelado` (Sprint 8) |
| PATCH | `/api/financial/records/:id/estorno` | `financial.write` | Exige `reversalReason` (mín 3); + cascata de estorno para `faturaMensalAvulso` |
| GET | `/api/financial/records/reversals` | `financial.read` | Histórico de estornos com paginação cursor |
| DELETE | `/api/financial/records/:id` | `financial.write` | Receita com entry exige `reversalReason` e dispara `postReversal` (B1 fix); despesa: DELETE físico |

### 7.2 Payment (alocação multi-pendência)
`payments/financial-payments.routes.ts`

| Método | Rota | Permissão |
|---|---|---|
| POST | `/api/financial/patients/:patientId/payment` | `financial.write` |

Response: `{ paymentRecord, allocations: [{ recordId, amount }], walletCredited }`.

### 7.3 Carteira do paciente
`patient-wallet/patient-wallet.routes.ts`

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/patients/:patientId/wallet` | `patients.read` |
| POST | `/api/financial/patients/:patientId/wallet/deposit` | `financial.write` |

### 7.4 Resumos por paciente

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/patients/:patientId/history` | `financial.read` |
| GET | `/api/financial/patients/:patientId/summary` | `financial.read` |
| GET | `/api/financial/patients/:patientId/credits` | `financial.read` |

### 7.5 Plano de contas (sub-contas customizáveis)
`accounting/accounting.routes.ts`

| Método | Rota | Permissão | Feature |
|---|---|---|---|
| GET | `/api/financial/accounting/accounts` | `financial.read` | `financial.view.accounting` |
| POST | `/api/financial/accounting/accounts` | `financial.write` | `financial.view.accounting` |
| PUT | `/api/financial/accounting/accounts/:id` | `financial.write` | `financial.view.accounting` |
| DELETE | `/api/financial/accounting/accounts/:id` | `financial.write` | Bloqueia se houver lançamentos ou procedimento referenciando |
| GET | `/api/financial/accounting/dre-by-procedure` | `financial.read` | `financial.view.accounting` |

### 7.6 Analytics

| Método | Rota | Permissão | Feature |
|---|---|---|---|
| GET | `/api/financial/cost-per-procedure` | `financial.read` | `financial.cost_per_procedure` |
| GET | `/api/financial/dre` | `financial.read` | `financial.view.dre` |

### 7.7 Projeção de fluxo de caixa

| Método | Rota | Permissão | Feature |
|---|---|---|---|
| GET | `/api/financial/cash-flow-projection?days=30` | `financial.read` | `financial.view.cash_flow` |

Saída: `{ openingBalance, cashReserveTarget, totals, breachesReserve, series: [...] }`.

### 7.8 Reports

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/reports/monthly-revenue` | `reports.read` |
| GET | `/api/financial/reports/procedure-revenue` | `reports.read` |
| GET | `/api/financial/reports/schedule-occupation` | `reports.read` |
| GET | `/api/financial/reports/reconciliation?from=&to=` | `financial.read` |

Endpoint de **conciliação** (Sprint 8): retorna `{ ok, diffs, orphans, tolerance: 0.01 }`. Compara `revenueSummarySql` × saldos contábeis 4.x; pendências × saldo 1.1.2; settlements × saldo 1.1.1.

### 7.9 Despesas fixas
`recurring-expenses/recurring-expenses.routes.ts`

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/recurring-expenses` | `financial.read` |
| POST | `/api/financial/recurring-expenses` | `financial.write` |
| PATCH | `/api/financial/recurring-expenses/:id` | `financial.write` |
| DELETE | `/api/financial/recurring-expenses/:id` | `financial.write` |

### 7.10 Configurações financeiras da clínica
`settings/clinic-financial-settings.routes.ts`

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/settings` (`/clinics/current/financial-settings`) | `settings.manage` |
| PUT | `/api/financial/settings` | `settings.manage` |

Campos: `monthlyExpenseBudget`, `monthlyRevenueGoal`, `cashReserveTarget`, `defaultDueDays`.

### 7.11 SaaS Billing (clínica → plataforma)
`modules/saas/billing/billing.routes.ts`

| Método | Rota | Permissão |
|---|---|---|
| POST | `/api/saas-billing/subscribe` | admin clínica |
| GET | `/api/saas-billing/status` | admin clínica |
| POST | `/api/saas-billing/cancel` | admin clínica |
| POST | `/api/saas-billing/clinic-subscriptions/:clinicId/remind` | superadmin |
| POST | `/api/saas-billing/clinic-subscriptions/:clinicId/cancel` | superadmin |

### 7.12 Webhooks Asaas
`modules/webhooks/asaas.routes.ts`

| Método | Rota | Auth |
|---|---|---|
| POST | `/api/webhooks/asaas` | Header `asaas-access-token` (constant-time vs `ASAAS_WEBHOOK_TOKEN`) + dedup por `eventId` UNIQUE |

Eventos tratados: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_CYCLE_REMOVED`. Sempre retorna 200 (Asaas faz retry só em não-2xx).

---

## 8. Schedulers (cron jobs)

Registrados em `artifacts/api-server/src/scheduler/index.ts`. Cada job é envolto por `tryAcquireAdvisoryLock(name)` (`pg_try_advisory_lock`) — apenas **1 réplica por job**. Helper aplica retry curto (3 tentativas, 200/400ms backoff) para tolerar erros transitórios do Postgres serverless.

| Job | Cron (BRT) | Função | Notas |
|---|---|---|---|
| `billing` | `0 9 * * *` (06:00 BRT) | `runBilling()` | Cobrança mensal de pacotes recorrentes; idempotência via `planMonthRef`; log `running→ok/failed` em duas fases |
| `monthlyPlanBilling` | `30 9 * * *` (06:30 BRT) | `runMonthlyPlanBilling()` | Geração lazy de `faturaPlano` por mês competência |
| `autoConfirm` | `*/15 * * * *` | `runAutoConfirmPolicies()` | Confirma agendamentos elegíveis conforme política da clínica |
| `endOfDay` | `0 22 * * *` (22:00 BRT) | `runEndOfDayPolicies()` | No-show, cobrança de ausência, auto-completion |
| `subscriptionCheck` | `0 10 * * *` (07:00 BRT) | `runSubscriptionCheck()` | Trial expirado, suspensão por inadimplência (≥7d grace); pula clínicas em `billingMode='asaas_card'` (Asaas é fonte de verdade) |

**Observabilidade:** cada execução loga `durationMs`, `runId`, contadores; falhas notificam Sentry via `captureException`. Falha de aquisição de lock vira `warn` (não-fatal — próxima janela tenta novamente).

---

## 9. SaaS Billing — Asaas (clínica → plataforma)

### 9.1 Visão geral

A cobrança da mensalidade da plataforma (clínica → FisioGest Pro) é processada via **Asaas com cartão recorrente em checkout hospedado**. Decidiu-se Asaas por melhor cobertura PIX+Boleto+Cartão+régua nativa para o mercado BR, e cartão recorrente para automação máxima (mensalidade SaaS é caso ideal: pequeno valor, recorrente, baixa fricção depois do setup).

Zero PCI no nosso lado: o cartão é digitado no domínio do Asaas; nós só guardamos `asaasCustomerId` e `asaasSubscriptionId`.

### 9.2 Fluxo end-to-end

1. Admin da clínica acessa **Configurações → Plano** → clica "Pagar com cartão".
2. Backend (`POST /api/saas-billing/subscribe`) cria customer + subscription no Asaas e devolve `checkoutUrl`. Marca `clinic_subscriptions.billingMode = 'asaas_card'`.
3. Cliente conclui o pagamento no domínio Asaas.
4. Asaas envia webhooks para `POST /api/webhooks/asaas`.
5. Eventos são gravados em `asaas_webhook_events` com `UNIQUE(eventId)` → idempotência absoluta (retries são descartados como `duplicate`).
6. `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `applyPaymentToSubscription()` rola período +30d, marca `paymentStatus = 'paid'`.
7. `PAYMENT_OVERDUE` → `paymentStatus = 'overdue'`. Scheduler `subscriptionCheck` suspende após 7d de grace.
8. `SUBSCRIPTION_DELETED` → limpa campos Asaas, volta para `billingMode = 'manual'`.

### 9.3 Painel de inadimplência (superadmin)

`pages/saas/superadmin → Inadimplência`: lista clínicas com `paymentStatus ∈ {overdue, expired, suspended}` e mostra os últimos 30 eventos do gateway com resultado (`applied | duplicate | no_match | error`).

Ações por linha:
- **Reenviar lembrete** (`POST /clinic-subscriptions/:clinicId/remind`)
- **Cancelar cobrança** (`POST /clinic-subscriptions/:clinicId/cancel`)
- **Abrir checkout** → link externo direto para o Asaas

### 9.4 Configuração

Variáveis de ambiente:

| Var | Tipo | Default | Como obter |
|---|---|---|---|
| `ASAAS_API_KEY` | secret | — | painel.sandbox.asaas.com → Configurações → Integrações |
| `ASAAS_BASE_URL` | env | `https://sandbox.asaas.com/api/v3` | Em prod: `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | secret | — | string aleatória definida no painel Asaas → Webhooks |

No painel Asaas → Notificações → Webhooks: cadastrar `https://<dominio>/api/webhooks/asaas` com token de autenticação igual a `ASAAS_WEBHOOK_TOKEN` e eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `SUBSCRIPTION_DELETED`.

Cartão de teste sandbox: `5162306219378829` / 12/2030 / CVV 123.

### 9.5 Arquivos-chave

- `lib/asaas/{client,types,index}.ts` — cliente HTTP com timeout + retry
- `modules/saas/billing/{billing.routes,billing.service,billing.schemas}.ts`
- `modules/webhooks/{asaas,webhooks}.routes.ts`
- `modules/saas/subscriptions/subscription.service.ts` — scheduler pula renovação/overdue para clínicas em `asaas_card`
- `pages/settings/plano-section.tsx` (UI clínica)
- `pages/saas/superadmin/components/InadimplenciaTab.tsx` (UI superadmin)

---

## 10. Roadmap de integração de pagamento ao paciente

A cobrança ao paciente é hoje **manual** (operador da clínica registra no sistema). O schema já é webhook-ready (`paymentMethod`, `transactionType`, ledger contábil, `nextBillingDate`, `billing_run_logs`).

### 10.1 Gateways recomendados por caso de uso

| Gateway | Ideal para | Diferenciais | Taxa | Status |
|---|---|---|---|---|
| **Asaas** | Régua de cobrança, PIX, Boleto, Cartão, Assinatura | PIX QR, recorrente, dunning nativo via WhatsApp/SMS/e-mail | 0,99% PIX, R$1,99 boleto, 1,99%+ cartão | Já usado no SaaS billing |
| **Efí (Gerencianet)** | PIX nativo + Split | PIX Open Finance, mTLS, split nativo para repasse a profissionais | 0,9% PIX, R$1,49 boleto, 2,49% cartão | Pendente |
| **Stripe** | Pacientes internacionais, SaaS USD/EUR | Melhor API de assinaturas, portal self-service | 2,9% + R$0,30; 0,5% subscriptions | Pendente |
| **Mercado Pago** | Setup simples, clínicas menores | Maquininha física, QR PIX, alta confiança | 2,99% cartão, PIX grátis PF | Pendente |

### 10.2 Plano de integração faseado

```
Fase 1 — PIX manual assistido [✅ implementado]
└── Operador registra paymentMethod='Pix' + paymentDate em PATCH /records/:id/status

Fase 2 — Régua de cobrança (Asaas webhook) [pendente]
├── Webhook PAYMENT_RECEIVED → PATCH /records/:id/status='pago' automático
├── Tabela gateway_charges (financialRecordId, gatewayId, externalId, status)
└── Ao criar financial_record pendente: chama Asaas API para emitir cobrança

Fase 3 — PIX dinâmico (Efí) [pendente]
├── POST /api/financial/patients/:id/pix-charge → QR code dinâmico
└── Webhook pix.received → PATCH automático

Fase 4 — Assinatura via gateway (Asaas/Stripe) [pendente]
├── Sincroniza patient_packages recorrentes com subscription do gateway
├── Gateway dispara cobrança mensal → webhook cria financial_record
└── Elimina billingService manual
```

### 10.3 Variáveis de ambiente (quando integrar)

| Var | Status |
|---|---|
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | ✅ configuradas (Sprint 7.2 — uso SaaS) |
| `ASAAS_BASE_URL` | opcional |
| `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY` | pendente |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | pendente |

---

## 11. Auditoria — bugs B1–B15

Mapa completo dos bugs identificados na auditoria de 29/04/2026 e seu estado atual.

| # | Severidade | Descrição | Status | Sprint |
|---|---|---|---|---|
| **B1** | Alta | `DELETE /records/:id` (receita) não postava `postReversal` — soft-delete deixava entry contábil ativo | ✅ Resolvido | Sprint 6 (PR-FIN6-1) |
| **B2** | Alta | `PATCH /records/:id` permitia editar `amount`/`type` em registro contabilizado sem trilha | ✅ Resolvido — 409 `RECORD_ALREADY_POSTED` com `lockedFields` | Sprint 6 (PR-FIN6-1) |
| **B3** | Alta | `PATCH /records/:id/status='pago'` não promovia créditos prepago nem cascateia para filhos | ✅ Resolvido — paridade com `/payment` | Sprint 6 (PR-FIN6-2) |
| **B4** | Média-Alta | Vazamento multi-tenant em `/payment` (super-admin pegava pendências cross-clinic) | ✅ Resolvido — filtro `eq(clinicId, req.clinicId)` | Sprint 6 (PR-FIN6-4) |
| **B5** | **Crítica** | `vendaPacote` no loop de `/payment` caía em `postReceivableSettlement` sem recebível → balancete com 1.1.2 negativo | ✅ Resolvido — usa `postCashAdvance` quando legado sem entry | Sprint 6 (PR-FIN6-3) |
| **B6** | Média | `runBilling` idempotente por janela `createdAt` falhava na virada do mês (BRT vs UTC) | ✅ Resolvido — chave `planMonthRef` | Sprint 7 (PR-FIN7-2) |
| **B7** | Baixa | Log de `runBilling` fora da transação dos inserts; perda de rastreabilidade em crash | ✅ Resolvido — log em duas fases (`running→ok/failed`) com `runId` UUID | Sprint 7 (PR-FIN7-3) |
| **B8** | Média | `postCashReceipt` para `remaining > 0` em `/payment` criava receita "fantasma" sem documento | ✅ Resolvido — usa `postCashAdvance` + carteira | Sprint 7 (PR-FIN7-1) |
| **B9** | Média | `accountingEntryId` do `paymentRecord` mistura semântica (só guarda 1 entry quando há múltiplas alocações) | ⏳ **Deferido para Sprint 9** — exige tabela `payment_allocations` (sub-ledger) com migração + backfill | — |
| **B10** | Baixa-Média | `recognizeMonthlyInvoiceRevenue` race em confirmações concorrentes (sentinel só em app-level) | ✅ Resolvido — `pg_advisory_xact_lock(invoiceId)` | Sprint 7 (PR-FIN7-2) |
| **B11** | Média | `closeAvulsoMonth` usava `category[0]`, `dueDay=10` hardcoded, sem `procedureId` | ✅ Resolvido — `aggregatedCategory='Fatura mensal'`, `dueDay=clinic.defaultDueDays`, `procedureId` deliberadamente nulo na mãe | Sprint 8 (PR-FIN8-2) + PR-FIN8-4 antecipado |
| **B12** | Baixa-Média | Rollback de `recognizedEntryId` ausente quando todas sessões saem do estado confirmado | ✅ Resolvido — `postReversal` automático na última saída | Sprint 7 (PR-FIN7-4) |
| **B13** | Informativo | `closeAvulso parent` lookup fora da advisory lock (race rara, sem duplicidade contábil) | 🟡 Documentado — aceitável, não corrige | — |
| **B14** | Média | Race em decremento de saldo da `patient_wallet` em débito + estorno + upsert | ✅ Resolvido — `SELECT … FOR UPDATE` em todos os 3 caminhos | Sprint 8 (PR-FIN8-4) |
| **B15** | Média | DRE divergia entre `revenueSummarySql` e DRE-by-procedure quando `postCashReceipt` era chamado | ✅ Resolvido — eliminado por consequência do fix B8 | Sprint 7 (PR-FIN7-1) |

**Resumo:** 13 bugs com correção ativa, 1 deferido (B9 — refator profundo), 1 documentado como informativo (B13).

---

## 12. Histórico de sprints (1–8)

### Sprint Financeiro 1 — Correção crítica de preço (1 dia) ✅ 27/04/2026
**Commit:** `1193bd6` + `17fe262`. Suite: 13/13 ✓.

- **T1** `resolveEffectivePrice` em `appointments.pricing.ts` com hierarquia plano > override > tabela.
- **T2** Coluna `price_source` (`tabela | override_clinica | plano_tratamento`) + `original_unit_price`. Migração `0001_add_price_source.sql`.
- **T3** Testes cobrindo todos os caminhos (sem plano, override, plano c/desconto, plano inativo, procedimento não listado).

### Sprint Financeiro 2 — Plano como venda formal (3-4 dias) ✅ 27/04/2026

- **T4** Aceitação de plano: `accepted_at`, `accepted_by`, `frozen_prices_json`, `parent_plan_id`. Endpoint `/accept` + `/renegotiate`.
- **T5** `clinic_financial_settings` (orçamento, meta, reserva, due days). UI em `Configurações → Financeiro`.
- **T6** Diferenciação SaaS por features: `financial.view.simple/cash_flow/dre/budget/accounting`, `financial.cost_per_procedure`. Gating frontend (`hasFeature`) + backend (`requireFeature`).

### Sprint Financeiro 3 — Fluxo de Caixa Projetado + auditoria (2-3 dias) ✅ 27/04/2026

- **T7** Endpoint `/cash-flow-projection?days=30` (1..180). Aba "Fluxo de Caixa" com gráfico Recharts ComposedChart + linha de reserva + alertas.
- **T8** Categorização contábil por procedimento: `procedures.accounting_account_id` + CRUD de sub-contas + helper `resolveAccountCodeById`. Aba "DRE/Procedimento".
- **T9** Auditoria robusta de estornos: `original_amount`, `reversal_reason`, `reversed_by`, `reversed_at`. Endpoint `/records/reversals` com cursor. Aba "Estornos".

### Sprint Financeiro 6 — Integridade contábil ✅ 29/04/2026

- **PR-FIN6-1 (B1+B2):** DELETE com estorno espelhado obrigatório, PATCH bloqueado em campos contábeis.
- **PR-FIN6-2 (B3):** `/status='pago'` chama `promotePrepaidCreditsForFinancialRecord` + `cascadeFaturaMensalAvulsoPayment`.
- **PR-FIN6-3 (B5):** `vendaPacote` legado em `/payment` usa `postCashAdvance`.
- **PR-FIN6-4 (B4):** `pendingRecords` filtra por `clinicId`.
- **Cobertura:** 11 testes novos. Suite: 347/347 ✓.

### Sprint Financeiro 7 — Auditabilidade & idempotência ✅ 29/04/2026

- **PR-FIN7-1 (B8+B15):** `remaining > 0` → `postCashAdvance` + carteira; remoção de `postCashReceipt` do caminho `/payment`.
- **PR-FIN7-2 (B6+B10):** `planMonthRef` como chave; `pg_advisory_xact_lock` no reconhecimento.
- **PR-FIN7-3 (B7):** Log `running→ok/failed` com `runId` UUID. Migração `0012_sprint7_billing_log_status.sql`.
- **PR-FIN7-4 (B12):** Rollback de `recognizedEntryId` na última saída.
- **PR-FIN8-4 antecipado:** `dueDay = clinic.defaultDueDays ?? 10`.

### Sprint Financeiro 8 — Sub-ledger & conciliação (parcial) ✅ 29/04/2026

- ⏳ **PR-FIN8-1 (DEFERIDO Sprint 9):** tabela `payment_allocations` para sub-ledger formal (B9).
- ✅ **PR-FIN8-2 (cascata estorno + B11):** `cascadeReversalForFaturaMensalAvulso` em todos os 3 caminhos de estorno; `aggregatedCategory='Fatura mensal'`.
- ✅ **PR-FIN8-3 (conciliação):** endpoint `GET /reports/reconciliation` com diffs e órfãos.
- ✅ **PR-FIN8-4 (B14+B11):** `SELECT … FOR UPDATE` em 3 caminhos da carteira; B11 fechado.
- **Cobertura:** 4 testes novos em `payment-cascade.test.ts`. Suite: **351/351 ✓**.

### Manutenção pós-Sprint 8 ✅ 30/04/2026

- TS2304 em `TreatmentPlanTab.tsx` (`StepItens` sem prop `isAccepted`) — corrigido.
- `tryAcquireAdvisoryLock`: retry com backoff (3x, 200/400ms) para tolerar erros transitórios do Postgres serverless; log degradado de `error` para `warn` (não-fatal).

---

## 13. Riscos sistêmicos

1. **Duas fontes de verdade** (`financial_records` operacional vs `accounting_journal_lines` contábil): sincronia validada apenas nos endpoints felizes. **Mitigação ativa:** endpoint `GET /reports/reconciliation` (Sprint 8). **Próximo:** job cron noturno consumindo o endpoint e gravando em `discrepancy_log` para alerta diário.

2. **Falta de `payment_allocations`** (B9): dificulta estorno parcial e relatório "composição do recebimento". É a evolução natural para Sprint 9.

3. **Edição direta sem trilha** (B1+B2): **resolvido** — qualquer auditor externo (CFC/CRC) tem trilha completa em estornos. Edições em registros postados retornam 409.

4. **Idempotência** (B6+B10): **resolvido** — `planMonthRef` + `pg_advisory_xact_lock`. Sugerido `UNIQUE INDEX (patient_package_id, plan_month_ref) WHERE transaction_type IN ('creditoAReceber','faturaPlano')` como defesa em profundidade adicional.

5. **Cascata de estorno em `faturaPlano`**: hoje **NÃO** faz cascata automática para appointments materializados (decisão conservadora — exige confirmação operacional). Documentado para Sprint 9 — `faturaMensalAvulso` já cascateia (Sprint 8).

---

## 14. Governança & observabilidade

| Item | Status atual | Próximo passo |
|---|---|---|
| Audit log | OK em CRUD principais via `logAudit` | Estender para `applyBillingRules`, `recognizeMonthlyInvoiceRevenue`, `closeAvulsoMonth` |
| Trilha de estorno | ✅ OK em todos os 3 caminhos (`reversedBy`, `reversalReason`, `reversedAt`, `originalAmount`) | — |
| Permissões | `requirePermission("financial.write")` em mutações | Adicionar `financial.reverse` granular |
| Logs estruturados | ✅ pino logger com `runId`/`requestId` (Sprint 7) | — |
| Métricas Prometheus | Ausentes | Counters `billing_runs_total`, `revenue_recognized_total`, `reversals_total{reason}` |
| Dashboard "Conciliação" | Endpoint pronto, falta UI | Painel "Conciliação operacional × contábil" + "Top divergências do dia" |
| Sentry | Estrutura pronta (`lib/sentry.ts`); ativada via `SENTRY_DSN_BACKEND` / `VITE_SENTRY_DSN` | Configurar DSN em prod + source maps |

---

## 15. Otimizações

Não-funcionais; aplicar quando volume/latência exigir.

1. **Índices recomendados** (validar `db/schema/*` e `db/migrations/*`):
   - `financial_records (clinic_id, status, due_date)` — listagens de inadimplência
   - `financial_records (patient_id, transaction_type, status)` — loops de alocação em `/payment`
   - `accounting_journal_lines (account_id, entry_id)` — agregações de saldo
   - `accounting_journal_entries (clinic_id, entry_date)` — relatórios por período

2. **N+1 em `/payment`**: cada pendência faz 3 inserts (`postReceivableRevenue → postReceivableSettlement → allocateReceivable`). Pode virar batch `INSERT … VALUES (...), (...) RETURNING`.

3. **`getAccountingBalances` em `/summary`**: chamado a cada hit do paciente. Considerar cache memoizado por (`clinicId`, `patientId`) com invalidação no evento de novo `journal_entry`.

4. **`runBilling`** lê todos pacotes ativos: para clínicas grandes, paginar em chunks de 200 com cursor por `id`.

5. **`closeAvulsoMonth`** já faz UPDATE em uma única query — adicionar `RETURNING id, amount` para validar soma vs total (defesa em profundidade).

6. **`recognizeMonthlyInvoiceRevenue`**: precomputar `revenueAccountCode` na materialização do plano para evitar JOIN com `procedures` em toda confirmação.

---

## 16. Conciliação operacional × contábil

`GET /api/financial/reports/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD`

Compara em tempo real:

1. **Receita operacional** (`revenueSummarySql` na janela) ↔ saldo credor das contas `4.x`.
2. **Recebíveis pendentes** (`status='pendente' AND type='receita' AND transactionType ∈ RECEIVABLE_TYPES`) ↔ saldo devedor de `1.1.2`.
3. **Caixa recebido** (settlements com `paymentDate` na janela) ↔ saldo devedor de `1.1.1`.
4. **Órfãos** (até 50): receita ativa sem `recognizedEntryId/accountingEntryId`.

Resposta:
```json
{
  "ok": true,
  "tolerance": 0.01,
  "diffs": {
    "revenue":      { "operational": 12450.00, "accounting": 12450.00, "diff": 0 },
    "receivables":  { "operational":  3200.00, "accounting":  3200.00, "diff": 0 },
    "cashReceived": { "operational":  9250.00, "accounting":  9250.00, "diff": 0 }
  },
  "orphans": []
}
```

`ok = false` se algum diff > R$ 0,01 ou houver órfãos. Pronto para integração com job cron noturno e dashboard.

---

## 17. Testes

**Estado atual:** **351/351 testes vitest passando** (35 arquivos). Cobertura por sprint:

| Caso | Arquivo | Sprint |
|---|---|---|
| Estorno via DELETE posta `postReversal` | `financial-records.guards.test.ts` | 6 ✅ |
| Edição de `amount` em registro contabilizado é rejeitada (409) | `financial-records.guards.test.ts` | 6 ✅ |
| `/status: pago` em `faturaPlano` promove créditos prepago | `financial-records.guards.test.ts` | 6 ✅ |
| `/status: pago` em `faturaMensalAvulso` cascateia filhos | `financial-records.guards.test.ts` | 6 ✅ |
| `/payment` em `vendaPacote` legado usa `postCashAdvance` | `financial-payments.tenant-and-vendapacote.test.ts` | 6 ✅ |
| `/payment` filtra `pendingRecords` por `clinicId` | `financial-payments.tenant-and-vendapacote.test.ts` | 6 ✅ |
| `runBilling` idempotente entre fim/início de mês via `planMonthRef` | `billing.idempotency.test.ts` | 7 ⏳ |
| Confirmação concorrente da 1ª sessão do mês não duplica receita | `revenue-recognition.race.test.ts` | 7 ⏳ |
| Cascata de estorno em `faturaMensalAvulso`: 2 filhos com entry → 2 `postReversal` | `payment-cascade.test.ts` | 8 ✅ |
| Cascata de estorno: 0 filhos pendentes (idempotência da 2ª chamada) | `payment-cascade.test.ts` | 8 ✅ |
| Cascata de estorno: filho sem `recognizedEntryId` (legado) marca status mas não posta | `payment-cascade.test.ts` | 8 ✅ |
| Endpoint `GET /reports/reconciliation`: `ok=true` quando saldos batem | `reconciliation.test.ts` | 9 ⏳ (e2e) |
| Endpoint `GET /reports/reconciliation`: detecta órfão (receita sem entry) | `reconciliation.test.ts` | 9 ⏳ (e2e) |
| `SELECT FOR UPDATE` em carteira: 2 débitos concorrentes não dobram saldo | `wallet-race.test.ts` | 9 ⏳ (integração com Postgres real) |

**Comandos:**
- `pnpm test` — suite completa
- `pnpm test --filter @workspace/api-server` — só backend
- `pnpm typecheck` — validação TS dos 4 packages

---

## 18. Glossário

| Termo | Definição |
|---|---|
| **Partidas dobradas** | Modelo contábil onde cada lançamento tem débitos = créditos. Padrão CFC/CRC. |
| **`accounting_entry`** | Cabeçalho de evento contábil (`accounting_journal_entries`). |
| **Lançamento espelho** | Estorno: entrada inversa apontando `reversal_of_entry_id` para a original. |
| **`planMonthRef`** | Chave de competência mensal (`YYYY-MM`) usada para idempotência do billing. |
| **`recognizedEntryId`** | Sentinel na fatura mãe (faturaPlano/Mensal) indicando que a receita já foi reconhecida no mês. |
| **`accountingEntryId`** | Vínculo do `financial_record` com sua entrada contábil principal. |
| **`settlementEntryId`** | Vínculo com o lançamento de liquidação (D Caixa / C Recebíveis). |
| **Cascata de pagamento** | Quando a fatura mãe é paga, propaga status para os filhos. Implementado em `cascadeFaturaMensalAvulsoPayment`. |
| **Cascata de estorno** | Quando a fatura mãe é estornada, reverte os filhos. Implementado em `cascadeReversalForFaturaMensalAvulso`. |
| **Carteira** (`patient_wallet`) | Saldo em R$ por paciente; débitos serializados via `SELECT … FOR UPDATE`. |
| **Crédito de pacote** | Direito não-monetário a sessões pré-vendidas. Reconhece receita por consumo. |
| **Adiantamento** (2.1.1) | Passivo: dinheiro recebido que ainda não virou receita. |
| **Reconhecimento por competência** | Receita aparece quando o serviço é prestado, não quando o dinheiro entra. |
| **Sub-conta dinâmica** | Conta criada por clínica em `accounting_accounts` (ex.: `4.1.1.RPG`). |
| **Conciliação** | Verificação periódica de que `financial_records` (operacional) bate com `accounting_journal_lines` (contábil). |
| **`billingMode`** | `manual` (registro manual) ou `asaas_card` (cobrança automática Asaas) — campo de `clinic_subscriptions`. |

---

## Próximos passos (Sprint 9)

1. **PR-FIN8-1 (B9):** tabela `payment_allocations(payment_record_id, accounting_entry_id, amount)` + refator de `/payment` para alocação explícita + backfill controlado.
2. **Cascata de estorno em `faturaPlano`:** após decisão operacional sobre semântica de "mês inteiro".
3. **Job cron noturno** consumindo `/reports/reconciliation` e gravando em `discrepancy_log`.
4. **Painel "Conciliação"** no superadmin (UI sobre o endpoint existente).
5. **Métricas Prometheus**: counters de billing/reversals/revenue.
6. **Testes integração Postgres real**: `wallet-race.test.ts` cobrindo o lock de linha sob carga concorrente.
7. **Roadmap pagamento ao paciente — Fase 2**: webhook Asaas para `PATCH /records/:id/status` automático ao receber `PAYMENT_RECEIVED`.
