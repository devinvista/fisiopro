## Schema do Banco de Dados

Todas as tabelas estão no PostgreSQL provisionado pelo Replit. O schema canônico fica em `lib/db/src/schema/`.

| Tabela | Campos principais |
|---|---|
| `users` | id, email, passwordHash, name, role |
| `clinics` | id, name, cnpj, address, phone, email |
| `patients` | id, clinicId, name, cpf (único), birthDate, phone, email, address, profession, emergencyContact, notes |
| `procedures` | id, name, category, modalidade, durationMinutes, price, cost, **maxCapacity** (default 1), isActive |
| `procedure_costs` | id, procedureId, clinicId, priceOverride, fixedCost, variableCost, notes |
| `appointments` | id, patientId, procedureId, clinicId, scheduleId, date, startTime, **endTime** (calculado), status, notes |
| `schedules` | id, clinicId, type (clinic/professional), name, workingDays, startTime, endTime, isActive |
| `blocked_slots` | id, clinicId, scheduleId, date, startTime, endTime, reason |
| `anamnesis` | id, patientId, **templateType** (reabilitacao/esteticaFacial/esteticaCorporal) — UNIQUE(patientId, templateType), campos compartilhados (mainComplaint, diseaseHistory, medications, painScale…), campos faciais (phototype, skinType, skinConditions, sunExposure…), campos corporais (mainBodyConcern, bodyConcernRegions, celluliteGrade, bodyWeight, bodyHeight…) |
| `body_measurements` | id, patientId, measuredAt, **biometria** (weight, height), **perimetria** (waist, abdomen, hips, thighRight/Left, armRight/Left, calfRight/Left), **composição** (bodyFat, celluliteGrade), notes — tabela de série temporal para acompanhamento evolutivo corporal |
| `evaluations` | id, patientId, inspection, posture, rangeOfMotion, muscleStrength, orthopedicTests, functionalDiagnosis |
| `treatment_plans` | id, patientId (múltiplos por paciente), **clinicId** (FK → clinics), objectives, techniques, frequency, estimatedSessions, status |
| `evolutions` | id, patientId, appointmentId (FK opcional), description, patientResponse, clinicalNotes, complications, **painScale** (0–10) |
| `discharge_summaries` | id, patientId (único), dischargeDate, dischargeReason, achievedResults, recommendations |
| `patient_subscriptions` | id, patientId, procedureId, startDate, billingDay, monthlyAmount, status, clinicId, cancelledAt, nextBillingDate — **índices:** patientId, clinicId, status, nextBillingDate |
| `session_credits` | id, patientId, procedureId, quantity, usedQuantity, clinicId, notes — **índices:** patientId, clinicId |
| `financial_records` | id, type (receita/despesa), amount, description, category, **status** (pendente/pago/cancelado/estornado), **dueDate** (vencimento), **paymentDate** (data de pagamento), **paymentMethod** (forma de pagamento), transactionType, appointmentId?, patientId?, procedureId?, subscriptionId?, clinicId, **accountingEntryId** (FK → journal entry principal), **recognizedEntryId** (FK → entry de reconhecimento de receita), **settlementEntryId** (FK → entry de liquidação) |
| `accounting_accounts` | id, clinicId, code (único por clínica), name, type (asset/liability/equity/revenue/expense), normalBalance (debit/credit), isSystem |
| `accounting_journal_entries` | id, clinicId, entryDate, eventType, description, sourceType, sourceId, status (posted/reversed), patientId?, appointmentId?, procedureId?, patientPackageId?, subscriptionId?, walletTransactionId?, financialRecordId?, reversalOfEntryId? |
| `accounting_journal_lines` | id, entryId (FK cascade), accountId, debitAmount, creditAmount, memo |
| `receivable_allocations` | id, clinicId, paymentEntryId, receivableEntryId, patientId, amount, allocatedAt |
| `patient_wallet` | id, patientId, clinicId, balance |
| `patient_wallet_transactions` | id, walletId, patientId, clinicId, amount, type (deposito/debito), description, appointmentId?, financialRecordId? |
| `recurring_expenses` | id, clinicId, name, category, amount, frequency (mensal/anual/semanal), isActive, notes |
| `billing_run_logs` | id, ranAt, triggeredBy (scheduler/manual), clinicId, processed, generated, skipped, errors, dryRun |
| `audit_log` | id, userId, action, entityType, entityId, patientId, summary, createdAt |

### Comandos de schema

```bash
# Sincronizar schema (pede confirmação em mudanças destrutivas)
pnpm --filter @workspace/db exec drizzle-kit push --config drizzle.config.ts

# Seed financeiro incremental (criar agendamentos + registros financeiros sem duplicar)
tsx scripts/seed-financial.ts

# Seed completo (somente se a clínica e usuários NÃO existirem — cria novo clinic)
pnpm run db:seed-demo
```

### Estado atual do banco (abril/2026)

- Clinic id=3 "Marta Schuch": 34 pacientes, 11 procedimentos globais (clinicId=null), ~600 agendamentos, 232 receitas, 21 despesas (jan–mar 2026)
- Credenciais: `mwschuch@gmail.com` / `123456` (admin+profissional, clinicId=3)
- Credenciais: `admin@fisiogest.com.br` / `123456` (super admin, clinicId=null)

---

