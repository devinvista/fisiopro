## Histórico de Correções (Audit Log do Projeto)

### Sessão abril/2026 — Sprint 2: paginação, filtros, validação e erros padronizados

**Itens entregues** (4 do plano de sprints) + movidos para backlog (1.1, 1.6, 1.7, 6.4):

- **2.1 Paginação cursor-based** — Novo `utils/pagination.ts` com `encodeCursor/decodeCursor` (base64url JSON `{v,id}`), `clampLimit` (1..100, default 20) e `buildPage<T>(rows, limit, cursorOf, total?)` que devolve o envelope `{ data: T[], page: { limit, hasMore, nextCursor, total? } }`. Aplicado em `patients.routes.ts` (cursor por `createdAt desc, id desc`; `total` só na 1ª página), `appointments.service.ts` (cursor por `date asc, id asc`), `financial-records.routes.ts` (cursor por `createdAt desc, id desc`) e `audit-log.routes.ts` (cursor por `createdAt desc, id desc`). Substitui page/offset (patients) e respostas de array bare (appointments, financial-records, audit-log).
- **2.2 Filtros e ordenação padronizados** — Novo `utils/listQuery.ts` exporta `listQuerySchema` zod com `q?, from?, to?, status?, sort?, limit?, cursor?` + `parseSort()`. Cada rota estende com seus filtros específicos (ex.: `listPatientsQuerySchema` mantém `search` para compat; `listAppointmentsQuerySchema` adiciona `date/startDate/endDate/patientId`).
- **2.3 Resposta padronizada de erro** — `middleware/errorHandler.ts` e `utils/validate.ts` agora devolvem `{ error, message, details? }` em todos os caminhos (HttpError, ZodError, validateBody/validateQuery). Renomeado `issues` → `details` para alinhar com o contrato. O frontend só consome `message`, então o rename é transparente.
- **2.4 Validação consistente body+query** — `validateQuery(schema, req.query, res)` aplicado nas 4 rotas refatoradas, eliminando `parseInt(req.query.x as string)` espalhado. `parseIntParam` continua para path params.
- **Frontend** — Consumidores adaptados ao envelope `{data, page}`:
  - `patients/index.tsx` lê `data.page.total` (com fallback ao antigo `data.total`).
  - `agenda/hooks/useAgendaQueries.ts` desempacota `appointmentsQuery.data` (array ou wrapper).
  - `financial/components/LancamentosTab.tsx` lê `rawRecords.data`.
  - `clinical/patients/.../AuditLogTab.tsx` (2 ocorrências) lê `data.data`.

**Backlog** — Movidos para a seção `🗄️ Backlog` em `docs/sprints.md`: **1.1** (auditoria de secrets/`.env.example`), **1.6** (política de senha forte/bloqueio progressivo), **1.7** (sanitização PII em `pino-http`), **6.4** (otimização Cloudinary `f_auto,q_auto`).

**Validação:** `tsc --noEmit` passa em `@workspace/api-server` e `@workspace/fisiogest`. Workflow restart OK; rota `/` continua respondendo (404 esperado, sem rota raiz). Nenhum lint diagnóstico aberto nas listagens refatoradas.

### Sessão abril/2026 — Sprint 1 + 3: hardening de segurança e infra

**Itens entregues** (8 do plano de sprints):

