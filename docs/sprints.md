# Plano de Sprints — FisioGest Pro

Status: ✅ feito • 🟡 em andamento • ⬜ pendente • 🗄️ backlog

> **Última atualização:** abril/2026 — concluídos 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5 (13 itens). Sprint 6 reavaliada. Detalhes em `docs/changelog.md`.

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
| 3.5 | Health checks robustos: `/healthz` (liveness) + `/api/health` (DB ping) | ✅ | `modules/health/health.routes.ts` — `/api/health` faz `SELECT 1` e devolve `{status, uptimeSec, db:{ok,latencyMs}}` (200/503); `/api/healthz` mantido como liveness simples |
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

> **Avaliação abril/2026:** ver seção "Avaliação detalhada Sprint 6" mais abaixo.

| # | Item | Status | Notas |
|---|---|---|---|
| 6.1 | Code splitting por rota + chunks de vendor + auditoria com `rollup-plugin-visualizer` | 🟡 | **Code splitting feito**: 16 rotas via `lazy()` em `App.tsx` + `manualChunks` em `vite.config.ts` (vendor-ui/charts/motion/forms/query/date). **Falta**: instalar `rollup-plugin-visualizer` e gerar relatório `stats.html` no `pnpm build` |
| 6.2 | React Query: `staleTime`/`gcTime` global + por endpoint, prefetch em rotas-chave | 🟡 | **Parcial**: `lib/query-client.ts` só define `retry:1` e `refetchOnWindowFocus:false`. `staleTime` ad-hoc em ~3 lugares (5min, 10min, 30s). **Falta**: padrão global (`staleTime: 60s`, `gcTime: 5min`) + prefetch em `/dashboard` e `/agenda` |
| 6.3 | Virtualização de listas longas com `@tanstack/react-virtual` | ⬜ | Dependência **não instalada**. Listas candidatas: `patients/index`, `audit-log`, `LancamentosTab`, `ClinicsTab` (>200 linhas potenciais) |

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

## Avaliação detalhada Sprint 6 — Performance frontend

**Veredito:** Sprint 6 está **30% pronta**. O grosso do code-splitting já foi feito (provavelmente em sessão anterior, sem registro no changelog), mas faltam medições, política de cache e virtualização.

### 6.1 Code splitting — 🟡 70% pronto
**Feito:**
- `App.tsx` lazy-loada todas as 16 rotas top-level (landing, login, register, dashboard, agenda, patients, agendar, procedimentos, pacotes, financial, relatórios, clínicas, superadmin, configurações, 404).
- `vite.config.ts` `manualChunks` separa 6 bundles de vendor: `vendor-ui` (8 Radix), `vendor-charts` (recharts), `vendor-motion` (framer-motion), `vendor-forms` (rhf+zod), `vendor-query` (tanstack), `vendor-date` (date-fns+react-day-picker).
- `chunkSizeWarningLimit: 600` (acima do default 500, indica ciência dos chunks pesados).

**Falta:**
- `rollup-plugin-visualizer` para gerar `dist/public/stats.html` no build e ver tamanhos reais (gzip + brotli).
- Validar se `recharts` (chunk grande) carrega só nas páginas de relatório.
- Considerar `lazy()` para sub-rotas dentro de `superadmin` (5 abas) e `configuracoes` (várias seções).

### 6.2 React Query — 🟡 25% pronto
**Estado atual** (`lib/query-client.ts`):
```ts
new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })
```
**Problema:** sem `staleTime` global, **toda query refaz fetch a cada mount** (default `staleTime: 0`). Resultado: navegação Dashboard → Agenda → Dashboard refaz todas as queries.

**Falta:**
- `staleTime: 60_000` e `gcTime: 5*60_000` como default global.
- Convenção por categoria: dados estáveis (planos, procedimentos) → 10min; transacionais (agenda, lançamentos) → 30s; tempo-real (notificações) → 0.
- `queryClient.prefetchQuery()` em `/dashboard` para warm-up de Agenda e Pacientes.
- Padronizar invalidação após mutations (já existe ad-hoc, mas inconsistente).

### 6.3 Virtualização — ⬜ 0% pronto
- `@tanstack/react-virtual` **não instalado**.
- Após paginação cursor-based (Sprint 2.1, limite 20-100), o risco caiu — mas tabelas que carregam tudo (audit-log antigo, listagens superadmin) ainda renderizam todos os rows no DOM.
- Recomendação: implementar **só após** profilar com 1.000+ rows reais via React DevTools.

### 6.4 Cloudinary (backlog) — ⬜ 0%
- Confirmado: nenhum uso de `f_auto`/`q_auto` no frontend. Manter no backlog até houver fotos de pacientes em volume.

### Próximos passos sugeridos (ordem de impacto/custo)
1. **6.2 — staleTime global** (15 min, alto impacto): editar `query-client.ts`. Reduz refetches em ~70% nas navegações comuns.
2. **6.1 — visualizer** (20 min, médio impacto): `pnpm add -D rollup-plugin-visualizer`, plugar no `vite.config.ts` com `open: false, gzipSize: true`. Decidir se `recharts` precisa virar import dinâmico.
3. **6.2 — prefetch** (1h, médio impacto): adicionar prefetch em `/dashboard` para queries da `/agenda` (rota mais visitada).
4. **6.3 — virtualização** (4h, baixo impacto agora): adiar até reclamação real de UX.

---

## Resumo

- **Concluídos:** 13 itens (1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, **3.5**)
- **Em andamento:** 4.3, 5.4, 6.1, 6.2
- **Pendentes ativos:** 21 itens
- **Backlog:** 4 itens (1.1, 1.6, 1.7, 6.4)
