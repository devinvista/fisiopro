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

> **Convenção de importação:** sempre importar `useAuth` de `@/hooks/use-auth`. O `auth-context.tsx` exporta apenas `AuthProvider` e `AuthContext`. O hook `useAuth` agora expõe `refreshUser()` para rebuscar `/api/auth/me` e atualizar o usuário no contexto (usado, por exemplo, após o aceite das políticas LGPD para que o modal não reapareça em cada navegação de página).

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

## Regra Máxima de Compatibilidade (Hospedagem)

> **Esta regra tem prioridade sobre qualquer outra escolha técnica.** Toda dependência de runtime, framework ou gerenciador de pacotes adicionada ao projeto **DEVE** estar dentro da matriz oficial de compatibilidade da plataforma de hospedagem. Qualquer PR/refatoração que introduza tecnologia fora desta lista deve ser rejeitada.

**Matriz oficial de compatibilidade:**

| Categoria | Opções permitidas | Escolha do projeto | Justificativa |
|---|---|---|---|
| **Frontend** | Angular, Astro, Next.js, Nuxt, Parcel, **React**, React Router, Svelte, SvelteKit, **Vite**, Vue.js | **React 19 + Vite 7** | Combinação mais moderna e eficiente para SPA com tooling rápido (HMR sub-segundo, build via Rollup/esbuild), ecossistema shadcn/ui maduro, suporte total a React Server Components opcional |
| **Backend** | Astro, **Express**, Fastify, Hono, NestJS, Next.js, Nuxt, React Router, SvelteKit | **Express 5** | API REST stateless desacoplada do frontend; Express 5 traz async/await nativo, melhor tratamento de erros e mantém o maior ecossistema de middlewares Node |
| **Node.js** | 24.x, 22.x | **22.x (LTS)** | LTS estável até abril/2027; cobre todos os requisitos (Vite 7, ESM, fetch nativo) sem o churn da 24 |
| **Gerenciador de pacotes** | npm, yarn, **pnpm** | **pnpm 10** (workspaces) | Único com suporte nativo a monorepo via `pnpm-workspace.yaml`, store global deduplicado e instalação até 2× mais rápida que npm/yarn |

**Decisões e por que NÃO escolhemos as alternativas:**
- **Next.js / Nuxt / SvelteKit / React Router (framework):** descartados porque o backend é uma API REST independente (Express) e o frontend é uma SPA pura — não precisamos de SSR/SSG/file-based routing. Adotar um meta-framework adicionaria complexidade sem ganho real.
- **NestJS / Fastify / Hono:** Express 5 cobre o caso de uso com menor curva de aprendizado e maior compatibilidade com o ecossistema atual de middlewares (cors, cookie-parser, multer, etc.).
- **Astro:** focado em conteúdo estático/MPA; inadequado para um SaaS altamente interativo.
- **Angular / Vue / Svelte:** o time já é proficiente em React; trocar a linguagem de view não traria ganho de eficiência.
- **Parcel:** Vite é mais rápido em dev (esbuild + Rollup) e tem ecossistema de plugins mais ativo.
- **Node 24.x:** ainda não é LTS; mantemos 22.x para estabilidade de produção.
- **npm / yarn:** sem suporte de primeira classe para monorepo eficiente; pnpm já está padronizado.

> **Antes de adicionar qualquer dependência nova**, confirme que ela é compatível com Node 22, ESM e pnpm workspaces. Antes de propor uma migração de framework, valide que o destino está nesta matriz.

---

## Stack Técnica

- **Node.js**: **22.x LTS** (compatível com a matriz de hospedagem; requer 20+ para Vite 7)
- **Gerenciador de pacotes**: **pnpm 10.26** (workspace) — opção mais eficiente da matriz
- **TypeScript**: 5.9
- **Frontend** (`artifacts/fisiogest`): **React 19 + Vite 7** + TailwindCSS v4 + shadcn/ui (new-york) — combinação mais moderna da matriz
- **Backend** (`artifacts/api-server`): **Express 5** — opção mais leve e madura da matriz para API REST pura
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
- **Sprint 1 — cutover unificação:** mensal/faturaConsolidada agora moram em `patient_packages` (campos `recurrence_status`, `recurrence_type`, `billing_day`, `monthly_amount`, `next_billing_date`). Os jobs `runBilling`/`runConsolidatedBilling` iteram em `patient_packages` por padrão (`BILLING_FROM_PACKAGES=1`); cobranças vinculam-se via `financial_records.patient_package_id`. `LEGACY_AUTO_SUBSCRIPTION=0` por padrão — não cria mais espelho em `patient_subscriptions`. `POST /api/subscriptions` retorna **410 Gone** apontando para `POST /api/patients/:patientId/packages` (GET/PUT/DELETE preservados para gestão do legado). Drop final de `patient_subscriptions` planejado para Sprint 6.
- `absence_credit_limit` limita quantos créditos de ausência/cancelamento podem ser gerados por mês em pacotes mensais. Limite `0` bloqueia créditos automáticos.
- `next_billing_date` é preenchido na criação de assinaturas, tanto pela contratação de pacote quanto pela criação direta de assinatura.
- Fatura consolidada é um produto real na UI: atendimentos concluídos geram lançamentos `pendenteFatura`, e o job mensal cria uma única `faturaConsolidada`.
- O financeiro usa ledger contábil formal por partidas dobradas (`accounting_accounts`, `accounting_journal_entries`, `accounting_journal_lines`, `receivable_allocations`) como fonte de verdade para caixa, receita por competência, contas a receber, adiantamentos e DRE.
- `financial_records` permanece como camada operacional/compatibilidade e guarda vínculos `accounting_entry_id`, `recognized_entry_id` e `settlement_entry_id`.
- Depósitos em carteira e vendas antecipadas de pacote entram como caixa + adiantamento de cliente; receita só é reconhecida no uso da carteira ou consumo do crédito/sessão.
- `faturaConsolidada` funciona como agrupador/cobrança oficial; a receita de competência é reconhecida pelos atendimentos/itens, sem duplicar no fechamento da fatura.
- Pagamentos manuais baixam títulos existentes via `receivable_allocations`; quando não há título pendente, viram recebimento direto.

### Resolução de preço (Sprint 1 — `appointments.pricing.ts`)

Toda cobrança de atendimento passa pelo helper `resolveEffectivePrice(patientId, procedureId, clinicId)` em `artifacts/api-server/src/modules/clinical/appointments/appointments.pricing.ts`. A hierarquia é:

1. **Plano de tratamento ativo** do paciente (`treatment_plan_procedures.unitPrice − discount`, com clamp em 0 — desconto é valor absoluto em R$, não percentual). Plano mais recente vence se houver mais de um.
2. **Override da clínica** (`procedure_costs.priceOverride`).
3. **Tabela** (`procedures.price`).

O preço pode ser **menor OU maior** que a tabela: o "Preço negociado" do plano é respeitado sem teto. Para auditoria, `financial_records` grava `price_source` (`tabela | override_clinica | plano_tratamento`), `original_unit_price` (preço de catálogo na época) e `treatment_plan_id`.

### Plano de tratamento como "venda formal" (Sprint 2 — T4)

- `POST /api/patients/:patientId/treatment-plans/:planId/accept` — aceita o plano: gera snapshot dos preços vigentes em `treatment_plans.frozen_prices_json` (estrutura `FrozenPricesSnapshot`) e marca `accepted_at` / `accepted_by`. **Sprint 2 (Redesign — abr/2026):** o body é obrigatório `{ signature }` e captura também IP + user-agent + via para a trilha LGPD (campos `accepted_by_signature`, `accepted_ip`, `accepted_device`, `accepted_via`). Após gravar, dispara `acceptPlanFinancials(planId)` (faturas + créditos do mês) — **NÃO** chama mais `materializeTreatmentPlan` (sem agendamentos automáticos).
- Após aceito: `PUT /treatment-plans/:planId` só aceita alterar campos "soft" (`status`, `objectives`, `techniques`, `responsibleProfessional`). Tentativas de alterar `frequency`, `estimatedSessions`, `startDate` retornam `409 Conflict` exigindo renegociação.
- Endpoint é idempotente (chamar duas vezes não reescreve o snapshot).
- O snapshot inclui `totalEstimatedRevenue` para alimentar projeção de receita futura.
- `POST /api/patients/:patientId/treatment-plans/:planId/renegotiate` — gera nova versão do plano: clona os procedimentos, aplica overrides do payload (campos top-level — `frequency`, `estimatedSessions`, `startDate`, `objectives`, `techniques`, `responsibleProfessional`), aponta `parent_plan_id` para o anterior e marca o anterior como `concluido`. O novo plano nasce **sem aceite** — precisa ser revisado e aceito separadamente para congelar o novo snapshot. Exige plano anterior `aceito` + `status='ativo'` (HTTP 409 caso contrário).
- Histórico fiscal: o plano original mantém `frozen_prices_json` intacto após renegociação; toda a árvore de versões é navegável via `parent_plan_id` (índice `idx_treatment_plans_parent`).

#### Aceite remoto via link público (Sprint 2 Redesign — abr/2026)
- `POST /api/patients/:patientId/treatment-plans/:planId/public-link` (auth) — gera (ou reaproveita) um token de aceite válido por **7 dias**. Retorna `{ url, token, expiresAt, reused }`. URL = `${APP_PUBLIC_URL || Origin}/aceite/${token}`. Tokens ficam em `treatment_plan_acceptance_tokens` (índices em `plan_id` e `expires_at`).
- `GET  /api/public/treatment-plans/by-token/:token` (sem auth) — devolve snapshot público (nome do paciente + termos comerciais; SEM CPF/telefone). Status do token (`valid|expired|used|not_found`) → 200/410/409/404.
- `POST /api/public/treatment-plans/by-token/:token/accept` (sem auth) — body `{ signature }`. Mesmo fluxo do aceite presencial, mas com `via='link'` e sem usuário interno (`accepted_by = NULL`, `frozen_prices_snapshot.capturedBy = 0`). Após sucesso, marca `used_at = now()` no token.
- Frontend: página pública `/aceite/:token` em `pages/public/aceite.tsx` (mobile-first); `TreatmentPlanTab` ganha o `AcceptanceBlock` com 2 caminhos antes do aceite (presencial / link) e card verde imutável após aceite mostrando a trilha LGPD ao operador.

#### Decisão de schema: `kind` em vez de renomear tabela
- `treatment_plan_procedures.kind` (`recorrenteMensal|pacoteSessoes|avulso`, nullable) — quando NULL, o backend deriva via `resolveItemKind()` do `packages.packageType` (compat para planos pré-Sprint 2 Redesign). **Não renomeamos `treatment_plan_procedures` → `treatment_plan_items`** para evitar migration destrutiva; renomeação fica opcional para o Sprint 6.
- `treatment_plans.status`: novo domínio canônico `rascunho|vigente|encerrado|cancelado`. Mantemos `ativo`/`concluido` como sinônimos de leitura. O aceite promove `rascunho → vigente` automaticamente.

#### `acceptPlanFinancials(planId)` (módulo `treatment-plans.acceptance.ts`)
- Idempotente, transacional. Para cada item:
  - **`pacoteSessoes`**: 1 fatura `vendaPacote` (status `pendente`, dueDate=hoje) + N créditos em `session_credits` (status segue `paymentMode`: `prepago`→`pendentePagamento`, `postpago`→`disponivel`).
  - **`recorrenteMensal`**: 1 fatura `faturaPlano` do mês corrente (próximas continuam vindo do job mensal; usa `billingDay` do pacote clamped ao último dia do mês).
  - **`avulso`**: nenhum efeito agora — cobrança ocorre na conclusão do atendimento.
- Idempotência por `(plan_id, plan_procedure_id [, plan_month_ref])`.
- Falhas no efeito financeiro **não derrubam o aceite** (operador reemite manualmente; `audit_log` com prefixo `[ALERTA]`).

### Fluxo de Caixa Projetado (Sprint 3 — T7)

- **Endpoint:** `GET /api/financial/cash-flow-projection?days=N` (1..180), gated por `requireFeature("financial.view.cash_flow")` + `requirePermission("financial.read")`.
- **Saldo inicial:** `getAccountingBalances()` na conta contábil `1.1.1` (Caixa/Banco) — débito − crédito acumulado até hoje.
- **Entradas projetadas:** `financial_records` `type=receita` `status=pendente` em `RECEIVABLE_TYPES`, agregadas por `due_date`.
- **Saídas projetadas:**
  - Despesas pontuais pendentes (`financial_records` `type=despesa` `status=pendente`) por `due_date`.
  - `recurring_expenses` ativas, projetadas pela frequência:
    - `mensal` → reocorre no mesmo dia do `createdAt` (clamp em 28 pra evitar saltos de fevereiro);
    - `semanal` → cada 7 dias a partir de `createdAt`;
    - `anual` → aniversário do `createdAt`.
