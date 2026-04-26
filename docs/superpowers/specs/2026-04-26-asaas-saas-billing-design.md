# Sprint 7 (escopo SaaS) — Cobrança automática via Asaas + Painel de inadimplência

**Data:** 26/04/2026
**Sprint:** 7 (itens 7.2 e 7.4 — escopo SaaS, paciente fica para Sprint 7B)
**Gateway escolhido:** Asaas
**Método:** Cartão de crédito recorrente via Subscription API nativa
**Captura de cartão:** Checkout hospedado do Asaas (zero PCI no nosso lado)
**Régua de cobrança:** Notificações nativas do Asaas + painel próprio de inadimplência

---

## 1. Objetivo

Substituir o registro manual de pagamento da mensalidade SaaS (`createPayment` chamado por superadmin) por cobrança automática via Asaas, com:

1. Tela onde a clínica ativa pagamento automático e abre o checkout do Asaas para cadastrar cartão.
2. Webhook que recebe eventos Asaas e atualiza `clinic_subscriptions` automaticamente.
3. Painel de inadimplência no superadmin com filtros, dias em atraso e ação de reenvio de cobrança.
4. Compatibilidade total com as clínicas existentes em modo manual (legado).

## 2. Decisões e justificativa

| Decisão | Alternativa descartada | Razão |
|---|---|---|
| Asaas | Mercado Pago / Stripe / Efí | Melhor cobertura PIX+Boleto+Cartão+régua nativa para mercado BR; já documentado em `docs/financial.md` |
| Subscription API nativa do Asaas | Cobrança avulsa criada por nós | Asaas vira responsável pelo agendamento e retry; menos código de scheduler |
| Cartão recorrente | Híbrido com PIX/Boleto manual | Maior automação; mensalidade SaaS é caso ideal para cartão (pequeno valor, recorrente, baixa fricção depois do setup) |
| Checkout hospedado | Tokenização embutida | Zero PCI no nosso lado; saída do app por ~30s é aceitável para fluxo de configuração feito 1x |
| Régua nativa Asaas | Régua interna (templates nossos) | Asaas envia e-mail+SMS automáticos sem código nosso; basta o painel de visualização |

## 3. Fora de escopo

- Cobrança de paciente via Asaas (itens 7.1/7.3 — Sprint 7B futura).
- Boleto/PIX como método SaaS (só cartão por ora).
- Tokenização embutida (UI nossa de cartão).
- Dunning customizado por nós (Asaas faz nativo).
- Cobrança ao final do trial automática — clínica clica "Ativar" quando quiser.

## 4. Schema (mudanças Drizzle)

### 4.1 `clinic_subscriptions` (extensão)

```ts
asaasCustomerId      varchar(50)         // ID do customer no Asaas
asaasSubscriptionId  varchar(50)         // ID da subscription no Asaas
asaasCheckoutUrl     text                // URL do último invoice/checkout
billingMode          varchar(20) DEFAULT 'manual'   // 'automatic' | 'manual'
```

Justificativa de não criar tabela separada: relacionamento 1:1, dados pequenos, evita `JOIN` em todos os lookups.

### 4.2 `asaas_webhook_events` (nova)

```ts
id              serial PK
eventId         varchar(100) UNIQUE NOT NULL   // dedup (idempotência)
eventType       varchar(50)         NOT NULL
payload         jsonb               NOT NULL
relatedClinicId integer
result          varchar(20)         NOT NULL   // 'ok' | 'ignored' | 'error'
errorMsg        text
processedAt     timestamp
createdAt       timestamp DEFAULT now() NOT NULL
```

Índices: `UNIQUE(eventId)`, `INDEX(eventType, createdAt)`, `INDEX(relatedClinicId)`.

## 5. Backend

### 5.1 Cliente Asaas — `artifacts/api-server/src/lib/asaas/`

