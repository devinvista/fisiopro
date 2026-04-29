# Auditoria do Fluxo Financeiro — FisioGest Pro

Data: 2026-04-29
Escopo: ciclo completo Venda → Operacionalização → Contabilização (DRE/Balancete).
Base de evidências: leitura dos módulos `financial/*`, `clinical/medical-records/*` e `clinical/appointments/*` da api-server.
Objetivo: mapear o fluxo, identificar bugs, riscos contábeis e oportunidades de governança/otimização.

---

## 1. Mapa do fluxo (estado atual)

### 1.1 Origens de receita
| Origem | Tipo | Reconhecimento de receita | Conta principal |
|---|---|---|---|
| Sessão avulsa (porSessao) | `creditoAReceber` | Na confirmação da sessão (D 1.1.2 / C 4.1.x) | Recebíveis / Receita Serviço |
| Carteira (saldo R$) | `usoCarteira` | No débito da carteira (D 2.1.1 / C 4.1.x) — `postWalletUsage` | Adiantamentos / Receita |
| Crédito de pacote | `usoCredito` | Por crédito consumido (D 2.1.1 / C 4.1.2) — `postPackageCreditUsage` | Adiantamentos / Receita Pacote |
| Pacote recorrente (faturaConsolidada) | `pendenteFatura` | Na confirmação da sessão (D 1.1.2 / C 4.1.x) | Recebíveis / Receita |
| Plano materializado mensal (`faturaPlano`) | `faturaPlano` (mãe) + sessões filhas | 1ª confirmação do mês reconhece o **valor integral** da fatura | Recebíveis ou Adiantamentos / Receita |
| Avulso consolidado (`faturaMensalAvulso`) | mãe agrupadora | Filhos reconhecem na sessão; mãe só recebe o `settlement` | — |
| Venda de pacote pré-pago | `vendaPacote` | Não é receita; vai para Adiantamentos | 1.1.1 / 2.1.1 |

### 1.2 Pagamento (`POST /patients/:id/payment`)
1. Cria `paymentRecord` (`pagamento`, status=pago).
2. Lista `pendingRecords` (todos os `RECEIVABLE_TYPES` + `vendaPacote`) e aloca o valor pago em ordem de `dueDate, createdAt`.
3. Para cada pendência:
   - `faturaPlano` sem `accountingEntryId` → `postCashAdvance` (D 1.1.1 / C 2.1.1).
   - `faturaMensalAvulso` → `postReceivableSettlement` + cascata para filhos.
   - Outros recebíveis → `postReceivableRevenue` (se ainda não houver) + `postReceivableSettlement` + `allocateReceivable`.
4. Sobra (`remaining > 0`) → `postCashReceipt` (D 1.1.1 / C 4.1.x “direto”).

### 1.3 Cancelamento / estorno
- `PATCH /records/:id/status` com `status ∈ {cancelado,estornado}` → `postReversal` (estorno espelhado).
- `PATCH /records/:id/estorno` → idem, com motivo obrigatório.
- `DELETE /records/:id`:
  - despesa → DELETE físico.
  - receita → soft delete: apenas `status='estornado'` **sem** estorno contábil.

---

## 2. Bugs e inconsistências (com severidade e evidência)

### 🔴 B1 — `DELETE /records/:id` (receita) não posta `postReversal`
**Arquivo:** `financial/records/financial-records.routes.ts:481-518`
**Sintoma:** soft-delete altera apenas `status='estornado'`; o lançamento contábil (recebível, receita, settlement) permanece ativo no journal. `getAccountingBalances` e o DRE continuam contando essa receita; o saldo de Recebíveis fica inflado.
**Cascata:** o relatório `revenueSummarySql()` filtra por status, mas a fonte da verdade contábil é o journal — eles divergem em qualquer DRE puxado de `accounting_journal_lines`.
**Severidade:** Alta — causa divergência entre relatório operacional e contábil.
**Correção sugerida:** rodar `postReversal(entryId, …)` dentro de transação como já é feito em `PATCH /records/:id/estorno`. Idealmente, redirecionar este endpoint internamente para o mesmo handler do estorno (exigindo `reversalReason`).