- **1.2 Helmet** — `app.ts` aplica `helmet()` com CSP estrita em produção (permite Cloudinary e Sentry; `frame-ancestors 'none'`). Em dev a CSP é desativada para o HMR do Vite.
- **1.3 Compression** — middleware `compression()` ativo para reduzir payload de respostas JSON e bundles servidos em produção.
- **1.4 JWT em cookie httpOnly + CSRF** — novos `middleware/cookies.ts` (`AUTH_COOKIE`/`CSRF_COOKIE` + `setAuthCookie/clearAuthCookie`) e `middleware/csrf.ts` (double-submit). `auth.routes.ts` agora emite o cookie em `/login`, `/register`, `/switch-clinic` e a nova rota `POST /logout`. `middleware/auth.ts` aceita cookie OU `Authorization: Bearer` (compat). Rota de impersonate (`/clinics/:id/impersonate`) também passa a setar o cookie.
- **1.5 Frontend cookie-aware** — `lib/api.ts` reescrito (`apiFetch`/`apiFetchJson`/`apiSendJson` com `credentials: include` + header `x-csrf-token` automático em métodos mutadores). `lib/api-client-react/src/custom-fetch.ts` deixou de injetar `Authorization` do `localStorage` e passou a usar cookies + CSRF. `auth-context.tsx` migrado: usa `isAuthenticated` (boolean) em vez de `token`; chama `POST /api/auth/logout` no logout; flag `fisiogest_authenticated` substitui o token persistido. Guards (`protected-route`, `superadmin-route`, `permission-route`, `feature-route`) e `landing.tsx` atualizados.
- **3.1 Drizzle migrate em prod** — `scripts/migrate.ts` (modo padrão aplica `migrationsFolder`; modo `--baseline` registra as migrations atuais como aplicadas em DB existente sem rodar SQL). Scripts `db:migrate` e `db:baseline` em `package.json`. `scripts/post-merge.sh` agora roda `pnpm db:migrate` em vez de `db:push`.
- **3.2 pg_advisory_lock no scheduler** — `scheduler/lock.ts` (`tryAcquireAdvisoryLock` com hash determinístico do nome do job + `pg_try_advisory_lock`). `scheduler/registerJob.ts` envolve cada execução: somente uma réplica executa por vez; libera lock no `finally`.
- **3.3 Idempotência de billing** — `billing-lock.ts` expõe `withSubscriptionBillingLock(subId, year, month, fn)`: abre transação, faz `pg_advisory_xact_lock(subId, year*100+month)` e re-verifica existência do registro dentro do lock. Aplicado em `billing.service.ts` e `consolidated-billing.service.ts` — defesa em profundidade contra dupla cobrança mesmo se 3.2 falhar.
- **3.4 Rate limit distribuído** — `middleware/rateLimitStore.ts` implementa `PgRateLimitStore` (express-rate-limit `Store` em Postgres com tabela `rate_limit_counters` criada on-demand; janela rotativa via `INSERT … ON CONFLICT DO UPDATE`). `startRateLimitCleanup` faz GC a cada 15min. Todos os 4 limiters (global, auth, public, uploads) usam o store. Substitui o store em memória, permitindo múltiplas réplicas no autoscale sem free-tier de Redis.

**Pacotes instalados:** `helmet`, `compression`, `cookie-parser`, `@types/compression` em `@workspace/api-server`.

**Validação:** `pnpm typecheck` passa em todos os pacotes; `curl -i /api/auth/me` retorna 401 com headers do helmet (HSTS, X-Frame-Options, etc.), cookie `fisiogest_csrf` setado e headers de rate-limit (`ratelimit-remaining`).

### Sessão abril/2026 — Bug fix: logger Proxy quebrava serializers do `pino-http`

**Sintoma:** cada request HTTP gerava um log com **centenas de linhas** despejando o objeto `req`/`res` interno do Express (socket, parser, headers, writableState, eventListeners…), apesar de `app.ts` configurar `serializers: { req: ({method,url}), res: ({statusCode}) }` no `pinoHttp(...)`.

**Causa raiz:** o `logger` exportado por `lib/logger.ts` é um `Proxy` sobre o `baseLogger` do pino para injetar `requestId` automaticamente via AsyncLocalStorage. O handler `get` interceptava apenas os métodos de nível (`info/warn/error/debug/trace/fatal`) e devolvia o restante via `target[prop]` — **sem bind**. Quando o `pino-http` chamava `logger.child(bindings, { serializers })` para criar seu logger interno, `this` resolvia para o Proxy (não o `baseLogger`), e o `child()` interno do pino acabava ignorando os `serializers` passados pelo `pino-http`.

**Fix:** no Proxy, qualquer `function` que **não** seja um método de log de nível agora é retornada com `bind(target)`, preservando o `this` correto do pino. Comentário inline documenta o porquê para evitar regressão futura.

**Arquivo:** `artifacts/api-server/src/lib/logger.ts`

**Validação:** após restart, `GET /api/healthz` log = 6 linhas (antes: ~430 linhas). Nenhum impacto no `requestId` (continua sendo injetado pelo handler do nível de log).

### Sessão abril/2026 — Limpeza de configuração e arquivos obsoletos

