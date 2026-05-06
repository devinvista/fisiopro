# FisioGest Pro

A full-stack SaaS clinic management system for physiotherapy, aesthetics, and Pilates clinics — covering scheduling, patient records, billing, financial reports, and multi-tenant subscriptions.

## Run & Operate

| Command | Purpose |
|---|---|
| `pnpm run dev` | Start all services (API on 8080, frontend on 5000) |
| `pnpm run build` | Build libs + frontend + API + run migrations |
| `pnpm run start` | Production start (requires build first) |
| `pnpm run build:libs` | Compile shared TypeScript libs |
| `pnpm db:migrate` | Apply pending SQL migrations |
| `pnpm db:baseline` | Baseline existing DB (one-time for pre-existing DBs) |
| `pnpm db:seed` | Seed default data |
| `pnpm typecheck` | Full type-check all packages |

**Required env vars** (already set in Replit secrets/shared env):
- `DATABASE_URL` — PostgreSQL connection string (Neon)
- `JWT_SECRET` — Secret for signing JWTs
- `CLOUDINARY_URL` — Cloudinary for image/file storage
- `ASAAS_API_KEY` — Asaas payment gateway
- `ASAAS_WEBHOOK_TOKEN` — Asaas webhook verification

## Stack

- **Runtime:** Node.js 22
- **Backend:** Express 5 (TypeScript, bundled via esbuild)
- **Frontend:** React 19 + Vite 8 + Tailwind CSS v4
- **ORM:** Drizzle ORM + Drizzle Kit
- **Database:** PostgreSQL (Neon via `DATABASE_URL`)
- **Validation:** Zod (generated from OpenAPI spec)
- **Auth:** Custom JWT (httpOnly cookies + CSRF middleware)
- **Package manager:** pnpm 10 (monorepo workspace)

## Where things live

```
artifacts/api-server/   — Express API server
artifacts/fisiogest/    — React SPA (Vite)
artifacts/mockup-sandbox/ — UI prototyping app
lib/db/                 — Drizzle ORM schema (source of truth)
lib/api-spec/openapi.yaml — API contract
lib/api-zod/            — Zod schemas (generated)
lib/api-client-react/   — React API client (generated)
lib/shared-constants/   — Shared roles/statuses/plan features
db/migrations/          — SQL migration files
scripts/                — migrate.ts, seed.ts, seed-demo.ts
```

## Architecture decisions

- **Monorepo with pnpm workspaces** — shared `lib/*` packages used by both frontend and backend; catalog versions in `pnpm-workspace.yaml`
- **JWT in httpOnly cookies + CSRF** — avoids XSS token theft; CSRF middleware protects state-mutating endpoints
- **API serves SPA in production** — Express serves `artifacts/fisiogest/dist/public` in prod; Vite dev server proxies `/api` to port 8080 in dev
- **Postgres-backed rate limiting** — `PgRateLimitStore` uses the same DB for rate limit state, no Redis needed
- **Drizzle migrations** — managed SQL migrations in `db/migrations/`; `scripts/migrate.ts` applies them at startup

## Product

- Multi-tenant clinic management (SaaS)
- Appointment scheduling with slot holds and recurring flows
- Patient records (prontuário) and photo management
- Financial billing, wallet/credits, invoicing, and revenue reports
- Subscription plans, coupons, and Asaas payment gateway webhooks
- Public scheduling portal
- Role-based access control (RBAC) with plan feature gating

## User preferences

_Populate as you build_

## Gotchas

- Always run `pnpm run build:libs` before starting the API or frontend in dev — the shared `lib/*` packages must be compiled first
- The Vite dev config reads `API_PORT` (default 8080) to proxy `/api` — set it when running frontend alone
- `SENTRY_DSN_BACKEND` is optional; Sentry is silently disabled if absent
- `DATABASE_URL` exists both as a shared env var and a Replit secret — the secret value takes precedence at runtime

## Pointers

- DB schema: `lib/db/src/schema/`
- API routes: `artifacts/api-server/src/modules/index.ts`
- Drizzle config: `lib/db/drizzle.config.ts`
- OpenAPI spec: `lib/api-spec/openapi.yaml`
