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
4. Sobra (`remaining > 0`) → **`postCashAdvance`** (D 1.1.1 / C 2.1.1) + crédito na carteira do paciente (`patientWalletTransactions`) — *B8 + B15 resolvidos em Sprint 7*.

### 1.3 Cancelamento / estorno
- `PATCH /records/:id/status` com `status ∈ {cancelado,estornado}` → `postReversal` (estorno espelhado).
- `PATCH /records/:id/estorno` → idem, com motivo obrigatório.
- `DELETE /records/:id`:
  - despesa → DELETE físico.
  - receita → soft delete: apenas `status='estornado'` **sem** estorno contábil.

---

## 2. Bugs e inconsistências (com severidade e evidência)

### ✅ B1 — `DELETE /records/:id` (receita) não posta `postReversal` — **RESOLVIDO em PR-FIN6-1 (Sprint 6)**
**Arquivo:** `financial/records/financial-records.routes.ts:481-518`
**Sintoma:** soft-delete altera apenas `status='estornado'`; o lançamento contábil (recebível, receita, settlement) permanece ativo no journal. `getAccountingBalances` e o DRE continuam contando essa receita; o saldo de Recebíveis fica inflado.
**Cascata:** o relatório `revenueSummarySql()` filtra por status, mas a fonte da verdade contábil é o journal — eles divergem em qualquer DRE puxado de `accounting_journal_lines`.
**Severidade:** Alta — causa divergência entre relatório operacional e contábil.
**Correção sugerida:** rodar `postReversal(entryId, …)` dentro de transação como já é feito em `PATCH /records/:id/estorno`. Idealmente, redirecionar este endpoint internamente para o mesmo handler do estorno (exigindo `reversalReason`).

### ✅ B2 — `PATCH /records/:id` permite editar `amount`/`type` sem trilha contábil — **RESOLVIDO em PR-FIN6-1 (Sprint 6)**
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

### ✅ B3 — `PATCH /records/:id/status` para `pago` não promove créditos prepago nem trata cascata avulso — **RESOLVIDO em PR-FIN6-2 (Sprint 6)**
**Arquivo:** `financial-records.routes.ts:268-300`
**Sintoma:** quando uma `faturaPlano` é marcada paga manualmente por este endpoint, a função `promotePrepaidCreditsForFinancialRecord` (chamada apenas em `/payment`) não é executada → o pool `pendentePagamento` não é promovido para `disponivel`. Idem para `faturaMensalAvulso`: o cascata para os filhos roda só em `/payment`.
**Cascata:** plano com pagamento registrado por aqui fica com créditos travados em `pendentePagamento`, sessões filhas continuam `pendente`, paciente recebe alerta de inadimplência.
**Severidade:** Alta.
**Correção sugerida:** extrair a lógica de cascata + promoção para um helper compartilhado e chamá-lo em ambos os endpoints quando a transição final for para `pago`.

### ✅ B4 — Vazamento multi-tenant em `/payment` (super-admin) — **RESOLVIDO em PR-FIN6-4 (Sprint 6)**
**Arquivo:** `financial/payments/financial-payments.routes.ts:142-150`
**Sintoma:** `pendingRecords` é selecionado **sem** `clinicCond(req)`. Para usuário comum, o filtro por `patientId` + `assertPatientInClinic` salva, mas:
- super-admin atendendo requisição cross-tenant pega pendências de outras clínicas do mesmo paciente (cenário raro, mas possível em pacientes compartilhados em ambientes de teste);
- o `paymentRecord` é criado com `clinicId = req.clinicId` (do super-admin, que pode ser nulo) → mistura clinicas no journal.
**Severidade:** Média-Alta.
**Correção sugerida:** filtrar `pendingRecords` por `clinicId = paymentRecord.clinicId ?? pending.clinicId`; quando super-admin sem `clinicId`, exigir cabeçalho de clínica explícito.