### 🔴 B2 — `PATCH /records/:id` permite editar `amount`/`type` sem trilha contábil
**Arquivo:** `financial-records.routes.ts:158-214`
**Sintoma:** o handler atualiza `amount`, `type`, `paymentDate` e `status` sem:
- preencher `originalAmount` (só é preenchido nos handlers de estorno);
- gerar `postReversal` + reposting quando o valor muda em registro já contabilizado;
- tratar transição `pendente → pago` para tipos diferentes de recebíveis (não cria `settlementEntry`).
**Cascata:** edição silenciosa de uma fatura paga descontabiliza o caixa; histórico não consegue reconstruir o motivo da diferença.
**Severidade:** Alta — viola integridade auditável.
**Correção sugerida:**
1. Bloquear edição de `amount` quando `accountingEntryId IS NOT NULL` (forçar fluxo estorno + nova emissão).
2. Para mudanças permitidas (descrição/categoria/dueDate/paymentMethod), apenas `logAudit` antes/depois; nunca tocar em `paymentDate`/`status` por aqui — usar o handler `/status`.
3. Se a edição `pendente → pago` chegar via `/status`, ele já trata. Não duplicar caminhos.

### 🔴 B3 — `PATCH /records/:id/status` para `pago` não promove créditos prepago nem trata cascata avulso
**Arquivo:** `financial-records.routes.ts:268-300`
**Sintoma:** quando uma `faturaPlano` é marcada paga manualmente por este endpoint, a função `promotePrepaidCreditsForFinancialRecord` (chamada apenas em `/payment`) não é executada → o pool `pendentePagamento` não é promovido para `disponivel`. Idem para `faturaMensalAvulso`: o cascata para os filhos roda só em `/payment`.
**Cascata:** plano com pagamento registrado por aqui fica com créditos travados em `pendentePagamento`, sessões filhas continuam `pendente`, paciente recebe alerta de inadimplência.
**Severidade:** Alta.
**Correção sugerida:** extrair a lógica de cascata + promoção para um helper compartilhado e chamá-lo em ambos os endpoints quando a transição final for para `pago`.

### 🔴 B4 — Vazamento multi-tenant em `/payment` (super-admin)
**Arquivo:** `financial/payments/financial-payments.routes.ts:142-150`
**Sintoma:** `pendingRecords` é selecionado **sem** `clinicCond(req)`. Para usuário comum, o filtro por `patientId` + `assertPatientInClinic` salva, mas:
- super-admin atendendo requisição cross-tenant pega pendências de outras clínicas do mesmo paciente (cenário raro, mas possível em pacientes compartilhados em ambientes de teste);
- o `paymentRecord` é criado com `clinicId = req.clinicId` (do super-admin, que pode ser nulo) → mistura clinicas no journal.
**Severidade:** Média-Alta.
**Correção sugerida:** filtrar `pendingRecords` por `clinicId = paymentRecord.clinicId ?? pending.clinicId`; quando super-admin sem `clinicId`, exigir cabeçalho de clínica explícito.

### 🔴 B5 — `vendaPacote` no loop de alocação cai em `postReceivableSettlement` sem recebível
**Arquivo:** `financial-payments.routes.ts:264, 285-297`
**Sintoma:** `vendaPacote` está incluído em `pendingRecords` (linha 148). O guard `pending.transactionType !== "vendaPacote"` (linha 264) **só** evita `postReceivableRevenue`. O fluxo segue para `postReceivableSettlement` (D Caixa / C Recebíveis). Como `vendaPacote` nunca foi reconhecido como recebível (é Adiantamento), o crédito em 1.1.2 fica negativo.
**Cascata:** balancete com Recebíveis < 0 (impossível); DRE ok porque não há receita postada; carteira do cliente não é creditada.
**Severidade:** Crítica — quebra a equação contábil semântica.
**Correção sugerida:** quando `pending.transactionType === "vendaPacote"`, usar `postCashAdvance` (D Caixa / C Adiantamentos) e, na sequência, marcar o registro pago + creditar a carteira do paciente (criar transação `patient_wallet_transactions` `credito`). Essencialmente espelhar o fluxo do `recordPackagePayment` que existe em `wallet/packages.service`.

