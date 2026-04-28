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
| Catálogo de Pacotes (`pages/catalog/pacotes/*`) | tipo `faturaConsolidada` selecionável | tipo removido do form/filtros/contadores; templates legados aparecem como "Mensal (legado)" (read-only) |
| `RecurringPackageSection.tsx`     | label "Fatura Consolidada"                  | label "Mensal (legado)" (badge âmbar) para dados pré-Sprint 5 |

**Mantidos intencionalmente** (escopo SaaS, fora da UI clínica):

- `app-layout.tsx` — banners "Assinatura suspensa/cancelada/em atraso" (referente
  ao plano SaaS da clínica; faz parte do domínio `/saas`).
- `landing/FAQSection.tsx` — FAQ pública sobre cancelamento do plano SaaS.
- `pages/saas/superadmin/**` — toda a UI SaaS interna.
- `schemas/__tests__/subscription.schema.test.ts` — cobertura do schema legado.

### 5. Migração executada (`--apply`)

`migrate-legacy-plans.ts --apply` rodado em produção:

- **18** planos materializados sem aceite → `acceptedAt = materializedAt`,
  `acceptedVia = 'legado'`, `frozenPricesJson` preenchido.
- **198** faturas futuras (geradas pelo materializador antigo, ainda não
  pagas/vencidas) removidas para não duplicar com a geração lazy.
- **0** `patient_subscriptions` ativas restantes (Parte B sem trabalho
  efetivo nesta base).
- **0** templates `faturaConsolidada` restantes no catálogo após cleanup
  da UI.
- **9** planos `vigente` sem `acceptedAt` mantidos como rascunhos
  intencionais (não tocados).

### 6. Bug pós-migração corrigido — dashboard MRR

Após o `--apply`, o card **Receita Recorrente** do dashboard zerou
(`mrr = R$ 0`, `activeSubscriptions = 0`) porque
`financial-dashboard.routes.ts` e `financial-analytics.routes.ts` ainda
liam de `patient_subscriptions`, agora vazia.

**Fix:** ambos os endpoints agora calculam o MRR sobre
`treatment_plan_procedures`:

- `kind = 'recorrenteMensal'`, **OU**
- `kind IS NULL` com `packages.package_type IN ('mensal', 'faturaConsolidada')`
  (cobre os 18 itens migrados como legado),

restritos a planos com `accepted_at IS NOT NULL` e
`status IN ('vigente', 'ativo')`. O valor unitário usa
`COALESCE(unit_monthly_price, packages.monthly_price, unit_price)`.

`pendingConsolidatedInvoices` foi removido do payload (sempre 0 após a
descontinuação). `pendingSubscriptionCharges` agora filtra
`financial_records.transaction_type IN ('faturaPlano', 'faturaConsolidada')`.

**Validação SQL** (produção, 2026-04-28):

```text
mrr = R$ 3.610,00     (SUM dos 18 itens recorrentes ativos)
activeSubscriptions = 18
pendingSubscriptionCharges = R$ 830,00 (4 faturas pendentes)
```

## Critérios de aceite

- [x] Plano de tratamento renderiza com 4 abas e mantém a UX de cada bloco.
- [x] LancamentosTab mostra o painel "Pacotes Recorrentes" unificado.
- [x] `migrate-legacy-plans.ts` roda em dry-run sem erros.
- [x] `SubscriptionBillingPanel.tsx` removido sem quebrar imports.
- [x] Zero referências a "Assinatura" na UI clínica/financeira fora de
      `/saas/superadmin` e dos banners SaaS do `app-layout`.
- [x] `acceptedVia` aceita o valor `'legado'`.
- [x] `migrate-legacy-plans.ts --apply` executado em produção (18 planos
      legacy, 198 faturas futuras removidas).
- [x] `faturaConsolidada` removido do formulário/filtros/contadores do
      catálogo; templates legados ainda lidos read-only com badge âmbar.
- [x] Dashboard MRR lê de `treatment_plan_procedures`
      (`mrr = R$ 3.610,00`, `activeSubscriptions = 18` confirmados via SQL).
- [x] Typecheck verde nos 2 pacotes (`@workspace/api-server`,
      `@workspace/fisiogest`); 98/98 testes Vitest verdes.
