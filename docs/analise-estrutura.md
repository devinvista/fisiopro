# Análise de Estrutura — FisioGest Pro

> Gerada em: Abril/2026  
> Avaliação baseada em: práticas de mercado (DDD, Clean Architecture, Feature-Sliced Design), escalabilidade e manutenibilidade.

---

## 1. Visão Geral da Arquitetura

O projeto adota um **monorepo com pnpm workspaces** dividido em:

```
/
├── artifacts/       → Serviços deployáveis (api-server, fisiogest, mockup-sandbox)
├── lib/             → Bibliotecas compartilhadas (db, api-spec, api-zod, api-client-react)
├── db/              → Migrations SQL brutas
├── scripts/         → Seeds de dados
└── docs/            → Documentação
```

**Pontos fortes já estabelecidos:**
- Separação clara entre frontend e backend em artifacts
- Backend com Domain-Driven Design (módulos: clinical, financial, saas, admin, catalog)
- Contrato de API via OpenAPI + geração automática de tipos e hooks (Orval)
- Bibliotecas compartilhadas tipadas (`@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`)
- Middlewares dedicados (auth, rbac, subscription, plan-features, errorHandler)
- Scheduler de jobs independente com cron expressions

---

## 2. Backend — `artifacts/api-server`

### 2.1 Estrutura Atual

```
src/
├── app.ts
├── index.ts
├── lib/          → logger, sentry
├── middleware/   → auth, rbac, errorHandler, subscription, plan-features, requestContext
├── modules/
│   ├── admin/         → clinics, users, audit-log
│   ├── auth/          → completo (routes + service + repository + schemas)
│   ├── catalog/       → packages, procedures, patient-packages, treatment-plan-procedures
│   ├── clinical/      → appointments, blocked-slots, medical-records, patient-journey,
│   │                    patient-photos, patients, policies, schedules
│   ├── dashboard/
│   ├── financial/     → analytics, billing, dashboard, payments, records,
│   │                    recurring-expenses, reports, subscriptions, patient-wallet
│   │                    + financial.routes.ts + financial.service.ts (nível raiz)
│   ├── health/
│   ├── public/        → completo (routes + service + repository + schemas + helpers)
│   ├── saas/          → coupons, saas-plans
│   ├── shared/        → accounting, test-utils
│   └── storage/
├── scheduler/
│   ├── index.ts
│   ├── registerJob.ts
│   └── jobs/          → billing, policies, subscription
└── utils/             → asyncHandler, auditLog, cloudinary, dateUtils, httpError, validate
```

### 2.2 Problemas Identificados

#### ❌ Inconsistência nas camadas dos módulos

Alguns módulos têm a arquitetura completa (`routes + service + repository + schemas`), outros têm apenas `routes.ts`. Isso cria desorientação para novos desenvolvedores.

**Módulos completos:** `auth`, `public`, `procedures`, `saas-plans`, `appointments`, `medical-records`  
**Módulos incompletos (apenas routes):** `blocked-slots`, `patient-journey`, `patient-photos`, `patients`, `schedules`, `dashboard`, `storage`

**Recomendação:** Padronizar todos os módulos com pelo menos `routes.ts + service.ts`. Se a lógica for simples, o service pode ser mínimo. Isso torna a estrutura previsível.

#### ❌ Nível misto no módulo `financial`

`financial.routes.ts` e `financial.service.ts` ficam na raiz de `financial/` ao lado de sub-módulos (`analytics/`, `billing/`, `dashboard/`). Isso cria ambiguidade sobre a responsabilidade do arquivo raiz.

**Recomendação:** Criar um sub-módulo `financial/core/` ou renomear para `financial/records/` e mover os arquivos raiz para lá.

#### ❌ `shared/accounting` dentro de `modules/`

O serviço de accounting é um utilitário transversal, não um módulo de negócio.

**Recomendação:** Mover para `src/lib/accounting.ts` ou `src/services/accounting.service.ts` fora de `modules/`.

#### ❌ `utils/` com responsabilidades mistas

`utils/auditLog.ts` e `utils/cloudinary.ts` são integrações de infraestrutura, não utilitários genéricos. `utils/validate.ts` e `utils/asyncHandler.ts` são helpers de middleware.

**Recomendação:**
```
src/
├── lib/            → logger, sentry, cloudinary (infraestrutura/third-party)
├── helpers/        → asyncHandler, validate, httpError, dateUtils (helpers puros)
└── utils/          → funções de domínio utilitário
```

#### ❌ Jobs do scheduler desacoplados dos módulos de domínio

Os jobs (`billing.job.ts`, `policies.job.ts`) duplicam lógica dos serviços ou dependem deles com imports cruzados.