- **Alertas por dia:** `negative` quando `closing < 0`; `below_reserve` quando `closing < cash_reserve_target` (configurado em `clinic_financial_settings`).
- **Frontend:** aba "Fluxo de Caixa" (`pages/financial/components/CashFlowTab.tsx`) com seletor 15/30/60/90 dias, KPIs (saldo inicial/entradas/saídas/saldo final/menor saldo), gráfico recharts (área de saldo + barras in/out + linha tracejada vermelha na reserva mínima) e tabela diária com badges de status. Banner clicável leva pra `Configurações → Financeiro` quando a reserva ainda não foi configurada.
- **Cobertura:** puro cálculo dinâmico, sem schema novo. T7 ✅.

### Categorização contábil por procedimento (Sprint 3 — T8)

- **Schema:** `procedures.accounting_account_id` (integer, FK opcional para
  `accounting_accounts`) já existia; agora é exposto em `createProcedureSchema`/
  `updateProcedureSchema` e propagado pelo service.
- **CRUD de sub-contas:** `POST/GET/PUT/DELETE /api/financial/accounting/accounts`
  em `modules/financial/accounting/accounting.routes.ts` — gated por feature
  `financial.view.accounting` + `requirePermission("financial.write")`.
  `DELETE` bloqueia remoção quando há `accounting_journal_lines` ou procedimento
  referenciando a conta.
- **Helper:** `resolveAccountCodeById(accountId, fallbackCode, clinicId)` em
  `accounting.service.ts`. Os postings de receita
  (`postCashReceipt`, `postReceivableRevenue`, `postWalletUsage`,
  `postPackageCreditUsage`) aceitam `revenueAccountCode` opcional; quando
  ausente caem na conta padrão (`4.1.1` ou `4.1.2`).
- **Fluxo de cobrança:** `appointments.billing.ts` resolve
  `procedureRevenueAccountCode` / `procedurePackageRevenueAccountCode` via
  `resolveAccountCodeById` e propaga em **todos** os caminhos de receita
  (consolidada, uso de carteira, uso de crédito de pacote, a-receber 3×).
- **DRE por procedimento:** `GET /api/financial/accounting/dre-by-procedure?from&to`
  agrega `accounting_journal_lines.creditAmount` por `procedure_id` (do
  `journal_entries`) + `account_code` da linha. Retorna `procedures[]` com
  `accounts[]` (cada uma com `code`, `name`, `total`) + `totalRevenue` global.
- **Frontend:**
  - `ProcedureFormModal` ganhou Select "Conta contábil de receita" (gated por
    `financial.view.accounting`); sentinel `__default__` no Radix representa
    "usar conta padrão" (Radix `Select` proíbe `value=""`).
  - Nova aba **"DRE/Procedimento"** (`pages/financial/components/DreByProcedureTab.tsx`)
    no `Financial`, gated por `financial.view.accounting`. T8 ✅.

### Auditoria robusta de estornos (Sprint 3 — T9)

- **Schema (aditivo):** `financial_records` ganhou `original_amount` (numeric),
  `reversal_reason` (text), `reversed_by` (FK `users.id`) e `reversed_at`
  (timestamp). Tudo nullable, aplicado via SQL idempotente
  `ADD COLUMN IF NOT EXISTS` (drizzle-kit push exige TTY indisponível neste
  ambiente; preferimos SQL aditivo manual em vez de `db:push --force` para
  preservar tipos de IDs).
- **Endpoints:**
  - `POST /api/financial/records/:id/estorno` exige `reversalReason` (mín. 3
    chars), salva valor original em `original_amount`, autor em `reversed_by`
    e timestamp em `reversed_at`. Mudança de status para `cancelado/estornado`
    via PATCH segue o mesmo contrato.
  - `GET /api/financial/records/reversals?cursor=&limit=&from=&to=` retorna
    histórico paginado por cursor, com joins (autor do estorno, paciente,
    procedimento).
- **Frontend:**
  - Modal de estorno em `FinancialTab` ganhou `Textarea` obrigatório de motivo;
    botão desabilitado enquanto não digitar 3+ chars.
  - Nova aba **"Estornos"** (`pages/financial/components/EstornosTab.tsx`)
    lista o histórico com autor, motivo, valor original × valor atual e
    busca cliente-side por descrição/paciente. T9 ✅.

### Diferenciação por plano SaaS (Sprint 2 — T6)

Catálogo de features financeiras em `lib/shared-constants/src/plan-features.ts`:

| Feature | Plano mínimo |
|---|---|
| `financial.view.simple` (caixa entrada/saída) | essencial |
| `financial.view.cash_flow` (fluxo projetado) | profissional |
| `financial.view.dre` | profissional |
| `financial.view.budget` (orçado vs realizado) | profissional |
| `financial.cost_per_procedure` | profissional |
| `financial.view.accounting` (plano de contas completo) | premium |

Use `requireFeature(feature)` no backend e `<FeatureGate feature="...">` no frontend. Aplicação dos gates nas telas/rotas é a próxima iteração de Sprint 2.

### Enforcement de limites quantitativos (Gap #3)

Cada plano SaaS tem campos `maxPatients`, `maxUsers`, `maxSchedules` e
`maxProfessionals` em `subscription_plans`. O middleware
`enforceLimit(resource, options?)` em
`artifacts/api-server/src/middleware/subscription.ts` consolida o bloqueio:

* Plugado em `POST /patients`, `POST /admin/users` (duplo `enforceLimit("users")`
  + `enforceLimit("professionals", { when })`) e `POST /schedules`.
* Conta o uso atual respeitando regras de cada recurso (pacientes não-deletados,
  agendas com `is_active=true`, role específica para profissionais).
* Retorna **402 Payment Required** com payload estruturado
  `{ limitReached, resource, limit, current, planName, planDisplayName, requiredPlan, message }`.
* `requiredPlan` é calculado dinamicamente: plano ativo mais barato cuja coluna
  `maxX` é `null` (ilimitado) ou estritamente maior que o consumo atual **e**
  cujo preço é maior que o do plano vigente (downgrade nunca é sugerido).