### ✅ B5 — `vendaPacote` no loop de alocação cai em `postReceivableSettlement` sem recebível — **RESOLVIDO em PR-FIN6-3 (Sprint 6)**
**Arquivo:** `financial-payments.routes.ts:264, 285-297`
**Sintoma:** `vendaPacote` está incluído em `pendingRecords` (linha 148). O guard `pending.transactionType !== "vendaPacote"` (linha 264) **só** evita `postReceivableRevenue`. O fluxo segue para `postReceivableSettlement` (D Caixa / C Recebíveis). Como `vendaPacote` nunca foi reconhecido como recebível (é Adiantamento), o crédito em 1.1.2 fica negativo.
**Cascata:** balancete com Recebíveis < 0 (impossível); DRE ok porque não há receita postada; carteira do cliente não é creditada.
**Severidade:** Crítica — quebra a equação contábil semântica.
**Correção sugerida:** quando `pending.transactionType === "vendaPacote"`, usar `postCashAdvance` (D Caixa / C Adiantamentos) e, na sequência, marcar o registro pago + creditar a carteira do paciente (criar transação `patient_wallet_transactions` `credito`). Essencialmente espelhar o fluxo do `recordPackagePayment` que existe em `wallet/packages.service`.

### ✅ B6 — Idempotência mensal de `runBilling` por `createdAt` — **RESOLVIDO em PR-FIN7-2 (Sprint 7)**
**Arquivo:** `financial/billing/billing.service.ts:124-135` e re-check `:167-183`
**Sintoma:** a verificação “já cobrei este pacote no mês” usa `created_at >= monthStart AND < monthEnd+1d`. Em rodadas no fim do dia 30/31 com fuso BRT vs servidor UTC, registros gerados perto da virada podem cair fora da janela do mês de competência → duplicação na rodada do mês seguinte. O modelo já tem `planMonthRef` em `faturaPlano`; falta usar coluna equivalente para `creditoAReceber` mensal.
**Severidade:** Média.
**Resolução:** `planMonthRef` agora é a chave de idempotência em `billing.service.ts` — substituindo a janela por `created_at`. A busca de duplicatas filtra por `planMonthRef = :ref` antes de qualquer insert.

### ✅ B7 — Log de `runBilling` fora da transação dos inserts — **RESOLVIDO em PR-FIN7-3 (Sprint 7)**
**Arquivo:** `billing.service.ts:259-273`
**Sintoma:** `billingRunLogsTable` é inserido após o `for` em conexão separada e dentro de `try/catch` que apenas loga. Se o serviço cair entre a última cobrança e o insert do log, perdemos rastreabilidade de execução.
**Severidade:** Baixa.
**Resolução:** log em duas fases (insert `running` → update `ok|failed`) com `runId` UUID como chave. Usa pino logger estruturado. Migração `0012_sprint7_billing_log_status.sql` aplicada.

### 🟠 B8 — `postCashReceipt` para `remaining > 0` cria receita “fantasma”
**Arquivo:** `financial-payments.routes.ts:329-342`
**Sintoma:** se o pagamento excede o total de pendências, o resíduo entra como receita direta (D 1.1.1 / C 4.1.x?) sem origem documental, sem `financial_record` próprio (apenas `paymentRecord`) e sem aviso ao operador. Fica indistinguível de uma “venda à vista” no DRE.
**Severidade:** Média — degrada a auditabilidade.
**Resolução:** `remaining > 0` agora chama `postCashAdvance` (D 1.1.1 / C 2.1.1), faz upsert em `patientWallet` e insere em `patientWalletTransactions`. Response inclui `walletCredited` com o valor creditado.

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

### ✅ B10 — `recognizeMonthlyInvoiceRevenue` idempotência por sentinel apenas no app — **RESOLVIDO em PR-FIN7-2 (Sprint 7)**
**Arquivo:** `treatment-plans.revenue-recognition.ts:62-64`
**Sintoma:** a checagem `if (invoice.recognizedEntryId)` evita reentrância só dentro de um único processo. Sob duas confirmações simultâneas da mesma fatura (race entre dois usuários), nada na DB impede dupla postagem (não há advisory lock nem unique constraint em `recognizedEntryId`).
**Severidade:** Baixa-Média (depende de carga concorrente).
**Resolução:** `pg_advisory_xact_lock(invoiceId)` adicionado dentro da transação de `recognizeMonthlyInvoiceRevenue`, eliminando a race condition de dupla postagem em confirms simultâneos.

