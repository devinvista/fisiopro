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

// ─── Sprint 1 — Créditos de sessão (session_credits) ─────────────────────────

export const SESSION_CREDIT_STATUSES = [
  "disponivel",        // saldo > 0 e dentro da validade
  "pendentePagamento", // crédito de plano prepago aguardando fatura paga
  "consumido",         // totalmente consumido por um appointment
  "expirado",          // validUntil passou antes do consumo
  "estornado",         // crédito anulado (erro de lançamento, cancelamento)
] as const;
export type SessionCreditStatus = (typeof SESSION_CREDIT_STATUSES)[number];

export const SESSION_CREDIT_STATUS_LABELS: Record<SessionCreditStatus, string> = {
  disponivel:        "Disponível",
  pendentePagamento: "Pendente pagamento",
  consumido:         "Consumido",
  expirado:          "Expirado",
  estornado:         "Estornado",
};

export const SESSION_CREDIT_ORIGINS = [
  "mensal",              // pool gerado pela materialização
  "reposicaoFalta",      // reposição automática por falta em sessão paga
  "reposicaoRemarcacao", // reposição por remarcação dentro da política
  "compraPacote",        // sessões compradas em pacote `sessoes`
  "cortesia",            // crédito manual concedido pela clínica
  "legacy",              // créditos pré-existentes ao schema atual
] as const;
export type SessionCreditOrigin = (typeof SESSION_CREDIT_ORIGINS)[number];

export const SESSION_CREDIT_ORIGIN_LABELS: Record<SessionCreditOrigin, string> = {
  mensal:              "Pool mensal",
  reposicaoFalta:      "Reposição (falta)",
  reposicaoRemarcacao: "Reposição (remarcação)",
  compraPacote:        "Compra de pacote",
  cortesia:            "Cortesia",
  legacy:              "Legado",
};

// ─── Sprint 1/2 — Modos de pagamento de plano mensal ─────────────────────────

export const PAYMENT_MODES = ["postpago", "prepago"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  postpago: "Pós-pago (créditos imediatos)",
  prepago:  "Antecipado (libera ao pagar)",
};

// ─── Sprint 4 — Modo de cobrança de itens avulsos ────────────────────────────

export const AVULSO_BILLING_MODES = ["porSessao", "mensalConsolidado"] as const;
export type AvulsoBillingMode = (typeof AVULSO_BILLING_MODES)[number];

export const AVULSO_BILLING_MODE_LABELS: Record<AvulsoBillingMode, string> = {
  porSessao:         "Cobra por sessão",
  mensalConsolidado: "Fatura mensal consolidada",
};

// ─── Sprint 5 — Política de cancelamento dentro da janela ────────────────────

export const LATE_CANCELLATION_POLICIES = [
  "creditoNormal", // gera crédito como hoje
  "semCredito",    // não gera crédito (paciente perde a sessão)
  "taxa",          // cobra taxa de no-show configurada
] as const;
export type LateCancellationPolicy = (typeof LATE_CANCELLATION_POLICIES)[number];

export const LATE_CANCELLATION_POLICY_LABELS: Record<LateCancellationPolicy, string> = {
  creditoNormal: "Gera crédito normal",
  semCredito:    "Sem crédito (perde a sessão)",
  taxa:          "Cobra taxa de no-show",
};
