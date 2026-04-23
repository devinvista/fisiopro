# Plano de Sprints — FisioGest Pro

Status: ✅ feito • 🟡 em andamento • ⬜ pendente

> **Última atualização:** abril/2026 — concluídos 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4 (8 itens). Detalhes em `docs/changelog.md`.

---

## Sprint 1 — Segurança (hardening base)

| # | Item | Status | Notas |
|---|---|---|---|
| 1.1 | Auditoria e padronização de secrets/envs (`JWT_SECRET`, `DATABASE_URL`, `CLOUDINARY_*`, `SENTRY_DSN_*`) com checagem em boot e exemplo `.env.example` | ⬜ | Pendente |
| 1.2 | `helmet` com CSP estrita em produção | ✅ | `app.ts` — libera Cloudinary/Sentry, bloqueia frames |
| 1.3 | `compression` em todas as respostas | ✅ | `app.ts` |
| 1.4 | JWT em cookie httpOnly + CSRF (double-submit) | ✅ | `middleware/cookies.ts`, `middleware/csrf.ts`, `auth.routes.ts` (login/register/switch-clinic/logout/impersonate) |
| 1.5 | Frontend cookie-aware (sem `localStorage` de token) | ✅ | `lib/api.ts`, `custom-fetch.ts`, `auth-context.tsx`, guards |
| 1.6 | Política de senha forte + rate-limit por IP+email no login + bloqueio progressivo após N tentativas | ⬜ | Pendente |
| 1.7 | Auditoria de logs sensíveis (PII, tokens, body de auth) com sanitização em `pino-http` | ⬜ | Pendente |

---

## Sprint 2 — API: paginação, filtros, validação

| # | Item | Status | Notas |
|---|---|---|---|
| 2.1 | Paginação cursor-based em listagens grandes (pacientes, agendamentos, lançamentos financeiros, audit-log) | ⬜ | Pendente — próxima recomendada |
| 2.2 | Filtros e ordenação padronizados (`?q=`, `?from=`, `?to=`, `?status=`) com schemas zod centralizados | ⬜ | Pendente |
| 2.3 | Resposta padronizada de erro (formato `{ error, message, details? }`) e contrato em `lib/api-zod` | ⬜ | Pendente |
| 2.4 | Validação consistente de body/query com `validateBody`/`validateQuery` em todas as rotas (hoje parcial) | ⬜ | Pendente |
| 2.5 | Versionamento da API (`/api/v1`) e deprecation headers | ⬜ | Pendente |

---

## Sprint 3 — Infra e escala

| # | Item | Status | Notas |
|---|---|---|---|
| 3.1 | Drizzle migrate em produção (substituir `db:push`) | ✅ | `scripts/migrate.ts` (modos default e `--baseline`); `post-merge.sh` |
| 3.2 | `pg_advisory_lock` no scheduler (uma réplica por job) | ✅ | `scheduler/lock.ts` + `registerJob.ts` |
| 3.3 | Idempotência de billing por (assinatura, ano-mês) | ✅ | `billing-lock.ts` aplicado em billing comum e consolidado |
| 3.4 | Rate limit distribuído em Postgres | ✅ | `PgRateLimitStore` em `middleware/rateLimitStore.ts` |
| 3.5 | Health checks robustos: `/healthz` (liveness) + `/readyz` (DB ping, scheduler ok) | ⬜ | Pendente |
| 3.6 | Backups automáticos do Neon + script de restauração documentado | ⬜ | Pendente |
| 3.7 | Métricas Prometheus (`/metrics` com `prom-client`) — req/s, latência p50/p95/p99 por rota | ⬜ | Pendente |

---

## Sprint 4 — Observabilidade

| # | Item | Status | Notas |
|---|---|---|---|
| 4.1 | Sentry em produção (DSN backend e frontend, source maps no build) | ⬜ | Estrutura pronta (`lib/sentry.ts`); falta DSN + source maps |
| 4.2 | Trace ID propagado entre frontend → backend → DB (header `x-request-id`, hoje só backend) | ⬜ | Pendente |
| 4.3 | Logs estruturados de auditoria de ações sensíveis (impersonate, billing manual, exclusão de pacientes) | ⬜ | Parcial via `audit-log`; ampliar |
| 4.4 | Dashboard de erros + alertas (Sentry → Slack/email) | ⬜ | Pendente |

