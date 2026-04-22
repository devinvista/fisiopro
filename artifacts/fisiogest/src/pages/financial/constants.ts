export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const GENERAL_EXPENSE_CATEGORIES = [
  "Aluguel", "Água e Luz", "Internet", "Telefone",
  "Material de Escritório", "Equipamentos", "Marketing",
  "Salários", "Pró-labore", "Impostos e Taxas", "Contabilidade",
  "Manutenção", "Seguro", "Outros",
];

export const PROCEDURE_EXPENSE_CATEGORIES = [
  "Insumos e Materiais", "Consumíveis", "Produtos Cosméticos",
  "Medicamentos", "Luvas e EPI", "Material Descartável",
  "Equipamento de Procedimento", "Outros",
];

export const REVENUE_CATEGORIES = [
  "Consulta", "Avaliação", "Procedimento", "Pacote de Sessões",
  "Pilates", "Estética", "Outros",
];

export const RECURRING_CATEGORIES = [
  "Aluguel", "Água e Luz", "Internet", "Telefone",
  "Salários", "Pró-labore", "Impostos e Taxas", "Contabilidade",
  "Marketing", "Equipamentos", "Manutenção", "Seguro", "Outros",
];

export const FREQUENCY_OPTIONS = [
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual (÷12)" },
  { value: "semanal", label: "Semanal (×4,33)" },
];

export const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#14b8a6", "#f97316"];

export const PAYMENT_METHODS = [
  "Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito",
  "Transferência", "Boleto", "Cheque", "Outros",
];

const currentYear = new Date().getFullYear();
export const YEARS = Array.from({ length: 4 }, (_, i) => currentYear - i);
