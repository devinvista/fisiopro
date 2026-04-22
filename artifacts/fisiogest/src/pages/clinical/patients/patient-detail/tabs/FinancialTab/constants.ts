export const PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito",
  "Transferência", "Boleto", "Outro",
];

export const emptyPaymentForm = { amount: "", paymentMethod: "", description: "" };

export const WALLET_TX_LABELS: Record<string, { label: string; color: string; sign: "+" | "-" | "" }> = {
  deposito:    { label: "Depósito",     color: "text-emerald-700 bg-emerald-50 border-emerald-200", sign: "+" },
  usoCarteira: { label: "Uso Carteira", color: "text-rose-700 bg-rose-50 border-rose-200",          sign: "-" },
  estorno:     { label: "Estorno",      color: "text-amber-700 bg-amber-50 border-amber-200",       sign: "+" },
  ajuste:      { label: "Ajuste",       color: "text-blue-700 bg-blue-50 border-blue-200",          sign: ""  },
};