**Problema:** `pnpm -r exec tsc --noEmit` falhava em `lib/api-spec` com `TS18003: No inputs were found in config file '/tsconfig.json'`. Investigação mostrou três artefatos legados deixados de uma estrutura anterior do projeto:

| Arquivo removido | Motivo |
|---|---|
| `tsconfig.json` (raiz) | Configuração de Vite app que esperava `src/` na raiz; raiz não tem `src/`. Não estendido por nenhum `tsconfig` de pacote (todos estendem `tsconfig.base.json`). Causava o `lib/api-spec` (sem tsconfig próprio) a herdar essa configuração quebrada. |
| `tsconfig.server.json` (raiz) | Apontava para `server/` e `db/` na raiz; ambos diretórios não existem mais (movidos para `artifacts/api-server/` e `lib/db/`). Não referenciado em nenhum script. |
| `scripts/package.json` | Declarava `@workspace/scripts` com script `hello` apontando para `./src/hello.ts` (inexistente) e `typecheck` para `tsconfig.json` (inexistente). `pnpm-workspace.yaml` lista apenas `artifacts/*` e `lib/*`, então `scripts/` **nunca foi um pacote pnpm de fato** — os seeds são executados via `tsx scripts/*.ts` da raiz. |

**Adicionado:** script `db:seed-financial` em `package.json` da raiz (o arquivo `scripts/seed-financial.ts` já existia mas não tinha entrypoint).

**Validação:**
- `pnpm typecheck` ✅ (zero erros)
- `pnpm -r exec tsc --noEmit` ✅ (todos os 7 pacotes do workspace passam — antes falhava 1)

### Sessão abril/2026 — Sprint 2 (item 3): refator de `procedures`

| Arquivo | Antes | Depois |
|---|---|---|
| `procedures.routes.ts` | **658 linhas** com `db.*` direto, `try/catch` em todo handler, `getEffectiveProcedurePrice` exportado de dentro do roteador | **141 linhas** (rotas finas com `asyncHandler`) |
| `procedures.service.ts` | inexistente | **378 linhas**: 9 funções de caso de uso (list, create, update, toggleActive, delete, getCosts, upsertCosts, deleteCosts, overheadAnalysis) + `getEffectiveProcedurePrice` |
| `procedures.repository.ts` | inexistente | **293 linhas**: acesso ao DB para `proceduresTable`, `procedureCostsTable`, despesas mensais, schedules ativos, uso de procedimento por período |
| `procedures.schemas.ts` | inline no routes | **67 linhas** (Zod) |

**Comportamento preservado**: HTTP 400 quando clínica não selecionada, 403 para não-admin em costs/toggle, 404 para procedimento inexistente, **409 com a mesma mensagem** ao deletar procedimento com consultas vinculadas, 204 em delete/cost-delete; payload das listagens (incluindo `isGlobal`, `effectivePrice`, `effectiveTotalCost`, `clinicCost` agregado) idêntico; cálculo de overhead-analysis (despesas mensais → custo por hora → divisão por capacidade real/estimada) idêntico. A função `getEffectiveProcedurePrice` continua sendo re-exportada pelo `routes.ts` para preservar qualquer importador externo.

Validação: `pnpm typecheck` ✅ • `pnpm test` 142/142 ✅ • workflow restart OK.

### Sessão abril/2026 — Sprint 2 (item 2): refator de `saas-plans`

| Arquivo | Antes | Depois |
|---|---|---|
| `saas-plans.routes.ts` | **645 linhas** com `db.*` direto, `try/catch` repetido, dupla escrita (route + service) na lógica de pagamento | **126 linhas** (só roteamento → service via `asyncHandler`) |
| `saas-plans.service.ts` | 64 linhas (só `seedDefaultPlans`, `applyPaymentToSubscription`, `calculateTrialEnd`) | **287 linhas**: 19 funções de caso de uso (planos CRUD, stats, public; clinic-subscriptions list/create/update; mine/limits; admin clinics; payment-history list/create/delete/stats) |
| `saas-plans.repository.ts` | 241 linhas | inalterado (já cobria tudo) |