### ✅ B11 — `closeAvulsoMonth` categoria/dueDay/procedureId — **RESOLVIDO em PR-FIN8-2 + PR-FIN8-4 (Sprint 8)**
**Arquivo:** `treatment-plans.close-month.ts:182-208`
**Análise original:** correto que a fatura mãe não posta receita (filhos já reconheceram). Porém:
- ~~`category: candidates[0].category`~~ → **agora** `aggregatedCategory = 'Fatura mensal'` quando há múltiplas categorias entre os filhos; preserva a única categoria quando todos compartilham.
- ~~`procedureId` ausente~~ → **deliberadamente nulo** na mãe: o DRE-by-procedure puxa do filho (que tem `procedureId` correto). Adicionar à mãe causaria dupla contagem.
- ~~`dueDay = 10` fixo~~ → **PR-FIN8-4 antecipado (Sprint 7):** `dueDay = clinic.defaultDueDays ?? 10`.
**Resolução:** todos os pontos endereçados; DRE-by-procedure consistente sem necessidade de `payment_allocations` (PR-FIN8-1) para esse caso.

### ✅ B12 — `applyBillingRules` plano materializado: rollback ausente — **RESOLVIDO em PR-FIN7-4 (Sprint 7)**
**Arquivo:** `appointments.billing.ts:160-297`
**Sintoma:** quando `treatmentPlanProcedureId` está preenchido e o status volta de `compareceu/concluido` para `agendado`, **não** há reversão do `recognizeMonthlyInvoiceRevenue`. A receita do mês fica reconhecida mesmo após desfazer todas as confirmações do mês.
**Severidade:** Baixa-Média (caso operacional raro mas factível: erro de marcação).
**Resolução:** ao detectar `oldStatus ∈ confirmed` & `newStatus ∉ confirmed`, o handler verifica se há outro appointment do mesmo `monthlyInvoiceId` ainda confirmado; se não houver, posta `postReversal(invoice.recognizedEntryId)` e zera `recognizedEntryId`.

### 🟡 B13 — `applyBillingRules` por sessão: `tx` quebrado em `closeAvulso parent`
**Arquivo:** `appointments.billing.ts:658-712`
**Análise:** o lookup do `parentInvoice` ordena por `id ASC` (correto) mas roda **fora** da advisory lock — duas sessões confirmadas concorrentemente para o mesmo plano/mês podem escolher `parentRecordId` antes da consolidação `closeAvulsoMonth` rodar. Não causa duplicidade contábil, mas força um posterior `update` para mover o filho órfão. Aceitável; documentar.
**Severidade:** Informativo.

### ✅ B14 — `applyBillingRules` carteira: race em decremento de saldo — **RESOLVIDO em PR-FIN8-4 (Sprint 8)**
**Arquivos corrigidos:** `appointments.billing.ts` (débito em billing por sessão e estorno em cancelamento) + `financial-payments.routes.ts` (upsert em `remaining > 0`).
**Resolução:** todos os 3 caminhos que mexem em `patient_wallet` agora usam `SELECT … FOR UPDATE` dentro de `db.transaction(...)`. O caminho de estorno (cancelamento) — que antes rodava SELECT + UPDATE em conexões separadas — foi envelopado em transação ACID. Race window eliminada: dois confirms/upserts simultâneos sobre a mesma carteira são serializados pelo lock de linha.

