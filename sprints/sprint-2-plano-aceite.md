# Sprint 2 — Plano como Contrato com Aceite

> Status: **entregue**
> Branch: `main`
> Período: abril/2026

## Objetivo

Transformar o aceite do plano de tratamento em uma "venda formal", com:

1. **Trilha LGPD completa** (assinatura digitada, IP, dispositivo, via).
2. **Geração financeira imediata e idempotente** (faturas + créditos), **sem** materialização de agendamentos.
3. **Aceite remoto via link público** (sem login), com token de 7 dias e consumo único.

A materialização da agenda continua sendo uma ação operacional separada (será
substituída por grade lazy no Sprint 4).

## Mudanças de schema

### `treatment_plans` (adições)
| Coluna                    | Tipo  | Observação                                     |
| ------------------------- | ----- | ---------------------------------------------- |
| `accepted_by_signature`   | text  | Nome completo digitado pelo paciente.          |
| `accepted_ip`             | text  | IP de origem (capturado de `X-Forwarded-For`). |
| `accepted_device`         | text  | User-Agent (truncado em 500 chars no repo).    |
| `accepted_via`            | text  | `presencial` \| `link` \| `legado`.            |

`status`: novo domínio canônico `rascunho|vigente|encerrado|cancelado`.
Mantemos `ativo`/`concluido` como sinônimos de leitura para preservar o
código legado (mapeamento em `acceptableStatuses`). O aceite promove
`rascunho → vigente` automaticamente.

### `treatment_plan_procedures.kind` (nova coluna)
Domínio: `recorrenteMensal|pacoteSessoes|avulso`.
- Quando `NULL`, o backend deriva via `resolveItemKind()` a partir de
  `packageId`/`packageType` (compat para planos pré-Sprint 2).
- **Não renomeamos a tabela** para `treatment_plan_items` (decisão registrada
  no `replit.md`): a renomeação cascateia em vários joins legados; manter o
  nome físico evita migration destrutiva. A renomeação fica opcional para o
  Sprint 6, quando todos os call-sites passarem a depender de `kind`.

### `treatment_plan_acceptance_tokens` (nova tabela)
| Coluna       | Tipo        | Observação                                   |
| ------------ | ----------- | -------------------------------------------- |
| `id`         | serial PK   |                                              |
| `plan_id`    | integer FK  | `ON DELETE CASCADE` para o plano.            |
| `token`      | text UNIQUE | 24 bytes random (`base64url`).               |
| `expires_at` | timestamp   | Default 7 dias.                              |
| `used_at`    | timestamp   | NULL = ativo; preenchido = consumido.        |
| `created_by` | integer     | Usuário que gerou (NULL para automações).    |
| `created_at` | timestamp   | `default now()`.                             |
| índices      | —           | `plan_id`, `expires_at`.                     |

A migration foi aplicada via SQL direto (`ALTER TABLE … ADD COLUMN IF NOT
EXISTS` + `CREATE TABLE IF NOT EXISTS`), evitando o prompt interativo do
`drizzle-kit push --force` (pelo mesmo motivo descrito no Sprint 1).

## Backend

### Novo módulo `treatment-plans.acceptance.ts`
- `resolveItemKind(item)` — pure function, classifica o item em
  `recorrenteMensal|pacoteSessoes|avulso` (testado em
  `treatment-plans.acceptance.test.ts`).
- `acceptPlanFinancials(planId)` — idempotente, transacional:
  - **`pacoteSessoes`**: cria 1 fatura `vendaPacote` (status `pendente`,
    dueDate=hoje) + N créditos em `session_credits`. Status do crédito
    segue o `paymentMode` do pacote/plano (`prepago` → `pendentePagamento`,
    `postpago` → `disponivel`).
  - **`recorrenteMensal`**: cria a fatura `faturaPlano` do **mês corrente**
    apenas (próximas continuam vindo do job mensal), usando o
    `billingDay` do pacote (clamped ao último dia do mês).
  - **`avulso`**: nada — cobrança ocorre na conclusão de cada atendimento.
- Idempotência:
  - `vendaPacote` é única por `(plan_id, plan_procedure_id)`.
  - `faturaPlano` é única por `(plan_id, plan_procedure_id, plan_month_ref)`.
  - Créditos checam por `notes LIKE '%plano #X/item Y%'` antes de inserir.

### Novo módulo `treatment-plans.tokens.ts`
- `generatePublicAcceptanceLink({planId, patientId, createdBy, baseUrl})`:
  - Reaproveita o token ativo existente (não-usado e não-expirado) para
    permitir reenvio sem multiplicar registros.
  - URL final: `${baseUrl}/aceite/${token}` (baseUrl vem de
    `APP_PUBLIC_URL` ou `Origin` do request).
