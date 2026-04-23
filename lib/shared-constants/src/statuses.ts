/**
 * Constantes de status compartilhadas entre frontend e backend.
 * Uso: imports tipados eliminam strings literais espalhadas no código.
 */

// ─── Agendamentos (appointments) ────────────────────────────────────────────

export const APPOINTMENT_STATUSES = [
  "agendado",
  "confirmado",
  "compareceu",
  "concluido",
  "cancelado",
  "faltou",
  "remarcado",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado:   "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  concluido:  "Concluído",
  cancelado:  "Cancelado",
  faltou:     "Faltou",
  remarcado:  "Remarcado",
};

/** Status que indicam que o paciente não compareceu/será cobrado normalmente. */
export const APPOINTMENT_INACTIVE_STATUSES: AppointmentStatus[] = [
  "cancelado",
  "faltou",
  "remarcado",
];

// ─── Registros financeiros (financial_records) ───────────────────────────────

export const FINANCIAL_RECORD_STATUSES = [
  "pendente",
  "pago",
  "estornado",
  "cancelado",
] as const;
export type FinancialRecordStatus = (typeof FINANCIAL_RECORD_STATUSES)[number];

export const FINANCIAL_RECORD_STATUS_LABELS: Record<FinancialRecordStatus, string> = {
  pendente:  "Pendente",
  pago:      "Pago",
  estornado: "Estornado",
  cancelado: "Cancelado",
};

// ─── Assinaturas de pacientes (patient_subscriptions) ───────────────────────

export const PATIENT_SUBSCRIPTION_STATUSES = [
  "ativa",
  "inativa",
  "cancelada",
] as const;
export type PatientSubscriptionStatus = (typeof PATIENT_SUBSCRIPTION_STATUSES)[number];

export const PATIENT_SUBSCRIPTION_STATUS_LABELS: Record<PatientSubscriptionStatus, string> = {
  ativa:     "Ativa",
  inativa:   "Inativa",
  cancelada: "Cancelada",
};

// ─── Assinaturas SaaS (clinic_subscriptions) ─────────────────────────────────

export const SAAS_SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "suspended",
  "cancelled",
] as const;
export type SaasSubscriptionStatus = (typeof SAAS_SUBSCRIPTION_STATUSES)[number];

export const SAAS_SUBSCRIPTION_STATUS_LABELS: Record<SaasSubscriptionStatus, string> = {
  trial:     "Trial",
  active:    "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

export const SAAS_PAYMENT_STATUSES = ["pending", "paid", "overdue", "free"] as const;
export type SaasPaymentStatus = (typeof SAAS_PAYMENT_STATUSES)[number];

export const SAAS_PAYMENT_STATUS_LABELS: Record<SaasPaymentStatus, string> = {
  pending: "Pendente",
  paid:    "Pago",
  overdue: "Atrasado",
  free:    "Gratuito",
};

// ─── Status de pagamento de pacotes (patient_packages) ──────────────────────

export const PACKAGE_PAYMENT_STATUSES = ["pendente", "pago", "cancelado"] as const;
export type PackagePaymentStatus = (typeof PACKAGE_PAYMENT_STATUSES)[number];

export const PACKAGE_PAYMENT_STATUS_LABELS: Record<PackagePaymentStatus, string> = {
  pendente:  "Pendente",
  pago:      "Pago",
  cancelado: "Cancelado",
};

// ─── Planos de tratamento (treatment_plans) ──────────────────────────────────

export const TREATMENT_PLAN_STATUSES = ["ativo", "concluido", "cancelado"] as const;
export type TreatmentPlanStatus = (typeof TREATMENT_PLAN_STATUSES)[number];

export const TREATMENT_PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  ativo:     "Ativo",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// ─── Métodos de pagamento ────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  "Dinheiro",
  "Pix",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Boleto",
  "Cheque",
  "Outros",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ─── Tipos de registro financeiro ────────────────────────────────────────────

export const FINANCIAL_RECORD_TYPES = ["receita", "despesa"] as const;
export type FinancialRecordType = (typeof FINANCIAL_RECORD_TYPES)[number];
