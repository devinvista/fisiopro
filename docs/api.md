## Rotas da API

Todas as rotas exigem `Authorization: Bearer <token>`, exceto `/api/auth/*` e `/api/healthz`.

### Autenticação
| Método | Caminho | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Criar usuário |
| POST | `/api/auth/login` | Retorna JWT |
| GET | `/api/auth/me` | Usuário atual |

### Pacientes
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/patients` | Lista com busca + paginação |
| POST | `/api/patients` | Criar |
| GET | `/api/patients/:id` | Detalhe + `totalAppointments` + `totalSpent` |
| PUT | `/api/patients/:id` | Atualizar |
| DELETE | `/api/patients/:id` | Excluir |

### Prontuário (abaixo de `/api/patients/:patientId`)
| Método | Caminho | Descrição |
|---|---|---|
| GET/POST | `/anamnesis` | Upsert anamnese |
| GET/POST | `/evaluations` | Listar / Criar avaliação |
| PUT/DELETE | `/evaluations/:id` | Atualizar / Excluir |
| GET | `/treatment-plans` | Listar todos os planos do paciente |
| POST | `/treatment-plans` | Criar novo plano (com clinicId do paciente) |
| GET/PUT | `/treatment-plans/:planId` | Buscar / Atualizar plano específico |
| DELETE | `/treatment-plans/:planId` | Excluir plano |
| GET/POST | `/treatment-plan` | Compat: upsert do plano ativo mais recente |
| GET/POST | `/evolutions` | Listar / Criar evolução |
| PUT/DELETE | `/evolutions/:id` | Atualizar / Excluir |
| GET/POST | `/discharge-summary` | Upsert alta fisioterapêutica (COFFITO) |
| GET | `/appointments` | Histórico de consultas do paciente |
| GET | `/financial` | Registros financeiros do paciente |

### Agendamentos
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/appointments` | Listar (filtros: date, startDate, endDate, patientId, status) |
| POST | `/api/appointments` | Criar — endTime calculado automaticamente |
| POST | `/api/appointments/recurring` | Criar série recorrente |
| GET | `/api/appointments/:id` | Detalhe |
| PUT | `/api/appointments/:id` | Atualizar — recalcula endTime |
| DELETE | `/api/appointments/:id` | Excluir |
| POST | `/api/appointments/:id/complete` | Concluir + gerar registro financeiro |
| GET | `/api/appointments/available-slots` | Horários disponíveis (date, procedureId, clinicStart, clinicEnd) |

### Procedimentos
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/procedures` | Listar — LEFT JOIN `procedure_costs`; retorna `effectivePrice`, `effectiveTotalCost`, `isGlobal` |
| POST | `/api/procedures` | Criar |
| PUT | `/api/procedures/:id` | Atualizar dados base |
| PATCH | `/api/procedures/:id/toggle-active` | Ativar / desativar |
| GET | `/api/procedures/:id/costs` | Obter configuração de custos da clínica |
| PUT | `/api/procedures/:id/costs` | Upsert de custos da clínica |
| DELETE | `/api/procedures/:id/costs` | Remover override de custos |
| DELETE | `/api/procedures/:id` | Excluir (cascade em `procedure_costs`) |
| GET | `/api/procedures/overhead-analysis` | Análise de overhead (month, year, procedureId) |

### Financeiro
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/financial/dashboard` | KPIs mensais — receita, despesas, lucro, MRR, cobranças pendentes |
| GET | `/api/financial/records` | Listar registros (filtros: type, month, year) |
| POST | `/api/financial/records` | Criar registro manual — aceita status, dueDate, paymentMethod |
| PATCH | `/api/financial/records/:id` | Editar lançamento completo (todos os campos) |
| PATCH | `/api/financial/records/:id/status` | Atualizar apenas status + paymentDate + paymentMethod |
| PATCH | `/api/financial/records/:id/estorno` | Soft-reversal: status=estornado + postReversal no ledger contábil |
| DELETE | `/api/financial/records/:id` | Deleta despesas; estorna receitas (soft) |
| GET | `/api/financial/patients/:id/history` | Histórico financeiro completo do paciente |
| GET | `/api/financial/patients/:id/summary` | Saldo: totalAReceber, totalPago, saldo, totalSessionCredits |
| POST | `/api/financial/patients/:id/payment` | Registrar pagamento (transactionType=pagamento) |
| GET | `/api/financial/patients/:id/credits` | Créditos de sessão do paciente |
| GET | `/api/financial/patients/:id/subscriptions` | Assinaturas ativas do paciente |
| GET | `/api/financial/cost-per-procedure` | Análise de custo por procedimento (month, year) |
| GET | `/api/financial/dre` | DRE mensal: receita bruta, despesas por categoria, lucro, variância |

### Despesas Fixas / Recorrentes
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/recurring-expenses` | Listar despesas fixas da clínica |
| POST | `/api/recurring-expenses` | Criar |
| PATCH | `/api/recurring-expenses/:id` | Editar |
| DELETE | `/api/recurring-expenses/:id` | Excluir |

### Assinaturas
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/subscriptions` | Listar assinaturas |
| POST | `/api/subscriptions` | Criar assinatura |
| PATCH | `/api/subscriptions/:id` | Atualizar |
| DELETE | `/api/subscriptions/:id` | Cancelar |
| GET | `/api/subscriptions/billing-status` | Status do billing automático + próximas cobranças |
| POST | `/api/subscriptions/run-billing` | Executar cobrança manual (idempotente) |

### Horários e Agenda
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/schedules` | Listar horários da clínica |
| POST | `/api/schedules` | Criar horário |
| PUT | `/api/schedules/:id` | Atualizar |
| DELETE | `/api/schedules/:id` | Excluir |
| GET | `/api/blocked-slots` | Listar bloqueios |
| POST | `/api/blocked-slots` | Criar bloqueio |
| DELETE | `/api/blocked-slots/:id` | Remover bloqueio |

### Relatórios e Dashboard
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/dashboard` | KPIs do dashboard principal |
| GET | `/api/reports` | Relatórios por período |
| GET | `/api/audit-log` | Log de auditoria |

---

