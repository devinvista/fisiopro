
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const CATEGORY_ICONS: Record<string, string> = {
  "Reabilitação": "🦴",
  "Fisioterapia": "🦴",
  "Pilates": "🤸",
  "Estética": "✨",
  "Acupuntura": "📍",
  "Massagem": "💆",
  "default": "🏥",
};

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  agendado: { label: "Agendado", color: "text-blue-700 bg-blue-100" },
  confirmado: { label: "Confirmado", color: "text-green-700 bg-green-100" },
  concluido: { label: "Concluído", color: "text-slate-700 bg-slate-100" },
  cancelado: { label: "Cancelado", color: "text-red-700 bg-red-100" },
  faltou: { label: "Faltou", color: "text-amber-700 bg-amber-100" },
};