**Comportamento preservado**: mesmos HTTP status (incluindo o **400** específico para violação de unique `23505` em criação de plano), mesmos payloads (incluindo o `{ ok: true, results }` do seed), mesma rolagem de período (currentPeriodEnd → trialEndDate → hoje + 30 dias) ao registrar pagamento. A responsabilidade de avançar o período após pagamento, antes duplicada entre route handler e `applyPaymentToSubscription`, agora vive **somente** no service.

Validação: `pnpm typecheck` ✅ • `pnpm test` 142/142 ✅ • workflow restart OK.

### Sessão abril/2026 — Sprint 2 (item 1): refator de `medical-records`

**Objetivo:** afinar o roteador do prontuário (950 linhas, ~30 handlers com lógica de DB inline) para o padrão `routes → service → repository`.

**Resultado:**

| Arquivo | Antes | Depois |
|---|---|---|
| `medical-records.routes.ts` | **950 linhas** com `db.*` direto, `try/catch` repetido, `logAudit` inline | **286 linhas**: só roteamento + `validateBody` + `asyncHandler` chamando o serviço |
| `medical-records.service.ts` | 138 linhas (só `buildIndicators`) | **727 linhas**: 30 funções de caso de uso (anamnese, indicadores, medidas corporais, avaliações, planos multi e compat, evoluções, alta, financeiro, anexos, atestados) |
| `medical-records.repository.ts` | 295 linhas (já cobria a maioria) | inalterado — todas as funções já existiam |

**Mudanças funcionalmente equivalentes** (mesmo HTTP status, mesmo payload, mesmos audit logs). Diferenças deliberadas:

- Erros 404/403/400 agora são lançados como `HttpError` e capturados pelo middleware central de erros.
- `try/catch` de boilerplate removido com `asyncHandler`.
- Middleware de tenant-isolation continua rodando primeiro, validando que o `patientId` da rota pertence à clínica do `req.clinicId`.
- A rota POST `/financial` continua devolvendo **404** quando o paciente não existe (foreign key violation `23503` traduzida no service).

Validação: `pnpm typecheck` ✅ • `pnpm test` 142/142 ✅ • workflow restart OK.

### Sessão abril/2026 — Sprint 1: governança e consolidação backend

**Convenção `services/` → `modules/<dominio>/<feature>/<feature>.service.ts`**

A pasta `artifacts/api-server/src/services/` foi removida. Todos os arquivos foram movidos para o módulo dono (ou para `modules/_shared/` se cross-domain) e renomeados para o padrão kebab-case:

| Antes (`src/services/`) | Depois (`src/modules/`) |
|---|---|
| `accountingService.ts` | `_shared/accounting/accounting.service.ts` |
| `financialReportsService.ts` | `financial/_shared/financial-reports.service.ts` |
| `billingService.ts` | `financial/billing/billing.service.ts` |
| `consolidatedBillingService.ts` | `financial/billing/consolidated-billing.service.ts` |
| `billing/billingDateUtils.ts` | `financial/billing/billing-date-utils.ts` |
| `policyService.ts` | `clinical/policies/policy.service.ts` |
| `subscriptionService.ts` | `saas/subscriptions/subscription.service.ts` |
| `__tests__/dbMock.ts` | `_shared/test-utils/db-mock.ts` |
| `__tests__/dateUtils.test.ts` | `utils/dateUtils.test.ts` |

Imports e `vi.mock` ajustados em todos os consumidores (scheduler, módulos financeiros, clínicos, catálogo, saas). Typecheck e 142 testes verdes.

**Governança de repositório**

- `.github/CODEOWNERS` — define revisores padrão; financeiro/billing/scheduler exigem revisão dupla.
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist obrigatório (typecheck/lint/test/openapi/migration/docs).
- `.github/dependabot.yml` — atualizações semanais agrupadas (radix, tanstack, eslint, types) com bloqueio de majors em React/Vite/Tailwind/Express/Drizzle.

**Documentação**

`replit.md` reduzido de 76 KB (1 217 linhas) para 12 KB (~237 linhas). Conteúdo movido para `docs/`:
`architecture.md`, `database.md`, `api.md`, `saas.md`, `financial.md`, `clinical.md`, `design-system.md`, `operations.md`, `market.md`, `changelog.md`.
Convenções arquiteturais (backend e frontend) agora documentadas explicitamente em `replit.md`.

---

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
