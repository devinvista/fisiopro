import { LayoutDashboard, Package, CreditCard, Building2, Receipt, Tag, Zap, Sparkles, Crown, AlertTriangle, ListChecks } from "lucide-react";
import { API_BASE } from "@/lib/api";

export const BASE = import.meta.env.BASE_URL ?? "/";
export { API_BASE };
export const api = (path: string) => `${API_BASE}/api${path}`;

export const TABS = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "planos", label: "Planos", icon: Package },
  { id: "matriz", label: "Matriz", icon: ListChecks },
  { id: "assinaturas", label: "Assinaturas", icon: CreditCard },
  { id: "clinicas", label: "Clínicas", icon: Building2 },
  { id: "pagamentos", label: "Pagamentos", icon: Receipt },
  { id: "inadimplencia", label: "Inadimplência", icon: AlertTriangle },
  { id: "cupons", label: "Cupons", icon: Tag },
] as const;

export type TabId = (typeof TABS)[number]["id"];

// ─── Tier config ─────────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<string, {
  color: string; bg: string; border: string; gradient: string;
  icon: React.ElementType; badge: string; badgeBg: string;
}> = {
  essencial: {
    color: "#3b82f6", bg: "bg-blue-50", border: "border-blue-200",
    gradient: "from-blue-500 to-blue-600",
    icon: Zap, badge: "text-blue-700", badgeBg: "bg-blue-100",
  },
  profissional: {
    color: "#8b5cf6", bg: "bg-violet-50", border: "border-violet-200",
    gradient: "from-violet-500 to-violet-600",
    icon: Sparkles, badge: "text-violet-700", badgeBg: "bg-violet-100",
  },
  premium: {
    color: "#f59e0b", bg: "bg-amber-50", border: "border-amber-200",
    gradient: "from-amber-400 to-amber-500",
    icon: Crown, badge: "text-amber-700", badgeBg: "bg-amber-100",
  },
};

export function getTierConfig(name: string) {
  return TIER_CONFIG[name] ?? {
    color: "#6366f1", bg: "bg-indigo-50", border: "border-indigo-200",
    gradient: "from-indigo-500 to-indigo-600",
    icon: Package, badge: "text-indigo-700", badgeBg: "bg-indigo-100",
  };
}

// ─── Status / Payment badges ──────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  trial:     { label: "Trial",     color: "text-blue-700",   bg: "bg-blue-50",   dot: "bg-blue-400"   },
  active:    { label: "Ativo",     color: "text-green-700",  bg: "bg-green-50",  dot: "bg-green-500"  },
  suspended: { label: "Suspenso",  color: "text-amber-700",  bg: "bg-amber-50",  dot: "bg-amber-400"  },
  cancelled: { label: "Cancelado", color: "text-red-700",    bg: "bg-red-50",    dot: "bg-red-400"    },
};

export const PAYMENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-50" },
  paid:    { label: "Pago",     color: "text-green-700", bg: "bg-green-50" },
  overdue: { label: "Vencido",  color: "text-red-700",   bg: "bg-red-50"   },
  free:    { label: "Grátis",   color: "text-slate-700", bg: "bg-slate-100" },
};
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  manual: "Manual",
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  boleto: "Boleto",
  transfer: "Transferência",
  other: "Outro",
};

export type PaymentRow = {
  payment: {
    id: number;
    clinicId: number;
    subscriptionId: number | null;
    amount: string;
    method: string;
    referenceMonth: string | null;
    paidAt: string;
    notes: string | null;
    recordedBy: number | null;
    createdAt: string;
  };
  clinic: { id: number; name: string; email: string } | null;
  recorder: { id: number; name: string } | null;
  plan: { id: number; displayName: string } | null;
};

export type PaymentStats = {
  totalAllTime: number;
  totalThisMonth: number;
  totalPayments: number;
  referenceMonth: string;
};