**Recomendação:** Cada job deve ser uma thin wrapper que importa o service do módulo correspondente. A estrutura atual está correta na organização, mas os jobs não devem conter lógica de negócio diretamente.

#### ⚠️ Ausência de camada de types centralizada

Tipos de domínio (interfaces, enums) estão espalhados em `schemas.ts` ou inline nos services.

**Recomendação:** Adicionar `src/types/` ou manter os tipos dentro do módulo em `module.types.ts`.

#### ⚠️ `modules/index.ts` com mounting manual de todos os routers

Com o crescimento do projeto, o arquivo `src/modules/index.ts` se tornará um gargalo de manutenção.

**Recomendação futura:** Implementar auto-discovery de routers via convenção de arquivos, ou ao menos agrupar os mounts em seções bem delimitadas (já está parcialmente feito com comentários).

---

## 3. Frontend — `artifacts/fisiogest`

### 3.1 Estrutura Atual

```
src/
├── App.tsx          → Routing + QueryClient + fetch monkey-patch + guards
├── main.tsx
├── index.css
├── components/
│   ├── ui/          → Shadcn components
│   ├── layout/      → app-layout, clinic-switcher
│   ├── landing/     → seções da landing page
│   ├── guards/      → feature-gate, feature-route, plan-badge
│   ├── domain/      → VAZIO (só README.md)
│   └── error-boundary.tsx
├── hooks/           → use-auth, use-mobile, use-permission, use-toast (apenas 4)
├── lib/             → sentry.ts (apenas 1 arquivo)
├── pages/
│   ├── auth/
│   ├── catalog/
│   │   ├── pacotes/
│   │   └── procedimentos/
│   ├── clinical/
│   │   ├── agenda/       → components/, hooks/, helpers/, constants.ts, types.ts
│   │   ├── agendar/      → components/, constants.ts, types.ts, helpers.ts
│   │   └── patients/
│   │       ├── patient-detail/
│   │       │   ├── tabs/   → 12+ tabs com sub-pastas profundas
│   │       │   └── utils/  → print/, format.tsx
│   │       └── photos/
│   ├── financial/
│   │   ├── components/
│   │   └── relatorios/
│   ├── saas/
│   │   ├── clinicas/     → api.ts (arquivo de API dentro de page!)
│   │   └── superadmin/
│   └── settings/
├── schemas/         → (pasta existe mas subutilizada)
└── utils/           → auth-context, permissions (lógica de negócio em utils/)
```

### 3.2 Problemas Identificados

#### ❌ Global `fetch` monkey-patch no `App.tsx` — CRÍTICO

```tsx
// App.tsx
const originalFetch = window.fetch;
window.fetch = async (input, init) => { ... };
```

Isso é uma prática antipadrão: intercepta **todo** fetch da aplicação, dificulta testes, quebra com Web Workers e SSR, e pode causar loops infinitos com hot-reload.

**Recomendação:** Criar um módulo `src/lib/api-client.ts` com uma função `apiFetch` que encapsula a lógica de autenticação e erro 401. Usar esse cliente em todos os hooks do `@workspace/api-client-react`.

```ts
// src/lib/api-client.ts
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = localStorage.getItem("fisiogest_token");
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) { /* handle logout */ }
  return response;
}
```

#### ❌ `QueryClient` instanciado diretamente em `App.tsx`

O `queryClient` como variável de módulo impede testes isolados e configuração dinâmica.

**Recomendação:** Extrair para `src/lib/query-client.ts`.

#### ❌ `components/domain/` vazio

A pasta existe com apenas um README, enquanto componentes de domínio reutilizáveis ficam presos dentro de `pages/`. 

**Recomendação:** Mover componentes reutilizados entre múltiplas páginas (ex: `KpiCard`, `StatusBadge`, `PaymentBadge`) para `components/domain/`.

#### ❌ Arquivo de API dentro de página: `pages/saas/clinicas/api.ts`

Chamadas diretas à API dentro de pastas de página violam a separação de responsabilidades — especialmente quando o projeto já tem `@workspace/api-client-react` para isso.

**Recomendação:** Migrar para hooks gerados pelo Orval ou criar `hooks/use-clinicas.ts`.

#### ❌ Hooks de domínio espalhados dentro de `pages/`

Os hooks de `agenda/hooks/` (`useAgendaMutations`, `useAgendaNavigation`, `useAgendaQueries`) são hooks de negócio que poderiam ser reutilizados.

**Recomendação:** Padronizar: hooks globais em `src/hooks/`, hooks de página em `pages/<domain>/hooks/` (padrão já parcialmente adotado pela agenda — manter e estender).

