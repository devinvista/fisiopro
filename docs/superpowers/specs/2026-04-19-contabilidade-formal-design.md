# Migração para contabilidade formal por partidas dobradas

## Objetivo

Migrar o financeiro do FisioGest Pro para um modelo contábil formal, auditável e baseado em partidas dobradas, separando de forma explícita:

- caixa recebido;
- receita por competência;
- contas a receber;
- adiantamentos de clientes, incluindo carteira e pacotes pagos antecipadamente;
- créditos de sessão como controle operacional não monetário;
- despesas;
- estornos e cancelamentos.

A migração deve resolver os problemas atuais de dupla contagem de carteira, pacote vendido sem reconhecimento financeiro adequado, pagamentos manuais desconectados de títulos a receber e saldos de paciente inflados por lançamentos sobrepostos.

## Problema atual

Hoje a tabela `financial_records` mistura conceitos diferentes em uma única estrutura:

- cobrança pendente;
- pagamento recebido;
- receita reconhecida;
- item operacional aguardando fatura;
- uso de carteira;
- uso de crédito de sessão;
- despesas.

Isso cria ambiguidades:

1. Depósito em carteira entra como `receita` e uso da carteira também entra como `receita`, duplicando resultados.
2. Pacote por sessões cria créditos, mas não representa corretamente caixa, contas a receber, adiantamento e receita futura.
3. Pagamento manual cria um novo lançamento `pagamento`, mas pode não quitar o lançamento `creditoAReceber` original.
4. `pendenteFatura` e `faturaConsolidada` podem se sobrepor em alguns saldos se o relatório não souber qual é o título oficial.
5. DRE, caixa e saldo do paciente dependem de filtros frágeis em `transactionType`.

## Decisão de produto

O sistema adotará contabilidade formal com regime híbrido:

- **Dashboard operacional:** mostra caixa recebido, contas a receber, despesas e saldo de carteira/adiantamentos.
- **DRE:** mostra receita por competência, despesas e resultado econômico.
- **Paciente:** mostra títulos em aberto, pagamentos aplicados, saldo de carteira e créditos de sessão separados.

Dinheiro recebido antecipadamente não é receita por competência. Ele entra no caixa e cria um passivo de adiantamento do cliente. A receita é reconhecida quando o atendimento é realizado ou quando a obrigação é liquidada conforme a regra do produto.

## Novo modelo contábil

### Tabela `accounting_accounts`

Plano de contas por clínica.

Campos principais:

- `id`
- `clinic_id`
- `code`
- `name`
- `type`: `asset`, `liability`, `equity`, `revenue`, `expense`
- `normal_balance`: `debit` ou `credit`
- `is_system`
- `created_at`

Contas sistêmicas iniciais:

| Código | Conta | Tipo | Natureza |
|---|---|---|---|
| 1.1.1 | Caixa/Banco | asset | debit |
| 1.1.2 | Contas a Receber | asset | debit |
| 2.1.1 | Adiantamentos de Clientes | liability | credit |
| 3.1.1 | Patrimônio/Resultado Acumulado | equity | credit |
| 4.1.1 | Receita de Atendimentos | revenue | credit |
| 4.1.2 | Receita de Pacotes/Mensalidades Reconhecida | revenue | credit |
| 5.1.1 | Despesas Operacionais | expense | debit |
| 5.1.2 | Estornos/Cancelamentos de Receita | expense | debit |

### Tabela `accounting_journal_entries`

Cabeçalho de cada evento contábil.

Campos principais:

- `id`
- `clinic_id`
- `entry_date`
- `event_type`
- `description`
- `source_type`
- `source_id`
- `patient_id`
- `appointment_id`
- `procedure_id`
- `patient_package_id`
- `subscription_id`
- `wallet_transaction_id`
- `financial_record_id`
- `status`: `posted`, `voided`, `reversed`
- `reversal_of_entry_id`
- `created_by`
- `created_at`

Regras:

- Entradas contábeis postadas não são editadas diretamente.
- Correções são feitas por estorno/reversão.
- Cada evento precisa ter pelo menos duas linhas.
- A soma dos débitos deve ser igual à soma dos créditos.

### Tabela `accounting_journal_lines`

Linhas de débito e crédito.

Campos principais:

- `id`
- `entry_id`
- `account_id`
- `debit_amount`
- `credit_amount`
- `memo`
- `created_at`

Restrições:

- Uma linha não pode ter débito e crédito ao mesmo tempo.
- Débito e crédito não podem ser negativos.
- Cada lançamento deve balancear no total.

### Tabela `receivable_allocations`

Aplicação de pagamentos contra títulos a receber.

Campos principais:

- `id`
- `clinic_id`
- `payment_entry_id`
- `receivable_entry_id`
- `patient_id`
- `amount`
- `allocated_at`
- `created_at`

Essa tabela resolve o problema de pagamento manual desconectado da cobrança original.

### Campos de compatibilidade em `financial_records`

A tabela atual será mantida durante a migração como camada operacional/legada, mas receberá vínculos para o ledger:

- `accounting_entry_id`
- `recognized_entry_id`
- `settlement_entry_id`

Relatórios novos devem consultar o ledger. Telas antigas podem continuar lendo `financial_records` durante a transição, desde que os lançamentos sejam sincronizados.

## Regras contábeis por fluxo

### 1. Sessão avulsa concluída e ainda não paga

Reconhece receita por competência e cria contas a receber.

| Conta | Débito | Crédito |
|---|---:|---:|
| Contas a Receber | valor da sessão | — |
| Receita de Atendimentos | — | valor da sessão |

O título fica aberto até receber pagamento.

### 2. Pagamento de sessão avulsa pendente

Quando o paciente paga uma cobrança existente:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor pago | — |
| Contas a Receber | — | valor pago |

Além disso, cria `receivable_allocations` vinculando o pagamento ao título original.

Se o pagamento for parcial, o título permanece parcialmente aberto.

### 3. Pagamento direto no ato da sessão

Se a sessão for concluída e paga no mesmo momento, pode ser registrado em uma única entrada composta:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor da sessão | — |
| Receita de Atendimentos | — | valor da sessão |

Não passa por contas a receber.

### 4. Depósito em carteira

Depósito não é receita.

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor depositado | — |
| Adiantamentos de Clientes | — | valor depositado |

Também atualiza `patient_wallet.balance` e cria `patient_wallet_transactions` do tipo depósito.

### 5. Uso de carteira em atendimento

Não entra novo caixa. Reconhece receita e baixa o passivo.

| Conta | Débito | Crédito |
|---|---:|---:|
| Adiantamentos de Clientes | valor usado | — |
| Receita de Atendimentos | — | valor usado |

Também reduz `patient_wallet.balance` e cria transação de débito na carteira.

### 6. Venda de pacote por sessões pago no ato

Ao vender o pacote:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor pago | — |
| Adiantamentos de Clientes | — | valor pago |

Também cria os créditos de sessão operacionais.

A cada sessão consumida, reconhece receita proporcional:

| Conta | Débito | Crédito |
|---|---:|---:|
| Adiantamentos de Clientes | valor unitário do pacote | — |
| Receita de Pacotes/Mensalidades Reconhecida | — | valor unitário do pacote |

Valor unitário = preço do pacote / total de sessões. Arredondamentos residuais devem ser ajustados na última sessão.

### 7. Venda de pacote por sessões pendente

Ao vender o pacote sem pagamento:

| Conta | Débito | Crédito |
|---|---:|---:|
| Contas a Receber | valor do pacote | — |
| Adiantamentos de Clientes | — | valor do pacote |

Quando o paciente paga:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor pago | — |
| Contas a Receber | — | valor pago |

A receita continua sendo reconhecida apenas quando as sessões são consumidas.

### 8. Mensalidade paga antes das sessões

