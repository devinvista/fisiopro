# Redesign — Planos de Tratamento, Pacotes e Materialização

> **Status:** Proposta para aprovação
> **Autor:** Replit Agent
> **Data:** 28/04/2026
> **Constraint dura:** _nenhuma_ alteração toca agendamentos com `date < 2026-04-30`.

---

## 1. Diagnóstico do estado atual

### 1.1 Sobreposição entre **assinaturas** e **pacotes mensais**
| Camada | Onde está | O que faz |
|---|---|---|
| `patient_packages.packageType = 'mensal'` | `lib/db/src/schema/patient-packages.ts` | Vincula um pacote do catálogo ao paciente |
| `patient_subscriptions` | `lib/db/src/schema/subscriptions.ts` | Recorrência (billing_day, monthly_amount) |
| Criação automática | `patient-packages.routes.ts` | Ao vender um `mensal`, **cria também** uma `patient_subscription` |
| Cobrança | `billing.service.ts` (job 09:00) | Roda sobre `patient_subscriptions` — não enxerga o pacote |

**Resultado:** dois registros para a mesma realidade contábil, lógica espalhada, regras divergentes (sessions_per_week mora no pacote; billing_day mora na subscription) e bugs como o que vimos hoje (loose-payment-relink).

### 1.2 Materialização poluindo a base
Hoje "materializar" um plano:
1. Cria **N agendamentos** para toda a vigência (no caso real: 1.839 em um clique).
2. Cria **M faturas mensais futuras** (`faturaPlano`) com status `pendente`.
3. Reconhece receita prematura no ledger contábil (vimos hoje: 247 entries).

**Problemas observáveis:**
- Reagendar 1 sessão exige tocar em vários registros.
- Cancelar plano gera cascata destrutiva (1.839 deletes hoje).
- Receita futura aparece em relatórios atuais — distorce dashboards.
- Estornos em massa quando algo dá errado (vimos 540 entries removidos hoje).

### 1.3 Planos mistos (mensal + avulso) sem clareza
Hoje cada item carrega `avulsoBillingMode` (`porSessao` | `mensalConsolidado`). O segundo modo cria automaticamente uma subscription tipo `faturaConsolidada` no primeiro check-in. Resulta em **3 entidades** (plano + pacote mensal + subscription consolidada) para um único contrato.

### 1.4 Materialização ≠ Aceite
Hoje "materializar" é puramente operacional (gerar registros). Não há **aceite formal** do paciente — sem termo, sem assinatura, sem trilha de consentimento. Isso é **risco LGPD/COFFITO**.

---

## 2. Visão proposta

### 2.1 Conceitos consolidados
| Conceito atual | Vira |
|---|---|
| `patient_subscriptions` (mensal/consolidada) | **REMOVIDO** — funde no `patient_packages` |
| `patient_packages` (mensal) | **`PlanItem`** do tipo `recorrenteMensal` |
| `patient_packages` (sessoes) | **`PlanItem`** do tipo `pacoteSessoes` |
| Procedimentos avulsos do plano | **`PlanItem`** do tipo `avulso` |
| `treatment_plans.materializedAt` | **`acceptedAt`** + `acceptedSignature*` |
| Job `runConsolidatedBilling` | **REMOVIDO** — vira fatura mensal do plano agrupando avulsos |

### 2.2 Fluxo do usuário (novo)
```
1. Profissional cria Plano (rascunho)
   └── adiciona PlanItems (mensal | sessões | avulso) com preços negociados

2. Plano é apresentado ao paciente
   └── tela de aceite (presencial ou link público)
       ├── visualiza termo + valores + cronograma
       ├── assina (texto digitado + IP + device + timestamp)
       └── plano vira "vigente"

3. Sistema gera APENAS o necessário no aceite:
   ├── Pacote por sessões → 1 fatura à vista + N créditos
   ├── Recorrente mensal → 1 fatura do mês corrente (próximas vão sendo geradas mês a mês)
   └── Avulso → nada agora; cobra na conclusão do atendimento

4. Agenda mostra grade RECORRENTE virtualmente
   └── appointment real só é criado quando: usuário confirma, OU T-7 dias do horário previsto

5. Cobrança mensal:
   └── Job diário cria fatura do mês que está chegando (D-5 do billingDay)
   └── Itens avulsos consumidos no mês entram na MESMA fatura mensal (1 por plano)
```

### 2.3 Arquitetura de dados (alvo)
```
treatment_plans
├── id
├── status: rascunho | vigente | encerrado | cancelado
├── accepted_at, accepted_by_signature, accepted_ip, accepted_device, accepted_via (presencial|link)
├── start_date, end_date
└── notes, objectives

treatment_plan_items   (renomeada de treatment_plan_procedures)
├── id, plan_id
├── kind: recorrenteMensal | pacoteSessoes | avulso
├── procedure_id | package_id (opcional)
├── unit_price, discount, monthly_amount
├── sessions_planned (sessões)  | sessions_per_month, week_days, default_time, professional_id (recorrenteMensal)
└── created_at

session_credits   (mantida)
└── origin: pacoteSessoes | recorrenteMensal | reposicaoFalta | cortesia

financial_records
├── transactionType: faturaPlano | vendaPacote | avulso  (sem 'faturaConsolidada')
└── …
```

