## Design System — Padrões de UI

Convenções visuais estabelecidas e aplicadas nas páginas principais.

### KpiCard (padrão de cartão de KPI)
Todas as páginas usam o mesmo sistema de cards com barra lateral colorida:
- `relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden`
- Barra esquerda: `absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl` com `backgroundColor: accentColor`
- Ícone: `p-2 rounded-xl` com fundo `${accentColor}18` (18% opacidade) e cor do ícone igual ao accent
- Rótulo: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`
- Valor: `text-2xl font-extrabold text-slate-900 tabular-nums`

### Semântica de cores (accentColor)
| Cor | Hex | Uso |
|---|---|---|
| Verde esmeralda | `#10b981` | Receita, positivo, concluído |
| Vermelho | `#ef4444` | Despesas, negativo, cancelado |
| Índigo | `#6366f1` | Lucro, métrica principal |
| Âmbar | `#f59e0b` | Avisos, pendências, faltas |
| Céu | `#0ea5e9` | Agendamentos, info |
| Violeta | `#8b5cf6` | Métricas secundárias |

### Seletor de período (pattern)
```tsx
<div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-200">
  <CalendarDays className="w-4 h-4 text-slate-400" />
  <Select>...</Select>
  <div className="h-4 w-px bg-slate-200" />
  <Select>...</Select>
</div>
```

### Tabelas
- Header: `bg-slate-50/80 border-b border-slate-100`
- Rótulo header: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`
- Linhas: `border-b border-slate-50 hover:bg-slate-50/60`
- Moeda: `tabular-nums font-semibold text-emerald-600`
- Footer: `bg-slate-50 border-t-2 border-slate-200`

### Badges de status de agendamento
```tsx
const STATUS_CONFIG = {
  agendado:  { dot: "bg-blue-400",   text: "text-blue-700",   bg: "bg-blue-50"   },
  confirmado:{ dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50"  },
  concluido: { dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-100" },
  cancelado: { dot: "bg-red-400",    text: "text-red-700",    bg: "bg-red-50"    },
  faltou:    { dot: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
}
```
Formato: `inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full`

### Badges de status financeiro
```tsx
const STATUS_FINANCEIRO = {
  pago:      { dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50" },
  pendente:  { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50"   },
  estornado: { dot: "bg-red-400",     text: "text-red-600",     bg: "bg-red-50"     },
  cancelado: { dot: "bg-slate-300",   text: "text-slate-500",   bg: "bg-slate-50"   },
  // Inadimplente (pendente + dueDate < hoje):
  vencido:   { dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50"     },
  // Badge: "Vencido há Xd" — linha da tabela com bg-red-50/30
}
```

### Estados de carregamento
- **Nunca usar spinners centralizados** (`Loader2`, `animate-spin`)
- Sempre usar skeleton: `animate-pulse` com divs de `bg-slate-100` nas dimensões esperadas
- Skeletons de tabela: simular estrutura de linhas idêntica à tabela real
- Skeletons de KpiCard: dois divs (`h-7 w-28` para valor, `h-3 w-16` para sub)

### Estados vazios
- Container centralizado com ícone em `bg-slate-100 rounded-2xl w-12 h-12`
- Título em `text-sm font-semibold text-slate-500`
- Descrição em `text-xs text-slate-400 mt-1`
- CTA opcional com `Button size="sm" variant="outline" rounded-xl`

### Páginas já redesenhadas
- `financial/index.tsx` — KpiCards, abas pill, tabela de transações com aging, DRE
- `relatorios.tsx` — KpiCards duplos (anual/mensal), charts limpos, tabela de procedimentos
- `dashboard.tsx` — KpiCards, greeting, status badges Tailwind, skeleton loading, booking portal compacto
- `patients/index.tsx` — stats strip com KpiCards, skeleton de lista

---

