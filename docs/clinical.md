## Regras de Governança de Agendamentos

1. **endTime sempre calculado** — o sistema calcula `endTime = startTime + procedure.durationMinutes`. O cliente nunca envia `endTime`.
2. **Procedimentos com maxCapacity = 1** (padrão) — qualquer sobreposição de horário ativo gera conflito 409.
3. **Procedimentos com maxCapacity > 1** (ex.: Pilates em Grupo = 4) — permite até N agendamentos simultâneos do mesmo procedimento. A N+1ª tentativa retorna 409 com a mensagem "Horário lotado: N/N vagas ocupadas".
4. **Endpoint de vagas** — `GET /api/appointments/available-slots?date=&procedureId=&clinicStart=08:00&clinicEnd=18:00` retorna slots a cada 30 min com `available` e `spotsLeft`.
5. **Agendamento recorrente** — `POST /api/appointments/recurring` persiste `clinicId` e `scheduleId` em cada sessão; conflitos são verificados por agenda (scope de `scheduleId`).
6. **Validação de dias úteis** — `available-slots` retorna `{ slots: [], notWorkingDay: true }` quando a data não é dia de funcionamento da agenda. Frontend exibe aviso visual âmbar.
7. **Edição parcial** — `PUT /api/appointments/:id` usa update parcial; `clinicId` e `scheduleId` nunca são sobrescritos por edições de status/notas.

---

## Funcionalidades do Sistema Clínico (Prontuário)

A página do prontuário (`artifacts/fisiogest/src/pages/patients/[id].tsx`) implementa o prontuário completo em abas:

| Aba | Descrição |
|---|---|
| Anamnese | **3 templates adaptativos**: Reabilitação (EVA, HDA, dor, histórico médico), Estética Facial (fototipo Fitzpatrick, tipo de pele, condições com checkboxes, triagem de contraindicações), Estética Corporal (IMC calculado, grau de celulite Nürnberger-Müller, regiões corporais, hábitos de vida) |
| Avaliações | Avaliações físicas — CRUD completo com edição/exclusão inline |
| Plano de Tratamento | Objetivos, técnicas, frequência, status |
| Evoluções | Notas de sessão — CRUD, vínculo com consulta |
| Histórico | Todas as consultas (status, procedimento, data) |
| Financeiro | Histórico de receitas/despesas por paciente |
| Alta Fisioterapêutica | Alta obrigatória pelo COFFITO: motivo, resultados, recomendações |

---

