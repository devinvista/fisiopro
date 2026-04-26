export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  externalReference?: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: "CREDIT_CARD" | "BOLETO" | "PIX" | "UNDEFINED";
  cycle: "MONTHLY" | "YEARLY" | "WEEKLY" | "BIWEEKLY" | "QUARTERLY" | "SEMIANNUALLY";
  value: number;
  nextDueDate: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  description?: string;
  externalReference?: string;
  endDate?: string | null;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string;
  value: number;
  netValue?: number;
  billingType: string;
  status:
    | "PENDING"
    | "RECEIVED"
    | "CONFIRMED"
    | "OVERDUE"
    | "REFUNDED"
    | "RECEIVED_IN_CASH"
    | "REFUND_REQUESTED"
    | "CHARGEBACK_REQUESTED"
    | "AWAITING_RISK_ANALYSIS"
    | "CHARGEBACK_DISPUTE"
    | "DUNNING_REQUESTED"
    | "DUNNING_RECEIVED";
  dueDate: string;
  paymentDate?: string | null;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  description?: string;
  externalReference?: string;
}

export interface AsaasWebhookEventPayload {
  id: string;
  event: AsaasWebhookEventType;
  dateCreated?: string;
  payment?: AsaasPayment;
  subscription?: AsaasSubscription;
}

export type AsaasWebhookEventType =
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_DELETED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_DELETED"
  | "SUBSCRIPTION_CYCLE_REMOVED";

export interface AsaasError {
  errors: Array<{ code: string; description: string }>;
}