No frontend, `apiFetchJson` detecta 402 + `limitReached: true` e lança
`PlanLimitError` (`artifacts/fisiogest/src/lib/api.ts`). Um `PlanLimitProvider`
(`contexts/plan-limit-context.tsx`) inscreve-se na `MutationCache` do React
Query e abre globalmente o `PlanLimitDialog`
(`components/feedback/plan-limit-dialog.tsx`), que reaproveita o estilo do
`FeatureRoute`: mostra consumo atual, comparativo de plano atual vs
recomendado com diferença em BRL e CTA para `/configuracoes#plano`.

Bônus — sidebar mostra pílula `X/Y` ao lado de "Pacientes" e "Configurações"
via `usePlanUsage()` + `<UsageBadge />`. Cores escalam (cinza → âmbar em 80% →
vermelho em 100%) para sinalizar saturação antes do bloqueio. Endpoint
`GET /api/clinic-subscriptions/mine/limits` retorna `{plan, limits, usage}`
com os 4 contadores (`patients`, `users`, `schedules`, `professionals`).

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


## Identidade Visual

- **Logo**: mark "Cruz Clínica" + wordmark "FisioGest Pro" — `artifacts/fisiogest/src/components/logo-mark.tsx`
  - exporta `LogoMark` (default), `LogoWordmark` e `LogoLockup` com props `tone` e `inverted` para fundos claros/escuros.
- **Cor primária**: Teal profundo `hsl(180 100% 25%)` — identidade fisioterapêutica
- **Sidebar**: Teal escuro `hsl(222 47% 11%)` — coerência com a identidade
- **Tipografia**: Inter (corpo) + Outfit (títulos / display)
- **Paleta semântica** (tokens em `index.css`): `--success` (`150 60% 35%`), `--warning` (`38 92% 50%`), `--info` (`210 90% 50%`), `--destructive` (`0 84% 60%`) — todas com `-foreground` e expostas no `@theme` como classes Tailwind (`bg-success`, `text-warning`, etc).
- **Ícones autorais**: 24 ícones clínicos em `artifacts/fisiogest/src/components/icons.tsx` (export individual + objeto `Icons.*`). API compatível com Lucide (`className`, `size`, `strokeWidth`). Usados na sidebar, bottom nav e header — Lucide ainda é usado para ícones genéricos de UI (close/menu/chevron).

### Brand Book (canvas)

Quatro boards de marca em `artifacts/mockup-sandbox/src/components/mockups/brand-book/`:

- `ColorSystem.tsx` — escalas Teal/Sidebar/Neutral (50→900) em OKLCH, paleta semântica e de gráficos, modo claro/escuro, tokens CSS + Tailwind, padrões de acessibilidade (WCAG 2.2 AA).
- `LogoSystem.tsx` — 4 conceitos de mark (Cruz Clínica, Pulso, Movimento, Monograma FG), lockups horizontal/vertical/inverso, teste de escala (16→128px), versões monocromáticas, app icon iOS/Android/PWA/favicon, área de respiro.
- `IconSystem.tsx` — 24 ícones clínicos autorais (24×24, traço 1.8px round) agrupados em Clínica & Pacientes, Sessões & Especialidades, Documentos & Financeiro, Operação & Plataforma — com aplicação em sidebar, botões e cards.
- `Page.tsx` — brand book mestre (essência, logo, cores, tipografia, ícones, mockups de UI, do's & don'ts, tom de voz).

---

## Scripts e Comandos

```bash
# Instalar dependências
pnpm install

# Iniciar todos os serviços (via workflows do Replit)
# O workflow `artifacts/fisiogest: web` roda em paralelo via `concurrently`:
#   - api-server (porta 8080)
#   - Vite frontend (porta 3000)
#   - mockup-sandbox (porta 8081, base path /__mockup) — boards de marca no canvas
# Os workflows individuais de api-server e mockup-sandbox não são usados
# (o framework de workflows não detecta a porta deles isoladamente).
#
# ⚠️ NÃO regredir as portas (3000/8080/8081) nem adicionar [[ports]] duplicado em .replit.
# Configuração canônica + diagnóstico de 502: docs/operations.md → "Workflows e Portas".

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


---

## Convenções Arquiteturais

### Regras de domínio críticas

- **`appointments.schedule_id` é NOT NULL** (DB, Zod e tipos TS) — toda criação de agendamento (presencial via `appointments.routes`, recorrente via `/recurring`, e booking público via `/api/public/book`) **exige** `scheduleId`. Não é mais possível agendar "sem agenda". Validações:
  - DB: coluna `appointments.schedule_id` com constraint NOT NULL
  - Zod: `createAppointmentSchema.scheduleId` (`appointments.schemas.ts`), `bookSchema.scheduleId` (`public.schemas.ts`) — ambos com mensagem `"scheduleId é obrigatório"`
  - TS: assinaturas de `createAppointment`, `createRecurringAppointments` e `publicRepository.insertAppointment` usam `scheduleId: number` (sem `null`)
  - Frontend: o seletor de agenda no formulário é obrigatório quando a página não recebe a prop `scheduleId`

### Backend — `modules/<dominio>/<feature>/`

Padrão obrigatório para qualquer feature nova ou refatoração:

```
modules/<dominio>/<feature>/
  <feature>.routes.ts      ← controller fino (< 200 linhas), sem queries
  <feature>.service.ts     ← regra de negócio
  <feature>.repository.ts  ← queries Drizzle (única camada que toca o db)
  <feature>.schemas.ts     ← Zod (request/response)
  <feature>.helpers.ts     ← puros, testáveis (opcional)
  <feature>.errors.ts      ← erros de domínio (opcional)
  <feature>.service.test.ts
```

**Domínios atuais:**
- `_shared/` — código cross-domain (ex.: `accounting/`, `test-utils/`)
- `auth/`, `health/`, `public/`, `dashboard/`, `storage/` — top-level
- `clinical/` — patients, appointments, schedules, medical-records, blocked-slots, patient-journey, patient-photos, **policies**
- `catalog/` — procedures, packages, patient-packages, treatment-plan-procedures
- `financial/` — financial (root), records, payments, recurring-expenses, patient-wallet, subscriptions (de paciente), reports, dashboard, analytics, **billing**, **_shared/financial-reports**
- `saas/` — saas-plans, coupons, **subscriptions** (de clínica)
- `admin/` — clinics, users, audit-log

**Regra de ouro:** se a lógica é de UM domínio, fica no módulo. Se for cross-domain, vai para `modules/_shared/<area>/`. **Não criar `src/services/` na raiz** (foi removido em abril/2026 — ver `docs/changelog.md`).

### Frontend — `pages/<dominio>/<feature>/`

Estrutura espelhando o backend:

```
pages/<dominio>/<feature>/
  index.tsx                ← página-rota orquestradora (< 250 linhas)
  components/
    <Feature>Form.tsx
    <Feature>Table.tsx
    columns.tsx
  hooks/
    use<Feature>Query.ts
    use<Feature>Mutations.ts
  schemas/
    <feature>-form.schema.ts