- `client.ts` — wrapper fetch:
  - Lê `ASAAS_API_KEY` e `ASAAS_BASE_URL` do env (default sandbox).
  - Headers: `access_token`, `Content-Type: application/json`.
  - Timeout 10s, retry 1x em 5xx.
  - Métodos: `customers.create/update/get`, `subscriptions.create/cancel/get/listPayments`, `payments.get/refund`.
- `types.ts` — tipos TypeScript dos objetos do Asaas.
- `events.ts` — tipos dos webhook events (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_CYCLE_REMOVED`).

### 5.2 Módulo billing — `modules/saas/billing/`

- `billing.routes.ts`:
  - `POST /api/saas/billing/checkout` (auth) → cria/retoma Customer+Subscription Asaas, retorna `{ checkoutUrl }`.
  - `GET /api/saas/billing/status` (auth) → estado atual: `{ asaasSubscriptionId, billingMode, lastPaymentAt, nextDueDate, hasCardOnFile }`.
  - `POST /api/saas/billing/cancel` (auth, admin clínica) → cancela no Asaas + marca `billingMode='manual'`, status local cai pra cancelled.
  - `POST /api/saas/billing/admin/resend/:clinicId` (superadmin) → POST Asaas para reenviar cobrança vencida.
- `billing.service.ts` — lógica + integração com `subscriptionService.applyPaymentToSubscription`.
- `billing.schemas.ts` — zod schemas.

### 5.3 Webhook — `modules/webhooks/asaas.routes.ts`

- `POST /api/webhooks/asaas` (PUBLIC, sem auth de cookie):
  1. Lê header `asaas-access-token`, compara com `ASAAS_WEBHOOK_TOKEN` (constant-time). Se inválido → 401.
  2. Insere em `asaas_webhook_events` com `eventId` único. Se conflito → 200 (já processado).
  3. Despacha por `event`:
     - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → encontra `clinic_subscriptions` por `asaasSubscriptionId` → `applyPaymentToSubscription`.
     - `PAYMENT_OVERDUE` → marca `paymentStatus='overdue'`.
     - `PAYMENT_REFUNDED` → marca `paymentStatus='refunded'`, log audit.
     - `SUBSCRIPTION_CYCLE_REMOVED` / `SUBSCRIPTION_DELETED` → `billingMode='manual'`, `cancelledAt=now`.
     - Outros → result='ignored'.
  4. Retorna 200 sempre (Asaas faz retry só em não-2xx). Erros gravam em `result='error'` + `errorMsg`.

### 5.4 Adaptação do `subscription.job.ts`

- Job continua rodando, mas no início filtra `billingMode = 'manual'` para os passos 2-3 (renovação/marcação overdue) — Asaas é fonte de verdade pros automáticos.
- Passo 4 (suspensão por exceder grace period) continua para todos como rede de segurança.

### 5.5 Variáveis de ambiente

| Var | Tipo | Default | Origem |
|---|---|---|---|
| `ASAAS_API_KEY` | secret | — | painel.sandbox.asaas.com → Configurações → Integrações |
| `ASAAS_BASE_URL` | env shared | `https://sandbox.asaas.com/api/v3` | manual (alterna para `https://api.asaas.com/v3` em prod) |
| `ASAAS_WEBHOOK_TOKEN` | secret | — | string aleatória definida no painel Asaas → Webhooks |

## 6. Frontend

### 6.1 `pages/settings/configuracoes/components/AssinaturaSection.tsx`

Aba nova em `/configuracoes#assinatura`:

- Card de status: plano atual, valor, próxima cobrança, dias até vencimento.
- Badge de `paymentStatus` colorido (active=verde, trial=âmbar, overdue=vermelho, suspended=cinza).
- Botão **Ativar pagamento automático** (visível se `billingMode='manual'`):
  1. POST `/api/saas/billing/checkout`
  2. Recebe `checkoutUrl`
  3. `window.open(url, '_blank')` ou redirect com `successUrl/failureUrl` apontando pra `/configuracoes#assinatura?asaas=ok`
- Botão **Atualizar cartão** (visível se `billingMode='automatic'`): mesmo endpoint, abre novo checkout.
- Botão **Cancelar assinatura** com `Dialog` de confirmação.
- Toast com Sonner em sucesso/erro.

### 6.2 `pages/saas/superadmin/components/InadimplenciaTab.tsx`

Nova aba "Inadimplência" no superadmin (`/superadmin?tab=inadimplencia`):

- Tabela (já com responsividade mobile via lista de cards `sm:hidden`):
  - Colunas: Clínica + e-mail, Plano, Valor, Vencimento, **Dias em atraso** (badge crescente), Modo (cartão/manual), Ações.
- Filtros (top): atraso (5+ / 15+ / 30+ dias), status (overdue/suspended), modo (cartão/manual).
- Ações: **Reenviar cobrança** (POST admin/resend), **Suspender agora** (PATCH status), **Liberação manual** (PATCH paymentStatus='free' com motivo + audit).
- Paginação cursor-based (Sprint 2.1).

### 6.3 Hooks gerados

Os endpoints novos vão pra `lib/api-client-react` via Orval — basta rodar a geração existente (não precisa configurar novo client).

## 7. Idempotência e segurança

- **Webhook**: validação token constante-time + dedup por `eventId` em DB com `UNIQUE`.
- **Cliente Asaas**: timeout, retry, log de `request_id`.
- **Sem dados de cartão no nosso DB** — Asaas guarda; nós só salvamos `asaasCustomerId/asaasSubscriptionId`.
- **Audit log**: todas as ações superadmin (resend, suspend manual, liberação) entram em `audit-log` existente.
- **Rate limit**: webhook usa `PgRateLimitStore` (Sprint 3.4) com limite 60 req/min por IP.

## 8. Testes

- **Vitest unit** (`billing.service.test.ts`):
  - createCheckout cria Customer e Subscription corretos.
  - cancel chama Asaas e atualiza local.
- **Vitest unit** (`asaas.routes.test.ts`):
  - Webhook sem token → 401.
  - Webhook com eventId duplicado → 200 sem efeito.
  - PAYMENT_CONFIRMED → applyPaymentToSubscription chamado.
  - SUBSCRIPTION_DELETED → billingMode volta pra manual.
- **Manual (sandbox)**:
  1. Criar conta sandbox.asaas.com, obter API key.
  2. Configurar webhook apontando pra `https://<replit-domain>/api/webhooks/asaas` com token.
  3. Ativar pagamento automático na clínica de teste.
  4. Cartão de teste Mastercard sandbox: `5162306219378829`, qualquer CVV, exp futura.
  5. Avançar relógio do Asaas (botão "Confirmar pagamento" no painel sandbox) → conferir webhook recebido + `paidAt` preenchido + período avançado.

## 9. Ordem de implementação

1. Schema migration + push (`db:push`).
2. Cliente Asaas (`lib/asaas/`) + tipos.
3. Webhook handler + dedup.
4. Endpoints `/api/saas/billing/*`.
5. Adaptação do `subscription.job.ts`.
6. Frontend `AssinaturaSection`.
7. Frontend `InadimplenciaTab`.
8. Testes Vitest.
9. Atualizar `docs/changelog.md`, `docs/sprints.md` (marcar 7.2 e 7.4 ✅), `docs/financial.md`.

## 10. Critérios de aceitação

- [ ] Migration aplicada sem perda de dados; clínicas existentes em `billingMode='manual'`.
- [ ] Clínica consegue ativar cartão e completar pagamento sandbox; webhook atualiza local.
- [ ] Mês seguinte: cobrança recorrente automática + webhook → `paidAt` atualizado.
- [ ] Cancelamento volta para `billingMode='manual'`; assinatura local segue ativa até fim do período pago.
- [ ] Painel superadmin lista clínicas overdue corretamente, com filtros funcionando.
- [ ] Reenvio de cobrança via painel funciona em sandbox.
- [ ] Testes Vitest passando (cobertura ≥80% do módulo billing).
- [ ] Logs sanitizados: nenhum dado de cartão / token completo aparece no console.