### 🟠 B6 — Idempotência mensal de `runBilling` por `createdAt`
**Arquivo:** `financial/billing/billing.service.ts:124-135` e re-check `:167-183`
**Sintoma:** a verificação “já cobrei este pacote no mês” usa `created_at >= monthStart AND < monthEnd+1d`. Em rodadas no fim do dia 30/31 com fuso BRT vs servidor UTC, registros gerados perto da virada podem cair fora da janela do mês de competência → duplicação na rodada do mês seguinte. O modelo já tem `planMonthRef` em `faturaPlano`; falta usar coluna equivalente para `creditoAReceber` mensal.
**Severidade:** Média.
**Correção sugerida:** persistir `planMonthRef` (ou `billingMonthRef`) também em `creditoAReceber` originado por `runBilling` e usá-lo como chave de idempotência. Manter `createdAt` apenas como dado informativo.

### 🟠 B7 — Log de `runBilling` fora da transação dos inserts
**Arquivo:** `billing.service.ts:259-273`
**Sintoma:** `billingRunLogsTable` é inserido após o `for` em conexão separada e dentro de `try/catch` que apenas loga. Se o serviço cair entre a última cobrança e o insert do log, perdemos rastreabilidade de execução.
**Severidade:** Baixa.
**Correção sugerida:** mover o log para o início (`status='running'`) e atualizar no fim (`status='ok|failed'`). Usar `ON CONFLICT (id)`/`uuid` para idempotência.

### 🟠 B8 — `postCashReceipt` para `remaining > 0` cria receita “fantasma”
**Arquivo:** `financial-payments.routes.ts:329-342`
**Sintoma:** se o pagamento excede o total de pendências, o resíduo entra como receita direta (D 1.1.1 / C 4.1.x?) sem origem documental, sem `financial_record` próprio (apenas `paymentRecord`) e sem aviso ao operador. Fica indistinguível de uma “venda à vista” no DRE.
**Severidade:** Média — degrada a auditabilidade.
**Correção sugerida:** em vez de receita direta, creditar a carteira do paciente (D 1.1.1 / C 2.1.1) e devolver no response um aviso `walletCredited: <valor>`. Receita só deve nascer com origem clara (sessão, plano, venda).

### 🟠 B9 — `accountingEntryId` do `paymentRecord` mistura semântica
**Arquivo:** `financial-payments.routes.ts:344-347`
**Sintoma:** após o loop, o `paymentRecord` é atualizado com `accountingEntryId = primaryEntryId`, que pode ser:
- `advanceEntry.id` (uma faturaPlano prepago);
- `settlementEntry.id` (faturaMensalAvulso);
- `paymentEntry.id` (recebível comum);
- `directEntry.id` (postCashReceipt fantasma).
Quando há múltiplas pendências, só a primeira fica vinculada. O estorno desse `paymentRecord` reverteria apenas um dos lançamentos.
**Severidade:** Média.
**Correção sugerida:** criar tabela `payment_allocations(payment_record_id, accounting_entry_id, amount)` (estilo Sub-Ledger). O `paymentRecord` referencia o conjunto, não um único entry. Estorno itera as alocações.

### 🟠 B10 — `recognizeMonthlyInvoiceRevenue` idempotência por sentinel apenas no app
**Arquivo:** `treatment-plans.revenue-recognition.ts:62-64`
**Sintoma:** a checagem `if (invoice.recognizedEntryId)` evita reentrância só dentro de um único processo. Sob duas confirmações simultâneas da mesma fatura (race entre dois usuários), nada na DB impede dupla postagem (não há advisory lock nem unique constraint em `recognizedEntryId`).
**Severidade:** Baixa-Média (depende de carga concorrente).
**Correção sugerida:** envolver em `withPackageBillingLock(invoice.id, year, month, …)` ou criar índice `UNIQUE(financial_records.id) WHERE recognizedEntryId IS NOT NULL` via constraint de integridade ao reconhecer (UPDATE…SET recognizedEntryId = … WHERE recognizedEntryId IS NULL RETURNING; abortar se RETURNING vazio).

