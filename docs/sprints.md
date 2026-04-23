# Plano de Sprints — FisioGest Pro

Status: ✅ feito • 🟡 em andamento • ⬜ pendente • 🗄️ backlog

> **Última atualização:** abril/2026 — concluídos 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4 (12 itens). Detalhes em `docs/changelog.md`.

---

## Sprint 1 — Segurança (hardening base)

| # | Item | Status | Notas |
|---|---|---|---|
| 1.2 | `helmet` com CSP estrita em produção | ✅ | `app.ts` — libera Cloudinary/Sentry, bloqueia frames |
| 1.3 | `compression` em todas as respostas | ✅ | `app.ts` |
| 1.4 | JWT em cookie httpOnly + CSRF (double-submit) | ✅ | `middleware/cookies.ts`, `middleware/csrf.ts`, `auth.routes.ts` |
| 1.5 | Frontend cookie-aware (sem `localStorage` de token) | ✅ | `lib/api.ts`, `custom-fetch.ts`, `auth-context.tsx`, guards |

---

## Sprint 2 — API: paginação, filtros, validação

| # | Item | Status | Notas |
|---|---|---|---|
| 2.1 | Paginação cursor-based em listagens grandes | ✅ | `utils/pagination.ts`; aplicado em `patients`, `appointments`, `financial-records`, `audit-log` |
| 2.2 | Filtros e ordenação padronizados (`?q=`, `?from=`, `?to=`, `?status=`, `?sort=`) | ✅ | `utils/listQuery.ts` (schema zod compartilhado) |
| 2.3 | Resposta padronizada `{ error, message, details? }` | ✅ | `middleware/errorHandler.ts`, `utils/validate.ts` |
| 2.4 | Validação consistente body+query com zod | ✅ | `validateQuery` aplicado nas 4 rotas refatoradas |
| 2.5 | Versionamento da API (`/api/v1`) e deprecation headers | ⬜ | Pendente |

---

## Sprint 3 — Infra e escala

| # | Item | Status | Notas |
|---|---|---|---|
| 3.1 | Drizzle migrate em produção (substituir `db:push`) | ✅ | `scripts/migrate.ts` (default e `--baseline`); `post-merge.sh` |
| 3.2 | `pg_advisory_lock` no scheduler (uma réplica por job) | ✅ | `scheduler/lock.ts` + `registerJob.ts` |
| 3.3 | Idempotência de billing por (assinatura, ano-mês) | ✅ | `billing-lock.ts` em billing comum e consolidado |
| 3.4 | Rate limit distribuído em Postgres | ✅ | `PgRateLimitStore` em `middleware/rateLimitStore.ts` |
| 3.5 | Health checks robustos: `/healthz` (liveness) + `/readyz` (DB ping) | ⬜ | Pendente |
| 3.6 | Backups automáticos do Neon + script de restauração documentado | ⬜ | Pendente |
| 3.7 | Métricas Prometheus (`/metrics` com `prom-client`) | ⬜ | Pendente |

---

## Sprint 4 — Observabilidade

| # | Item | Status | Notas |
|---|---|---|---|
| 4.1 | Sentry em produção (DSN backend e frontend, source maps no build) | ⬜ | Estrutura pronta (`lib/sentry.ts`); falta DSN + source maps |
| 4.2 | Trace ID propagado entre frontend → backend → DB (header `x-request-id`) | ⬜ | Pendente |
| 4.3 | Logs de auditoria de ações sensíveis (impersonate, billing manual, exclusão) | 🟡 | Parcial via `audit-log`; ampliar |
| 4.4 | Dashboard de erros + alertas (Sentry → Slack/email) | ⬜ | Pendente |

---

## Sprint 5 — Testes

