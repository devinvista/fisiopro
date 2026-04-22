## Arquitetura Replit — IMPORTANTE

> ⚠️ **Compatibilidade de hospedagem é regra máxima.** Toda escolha técnica deve respeitar a matriz definida em [`replit.md` → "Regra Máxima de Compatibilidade (Hospedagem)"](../replit.md). Resumo:
> - **Frontend permitido:** Angular, Astro, Next.js, Nuxt, Parcel, React, React Router, Svelte, SvelteKit, Vite, Vue.js → **escolha atual: React 19 + Vite 7**
> - **Backend permitido:** Astro, Express, Fastify, Hono, NestJS, Next.js, Nuxt, React Router, SvelteKit → **escolha atual: Express 5**
> - **Node.js:** 24.x ou 22.x → **escolha atual: 22.x LTS**
> - **Gerenciador de pacotes:** npm, yarn ou pnpm → **escolha atual: pnpm 10**

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
│   │   │   │   ├── catalog/pacotes/    # Pasta de feature (split em arquivos)
│   │   │   │   │   ├── index.tsx       # Página principal Pacotes
│   │   │   │   │   ├── types.ts        # Procedure, PackageItem, PackageFormData
│   │   │   │   │   ├── helpers.ts      # CATEGORY_CONFIG, MODALIDADE_CONFIG, formatCurrency, apiFetch, EMPTY_FORM
│   │   │   │   │   └── CategoryBadge.tsx
│   │   │   │   ├── relatorios.tsx
│   │   │   │   ├── saas/clinicas/      # Pasta de feature (split em arquivos)
│   │   │   │   │   ├── index.tsx       # Página principal Clinicas
│   │   │   │   │   ├── types.ts        # Clinic, ClinicUser, *FormData
│   │   │   │   │   ├── api.ts          # 9 fetch helpers para /api/clinics
│   │   │   │   │   ├── constants.ts    # EMPTY_FORM, ALL_ROLES, ROLE_COLORS
│   │   │   │   │   └── components/
│   │   │   │   │       ├── RoleCheckboxes.tsx
│   │   │   │   │       └── ClinicForm.tsx  # Formulário compartilhado Create/Edit
│   │   │   │   ├── configuracoes.tsx   # Clínica + Usuários + Agendas (hash navigation)
│   │   │   │   ├── agendar.tsx         # Portal público de agendamento
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── clinical/patients/
│   │   │   │   │   ├── index.tsx       # Lista de pacientes + busca
│   │   │   │   │   ├── [id].tsx        # Prontuário completo (abas)
│   │   │   │   │   ├── patient-detail/ # Tabs e tipos do prontuário (sem prefixo _)
│   │   │   │   │   │   └── tabs/{anamnesis,evolutions,treatment-plan}/
│   │   │   │   │   └── photos/         # Componente de fotos do paciente
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
│   │       │   │   ├── patient-photos/     # /api/patients/:id/photos
│   │       │   │   └── appointments/       # /api/appointments — módulo completo (7 arquivos)
│   │       │   │       ├── appointments.routes.ts      # ~165L: handlers finos que delegam ao service
│   │       │   │       ├── appointments.service.ts     # ~545L: regras de negócio (list/create/update/reschedule/complete/recurring/slots)
│   │       │   │       ├── appointments.billing.ts     # ~600L: applyBillingRules + auto-evolução
│   │       │   │       ├── appointments.repository.ts  # consultas (getWithDetails, checkConflict, monthly package policy)
│   │       │   │       ├── appointments.schemas.ts     # Zod + state machine
│   │       │   │       ├── appointments.helpers.ts     # utilitários puros de tempo/data
│   │       │   │       └── appointments.errors.ts      # AppointmentError tipado (httpStatus, code) + helpers
│   │       │   ├── catalog/
│   │       │   │   ├── procedures/         # /api/procedures
│   │       │   │   ├── packages/           # /api/packages
│   │       │   │   ├── patient-packages/   # /api/patients/:id/packages
│   │       │   │   └── treatment-plan-procedures/ # /api/treatment-plans/:planId/procedures
│   │       │   ├── financial/          # /api/financial — módulo dividido por subdomínio
│   │       │   │   ├── financial.routes.ts          # Montador fino (~25L) que monta os 4 sub-routers
│   │       │   │   ├── financial.service.ts         # updateRecordStatusWithAccounting(), applyEstorno()
│   │       │   │   ├── financial.repository.ts      # clinicCond(), assertPatientInClinic(), resolvePackageForSubscription()
│   │       │   │   ├── financial.schemas.ts         # createRecordSchema, updateRecordSchema, etc.
│   │       │   │   ├── dashboard/           # GET /dashboard — KPIs financeiros
│   │       │   │   │   └── financial-dashboard.routes.ts
│   │       │   │   ├── records/             # CRUD /records + status + estorno + delete
│   │       │   │   │   └── financial-records.routes.ts
│   │       │   │   ├── payments/            # /patients/:id/{history,summary,payment,credits,subscriptions}
│   │       │   │   │   └── financial-payments.routes.ts
│   │       │   │   ├── analytics/           # GET /cost-per-procedure, /dre
│   │       │   │   │   └── financial-analytics.routes.ts
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
│   │       └── modules/index.ts        # Agrega TODOS os sub-routers em /api (router raiz)
│   │                                    # (a antiga pasta routes/ foi removida)
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