> **Removidas:** `patient_subscriptions`, `subscription_billing_logs`, `patient_packages` (lida só por compat na transição).

---

## 3. Plano por sprints

> Cada sprint termina com **plano funcionando em produção**, com migração reversível e flag de feature.

### Sprint 0 — Estabilizar (≈ 3 dias)
**Objetivo:** preparar o terreno sem mudar comportamento.
- [ ] Snapshot lógico do banco (`pg_dump`) + plano de rollback.
- [ ] Testes de regressão para: cobrança mensal, fatura consolidada, créditos, materialização atual.
- [ ] Feature flag `redesign_planos` (off em prod).
- [ ] **Regra:** scripts de backfill exigem `--apply` explícito + dry-run obrigatório.
- [ ] Dashboard com contagem de subscriptions ativas, planos materializados, appointments futuros vinculados a plano (baseline).

**Arquivos novos:** `tests/regression/plano-billing.test.ts`, `scripts/snapshot-db.sh`.
**Critério de aceite:** rodar todos os jobs do scheduler sem nenhum efeito colateral inesperado.

---

### Sprint 1 — Unificar Pacote Mensal e Assinatura (≈ 5 dias)
**Objetivo:** mover a recorrência para `patient_packages`, manter `subscriptions` apenas como _read-mirror_.

- [ ] Adicionar a `patient_packages`: `billing_day`, `monthly_amount`, `next_billing_date`, `status_recorrencia` (active|paused|canceled).
- [ ] Migrar dados existentes: para cada `patient_subscriptions` ativa que tem `patient_package_id`, copiar billing_day/monthly_amount para o pacote.
- [ ] Refatorar `billing.service.ts` para iterar em `patient_packages` (mensal/consolidada) em vez de subscriptions.
- [ ] Endpoints `POST /api/subscriptions` retornam 410 Gone (com mensagem de migração); UI atualizada.
- [ ] `appointments.billing.ts`: deixar de criar subscription consolidada; em seu lugar, criar/usar item `recorrenteMensal` + `avulsoBillingMode`.
- [ ] Manter `patient_subscriptions` como tabela de leitura (não deleta) por 1 sprint.

**Arquivos:** `lib/db/src/schema/patient-packages.ts`, `billing.service.ts`, `consolidated-billing.service.ts`, `appointments.billing.ts`, `patient-packages.routes.ts`, `SubscriptionsSection.tsx` (vira `RecurringPackageSection`).
**Critério de aceite:** zero novas linhas em `patient_subscriptions` após esta sprint; cobrança mensal continua igual no relatório.

---

### Sprint 2 — Plano como Contrato com Aceite (≈ 5 dias)
**Objetivo:** materialização vira **aceite formal**, sem criar agendamentos.

- [ ] Schema:
  - `treatment_plans.status` (rascunho | vigente | encerrado | cancelado)
  - `accepted_at`, `accepted_by_signature` (text), `accepted_ip`, `accepted_device`, `accepted_via`
- [ ] Renomear `treatment_plan_procedures` → `treatment_plan_items`; coluna `kind`.
- [ ] Backend:
  - `POST /api/treatment-plans/:id/accept` (presencial ou via token público)
  - `POST /api/treatment-plans/:id/public-link` (gera token short-lived)
  - Aceite → cria 1 fatura imediata (pacotes por sessão / mês corrente do recorrente) + créditos (se sessões prepagas).
  - **Não cria appointments futuros.**
- [ ] Frontend:
  - Tela `/aceite/:token` (mobile-first) — termo, valores, cronograma, campo de assinatura, botão "li e concordo".
  - Aba do plano no prontuário: botão "Apresentar termo" (gera link/QR) + "Coletar aceite presencial".
  - Trilha de aceite visível no prontuário (LGPD).

**Arquivos:** `lib/db/src/schema/medical-records.ts`, `treatment-plans.routes.ts`, `treatment-plans.acceptance.ts`, `pages/aceite/[token].tsx`, `TreatmentPlanTab.tsx` (refatorada).
**Critério de aceite:** novo plano só fatura/credita após aceite; agenda não recebe nada na materialização.

---

### Sprint 3 — Geração Lazy de Faturas (≈ 4 dias)
**Objetivo:** parar de criar 12 meses de fatura adiantados.

- [ ] Job diário `runMonthlyPlanBilling`:
  - Para cada plano `vigente` com item `recorrenteMensal`, gera fatura do mês corrente em D-5 do `billing_day` (se não existir).
  - Se houver atrasados (gap), gera os faltantes em ordem.
- [ ] Avulsos consumidos no mês são lançados como **linhas filhas** da fatura mensal do plano (mesmo `parent_record_id`).
- [ ] Reconhecimento de receita acontece na **conclusão da primeira sessão do mês** (já existe, mantém).
- [ ] Script de limpeza: apaga faturas `pendente` futuras dos planos migrados (com flag, com dry-run).