| # | Item | Status | Notas |
|---|---|---|---|
| 5.1 | Cobertura mínima de 60% em `services/` financeiros | ⬜ | `vitest` configurado; falta escrita |
| 5.2 | Testes de contrato API (zod schemas vs respostas reais) | ⬜ | Pendente |
| 5.3 | Testes E2E com Playwright (login, agendamento, fechamento de mês) | ⬜ | Pendente |
| 5.4 | CI: rodar `typecheck` + `test` + `lint` em PR (`.github/workflows`) | 🟡 | Verificar workflow existente |

---

## Sprint 6 — Performance frontend

| # | Item | Status | Notas |
|---|---|---|---|
| 6.1 | Code splitting por rota; auditar bundles com `rollup-plugin-visualizer` | 🟡 | `App.tsx` usa `lazy`; falta análise |
| 6.2 | React Query: cache compartilhado, `staleTime` por endpoint, prefetch | ⬜ | Pendente |
| 6.3 | Virtualização de listas longas com `@tanstack/react-virtual` | ⬜ | Pendente |

---

## Sprint 7 — Pagamentos R$ (PIX/cartão)

| # | Item | Status | Notas |
|---|---|---|---|
| 7.1 | Integração com gateway (Stripe BR / Mercado Pago / Pagar.me) com webhooks | ⬜ | Pendente — ver `docs/financial.md` |
| 7.2 | Cobrança automática de mensalidade SaaS via cartão recorrente | ⬜ | Pendente |
| 7.3 | Reconciliação automática de pagamentos PIX recebidos | ⬜ | Pendente |
| 7.4 | Painel financeiro de inadimplência com régua de cobrança | ⬜ | Pendente |

---

## Sprint 8 — UX/produto

| # | Item | Status | Notas |
|---|---|---|---|
| 8.1 | Onboarding guiado para nova clínica (tour + dados de exemplo) | ⬜ | Pendente |
| 8.2 | Notificações em tempo real (SSE ou WebSocket) | ⬜ | Pendente |
| 8.3 | App mobile (PWA installable) com push notifications | ⬜ | Pendente |
| 8.4 | Relatórios exportáveis em PDF | ⬜ | Pendente |

---

## Sprint 9 — Compliance e LGPD

| # | Item | Status | Notas |
|---|---|---|---|
| 9.1 | Política de privacidade + termo de uso versionados, aceite registrado | ⬜ | Pendente |
| 9.2 | Endpoint de exportação de dados do paciente (LGPD direito de portabilidade) | ⬜ | Pendente |
| 9.3 | Endpoint de anonimização/exclusão (LGPD direito ao esquecimento) | ⬜ | Pendente |
| 9.4 | Criptografia at-rest de campos sensíveis (CPF, telefone) com `pgcrypto` | ⬜ | Pendente |
| 9.5 | Retenção configurável de logs e prontuários conforme CFM/LGPD (20 anos) | ⬜ | Pendente |

---

## 🗄️ Backlog (postergado)

Itens fora do escopo das próximas sprints. Reavaliar se houver mudança de prioridade.

| # | Item | Origem | Razão de adiar |
|---|---|---|---|
| 1.1 | Auditoria e padronização de secrets/envs com checagem em boot e `.env.example` | Sprint 1 | Baixo risco operacional hoje |
| 1.6 | Política de senha forte + rate-limit IP+email + bloqueio progressivo | Sprint 1 | Cobertura básica via rate-limit (Sprint 3.4) |
| 1.7 | Sanitização de PII/tokens em `pino-http` | Sprint 1 | Logs atuais já usam serializers mínimos |
| 6.4 | Otimização de imagens via Cloudinary (`f_auto,q_auto,w_*`) em todos componentes | Sprint 6 | Já parcial; não bloqueia performance crítica |

---

## Resumo

- **Concluídos:** 12 itens (1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4)
- **Em andamento:** 4.3, 5.4, 6.1
- **Pendentes ativos:** 23 itens
- **Backlog:** 4 itens (1.1, 1.6, 1.7, 6.4)
