# FisioGest Pro

A comprehensive SaaS clinic management platform for physiotherapists, aestheticians, and Pilates instructors — featuring electronic health records, multi-tenant scheduling, financial management, SaaS billing, and LGPD compliance.

## Run & Operate

- **Dev**: `pnpm run dev` — starts all services in parallel (libs build → API on 8080, frontend on 5000, mockup sandbox on 8081)
- **Build**: `pnpm run build` — builds libs + frontend SPA + backend bundle, then runs migrations
- **Start (prod)**: `pnpm start` — runs `node artifacts/api-server/dist/index.cjs`
- **DB migrate**: `pnpm db:migrate`
- **DB seed**: `pnpm db:seed` / `pnpm db:seed-demo`
- **Typecheck**: `pnpm typecheck`
- **Tests**: `pnpm test` (Vitest unit), `pnpm test:mobile` (Playwright E2E)

### Required env vars (set in Replit shared env)
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET` — secret for signing JWT tokens
- `CLOUDINARY_URL` — image storage
- `ASAAS_API_KEY` — SaaS billing integration
- `ASAAS_WEBHOOK_TOKEN` — webhook verification

## Stack

- **Runtime**: Node.js 22, pnpm 10 monorepo
- **Frontend**: React 19, Vite 7, TailwindCSS v4, shadcn/ui, TanStack Query v5, Wouter, Recharts, Framer Motion
- **Backend**: Express 5, Pino logging, node-cron scheduler
- **Database**: PostgreSQL (Neon) + Drizzle ORM, migrations in `db/migrations/`
- **Auth**: Custom JWT in httpOnly cookies + bcryptjs
- **Code generation**: Orval (API client from OpenAPI spec)

## Where things live

- `artifacts/api-server/src/` — Express backend, domain modules under `modules/`
- `artifacts/fisiogest/src/` — React SPA frontend
- `artifacts/mockup-sandbox/` — UI prototyping sandbox (port 8081)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB)
- `lib/api-spec/` — OpenAPI YAML spec (source of truth for API contract)
- `lib/api-zod/` — Zod schemas generated from OpenAPI spec
- `lib/api-client-react/` — React Query hooks generated from OpenAPI spec
- `lib/shared-constants/` — Enums, roles, plan features
- `db/migrations/` — SQL migration files
- `scripts/` — migrate.ts, seed.ts, seed-demo.ts, post-merge.sh

## Architecture decisions

- **Monorepo with pnpm workspaces**: shared libs are built first (`build:libs`), then consumed by frontend and backend
- **Code generation pipeline**: OpenAPI spec → Orval → Zod schemas + React Query hooks — never edit generated files directly
- **JWT in httpOnly cookies**: CSRF middleware protects mutation endpoints; no localStorage tokens
- **SPA + API on same origin in prod**: Express serves static SPA assets and the REST API, avoiding CORS complexity
- **External Neon DB**: project uses Neon PostgreSQL (not Replit's built-in Helium DB) — `DATABASE_URL` env var takes precedence

## Product

- Multi-tenant clinic management (one account per clinic)
- Electronic health records (prontuários)
- Appointment scheduling with slot management
- Financial management with double-entry accounting
- SaaS billing via Asaas integration
- Image uploads via Cloudinary
- LGPD-compliant data handling

## User preferences

_Populate as you build_

## Gotchas

- Always run `pnpm run build:libs` before running the API server or frontend in dev — the shared libs must be compiled first
- After adding/changing OpenAPI spec, regenerate with `orval` in `lib/api-spec/`
- The `DATABASE_URL` shared env var points to Neon DB and overrides any Replit Helium DB secret
- `pnpm db:baseline` is a one-time command for DBs already created via `db:push` — don't run it on fresh DBs

## Pointers

- Skills: `.local/skills/react-vite/SKILL.md`, `.local/skills/database/SKILL.md`
- Drizzle config: `lib/db/drizzle.config.ts`
- API spec: `lib/api-spec/openapi.yaml`
- Post-merge script: `scripts/post-merge.sh`