### 🟡 B11 — `closeAvulsoMonth` não posta receita do mãe nem valida procedure mismatch
**Arquivo:** `treatment-plans.close-month.ts:182-208`
**Análise:** correto que a fatura mãe não posta receita (filhos já reconheceram). Porém:
- `category: candidates[0].category` assume todos os filhos da mesma categoria (plano com >1 procedimento avulso = categoria errada na mãe).
- Não persiste `procedureId`: o DRE-by-procedure não enxerga o pagamento da mãe.
- `dueDay = 10` quando `clinic.defaultDueDays` foi consultado mas **descartado** (linhas 165-172).
**Severidade:** Baixa-Média.
**Correção sugerida:**
1. Usar `category: 'Fatura mensal'` ou agregada.
2. Manter o pagamento da mãe ligado aos filhos via `payment_allocations` (ver B9) — DRE-by-procedure soma já corretamente do filho.
3. Honrar `clinic.defaultDueDays` quando `avulsoBillingDay` for nulo (a leitura está lá, mas o valor é descartado pelo `dueDay = 10`).

### 🟡 B12 — `applyBillingRules` plano materializado: rollback ausente
**Arquivo:** `appointments.billing.ts:160-297`
**Sintoma:** quando `treatmentPlanProcedureId` está preenchido e o status volta de `compareceu/concluido` para `agendado`, **não** há reversão do `recognizeMonthlyInvoiceRevenue`. A receita do mês fica reconhecida mesmo após desfazer todas as confirmações do mês.
**Severidade:** Baixa-Média (caso operacional raro mas factível: erro de marcação).
**Correção sugerida:** ao detectar `oldStatus ∈ confirmed` & `newStatus ∉ confirmed`, verificar se há outro appointment do mesmo `monthlyInvoiceId` ainda confirmado no mês; se não, postar `postReversal(invoice.recognizedEntryId)` e zerar a sentinel.

### 🟡 B13 — `applyBillingRules` por sessão: `tx` quebrado em `closeAvulso parent`
**Arquivo:** `appointments.billing.ts:658-712`
**Análise:** o lookup do `parentInvoice` ordena por `id ASC` (correto) mas roda **fora** da advisory lock — duas sessões confirmadas concorrentemente para o mesmo plano/mês podem escolher `parentRecordId` antes da consolidação `closeAvulsoMonth` rodar. Não causa duplicidade contábil, mas força um posterior `update` para mover o filho órfão. Aceitável; documentar.
**Severidade:** Informativo.

### 🟡 B14 — `applyBillingRules` carteira: race em decremento de saldo
**Arquivo:** `appointments.billing.ts:558-623`
**Sintoma:** `SELECT wallet … WHERE patient+clinic` seguido de `UPDATE wallet SET balance` em transação Drizzle — sem `SELECT … FOR UPDATE` nem advisory lock por `wallet.id`. Dois confirms simultâneos podem ler o mesmo saldo e debitar em dobro.
**Severidade:** Média (em produção com carteira ativa).
**Correção sugerida:** `SELECT … FOR UPDATE` na carteira ou advisory lock por `wallet.id`.

### 🟢 B15 — `revenueSummarySql` exclui `vendaPacote` do DRE — correto, mas ausente em `paymentRecord`
**Análise:** o helper já exclui `vendaPacote`, `depositoCarteira`, etc. Porém o `paymentRecord` (`transactionType='pagamento'`) ESTÁ no filtro de exclusão — bom. Mas se `postCashReceipt` for chamado (B8) o crédito vai direto para Receita Serviço (4.1.1) **com** `transactionType='pagamento'` no `financial_record` mas o lançamento contábil credita receita real. Resultado: DRE-by-procedure puxa esse crédito, sumarizador por `financial_records` não. **Inconsistência entre as duas fontes**.
**Severidade:** Média.
**Correção sugerida:** quando o postCashReceipt acontecer (cenário B8), usar conta `2.1.1` (Adiantamentos) em vez de `4.1.1`.

