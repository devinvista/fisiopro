interface UsageBadgeProps {
  current: number | null | undefined;
  limit: number | null | undefined;
}

/**
 * Pílula compacta "X / Y" para mostrar consumo do plano em itens da sidebar.
 * Cores escalonadas:
 *   < 80%  → cinza neutro
 *   80–99% → âmbar (alerta antecipado)
 *   ≥ 100% → vermelho (limite atingido)
 * Retorna `null` quando o limite é ilimitado (`null`) ou os dados ainda não
 * carregaram, mantendo o layout estável.
 */
export function UsageBadge({ current, limit }: UsageBadgeProps) {
  if (limit == null || current == null) return null;
  const ratio = limit === 0 ? 1 : current / limit;
  const tone =
    ratio >= 1
      ? "bg-rose-500/20 text-rose-200 border-rose-400/30"
      : ratio >= 0.8
      ? "bg-amber-500/20 text-amber-100 border-amber-400/30"
      : "bg-white/10 text-sidebar-foreground/70 border-white/10";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold tabular-nums whitespace-nowrap ${tone}`}
      data-testid={`badge-usage-${ratio >= 1 ? "limit" : ratio >= 0.8 ? "warn" : "ok"}`}
      title={`Uso: ${current} de ${limit}`}
    >
      {current}/{limit}
    </span>
  );
}