#### ❌ `utils/auth-context.tsx` — lógica de negócio em `utils/`

`AuthProvider` e contexto de autenticação são lógica de domínio, não utilitários.

**Recomendação:** Mover para `src/contexts/auth-context.tsx` ou `src/features/auth/`.

#### ❌ Inconsistência de idioma nas rotas e pastas

Algumas pastas/rotas em português (`pacientes`, `procedimentos`, `agendar`), outras em inglês (`patients`, `financial`, `clinical`). Isso é inconsistente.

**Recomendação:** Escolher um padrão. Opções:
- **Rotas em português** (UX brasileira): manter, mas padronizar internamente os nomes de arquivo em inglês.
- **Codebase em inglês**: renomear arquivos e pastas para inglês, manter apenas as strings de UI em português.

#### ⚠️ Profundidade excessiva em `patient-detail/`

```
pages/clinical/patients/patient-detail/tabs/anamnesis/TemplateEsteticaCorporal.tsx
```

São 6 níveis de profundidade. Isso dificulta imports e navegação.

**Recomendação:** Limitar a 3-4 níveis. Tabs complexas podem ser extraídas para `components/domain/patient/` se reutilizáveis.

#### ⚠️ `schemas/` subutilizada

A pasta existe mas a maioria dos schemas Zod estão inline nos componentes de formulário.

**Recomendação:** Centralizar todos os schemas de formulário em `src/schemas/` ou co-localizar com o componente em `form.schema.ts`.

#### ⚠️ Guards duplicados: `ProtectedRoute`, `PermissionRoute`, `SuperAdminRoute` em `App.tsx`

Esses três componentes têm lógica quase idêntica e estão definidos inline no `App.tsx`.

**Recomendação:** Extrair para `src/components/guards/` (já existe a pasta, mas apenas `feature-gate` e `feature-route` estão lá).

---

## 4. Bibliotecas Compartilhadas — `lib/`

### 4.1 Avaliação

| Lib | Status | Observação |
|-----|--------|------------|
| `@workspace/db` | ✅ Bom | Schema bem organizado por domínio |
| `@workspace/api-spec` | ✅ Bom | OpenAPI 3.1 como fonte da verdade |
| `@workspace/api-zod` | ✅ Bom | Gerado do OpenAPI, evita drift |
| `@workspace/api-client-react` | ✅ Bom | Hooks gerados pelo Orval |

### 4.2 Melhorias

#### ⚠️ `db/` (migrations SQL) separado de `lib/db/` (ORM)

As migrations ficam em `/db/*.sql` na raiz, enquanto o schema Drizzle fica em `lib/db/`. Isso é funcional mas pode causar confusão.

**Recomendação:** Consolidar: mover `/db/*.sql` para `lib/db/migrations/` e atualizar o `drizzle.config.ts`. Isso mantém tudo relacionado ao banco em um único local.

#### ⚠️ Falta `@workspace/shared-constants`

Constantes como status de pagamento, tipos de procedimento, roles de usuário estão duplicadas entre frontend e backend.

**Recomendação:** Criar `lib/shared-constants/` exportando enums e constantes compartilhadas que ambos os lados consomem de forma tipada.

---

## 5. Organização Raiz

| Item | Status | Recomendação |
|------|--------|--------------|
| `.env` com credenciais em texto | ⚠️ | Usar Replit Secrets para produção |
| `docs/` bem estruturado | ✅ | Manter e expandir |
| `scripts/` com seeds | ✅ | Adicionar script de reset/rollback |
| `replit.nix` minimalista | ✅ | OK para o ambiente atual |
| `.github/` presente | ✅ | CI/CD configurado |
| `vitest.config.ts` | ✅ | Testes unitários disponíveis |

---

## 6. Atualização de Dependências

### 6.1 Seguras para atualizar agora (sem breaking changes)

| Dependência | Atual | Recomendado | Justificativa |
|-------------|-------|-------------|---------------|
| `react` + `react-dom` | 19.1.0 | 19.2.5 | Patch/minor — apenas correções |
| `esbuild` | 0.27.3 | 0.28.0 | Minor — verificar override no pnpm |
| `drizzle-kit` | 0.31.10 | Latest 0.31.x | Patch |
| `@types/bcryptjs` | 3.0.0 | **Remover** | Deprecated — `bcryptjs@3` já inclui tipos nativos |

### 6.2 Requerem planejamento (breaking changes)