**Arquivos:** `billing.service.ts` (refator), `monthly-plan-billing.service.ts` (novo), `appointments.billing.ts`, `scheduler.ts`.
**Critério de aceite:** banco passa a ter no máximo 1-2 faturas futuras por plano em qualquer momento.

---

### Sprint 4 — Geração Lazy de Agendamentos (≈ 5 dias)
**Objetivo:** agenda mostra grade recorrente sem materializar tudo.

- [ ] Backend: endpoint `GET /api/agenda/grid?from=&to=` retorna **appointments reais + sugestões virtuais** dos itens recorrentes do plano (tipo `kind: 'sugestao'`, sem id).
- [ ] Confirmação de presença OU T-7 dias antes → cria appointment real automaticamente.
- [ ] Reagendamento: se a sugestão ainda é virtual, só altera `week_days/default_time` do item; se já real, cria reschedule normal.
- [ ] Frontend: agenda renderiza sugestões com estilo distinto (tracejado).

**Arquivos:** `appointments.routes.ts`, `appointments.virtual-grid.ts` (novo), componentes `Agenda*.tsx`.
**Critério de aceite:** plano vigente não cria mais appointments em massa; agenda visual continua completa.

---

### Sprint 5 — UI/UX e Migração de Dados Legados (≈ 5 dias)
**Objetivo:** consolidar a experiência e migrar todos os dados.

- [ ] Tela única "Plano de Tratamento" no prontuário com tabs: Itens / Aceite / Cobrança / Sessões.
- [ ] Painel financeiro de "Pacotes Recorrentes" (substitui `SubscriptionBillingPanel`).
- [ ] Migrar planos existentes:
  - Materializados sem aceite → marca `accepted_at = materialized_at`, `accepted_via = 'legado'`.
  - Subscriptions órfãs → vira `PlanItem` solto vinculado a um "Plano Legado" do paciente.
- [ ] Remoção do conceito de `faturaConsolidada` (UI + filtros + relatórios).

**Arquivos:** `TreatmentPlanTab.tsx`, `RecurringPackagesPanel.tsx`, `pages/financial/*`, scripts `migrate-legacy-plans.ts`.
**Critério de aceite:** zero referências a "assinatura" na UI fora de `/saas/superadmin` (que é assinatura SaaS, conceito diferente).

---

### Sprint 6 — Limpeza Final (≈ 2 dias)
- [ ] Drop tabela `patient_subscriptions`, `subscription_billing_logs` (após backup).
- [ ] Remover `consolidated-billing.service.ts`, endpoints deprecated.
- [ ] Atualizar `replit.md`, `docs/financial.md`, `docs/clinical.md`.
- [ ] Comunicado de release notes interno.

---

## 4. Como lida com **plano misto** (mensal + avulso)

**Exemplo concreto:** Maria contrata
- 8 sessões/mês de Pilates a R$ 800 (recorrente mensal)
- Avaliação postural única a R$ 250 (avulso)
- Drenagem extra quando precisar a R$ 120/sessão (avulso, por sessão)

**Como fica:**

| Momento | Pilates (mensal) | Avaliação (avulso única) | Drenagem (avulso por sessão) |
|---|---|---|---|
| **Aceite** | Fatura abril R$ 800 + 8 créditos pré-pagos | Fatura R$ 250 (à vista) | Nada |
| **Sessão Pilates** | Consome crédito, sem cobrança | — | — |
| **Avaliação** | — | Marca crédito consumido | — |
| **Drenagem** | — | — | Vira linha filha da fatura mensal de abril (parent = fatura Pilates) |
| **Fim do mês** | — | — | Fatura mensal de abril fica: R$ 800 (Pilates) + R$ 120×N (Drenagens) |

**Resultado:** **uma fatura mensal por plano**, agrupando recorrência + avulsos do mês. Simples para o paciente entender, simples para a clínica conciliar.

---

## 5. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Perder dados de subscriptions ao migrar | Snapshot antes de cada sprint + leitura paralela durante 1 sprint |
| Receita reconhecida em duplicata na transição | Sprint 1 mantém apenas 1 fonte ativa por vez (flag) |
| Pacientes sem aceite ficam sem cobrança | Migração marca legados como `accepted_via=legado` |
| Grade virtual confunde profissionais | Estilo visual distinto + tooltip "Sugestão do plano — confirme" |
| Mexer em agendamentos < 30/04 | Todo script tem `WHERE date >= '2026-04-30'` hard-coded |

---

## 6. Estimativa total
- **Esforço:** ~29 dias úteis (≈ 6 semanas com 1 engenheiro full-time).
- **Sequência obrigatória:** Sprint 0 → 1 → 2; depois 3-4 podem rodar em paralelo; 5-6 fecham.
- **Pontos de não-retorno:** Sprint 6 (drop de tabelas).

---

## 7. Pergunta para você antes de começar

1. Aprovar a remoção total de `patient_subscriptions` (mantendo apenas `patient_packages` recorrente)?
2. Aprovar que materialização vira aceite formal (com termo + assinatura digital simples)?
3. Aprovar geração lazy de agendamentos (grade virtual em vez de pré-criados)?
4. Posso seguir Sprint 0 imediatamente após sua aprovação, ou quer revisar mais algum item?
