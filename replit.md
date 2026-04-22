# FisioGest Pro

## Visão Geral

FisioGest Pro é uma plataforma SaaS de gestão clínica completa para fisioterapeutas, estetas e instrutores de pilates. Abrange prontuário eletrônico, agenda, financeiro, relatórios e conformidade com normas do COFFITO.

### Landing Page & Rotas Públicas
- `/` → Landing page pública (`artifacts/fisiogest/src/pages/landing.tsx`) — hero dark, features, pricing, testimonials, CTA
- `/login` → Login
- `/register` → Cadastro
- `/dashboard` → Dashboard protegido (rota principal pós-login)
- Após login bem-sucedido: redireciona para `/dashboard` (configurado em `auth-context.tsx`)
- Superadmin após login: redireciona para `/superadmin`
- `/usuarios` e `/agendas` → redirecionam para `/configuracoes#usuarios` e `/configuracoes#agendas`

> **Convenção de importação:** sempre importar `useAuth` de `@/lib/use-auth`. O `auth-context.tsx` exporta apenas `AuthProvider` e `AuthContext`.

O projeto é um **monorepo pnpm** hospedado no Replit. Dividido em três artefatos (frontend + API + mockup-sandbox) servidos pelo proxy reverso compartilhado do Replit na porta 80.

**Idioma padrão**: Português do Brasil (pt-BR)
**Moeda**: Real Brasileiro (BRL — R$)
**Medidas**: Sistema Internacional (SI) — kg, cm, °C
**Formato de data**: dd/MM/yyyy (ex.: 18/03/2026)
**Formato de hora**: HH:mm — 24 horas (ex.: 14:30)
**Separador decimal**: vírgula (ex.: R$ 1.250,00)
**Separador de milhar**: ponto (ex.: 1.250)
**Fuso horário padrão**: America/Sao_Paulo (UTC-3 / UTC-2 no horário de verão)

> **Importante (backend):** Nunca usar `new Date().toISOString()` ou `new Date().getMonth()` para cálculos de negócio. Sempre usar as funções em `artifacts/api-server/src/lib/dateUtils.ts`:
> - `todayBRT()` → string "YYYY-MM-DD" no fuso de Brasília
> - `nowBRT()` → `{ year, month, day }` no fuso de Brasília
> - `monthDateRangeBRT(year, month)` → `{ startDate, endDate }` de um mês

---

## Stack Técnica

- **Node.js**: 22 (requer 20+ para o Vite 7)
- **Gerenciador de pacotes**: pnpm 10.26 (workspace)
- **TypeScript**: 5.9
- **Frontend** (`artifacts/fisiogest`): React 19 + Vite 7 + TailwindCSS v4 + shadcn/ui (new-york)
- **Backend** (`artifacts/api-server`): Express 5
- **Banco de dados**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validação**: Zod v4, drizzle-zod (`lib/api-zod`)
- **API client**: hooks React Query gerados pelo Orval (`lib/api-client-react`)
- **Autenticação**: JWT (jsonwebtoken) + bcryptjs
- **Autorização**: RBAC com tabelas `user_roles`, `roles_permissions`; roles: admin, profissional, secretaria
- **Gráficos**: Recharts
- **Ícones**: Lucide React

### Scheduler (jobs em background)

| Job | Expressão CRON | Horário BRT | Função |
|---|---|---|---|
| Billing automático | `0 9 * * *` | 06:00 | `runBilling()` — cobranças recorrentes mensais com tolerância de 3 dias |
| Fatura consolidada | `5 9 * * *` | 06:05 | `runConsolidatedBilling()` — gera faturas mensais únicas para assinaturas tipo `faturaConsolidada` |
| Auto-confirmação | `*/15 * * * *` | a cada 15 min | `runAutoConfirmPolicies()` — confirma agendamentos dentro da janela configurada |
| Fechamento do dia | `0 22 * * *` | 22:00 | `runEndOfDayPolicies()` — no-show + taxa de ausência + auto-conclusão |
| Verificação de assinaturas | `0 10 * * *` | 07:00 | `runSubscriptionCheck()` — trials expirados → overdue, suspende inadimplentes após 7 dias de carência |

> O fechamento do dia só processa agendamentos do **dia corrente** para garantir tempo de ajustes manuais durante o expediente.
> Implementado em `artifacts/api-server/src/scheduler.ts` + `services/policyService.ts`.

### Pacotes, mensalidades e fatura consolidada
- Tipos de pacote: `sessoes`, `mensal`, `faturaConsolidada`.
- Pacotes por sessão criam créditos em `session_credits` vinculados ao `patient_package_id`; o consumo de consulta usa `session_credits` e atualiza `patient_packages.used_sessions` junto.
- Mensalidades criam assinatura `patient_subscriptions` e geram créditos quando a cobrança mensal é marcada como paga. A quantidade padrão é `sessions_per_week * 4`.
- `absence_credit_limit` limita quantos créditos de ausência/cancelamento podem ser gerados por mês em pacotes mensais. Limite `0` bloqueia créditos automáticos.
- `next_billing_date` é preenchido na criação de assinaturas, tanto pela contratação de pacote quanto pela criação direta de assinatura.
- Fatura consolidada é um produto real na UI: atendimentos concluídos geram lançamentos `pendenteFatura`, e o job mensal cria uma única `faturaConsolidada`.
- O financeiro usa ledger contábil formal por partidas dobradas (`accounting_accounts`, `accounting_journal_entries`, `accounting_journal_lines`, `receivable_allocations`) como fonte de verdade para caixa, receita por competência, contas a receber, adiantamentos e DRE.
- `financial_records` permanece como camada operacional/compatibilidade e guarda vínculos `accounting_entry_id`, `recognized_entry_id` e `settlement_entry_id`.
- Depósitos em carteira e vendas antecipadas de pacote entram como caixa + adiantamento de cliente; receita só é reconhecida no uso da carteira ou consumo do crédito/sessão.
- `faturaConsolidada` funciona como agrupador/cobrança oficial; a receita de competência é reconhecida pelos atendimentos/itens, sem duplicar no fechamento da fatura.
- Pagamentos manuais baixam títulos existentes via `receivable_allocations`; quando não há título pendente, viram recebimento direto.

---

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

## Padrões de Localização (pt-BR)

| Contexto | Padrão | Exemplo |
|---|---|---|
| Idioma do HTML | `lang="pt-BR"` | `<html lang="pt-BR">` |
| Formatação de datas | `date-fns/locale/ptBR` | `dd/MM/yyyy` |
| Calendário | `locale="pt-BR"` | mês curto: "jan", "fev"... |
| Moeda | `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` | R$ 1.250,00 |
| Números | `toLocaleString("pt-BR")` | 1.250,5 |
| Peso | quilogramas (kg) | 72 kg |
| Altura | centímetros (cm) | 175 cm |
| Temperatura corporal | graus Celsius (°C) | 36,5 °C |
| Pressão arterial | mmHg | 120/80 mmHg |
| Dor (escala EVA) | 0–10 | EVA 7/10 |

---

## Design System — Padrões de UI

Convenções visuais estabelecidas e aplicadas nas páginas principais.

### KpiCard (padrão de cartão de KPI)
Todas as páginas usam o mesmo sistema de cards com barra lateral colorida:
- `relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden`
- Barra esquerda: `absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl` com `backgroundColor: accentColor`
- Ícone: `p-2 rounded-xl` com fundo `${accentColor}18` (18% opacidade) e cor do ícone igual ao accent
- Rótulo: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`
- Valor: `text-2xl font-extrabold text-slate-900 tabular-nums`

### Semântica de cores (accentColor)
| Cor | Hex | Uso |
|---|---|---|
| Verde esmeralda | `#10b981` | Receita, positivo, concluído |
| Vermelho | `#ef4444` | Despesas, negativo, cancelado |
| Índigo | `#6366f1` | Lucro, métrica principal |
| Âmbar | `#f59e0b` | Avisos, pendências, faltas |
| Céu | `#0ea5e9` | Agendamentos, info |
| Violeta | `#8b5cf6` | Métricas secundárias |