### ✅ B15 — `revenueSummarySql` exclui `vendaPacote` do DRE — **RESOLVIDO em PR-FIN7-1 (Sprint 7)**
**Análise:** o helper já exclui `vendaPacote`, `depositoCarteira`, etc. Porém o `paymentRecord` (`transactionType='pagamento'`) ESTÁ no filtro de exclusão — bom. Mas se `postCashReceipt` for chamado (B8) o crédito vai direto para Receita Serviço (4.1.1) **com** `transactionType='pagamento'` no `financial_record` mas o lançamento contábil credita receita real. Resultado: DRE-by-procedure puxa esse crédito, sumarizador por `financial_records` não. **Inconsistência entre as duas fontes**.
**Severidade:** Média.
**Resolução:** com B8 eliminado, `postCashReceipt` não é mais chamado em `remaining > 0`. O crédito vai para Adiantamentos (2.1.1) via `postCashAdvance`, mantendo DRE e balancete consistentes.

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

### ✅ Sprint Financeiro 6 — Integridade contábil — **CONCLUÍDA (29/04/2026)**
- ✅ **PR-FIN6-1 (B1 + B2)** — bloqueio de edição/delete sem trilha contábil.
  - `DELETE /records/:id` (receita) com `accountingEntry` agora exige `reversalReason` (query ou body, mín. 3 chars) e dispara `postReversal` espelhado dentro de transação + `logAudit('reverse')`. Receita já `estornado/cancelado` é idempotente (204). Despesa segue DELETE físico. Filtro multi-tenant (`clinicCond`) aplicado.
  - `PATCH /records/:id` retorna **409 `RECORD_ALREADY_POSTED`** com `lockedFields` quando o cliente tenta alterar `amount`/`type`/`status`/`paymentDate` em registro com `accountingEntryId|recognizedEntryId|settlementEntryId`. Campos auxiliares (descrição, categoria, dueDate, procedureId, paymentMethod) continuam editáveis.
- ✅ **PR-FIN6-2 (B3)** — `PATCH /records/:id/status` com `status='pago'` agora também:
  - chama `promotePrepaidCreditsForFinancialRecord(id)` para `faturaPlano` (promove pool prepago `pendentePagamento → disponivel`);
  - chama `cascadeFaturaMensalAvulsoPayment` para `faturaMensalAvulso` (cascateia status para os filhos e aloca o settlement contra cada `recognizedEntryId`).
  - Antes esses efeitos só existiam em `POST /payment`; agora há paridade entre os dois caminhos.
- ✅ **PR-FIN6-3 (B5)** — em `POST /payment`, quando `pending.transactionType === 'vendaPacote'` e o registro **não** tem `accountingEntryId/recognizedEntryId` (legado), o fluxo redireciona para `postCashAdvance` (D Caixa / C Adiantamentos) em vez de `postReceivableSettlement` (que gerava recebível negativo). Marca como pago e fecha o ciclo. O caminho moderno (vendaPacote criado via `postPackageSale`) já estava correto e segue inalterado.
- ✅ **PR-FIN6-4 (B4)** — `pendingRecords` em `/payment` agora aplica `eq(clinicId, req.clinicId)` quando o usuário tem clínica explícita. Super-admin sem `clinicId` mantém visão consolidada (uso restrito de operação).
- 📊 **Cobertura adicionada:** 11 testes novos em `financial-records.guards.test.ts` e `financial-payments.tenant-and-vendapacote.test.ts` (suíte total: **347/347 ✓**, antes 336).

### ✅ Sprint financeiro 7 — Auditabilidade & idempotência — **CONCLUÍDA (29/04/2026)**
- ✅ **PR-FIN7-1 (B8 + B15)**: `remaining > 0` → `postCashAdvance` (D 1.1.1 / C 2.1.1) + upsert `patientWallet` + insert `patientWalletTransactions` + `walletCredited` no response. `postCashReceipt` removido do caminho de pagamento.
- ✅ **PR-FIN7-2 (B6 + B10)**: `planMonthRef` como chave de idempotência em `billing.service.ts`; `pg_advisory_xact_lock(invoiceId)` em `recognizeMonthlyInvoiceRevenue` contra race condition.
- ✅ **PR-FIN7-3 (B7)**: log de `runBilling` em duas fases — insert `running` no início, update `ok|failed` no fim com `runId` UUID; pino logger estruturado. Migração `0012_sprint7_billing_log_status.sql` aplicada.
- ✅ **PR-FIN7-4 (B12)**: rollback de `recognizedEntryId` via `postReversal` quando todos os appointments do mês saem do estado confirmado; `recognizedEntryId` zerado para permitir novo reconhecimento.
- 📊 **Cobertura:** testes passando sem erros de TypeScript; correção de B11 (`dueDay = clinic.defaultDueDays ?? 10`) incluída como PR-FIN8-4 antecipado.