| Dependência | Atual | Latest | Risco | Recomendação |
|-------------|-------|--------|-------|--------------|
| `lucide-react` | 0.545.0 | 1.8.0 | **Alto** | API de ícones mudou. Migrar gradualmente, verificar todos os imports de ícones. |
| `date-fns` | 3.6.0 | 4.1.0 | **Médio** | v4 tem breaking changes em timezones. Migrar após auditoria de uso. |
| `recharts` | 2.15.4 | 3.x | **Alto** | API de componentes mudou significativamente. Adiar até ter cobertura de testes visual. |
| `react-resizable-panels` | 2.1.9 | 4.x | **Alto** | Saltar duas versões major. Verificar changelog. |
| `@hookform/resolvers` | 3.10.0 | 5.x | **Médio** | Verificar compatibilidade com react-hook-form instalado. |
| `zod` | 3.25.76 | 4.x | **Muito Alto** | API completamente reescrita (`.parse()`, `.safeParse()` mudam). `drizzle-zod` ainda não tem suporte oficial. **Não migrar ainda.** |
| `typescript` | 5.9.3 | 6.0.3 | **Alto** | TS 6 tem mudanças em strictness. Testar com `--noEmit` antes. |
| `vite` | 7.3.2 | 8.x | **Médio** | Verificar plugins compatíveis (`@tailwindcss/vite`, `@vitejs/plugin-react`). |
| `eslint` | 9.x | 10.x | **Baixo** | Apenas se os plugins forem compatíveis. |

### 6.3 Prioridade recomendada de atualização

```
Fase 1 (imediato, baixo risco):
  - Remover @types/bcryptjs
  - react + react-dom → 19.2.5

Fase 2 (planejado, médio risco):
  - date-fns → 4.x (auditar uso de timezones)
  - @hookform/resolvers → 5.x
  - lucide-react → 1.x (verificar ícones renomeados)

Fase 3 (requer sprint dedicado):
  - typescript → 6.x (rodar typecheck primeiro)
  - vite → 8.x (testar build completo)
  - recharts → 3.x (testar todos os gráficos)

Fase 4 (aguardar ecossistema):
  - zod → 4.x (aguardar drizzle-zod + orval suporte)
```

---

## 7. Estrutura-Alvo Recomendada (Roadmap)

### Backend

```
artifacts/api-server/src/
├── app.ts
├── index.ts
├── lib/              → logger, sentry, cloudinary (infra/third-party)
├── helpers/          → asyncHandler, httpError, validate, dateUtils
├── middleware/       → auth, rbac, errorHandler, subscription, plan-features, requestContext
├── types/            → domain interfaces, shared enums
├── scheduler/        → index, registerJob, jobs/ (thin wrappers)
└── modules/
    ├── auth/         → routes + service + repository + schemas
    ├── health/
    ├── public/
    ├── admin/
    │   ├── clinics/
    │   ├── users/
    │   └── audit-log/
    ├── clinical/     → todos com routes + service + repository
    ├── catalog/
    ├── financial/
    │   ├── core/     → (mover financial.routes.ts e financial.service.ts aqui)
    │   ├── billing/
    │   ├── analytics/
    │   └── ...
    ├── saas/
    ├── dashboard/
    └── storage/
```

### Frontend

```
artifacts/fisiogest/src/
├── App.tsx              → apenas routing + providers
├── main.tsx
├── lib/
│   ├── api-client.ts   → fetch wrapper com auth (eliminar monkey-patch)
│   ├── query-client.ts → QueryClient isolado
│   └── sentry.ts
├── contexts/            → auth-context (mover de utils/)
├── hooks/               → hooks globais e de domínio reutilizáveis
├── components/
│   ├── ui/              → Shadcn
│   ├── layout/
│   ├── landing/
│   ├── guards/          → todos os guards (ProtectedRoute, PermissionRoute, etc.)
│   ├── domain/          → componentes de domínio reutilizáveis entre páginas
│   └── error-boundary.tsx
├── schemas/             → schemas Zod de formulários
├── utils/               → funções puras utilitárias
└── pages/               → manter estrutura atual, limitar a 4 níveis de profundidade
```

---

## 8. Scorecard

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Estrutura de módulos backend | 8/10 | DDD bem aplicado, inconsistência nas camadas |
| Estrutura de componentes frontend | 6/10 | Páginas muito profundas, domain/ vazio, monkey-patch |
| Separação de responsabilidades | 7/10 | API em page, auth em utils, guards em App.tsx |
| Tipagem e contratos | 9/10 | OpenAPI + geração automática é excelente |
| Escalabilidade do monorepo | 8/10 | Boa estrutura de workspaces, falta shared-constants |
| Atualidade das dependências | 7/10 | Algumas majors pendentes, nada crítico |
| Testabilidade | 6/10 | Bons testes unitários existentes, mas monkey-patch dificulta |
| Documentação | 9/10 | `docs/` muito bem estruturado |
