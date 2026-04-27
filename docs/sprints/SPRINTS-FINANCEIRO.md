# Roadmap Financeiro — FisioGest Pro

> Plano em 3 sprints (entregas) derivado da análise da lógica financeira em 2026-04-27.
> Cada sprint é independente e merge-able após aprovação. Marcar [x] ao concluir cada item.

---

## Sprint 1 — Correção crítica de preço (1 dia) ✅ ENTREGUE 2026-04-27

**Objetivo:** parar o sangramento de receita causado pelo bug em que o preço de tabela é
usado mesmo quando o paciente tem plano de tratamento ativo com preço diferenciado.

**Status:** todas as tarefas concluídas, 13/13 testes passando.
**Commits:** `1193bd6` (helper + colunas) · `17fe262` (testes preço acima da tabela).
**Cobertura adicional:** preço negociado **acima** da tabela também é cobrado (sem teto), com
`originalUnitPrice` preservado para auditoria de margem.

### T1. Resolver preço com hierarquia correta
- [x] Criar helper `resolveEffectivePrice(patientId, procedureId, clinicId)` em
      `artifacts/api-server/src/modules/clinical/appointments/appointments.pricing.ts`.
- [x] Hierarquia: `treatment_plan_procedures.unitPrice − discount` →
      `procedure_costs.priceOverride` → `procedures.price`.
- [x] Plano de tratamento só conta se `status = 'ativo'` e o procedimento estiver listado nele.
- [x] Substituir as linhas 58-74 em `appointments.billing.ts` pelo helper.
- [x] Reaproveitar o helper em `applyBillingRules` (todos os caminhos: fatura consolidada,
      crédito de sessão, débito de carteira, contas a receber).

### T2. Auditoria da origem do preço
- [x] Adicionar coluna `price_source` em `financial_records`
      (`enum: tabela | override_clinica | plano_tratamento`).
- [x] Adicionar coluna `original_unit_price` para guardar o preço de tabela vigente
      no momento (útil em auditoria fiscal).
- [x] Migration `0001_add_price_source.sql`.
- [x] Persistir `priceSource` em todos os `INSERT` de `financial_records` em `appointments.billing.ts`.

### T3. Testes
- [x] Teste unitário do `resolveEffectivePrice` cobrindo:
  - Sem plano → usa `procedure.price`.
  - Sem plano + override → usa `priceOverride`.
  - Com plano sem desconto → usa `unitPrice`.
  - Com plano com desconto → usa `unitPrice − discount`.
  - Plano `inativo` → ignora.
  - Procedimento não listado no plano → ignora plano.

### Critérios de aceite
- Confirmar agendamento de paciente com plano ativo (procedimento R$ 80, desconto R$ 10)
  gera `financial_records.amount = 70.00`.
- O mesmo paciente sem plano gera R$ 80,00.
- Coluna `price_source` populada corretamente em todos os casos.
- Suite de testes passa: `pnpm test`.

---

## Sprint 2 — Plano como venda + configuração financeira (3-4 dias) 🟡 EM ANDAMENTO

**Objetivo:** transformar o plano de tratamento em uma "venda formal" e dar à clínica
controle sobre orçamento e metas.

### T4. Aceitação de plano de tratamento
- [x] Adicionar `accepted_at`, `accepted_by`, `frozen_prices_json`, `parent_plan_id` em `treatment_plans`.
- [x] Endpoint `POST /api/patients/:patientId/treatment-plans/:planId/accept`.
- [x] Snapshot dos preços vigentes em `frozen_prices_json` no momento da aceitação.
- [x] Após aceito: bloquear `PUT` que altere preço/desconto/procedimentos (retorna 409 com
      mensagem de "renegociação necessária"). Status, objetivos e notas continuam editáveis.
- [x] Endpoint `POST /api/.../treatment-plans/:planId/renegotiate` para versionar via `parent_plan_id`
      (clona procedimentos, encerra plano anterior como `concluido`, novo plano nasce sem aceite).
