import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

/**
 * Helpers de formatação compartilhados pelos sub-componentes da página de
 * detalhe do paciente. Mantemos aqui o que é trivial, sem efeitos colaterais
 * e usado em mais de um arquivo.
 */

export function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string) {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Versão BRL que aceita null/undefined retornando "—". */
export function fmtCur(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(v));
}

/** Retorna a data atual em fuso horário BRT como objeto Date. */
export function todayBRTDate(): Date {
  return parseISO(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );
}

export const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  agendado: {
    label: "Agendado",
    color: "bg-blue-100 text-blue-700",
    icon: <Clock className="w-3 h-3" />,
  },
  confirmado: {
    label: "Confirmado",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  compareceu: {
    label: "Compareceu",
    color: "bg-teal-100 text-teal-700",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  concluido: {
    label: "Concluído",
    color: "bg-slate-100 text-slate-700",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  cancelado: {
    label: "Cancelado",
    color: "bg-red-100 text-red-700",
    icon: <XCircle className="w-3 h-3" />,
  },
  faltou: {
    label: "Faltou",
    color: "bg-orange-100 text-orange-700",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  remarcado: {
    label: "Remarcado",
    color: "bg-purple-100 text-purple-700",
    icon: <RefreshCw className="w-3 h-3" />,
  },
};

export function InfoBlock({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
