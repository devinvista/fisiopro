## Modelo Financeiro

**Lógica de datas dos registros:**
- `dueDate` — data de vencimento (quando o pagamento é esperado)
- `paymentDate` — data em que o pagamento foi efetivamente realizado
- Registros pendentes: `paymentDate = null`, `dueDate` preenchido
- Registros pagos: ambos preenchidos

**Filtro de período** (endpoint `/records` e `/dashboard`):
1. `paymentDate` no intervalo → registros pagos no mês
2. `paymentDate = null` mas `dueDate` no intervalo → pendências do mês
3. Ambos nulos → fallback para `createdAt` (registros legados)

**Aging (inadimplência):**
- Frontend calcula `daysOverdue = today - dueDate` para registros `status=pendente`
- Badge "Vencido há Xd" em vermelho; linha da tabela com fundo `bg-red-50/30`

**Formas de pagamento disponíveis:** Dinheiro, Pix, Cartão de Crédito, Cartão de Débito, Transferência, Boleto, Cheque, Outros

**Status dos registros:**
- `pendente` — a pagar/receber (paymentDate não preenchido)
- `pago` — liquidado
- `cancelado` — cancelado sem estorno
- `estornado` — soft-reversal de receita (nunca hard-delete)

**Transaction types** (gerados automaticamente pelo sistema):
- `creditoAReceber` — sessão agendada gera crédito a receber
- `cobrancaSessao` — cobrança avulsa de sessão
- `cobrancaMensal` — gerado pelo billing automático de assinatura
- `pagamento` — registro de recebimento do paciente
- `usoCredito`, `creditoSessao`, `ajuste`, `estorno`

---


## Sistema Contábil (Partidas Dobradas)

O sistema financeiro usa **ledger contábil formal por partidas dobradas** como fonte de verdade para KPIs, DRE e relatórios. Os `financial_records` são a camada operacional/de exibição; os lançamentos contábeis são a fonte de verdade para os totais.

### Plano de Contas (ACCOUNT_CODES)
| Código | Nome | Tipo | Saldo Normal |
|---|---|---|---|
| `1.1.1` | Caixa/Banco | Ativo | Débito |
| `1.1.2` | Contas a Receber | Ativo | Débito |
| `2.1.1` | Adiantamentos de Clientes | Passivo | Crédito |
| `3.1.1` | Patrimônio/Resultado Acumulado | PL | Crédito |
| `4.1.1` | Receita de Atendimentos | Receita | Crédito |
| `4.1.2` | Receita de Pacotes/Mensalidades Reconhecida | Receita | Crédito |
| `5.1.1` | Despesas Operacionais | Despesa | Débito |
| `5.1.2` | Estornos/Cancelamentos de Receita | Despesa | Débito |

### Eventos contábeis e seus lançamentos
| Evento | Débito | Crédito |
|---|---|---|
| Pagamento direto (`postCashReceipt`) | 1.1.1 Caixa | 4.1.1 Receita |
| Geração de recebível (`postReceivableRevenue`) | 1.1.2 Recebíveis | 4.1.1 Receita |
| Liquidação de recebível (`postReceivableSettlement`) | 1.1.1 Caixa | 1.1.2 Recebíveis |
| Depósito em carteira (`postWalletDeposit`) | 1.1.1 Caixa | 2.1.1 Adiantamentos |
| Uso de carteira (`postWalletUsage`) | 2.1.1 Adiantamentos | 4.1.1 Receita |
| Venda de pacote (`postPackageSale`) | 1.1.1 ou 1.1.2 | 2.1.1 Adiantamentos |
| Uso de crédito de pacote (`postPackageCreditUsage`) | 2.1.1 Adiantamentos | 4.1.2 Receita Pacote |
| Despesa (`postExpense`) | 5.1.1 Despesas | 1.1.1 Caixa |
| Estorno (`postReversal`) | Inverte todas as linhas | do lançamento original |

### Regras contábeis
- Todo lançamento deve ter `débitos = créditos` (validado em `createJournalEntry`)
- Estornos: criam lançamento espelho + marcam original como `reversed`
- Receita só é reconhecida **no consumo** do crédito/sessão (competência), não no pagamento antecipado
- `getAccountingTotals()` — soma por período (para DRE e KPIs mensais)
- `getAccountingBalances()` — soma total (para Contas a Receber e Adiantamentos)
- Todas as contas são auto-criadas por clínica na primeira escrituração (`ensureSystemAccounts`)

---

## Módulo Financeiro (Aba Lançamentos)

### Funcionalidades implementadas