- [ ] Geração de **receita estimada** agregada em `treatment_plan_estimates` para alimentar
      o fluxo de caixa projetado (próxima iteração — Sprint 3 T7 já cobre via snapshot).

### T5. Configurações financeiras da clínica ✅
- [x] Nova tabela `clinic_financial_settings`:
  - `monthly_expense_budget` (orçamento total mensal de despesa)
  - `monthly_revenue_goal`
  - `cash_reserve_target` (reserva mínima — alerta no fluxo projetado, Sprint 3)
  - `default_due_days` (com fallback para `clinics.default_due_days`)
- [x] Adicionar `monthly_budget` em `recurring_expenses` (orçado pode diferir do `amount` cobrado).
- [x] Endpoints `GET/PUT /api/clinics/current/financial-settings` (gated por `financial.view.budget`).
- [x] DRE/Orçado vs Realizado consomem metas configuradas (`revenueSource`/`expensesSource`).
- [x] `appointments.billing` lê `defaultDueDays` via `getClinicFinancialSettings`.
- [x] Tela de configuração em `Configurações → Financeiro` (`FinanceiroSection.tsx`).
- [x] Schema aplicado via SQL idempotente (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`); push do drizzle-kit não roda sem TTY.

### T6. Diferenciação simplificada vs avançada por plano SaaS ✅
- [x] Adicionar features em `lib/shared-constants/src/plan-features.ts`:
  - `financial.view.simple` (todos)
  - `financial.view.cash_flow` (profissional+)
  - `financial.view.dre` (profissional+)
  - `financial.view.budget` (profissional+)
  - `financial.view.accounting` (premium)
  - `financial.cost_per_procedure` (profissional+)
- [x] Esconder abas no frontend via `hasFeature()` em `pages/financial/index.tsx`
      (custos→`financial.cost_per_procedure`, orçado→`financial.view.budget`,
      DRE→`financial.view.dre`, despesas-fixas→`module.recurring_expenses`).
- [x] Esconder seção "Financeiro" em Configurações via `feature: financial.view.budget`.
- [x] Proteger rotas no backend via `requireFeature()` em DRE, custos por procedimento e settings.

### Critérios de aceite
- Plano aceito não permite mais alterar preço sem versionar.
- Orçamento configurado aparece em "Orçado vs Realizado" como meta-base.
- Plano "essencial" só vê aba "Caixa Simples"; "profissional" vê DRE; "premium" vê tudo.

---

## Sprint 3 — Fluxo de Caixa Projetado + auditoria (2-3 dias) 🟢

**Objetivo:** ferramenta de gestão de capital de giro inexistente nos concorrentes
+ melhorias finais de qualidade/auditoria.

### T7. Fluxo de Caixa Projetado
- [ ] Endpoint `GET /api/financial/cash-flow-projection?days=30`.
- [ ] Saída: `[{ date, opening, expectedIn, expectedOut, closing, alert? }]`.
- [ ] Considerar:
  - Saldo inicial = soma de `cash` no plano de contas
  - Entradas = `financial_records` `receita pendente` por `due_date`
  - Saídas = `financial_records` `despesa pendente` + `recurring_expenses` projetadas
- [ ] Nova aba "Fluxo de Caixa" no frontend com gráfico de área e tabela.
- [ ] Linha vermelha = `cash_reserve_target` configurado.

### T8. Categorização contábil por procedimento
- [ ] Adicionar `accounting_account_id` em `procedures`.
- [ ] Sub-contas dinâmicas em `accounting_accounts` (4.1.1.01, 4.1.1.02, ...).
- [ ] DRE por categoria de procedimento.

### T9. Auditoria robusta de estornos
- [ ] Adicionar `original_amount`, `reversal_reason`, `reversed_by` em `financial_records`.
- [ ] Telas de "histórico de estornos" para auditoria.

### Critérios de aceite
- Aba "Fluxo de Caixa" mostra saldo projetado dos próximos 30 dias.
- DRE por procedimento funciona no nível contábil (não só em `financial_records.category`).
- Todo estorno registra motivo, autor e valor original.
