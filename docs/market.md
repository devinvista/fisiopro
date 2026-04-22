## Análise de Mercado — Sistemas Concorrentes e Melhores Práticas

### Sistemas de referência no mercado brasileiro de gestão clínica

| Sistema | Público-alvo | Diferencial | Fraqueza vs FisioGest |
|---|---|---|---|
| **Ninsaúde Clinic** | Clínicas multiespecialidade | Prontuário eletrônico + telemedicina | Financeiro simplificado, sem ledger contábil real |
| **ClinicWeb** | Fisioterapia/reabilitação | Especializado em COFFITO, SOAP | Agenda e financeiro básicos |
| **iClinic** | Clínicas em geral | UX polida, boa agenda | SaaS caro, sem assinatura por sessão |
| **Prontmed** | Médicos e clínicas | Prescrição eletrônica (CFM) | Sem foco em fisioterapia/Pilates |
| **Clinicorp** | Odontologia e estética | Gestão de pacotes e controle de sessões | Pouco voltado ao COFFITO |
| **Meetime** | Vendas B2B | CRM clínico | Não é sistema clínico especializado |

### Melhores práticas identificadas

1. **Prontuário estruturado por especialidade** — templates adaptativos (reabilitação, estética facial, estética corporal) ✅ implementado
2. **Ledger contábil por partidas dobradas** — receita por competência, não por caixa ✅ implementado
3. **Cobrança automática de mensalidades** — billing scheduler com tolerância ✅ implementado
4. **Controle de créditos de sessão** — pacotes pré-pagos com consumo rastreado ✅ implementado
5. **Régua de cobrança** — lembretes automáticos de inadimplência ⏳ próxima prioridade (requer gateway)
6. **Relatório de aging (inadimplência)** — cálculo de dias em atraso ✅ implementado no frontend
7. **Multi-clínica com RBAC** — isolamento por clinicId + permissões por papel ✅ implementado
8. **Portal de agendamento público** — link gerado automaticamente por clínica ✅ implementado
9. **Telemedicina / videochamada** — integração Zoom/Google Meet ⏳ backlog
10. **Assinatura digital de prontuários** — conformidade COFFITO Resolução 424/2013 ⏳ backlog

### Lacunas identificadas vs mercado

| Funcionalidade | Status | Prioridade |
|---|---|---|
| Régua de cobrança (PIX/boleto automático) | Pendente | Alta — requer gateway |
| App mobile para pacientes (confirmação, histórico) | Pendente | Alta |
| Emissão de NFS-e (nota fiscal de serviço) | Pendente | Média |
| Integração com WhatsApp Business API | Pendente | Alta — lembretes de consulta |
| Assinatura digital de documentos clínicos | Pendente | Média (COFFITO) |
| Split de pagamento (clínica + profissional) | Pendente | Média |
| Dashboard de relatórios com BI exportável | Pendente | Baixa |

---

