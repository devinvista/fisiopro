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
  agendado:   { label: "Agendado",   bg: "bg-blue-500",    text: "text-white", dot: "bg-blue-500",    border: "border-blue-600",    badge: "bg-blue-100 text-blue-700",         cardBg: "bg-blue-500",    cardSub: "text-white/70" },
  confirmado: { label: "Confirmado", bg: "bg-emerald-500", text: "text-white", dot: "bg-emerald-500", border: "border-emerald-600", badge: "bg-emerald-100 text-emerald-700",   cardBg: "bg-emerald-500", cardSub: "text-white/70" },
  compareceu: { label: "Compareceu", bg: "bg-teal-500",    text: "text-white", dot: "bg-teal-500",    border: "border-teal-600",    badge: "bg-teal-100 text-teal-700",         cardBg: "bg-teal-500",    cardSub: "text-white/70" },
  concluido:  { label: "Concluído",  bg: "bg-slate-400",   text: "text-white", dot: "bg-slate-400",   border: "border-slate-500",   badge: "bg-slate-100 text-slate-600",       cardBg: "bg-slate-400",   cardSub: "text-white/70" },
  cancelado:  { label: "Cancelado",  bg: "bg-red-400",     text: "text-white", dot: "bg-red-400",     border: "border-red-500",     badge: "bg-red-100 text-red-700",           cardBg: "bg-red-400",     cardSub: "text-white/70" },
  faltou:     { label: "Faltou",     bg: "bg-orange-400",  text: "text-white", dot: "bg-orange-400",  border: "border-orange-500",  badge: "bg-orange-100 text-orange-700",     cardBg: "bg-orange-400",  cardSub: "text-white/70" },
  remarcado:  { label: "Remarcado",  bg: "bg-purple-400",  text: "text-white", dot: "bg-purple-400",  border: "border-purple-500",  badge: "bg-purple-100 text-purple-700",     cardBg: "bg-purple-400",  cardSub: "text-white/70" },
};

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