| Funcionalidade | Status |
|---|---|
| KPIs mensais (receita, despesa, lucro, ticket médio) | ✅ |
| MRR + assinaturas ativas | ✅ |
| Gráfico de receita por categoria (donut) | ✅ |
| Tabela de lançamentos com filtro por tipo | ✅ |
| Criação de lançamento com status, vencimento e forma de pagamento | ✅ |
| Edição completa de lançamento (modal) | ✅ |
| Exclusão / estorno de lançamento | ✅ |
| Destaque de inadimplência com aging (dias em atraso) | ✅ |
| Coluna de forma de pagamento na tabela | ✅ |
| Billing automático de assinaturas | ✅ |
| Vencimento automático de pacotes (`expiryDate` via `validityDays`) | ✅ |
| Alerta de vencimento próximo/expirado no prontuário | ✅ |
| Fatura consolidada mensal (`faturaConsolidada`) | ✅ |
| Carteira de crédito em R$ por paciente | ✅ |
| Aba Custo por Procedimento | ✅ |
| Aba Orçado vs Realizado | ✅ |
| Aba DRE Mensal | ✅ |
| Aba Despesas Fixas (CRUD) | ✅ |

---


## Roadmap de Integrações de Pagamento R$ (Mercado Brasileiro)

### Por que o sistema atual é webhook-ready

O schema já tem tudo que os gateways precisam para integração:
- `financial_records.paymentMethod` → suporta "Pix", "Boleto", "Cartão de Crédito" etc.
- `financial_records.transactionType` → rastreia origem do pagamento
- `accounting_journal_entries` + `accounting_journal_lines` → double-entry ledger pronto para reconciliação automática
- `patient_packages.nextBillingDate` → sincroniza com cobrança recorrente do gateway (mensalidades)
- `billing_run_logs` → log de execuções de billing para auditoria

### Gateways recomendados por caso de uso

#### 1. Asaas (Recomendado Principal)
- **Ideal para:** Régua de cobrança automática, Pix, Boleto, Cartão, Assinatura
- **Diferenciais:** PIX com QR code automático, cobranças recorrentes, envio por WhatsApp/SMS/e-mail, webhook de confirmação
- **Integração:** REST API + webhooks → ao receber `PAYMENT_RECEIVED`, fazer `PATCH /api/financial/records/:id/status` para `pago`
- **Taxa:** A partir de 1,99% no cartão; Boleto R$1,99; PIX 0,99% (mín. R$0,01)
- **Endpoint de integração sugerido:** `POST /api/webhooks/asaas`

#### 2. Efí Bank (Gerencianet)
- **Ideal para:** PIX API (Pix cobrança, Pix dinâmico), Split de pagamento
- **Diferenciais:** PIX nativo com Open Finance; certificado mTLS necessário; Split nativo para repasse a profissionais
- **Integração:** API PIX + Webhook `pix.received` → atualiza `financial_records`
- **Taxa:** PIX 0,9% (mín. R$0,01); Boleto R$1,49; Cartão 2,49%

#### 3. Stripe (Cartão internacional + assinaturas)
- **Ideal para:** Clínicas com pacientes internacionais ou cobrança de SaaS em USD/EUR
- **Diferenciais:** Melhor API para assinaturas recorrentes; portais de cliente self-service
- **Limitação:** Boleto não nativo (necessita Stripe Boleto beta); PIX não suportado
- **Taxa:** 2,9% + R$0,30 por transação; 0,5% para assinaturas

#### 4. Mercado Pago
- **Ideal para:** Clínicas menores que querem setup simples
- **Diferenciais:** Point (maquininha física), QR Code PIX, alta confiança do consumidor
- **Limitação:** Webhook menos confiável; taxas mais altas para recorrência
- **Taxa:** 2,99% no cartão; PIX grátis para PF (cobrado para PJ)

### Plano de integração sugerido (ordem de prioridade)

```
Fase 1 — PIX manual assistido (0 código novo necessário)
├── Já implementado: campos paymentMethod="Pix" + paymentDate no PATCH /records/:id/status
└── Clínica registra o PIX recebido manualmente → ledger atualizado automaticamente

Fase 2 — Régua de cobrança (Asaas webhook)
├── Criar artifacts/api-server/src/routes/webhooks/asaas.ts
├── Ao criar financial_record pendente: chamar Asaas API para emitir cobrança (Pix/Boleto)
├── Asaas envia webhook PAYMENT_RECEIVED → PATCH /records/:id/status pago
└── Criar tabela gateway_charges (id, financialRecordId, gatewayId, externalId, status)

Fase 3 — PIX dinâmico (Efí)
├── Endpoint POST /api/financial/patients/:id/pix-charge → gera QR code dinâmico
├── Webhook pix.received → PATCH /records/:id/status pago
└── Salvar txid em gateway_charges.externalId

Fase 4 — Assinatura via gateway (Asaas/Stripe)
├── Sincronizar patient_packages (recorrentes) com assinatura do gateway
├── Gateway dispara cobrança mensal → webhook cria financial_record automaticamente
└── Eliminar billing scheduler manual (billingService.ts)
```

