# Sprint 5 — UI consolidada do Plano + Pacotes Recorrentes + migração de legado

**Status:** Entregue
**Data:** 2026-04-28
**Referência:** `sprints/00-plano-geral.md` § 5

## Objetivo

Consolidar o Plano de Tratamento como fonte única de aceite/cobrança no
prontuário, eliminar referências ao conceito de "Assinatura" na UI fora do
escopo SaaS (`/saas/superadmin` e banners da clínica) e migrar dados pré-Sprint 2
para o novo modelo.

## Entregas

### 1. Tela única "Plano de Tratamento" no prontuário

`artifacts/fisiogest/src/pages/clinical/patients/patient-detail/tabs/TreatmentPlanTab.tsx`

Reorganizada em 4 abas internas (uma única linha de progressão visual):

| Aba         | Conteúdo                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **Itens**   | Procedimentos do plano, prazo (meses), `TreatmentPlanItemsSection`                              |
| **Aceite**  | `AcceptanceBlock` (LGPD trail, presencial + link 7 dias) + `MaterializeBlock` (agenda)         |
| **Cobrança**| `BillingSettingsBlock` (modo pagamento + validade créditos) + `CloseMonthBlock` + extrato      |
| **Sessões** | Progresso `realizadas / estimadas`                                                             |

`MaterializeBlock` permanece disponível na aba Aceite para clínicas que querem
gerar a grade completa antecipadamente. A geração lazy (sem materialização)
continua sendo o caminho padrão.

### 2. Painel financeiro "Pacotes Recorrentes"

`artifacts/fisiogest/src/pages/financial/components/lancamentos/RecurringPackagesPanel.tsx`

Substitui o antigo `SubscriptionBillingPanel.tsx` (deletado neste sprint).

Painel único com **dois sub-blocos**, ambos consumindo endpoints
idempotentes:

- **Faturas dos Planos** → `GET/POST /api/treatment-plans/billing/{status,run}`
  (fonte primária, dados Sprint 2+).
- **Assinaturas (legado)** → `GET/POST /api/subscriptions/{billing-status,run-billing}`
  (mantido enquanto houver dados pré-migração).

Integrado em `LancamentosTab.tsx` como fonte dual com confirmação para o
disparo do legado.

### 3. Migração de legado

`artifacts/api-server/src/scripts/migrate-legacy-plans.ts`

Script idempotente, default em **dry-run**, com flags:

- `--apply` → grava as mudanças
- `--only-clinic <id>` → restringe a uma clínica
- `--skip-part-a` / `--skip-part-b`

**Parte A** — planos materializados sem aceite formal: copia
`materializedAt → acceptedAt`, define `acceptedVia='legado'` e congela
`frozenPricesJson` com snapshot dos preços vigentes.

**Parte B** — `patient_subscriptions` órfãs (sem plano correspondente):
agrupa por paciente e cria 1 "Plano Legado" por paciente com
`acceptedVia='legado'`, importa cada subscription como
`treatment_plan_procedure` (`kind='recorrenteMensal'`), e marca as
subscriptions como `cancelada` com nota cruzada referenciando o novo plano.

**Execução:**
```bash
# dry-run (padrão)
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/migrate-legacy-plans.ts

# aplicar em uma clínica
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/migrate-legacy-plans.ts --apply --only-clinic 123
```

### 4. Remoção de "Assinatura" na UI clínica/financeira

| Local                             | Antes                                       | Depois                                                  |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `LancamentosTab` strip MRR header | "Receita Recorrente (Assinaturas)"          | "Receita Recorrente (Pacotes Mensais)"                  |
| `LancamentosTab` KPI sub          | "X assinatura(s) ativa(s)"                  | "X pacote(s) mensal(is) ativo(s)"                       |
| `LancamentosTab` toast vazio      | "Nenhuma assinatura com vencimento…"        | "Nenhum pacote recorrente (legado) com vencimento…"     |
| `LancamentosTab` dialog cobrança  | "todas as assinaturas ativas…"              | "Pacotes Legados — assinaturas pré-Sprint 2…"           |
| `RecordsTable` faturaConsolidada  | badge silencioso                             | badge "legado" amber + tooltip                          |
| `SubscriptionBillingPanel.tsx`    | componente vivo                             | **deletado**                                            |

**Mantidos intencionalmente** (escopo SaaS, fora da UI clínica):

- `app-layout.tsx` — banners "Assinatura suspensa/cancelada/em atraso" (referente
  ao plano SaaS da clínica; faz parte do domínio `/saas`).
- `landing/FAQSection.tsx` — FAQ pública sobre cancelamento do plano SaaS.
- `pages/saas/superadmin/**` — toda a UI SaaS interna.
- `schemas/__tests__/subscription.schema.test.ts` — cobertura do schema legado.

### 5. Pendências para Sprint 6 (não bloqueantes)

- `packageType: "faturaConsolidada"` ainda existe como template no catálogo
  de Pacotes (`pages/catalog/pacotes/*`) e em `RecurringPackageSection`.
  Precisa de migração de schema + remoção do template — escopo de Sprint 6.
- Backend `dashboard.mrr` e `dashboard.activeSubscriptions` ainda lêem de
  `patient_subscriptions`. Após `migrate-legacy-plans --apply` em todas as
  clínicas, a fonte deve mudar para `treatment_plan_procedures` com
  `kind='recorrenteMensal'` (Sprint 6).

## Critérios de aceite

- [x] Plano de tratamento renderiza com 4 abas e mantém a UX de cada bloco.
- [x] LancamentosTab mostra o painel "Pacotes Recorrentes" unificado.
- [x] `migrate-legacy-plans.ts` roda em dry-run sem erros.
- [x] `SubscriptionBillingPanel.tsx` removido sem quebrar imports.
- [x] Zero referências a "Assinatura" na UI clínica/financeira fora de
      `/saas/superadmin` e dos banners SaaS do `app-layout`.
- [x] `acceptedVia` aceita o valor `'legado'`.
- [x] Typecheck verde, suíte de testes verde.