---

## 3. Riscos contábeis sistêmicos

1. **Duas fontes de verdade**: `financial_records` (operacional) e `accounting_journal_lines` (contábil). Hoje só os endpoints “felizes” mantêm sincronia. Recomenda-se um **job de conciliação** noturno que compare:
   - Soma de receita por mês via `revenueSummarySql` × soma de créditos em contas `revenue` no journal.
   - Saldo de Recebíveis via `financial_records.status='pendente'` × saldo D-C de `1.1.2` no journal.
   - Diferenças > R$ 0,01 → `discrepancy_log` para revisão.

2. **Falta de `payment_allocations`**: dificulta estorno parcial e relatórios de “composição do recebimento”. É a evolução natural para fechar B5/B8/B9.

3. **Edição direta sem trilha** (B2 + B1): qualquer auditor externo (CFC/CRC) reprovaria. O sistema deve **proibir UPDATE em campos contabilmente relevantes** uma vez que o registro tem `accountingEntryId`. Edições passam por estorno + emissão.

4. **Idempotência fraca no billing job** (B6 + B10): use `planMonthRef` como chave universal. Adicione `UNIQUE INDEX (patient_package_id, plan_month_ref) WHERE transaction_type IN ('creditoAReceber','faturaPlano')`.

5. **Ausência de estorno em cascata**: estornar a fatura mãe (`faturaMensalAvulso` ou `faturaPlano`) hoje não estorna automaticamente os filhos materializados nem as sessões reconhecidas. Há cascata de pagamento; falta cascata de estorno.

---

## 4. Governança & observabilidade

| Item | Status atual | Recomendação |
|---|---|---|
| Audit log | OK em CRUD principais via `logAudit` | Estender para `applyBillingRules`, `recognizeMonthlyInvoiceRevenue`, `closeAvulsoMonth`. |
| Trilha de estorno | OK em `/estorno` (reversedBy, reversalReason, reversedAt, originalAmount) | Replicar a mesma trilha em `DELETE /records/:id` (B1). |
| Permissões | `requirePermission("financial.write")` em mutações | Adicionar permissão granular `financial.reverse` para estornos (separar de write). |
| Logs operacionais | `console.log` em billing | Padronizar com logger estruturado (já existe `pino`?) e correlação por `runId`. |
| Métricas | Ausentes | Expor counters (Prometheus): `billing_runs_total`, `revenue_recognized_total`, `reversals_total{reason}`. |
| Dashboards | DRE-by-procedure existe | Adicionar painel “Conciliação operacional × contábil” + “Top divergências do dia”. |

---

## 5. Otimizações (sem mudança contratual)

1. **Índices ausentes prováveis** (validar `db/schema/*` e `db/migrations/*`):
   - `financial_records (clinic_id, status, due_date)` — usado em listagens de inadimplência;
   - `financial_records (patient_id, transaction_type, status)` — loops de alocação em `/payment`;
   - `accounting_journal_lines (account_id, entry_id)` — agregações de saldo;
   - `accounting_journal_entries (clinic_id, entry_date)` — relatórios por período.

2. **N+1 em `/payment`**: `postReceivableRevenue → postReceivableSettlement → allocateReceivable` faz 3 inserts por pendência. Pode virar batch usando `INSERT … VALUES (...), (...) RETURNING`.

3. **`getAccountingBalances` em `/summary`**: chamado a cada hit do paciente. Considerar cache memoizado por (clinicId, patientId) com invalidação no evento de novo `journal_entry`.

4. **`runBilling` lê todos pacotes ativos**: para clínicas grandes, paginar em chunks de 200 com `LIMIT/OFFSET` ou cursor por `id`.

5. **`closeAvulsoMonth`**: hoje faz `UPDATE … WHERE id = ANY(childIds)` em uma única query (bom). Pode adicionar `RETURNING id, amount` para validar soma vs `total` (defesa em profundidade).