```

### Schemas Zod compartilhados

Schemas centralizados em `src/schemas/`. Cada schema exporta:
- `xxxFormSchema` — validação Zod (com `superRefine` quando há regras cross-field)
- `xxxFormDefaults` — valores iniciais
- `buildXxxPayload(values)` — converte form values em payload da API
- `type XxxFormValues = z.infer<typeof xxxFormSchema>`

Schemas existentes: `coupon`, `plan`, `patient`, `appointment` (+ `recurrence`),
`subscription` (`new` + `edit`), `financial-record` (`new` + `edit`),
`procedure` (+ `procedureCost`), `package`.

Padrão de uso (sem RHF): `safeParse` no início do `handleSubmit`/`mutationFn`,
toast com `error.issues[0]?.message` em caso de erro, `buildXxxPayload(parsed.data)` no body.

Padrão de uso (com RHF, ex: `CouponsTab`): `useForm({ resolver: zodResolver(...), defaultValues })`,
submit via `handleSubmit(onValid, onInvalid)`. Para forms com muitos componentes
controlados (Select/Switch/Combobox shadcn), usar adapter `setForm = (next) => Object.keys(next).forEach(k => setValue(k, next[k]))` mantendo o padrão `setForm({...form, x: y})` enquanto a infraestrutura RHF roda por baixo.

Hooks reutilizáveis ficam em `src/hooks/`. Contexts em `src/utils/` (TODO mover para `src/contexts/`).

### Camada de chamadas HTTP

Helpers únicos em `src/utils/api.ts`:
- `apiFetch(input, init?)` — Response cru, anexa `Authorization: Bearer <token>`
- `apiFetchJson<T>(input, init?)` — GET tipado, lança `Error` em status != 2xx, retorna `undefined` em 204
- `apiSendJson<T>(url, method, body?)` — POST/PUT/PATCH/DELETE com JSON (auto `Content-Type` + `JSON.stringify`)
- `API_BASE` — prefixo derivado de `import.meta.env.BASE_URL` (re-exportado por `pages/saas/superadmin/constants.ts` e `pages/settings/configuracoes/constants.ts` para compat com imports existentes)

Usar sempre esses helpers em vez de `fetch` direto — garante autenticação consistente
e tratamento de erro padronizado (mensagem do backend via campo `message`).

Refatoração concluída em todo `pages/clinical/*` (pacientes, agenda, atestados,
anamnese, evoluções, plano de tratamento, jornada, histórico, financeiro, auditoria,
prints) além de `pacotes/`, `clinicas/`, `configuracoes/`, `superadmin/`. Exceções
intencionais: rotas públicas `agendar/*` (sem auth) e uploads `photos/*` (FormData).

### Convenção de imports

- Cliente HTTP: hooks gerados pelo Orval em `@workspace/api-client-react`
- Tipos compartilhados: `@workspace/api-zod` e `@workspace/db`
- `useAuth`: sempre `@/hooks/use-auth` (o `auth-context.tsx` exporta apenas `AuthProvider` e `AuthContext`)

---

## Observabilidade

- **Logger backend** — `lib/logger.ts` (pino + AsyncLocalStorage). Importar `logger` em vez de `console.*`. Anexa `requestId` automaticamente em qualquer chamada feita dentro de uma request HTTP. Redact configurado para `password`, `token`, `authorization`.
- **Correlation ID** — middleware `requestContext.ts` aceita header `X-Request-Id` (ou gera UUID), ecoa na resposta e propaga via AsyncLocalStorage.
- **Sentry** — desativado em dev (sem DSN). Para ativar, definir `SENTRY_DSN_BACKEND` (api-server) e `VITE_SENTRY_DSN` (fisiogest). Tracesample padrão `0.1`.
- **Scheduler** — cada job CRON é instrumentado com duração em ms, log de sucesso/erro contável e `captureException` em falhas críticas. `silentSuccess: true` em jobs de alta frequência sem efeito (auto-confirmação).

## Refatorações recentes (estrutura)

- **Reforma do modelo de créditos & faturamento (abr/2026)** — 5 sprints concluídas ✅
  - **Schema additivo:** `session_credits.financial_record_id`, `treatment_plans.payment_mode`/`monthly_credit_validity_days`/`replacement_credit_validity_days`/`avulso_billing_mode`/`avulso_billing_day`, `financial_records.parent_record_id`, `clinics.cancellation_window_hours`/`late_cancellation_policy`. Constantes em `lib/shared-constants/src/statuses.ts` (`SESSION_CREDIT_STATUSES`, `SESSION_CREDIT_ORIGINS`, `PAYMENT_MODES`, `AVULSO_BILLING_MODES`, `LATE_CANCELLATION_POLICIES`).
  - **Sprint 1 — UI plano:** novos campos no `TreatmentPlanTab` (paymentMode, validades de crédito mensal/reposição, modo de cobrança avulsa, dia do vencimento). Service `updatePatientTreatmentPlanById` libera campos operacionais mesmo após aceite (allowlist).
  - **Sprint 2 — Pool mensal + prepago/postpago:** `materializeTreatmentPlan` cria 1 linha em `session_credits` por mês×item com `origin='mensal'`, `monthRef`, `validUntil`, status conforme `paymentMode` (`pendentePagamento` para prepago, `disponivel` para postpago) e `financialRecordId` apontando para a fatura. `dematerializeTreatmentPlan` apaga pool não consumido / marca como `estornado`. Trigger em `financial-payments.routes.ts` chama `promotePrepaidCreditsForFinancialRecord` quando a fatura vira `pago` (e `revertPrepaidCreditsForFinancialRecord` no estorno).
  - **Sprint 3 — Expiração + extrato:** `expireSessionCredits()` em `clinical/session-credits/session-credits.service.ts` rodando dentro de `endOfDay` (22:00 BRT). Endpoint `GET /api/patients/:patientId/session-credits/statement` (totais por status/origem + lista). UI: bloco expansível "Extrato de créditos do paciente" no `TreatmentPlanTab` com cards de totais e tabela.
  - **Sprint 4 — Fechamento mensal de avulsos:** `closeAvulsoMonth(planId, ref)` em `clinical/medical-records/treatment-plans.close-month.ts` cria 1 fatura consolidada (`transactionType='faturaMensalAvulso'`, `parentRecordId` apontando para o plano) idempotente. Endpoint `POST /api/patients/:patientId/treatment-plans/:planId/close-month?ref=YYYY-MM`. UI: bloco "Fechar mês de avulsos" aparece quando `avulsoBillingMode='mensalConsolidado'`.
  - **Sprint 5 — Janela de cancelamento:** helper `resolveCancellationDecision()` em `appointments.billing.ts` lê `cancellationWindowHours` (default 24) e `lateCancellationPolicy` (`creditoNormal`/`semCredito`/`taxa`) da clínica. Aplicado nos dois caminhos: plano materializado (gera/bloqueia crédito de reposição) e avulso/mensal (bloqueia crédito mensal). Cancelamentos fora da janela mantêm o comportamento legado. UI: nova seção "Janela de cancelamento" em `ClinicaSection.tsx` (input de horas + 3 cards de política).

- **Sprint 7.2 + 7.4 (abr/2026)** — **Cobrança SaaS via Asaas + painel de inadimplência** ✅
  - Schema: estendido `clinic_subscriptions` com `asaas_customer_id`, `asaas_subscription_id`, `asaas_checkout_url`, `billing_mode`; criada `asaas_webhook_events` com UNIQUE `event_id` (idempotência).
  - Backend: `lib/asaas/` (cliente HTTP), `modules/saas/billing/` (subscribe/cancel/status/listDelinquent/sendDunningReminder/processWebhookEvent), `modules/webhooks/asaas.routes.ts` (POST `/api/webhooks/asaas` autenticado por `asaas-access-token` constant-time).
  - Webhook montado **antes** dos roteadores SaaS no `modules/index.ts` para escapar do `authMiddleware` aplicado nos routers `/`.
  - `subscription.service.ts` pula renew/markOverdue para clínicas em `billingMode = 'asaas_card'` (gateway é fonte de verdade); suspensão após grace continua como rede de segurança.
  - Frontend: `pages/settings/plano-section.tsx` com botão "Pagar com cartão" + status + cancel; nova aba "Inadimplência" no superadmin (`pages/saas/superadmin/components/InadimplenciaTab.tsx`).
  - Segredos: `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN` (configurados); `ASAAS_BASE_URL` opcional para sandbox.
  - Itens 7.1 (gateway de pacientes) e 7.3 (reconciliação PIX) **adiados** — cobrança ao paciente continua manual.
  - Detalhes em [`docs/financial.md#saas-billing-asaas`](docs/financial.md#saas-billing-asaas).
- **Sprint 2 (abr/2026)** — quebrados todos os 7 arquivos > 750 linhas:
  - `print-html.tsx` (961 → 14 barrel) → 7 arquivos em `utils/print/`
  - `FinancialTab.tsx` (877 → 369) → pasta `FinancialTab/` (Subscriptions/Credits/Wallet sections + constants)
  - `pacotes/index.tsx` (797 → 284) → `PackageCard`, `PackageFormModal`, `helpers.ts`, `types.ts`
  - `CreateAppointmentForm.tsx` (795 → 524) → pasta `create-appointment/` (PatientStep, ProcedureSelector, RecurrenceSection)
  - `LancamentosTab.tsx` (777 → 429) → pasta `lancamentos/` (SubscriptionBillingPanel, RecordsTable)
  - `relatorios.tsx` (760 → 623) → pasta `relatorios/` (KpiCard, ChartSkeleton, CustomTooltipContent, constants, types)
  - Padrão adotado: pasta com mesmo nome co-localizada; arquivo principal vira shell/orquestrador; preserva imports externos. Typecheck passa em todos.
- **`agenda/index.tsx`** — antes 986 linhas, agora 318 linhas (orquestrador). Quebrado em:
  - Hooks: `useAgendaQueries`, `useAgendaNavigation`, `useAgendaMutations`
  - Helpers: `helpers/scheduleConfig.ts` (computeScheduleConfig, isWorkingDay)
  - Componentes: `AgendaToolbar`, `AgendaSidebar`, `WeekHeader`, `DayColumn` (290 linhas isoladas)
- **`_shared` → `shared`** — pastas renomeadas em `modules/` e `modules/financial/`; 11 arquivos de imports atualizados.
- **Limpeza de configuração (abr/2026)** — removidos `tsconfig.json` e `tsconfig.server.json` da raiz (legados, apontavam para diretórios inexistentes) e `scripts/package.json` (declarava `@workspace/scripts` mas a pasta não está no `pnpm-workspace.yaml`). Adicionado script `db:seed-financial` em `package.json`. `pnpm -r exec tsc --noEmit` agora passa em todos os 7 pacotes.
- **Bug fix `AnamnesisTab` (abr/2026)** — campos de input/select da Anamnese sumiam ao digitar. Causa: `useQuery` sem `queryFn` → `data = undefined` → default `[]` criava nova referência a cada render → `useEffect [template, allAnamnesis]` chamava `setForm(emptyForm)` a cada tecla. Correção: adicionada `queryFn` que busca `GET /api/patients/{id}/anamnesis?all=true` (endpoint suporta `?all=true` para devolver array em vez de registro único) + constante estável `EMPTY_ANAMNESIS` fora do componente como default.

## Documentação completa

Para reduzir o tamanho deste arquivo (sempre carregado em contexto), a documentação detalhada foi quebrada em `docs/`:

| Arquivo | Conteúdo |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Arquitetura Replit (artifacts, workflows, proxy, deploy) e estrutura completa do projeto |
| [`docs/database.md`](docs/database.md) | Schema do banco de dados (tabelas e relações) |
| [`docs/api.md`](docs/api.md) | Catálogo de rotas da API REST |
| [`docs/saas.md`](docs/saas.md) | Controle de assinaturas SaaS, cupons, painel superadmin |
| [`docs/financial.md`](docs/financial.md) | Modelo financeiro, sistema contábil (partidas dobradas), aba Lançamentos, roadmap de pagamentos R$ |
| [`docs/clinical.md`](docs/clinical.md) | Funcionalidades clínicas (prontuário) e regras de governança de agendamentos |
| [`docs/design-system.md`](docs/design-system.md) | Padrões de UI (KpiCard, badges, estados, etc.) |
| [`docs/operations.md`](docs/operations.md) | Tratamento centralizado de erros + Testes (vitest) |
| [`docs/market.md`](docs/market.md) | Análise de mercado e concorrentes |
| [`docs/changelog.md`](docs/changelog.md) | Histórico de correções e refatorações |
| [`docs/sprints.md`](docs/sprints.md) | Plano de sprints (status: feito / pendente) |

**Quando atualizar `replit.md` vs `docs/`:**
- Mudanças em padrões transversais (localização, identidade visual, scripts, convenções) → `replit.md`
- Mudanças em uma área específica (financeiro, clínico, SaaS, schema, etc.) → arquivo correspondente em `docs/`
- Refatorações arquiteturais e correções relevantes → adicionar entrada em `docs/changelog.md`

---

## Deploy em Hostinger (Node.js)

O projeto pode ser empacotado em um único `.zip` para publicação em hospedagens Node.js (Hostinger Cloud / VPS / Business com "Setup Node.js App"). O backend Express **já serve o frontend estático** em produção (ver `artifacts/api-server/src/app.ts` → `express.static("artifacts/fisiogest/dist/public")`) — apenas **uma porta** precisa ser exposta.

**Como gerar o pacote:**
1. `pnpm run build` — gera `artifacts/api-server/dist/index.cjs` (bundle esbuild) e `artifacts/fisiogest/dist/public/` (estático Vite).
2. Empacotar em uma pasta enxuta contendo:
   - `package.json` somente com **dependências de runtime** (as listadas no `allowlist` de `artifacts/api-server/build.ts` + os `external` que o esbuild marca como não-bundled: `@google-cloud/storage`, `@sentry/node`, `cloudinary`, `compression`, `cookie-parser`, `express-rate-limit`, `google-auth-library`, `helmet`, `multer`, `node-cron`, `pino`, `pino-http`).
   - `artifacts/api-server/dist/index.cjs`
   - `artifacts/fisiogest/dist/public/`
   - `.env.example` documentando `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, `NODE_ENV`, `PORT` (Hostinger injeta `PORT` automaticamente).
3. No hPanel → **Setup Node.js App** → Node 22.x, startup file `artifacts/api-server/dist/index.cjs`, configurar variáveis, `Run NPM Install`, `Start App`.

> O `.gitignore` já exclui `deploy/`, `*.zip` e `.env*` para evitar vazamento de bundle/segredos.

---

## Boas práticas recomendadas (próximos passos sugeridos)

Diagnóstico atual: `pnpm typecheck` passa com **0 erros**, `pnpm lint` retorna **0 erros e ~2961 warnings** (predominantemente `no-unused-vars` em componentes shadcn/ui copiados via `npx shadcn add`). Recomendações priorizadas:

1. **Não rodar `lint --fix` em massa nos componentes shadcn** (`artifacts/*/src/components/ui/*`). Esses arquivos seguem a API oficial do shadcn — remover imports "não usados" pode quebrar tipos públicos. Em vez disso, adicionar override no `eslint.config.js` para silenciar `no-unused-vars` apenas em `**/components/ui/**`.
2. **Health-check e readiness** — ✅ implementado. `GET /api/healthz` (liveness, sempre 200) e `GET /api/health` (readiness — testa o banco; 200 se ok, 503 se degradado; retorna `{ status, uptimeSec, timestamp, version, db: { ok, latencyMs } }`). Já está no allowlist de auth e CSRF; pronto para UptimeRobot.
3. **Migrações em produção** — rodar `pnpm db:push` apenas a partir de um pipeline (CI), nunca manualmente em produção. Considerar migrar para `drizzle-kit migrate` (versionado) em vez de `push` (compara schema vivo).
4. **Segredos** — `JWT_SECRET` e `DATABASE_URL` aparecem em `.replit` (`userenv.shared`). Em produção (Hostinger), defini-los apenas no painel de variáveis do hPanel — nunca commitar.
5. **Rotação de chaves** — gerar novo `JWT_SECRET` para o ambiente de produção (não reutilizar o do Replit).
6. **`lib/api-spec/`** — pacote orval/openapi presente mas não importado por nenhum outro pacote. Decidir entre: (a) mantê-lo apenas como ferramenta manual de codegen, (b) integrá-lo ao `pnpm build:libs`, ou (c) removê-lo se o OpenAPI não estiver mais sendo mantido.
7. **Headers de segurança** — `helmet` já está instalado no api-server. Confirmar que está ativado em `app.ts` com `contentSecurityPolicy` adequado para servir o frontend estático.
8. **Rate limiting** — `express-rate-limit` já em uso (`publicLimiter`). Considerar limites mais estritos em `/api/auth/login` para mitigar brute-force.
9. **Observabilidade** — Sentry está integrado (DSN opcional). Habilitar em produção definindo `SENTRY_DSN`.
10. **Backups** — agendar dump diário do PostgreSQL (Neon já oferece point-in-time; em outros provedores, criar `pg_dump` cron).

---

## Testes visuais mobile (Playwright)

Suíte adicionada em **26/04/2026** que valida cada tela do `docs/mobile-audit.md`
em viewport **375 × 812** (iPhone 13). Comando:

```bash
pnpm test:mobile                       # toda a suíte (3 projetos)
pnpm test:mobile --project=public      # /, /login, /register
pnpm test:mobile --project=admin       # /superadmin
pnpm test:mobile --project=profissional # /dashboard, /agenda, /pacientes, /financeiro, /financeiro/relatorios, /configuracoes, /catalogo/procedimentos
```

* **Arquivos:** `tests/mobile/playwright.config.ts`, `global-setup.ts`,
  `_shared.ts`, `mobile-audit.{public,admin,profissional}.spec.ts`,
  `README.md`.
* **Browser:** usa o `chromium` do **Nix** (`/nix/store/...-chromium-138/bin/chromium`)
  porque o binário baixado pelo Playwright não roda em NixOS. O caminho
  é resolvido via `command -v chromium` (override com
  `PLAYWRIGHT_CHROMIUM_PATH`).
* **Auth:** `globalSetup` faz login uma vez para admin e profissional via
  `POST /api/auth/login`, persiste cookie httpOnly + `localStorage` em
  `tests/mobile/.auth/*.json` e cada projeto reusa esse `storageState`
  (evita esbarrar no rate-limit `auth` de 20/15min).
* **Asserts por tela:** HTTP < 400, sem overflow horizontal, sem erros de
  console (401/403/404/429 ignorados), screenshot full-page anexado.
* **Pré-requisitos:** dev server em `:3000`, `pnpm db:seed-demo` rodado
  (admin `admin@fisiogest.com.br` / `123456` e profissional
  `fisio@fisiogest.com.br` / `123456` em uma clínica).

---

## LGPD — Política versionada com aceite e portabilidade

Implementado em **26/04/2026** (req. 9.1 e 9.2 da auditoria de
conformidade).

### Backend

* **Tabelas:** `policy_documents` (versão vigente por tipo) e
  `user_policy_acceptances` (carimbo IP/UA por usuário×documento).
  Criadas via SQL direto (`scripts/create-lgpd-tables.ts`) porque
  `drizzle-kit push` exige TTY interativo.
* **Módulo:** `artifacts/api-server/src/modules/lgpd/` com
  `lgpd.routes.ts`, `lgpd.service.ts`, `lgpd.repository.ts`,
  `lgpd.schemas.ts`. Registrado em `app.ts` sob `/api/lgpd`:
  - `GET /api/lgpd/policies/current` — todas as políticas vigentes (público).
  - `GET /api/lgpd/policies/:type/current` — uma política (público).
  - `POST /api/lgpd/policies/accept` — registra aceite (autenticado).
  - `GET /api/lgpd/me/pending` — políticas pendentes do usuário logado.
  - `GET /api/lgpd/patients/:id/export` — JSON portabilidade (Content-Disposition).
* **Audit log:** todo aceite e exportação grava em `audit_log`.
* **Auth integrado:** `registerSchema` aceita `privacyDocumentId` e
  `termsDocumentId`; `register()` insere aceites com IP/UA (best-effort).
  `getMe()` retorna `lgpd: { pendingPolicies, hasPending }`.
* **Seed:** `scripts/seed-lgpd.ts` insere privacy v1.0.0 (id=1) e
  terms v1.0.0 (id=2) com Markdown completo em pt-BR.

### Frontend

* `src/lib/lgpd.ts` — cliente fetch para os endpoints.
* `src/components/lgpd/markdown-view.tsx` — renderer próprio (sem deps).
* `src/components/lgpd/policy-acceptance-modal.tsx` — modal force-open
  (não fecha por ESC/clique fora) com checkbox obrigatório, montado
  em `AppLayout` quando `user.lgpd.hasPending`.
  - **Estado lido diretamente do `AuthContext`** (não há mais cópia local
    no `AppLayout`). Após o aceite, o componente chama `refreshUser()`
    do `useAuth`, que rebusca `/api/auth/me` e atualiza `pendingPolicies`
    para `[]` no contexto. Assim o modal fecha em todas as instâncias do
    `AppLayout` e **não reaparece** ao navegar entre páginas (atestados,
    plano de tratamento, etc.). Bug fixado em 27/04/2026 — antes o estado
    era duplicado dentro do `AppLayout` e cada navegação remontava o
    layout, lendo a lista pendente "antiga" do user e reabrindo o modal.
* `src/pages/politica-de-privacidade.tsx` e
  `src/pages/termos-de-uso.tsx` — públicas, lazy-loaded em `App.tsx`.
* `src/pages/register.tsx` — checkbox obrigatório de aceite + envio
  de `privacyDocumentId`/`termsDocumentId` no payload.
* `ExportLgpdButton` em `PatientDetail` — baixa JSON com todos dados
  do paciente (portabilidade — art. 18, V LGPD).
  **Visível apenas para `isSuperAdmin`** (gating em 27/04/2026).
* **Aba "Auditoria"** do paciente (log de acessos LGPD) — também
  restrita a `isSuperAdmin`, tanto na barra de abas quanto no parser
  do `?tab=auditoria` (usuários comuns que abrirem a URL caem na aba
  "Jornada").

### Reconhecimento de receita por entrega (28/04/2026)

**Regra contábil:** receita de fatura mensal de plano de tratamento
NUNCA é reconhecida na materialização nem por simples passagem de
calendário. O reconhecimento ocorre **na 1ª confirmação de sessão
do mês** (status `compareceu` ou `concluido`), pelo **valor integral
da fatura mensal**.

* **Materialização** (`treatment-plans.materialization.ts`): cria
  `financial_records` (status `pendente`), sem journal entry. NÃO
  chama mais `postReceivableRevenue`.
* **1ª confirmação** (`appointments.billing.ts` → ramo `planProcId` →
  `recognizeMonthlyInvoiceRevenue`): se `recognizedEntryId IS NULL`,
  lança:
  - Fatura `pendente`: D: Recebíveis (1.1.2) / C: Receita (4.1.x)
  - Fatura `pago` (prepago): D: Adiantamentos (2.1.1) / C: Receita
* **Pagamento prepago** (`financial-payments.routes.ts`): faturaPlano
  paga ANTES da 1ª sessão lança D: Caixa (1.1.1) / C: Adiantamentos
  (2.1.1) via `postCashAdvance`. Receita só é reconhecida no consumo.
* **Idempotência:** `financial_records.recognizedEntryId` é o sentinel
  — chamadas repetidas para a mesma fatura são no-op.
* **Migração one-shot** executada em 28/04/2026:
  `src/scripts/reverse-premature-monthly-revenue.ts` estornou ~200
  faturas (R$ 39.210) que tinham receita reconhecida pela regra
  antiga sem nenhuma sessão confirmada do mês.

### Notas técnicas

* **Zod v4 + `partial()`:** Zod v4 proíbe `.partial()` em objetos com
  `.refine()`. Quando precisar de schema "create" com refinement +
  schema "update" parcial, declare a base sem refine, depois aplique
  `.refine()` no create e `.partial()` na base. Padrão aplicado em
  `procedures.schemas.ts` (corrigido em 26/04/2026 após upgrade Zod).
* **DialogContent sem prop `hideCloseButton`:** modal LGPD usa
  `className="[&>button[aria-label='Fechar diálogo']]:hidden"` +
  `onPointerDownOutside`/`onEscapeKeyDown` com `preventDefault()`
  para bloquear fechamento.
