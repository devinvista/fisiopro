export const HOUR_START = 7;
export const HOUR_END = 19;
export const SLOT_HEIGHT = 64;
export const TOTAL_HOURS = HOUR_END - HOUR_START;

export const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
    border: string;
    badge: string;
    cardBg: string;
    cardSub: string;
  }
> = {
  agendado:   { label: "Agendado",   bg: "bg-amber-400",   text: "text-white", dot: "bg-amber-300",   border: "border-amber-400",   badge: "bg-amber-100 text-amber-800",       cardBg: "bg-amber-400",   cardSub: "text-white/80" },
  confirmado: { label: "Confirmado", bg: "bg-emerald-500", text: "text-white", dot: "bg-emerald-300", border: "border-emerald-500", badge: "bg-emerald-100 text-emerald-800",   cardBg: "bg-emerald-500", cardSub: "text-white/80" },
  compareceu: { label: "Compareceu", bg: "bg-blue-500",    text: "text-white", dot: "bg-blue-300",    border: "border-blue-500",    badge: "bg-blue-100 text-blue-800",         cardBg: "bg-blue-500",    cardSub: "text-white/80" },
  concluido:  { label: "Concluído",  bg: "bg-slate-400",   text: "text-white", dot: "bg-slate-300",   border: "border-slate-400",   badge: "bg-slate-100 text-slate-600",       cardBg: "bg-slate-400",   cardSub: "text-white/80" },
  cancelado:  { label: "Cancelado",  bg: "bg-red-400",     text: "text-white", dot: "bg-red-300",     border: "border-red-400",     badge: "bg-red-100 text-red-700",           cardBg: "bg-red-400",     cardSub: "text-white/80" },
  faltou:     { label: "Faltou",     bg: "bg-orange-400",  text: "text-white", dot: "bg-orange-300",  border: "border-orange-400",  badge: "bg-orange-100 text-orange-700",     cardBg: "bg-orange-400",  cardSub: "text-white/80" },
  remarcado:  { label: "Remarcado",  bg: "bg-violet-500",  text: "text-white", dot: "bg-violet-300",  border: "border-violet-500",  badge: "bg-violet-100 text-violet-700",     cardBg: "bg-violet-500",  cardSub: "text-white/80" },
};

export const STATUS_FILTER_OPTIONS = [
  { value: "agendado",   label: "Agendado",   color: "#f59e0b" },
  { value: "confirmado", label: "Confirmado",  color: "#10b981" },
  { value: "compareceu", label: "Compareceu",  color: "#3b82f6" },
  { value: "concluido",  label: "Concluído",   color: "#94a3b8" },
  { value: "cancelado",  label: "Cancelado",   color: "#f87171" },
  { value: "faltou",     label: "Faltou",      color: "#fb923c" },
  { value: "remarcado",  label: "Remarcado",   color: "#8b5cf6" },
] as const;

export const DAYS_OF_WEEK = [
  { label: "Dom", value: 0 },
  { label: "Seg", value: 1 },
  { label: "Ter", value: 2 },
  { label: "Qua", value: 3 },
  { label: "Qui", value: 4 },
  { label: "Sex", value: 5 },
  { label: "Sáb", value: 6 },
];

export const WEEK_DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];