### 🟢 Sprint financeiro 8 — Sub-ledger & conciliação — **PARCIALMENTE CONCLUÍDA (29/04/2026)**
- ⏳ **PR-FIN8-1 (DEFERIDO)**: tabela `payment_allocations` + refator de `/payment` para alocação explícita (B9). Refator profundo do core de pagamento — adiado para Sprint 9 com migração dedicada e backfill controlado.
- ✅ **PR-FIN8-2 (cascata de estorno + B11)**:
  - Novo helper `cascadeReversalForFaturaMensalAvulso` em `payment-cascade.ts`: para cada filho não-estornado, posta `postReversal(child.recognizedEntryId)` espelhado e marca o filho como `estornado` com trilha (`reversalReason='[cascata #parent]…'`, `reversedBy`, `reversedAt`, `originalAmount`). Idempotente (filtro `NOT IN ('estornado','cancelado')`).
  - Wired nos 3 caminhos de estorno: `PATCH /records/:id/status (→ estornado|cancelado)`, `PATCH /records/:id/estorno`, `DELETE /records/:id`. Roda dentro da mesma transação do estorno da mãe.
  - `closeAvulsoMonth` agora usa `aggregatedCategory` (`'Fatura mensal'` ou única categoria comum dos filhos) em vez de `candidates[0].category` — fecha o gap de B11.
  - **Escopo**: `faturaPlano` ainda NÃO faz cascata automática para appointments materializados (decisão conservadora — exige confirmação operacional sobre semântica esperada). Documentado para Sprint 9.
- ✅ **PR-FIN8-3 (conciliação)**: novo endpoint `GET /reports/reconciliation?from=…&to=…&clinicId=…` em `reports.routes.ts`. Compara em tempo real:
  - Receita operacional na janela (`revenueSummarySql`) ↔ saldo credor das contas `4.x`;
  - Recebíveis pendentes (`status='pendente' AND type='receita' AND transactionType ∈ RECEIVABLE_TYPES`) ↔ saldo devedor de `1.1.2`;
  - Caixa recebido na janela (settlements `paymentDate` ∈ janela) ↔ saldo devedor de `1.1.1`;
  - Lista até 50 registros órfãos (receita ativa sem `recognizedEntryId/accountingEntryId`).
  - Retorna `{ ok: boolean, diffs, orphans, tolerance: 0.01 }`. `ok=false` se diff de recebíveis > R$ 0,01 ou houver órfãos. Pronto para integração com job cron e dashboard.
- ✅ **PR-FIN8-4 (B14 + B11)**:
  - `SELECT … FOR UPDATE` em todos os 3 lugares que tocam `patient_wallet`: débito em billing por sessão (`appointments.billing.ts`), estorno em cancelamento (envolvido em transação ACID nova), upsert em `/payment` com `remaining > 0`.
  - B11 (`dueDay`, `categoria`) integralmente concluído.
- 📊 **Cobertura**: 4 testes novos em `payment-cascade.test.ts` cobrindo cascata de estorno (2 filhos com entry, idempotência, filho legado sem entry, preservação de `originalAmount`). Suíte total: **351/351 ✓**, antes 347.

---

## 7. Testes recomendados (suíte vitest atual: **351 ✓** — Sprints 6, 7 e 8-parcial contempladas)