### Seletor de período (pattern)
```tsx
<div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200">
  <CalendarDays className="w-4 h-4 text-slate-400" />
  <Select>...</Select>
  <div className="h-4 w-px bg-slate-200" />
  <Select>...</Select>
</div>
```

### Tabelas
- Header: `bg-slate-50/80 border-b border-slate-100`
- Rótulo header: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`
- Linhas: `border-b border-slate-50 hover:bg-slate-50/60`
- Moeda: `tabular-nums font-semibold text-emerald-600`
- Footer: `bg-slate-50 border-t-2 border-slate-200`

### Badges de status de agendamento
```tsx
const STATUS_CONFIG = {
  agendado:  { dot: "bg-blue-400",   text: "text-blue-700",   bg: "bg-blue-50"   },
  confirmado:{ dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"  },
  concluido: { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100" },
  cancelado: { dot: "bg-red-400",    text: "text-red-700",    bg: "bg-red-50"    },
  faltou:    { dot: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
}
```
Formato: `inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full`

### Badges de status financeiro
```tsx
const STATUS_FINANCEIRO = {
  pago:      { dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50" },
  pendente:  { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50"   },
  estornado: { dot: "bg-red-400",     text: "text-red-600",     bg: "bg-red-50"     },
  cancelado: { dot: "bg-slate-300",   text: "text-slate-500",   bg: "bg-slate-50"   },
  // Inadimplente (pendente + dueDate < hoje):
  vencido:   { dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50"     },
  // Badge: "Vencido há Xd" — linha da tabela com bg-red-50/30
}
```

### Estados de carregamento
- **Nunca usar spinners centralizados** (`Loader2`, `animate-spin`)
- Sempre usar skeleton: `animate-pulse` com divs de `bg-slate-100` nas dimensões esperadas
- Skeletons de tabela: simular estrutura de linhas idêntica à tabela real
- Skeletons de KpiCard: dois divs (`h-7 w-28` para valor, `h-3 w-16` para sub)

### Estados vazios
- Container centralizado com ícone em `bg-slate-100 rounded-2xl w-12 h-12`
- Título em `text-sm font-semibold text-slate-500`
- Descrição em `text-xs text-slate-400 mt-1`
- CTA opcional com `Button size="sm" variant="outline" rounded-xl`

### Páginas já redesenhadas
- `financial/index.tsx` — KpiCards, abas pill, tabela de transações com aging, DRE
- `relatorios.tsx` — KpiCards duplos (anual/mensal), charts limpos, tabela de procedimentos
- `dashboard.tsx` — KpiCards, greeting, status badges Tailwind, skeleton loading, booking portal compacto
- `patients/index.tsx` — stats strip com KpiCards, skeleton de lista

---

## Arquitetura Replit — IMPORTANTE

O Replit usa um **proxy reverso compartilhado na porta 80** para rotear tráfego entre serviços.

| Serviço | Filtro do pacote | Porta local | Caminho proxy |
|---|---|---|---|
| Frontend | `@workspace/fisiogest` | **3000** | `/` |
| API Server | `@workspace/api-server` | **8080** | `/api` |
| Mockup Sandbox | `@workspace/mockup-sandbox` | **8081** | `/__mockup` |

### Artifacts e Workflows

Os três artefatos são gerenciados pelo sistema de artifacts do Replit (cada um tem `.replit-artifact/artifact.toml`):

| Workflow | Comando | Porta | Status |
|---|---|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 | ✅ sempre rodando |
| `artifacts/fisiogest: web` | `pnpm --filter @workspace/fisiogest run dev` | 3000 | ✅ sempre rodando |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` | 8081 | ⏸ sob demanda |

> As variáveis de ambiente (`PORT`, `BASE_PATH`) são injetadas automaticamente pelo sistema de artifacts via `[services.env]` no `artifact.toml` — não precisam constar no comando do workflow.

### Fluxo de requisições em desenvolvimento

```
Browser → https://<repl>.replit.dev/
  ├── /api/*      → Proxy Replit → localhost:8080  (api-server)
  ├── /__mockup/* → Proxy Replit → localhost:8081  (mockup-sandbox)
  └── /*          → Proxy Replit → localhost:3000  (fisiogest Vite dev server)
                      └── /api/* (proxy Vite) → localhost:8080
```

### Deploy no Replit

Para publicar o projeto no Replit (`.replit.app`):
1. Clicar em **Publish** no painel do Replit
2. O sistema faz build automático de cada artifact:
   - Frontend: `pnpm --filter @workspace/fisiogest run build` → `artifacts/fisiogest/dist/public/`
   - API Server: `pnpm --filter @workspace/api-server run build` → `artifacts/api-server/dist/index.cjs`
3. Variáveis de ambiente obrigatórias em produção:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão PostgreSQL |
| `JWT_SECRET` | Chave secreta longa e aleatória |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | URL do domínio publicado |

---

## Estrutura do Projeto

```text
/
├── artifacts/
│   ├── fisiogest/                      # Frontend React (@workspace/fisiogest)
│   │   ├── .replit-artifact/
│   │   │   └── artifact.toml           # kind=web, previewPath=/, port=3000
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── index.css               # Tema TailwindCSS v4 — primary: teal 180°
│   │   │   ├── pages/
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   ├── landing.tsx         # Landing page pública
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── agenda.tsx          # Calendário de agendamentos
│   │   │   │   ├── procedimentos.tsx
│   │   │   │   ├── pacotes.tsx
│   │   │   │   ├── relatorios.tsx
│   │   │   │   ├── clinicas.tsx
│   │   │   │   ├── configuracoes.tsx   # Clínica + Usuários + Agendas (hash navigation)
│   │   │   │   ├── agendar.tsx         # Portal público de agendamento
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── patients/
│   │   │   │   │   ├── index.tsx       # Lista de pacientes + busca
│   │   │   │   │   └── [id].tsx        # Prontuário completo (abas)
│   │   │   │   └── financial/
│   │   │   │       └── index.tsx       # Lançamentos, custos, DRE, despesas fixas
│   │   │   │
│   │   │   │   # Rotas /usuarios e /agendas redirecionam para /configuracoes#{hash}
│   │   │   ├── components/
│   │   │   │   ├── layout/app-layout.tsx
│   │   │   │   ├── error-boundary.tsx
│   │   │   │   ├── logo-mark.tsx       # SVG logo da marca
│   │   │   │   └── ui/                 # Componentes shadcn/ui (+ voice-textarea.tsx)
│   │   │   │       └── voice-textarea.tsx # Textarea com ditado por voz (Web Speech API, pt-BR)
│   │   │   └── lib/
│   │   │       ├── auth-context.tsx    # AuthProvider + AuthContext (sem useAuth)
│   │   │       ├── use-auth.ts         # Hook useAuth() — importar sempre daqui
│   │   │       ├── permissions.ts      # Definição de permissões RBAC
│   │   │       ├── masks.ts            # maskCpf, maskPhone, maskCnpj
│   │   │       └── utils.ts            # cn() e utilitários gerais
│   │   ├── index.html                  # lang="pt-BR"
│   │   └── vite.config.ts              # proxy /api → 8080, port=$PORT, base=$BASE_PATH
│   │
│   ├── api-server/                     # API Express (@workspace/api-server)
│   │   ├── .replit-artifact/
│   │   │   └── artifact.toml           # kind=api, previewPath=/api, port=8080
│   │   └── src/
│   │       ├── index.ts                # Inicializa servidor + aplica migrations automáticas
│   │       ├── app.ts                  # Express app, CORS, middlewares globais
│   │       ├── middleware/
│   │       │   ├── auth.ts             # JWT authMiddleware + generateToken
│   │       │   ├── rbac.ts             # requirePermission()
│   │       │   ├── subscription.ts     # requireActiveSubscription(), getPlanLimits()
│   │       │   └── plan-features.ts    # requireFeature()
│   │       ├── utils/                  # (era lib/) — utilitários internos
│   │       │   ├── dateUtils.ts        # todayBRT(), nowBRT(), monthDateRangeBRT()
│   │       │   ├── auditLog.ts         # logAudit()
│   │       │   ├── validate.ts         # validateBody(), positiveNumber()
│   │       │   └── cloudinary.ts       # deleteCloudinaryAsset(), extractPublicId()
│   │       ├── modules/                # ← Implementação real de todos os domínios
│   │       │   ├── auth/               # /api/auth — login, register, refresh
│   │       │   ├── public/             # /api/public — landing data (sem auth)
│   │       │   ├── dashboard/          # /api/dashboard — KPIs agregados
│   │       │   ├── clinical/
│   │       │   │   ├── patients/           # /api/patients
│   │       │   │   ├── medical-records/    # /api/patients/:id (mergeParams) — módulo completo (5 arquivos)
│   │       │   │   │   ├── medical-records.routes.ts     # Handlers Express (~950L)
│   │       │   │   │   ├── medical-records.schemas.ts    # Zod schemas + type aliases
│   │       │   │   │   ├── medical-records.repository.ts # Funções de query DB
│   │       │   │   │   └── medical-records.service.ts    # buildIndicators() — agregação EVA/corporal
│   │       │   │   ├── schedules/          # /api/schedules
│   │       │   │   ├── blocked-slots/      # /api/blocked-slots
│   │       │   │   ├── patient-journey/    # /api/patients/:id (mergeParams)
│   │       │   │   └── patient-photos/     # /api/patients/:id/photos
│   │       │   ├── appointments/       # /api/appointments — módulo completo (5 arquivos)
│   │       │   │   ├── appointments.routes.ts
│   │       │   │   ├── appointments.service.ts
│   │       │   │   ├── appointments.repository.ts
│   │       │   │   ├── appointments.schemas.ts
│   │       │   │   └── appointments.helpers.ts
│   │       │   ├── catalog/
│   │       │   │   ├── procedures/         # /api/procedures
│   │       │   │   ├── packages/           # /api/packages
│   │       │   │   ├── patient-packages/   # /api/patients/:id/packages
│   │       │   │   └── treatment-plan-procedures/ # /api/treatment-plans/:planId/procedures
│   │       │   ├── financial/          # /api/financial — módulo com padrão 5 arquivos
│   │       │   │   ├── financial.routes.ts          # Handlers Express (~1248L — candidato a split futuro)
│   │       │   │   ├── financial.service.ts         # updateRecordStatusWithAccounting(), applyEstorno()
│   │       │   │   ├── financial.repository.ts      # clinicCond(), assertPatientInClinic(), resolvePackageForSubscription()
│   │       │   │   ├── financial.schemas.ts         # createRecordSchema, updateRecordSchema, etc.
│   │       │   │   ├── recurring-expenses/  # /api/recurring-expenses
│   │       │   │   ├── patient-wallet/      # /api/patients/:id/wallet
│   │       │   │   ├── subscriptions/       # /api/subscriptions
│   │       │   │   └── reports/             # /api/reports
│   │       │   ├── saas/
│   │       │   │   ├── saas-plans/         # /api/subscription-plans, /api/clinic-subscriptions — módulo completo (5 arquivos)
│   │       │   │   │   ├── saas-plans.routes.ts     # Handlers Express (~645L)
│   │       │   │   │   ├── saas-plans.schemas.ts    # planSchema, subscriptionSchema, paymentSchema
│   │       │   │   │   ├── saas-plans.constants.ts  # DEFAULT_PLANS (3 planos padrão)
│   │       │   │   │   ├── saas-plans.repository.ts # listPlans(), getPlanStats(), listPaymentHistory(), etc.
│   │       │   │   │   └── saas-plans.service.ts    # seedDefaultPlans(), applyPaymentToSubscription()
│   │       │   │   └── coupons/            # /api/coupon-codes
│   │       │   └── admin/
│   │       │       ├── clinics/            # /api/clinics
│   │       │       ├── users/              # /api/users
│   │       │       └── audit-log/          # /api/audit-log
│   │       ├── services/               # Serviços de domínio reutilizáveis
│   │       │   ├── billingService.ts
│   │       │   ├── consolidatedBillingService.ts
│   │       │   ├── accountingService.ts
│   │       │   ├── policyService.ts
│   │       │   ├── subscriptionService.ts
│   │       │   └── financialReportsService.ts
│   │       └── routes/                 # ← Thin re-exports apontando para modules/
│   │           ├── index.ts            # Agrega todos os routers (não mudar)
│   │           ├── health.ts           # GET /api/healthz (implementação local)
│   │           ├── storage.ts          # /api/storage (implementação local)
│   │           └── */                  # Todos os outros = 1 linha re-exportando o módulo
│   │
│   └── mockup-sandbox/                 # Sandbox de prototipagem de UI (@workspace/mockup-sandbox)
│       └── .replit-artifact/
│           └── artifact.toml           # kind=design, previewPath=/__mockup, port=8081
│
├── lib/
│   ├── db/                             # @workspace/db — Drizzle ORM + schema
│   │   ├── src/schema/
│   │   │   ├── index.ts                # Re-exporta todos os schemas
│   │   │   ├── patients.ts
│   │   │   ├── appointments.ts
│   │   │   ├── procedures.ts           # Campo maxCapacity (vagas simultâneas)
│   │   │   ├── medical-records.ts
│   │   │   ├── financial.ts
│   │   │   └── users.ts
│   │   ├── src/index.ts               # Exporta db (Drizzle), pool, e todos os schemas
│   │   └── drizzle.config.ts          # Configuração do drizzle-kit
│   ├── api-zod/                        # @workspace/api-zod — schemas Zod compartilhados
│   ├── api-client-react/               # @workspace/api-client-react — hooks React Query (Orval)
│   └── api-spec/                       # Especificação OpenAPI (lib/api-spec/openapi.yaml)
│
├── db/                                 # Migrations SQL geradas pelo drizzle-kit
│   └── migrations/                     # Arquivos SQL versionados (0000_*.sql …)
│
├── scripts/
│   ├── post-merge.sh                   # Roda após merge de task agents
│   ├── seed.ts                         # Seed legado (schema pré-multi-tenant) — usar seed-demo.ts
│   ├── seed-demo.ts                    # Seed completo (novo clinic) — falha se usuários já existem
│   └── seed-financial.ts              # Seed financeiro incremental (usa dados existentes)
│   # Notas: backfillAccounting.ts removido; middlewares/ removido; scripts/src/ removido
│
├── pnpm-workspace.yaml
└── package.json                        # Scripts raiz: build:libs, build, start, typecheck, db:seed-demo
```

---

## Schema do Banco de Dados

Todas as tabelas estão no PostgreSQL provisionado pelo Replit. O schema canônico fica em `lib/db/src/schema/`.

| Tabela | Campos principais |
|---|---|
| `users` | id, email, passwordHash, name, role |
| `clinics` | id, name, cnpj, address, phone, email |
| `patients` | id, clinicId, name, cpf (único), birthDate, phone, email, address, profession, emergencyContact, notes |
| `procedures` | id, name, category, modalidade, durationMinutes, price, cost, **maxCapacity** (default 1), isActive |
| `procedure_costs` | id, procedureId, clinicId, priceOverride, fixedCost, variableCost, notes |
| `appointments` | id, patientId, procedureId, clinicId, scheduleId, date, startTime, **endTime** (calculado), status, notes |
| `schedules` | id, clinicId, type (clinic/professional), name, workingDays, startTime, endTime, isActive |
| `blocked_slots` | id, clinicId, scheduleId, date, startTime, endTime, reason |
| `anamnesis` | id, patientId, **templateType** (reabilitacao/esteticaFacial/esteticaCorporal) — UNIQUE(patientId, templateType), campos compartilhados (mainComplaint, diseaseHistory, medications, painScale…), campos faciais (phototype, skinType, skinConditions, sunExposure…), campos corporais (mainBodyConcern, bodyConcernRegions, celluliteGrade, bodyWeight, bodyHeight…) |
| `body_measurements` | id, patientId, measuredAt, **biometria** (weight, height), **perimetria** (waist, abdomen, hips, thighRight/Left, armRight/Left, calfRight/Left), **composição** (bodyFat, celluliteGrade), notes — tabela de série temporal para acompanhamento evolutivo corporal |
| `evaluations` | id, patientId, inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis |
| `treatment_plans` | id, patientId (múltiplos por paciente), **clinicId** (FK → clinics), objectives, techniques, frequency, estimatedSessions, status |
| `evolutions` | id, patientId, appointmentId (FK opcional), description, patientResponse, clinicalNotes, complications, **painScale** (0–10) |
| `discharge_summaries` | id, patientId (único), dischargeDate, dischargeReason, achievedResults, recommendations |
| `patient_subscriptions` | id, patientId, procedureId, startDate, billingDay, monthlyAmount, status, clinicId, cancelledAt, nextBillingDate — **índices:** patientId, clinicId, status, nextBillingDate |
| `session_credits` | id, patientId, procedureId, quantity, usedQuantity, clinicId, notes — **índices:** patientId, clinicId |
| `financial_records` | id, type (receita/despesa), amount, description, category, **status** (pendente/pago/cancelado/estornado), **dueDate** (vencimento), **paymentDate** (data de pagamento), **paymentMethod** (forma de pagamento), transactionType, appointmentId?, patientId?, procedureId?, subscriptionId?, clinicId, **accountingEntryId** (FK → journal entry principal), **recognizedEntryId** (FK → entry de reconhecimento de receita), **settlementEntryId** (FK → entry de liquidação) |
| `accounting_accounts` | id, clinicId, code (único por clínica), name, type (asset/liability/equity/revenue/expense), normalBalance (debit/credit), isSystem |
| `accounting_journal_entries` | id, clinicId, entryDate, eventType, description, sourceType, sourceId, status (posted/reversed), patientId?, appointmentId?, procedureId?, patientPackageId?, subscriptionId?, walletTransactionId?, financialRecordId?, reversalOfEntryId? |
| `accounting_journal_lines` | id, entryId (FK cascade), accountId, debitAmount, creditAmount, memo |
| `receivable_allocations` | id, clinicId, paymentEntryId, receivableEntryId, patientId, amount, allocatedAt |
| `patient_wallet` | id, patientId, clinicId, balance |
| `patient_wallet_transactions` | id, walletId, patientId, clinicId, amount, type (deposito/debito), description, appointmentId?, financialRecordId? |
| `recurring_expenses` | id, clinicId, name, category, amount, frequency (mensal/anual/semanal), isActive, notes |
| `billing_run_logs` | id, ranAt, triggeredBy (scheduler/manual), clinicId, processed, generated, skipped, errors, dryRun |
| `audit_log` | id, userId, action, entityType, entityId, patientId, summary, createdAt |

### Comandos de schema

```bash
# Sincronizar schema (pede confirmação em mudanças destrutivas)
pnpm --filter @workspace/db exec drizzle-kit push --config drizzle.config.ts

# Seed financeiro incremental (criar agendamentos + registros financeiros sem duplicar)
tsx scripts/seed-financial.ts

# Seed completo (somente se a clínica e usuários NÃO existirem — cria novo clinic)
pnpm run db:seed-demo
```

### Estado atual do banco (abril/2026)

- Clinic id=3 "Marta Schuch": 34 pacientes, 11 procedimentos globais (clinicId=null), ~600 agendamentos, 232 receitas, 21 despesas (jan–mar 2026)
- Credenciais: `mwschuch@gmail.com` / `123456` (admin+profissional, clinicId=3)
- Credenciais: `admin@fisiogest.com.br` / `123456` (super admin, clinicId=null)

---

## Rotas da API

Todas as rotas exigem `Authorization: Bearer <token>`, exceto `/api/auth/*` e `/api/healthz`.

### Autenticação
| Método | Caminho | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Criar usuário |
| POST | `/api/auth/login` | Retorna JWT |
| GET | `/api/auth/me` | Usuário atual |

### Pacientes
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/patients` | Lista com busca + paginação |
| POST | `/api/patients` | Criar |
| GET | `/api/patients/:id` | Detalhe + `totalAppointments` + `totalSpent` |
| PUT | `/api/patients/:id` | Atualizar |
| DELETE | `/api/patients/:id` | Excluir |

### Prontuário (abaixo de `/api/patients/:patientId`)
| Método | Caminho | Descrição |
|---|---|---|
| GET/POST | `/anamnesis` | Upsert anamnese |
| GET/POST | `/evaluations` | Listar / Criar avaliação |
| PUT/DELETE | `/evaluations/:id` | Atualizar / Excluir |
| GET | `/treatment-plans` | Listar todos os planos do paciente |
| POST | `/treatment-plans` | Criar novo plano (com clinicId do paciente) |
| GET/PUT | `/treatment-plans/:planId` | Buscar / Atualizar plano específico |
| DELETE | `/treatment-plans/:planId` | Excluir plano |
| GET/POST | `/treatment-plan` | Compat: upsert do plano ativo mais recente |
| GET/POST | `/evolutions` | Listar / Criar evolução |
| PUT/DELETE | `/evolutions/:id` | Atualizar / Excluir |
| GET/POST | `/discharge-summary` | Upsert alta fisioterapêutica (COFFITO) |
| GET | `/appointments` | Histórico de consultas do paciente |
| GET | `/financial` | Registros financeiros do paciente |

### Agendamentos
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/appointments` | Listar (filtros: date, startDate, endDate, patientId, status) |
| POST | `/api/appointments` | Criar — endTime calculado automaticamente |
| POST | `/api/appointments/recurring` | Criar série recorrente |
| GET | `/api/appointments/:id` | Detalhe |
| PUT | `/api/appointments/:id` | Atualizar — recalcula endTime |
| DELETE | `/api/appointments/:id` | Excluir |
| POST | `/api/appointments/:id/complete` | Concluir + gerar registro financeiro |
| GET | `/api/appointments/available-slots` | Horários disponíveis (date, procedureId, clinicStart, clinicEnd) |

### Procedimentos
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/procedures` | Listar — LEFT JOIN `procedure_costs`; retorna `effectivePrice`, `effectiveTotalCost`, `isGlobal` |
| POST | `/api/procedures` | Criar |
| PUT | `/api/procedures/:id` | Atualizar dados base |
| PATCH | `/api/procedures/:id/toggle-active` | Ativar / desativar |
| GET | `/api/procedures/:id/costs` | Obter configuração de custos da clínica |
| PUT | `/api/procedures/:id/costs` | Upsert de custos da clínica |
| DELETE | `/api/procedures/:id/costs` | Remover override de custos |
| DELETE | `/api/procedures/:id` | Excluir (cascade em `procedure_costs`) |
| GET | `/api/procedures/overhead-analysis` | Análise de overhead (month, year, procedureId) |

### Financeiro
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/financial/dashboard` | KPIs mensais — receita, despesas, lucro, MRR, cobranças pendentes |
| GET | `/api/financial/records` | Listar registros (filtros: type, month, year) |
| POST | `/api/financial/records` | Criar registro manual — aceita status, dueDate, paymentMethod |
| PATCH | `/api/financial/records/:id` | Editar lançamento completo (todos os campos) |
| PATCH | `/api/financial/records/:id/status` | Atualizar apenas status + paymentDate + paymentMethod |
| PATCH | `/api/financial/records/:id/estorno` | Soft-reversal: status=estornado + postReversal no ledger contábil |
| DELETE | `/api/financial/records/:id` | Deleta despesas; estorna receitas (soft) |
| GET | `/api/financial/patients/:id/history` | Histórico financeiro completo do paciente |
| GET | `/api/financial/patients/:id/summary` | Saldo: totalAReceber, totalPago, saldo, totalSessionCredits |
| POST | `/api/financial/patients/:id/payment` | Registrar pagamento (transactionType=pagamento) |
| GET | `/api/financial/patients/:id/credits` | Créditos de sessão do paciente |
| GET | `/api/financial/patients/:id/subscriptions` | Assinaturas ativas do paciente |
| GET | `/api/financial/cost-per-procedure` | Análise de custo por procedimento (month, year) |
| GET | `/api/financial/dre` | DRE mensal: receita bruta, despesas por categoria, lucro, variância |

### Despesas Fixas / Recorrentes
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/recurring-expenses` | Listar despesas fixas da clínica |
| POST | `/api/recurring-expenses` | Criar |
| PATCH | `/api/recurring-expenses/:id` | Editar |
| DELETE | `/api/recurring-expenses/:id` | Excluir |

### Assinaturas
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/subscriptions` | Listar assinaturas |
| POST | `/api/subscriptions` | Criar assinatura |
| PATCH | `/api/subscriptions/:id` | Atualizar |
| DELETE | `/api/subscriptions/:id` | Cancelar |
| GET | `/api/subscriptions/billing-status` | Status do billing automático + próximas cobranças |
| POST | `/api/subscriptions/run-billing` | Executar cobrança manual (idempotente) |

### Horários e Agenda
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/schedules` | Listar horários da clínica |
| POST | `/api/schedules` | Criar horário |
| PUT | `/api/schedules/:id` | Atualizar |
| DELETE | `/api/schedules/:id` | Excluir |
| GET | `/api/blocked-slots` | Listar bloqueios |
| POST | `/api/blocked-slots` | Criar bloqueio |
| DELETE | `/api/blocked-slots/:id` | Remover bloqueio |

### Relatórios e Dashboard
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/dashboard` | KPIs do dashboard principal |
| GET | `/api/reports` | Relatórios por período |
| GET | `/api/audit-log` | Log de auditoria |

---

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

## Regras de Governança de Agendamentos

1. **endTime sempre calculado** — o sistema calcula `endTime = startTime + procedure.durationMinutes`. O cliente nunca envia `endTime`.
2. **Procedimentos com maxCapacity = 1** (padrão) — qualquer sobreposição de horário ativo gera conflito 409.
3. **Procedimentos com maxCapacity > 1** (ex.: Pilates em Grupo = 4) — permite até N agendamentos simultâneos do mesmo procedimento. A N+1ª tentativa retorna 409 com a mensagem "Horário lotado: N/N vagas ocupadas".
4. **Endpoint de vagas** — `GET /api/appointments/available-slots?date=&procedureId=&clinicStart=08:00&clinicEnd=18:00` retorna slots a cada 30 min com `available` e `spotsLeft`.
5. **Agendamento recorrente** — `POST /api/appointments/recurring` persiste `clinicId` e `scheduleId` em cada sessão; conflitos são verificados por agenda (scope de `scheduleId`).
6. **Validação de dias úteis** — `available-slots` retorna `{ slots: [], notWorkingDay: true }` quando a data não é dia de funcionamento da agenda. Frontend exibe aviso visual âmbar.
7. **Edição parcial** — `PUT /api/appointments/:id` usa update parcial; `clinicId` e `scheduleId` nunca são sobrescritos por edições de status/notas.

---

## Funcionalidades do Sistema Clínico (Prontuário)

A página do prontuário (`artifacts/fisiogest/src/pages/patients/[id].tsx`) implementa o prontuário completo em abas:

| Aba | Descrição |
|---|---|
| Anamnese | **3 templates adaptativos**: Reabilitação (EVA, HDA, dor, histórico médico), Estética Facial (fototipo Fitzpatrick, tipo de pele, condições com checkboxes, triagem de contraindicações), Estética Corporal (IMC calculado, grau de celulite Nürnberger-Müller, regiões corporais, hábitos de vida) |
| Avaliações | Avaliações físicas — CRUD completo com edição/exclusão inline |
| Plano de Tratamento | Objetivos, técnicas, frequência, status |
| Evoluções | Notas de sessão — CRUD, vínculo com consulta |
| Histórico | Todas as consultas (status, procedimento, data) |
| Financeiro | Histórico de receitas/despesas por paciente |
| Alta Fisioterapêutica | Alta obrigatória pelo COFFITO: motivo, resultados, recomendações |

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

## Identidade Visual

- **Logo**: Figura estilizada em pose de reabilitação (braços estendidos + cruz médica) — `components/logo-mark.tsx`
- **Cor primária**: Teal profundo `hsl(180 100% 25%)` — identidade fisioterapêutica
- **Sidebar**: Teal escuro `hsl(183 50% 9%)` — coerência com a identidade
- **Tipografia**: Inter (corpo) + Outfit (títulos)
- **Ícones**: Lucide React — HeartHandshake (pacientes), Dumbbell (procedimentos), CalendarDays (agenda)

---

## Scripts e Comandos

```bash
# Instalar dependências
pnpm install

# Iniciar todos os serviços (via workflows do Replit)
# → artifacts/api-server: API Server  (porta 8080)
# → artifacts/fisiogest: web          (porta 3000)

# Compilar declarações TypeScript das libs compartilhadas (necessário antes do typecheck)
pnpm run build:libs

# Verificar tipos TypeScript (compila libs + verifica frontend + api-server)
pnpm run typecheck

# Sincronizar schema via lib/db
pnpm --filter @workspace/db exec drizzle-kit push --config drizzle.config.ts

# Seed de demonstração
pnpm run db:seed-demo
```

### Notas sobre TypeScript

As libs compartilhadas (`lib/db`, `lib/api-zod`, `lib/api-client-react`) usam **TypeScript project references** (`composite: true`). Elas precisam ser compiladas antes de qualquer verificação de tipos:

```bash
pnpm run build:libs
# equivalente a:
tsc --build lib/db/tsconfig.json lib/api-zod/tsconfig.json lib/api-client-react/tsconfig.json
```

Os outputs ficam em `lib/*/dist/` (apenas `.d.ts`, via `emitDeclarationOnly`). Em desenvolvimento, o Vite e o `tsx` resolvem os imports diretamente das fontes `.ts` — o `build:libs` é necessário apenas para o `tsc --noEmit`.

**Status TypeScript (abril/2026):** Frontend e API Server sem erros após `build:libs`.

---

## Credenciais de Demonstração

Criadas pelo seed (`pnpm run db:seed-demo`):

| E-mail | Senha | Perfis | Acesso |
|--------|-------|--------|--------|
| `admin@fisiogest.com.br` | `123456` | admin | Completo |
| `mwschuch@gmail.com` | `123456` | admin + profissional | Clínica id=3 |

---

## Análise de Mercado — Sistemas Concorrentes e Melhores Práticas

### Sistemas de referência no mercado brasileiro de gestão clínica

| Sistema | Público-alvo | Diferencial | Fraqueza vs FisioGest |
|---|---|---|---|
| **Ninsaúde Clinic** | Clínicas multiespecialidade | Prontuário eletrônico + telemedicina | Financeiro simplificado, sem ledger contábil real |
| **ClinicWeb** | Fisioterapia/reabilitação | Especializado em COFFITO, SOAP | Agenda e financeiro básicos |
| **iClinic** | Clínicas em geral | UX polida, boa agenda | SaaS caro, sem assinatura por sessão |
| **Prontmed** | Médicos e clínicas | Prescrição eletrônica (CFM) | Sem foco em fisioterapia/Pilates |
| **Clinicorp** | Odontologia e estética | Gestão de pacotes e controle de sessões | Pouco voltado ao COFFITO |
| **Meetime** | Vendas B2B | CRM clínico | Não é sistema clínico especializado |

### Melhores práticas identificadas

1. **Prontuário estruturado por especialidade** — templates adaptativos (reabilitação, estética facial, estética corporal) ✅ implementado
2. **Ledger contábil por partidas dobradas** — receita por competência, não por caixa ✅ implementado
3. **Cobrança automática de mensalidades** — billing scheduler com tolerância ✅ implementado
4. **Controle de créditos de sessão** — pacotes pré-pagos com consumo rastreado ✅ implementado
5. **Régua de cobrança** — lembretes automáticos de inadimplência ⏳ próxima prioridade (requer gateway)
6. **Relatório de aging (inadimplência)** — cálculo de dias em atraso ✅ implementado no frontend
7. **Multi-clínica com RBAC** — isolamento por clinicId + permissões por papel ✅ implementado
8. **Portal de agendamento público** — link gerado automaticamente por clínica ✅ implementado
9. **Telemedicina / videochamada** — integração Zoom/Google Meet ⏳ backlog
10. **Assinatura digital de prontuários** — conformidade COFFITO Resolução 424/2013 ⏳ backlog

### Lacunas identificadas vs mercado

| Funcionalidade | Status | Prioridade |
|---|---|---|
| Régua de cobrança (PIX/boleto automático) | Pendente | Alta — requer gateway |
| App mobile para pacientes (confirmação, histórico) | Pendente | Alta |
| Emissão de NFS-e (nota fiscal de serviço) | Pendente | Média |
| Integração com WhatsApp Business API | Pendente | Alta — lembretes de consulta |
| Assinatura digital de documentos clínicos | Pendente | Média (COFFITO) |
| Split de pagamento (clínica + profissional) | Pendente | Média |
| Dashboard de relatórios com BI exportável | Pendente | Baixa |

---

## Roadmap de Integrações de Pagamento R$ (Mercado Brasileiro)

### Por que o sistema atual é webhook-ready

O schema já tem tudo que os gateways precisam para integração:
- `financial_records.paymentMethod` → suporta "Pix", "Boleto", "Cartão de Crédito" etc.
- `financial_records.transactionType` → rastreia origem do pagamento
- `accounting_journal_entries` + `accounting_journal_lines` → double-entry ledger pronto para reconciliação automática
- `patient_subscriptions.nextBillingDate` → sincroniza com cobrança recorrente do gateway
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
├── Sincronizar patient_subscriptions com assinatura do gateway
├── Gateway dispara cobrança mensal → webhook cria financial_record automaticamente
└── Eliminar billing scheduler manual (billingService.ts)
```

### Variáveis de ambiente necessárias (quando integrar)

| Variável | Gateway | Descrição |
|---|---|---|
| `ASAAS_API_KEY` | Asaas | Chave de API (sandbox: `$aact_*`) |
| `ASAAS_WEBHOOK_TOKEN` | Asaas | Token de validação de webhooks |
| `EFI_CLIENT_ID` | Efí | Client ID OAuth |
| `EFI_CLIENT_SECRET` | Efí | Client Secret OAuth |
| `EFI_PIX_KEY` | Efí | Chave PIX da conta da clínica |
| `STRIPE_SECRET_KEY` | Stripe | Secret key (`sk_live_*`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Signing secret para webhooks |

> **Nota:** Nenhuma dessas variáveis existe ainda. Quando integrar, usar o skill `environment-secrets` para adicioná-las via painel do Replit.

---

## Histórico de Correções (Audit Log do Projeto)

### Sessão abril/2026 — Auditoria completa

#### Bugs de segurança corrigidos
| Bug | Arquivo | Gravidade | Correção |
|---|---|---|---|
| Multi-tenancy leak: `GET /subscriptions/:id/credits` sem filtro de clínica | `routes/subscriptions.ts` | **Crítico** | Adicionado `clinicId` na query do subscription lookup |
| `/records/:id/estorno` sem filtro de clínica | `routes/financial.ts` | **Crítico** | Adicionado `clinicCond(req)` + `postReversal` em transaction |

#### Bugs funcionais corrigidos
| Bug | Arquivo | Correção |
|---|---|---|
| `JSON.parse(stored)` sem try/catch → crash do app em localStorage corrompido | `lib/auth-context.tsx` | Adicionado try/catch + limpeza automática |
| URL de agendamento `//agendar` quando BASE=`/` | `pages/dashboard.tsx` | Corrigido para `${BASE ? BASE + "/" : "/"}agendar` |
| Variável `cc` undefined no handler `/dre` | `routes/financial.ts` | Adicionado `const cc = clinicCond(req)` |
| Permissão `"financial.update"` inexistente em patient-wallet | `routes/financial.ts` | Corrigido para `"financial.write"` |

#### Validação de input melhorada
| Rota | Arquivo | Correção |
|---|---|---|
| `POST /subscriptions` — sem Zod, validação manual frágil | `routes/subscriptions.ts` | Adicionado `createSubscriptionSchema` com Zod |
| `PUT /subscriptions/:id` — sem Zod, `parseInt` em dados não confiáveis | `routes/subscriptions.ts` | Adicionado `updateSubscriptionSchema` com Zod |

#### Performance — índices de banco adicionados
| Tabela | Índices adicionados | Impacto |
|---|---|---|
| `user_roles` | `userId`, `clinicId` | Verificação de permissão em toda requisição |
| `session_credits` | `patientId`, `clinicId` | Consulta de créditos por paciente |
| `patient_subscriptions` | `patientId`, `clinicId`, `status`, `nextBillingDate` | Billing automático + MRR |
| `patient_packages` | `patientId`, `clinicId` | Prontuário e financeiro do paciente |

#### Dead code e arquivos removidos
| Arquivo | Motivo |
|---|---|
| `artifacts/api-server/src/scripts/backfillAccounting.ts` | Script de migração única já executado |
| `docs/superpowers/specs/2026-04-19-contabilidade-formal-design.md` | Spec de design já implementado |
| `artifacts/api-server/src/middlewares/.gitkeep` | Diretório vazio (supersedido por `middleware/`) |
| `scripts/src/hello.ts` | Arquivo de teste órfão |
| Função `monthRange()` em `reports.ts` | Declarada e nunca chamada |
| Query de `records` morta no handler `/dashboard` (financial.ts) | Dados já vindos de `getAccountingTotals` |

### Sessão abril/2026 — Melhorias #2 e #5

#### Melhoria #2 — taxaNoShow integrada ao ledger contábil de partidas dobradas
| Arquivo | Mudança |
|---|---|
| `services/policyService.ts` | `db.insert(financialRecordsTable)` alterado para `.returning()` para capturar o ID inserido |
| `services/policyService.ts` | Importado `postReceivableRevenue` de `accountingService.ts` |
| `services/policyService.ts` | Após inserção do registro financeiro: chamada a `postReceivableRevenue` gera lançamento Débito 1.1.2 / Crédito 4.1.1 com `eventType: "no_show_fee"` |
| `services/policyService.ts` | `accountingEntryId` do lançamento gravado de volta no `financial_records` via `db.update` |

Antes: taxa de no-show gerava apenas linha em `financial_records` mas **não aparecia no DRE nem no Razão Contábil**.
Depois: taxa aparece corretamente no **Contas a Receber**, **Receita de Serviços** e no **DRE** do período.

#### Melhoria #5 — prazo de vencimento de recebíveis configurável por clínica
| Arquivo | Mudança |
|---|---|
| `lib/db/src/schema/clinics.ts` | Novo campo `defaultDueDays integer NOT NULL DEFAULT 3` adicionado |
| DB (migration) | `pnpm run push` aplicou coluna `default_due_days` na tabela `clinics` |
| `routes/appointments.ts` | Em `applyBillingRules()`: hardcoded `addDaysToDate(appointmentDate, 3)` substituído por query da clínica (`clinicsTable.defaultDueDays`) |
| `pages/configuracoes.tsx` | Interface `Clinic`: campo `defaultDueDays?: number \| null` adicionado |
| `pages/configuracoes.tsx` | Estado do formulário, useEffect e handleSubmit: campo `defaultDueDays` incluído |
| `pages/configuracoes.tsx` | UI: novo campo "Prazo de vencimento de recebíveis" no card de Políticas de Agendamento com preview dinâmico |

Antes: todos os recebíveis por sessão venciam sempre em +3 dias, sem possibilidade de configuração.
Depois: cada clínica define seu prazo (0–90 dias) diretamente nas configurações.

---

### Sessão abril/2026 — Auditoria completa #2 (análise de bugs, TypeScript, rotas, dead code)

#### Bugs corrigidos
| Bug | Arquivo | Gravidade | Correção |
|---|---|---|---|
| Import `../db/schema/index.js` para caminho inexistente | `scripts/seed.ts` | **Crítico** — seed falharia ao executar | Corrigido para `../lib/db/src/schema/index.js` |
| Script `build` referenciava `vite build --config vite.config.ts && tsx server/build.ts` (arquivos inexistentes) | `package.json` | **Médio** — `pnpm run build` falharia | Corrigido para `build:libs + filter build` de cada artifact |
| Script `start` referenciava `node dist/server.cjs` (caminho inexistente) | `package.json` | **Médio** — start de produção falharia | Corrigido para `node artifacts/api-server/dist/index.cjs` |
| `db/index.ts` importava de `./schema` que não existe | `db/index.ts` | **Médio** — arquivo morto quebrado | Arquivo removido |

#### Scripts raiz corrigidos
| Script | Antes (errado) | Depois (correto) |
|---|---|---|
| `build` | `vite build --config vite.config.ts && tsx server/build.ts` | `pnpm run build:libs && pnpm --filter @workspace/fisiogest run build && pnpm --filter @workspace/api-server run build` |
| `start` | `NODE_ENV=production node dist/server.cjs` | `NODE_ENV=production node artifacts/api-server/dist/index.cjs` |

#### Dead code e arquivos removidos
| Arquivo | Motivo |
|---|---|
| `artifacts/fisiogest/src/hooks/useAuthRedirect.ts` | Hook sem nenhum uso no projeto (0 importações) |
| `scripts/src/hello.ts` | Stub de teste órfão (`console.log("Hello from @workspace/scripts")`) |
| `scripts/tsconfig.json` | Cobria apenas `scripts/src/` (agora vazio e removido) |
| `scripts/src/` | Diretório removido após remoção do único arquivo |
| `deploy/index.cjs` | Binário de 1.5MB desatualizado — gerado pelo `pnpm run build` via `artifacts/api-server/dist/index.cjs` |
| `db/index.ts` | Stub quebrado que importava de `./schema` inexistente |

#### Funcionalidade adicionada — Ditado por voz (Web Speech API)
| Arquivo | Descrição |
|---|---|
| `artifacts/fisiogest/src/components/ui/voice-textarea.tsx` | Novo componente `VoiceTextarea` — drop-in replacement de `Textarea` com microfone |
| `artifacts/fisiogest/src/pages/patients/[id].tsx` | Import trocado: `Textarea` → `VoiceTextarea as Textarea` — todos os ~50 campos clínicos recebem voz |
| `artifacts/fisiogest/src/index.css` | Keyframe `@keyframes voice-bar` para animação de barras de áudio |

**Comportamento do VoiceTextarea:**
- Ícone de microfone aparece no hover do campo (canto inferior direito)
- Linguagem: `pt-BR` — reconhece termos clínicos brasileiros
- Modo contínuo (`continuous: true`) + resultados parciais em tempo real
- Texto transcrito é **acumulado** (não substitui o existente)
- Fallback silencioso em navegadores sem suporte (Safari, Firefox antigo)
- Suporte completo: Chrome, Edge

### Sessão abril/2026 — Auditoria da funcionalidade de Fotos + Cloudinary

#### Arquitetura de upload de fotos
1. Frontend (`photos-tab.tsx`) comprime imagem com `browser-image-compression` (≤1.5MB, 2400px).
2. Frontend chama `POST /api/storage/uploads/request-url` → backend gera assinatura via Cloudinary SDK.
3. Frontend faz upload **direto** ao Cloudinary (`https://api.cloudinary.com/v1_1/{cloud}/image/upload`) com a assinatura — arquivo nunca passa pelo backend.
4. Frontend salva metadados em `POST /api/patients/:id/photos` com `secure_url` retornado pelo Cloudinary.
5. Delete: backend chama `cloudinary.uploader.destroy(publicId)` antes de remover do banco.

#### Variáveis de ambiente
- Aceita `CLOUDINARY_URL` (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`) **ou** as três individuais (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`). `cloudinary.ts` faz parsing automático do URL único quando as individuais não estão presentes.

#### Bugs corrigidos nesta auditoria
| Bug | Arquivo | Gravidade | Correção |
|---|---|---|---|
| `extractPublicId` deixava segmentos de transformação (`c_fill,w_500`, `f_auto`) dentro do public_id, fazendo `deleteCloudinaryAsset` falhar e gerar assets órfãos | `artifacts/api-server/src/lib/cloudinary.ts` | **Médio** — vazamento silencioso de armazenamento | Loop que remove segmentos de transformação antes do `vXXX` |
| `handleDownload` no lightbox usava `<a download>` apontando direto pra URL do Cloudinary; navegador ignora `download` em cross-origin e abre a imagem em vez de baixar | `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | **Médio** — recurso de download não funcionava | Faz `fetch` → `blob` → `URL.createObjectURL` antes do clique |
| Parâmetro `cellIndex` não usado em `GridCell` | `photos-tab.tsx` | Baixo (ruído) | Removido |
| Imagens da grade sem lazy-loading — pacientes com muitas sessões carregavam tudo de uma vez | `photos-tab.tsx` (`CloudinaryImage`) | Baixo (perf) | Adicionado `loading="lazy"` + `decoding="async"` |

### Sessão abril/2026 — Auditoria do componente de Ditado por Voz (`VoiceTextarea`)

#### Bugs corrigidos
| Bug | Gravidade | Correção |
|---|---|---|
| Sem cleanup ao desmontar — `SpeechRecognition` continuava rodando se a página/aba mudasse durante a gravação, prendendo o microfone | **Alto** — privacidade/UX | `useEffect` de cleanup chama `recognition.abort()` |
| Texto parcial (interim) descartado ao parar — usuário perdia frases inteiras se clicasse no botão antes do reconhecedor finalizar | **Alto** — perda de dados | `stopRecording` agora faz commit do interim antes de chamar `stop()` |
| Erros silenciosos — `not-allowed` (permissão), `audio-capture` (sem mic), `no-speech`, `network` não davam feedback | **Médio** — UX confusa | Mensagens em pt-BR exibidas abaixo do campo via `role="alert"` |
| Race condition no double-click do mic — `recognition.start()` lançava `InvalidStateError` se chamado antes do anterior terminar | **Médio** | Flag `startingRef` + guard `isRecording` evita reentrada |
| Separador de espaço incompleto — Chrome retorna chunks com espaço inicial, gerando espaço duplo | Baixo | Helper `joinTranscript` normaliza espaços nas duas pontas |
| Evento sintético sem `name` — quebraria integrações futuras com bibliotecas de form | Baixo | Propriedade `name` propagada para o target sintético e para o `<textarea>` |
| Tipos `Window.SpeechRecognition` declarados como obrigatórios — TypeScript não pegaria casos de browser sem suporte | Baixo | Marcados como opcionais (`?:`) |

#### Acessibilidade
- Botão do microfone ganhou `aria-label` e `aria-pressed`.
- Mensagem de erro com `role="alert"` para leitores de tela.

#### Comportamento confirmado (sem alteração)
- `lang: "pt-BR"`, `continuous: true`, `interimResults: true`.
- Texto transcrito é **acumulado**, não substitui o existente.
- Fallback transparente em navegadores sem `SpeechRecognition` (Safari, Firefox antigos): renderiza um `<textarea>` simples.
- Suporte completo: Chrome, Edge.

### Sessão abril/2026 — Limpeza de arquivos duplicados, obsoletos e não utilizados

#### Pastas/arquivos removidos
| Item | Motivo |
|---|---|
| `artifacts/api-server/src/middlewares/` (com `.gitkeep`) | Pasta vazia, duplicata de `middleware/` (singular, que é a usada) |
| `artifacts/api-server/src/lib/objectStorage.ts` | Legacy do Replit Object Storage — substituído por Cloudinary |
| `artifacts/api-server/src/lib/objectAcl.ts` | Legacy do Replit Object Storage — substituído por Cloudinary |

#### Componentes shadcn/ui removidos (29 arquivos não importados em lugar nenhum)
`accordion`, `aspect-ratio`, `avatar`, `breadcrumb`, `button-group`, `carousel`, `chart`, `collapsible`, `context-menu`, `drawer`, `empty`, `field`, `form`, `hover-card`, `input-group`, `input-otp`, `item`, `kbd`, `menubar`, `navigation-menu`, `pagination`, `progress`, `radio-group`, `resizable`, `scroll-area`, `sidebar`, `sonner`, `spinner`, `toggle-group`.

Verificado que nenhum dos 29 era importado por outro componente UI nem por nenhuma página/feature.

#### Dependências npm removidas (órfãs após limpeza dos componentes)
`@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-toggle-group`, `embla-carousel-react`, `input-otp`, `react-resizable-panels`, `sonner`, `vaul`.

`recharts` foi mantido (usado em `relatorios.tsx`, `financial/index.tsx`, `patients/[id].tsx`).

#### Não-duplicações confirmadas (parecem mas não são)
- `auth-context.tsx` (Provider + Context) e `use-auth.ts` (hook) — separados intencionalmente para o Vite Fast Refresh funcionar corretamente.
- `pages/financial/index.tsx` (rota `/financeiro`) — não há duplicata; é a única página financeira.
- `lib/api-zod` e `lib/api-spec` — `api-spec` contém o `openapi.yaml` (fonte) e `api-zod` é gerado a partir dele.

Resultado: typecheck OK, app reinicia normal, lockfile reduzido.

### Sessão abril/2026 — Bug "erro ao enviar foto" (upload de fotos do paciente)

#### Causa raiz
Inconsistência de tipos MIME entre o frontend e o endpoint de assinatura (`/api/storage/uploads/request-url`):
- Frontend e schema do `/photos` aceitam tanto `image/jpeg` quanto `image/jpg`.
- O endpoint `/api/storage/uploads/request-url` aceitava **apenas** `image/jpeg` na lista `ALLOWED_TYPES`.
- Alguns navegadores (notadamente Safari iOS e algumas câmeras Android) reportam `image/jpg` como tipo do arquivo `.jpg`. Resultado: o servidor retornava **400 "Tipo de arquivo não permitido"** já no primeiro passo do upload, e a UI mostrava apenas `1 arquivo(s) falharam` sem dizer o motivo.

#### Correções
| Arquivo | Mudança |
|---|---|
| `artifacts/api-server/src/routes/storage.ts` | Adicionado `image/jpg` à lista `ALLOWED_TYPES` |
| `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | Helper `normalizeContentType` converte `image/jpg` → `image/jpeg` antes de qualquer envio (defensa em profundidade) |
| `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | Helper `extractApiError` lê o JSON de erro da resposta e propaga `message`/`error` do backend para o `throw` |
| `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | Toast de falha agora **mostra a mensagem real** do erro (até 2 arquivos por toast) em vez de apenas a contagem |
| `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | Falha do Cloudinary tenta extrair `data.error.message` da resposta JSON da API deles |

#### Resultado da rodada 1
- Uploads de `.jpg` voltam a funcionar em todos os navegadores.
- Quando algo falhar no futuro, o usuário verá o motivo real (ex.: "Tipo de arquivo não permitido", "Token inválido", "Cloudinary respondeu HTTP 401: Invalid signature") em vez de uma mensagem genérica.

#### Rodada 2 — `NetworkError when attempting to fetch resource`
Mesmo após a correção de MIME, o usuário continuou recebendo `NetworkError when attempting to fetch resource` ao enviar fotos. Esta mensagem específica do Firefox quase sempre indica que o navegador (ou uma extensão de privacidade/adblocker tipo uBlock Origin / Brave Shields) bloqueou a chamada direta para `api.cloudinary.com`.

**Solução: proxy server-side.** Em vez do fluxo `browser → Cloudinary direto` (que requer assinatura no FE e está sujeito a bloqueio por extensões), o arquivo agora trafega como `browser → api-server → Cloudinary`.

| Arquivo | Mudança |
|---|---|
| `artifacts/api-server/package.json` | Adicionadas deps `multer` e `@types/multer` |
| `artifacts/api-server/src/routes/storage.ts` | Nova rota `POST /api/storage/uploads/proxy` (auth + multer memoryStorage com limite 20MB) que recebe multipart, valida MIME (incluindo normalização `image/jpg` → `image/jpeg`), e usa `cloudinary.uploader.upload_stream({ resource_type: "auto" })` |
| `artifacts/api-server/src/routes/storage.ts` | Error handler do multer (LIMIT_FILE_SIZE → HTTP 413 com mensagem amigável) |
| `artifacts/fisiogest/src/pages/patients/photos-tab.tsx` | `uploadSingle` substituiu o fluxo de duas etapas (assinatura + upload direto) por um único POST multipart para `/api/storage/uploads/proxy` |
| `artifacts/fisiogest/src/pages/patients/[id].tsx` (ExamAttachments) | Mesma migração: agora usa `/api/storage/uploads/proxy` em vez de chamar Cloudinary direto |

**Vantagens da arquitetura nova:**
- Imune a bloqueio de adblockers/CORS (chamada interna `same-origin`).
- `api_key` e `api_secret` do Cloudinary nunca são expostos ao navegador.
- Validação real do tipo MIME no servidor (não só do nome reportado pelo browser).
- Erros do Cloudinary são logados no servidor (`console.error`) e retornados ao FE como JSON estruturado (`{ error, message }`), aparecendo no toast.

**O que ficou para trás (mas mantido por compat):** o endpoint `/api/storage/uploads/request-url` (assinatura) ainda existe — não é mais usado pelo FE, mas pode ser útil futuramente para uploads gigantes onde valha a pena pular o servidor.
