# Financeiro & Contábil — FisioGest Pro

> **Documento canônico do módulo financeiro/contábil.**
> Última atualização: 30/04/2026 · 351/351 testes vitest verdes · 14 dos 15 bugs de auditoria resolvidos · 1 deferido para Sprint 9 · 1 informativo
>
> Este arquivo substitui `docs/financial.md`, `docs/auditoria-financeira.md` e `docs/sprints/SPRINTS-FINANCEIRO.md`. Os specs em `docs/superpowers/specs/2026-04-19-contabilidade-formal-design.md` e `2026-04-26-asaas-saas-billing-design.md` são preservados como ADR (registro histórico de decisão).

---

## Sumário

| # | Seção | Para quem |
|---|---|---|
| 1 | [Resumo executivo](#1-resumo-executivo) | Todos |
| 2 | [Glossário](#2-glossário) | Todos |
| 3 | [Arquitetura do módulo](#3-arquitetura-do-módulo) | Engenharia |
| 4 | [Modelo de dados](#4-modelo-de-dados) | Engenharia, contábil |
| 5 | [Plano de contas](#5-plano-de-contas) | Contábil, produto |
| 6 | [Fluxos contábeis (13 cenários)](#6-fluxos-contábeis-13-cenários) | Contábil, engenharia |
| 7 | [Operação financeira (algoritmos)](#7-operação-financeira-algoritmos) | Engenharia |
| 8 | [Endpoints REST](#8-endpoints-rest) | Engenharia |
| 9 | [Schedulers (cron jobs)](#9-schedulers-cron-jobs) | Engenharia, ops |
| 10 | [Conciliação operacional × contábil](#10-conciliação-operacional--contábil) | Contábil, ops |
| 11 | [SaaS Billing — Asaas](#11-saas-billing--asaas) | Engenharia, produto |
| 12 | [Roadmap de pagamento ao paciente](#12-roadmap-de-pagamento-ao-paciente) | Produto |
| 13 | [Auditoria — bugs B1–B15](#13-auditoria--bugs-b1b15) | Engenharia |
| 14 | [Histórico de sprints](#14-histórico-de-sprints) | Engenharia |
| 15 | [Governança & observabilidade](#15-governança--observabilidade) | Ops, conformidade |
| 16 | [Testes](#16-testes) | Engenharia |
| 17 | [Roadmap & riscos](#17-roadmap--riscos) | Todos |

---

## 1. Resumo executivo

O FisioGest Pro opera com **dois planos contábeis simultâneos e sincronizados**:

- **Camada operacional** (`financial_records`): exibida ao usuário. Cada linha é uma cobrança, pagamento, despesa ou movimentação de carteira.
- **Camada contábil formal** (`accounting_journal_entries` + `accounting_journal_lines`): **fonte de verdade** para DRE, balancete e KPIs. Partidas dobradas (Σdébitos = Σcréditos) sempre balanceadas.

### Cinco princípios invariantes

1. **Receita só é reconhecida no consumo** — sessão atendida, crédito de pacote consumido, mensalidade do plano executada. Pagamento antecipado vira **passivo** (Adiantamentos de Clientes), nunca receita.
2. **Nada é apagado**: estornos criam lançamento espelho (`reversal_of_entry_id`). Trilha obrigatória: `originalAmount`, `reversalReason`, `reversedBy`, `reversedAt`.
3. **Multitenant em toda query**: filtro por `clinicId` em 100% dos paths. Plano de contas auto-criado por clínica via `ensureSystemAccounts(clinicId)`.
4. **Idempotência por chave de competência**: `planMonthRef='YYYY-MM'` para billing mensal · `pg_advisory_xact_lock(invoiceId)` para reconhecimento concorrente · `UNIQUE(eventId)` para webhooks.
5. **Cobrança ao paciente** é manual hoje (operador da clínica registra). **Cobrança SaaS** (clínica → plataforma) é automática via Asaas com cartão recorrente em checkout hospedado.

**Estado atual:** sistema atingiu o nível mínimo exigido por escritório contador externo (CFC/CRC). Suite de testes 351/351 verde.

---

## 2. Glossário

| Termo | Definição |
|---|---|
| **Partidas dobradas** | Modelo contábil onde cada lançamento tem Σdébitos = Σcréditos. Padrão CFC/CRC. |
| **`accounting_entry`** | Cabeçalho de evento contábil (linha em `accounting_journal_entries`). |
| **Lançamento espelho** | Estorno: entrada inversa apontando `reversal_of_entry_id` para a original. |
| **`planMonthRef`** | Chave de competência mensal (`YYYY-MM`) para idempotência do billing recorrente. |
| **`recognizedEntryId`** | Sentinel na fatura mãe (`faturaPlano`/`faturaMensalAvulso`) indicando que a receita do mês já foi reconhecida. |
| **`accountingEntryId`** | Vínculo do `financial_record` com sua entrada contábil principal. |
| **`settlementEntryId`** | Vínculo com o lançamento de liquidação (D Caixa / C Recebíveis). |
| **Cascata de pagamento** | Quando a fatura mãe é paga, propaga `status='pago'` para os filhos. Implementado em `cascadeFaturaMensalAvulsoPayment`. |
| **Cascata de estorno** | Quando a fatura mãe é estornada, posta `postReversal` em cada filho. Implementado em `cascadeReversalForFaturaMensalAvulso`. |
| **Carteira** (`patient_wallet`) | Saldo em R$ por paciente; débitos serializados via `SELECT … FOR UPDATE`. |
| **Crédito de pacote** | Direito não-monetário a sessões pré-vendidas. Reconhece receita por consumo proporcional. |
| **Adiantamento (2.1.1)** | Passivo: dinheiro recebido que ainda não virou receita. |
| **Reconhecimento por competência** | Receita aparece quando o serviço é prestado, não quando o dinheiro entra. |
| **Sub-conta dinâmica** | Conta criada por clínica em `accounting_accounts` (ex.: `4.1.1.RPG`). |
| **Conciliação** | Verificação periódica de que `financial_records` (operacional) bate com `accounting_journal_lines` (contábil). |
| **`billingMode`** | `manual` (cobrança SaaS registrada à mão) ou `asaas_card` (cobrança automática via Asaas). Campo de `clinic_subscriptions`. |

---

## 3. Arquitetura do módulo

### 3.1 Estrutura de pastas (backend)

```
artifacts/api-server/src/modules/financial/
├── accounting/                  # Plano de contas + CRUD de sub-contas
├── analytics/                   # /financial/cost-per-procedure, /dre
├── billing/                     # billing.service.ts (cobrança recorrente)
├── dashboard/                   # KPIs financeiros
├── financial.routes.ts          # router agregador
├── patient-wallet/              # Carteira em R$ por paciente
├── payments/                    # POST /patients/:id/payment (alocação)
├── projection/                  # /cash-flow-projection
├── records/                     # CRUD de financial_records, /estorno
├── recurring-expenses/          # Despesas fixas (mensal/semanal/anual)
├── reports/                     # /reports/reconciliation, monthly-revenue
└── settings/                    # /clinics/current/financial-settings
```

### 3.2 Helpers contábeis (`accounting.service.ts`)

Toda função grava sempre dentro de `db.transaction(...)` e valida `Σdébitos = Σcréditos` antes de persistir.

| Helper | Lançamento | Quando usar |
|---|---|---|
| `postCashReceipt` | D 1.1.1 / C 4.1.x | Pagamento à vista no ato (legado, fora do `/payment` moderno) |
| `postReceivableRevenue` | D 1.1.2 / C 4.1.x | Geração de recebível com receita imediata |
| `postReceivableSettlement` | D 1.1.1 / C 1.1.2 | Liquidação de recebível |
| `postWalletDeposit` | D 1.1.1 / C 2.1.1 | Depósito em carteira |
| `postWalletUsage` | D 2.1.1 / C 4.1.x | Uso de saldo da carteira em atendimento |
| `postPackageSale` | D 1.1.1 ou 1.1.2 / C 2.1.1 | Venda de pacote pré-pago |
| `postPackageCreditUsage` | D 2.1.1 / C 4.1.2 | Consumo de crédito de pacote |
| `postCashAdvance` | D 1.1.1 / C 2.1.1 | Recebimento sem título associado (substitui `postCashReceipt` em `/payment`) |
| `postExpense` | D 5.1.1 / C 1.1.1 | Despesa paga |
| `postReversal` | Inverte todas as linhas | Estorno (com `reversal_of_entry_id`) |
| `allocateReceivable` | — | Insere em `receivable_allocations` (sub-ledger de pagamento × título) |
| `ensureSystemAccounts(clinicId)` | — | Idempotente; cria as 8 contas-mãe na primeira escrituração da clínica |

---

## 4. Modelo de dados

### 4.1 Mini-ERD das relações principais

```
                                           ┌──────────────────────────────┐
                                           │ accounting_accounts          │
                                           │ (clinic_id, code, name,      │
                                           │  type, normal_balance)       │
                                           └────────────┬─────────────────┘
                                                        │ account_id
                                                        ▼
┌───────────────────┐  accounting_entry_id   ┌──────────────────────────────┐
│ financial_records │ ─────────────────────▶ │ accounting_journal_entries   │
│ (clinic_id,       │  recognized_entry_id   │ (clinic_id, entry_date,      │
│  patient_id,      │  settlement_entry_id   │  source_type, source_id,     │
│  amount, status,  │                        │  status, reversal_of_entry)  │
│  transaction_type,│                        └────────────┬─────────────────┘
│  parent_record_id)│                                     │ entry_id
└────────┬──────────┘                                     ▼
         │                                  ┌──────────────────────────────┐
         │                                  │ accounting_journal_lines     │
         │                                  │ (account_id, debit_amount,   │
         │                                  │  credit_amount, memo)        │
         │                                  └──────────────────────────────┘
         │
         │  payment_record / receivable_record
         ▼
┌──────────────────────────────┐
│ receivable_allocations       │  ← sub-ledger pagamento × título (Sprint 9: refatorar p/ B9)
│ (payment_entry_id,           │
│  receivable_entry_id,        │
│  patient_id, amount)         │
└──────────────────────────────┘

┌──────────────────────┐  upsert sob SELECT FOR UPDATE  ┌──────────────────────────────┐
│ patient_wallet       │ ─────────────────────────────▶ │ patient_wallet_transactions  │
│ (patient_id, balance)│                                │ (tipo, amount, source)       │
└──────────────────────┘                                └──────────────────────────────┘
```

### 4.2 Camada contábil (`lib/db/src/schema/accounting.ts`)

| Tabela | Propósito |
|---|---|
| `accounting_accounts` | Plano de contas por clínica. Campos: `clinicId`, `code`, `name`, `type` (asset/liability/equity/revenue/expense), `normalBalance` (debit/credit), `isSystem`. |
| `accounting_journal_entries` | Cabeçalho de cada evento contábil. Campos: `entryDate`, `eventType`, `sourceType`, `sourceId`, `patientId`, `appointmentId`, `procedureId`, `patientPackageId`, `subscriptionId`, `walletTransactionId`, `financialRecordId`, `status` (`posted`/`voided`/`reversed`), `reversalOfEntryId`, `createdBy`. |
| `accounting_journal_lines` | Linhas de débito e crédito. Campos: `entryId`, `accountId`, `debitAmount`, `creditAmount`, `memo`. **Constraint:** nunca débito + crédito simultâneos; soma débitos = soma créditos por entry. |
| `receivable_allocations` | Aplicação de pagamentos contra títulos. Campos: `paymentEntryId`, `receivableEntryId`, `patientId`, `amount`, `allocatedAt`. Resolve "pagamento manual desconectado da cobrança". |

### 4.3 Camada operacional (`lib/db/src/schema/financial.ts`)

`financial_records` — estrutura única que comporta todos os eventos financeiros visíveis ao usuário.

| Grupo | Campos |
|---|---|
| **Identificação** | `clinicId`, `patientId`, `appointmentId`, `procedureId`, `treatmentPlanProcedureId`, `patientPackageId`, `parentRecordId`, `monthlyInvoiceId` |
| **Valor** | `amount`, `originalUnitPrice`, `originalAmount`, `priceSource` (`tabela`/`override_clinica`/`plano_tratamento`) |
| **Categoria** | `transactionType` (lista abaixo), `category`, `description`, `paymentMethod` |
| **Status temporal** | `status` (`pendente`/`pago`/`cancelado`/`estornado`), `dueDate`, `paymentDate`, `planMonthRef` |
| **Vínculos contábeis** | `accountingEntryId`, `recognizedEntryId`, `settlementEntryId` |
| **Trilha de estorno** | `reversalReason`, `reversedBy`, `reversedAt` |

**Transaction types (15):**

| Categoria | Tipos |
|---|---|
| Recebíveis (sessão) | `creditoAReceber`, `cobrancaSessao`, `cobrancaMensal` |
| Liquidação | `pagamento` |
| Carteira | `depositoCarteira`, `usoCarteira` |
| Pacote | `vendaPacote`, `creditoSessao`, `usoCredito` |
| Faturas mãe | `pendenteFatura`, `faturaConsolidada`, `faturaMensalAvulso`, `faturaPlano` |
| Outros | `ajuste`, `estorno`, `despesa` |

### 4.4 Auxiliares operacionais

| Tabela | Arquivo | Propósito |
|---|---|---|
| `patient_wallet` | `patient-wallet.ts` | Saldo em R$ por paciente; UPDATE serializado com `SELECT … FOR UPDATE` |
| `patient_wallet_transactions` | `patient-wallet.ts` | Histórico de débitos/créditos da carteira |
| `clinic_financial_settings` | `clinic-financial-settings.ts` | `monthlyExpenseBudget`, `monthlyRevenueGoal`, `cashReserveTarget`, `defaultDueDays` |
| `billing_run_logs` | `billing-run-logs.ts` | Log de execuções do billing (`status`: `running`/`ok`/`failed`, `runId` UUID) |
| `recurring_expenses` | (junto a `financial.ts`) | Despesas fixas mensal/semanal/anual; `monthlyBudget` (orçado) pode diferir do cobrado |

### 4.5 SaaS Billing (`saas-plans.ts`)

| Tabela | Propósito |
|---|---|
| `subscription_plans` | Catálogo de planos SaaS (essencial, profissional, premium) |
| `clinic_subscriptions` | Assinatura ativa de cada clínica. Campos Asaas: `asaasCustomerId`, `asaasSubscriptionId`, `asaasCheckoutUrl`, `billingMode` (`manual`/`asaas_card`) |
| `asaas_webhook_events` | Eventos webhook recebidos. `UNIQUE(eventId)` garante idempotência. Resultados: `applied`/`duplicate`/`no_match`/`error` |

---

## 5. Plano de contas

### 5.1 Contas-mãe (sistêmicas)

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

### 5.2 Sub-contas dinâmicas

`procedures.accounting_account_id` permite rotear receita por procedimento para sub-contas customizáveis (ex.: `4.1.1.01 — RPG`, `4.1.1.02 — Pilates`). CRUD via `/api/financial/accounting/accounts`. **Fallback:** quando o procedimento não tem sub-conta, cai em `4.1.1` (atendimento) ou `4.1.2` (pacote).

### 5.3 Helpers de leitura

| Função | Saída | Uso típico |
|---|---|---|
| `getAccountingTotals(period)` | DRE e KPIs do período | DRE mensal, comparativo |
| `getAccountingBalances()` | Saldos correntes (Recebíveis em aberto, Adiantamentos pendentes) | Resumo do paciente, dashboard |

### 5.4 Invariantes

- Lançamentos `posted` **nunca** são editados — somente revertidos via `postReversal`.
- Cada `accounting_journal_lines` tem **ou** débito **ou** crédito (nunca ambos, nunca negativos).
- `createJournalEntry` valida `Σdébitos = Σcréditos` antes de persistir.
- Auto-criação por clínica na primeira escrituração (`ensureSystemAccounts(clinicId)`).

---

## 6. Fluxos contábeis (13 cenários)

Catálogo padronizado: para cada cenário, **Quando** dispara, **Lançamento** D/C, **Helper** que executa, **Efeitos colaterais** e **Notas**.

### 6.1 Sessão avulsa concluída ainda não paga

- **Quando:** confirmação de agendamento sem pagamento associado.
- **Lançamento:** D 1.1.2 Contas a Receber / C 4.1.x Receita.
- **Helper:** `postReceivableRevenue` em `applyBillingRules` (`appointments.billing.ts`).
- **Trilha:** `financial_records.accountingEntryId` apontando para a entry.

### 6.2 Pagamento de sessão avulsa pendente

- **Quando:** `POST /patients/:id/payment` aloca contra título existente.
- **Lançamento:** D 1.1.1 Caixa / C 1.1.2 Contas a Receber.
- **Helper:** `postReceivableSettlement` + `allocateReceivable`.
- **Notas:** se valor for parcial, título permanece parcialmente aberto.

### 6.3 Pagamento direto no ato da sessão (legado)

- **Quando:** caminhos antigos onde o operador registra atendimento + pagamento simultâneos.
- **Lançamento:** D 1.1.1 Caixa / C 4.1.x Receita.
- **Helper:** `postCashReceipt`. **Não é mais usado** dentro de `/payment` (substituído por `postCashAdvance` para o resíduo — fix B8/PR-FIN7-1).

### 6.4 Depósito em carteira

- **Quando:** `POST /patients/:id/wallet/deposit`.
- **Lançamento:** D 1.1.1 Caixa / C 2.1.1 Adiantamentos.
- **Helper:** `postWalletDeposit`.
- **Efeitos colaterais:** atualiza `patient_wallet.balance` (sob `FOR UPDATE`) + insere `patient_wallet_transactions` do tipo depósito.

### 6.5 Uso de carteira em atendimento

- **Quando:** confirmação de sessão paga via saldo de carteira.
- **Lançamento:** D 2.1.1 Adiantamentos / C 4.1.x Receita.
- **Helper:** `postWalletUsage`.
- **Efeitos colaterais:** debita `patient_wallet` (com `SELECT … FOR UPDATE` — fix B14) + transação de débito na carteira.

### 6.6 Venda de pacote pago no ato

- **Quando:** ato de venda de pacote pré-pago.
- **Lançamento:** D 1.1.1 Caixa / C 2.1.1 Adiantamentos.
- **Helper:** `postPackageSale`.
- **Efeitos colaterais:** cria créditos operacionais de sessão.
- **Notas:** **não é receita** no momento da venda — só ao consumir cada crédito (§6.7).

### 6.7 Consumo de crédito de pacote

- **Quando:** confirmação de sessão consumindo crédito do pacote.
- **Lançamento:** D 2.1.1 Adiantamentos / C 4.1.2 Receita de Pacotes.
- **Helper:** `postPackageCreditUsage`.
- **Notas:** `valor unitário = preço pacote / total sessões`. Resíduos de arredondamento são ajustados na **última** sessão.

### 6.8 Venda de pacote pendente (não pago)

- **Quando:** venda de pacote sem pagamento à vista.
- **Lançamento (na venda):** D 1.1.2 Contas a Receber / C 2.1.1 Adiantamentos.
- **Lançamento (no pagamento):** D 1.1.1 Caixa / C 1.1.2 Contas a Receber (`postReceivableSettlement`).
- **Notas:** receita continua sendo reconhecida apenas no consumo das sessões (§6.7).

### 6.9 Mensalidade paga antes das sessões

- **Quando:** pagamento antecipado de plano materializado (`faturaPlano`).
- **Lançamento:** D 1.1.1 Caixa / C 2.1.1 Adiantamentos.
- **Notas:** receita reconhecida proporcionalmente a cada sessão consumida no mês.

### 6.10 Mensalidade gerada e não paga

- **Quando:** geração mensal lazy via `monthlyPlanBilling` cron sem pagamento associado.
- **Lançamento (na geração):** D 1.1.2 Contas a Receber / C 2.1.1 Adiantamentos.
- **Lançamento (no pagamento):** D 1.1.1 Caixa / C 1.1.2 Contas a Receber.

### 6.11 Fatura consolidada

Modelo mãe-filhos: cada **filho** (sessão atendida) reconhece receita normalmente. A **mãe** (`faturaConsolidada`/`faturaMensalAvulso`) **NÃO posta receita** — apenas agrupa títulos para cobrança.

- **Pagamento da mãe:** `postReceivableSettlement` na mãe + `cascadeFaturaMensalAvulsoPayment` propaga `status='pago'` para os filhos e aloca o settlement contra cada `recognizedEntryId`.
- **Estorno da mãe (Sprint 8):** `cascadeReversalForFaturaMensalAvulso` itera filhos não-estornados e posta `postReversal(child.recognizedEntryId)` espelhado, com trilha completa.

### 6.12 Despesa paga

- **Quando:** registro manual de despesa.
- **Lançamento:** D 5.1.1 Despesas / C 1.1.1 Caixa.
- **Helper:** `postExpense`.

### 6.13 Cancelamento / estorno

**Princípio:** nunca apagar lançamento `posted`. Sempre criar inverso com `reversal_of_entry_id`.

Três caminhos de entrada (todos usam `postReversal` por baixo):

1. `PATCH /records/:id/status` → quando vai para `cancelado` ou `estornado`.
2. `PATCH /records/:id/estorno` → motivo obrigatório (mín. 3 caracteres).
3. `DELETE /records/:id` → para receita com `accountingEntryId`, exige `reversalReason` (fix B1).

Trilha persistida em todos os 3 caminhos: `originalAmount`, `reversalReason`, `reversedBy`, `reversedAt`. Para faturas mãe: dispara `cascadeReversalForFaturaMensalAvulso` automaticamente.

---

## 7. Operação financeira (algoritmos)

### 7.1 Resolução de preço (`resolveEffectivePrice`)

Sprint 1, em `appointments.pricing.ts`. Hierarquia de fallback aplicada em **toda** cobrança:

```
1. treatment_plan_procedures.unitPrice − discount   (se plano 'ativo' e procedimento listado)
2. procedure_costs.priceOverride                    (override por clínica)
3. procedures.price                                 (tabela base)
```

Persistido em `financial_records.priceSource` (`tabela`/`override_clinica`/`plano_tratamento`) + `originalUnitPrice` (para auditoria de margem).

### 7.2 Pagamento (`POST /patients/:id/payment`) — algoritmo

```
1. Cria paymentRecord (transactionType='pagamento', status='pago', clinicId).
2. Lista pendingRecords:
   - tipos = RECEIVABLE_TYPES + 'vendaPacote'
   - WHERE clinic_id = req.clinicId    ← fix B4 (vazamento multi-tenant)
   - ORDER BY due_date ASC, created_at ASC
3. Para cada pendência (até esgotar valor pago):
   ┌───────────────────────────────────────────────────────────┐
   │ se faturaPlano sem accountingEntryId                      │
   │     → postCashAdvance         (D 1.1.1 / C 2.1.1)         │
   │ se faturaMensalAvulso                                     │
   │     → postReceivableSettlement                            │
   │     → cascadeFaturaMensalAvulsoPayment(filhos)            │
   │ se vendaPacote legado sem entry        ← fix B5 (crítico) │
   │     → postCashAdvance (NÃO settlement)                    │
   │ outros recebíveis                                         │
   │     → postReceivableRevenue se necessário                 │
   │     → postReceivableSettlement                            │
   │     → allocateReceivable                                  │
   └───────────────────────────────────────────────────────────┘
4. Se remaining > 0:                          ← fix B8 + B15
   - postCashAdvance (D 1.1.1 / C 2.1.1)
   - upsert patient_wallet com SELECT … FOR UPDATE
   - insert patient_wallet_transactions (tipo='credito')
   - response.walletCredited = remaining
```

**Resposta:** `{ paymentRecord, allocations: [{ recordId, amount }], walletCredited }`.

### 7.3 Plano de tratamento como venda formal (Sprint 2)

`POST /api/patients/:patientId/treatment-plans/:planId/accept`:

- Faz **snapshot** dos preços vigentes em `frozen_prices_json` (auditoria LGPD).
- Captura aceite: `acceptedAt`, `acceptedBy`, IP, user-agent.
- Bloqueia `PUT` que altere preço/desconto/procedimentos (retorna 409 — exige renegociação criando novo plano com `parent_plan_id`).
- Aceite remoto: `/aceite/:token` (link público).
- Geração de `faturaPlano` materializada por mês via job cron `monthlyPlanBilling`.

### 7.4 Reconhecimento de receita do plano

`recognizeMonthlyInvoiceRevenue(invoiceId)` — chamada na **1ª confirmação** de sessão do mês:

```
1. pg_advisory_xact_lock(invoiceId)              ← fix B10 (race entre confirmações)
2. SELECT recognizedEntryId FROM faturaPlano WHERE id = invoiceId
3. Se recognizedEntryId IS NOT NULL → retorna (idempotente)
4. Posta receita integral da fatura (D 1.1.2 ou 2.1.1 / C 4.1.x)
5. UPDATE faturaPlano SET recognizedEntryId = newEntry.id
```

**Rollback (fix B12):** ao desfazer status confirmado da **última** sessão do mês, `applyBillingRules` posta `postReversal(recognizedEntryId)` e zera a sentinel.

### 7.5 Idempotência do billing (`runBilling`)

Chave universal: `planMonthRef` formato `YYYY-MM` — substitui janela frágil `created_at >= monthStart` (fix B6).

```
Antes de qualquer insert no mês M:
  SELECT 1
    FROM financial_records
   WHERE patient_package_id = X
     AND plan_month_ref     = 'YYYY-MM';
Se exists → skip.
```

**Log em duas fases (fix B7):** `INSERT billing_run_logs(status='running', runId=UUID)` no início, `UPDATE status='ok'|'failed'` no fim. Pino logger estruturado com `runId`/`durationMs`.

---

## 8. Endpoints REST

### 8.1 Records (CRUD + estorno) — `records/financial-records.routes.ts`

| Método | Rota | Permissão | Notas |
|---|---|---|---|
| GET | `/api/financial/records` | `financial.read` | Filtros: `from`, `to`, `status`, `transactionType`, `q`, `sort`; paginação cursor |
| POST | `/api/financial/records` | `financial.write` | Cria registro avulso |
| PATCH | `/api/financial/records/:id` | `financial.write` | **409 `RECORD_ALREADY_POSTED`** se tentar alterar `amount`/`type`/`status`/`paymentDate` em registro contabilizado (fix B2) |
| PATCH | `/api/financial/records/:id/status` | `financial.write` | Promove créditos prepago + cascata para filhos quando `pago` (fix B3); cascata de estorno quando `estornado/cancelado` (Sprint 8) |
| PATCH | `/api/financial/records/:id/estorno` | `financial.write` | Exige `reversalReason` (mín 3); + cascata de estorno para `faturaMensalAvulso` |
| GET | `/api/financial/records/reversals` | `financial.read` | Histórico de estornos com paginação cursor |
| DELETE | `/api/financial/records/:id` | `financial.write` | Receita com entry exige `reversalReason` e dispara `postReversal` (fix B1); despesa: DELETE físico |

### 8.2 Pagamento (alocação multi-pendência)

| Método | Rota | Permissão |
|---|---|---|
| POST | `/api/financial/patients/:patientId/payment` | `financial.write` |

Algoritmo descrito em §7.2.

### 8.3 Carteira do paciente

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/patients/:patientId/wallet` | `patients.read` |
| POST | `/api/financial/patients/:patientId/wallet/deposit` | `financial.write` |

### 8.4 Resumos por paciente

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/financial/patients/:patientId/history` | `financial.read` |
| GET | `/api/financial/patients/:patientId/summary` | `financial.read` |
| GET | `/api/financial/patients/:patientId/credits` | `financial.read` |

### 8.5 Plano de contas (sub-contas customizáveis)

| Método | Rota | Permissão | Feature |
|---|---|---|---|
| GET | `/api/financial/accounting/accounts` | `financial.read` | `financial.view.accounting` |
| POST | `/api/financial/accounting/accounts` | `financial.write` | `financial.view.accounting` |
| PUT | `/api/financial/accounting/accounts/:id` | `financial.write` | `financial.view.accounting` |
| DELETE | `/api/financial/accounting/accounts/:id` | `financial.write` | Bloqueia se houver lançamentos ou procedimento referenciando |
| GET | `/api/financial/accounting/dre-by-procedure` | `financial.read` | `financial.view.accounting` |

### 8.6 Analytics, projeção e reports

| Método | Rota | Permissão | Feature |
|---|---|---|---|
| GET | `/api/financial/cost-per-procedure` | `financial.read` | `financial.cost_per_procedure` |
| GET | `/api/financial/dre` | `financial.read` | `financial.view.dre` |
| GET | `/api/financial/cash-flow-projection?days=30` | `financial.read` | `financial.view.cash_flow` |
| GET | `/api/financial/reports/monthly-revenue` | `reports.read` | — |
| GET | `/api/financial/reports/procedure-revenue` | `reports.read` | — |
| GET | `/api/financial/reports/schedule-occupation` | `reports.read` | — |
| GET | `/api/financial/reports/reconciliation?from=&to=` | `financial.read` | — (ver §10) |

`cash-flow-projection` retorna `{ openingBalance, cashReserveTarget, totals, breachesReserve, series: [...] }`.

### 8.7 Despesas fixas e configurações

| Método | Rota | Permissão |
|---|---|---|
| GET / POST / PATCH / DELETE | `/api/financial/recurring-expenses[/:id]` | `financial.read`/`write` |
| GET / PUT | `/api/financial/settings` | `settings.manage` |

### 8.8 SaaS Billing e webhooks (ver §11 para detalhes)

| Método | Rota | Auth |
|---|---|---|
| POST / GET / POST | `/api/saas-billing/{subscribe,status,cancel}` | admin clínica |
| POST | `/api/saas-billing/clinic-subscriptions/:clinicId/{remind,cancel}` | superadmin |
| POST | `/api/webhooks/asaas` | header `asaas-access-token` (constant-time) |

---

## 9. Schedulers (cron jobs)

Registrados em `artifacts/api-server/src/scheduler/index.ts`. Cada job é envolto por `tryAcquireAdvisoryLock(name)` (`pg_try_advisory_lock`) — apenas **1 réplica por job** mesmo se houver múltiplos containers. Helper aplica retry com backoff (3 tentativas, 200/400ms) para tolerar erros transitórios do Postgres serverless (Neon "Control plane request failed" durante cold-start).

| Job | Cron (BRT) | Função | Notas |
|---|---|---|---|
| `billing` | `0 9 * * *` (06:00) | `runBilling()` | Cobrança mensal de pacotes recorrentes; idempotência via `planMonthRef`; log em duas fases (`running→ok/failed`) |
| `monthlyPlanBilling` | `30 9 * * *` (06:30) | `runMonthlyPlanBilling()` | Geração lazy de `faturaPlano` por mês de competência |
| `autoConfirm` | `*/15 * * * *` | `runAutoConfirmPolicies()` | Confirma agendamentos elegíveis conforme política da clínica |
| `endOfDay` | `0 22 * * *` (22:00) | `runEndOfDayPolicies()` | No-show, cobrança de ausência, auto-completion |
| `subscriptionCheck` | `0 10 * * *` (07:00) | `runSubscriptionCheck()` | Trial expirado, suspensão por inadimplência (≥7d grace); pula clínicas em `billingMode='asaas_card'` (Asaas é fonte de verdade) |

**Observabilidade:** cada execução loga `durationMs`, `runId`, contadores; falhas notificam Sentry via `captureException`. Falha de aquisição de lock vira `warn` (não-fatal — próxima janela tenta novamente).

---

## 10. Conciliação operacional × contábil

`GET /api/financial/reports/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD` (Sprint 8 — PR-FIN8-3).

Compara em tempo real três pares de saldo + lista órfãos:

| Comparação | Operacional | Contábil |
|---|---|---|
| **Receita** na janela | `revenueSummarySql` | Saldo credor das contas `4.x` |
| **Recebíveis pendentes** | `status='pendente' AND type='receita' AND transactionType ∈ RECEIVABLE_TYPES` | Saldo devedor de `1.1.2` |
| **Caixa recebido** | settlements com `paymentDate` na janela | Saldo devedor de `1.1.1` |
| **Órfãos** (até 50) | `financial_records` ativos sem `recognizedEntryId`/`accountingEntryId` | — |

**Resposta exemplo:**

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

`ok = false` se algum `diff > R$ 0,01` ou houver órfãos. Pronto para integração com job cron noturno + dashboard "Conciliação" no superadmin (ver §17).

---

## 11. SaaS Billing — Asaas

Cobrança da mensalidade da plataforma (clínica → FisioGest Pro). **Não confundir com cobrança ao paciente** (essa segue manual — ver §12).

### 11.1 Decisões-chave

| Decisão | Razão |
|---|---|
| **Asaas** | Melhor cobertura PIX+Boleto+Cartão+régua nativa para o mercado BR |
| **Cartão recorrente** via Subscription API nativa | Asaas vira responsável pelo agendamento e retry; menos código de scheduler nosso |
| **Checkout hospedado** | Zero PCI no nosso lado — cartão é digitado no domínio do Asaas |
| **Régua nativa Asaas** | E-mail+SMS automáticos sem código nosso; basta painel de visualização |

### 11.2 Fluxo end-to-end

```
Clínica (admin)                    Backend                 Asaas
     │                                │                       │
     │  Configurações → Plano         │                       │
     │  → "Pagar com cartão"          │                       │
     ├───────────────────────────────▶│                       │
     │                                │  POST /customers      │
     │                                ├──────────────────────▶│
     │                                │  POST /subscriptions  │
     │                                ├──────────────────────▶│
     │                                │   { checkoutUrl }     │
     │                                │◀──────────────────────┤
     │  redirect → checkoutUrl        │                       │
     │◀───────────────────────────────┤                       │
     ├───────────────────────────────────────────────────────▶│  (cartão digitado no domínio Asaas)
     │                                │                       │
     │                                │   PAYMENT_CONFIRMED   │
     │                                │◀──────────────────────┤  (webhook)
     │                                │  applyPaymentToSub    │
     │                                │  → paymentStatus=paid │
     │                                │  → +30 dias período   │
```

### 11.3 Comportamento dos eventos webhook

| Evento | Ação |
|---|---|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | `applyPaymentToSubscription()` rola período +30d, marca `paymentStatus='paid'` |
| `PAYMENT_OVERDUE` | `paymentStatus='overdue'`. Scheduler `subscriptionCheck` suspende após 7d de grace |
| `PAYMENT_REFUNDED` | `paymentStatus='refunded'` + log audit |
| `PAYMENT_DELETED` | log audit |
| `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_CYCLE_REMOVED` | Limpa campos Asaas, volta para `billingMode='manual'` |
| Outros | `result='ignored'` — sempre retorna 200 (Asaas só faz retry em não-2xx) |

### 11.4 Idempotência e segurança

- **Token webhook:** comparação constant-time (`asaas-access-token` vs `ASAAS_WEBHOOK_TOKEN`); inválido → 401.
- **Dedup:** `INSERT INTO asaas_webhook_events` com `UNIQUE(eventId)` — duplicado é descartado como `result='duplicate'` retornando 200.
- **Sem dados de cartão no nosso DB** — apenas `asaasCustomerId` e `asaasSubscriptionId`.
- **Audit log:** todas as ações superadmin (resend, cancel) entram em `audit_log`.
- **Rate limit:** webhook usa `PgRateLimitStore` (60 req/min por IP).

### 11.5 Painel de inadimplência (superadmin)

`pages/saas/superadmin → Inadimplência`: lista clínicas com `paymentStatus ∈ {overdue, expired, suspended}` + últimos 30 eventos do gateway com `result` (`applied`/`duplicate`/`no_match`/`error`).

Ações por linha: **Reenviar lembrete** (`POST .../remind`) · **Cancelar cobrança** (`POST .../cancel`) · **Abrir checkout** (link externo).

### 11.6 Configuração

| Var | Tipo | Default | Como obter |
|---|---|---|---|
| `ASAAS_API_KEY` | secret | — | painel.sandbox.asaas.com → Configurações → Integrações |
| `ASAAS_BASE_URL` | env | `https://sandbox.asaas.com/api/v3` | em prod: `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | secret | — | string aleatória definida no painel Asaas → Webhooks |

No painel Asaas → Notificações → Webhooks: cadastrar `https://<dominio>/api/webhooks/asaas` com token de autenticação igual ao `ASAAS_WEBHOOK_TOKEN`.

Cartão de teste sandbox: `5162306219378829` / 12/2030 / CVV 123.

### 11.7 Arquivos-chave

```
artifacts/api-server/src/lib/asaas/{client,types,index}.ts        ← cliente HTTP com timeout + retry
artifacts/api-server/src/modules/saas/billing/                    ← billing.routes/service/schemas
artifacts/api-server/src/modules/webhooks/asaas.routes.ts         ← handler webhook
artifacts/api-server/src/modules/saas/subscriptions/subscription.service.ts  ← scheduler pula asaas_card
artifacts/fisiogest/src/pages/settings/plano-section.tsx          ← UI da clínica
artifacts/fisiogest/src/pages/saas/superadmin/components/InadimplenciaTab.tsx  ← UI superadmin
```

---

## 12. Roadmap de pagamento ao paciente

A cobrança ao paciente é hoje **manual** (operador da clínica registra). O schema já é webhook-ready (`paymentMethod`, `transactionType`, ledger contábil, `nextBillingDate`, `billing_run_logs`).

### 12.1 Gateways recomendados por caso de uso

| Gateway | Ideal para | Diferenciais | Taxa | Status |
|---|---|---|---|---|
| **Asaas** | Régua de cobrança, PIX, Boleto, Cartão, Assinatura | PIX QR, recorrente, dunning nativo via WhatsApp/SMS/e-mail | 0,99% PIX · R$1,99 boleto · 1,99%+ cartão | Já usado no SaaS billing |
| **Efí (Gerencianet)** | PIX nativo + Split | PIX Open Finance, mTLS, split nativo para repasse a profissionais | 0,9% PIX · R$1,49 boleto · 2,49% cartão | Pendente |
| **Stripe** | Pacientes internacionais, USD/EUR | Melhor API de assinaturas, portal self-service | 2,9% + R$0,30 · 0,5% subscriptions | Pendente |
| **Mercado Pago** | Setup simples, clínicas menores | Maquininha física, QR PIX, alta confiança | 2,99% cartão · PIX grátis PF | Pendente |

### 12.2 Plano de integração faseado

```
Fase 1 — PIX manual assistido [✅ implementado hoje]
└── Operador registra paymentMethod='Pix' + paymentDate em PATCH /records/:id/status

Fase 2 — Régua de cobrança (Asaas webhook) [pendente]
├── Tabela gateway_charges (financialRecordId, gatewayId, externalId, status)
├── Ao criar financial_record pendente: chama Asaas API para emitir cobrança
└── Webhook PAYMENT_RECEIVED → PATCH /records/:id/status='pago' automático

Fase 3 — PIX dinâmico (Efí) [pendente]
├── POST /api/financial/patients/:id/pix-charge → QR code dinâmico
└── Webhook pix.received → PATCH automático

Fase 4 — Assinatura via gateway (Asaas/Stripe) [pendente]
├── Sincroniza patient_packages recorrentes com subscription do gateway
├── Gateway dispara cobrança mensal → webhook cria financial_record
└── Elimina billingService manual
```

### 12.3 Variáveis de ambiente (quando integrar)

| Var | Status |
|---|---|
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` | ✅ configuradas (uso atual: SaaS billing) |
| `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY` | pendente |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | pendente |

---

## 13. Auditoria — bugs B1–B15

Mapa completo dos bugs identificados em 29/04/2026. Todos os PRs estão detalhados em §14.

| # | Severidade | Descrição | Status |
|---|---|---|---|
| **B1** | Alta | `DELETE /records/:id` (receita) não postava `postReversal` — soft-delete deixava entry contábil ativo | ✅ Resolvido (PR-FIN6-1) |
| **B2** | Alta | `PATCH /records/:id` permitia editar `amount`/`type` em registro contabilizado sem trilha | ✅ Resolvido (PR-FIN6-1) — 409 `RECORD_ALREADY_POSTED` |
| **B3** | Alta | `PATCH /records/:id/status='pago'` não promovia créditos prepago nem cascateia para filhos | ✅ Resolvido (PR-FIN6-2) — paridade com `/payment` |
| **B4** | Média-Alta | Vazamento multi-tenant em `/payment` (super-admin pegava pendências cross-clinic) | ✅ Resolvido (PR-FIN6-4) — filtro `eq(clinicId, req.clinicId)` |
| **B5** | **Crítica** | `vendaPacote` no loop de `/payment` caía em `postReceivableSettlement` sem recebível → balancete com 1.1.2 negativo | ✅ Resolvido (PR-FIN6-3) — usa `postCashAdvance` quando legado sem entry |
| **B6** | Média | `runBilling` idempotente por janela `createdAt` falhava na virada do mês (BRT vs UTC) | ✅ Resolvido (PR-FIN7-2) — chave `planMonthRef` |
| **B7** | Baixa | Log de `runBilling` fora da transação dos inserts; perda de rastreabilidade em crash | ✅ Resolvido (PR-FIN7-3) — log em duas fases (`running→ok/failed`) com `runId` UUID |
| **B8** | Média | `postCashReceipt` para `remaining > 0` em `/payment` criava receita "fantasma" sem documento | ✅ Resolvido (PR-FIN7-1) — usa `postCashAdvance` + carteira |
| **B9** | Média | `accountingEntryId` do `paymentRecord` mistura semântica (só guarda 1 entry quando há múltiplas alocações) | ⏳ **Deferido para Sprint 9** — exige tabela `payment_allocations` (sub-ledger) com migração + backfill |
| **B10** | Baixa-Média | `recognizeMonthlyInvoiceRevenue` race em confirmações concorrentes (sentinel só em app-level) | ✅ Resolvido (PR-FIN7-2) — `pg_advisory_xact_lock(invoiceId)` |
| **B11** | Média | `closeAvulsoMonth` usava `category[0]`, `dueDay=10` hardcoded, sem `procedureId` | ✅ Resolvido (PR-FIN8-2 + PR-FIN8-4 antecipado) — `aggregatedCategory='Fatura mensal'`, `dueDay=clinic.defaultDueDays`, `procedureId` deliberadamente nulo na mãe |
| **B12** | Baixa-Média | Rollback de `recognizedEntryId` ausente quando todas sessões saem do estado confirmado | ✅ Resolvido (PR-FIN7-4) — `postReversal` automático na última saída |
| **B13** | Informativo | `closeAvulso parent` lookup fora da advisory lock (race rara, sem duplicidade contábil) | 🟡 Documentado — aceitável, não corrige |
| **B14** | Média | Race em decremento de saldo da `patient_wallet` em débito + estorno + upsert | ✅ Resolvido (PR-FIN8-4) — `SELECT … FOR UPDATE` em todos os 3 caminhos |
| **B15** | Média | DRE divergia entre `revenueSummarySql` e DRE-by-procedure quando `postCashReceipt` era chamado | ✅ Resolvido (PR-FIN7-1) — eliminado por consequência do fix B8 |

**Resumo:** 13 corrigidos, 1 deferido (B9), 1 informativo (B13).

---

## 14. Histórico de sprints

### Sprint Financeiro 1 — Correção crítica de preço · ✅ 27/04/2026

`resolveEffectivePrice` em `appointments.pricing.ts` com hierarquia plano > override > tabela. Coluna `price_source` + `original_unit_price`. Migração `0001_add_price_source.sql`. Testes 13/13 ✓. Commits `1193bd6` + `17fe262`.

### Sprint Financeiro 2 — Plano como venda formal · ✅ 27/04/2026

Aceitação de plano com `accepted_at`, `accepted_by`, `frozen_prices_json`, `parent_plan_id`. Endpoints `/accept` + `/renegotiate`. Tabela `clinic_financial_settings` + UI em Configurações. Diferenciação SaaS por features (`financial.view.*`, `financial.cost_per_procedure`).

### Sprint Financeiro 3 — Fluxo de Caixa Projetado + auditoria · ✅ 27/04/2026

Endpoint `/cash-flow-projection?days=30` (1..180) + aba "Fluxo de Caixa" com Recharts ComposedChart. Categorização contábil por procedimento (`procedures.accounting_account_id`) + aba "DRE/Procedimento". Auditoria robusta de estornos (`original_amount`, `reversal_reason`, `reversed_by`, `reversed_at`) + endpoint `/records/reversals` + aba "Estornos".

### Sprint Financeiro 6 — Integridade contábil · ✅ 29/04/2026

| PR | Bugs | Conteúdo |
|---|---|---|
| PR-FIN6-1 | B1+B2 | DELETE com estorno espelhado obrigatório; PATCH bloqueado em campos contábeis |
| PR-FIN6-2 | B3 | `/status='pago'` chama `promotePrepaidCreditsForFinancialRecord` + `cascadeFaturaMensalAvulsoPayment` |
| PR-FIN6-3 | B5 | `vendaPacote` legado em `/payment` usa `postCashAdvance` |
| PR-FIN6-4 | B4 | `pendingRecords` filtra por `clinicId` |

Cobertura: 11 testes novos. Suite: 347/347 ✓.

### Sprint Financeiro 7 — Auditabilidade & idempotência · ✅ 29/04/2026

| PR | Bugs | Conteúdo |
|---|---|---|
| PR-FIN7-1 | B8+B15 | `remaining > 0` → `postCashAdvance` + carteira; remoção de `postCashReceipt` do `/payment` |
| PR-FIN7-2 | B6+B10 | `planMonthRef` como chave; `pg_advisory_xact_lock` no reconhecimento |
| PR-FIN7-3 | B7 | Log `running→ok/failed` com `runId` UUID. Migração `0012_sprint7_billing_log_status.sql` |
| PR-FIN7-4 | B12 | Rollback de `recognizedEntryId` na última saída |
| PR-FIN8-4 antecipado | B11 (parcial) | `dueDay = clinic.defaultDueDays ?? 10` |

### Sprint Financeiro 8 — Sub-ledger & conciliação (parcial) · ✅ 29/04/2026

| PR | Bugs | Status |
|---|---|---|
| PR-FIN8-1 | B9 | ⏳ **Deferido para Sprint 9** — tabela `payment_allocations` (sub-ledger formal) |
| PR-FIN8-2 | B11 | ✅ Cascata de estorno + `aggregatedCategory='Fatura mensal'` |
| PR-FIN8-3 | — | ✅ Endpoint `GET /reports/reconciliation` com diffs e órfãos |
| PR-FIN8-4 | B14+B11 | ✅ `SELECT … FOR UPDATE` em 3 caminhos da carteira |

Cobertura: 4 testes novos em `payment-cascade.test.ts`. Suite: **351/351 ✓**.

### Manutenção pós-Sprint 8 · ✅ 30/04/2026

- TS2304 em `TreatmentPlanTab.tsx` (`StepItens` sem prop `isAccepted`) — corrigido.
- `tryAcquireAdvisoryLock`: retry com backoff (3x, 200/400ms) para tolerar erros transitórios do Postgres serverless; falha residual logada como `warn` (não-fatal).
- Documentação consolidada em `docs/FINANCEIRO.md` (este arquivo).

### Sprint Financeiro 11 (P5) — Cláusulas contratuais configuráveis · ✅ 30/04/2026

| Item | Status |
|---|---|
| Migration `0015_clinic_contract_clauses.sql` (tabela + `treatment_plans.accepted_clauses_json`) | ✅ |
| Schema Drizzle `clinic-contract-clauses.ts` | ✅ |
| Service CRUD com versionamento (publicar nova versão = desativar anteriores) + `seedDefaults` + `buildAcceptedClausesSnapshot` | ✅ |
| Routes `/api/clinics/current/contract-clauses` (`settings.manage`) | ✅ |
| Aceite (presencial + público) valida cláusulas obrigatórias e congela snapshot em `accepted_clauses_json` | ✅ |
| Snapshot público expõe `contractClauses` (vigentes) e `acceptedClauses` (congeladas) | ✅ |
| Seeds das 3 cláusulas-padrão (REAGENDAMENTO_INTRAMENSAL, PRECO_DIFERENCIADO, TITULO_EXECUTIVO) | ✅ |
| Front-end Configurações → Cláusulas (CRUD com toggles e versionamento) | ✅ |
| Front-end aceite (`AcceptanceBlock` interno + `aceite.tsx` público) com checkboxes obrigatórios | ✅ |
| Testes vitest (`contract-clauses.test.ts` × 12 + `acceptance.clauses.test.ts` × 4) | ✅ |

Cobertura: +15 testes novos. Suite total: **388/388 ✓**.

**Modelo:** cada clínica define cláusulas via `code` estável (ex.: `REAGENDAMENTO_INTRAMENSAL`) com `version` que incrementa quando o `body` muda — versões antigas ficam preservadas como `is_active=false`. No aceite, `acceptedClauseCodes: string[]` enumera quais foram marcadas; cláusulas `is_required=true` que faltarem retornam **HTTP 400** com `issues=[{code, code:'clause_required_missing'}]`. O snapshot persistido em `treatment_plans.accepted_clauses_json` contém `{acceptedAt, items:[{code, version, title, body, isRequired}]}` — congelado para audit/LGPD/CPC art. 784, III.

---

## 15. Governança & observabilidade

| Item | Estado | Próximo passo |
|---|---|---|
| Audit log | OK em CRUD principais (`logAudit`) | Estender para `applyBillingRules`, `recognizeMonthlyInvoiceRevenue`, `closeAvulsoMonth` |
| Trilha de estorno | ✅ Completa nos 3 caminhos (`reversedBy`, `reversalReason`, `reversedAt`, `originalAmount`) | — |
| Permissões | `requirePermission("financial.write")` em mutações | Adicionar `financial.reverse` granular |
| Logs estruturados | ✅ Pino com `runId`/`requestId` (Sprint 7) | — |
| Métricas Prometheus | Ausentes | Counters `billing_runs_total`, `revenue_recognized_total`, `reversals_total{reason}` |
| Dashboard "Conciliação" | Endpoint pronto (§10), falta UI | Painel "Conciliação operacional × contábil" + "Top divergências do dia" |
| Sentry | Estrutura pronta (`lib/sentry.ts`); ativada via `SENTRY_DSN_BACKEND` / `VITE_SENTRY_DSN` | Configurar DSN em prod + source maps |

---

## 16. Testes

**Estado atual:** **351/351 testes vitest passando** (35 arquivos).

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

**Pendentes (Sprint 9):**

| Caso | Arquivo |
|---|---|
| `GET /reports/reconciliation`: `ok=true` quando saldos batem | `reconciliation.test.ts` (e2e) |
| `GET /reports/reconciliation`: detecta órfão (receita sem entry) | `reconciliation.test.ts` (e2e) |
| `SELECT FOR UPDATE` em carteira: 2 débitos concorrentes não dobram saldo | `wallet-race.test.ts` (integração com Postgres real) |

**Comandos:**

```bash
pnpm test                                    # suite completa
pnpm test --filter @workspace/api-server     # só backend
pnpm typecheck                               # validação TS dos 4 packages
```

---

## 17. Roadmap & riscos

### 17.1 Riscos sistêmicos com mitigação

| # | Risco | Estado | Mitigação ativa |
|---|---|---|---|
| 1 | **Duas fontes de verdade** (`financial_records` × `accounting_journal_lines`) sincronizadas só nos endpoints felizes | 🟡 | Endpoint `/reports/reconciliation` (§10) — falta job cron noturno + dashboard |
| 2 | **Falta de `payment_allocations`** (B9) dificulta estorno parcial e composição do recebimento | 🟡 | Refator planejado para Sprint 9 (PR-FIN8-1) |
| 3 | **Edição direta sem trilha** (B1+B2) | ✅ | 409 em campos contábeis + estorno espelhado obrigatório |
| 4 | **Idempotência de billing/reconhecimento** (B6+B10) | ✅ | `planMonthRef` + `pg_advisory_xact_lock`. Sugerido `UNIQUE INDEX (patient_package_id, plan_month_ref)` como defesa em profundidade |
| 5 | **Cascata de estorno em `faturaPlano`** (não `faturaMensalAvulso`) | ⏳ | Decisão operacional pendente sobre semântica de "mês inteiro"; `faturaMensalAvulso` já cascateia |

### 17.2 Próximos passos (Sprint 9)

1. **PR-FIN8-1 (B9):** tabela `payment_allocations(payment_record_id, accounting_entry_id, amount)` + refator de `/payment` para alocação explícita + backfill controlado.
2. **Cascata de estorno em `faturaPlano`** após decisão de produto.
3. **Job cron noturno** consumindo `/reports/reconciliation` e gravando em `discrepancy_log` para alerta diário.
4. **Painel "Conciliação"** no superadmin (UI sobre o endpoint existente).
5. **Métricas Prometheus**: counters de billing/reversals/revenue.
6. **Testes de integração com Postgres real** (`wallet-race.test.ts`) cobrindo lock de linha sob carga concorrente.
7. **Roadmap pagamento ao paciente — Fase 2**: webhook Asaas para `PATCH /records/:id/status` automático ao receber `PAYMENT_RECEIVED`.

### 17.3 Otimizações (não-funcionais)

Aplicar quando volume/latência exigir.

| # | Alvo | Sugestão |
|---|---|---|
| 1 | **Índices** | `financial_records (clinic_id, status, due_date)`, `(patient_id, transaction_type, status)`; `accounting_journal_lines (account_id, entry_id)`; `accounting_journal_entries (clinic_id, entry_date)` |
| 2 | **N+1 em `/payment`** | Cada pendência faz 3 inserts; pode virar batch `INSERT … VALUES (...), (...) RETURNING` |
| 3 | **`getAccountingBalances` em `/summary`** | Cachear memoizado por (`clinicId`, `patientId`) com invalidação no evento de novo `journal_entry` |
| 4 | **`runBilling` em clínicas grandes** | Paginar pacotes ativos em chunks de 200 com cursor por `id` |
| 5 | **`closeAvulsoMonth`** | Adicionar `RETURNING id, amount` no UPDATE para validar soma vs total (defesa em profundidade) |
| 6 | **`recognizeMonthlyInvoiceRevenue`** | Precomputar `revenueAccountCode` na materialização do plano para evitar JOIN com `procedures` em toda confirmação |