### Variáveis de ambiente necessárias (quando integrar)

| Variável | Gateway | Descrição | Status |
|---|---|---|---|
| `ASAAS_API_KEY` | Asaas | Chave de API (sandbox: `$aact_*`) | ✅ configurada (Sprint 7.2) |
| `ASAAS_WEBHOOK_TOKEN` | Asaas | Token de validação de webhooks | ✅ configurada (Sprint 7.2) |
| `ASAAS_BASE_URL` | Asaas | URL base; vazio = produção; `https://sandbox.asaas.com/api/v3` para testes | opcional |
| `EFI_CLIENT_ID` | Efí | Client ID OAuth | pendente |
| `EFI_CLIENT_SECRET` | Efí | Client Secret OAuth | pendente |
| `EFI_PIX_KEY` | Efí | Chave PIX da conta da clínica | pendente |
| `STRIPE_SECRET_KEY` | Stripe | Secret key (`sk_live_*`) | pendente |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Signing secret para webhooks | pendente |

---

<a id="saas-billing-asaas"></a>
## SaaS Billing — Asaas (Sprint 7.2 + 7.4) ✅

A cobrança da mensalidade da própria FisioGest Pro (clínica → plataforma) é
processada pelo gateway **Asaas** via cartão recorrente em checkout hospedado.
A cobrança ao paciente continua manual (Sprint 7.1/7.3 adiados).

### Fluxo end-to-end

1. **Admin da clínica** acessa Configurações → Plano e clica em "Pagar com cartão".
2. Backend (`POST /api/saas-billing/subscribe`) cria customer + subscription no Asaas e devolve `checkoutUrl`. Marca `clinic_subscriptions.billingMode = 'asaas_card'` e salva `asaas_customer_id`, `asaas_subscription_id`, `asaas_checkout_url`.
3. Cliente conclui o pagamento no domínio do Asaas (PCI-compliant — não tocamos no número do cartão).
4. Asaas envia webhooks para `POST /api/webhooks/asaas` autenticados via header `asaas-access-token` (comparação constant-time contra `ASAAS_WEBHOOK_TOKEN`).
5. Eventos são gravados em `asaas_webhook_events` com `UNIQUE(event_id)` → idempotência absoluta (retry do gateway é descartado).
6. `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `applyPaymentToSubscription()` rola o período +30 dias e marca `paymentStatus = 'paid'`.
7. `PAYMENT_OVERDUE` → marca `paymentStatus = 'overdue'`. O scheduler diário (`subscriptionCheck`) suspende após 7 dias de grace.
8. `SUBSCRIPTION_DELETED` → limpa os campos Asaas e volta a clínica para `billingMode = 'manual'`.

### Painel "Inadimplência" (superadmin)

`pages/saas/superadmin` → aba **Inadimplência** lista clínicas com `paymentStatus ∈ {overdue, expired, suspended}` e mostra os últimos 30 eventos do gateway com resultado (`applied` / `duplicate` / `no_match` / `error`). Ações disponíveis por linha:

- **Reenviar lembrete** (`POST /api/saas-billing/clinic-subscriptions/:clinicId/remind`) → dispara dunning via gateway.
- **Cancelar cobrança** (`POST /api/saas-billing/clinic-subscriptions/:clinicId/cancel`) → encerra subscription no Asaas e volta para manual.
- **Abrir checkout** → link externo direto para o Asaas.

### Configuração no painel do Asaas

1. Em **Integrações** → gere uma chave de API e salve como `ASAAS_API_KEY`.
2. Em **Notificações → Webhooks** → cadastre `https://<seu-dominio>/api/webhooks/asaas` com:
   - **Token de autenticação:** mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - **Eventos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `SUBSCRIPTION_DELETED`
3. Para testar use sandbox: defina `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3` e cartão de teste `5162306219378829` / 12/2030 / CVV 123.

### Tabelas envolvidas

- `clinic_subscriptions` (estendida): `asaas_customer_id`, `asaas_subscription_id`, `asaas_checkout_url`, `billing_mode`
- `asaas_webhook_events` (nova): `event_id` UNIQUE, `event_type`, `payload`, `result`, `error_msg`, `related_clinic_id`, `created_at`, `processed_at`

### Arquivos-chave

- `lib/asaas/{client,types,index}.ts` — cliente HTTP com timeout + retry
- `modules/saas/billing/{billing.routes,billing.service,billing.schemas}.ts`
- `modules/webhooks/{asaas,webhooks}.routes.ts`
- `modules/saas/subscriptions/subscription.service.ts` — scheduler pula renovação/overdue para clínicas em `asaas_card` (gateway é a fonte de verdade)
- `pages/settings/plano-section.tsx` (UI clínica)
- `pages/saas/superadmin/components/InadimplenciaTab.tsx` (UI superadmin)

---