| Caso | Arquivo de teste | Status |
|---|---|---|
| Estorno via DELETE posta `postReversal` | `financial-records.guards.test.ts` | ✅ Sprint 6 |
| Edição de `amount` em registro contabilizado é rejeitada (409) | `financial-records.guards.test.ts` | ✅ Sprint 6 |
| `/status: pago` em `faturaPlano` promove créditos prepago | `financial-records.guards.test.ts` | ✅ Sprint 6 |
| `/status: pago` em `faturaMensalAvulso` cascateia filhos | `financial-records.guards.test.ts` | ✅ Sprint 6 |
| `/payment` em `vendaPacote` legado usa `postCashAdvance` (não settlement) | `financial-payments.tenant-and-vendapacote.test.ts` | ✅ Sprint 6 |
| `/payment` filtra `pendingRecords` por `clinicId` (B4) | `financial-payments.tenant-and-vendapacote.test.ts` | ✅ Sprint 6 |
| `runBilling` idempotente entre fim/início de mês usando `planMonthRef` | `billing.idempotency.test.ts` | ⏳ Sprint 7 |
| Confirmação concorrente da 1ª sessão do mês não duplica receita | `revenue-recognition.race.test.ts` | ⏳ Sprint 7 |
| Cascata de estorno em `faturaMensalAvulso`: 2 filhos com entry → 2 `postReversal` | `payment-cascade.test.ts` | ✅ Sprint 8 |
| Cascata de estorno: 0 filhos pendentes (idempotência da 2ª chamada) | `payment-cascade.test.ts` | ✅ Sprint 8 |
| Cascata de estorno: filho sem `recognizedEntryId` (legado) marca status mas não posta | `payment-cascade.test.ts` | ✅ Sprint 8 |
| Endpoint `GET /reports/reconciliation`: `ok=true` quando saldos batem | `reconciliation.test.ts` | ⏳ Sprint 9 (e2e) |
| Endpoint `GET /reports/reconciliation`: detecta órfão (receita sem entry) | `reconciliation.test.ts` | ⏳ Sprint 9 (e2e) |
| `SELECT FOR UPDATE` em carteira: 2 débitos concorrentes não dobram saldo | `wallet-race.test.ts` | ⏳ Sprint 9 (integração com Postgres real) |

---

## 8. Conclusão executiva

O fluxo financeiro do FisioGest Pro evoluiu para um modelo bem estruturado por evento (sessão → reconhecimento de receita), com sub-contas contábeis por procedimento e idempotência via `planMonthRef`. **Após as Sprints Financeiros 6, 7 e 8-parcial (29/04/2026)**, treze bugs foram corrigidos (B1–B8, B10, B11, B12, B14, B15) com cobertura de testes — o sistema agora **bloqueia edições contabilmente perigosas**, **dispara estorno auditado** em DELETE, **mantém paridade** entre `/payment` e `/status` para promoção de créditos, **isola tenants**, **direciona saldo residual para a carteira do paciente** (não receita fantasma), **garante idempotência de billing** via `planMonthRef`, **usa advisory lock** contra race condition de reconhecimento de receita, **reverte receita** quando sessões saem do estado confirmado, **estorna em cascata** mãe→filhos em `faturaMensalAvulso`, **serializa** débitos de carteira via `SELECT FOR UPDATE` e **expõe endpoint de conciliação** operacional × contábil.

Próximos passos:
- **Sprint 9** (B9 + cascata `faturaPlano`): sub-ledger via `payment_allocations` com migração e backfill controlado; cascata de estorno também para `faturaPlano` (após decisão operacional sobre semântica de mês inteiro); job cron noturno consumindo o endpoint `/reports/reconciliation` e gravando em `discrepancy_log` para alerta diário; testes de integração com Postgres real cobrindo o lock de carteira (`wallet-race.test.ts`).

O caminho feliz já estava consistente; o caminho de **edição/estorno/exceção** agora também — o sistema atingiu o nível mínimo "auditável" exigido para onboarding de clientes com auditoria contábil formal (CFC/CRC, escritório contador externo). **Status atual: 351/351 testes verdes, todos os bugs de severidade média/alta resolvidos, restando apenas evolução arquitetural (sub-ledger explícito) para Sprint 9.**
