# Roadmap Financeiro — FisioGest Pro

> Plano em 3 sprints (entregas) derivado da análise da lógica financeira em 2026-04-27.
> Cada sprint é independente e merge-able após aprovação. Marcar [x] ao concluir cada item.

---

## Sprint 1 — Correção crítica de preço (1 dia) 🔴

**Objetivo:** parar o sangramento de receita causado pelo bug em que o preço de tabela é
usado mesmo quando o paciente tem plano de tratamento ativo com preço diferenciado.

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

## Sprint 2 — Plano como venda + configuração financeira (3-4 dias) 🟡

**Objetivo:** transformar o plano de tratamento em uma "venda formal" e dar à clínica
controle sobre orçamento e metas.

### T4. Aceitação de plano de tratamento
- [ ] Adicionar `accepted_at`, `accepted_by`, `frozen_prices_json` em `treatment_plans`.
- [ ] Endpoint `POST /api/treatment-plans/:id/accept`.
- [ ] Quando aceito: snapshot dos preços vigentes e geração de **receita estimada**
      (não contábil — projeção em `treatment_plan_estimates`).
- [ ] Após aceito: alterar preço requer "renegociação" (versionar plano com `parent_id`).

### T5. Configurações financeiras da clínica
- [ ] Nova tabela `clinic_financial_settings`:
  - `monthly_expense_budget` (orçamento total mensal de despesa)
  - `monthly_revenue_goal`
  - `cash_reserve_target` (reserva mínima)
  - `default_due_days` (migrar de `clinics`)
- [ ] Adicionar `monthly_budget` em `recurring_expenses` (orçado pode diferir do `amount` cobrado).
- [ ] Tela de configuração em `Configurações → Financeiro`.
- [ ] Migration `0002_clinic_financial_settings.sql`.

### T6. Diferenciação simplificada vs avançada por plano SaaS
- [ ] Adicionar features em `lib/shared-constants/src/plan-features.ts`:
  - `financial.view.simple` (todos)
  - `financial.view.cash_flow` (profissional+)
  - `financial.view.dre` (profissional+)
  - `financial.view.budget` (profissional+)
  - `financial.view.accounting` (premium)
  - `financial.cost_per_procedure` (profissional+)
- [ ] Esconder abas no frontend via `<FeatureGate />`.
- [ ] Proteger rotas no backend via `requireFeature()`.

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
