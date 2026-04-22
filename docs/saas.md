## Controle de Assinaturas SaaS (Superadmin)

### Arquitetura
- **Schema**: `subscription_plans` + `clinic_subscriptions` (`lib/db/src/schema/saas-plans.ts`)
- **Middleware de bloqueio**: `artifacts/api-server/src/middleware/subscription.ts`
  - `requireActiveSubscription()` — bloqueia clinicas com status `suspended` ou `cancelled` (HTTP 403 com `subscriptionBlocked: true`)
  - `getPlanLimits(clinicId)` — retorna limites do plano para enforcement
- **Serviço**: `artifacts/api-server/src/services/subscriptionService.ts`
  - `runSubscriptionCheck()` — detecta trials expirados, marca `overdue`, suspende após 7 dias de carência

### Limites enforçados automaticamente
| Recurso | Onde verificado | Campo do plano |
|---|---|---|
| Pacientes | `POST /api/patients` | `maxPatients` |
| Usuários | `POST /api/users` | `maxUsers` |
| Agendas | `POST /api/schedules` | `maxSchedules` |

### Endpoints adicionados
| Método | Caminho | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/clinic-subscriptions/mine/limits` | Clínica autenticada | Uso atual + limites do plano |
| `POST` | `/api/clinic-subscriptions/run-check` | Superadmin | Executa verificação manual de assinaturas |
| `GET` | `/api/admin/clinics` | Superadmin | Todas as clínicas com plano e assinatura |

### Fluxo de status das assinaturas
```
trial (ativo) → trial expirado → active/overdue → suspended (após 7 dias de carência)
                                                 ↑ ou ↓ (superadmin pode reativar)
```

### Banner de aviso no frontend
- `app-layout.tsx` — exibe banner contextual conforme status:
  - 🟡 Trial expira em ≤7 dias → aviso amarelo
  - 🟠 Pagamento em atraso → aviso laranja
  - 🔴 Suspenso/Cancelado → banner vermelho persistente (sem dismiss)

### Painel Superadmin
- **Painel**: KPIs + botão "Verificar Assinaturas" manual
- **Planos**: CRUD de planos com limites e features
- **Assinaturas**: lista de todas as clínicas com ações rápidas (Ativar, Suspender, Pago, Reativar)
- **Clínicas**: visão completa de todas as clínicas, seus planos e status — com busca e verificação manual
- **Pagamentos**: histórico completo de pagamentos com KPIs, busca, registro manual e exclusão

### Sistema de Cupons (`coupons` + `coupon_uses`)

Tabelas: `coupons` (id, code unique, type discount/referral, discountType percent/fixed, discountValue, maxUses, usedCount, expiresAt, isActive, applicablePlanNames jsonb, referrerClinicId, referrerBenefitType/Value, createdBy, notes) + `coupon_uses` (id, couponId, clinicId, subscriptionId, discountApplied, extraTrialDays)

| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/api/coupon-codes/validate` | POST | Público | Valida código antes do registro |
| `/api/coupon-codes` | GET | Superadmin | Lista todos os cupons |
| `/api/coupon-codes` | POST | Superadmin | Cria cupom |
| `/api/coupon-codes/:id` | PUT | Superadmin | Atualiza cupom |
| `/api/coupon-codes/:id` | DELETE | Superadmin | Remove/desativa cupom |

**Fluxo de aplicação:**
1. Usuário acessa `/register?cupom=CODIGO&plano=profissional`
2. Campo de cupom é pré-preenchido + validado automaticamente via `POST /coupon-codes/validate`
3. Desconto mostrado em tempo real no card do plano (preço original riscado + novo preço)
4. No registro: desconto aplicado na `amount` da assinatura + dias de trial adicionais proporcionais
5. Uso registrado em `coupon_uses`, `usedCount` incrementado

**Link de indicação:** `https://<domínio>/register?cupom=<CODIGO>&plano=<plano>`

**Superadmin:** Nova aba "Cupons" com CRUD completo, KPIs, toggle ativo/inativo, cópia de link com 1 clique.

### Histórico de Pagamentos (`clinic_payment_history`)
Tabela: `id`, `clinic_id`, `subscription_id`, `amount`, `method`, `reference_month`, `paid_at`, `notes`, `recorded_by`, `created_at`

Métodos aceitos: `manual`, `pix`, `credit_card`, `boleto`, `transfer`, `other`

| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/api/payment-history` | GET | Superadmin | Todos os pagamentos com joins |
| `/api/payment-history/stats` | GET | Superadmin | KPIs: total mês, total geral, contagem |
| `/api/payment-history/clinic/:id` | GET | Superadmin | Pagamentos de uma clínica específica |
| `/api/payment-history` | POST | Superadmin | Registra pagamento + opcionalmente atualiza `paymentStatus` da assinatura para `paid` |
| `/api/payment-history/:id` | DELETE | Superadmin | Remove um registro de pagamento |

---