- `lookupAcceptanceToken(token)` → `{ valid | expired | used | not_found }`.
- `loadPublicPlanSnapshot(planId)` → DTO sem dados sensíveis do paciente
  (apenas nome + termos comerciais).
- `consumeAcceptanceToken(token)` → marca `used_at = now()`.

### Service `acceptPatientTreatmentPlan` (estendido)
- Assinatura nova: `(patientId, planId, ctx, trail?)`.
- `trail = { signature, ip, device, via }` — todas opcionais; defaults:
  `via = "presencial"`, demais `null`.
- `via='link'` permite `ctx.userId === undefined` (paciente sem login).
- Após gravar o aceite, dispara `acceptPlanFinancials(planId)` em try/catch:
  falhas no efeito financeiro **não derrubam o aceite** — o operador pode
  reemitir a venda manualmente; um `audit_log` com prefixo `[ALERTA]` é
  registrado.

### Endpoints

| Método | Rota                                                      | Auth      | Descrição                                            |
| ------ | --------------------------------------------------------- | --------- | ---------------------------------------------------- |
| POST   | `/api/patients/:id/treatment-plans/:planId/accept`        | sim       | Aceite presencial. Body: `{ signature }`.            |
| POST   | `/api/patients/:id/treatment-plans/:planId/public-link`   | sim       | Gera (ou reaproveita) link de aceite (7 dias).       |
| GET    | `/api/public/treatment-plans/by-token/:token`             | **não**   | Snapshot público do plano.                           |
| POST   | `/api/public/treatment-plans/by-token/:token/accept`      | **não**   | Aceite remoto. Body: `{ signature }`.                |

Os endpoints públicos seguem o padrão existente (`PublicError(status, code,
message)` + `handle()` em `public.routes.ts`).

## Frontend

### Página pública `/aceite/:token`
Arquivo: `artifacts/fisiogest/src/pages/public/aceite.tsx`. Layout
mobile-first, cartão único:
- Cabeçalho com nome do paciente + validade do link.
- Objetivos, frequência, sessões estimadas, início.
- Lista de itens com `kindLabel`, totais à vista (pacotes) e mensalidade
  recorrente.
- Aviso LGPD + assinatura digitada + checkbox "li e concordo".
- Estados: `loading`, `error` (com mensagem do backend),
  `acceptedAt` (mostra que já foi aceito), `done` (sucesso).

Rota registrada em `App.tsx` antes das rotas autenticadas.

### `TreatmentPlanTab.tsx` — novo `AcceptanceBlock`
- **Antes do aceite**: card amarelo com dois botões — "Coletar aceite
  presencial" (modal com nome + checkbox) e "Gerar link de aceite (7 dias)"
  (modal com URL + botão copiar).
- **Após o aceite**: card verde imutável com data, via, assinatura, IP e
  dispositivo (trilha LGPD visível ao operador).
- Posicionado **antes** do `MaterializeBlock` para enfatizar a separação:
  aceite é a venda; materialização é a operação da agenda (separada).

## Testes

- **`treatment-plans.acceptance.test.ts`** (novo, 6 casos) — cobre toda a
  matriz de `resolveItemKind` (kind explícito vs derivação legada).
- **`treatment-plan-accept.test.ts`** (existente) — atualizado para mockar
  `treatment-plans.acceptance.js` e manter a foco no fluxo de
  snapshot/auditoria sem tocar no DB.
- Total: **302/302** vitest cases verdes (296 anteriores + 6 novos).

## Decisões de arquitetura

1. **Não renomear `treatment_plan_procedures` → `treatment_plan_items`**:
   tabela legada com várias dependências; trocamos por adição de coluna
   `kind` + função `resolveItemKind`. Renomeação fica para o Sprint 6
   (opcional).
2. **Aceite NÃO chama `materializeTreatmentPlan`**: a sprint deixa
   explícita a separação entre "venda" e "agenda". Sprint 4 substituirá a
   materialização por grade lazy.
3. **Falha financeira não invalida o aceite**: optamos por persistir o
   aceite (com trilha LGPD) e logar a falha. Reverter o aceite criaria
   inconsistência se o operador já tiver mostrado o "aceito" ao paciente.
4. **Tokens reaproveitados**: gerar link 2× para o mesmo plano devolve o
   token ativo existente — evita lixo na tabela e simplifica a UX
   ("reenviar link").

## Variáveis de ambiente

- `APP_PUBLIC_URL` (opcional) — base usada para montar a URL de aceite.
  Quando ausente, usa o `Origin` do request (suficiente em dev/preview).