6. **`recognizeMonthlyInvoiceRevenue`**: a busca de `accountingAccountId` pode ser precomputada na materialização do plano e armazenada em `financial_records.revenueAccountCode`, evitando JOIN com `procedures` em toda confirmação.

---

## 6. Plano de correções proposto (priorizado)

### Sprint financeiro 6 — Integridade contábil (1-2 semanas)
- **PR-FIN6-1**: B1 + B2 — bloquear edição/delete sem estorno.
  - `DELETE /records/:id` (receita) → reusa lógica de `/estorno` (exige motivo).
  - `PATCH /records/:id` rejeita `amount`/`type` quando `accountingEntryId IS NOT NULL`.
- **PR-FIN6-2**: B3 — promoção de prepago + cascade compartilhada entre `/payment` e `/status`.
- **PR-FIN6-3**: B5 — `vendaPacote` em `/payment` deve usar `postCashAdvance` + creditar carteira; cobrir com teste.
- **PR-FIN6-4**: B4 — sanitizar filtro multi-tenant em `pendingRecords`.

### Sprint financeiro 7 — Auditabilidade & idempotência (1 semana)
- **PR-FIN7-1**: B8 + B15 — direcionar `remaining > 0` para Adiantamentos (carteira), nunca receita direta.
- **PR-FIN7-2**: B6 + B10 — `planMonthRef`/`billingMonthRef` como chave de idempotência mensal + advisory lock em `recognizeMonthlyInvoiceRevenue`.
- **PR-FIN7-3**: B7 — log de `runBilling` em duas fases (running/ok-failed).
- **PR-FIN7-4**: B12 — rollback de receita reconhecida quando todas as sessões do mês saem do estado confirmado.

### Sprint financeiro 8 — Sub-ledger & conciliação (2 semanas)
- **PR-FIN8-1**: tabela `payment_allocations` + refator de `/payment` para alocação explícita (B9).
- **PR-FIN8-2**: cascata de estorno (mãe `faturaMensalAvulso`/`faturaPlano` → filhos).
- **PR-FIN8-3**: job noturno de conciliação operacional × contábil + endpoint `GET /reports/reconciliation/:date`.
- **PR-FIN8-4**: B14 — `SELECT … FOR UPDATE` na carteira; B11 — corrigir `closeAvulsoMonth` (categoria, dueDay, procedureId).

---

## 7. Testes recomendados (a adicionar à suíte vitest atual: 336 ✓)

| Caso | Arquivo de teste sugerido |
|---|---|
| Estorno via DELETE posta `postReversal` | `financial-records.delete.reversal.test.ts` |
| Edição de `amount` em registro contabilizado é rejeitada (409) | `financial-records.patch.guard.test.ts` |
| `/status: pago` em `faturaPlano` promove créditos prepago | `financial-records.status.cascade.test.ts` |
| `/payment` em `vendaPacote` credita carteira (não Recebíveis) | `financial-payments.vendaPacote.test.ts` |
| `runBilling` idempotente entre fim/início de mês usando `planMonthRef` | `billing.idempotency.test.ts` |
| Confirmação concorrente da 1ª sessão do mês não duplica receita | `revenue-recognition.race.test.ts` |
| Conciliação: soma `revenueSummarySql` = soma `4.1.x` no journal | `reconciliation.test.ts` |

---

## 8. Conclusão executiva

O fluxo financeiro do FisioGest Pro evoluiu para um modelo bem estruturado por evento (sessão → reconhecimento de receita), com sub-contas contábeis por procedimento e idempotência via `planMonthRef`. Porém, **três caminhos de exceção quebram a integridade contábil** (B1, B2, B5) e dois quebram a integridade operacional (B3, B4) — todos exploráveis em uso normal, não em corner cases raros.

O caminho **feliz** está consistente; o caminho de **edição/estorno/exceção** precisa ser fechado antes de qualquer onboarding de cliente que exija auditoria contábil formal (escritório contador externo, e-Social, fiscalização).

Após Sprint 6 + 7 acima, o sistema atinge nível “auditável”. Sprint 8 fecha o ciclo de excelência (sub-ledger e conciliação automatizada).