Quando a mensalidade é paga:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor pago | — |
| Adiantamentos de Clientes | — | valor pago |

Quando as sessões incluídas forem realizadas, a receita é reconhecida proporcionalmente.

### 9. Mensalidade gerada e não paga

Quando gerar cobrança mensal pendente:

| Conta | Débito | Crédito |
|---|---:|---:|
| Contas a Receber | valor da mensalidade | — |
| Adiantamentos de Clientes | — | valor da mensalidade |

Quando pagar, baixa contas a receber contra caixa.

### 10. Fatura consolidada

Atendimento realizado dentro de fatura consolidada:

- mantém item operacional `pendenteFatura` para compor a fatura;
- não cria contas a receber oficial ainda, para evitar duplicidade;
- pode reconhecer receita por competência no atendimento, com contrapartida em contas a receber não faturado, se o plano incluir essa conta.

Para a primeira versão formal, a regra será:

No atendimento consolidado:

| Conta | Débito | Crédito |
|---|---:|---:|
| Contas a Receber | valor da sessão | — |
| Receita de Atendimentos | — | valor da sessão |

Na geração da fatura consolidada, não reconhece receita novamente. A fatura apenas agrupa os títulos já reconhecidos. O vínculo entre itens e fatura deve impedir dupla cobrança.

Quando a fatura é paga:

| Conta | Débito | Crédito |
|---|---:|---:|
| Caixa/Banco | valor pago | — |
| Contas a Receber | — | valor pago |

### 11. Despesa paga

| Conta | Débito | Crédito |
|---|---:|---:|
| Despesas Operacionais | valor | — |
| Caixa/Banco | — | valor |

### 12. Despesa pendente

Se a tela suportar despesa a pagar futuramente:

| Conta | Débito | Crédito |
|---|---:|---:|
| Despesas Operacionais | valor | — |
| Contas a Pagar | — | valor |

Na versão inicial, se não houver contas a pagar no produto, despesas atuais permanecem como pagas ao serem registradas.

### 13. Cancelamento/estorno

Nunca apagar lançamento contábil postado.

Criar entrada inversa com `reversal_of_entry_id`.

Exemplo: estorno de uso de carteira:

| Conta | Débito | Crédito |
|---|---:|---:|
| Receita de Atendimentos | valor | — |
| Adiantamentos de Clientes | — | valor |

Também restaura o saldo da carteira quando aplicável.

## Migração dos dados existentes

A migração será conservadora e auditável.

### Etapa 1: Criar ledger vazio

- Criar tabelas contábeis.
- Criar plano de contas padrão por clínica.
- Não alterar saldos nem relatórios ainda.

### Etapa 2: Backfill histórico

Converter `financial_records` e eventos operacionais existentes em lançamentos contábeis.

Mapeamento inicial:

| Registro legado | Migração |
|---|---|
| `creditoAReceber` pendente | Débito Contas a Receber / Crédito Receita |
| `creditoAReceber` pago | Se não houver pagamento separado, Débito Caixa / Crédito Receita |
| `pagamento` | Débito Caixa / Crédito Contas a Receber, alocado ao título mais antigo do paciente quando possível |
| `depositoCarteira` | Débito Caixa / Crédito Adiantamentos |
| `usoCarteira` | Débito Adiantamentos / Crédito Receita |
| `usoCredito` com valor zero | Não gera valor contábil; se origem for pacote pago, reconhecimento será calculado pelo pacote |
| `pendenteFatura` | Débito Contas a Receber / Crédito Receita, marcado como item faturável |
| `faturaConsolidada` | Não reconhece nova receita; representa agrupamento/cobrança oficial para pagamento |
| `despesa` paga | Débito Despesa / Crédito Caixa |
| `estornado` ou `cancelado` | Não migrar como ativo; se já havia sido migrado, gerar reversão |

### Etapa 3: Reconciliar saldos

Gerar verificações por clínica:

- total de débitos = total de créditos;
- saldo de carteira no ledger = soma de `patient_wallet.balance`;
- contas a receber em aberto = títulos pendentes menos alocações;
- caixa histórico = entradas de caixa menos saídas de caixa;
- receita por competência não inclui depósitos de carteira nem vendas antecipadas de pacote sem consumo.

### Etapa 4: Trocar relatórios para ledger

- Dashboard financeiro passa a calcular caixa e competência a partir de contas contábeis.
- DRE passa a usar contas de receita e despesa.
- Resumo do paciente passa a usar contas a receber, alocações, carteira e créditos separados.

### Etapa 5: Trocar fluxos de escrita

Atualizar fluxos para sempre criarem lançamentos balanceados:

- atendimento concluído;
- pagamento manual;
- depósito em carteira;
- uso de carteira;
- venda de pacote;
- consumo de crédito de pacote;
- cobrança mensal;
- fatura consolidada;
- despesa;
- estorno/cancelamento.

## Compatibilidade e telas

A primeira entrega deve preservar a experiência atual da UI, mas com números corretos.

Mudanças esperadas:

- Dashboard mostra claramente `Caixa recebido` e `Receita reconhecida` como métricas separadas.
- DRE usa receita por competência.
- Carteira aparece como saldo/adiantamento, não como receita.
- Pacotes pagos aparecem como caixa e adiantamento até consumo.
- Pacotes pendentes aparecem como contas a receber e adiantamento.
- Pagamentos manuais reduzem contas a receber existentes.

## Validação funcional

Cenários que devem passar após implementação:

1. Depositar R$ 500 na carteira aumenta caixa em R$ 500 e adiantamentos em R$ 500, sem aumentar receita.
2. Usar R$ 100 da carteira em atendimento reduz adiantamento em R$ 100 e reconhece receita de R$ 100, sem aumentar caixa.
3. Vender pacote de 10 sessões por R$ 1.000 pago no ato aumenta caixa e adiantamento em R$ 1.000, sem reconhecer R$ 1.000 de receita imediata.
4. Consumir 1 sessão do pacote reconhece R$ 100 de receita e reduz adiantamento em R$ 100.
5. Criar sessão avulsa pendente de R$ 150 aumenta contas a receber e receita em R$ 150.
6. Registrar pagamento manual de R$ 150 baixa o título original e aumenta caixa, sem criar receita duplicada.
7. Gerar fatura consolidada não duplica receita dos itens já realizados.
8. Cancelar atendimento cria reversão contábil, não apaga histórico.
9. Débitos e créditos fecham em todas as clínicas.

## Fora de escopo nesta primeira migração

- Integração bancária real.
- Contas bancárias múltiplas por clínica.
- Centro de custo avançado.
- Livro razão exportável em layout fiscal oficial.
- NFSe ou emissão fiscal.
- Contas a pagar completas, exceto se já houver despesa pendente na UI atual.

## Riscos e mitigação

### Risco: migração histórica classificar pagamentos antigos incorretamente

Mitigação: quando não houver vínculo claro, alocar pagamentos ao título pendente mais antigo do mesmo paciente e clínica. Se não houver título compatível, registrar como pagamento não alocado em caixa e sinalizar no relatório de reconciliação.

### Risco: diferença entre saldo de carteira operacional e contábil

Mitigação: gerar relatório de diferenças por paciente antes de trocar a UI para o ledger.

### Risco: relatórios antigos e novos divergirem durante a transição

Mitigação: manter endpoints legados até a conclusão e trocar telas por etapas, começando por dashboard/DRE/resumo do paciente.

### Risco: fatura consolidada duplicar receita

Mitigação: tratar fatura como agrupador e cobrança oficial, não como novo reconhecimento de receita.

## Decisão final

Implementar contabilidade formal com partidas dobradas agora, mantendo compatibilidade temporária com `financial_records` e migrando gradualmente os relatórios para o ledger. O novo ledger será a fonte de verdade para DRE, caixa, contas a receber, adiantamentos e saldos financeiros.