---

## Sprint 5 — Testes

| # | Item | Status | Notas |
|---|---|---|---|
| 5.1 | Cobertura mínima de 60% em `services/` financeiros (billing, partidas dobradas) | ⬜ | `vitest` configurado; falta escrita |
| 5.2 | Testes de contrato API (zod schemas vs respostas reais) | ⬜ | Pendente |
| 5.3 | Testes E2E com Playwright (login, agendamento, fechamento de mês) | ⬜ | Pendente |
| 5.4 | CI: rodar `typecheck` + `test` + `lint` em PR (`.github/workflows`) | 🟡 | Verificar workflow existente |

---

## Sprint 6 — Performance frontend

| # | Item | Status | Notas |
|---|---|---|---|
| 6.1 | Code splitting por rota (já parcial via `lazy()`); auditar bundles com `rollup-plugin-visualizer` | 🟡 | `App.tsx` usa `lazy`; falta análise |
| 6.2 | React Query: cache compartilhado, `staleTime` por endpoint, prefetch nas navegações | ⬜ | Pendente |
| 6.3 | Virtualização de listas longas (pacientes, lançamentos) com `@tanstack/react-virtual` | ⬜ | Pendente |
| 6.4 | Imagens otimizadas via Cloudinary (`f_auto,q_auto,w_*`) em todos os componentes | ⬜ | Parcial |

---

## Sprint 7 — Pagamentos R$ (PIX/cartão)

| # | Item | Status | Notas |
|---|---|---|---|
| 7.1 | Integração com gateway (Stripe BR / Mercado Pago / Pagar.me) com webhooks | ⬜ | Pendente — ver `docs/financial.md` |
| 7.2 | Cobrança automática de mensalidade SaaS via cartão recorrente | ⬜ | Pendente |
| 7.3 | Reconciliação automática de pagamentos PIX recebidos | ⬜ | Pendente |
| 7.4 | Painel financeiro de inadimplência com régua de cobrança (email/WhatsApp) | ⬜ | Pendente |

---

## Sprint 8 — UX/produto

| # | Item | Status | Notas |
|---|---|---|---|
| 8.1 | Onboarding guiado para nova clínica (tour + dados de exemplo) | ⬜ | Pendente |
| 8.2 | Notificações em tempo real (SSE ou WebSocket) — confirmação de agendamento, sessão concluída | ⬜ | Pendente |
| 8.3 | App mobile (PWA installable) com push notifications | ⬜ | Pendente |
| 8.4 | Relatórios exportáveis em PDF (financeiro, prontuário) | ⬜ | Pendente |

---

## Sprint 9 — Compliance e LGPD

| # | Item | Status | Notas |
|---|---|---|---|
| 9.1 | Política de privacidade + termo de uso versionados, aceite registrado em `users.termsAcceptedAt` | ⬜ | Pendente |
| 9.2 | Endpoint de exportação de dados do paciente (LGPD direito de portabilidade) | ⬜ | Pendente |
| 9.3 | Endpoint de anonimização/exclusão (LGPD direito ao esquecimento) com soft-delete + purge | ⬜ | Pendente |
| 9.4 | Criptografia at-rest de campos sensíveis (CPF, telefone) com `pgcrypto` | ⬜ | Pendente |
| 9.5 | Retenção configurável de logs e prontuários conforme CFM/LGPD (20 anos) | ⬜ | Pendente |

---

## Resumo

- **Concluídos:** 8 itens (Sprint 1: 1.2, 1.3, 1.4, 1.5 + Sprint 3: 3.1, 3.2, 3.3, 3.4)
- **Em andamento:** 5.4, 6.1
- **Pendentes:** 32 itens distribuídos em 9 sprints

**Próxima recomendação:** Sprint 2.1 (paginação cursor-based) — bloqueador antes que qualquer listagem grande chegue à produção.
