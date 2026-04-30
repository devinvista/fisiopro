# Migração do fluxo de aceite v1 → v2 (Sprint 15)

Este documento explica como migrar uma clínica do **fluxo de aceite legado
(v1)** para o **fluxo atômico (v2)** entregue na Sprint 15. Aplica-se a
operadores da clínica (UX) e a engenheiros que precisam manter os dois
fluxos em paralelo durante o período de coexistência.

---

## TL;DR

- A flag `clinics.use_v2_acceptance_flow` controla qual UI o `TreatmentPlanTab` renderiza.
- **Clínicas novas** (criadas após 30/04/2026) já nascem em v2 (`DEFAULT TRUE` via `0018_default_v2_for_new_clinics.sql`).
- **Clínicas existentes** continuam em v1 até ativarem o switch em **Configurações → Clínica → Novo fluxo de aceite de plano**.
- A troca afeta **só planos novos**; planos vigentes seguem com o snapshot capturado no aceite original (imutável).
- Endpoints e componentes legados continuam funcionando — nada foi removido.

---

## O que muda para o operador da clínica

### Fluxo legado (v1) — 3 etapas

```
Itens do plano  →  Aceite + assinatura  →  Cobrança / agenda
```

- O paciente assinava ANTES de ter agenda configurada.
- Resultado: faturas geradas para um plano sem consultas marcadas, e a materialização posterior podia falhar deixando o sistema inconsistente (aceite contabilizado, sem appointments).
- Aceite via link público mostrava apenas o contrato — sem a agenda real.

### Fluxo novo (v2) — 4 etapas

```
Itens  →  Cobrança  →  Agenda  →  Contrato (assinar + materializar)
```

- A agenda é configurada ANTES da assinatura.
- O botão "Assinar e iniciar plano" dispara aceite + materialização em **uma única operação atômica** (com rollback compensatório se a materialização falhar).
- Aceite via link público (`/aceite/:token`) renderiza a **agenda completa** antes do botão de assinatura. Se a clínica ainda não configurou a agenda, o botão fica desabilitado com aviso.

---

## Como ativar v2 numa clínica existente

1. Entre em **Configurações → Clínica**.
2. Role até a seção **Novo fluxo de aceite de plano**.
3. Ative o switch e clique em **Salvar Alterações**.
4. A partir do próximo plano criado, o assistente já abre no fluxo novo.

> Planos já em `vigente` ou `rascunho` não mudam de fluxo — o snapshot do
> aceite é imutável. A flag só decide qual UI o **assistente de criação**
> renderiza para planos novos.

---

## O que muda para engenheiros

### Endpoints legados (`@deprecated`, mantidos para compat)

| Endpoint | Substituto | Estado |
|---|---|---|
| `POST /api/patients/:p/treatment-plans/:id/accept` | `POST .../accept-and-materialize` | Mantido — usado quando v1 ativo |
| `POST /api/treatment-plans/:id/materialize` | `acceptAndMaterializePlan` orquestra internamente | Mantido **como ferramenta de reparo** (re-materializar sem refazer aceite) |
| `POST /api/public/treatment-plans/by-token/:t/accept` | `POST .../accept-and-materialize` | Mantido — frontend escolhe pela flag do snapshot |

### Funções de serviço (`@deprecated`, building blocks)

- `acceptPatientTreatmentPlan` — segue exportada porque o orquestrador atômico (`acceptAndMaterializePlan`) usa internamente. **Não criar callers externos novos.**
- `materializeTreatmentPlan` — idem; segue suportada como reparo manual.

### Componentes frontend (`@deprecated`, no bundle)

- `AcceptanceBlock.tsx` — painel de aceite v1. Renderizado pelo `TreatmentPlanTab` quando `useV2AcceptanceFlow=false`.
- `AcceptanceScheduleEditor.tsx` — segue **ATIVO no v2** (montado pelo `StepAgendaV2`). Marca `@deprecated` indica apenas que o nome herda a era v1 e será renomeado para `PlanScheduleEditor` em uma próxima limpeza.

### Não-deprecação

- `acceptAndMaterializePlan` (orquestrador) — caminho recomendado.
- `revertPlanAcceptance` — usado pelo rollback compensatório.
- `validatePlanForAtomicAccept` — pré-checagem usada pela UI v2.
- `enumeratePlanAppointments` — preview da agenda usado por `loadPublicPlanSnapshot` e pelo endpoint autenticado `/preview-appointments`.

---

## Cronograma de remoção

A remoção do código legado está condicionada a:

1. **100% das clínicas em produção** com `use_v2_acceptance_flow=true`.
2. **90 dias** sem regressões reportadas no fluxo v2.
3. Auditoria de que nenhum plano vigente ainda dependa de campos exclusivos de v1.

Após o gate, planejado para Sprint 16+:

- Remover `POST /accept` (presencial e público).
- Remover `acceptPatientTreatmentPlan` (transformar em interno do orquestrador).
- Remover `AcceptanceBlock.tsx`.
- Renomear `AcceptanceScheduleEditor.tsx` → `PlanScheduleEditor.tsx`.
- Remover ramo `!v2` do `TreatmentPlanTab`.
- `POST /materialize` (standalone) **será mantido** como ferramenta de reparo.

---

## Histórico das migrations relevantes

| Migration | Descrição |
|---|---|
| `0017_clinics_use_v2_acceptance_flow.sql` | Adiciona coluna `use_v2_acceptance_flow BOOLEAN NOT NULL DEFAULT FALSE`. |
| `0018_default_v2_for_new_clinics.sql` | Troca o DEFAULT da coluna para `TRUE`. Não atualiza linhas existentes. |
