# Sprint 4 — Cascateamento de Pagamento de Faturas Consolidadoras

> Status: ✅ Entregue (28/04/2026)
>
> Pré-requisitos: Sprint 3 (geração lazy + `parent_record_id` para
> avulsos do mês).

## Problema

Antes do Sprint 4, o handler de pagamento em
`financial-payments.routes.ts` tratava qualquer `pendente` igualmente:
**reconhecia receita** se `recognizedEntryId` estivesse nulo, depois
**postava settlement** e marcava `pago`.

Isso causava dois bugs em faturas agrupadoras (`faturaMensalAvulso`):

1. **Receita dobrada.** Os filhos `creditoAReceber` JÁ haviam
   reconhecido receita no momento da confirmação da sessão (D:
   Recebíveis / C: Receita). Quando o operador pagava o parent
   `faturaMensalAvulso`, o handler reconhecia receita do parent
   também — totalizando **2× a receita real**.
2. **Filhos órfãos.** Pagar o parent não atualizava o status dos
   filhos. Eles ficavam `pendente` para sempre, contaminando o
   relatório de inadimplência.

## Solução

Branch dedicada para `faturaMensalAvulso` no payment loop:

1. **Pula o reconhecimento de receita do parent** — o parent é apenas
   um agrupador (sem revenue própria).
2. Posta UM `postReceivableSettlement` para `parent.amount`
   (D: Caixa / C: Recebíveis).
3. Aloca o `paymentEntry` contra o `recognizedEntryId` de **cada
   filho** (sumando `parent.amount` quando os filhos cobrem o total —
   invariante por construção em `closeAvulsoMonth`).
4. Cascateia status `pago` para todos os filhos `pendente` com mesmos
   `paymentDate`, `paymentMethod` e `settlementEntryId`.
5. O loop de pagamento mantém um `Set<number>` de IDs cascateados e
   pula filhos já marcados (eles ainda estão no snapshot
   `pendingRecords` carregado antes da transação).

Pagamento parcial (`allocationAmount < parent.amount`) NÃO cascateia:
o parent fica parcialmente quitado e os filhos seguem `pendente`.

### Por que não cascatear `faturaPlano` (Sprint 3) automaticamente?

O `faturaPlano` mantém `parent_record_id` para os `creditoAReceber`
de avulsos do mês, mas **`parent.amount` é apenas a mensalidade
fixa** — os filhos têm valor próprio (sessões avulsas extras), e
cada filho já é seu próprio recebível. O loop de pagamento natural
processa parent + filhos em sequência (ordenados por `dueDate`):

- Pagar exatamente a mensalidade → quita só o parent (correto: avulsos
  ainda devem).
- Pagar mensalidade + avulsos no total → loop processa parent
  primeiro (paid), depois cada filho na próxima iteração (paid).

Não precisamos de lógica especial: o `parent_record_id` aqui é
**puramente de agrupamento visual** para o extrato mensal unificado.

## O que entrou no escopo

| Item | Caminho | Tipo |
| ---- | ------- | ---- |
| Helper de cascade | `artifacts/api-server/src/modules/financial/payments/payment-cascade.ts` | Novo |
| Branch `faturaMensalAvulso` no loop | `artifacts/api-server/src/modules/financial/payments/financial-payments.routes.ts` | Update |
| Skip de filhos cascateados | `financial-payments.routes.ts` (`cascadedChildIds: Set<number>`) | Update |
| Testes unitários | `payment-cascade.test.ts` (4 casos) | Novo |

## API do helper

```ts
import {
  cascadeFaturaMensalAvulsoPayment,
  countPendingChildren,
} from "./payment-cascade.js";

await cascadeFaturaMensalAvulsoPayment({
  tx,                              // Drizzle tx
  parent: { id, clinicId, patientId, amount },
  paymentDate: "YYYY-MM-DD",
  paymentMethod: string | null,
  settlementEntryId,               // id do journal_entry de settlement
});
// → { cascadedChildIds: number[], totalCascaded: "0.00" }
```

Idempotente: chamadas subsequentes retornam `cascadedChildIds=[]`
porque o filtro exige `status='pendente'`.

## Acoplamento com `closeAvulsoMonth`

A invariante crítica que torna o cascade seguro:

> `parent.amount = SUM(filhos.amount)` por construção em
> `closeAvulsoMonth` (sprints/clinical/medical-records/treatment-plans.close-month.ts).

Se essa invariante for quebrada (ex.: filho adicionado depois sem
recomputar o parent), o cascade marcará o filho extra como `pago`
sem que o pagamento o tenha coberto. Por enquanto o
`closeAvulsoMonth` é a única origem de `faturaMensalAvulso`, e ele
NÃO permite recálculo idempotente do parent quando filhos novos
aparecem (retorna `alreadyClosed=true` sem reagregar). Sprint
posterior pode endereçar isso (re-aggregation no closeAvulsoMonth).

## Validação

- ✅ `tsc --noEmit` em `@workspace/api-server` limpo.
- ✅ Suíte vitest: **318/318** (314 do Sprint 3 + 4 novos).
- ✅ Boot da workflow `Start application` saudável (todos os jobs
  registrados, server escutando em 8080).

## Próximos passos sugeridos

1. **Endpoint manual `POST /api/billing/monthly-plan/run`** para
   acionar `runMonthlyPlanBilling({ triggeredBy: "manual" })` (admin
   only, gated por feature flag `financial.write`).
2. **UI de execuções** filtrando
   `billing_run_logs.triggeredBy ILIKE 'monthlyPlanBilling:%'`.
3. **Reverso de cascade**: hoje não há fluxo de estorno do
   pagamento de uma `faturaMensalAvulso`; Sprint 5 pode adicionar
   `revertFaturaMensalAvulsoPayment` que volta filhos para `pendente`
   e reverte alocações.
