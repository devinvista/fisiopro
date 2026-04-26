# Auditoria de Design Mobile — FisioGest Pro

**Data:** 25/04/2026
**Viewport de referência:** 375 × 812 px (iPhone 12/13/14)
**Escopo:** Todas as páginas e abas autenticadas + páginas públicas
**Método:** Análise estática do código React/Tailwind em `artifacts/fisiogest/src/`

---

## Sumário por severidade

| Severidade | Qtd. | Significado |
|---|---|---|
| 🔴 **CRÍTICO** | 5 | Conteúdo fica inutilizável ou sai da tela |
| 🟠 **ALTO** | 9 | Layout quebra, ações ficam sobrepostas/escondidas |
| 🟡 **MÉDIO** | 9 | Espaços apertados, hierarquia ruim, fricção visual |
| 🟢 **BAIXO** | 3 | Polimento e micro-otimizações |

---

## 🔴 Crítico — corrigir primeiro

### 1. Agenda — visualização semanal ilegível em mobile
**Arquivo:** `pages/clinical/agenda/index.tsx:247`
**Problema:** A grade usa `grid-template-columns: repeat(${nav.daysCount}, 1fr)`. Em modo "Semana" (5–7 dias) cada coluna fica com ~40–60 px no iPhone, deixando horários e nomes de pacientes completamente ilegíveis. Não há `overflow-x-auto` nem fallback para "Dia".
**Recomendação:** Detectar mobile (hook `useIsMobile` ou `md:` breakpoint) e forçar visualização "Dia" abaixo de 768 px. Alternativamente, envolver a grade em `overflow-x-auto` com largura mínima das colunas (~120 px).

### 2. Agenda — sidebar lateral quebra o layout
**Arquivo:** `pages/clinical/agenda/index.tsx:198-206`
**Problema:** `AgendaSidebar` está em um `flex gap-4` lado a lado com a grade principal, sem `hidden lg:block`. Isso empurra a agenda para uma fração ainda menor da tela.
**Recomendação:** `hidden lg:flex` na sidebar, e em mobile mover filtros para um `Sheet`/drawer acionado por botão no header.

### 3. SuperAdmin — tabela de clínicas estoura a tela
**Arquivo:** `pages/saas/superadmin/components/ClinicsTab.tsx:205`
**Problema:** Tabela com 7–8 colunas (CNPJ, Plano, Status, Pagamento, Mensalidade, Vencimento, Ativa) sem wrapper `overflow-x-auto` nem `hidden md:table-cell` em colunas secundárias.
**Recomendação:** Envelopar a `<Table>` em `<div className="w-full overflow-x-auto">` e aplicar `hidden md:table-cell` em CNPJ/Vencimento/Mensalidade. Idealmente, em mobile renderizar uma lista de cards em vez de tabela.

### 4. Dialog "Gerenciar usuários" da clínica — tabela quebra dentro do modal
**Arquivo:** `pages/saas/clinicas/index.tsx:470-510`
**Problema:** Tabela dentro do `Dialog`. A coluna "Perfis" (badges) empurra a largura além do que o modal mobile suporta.
**Recomendação:** Wrapper com `overflow-x-auto`, ou substituir tabela por lista vertical em mobile (`hidden md:block` na tabela + `block md:hidden` numa lista de cards).

### 5. Disponibilidade do profissional — botões de dias quebram em duas linhas mal alinhadas
**Arquivo:** `pages/settings/configuracoes/components/AgendasSection.tsx:381`
**Problema:** `flex gap-2 flex-wrap` para os 7 dias da semana. Em 375 px, normalmente cabem 5 botões + 2 sobram numa segunda linha torta.
**Recomendação:** Usar `grid grid-cols-7 gap-1` (botões compactos "S T Q Q S S D") ou `grid-cols-4 sm:grid-cols-7`.

---

## 🟠 Alto — bloqueia fluxos importantes

### 6. Dashboard — KPIs estouram com valores grandes
**Arquivo:** `pages/dashboard.tsx:285`
**Problema:** `grid-cols-2 gap-3` com `formatCurrency` retornando "R$ 10.000,00" — o texto quebra ou trunca de forma feia em ~170 px.
**Recomendação:** `grid-cols-1 xs:grid-cols-2` ou reduzir `text-2xl → text-lg` em mobile. Considerar `tabular-nums` e `truncate`.

### 7. Banner de agendamento online — botões empilhados
**Arquivo:** `pages/dashboard.tsx:351`
**Problema:** URL longa + botões "Copiar" e "Abrir" dentro de `flex-wrap` consomem 3 linhas verticais.
**Recomendação:** Em mobile, esconder a URL atrás de um único botão "Copiar link" full-width.

### 8. Aba "Anamnese" — barra de salvar colide com a bottom nav
**Arquivo:** `pages/clinical/patients/patient-detail/tabs/AnamnesisTab.tsx:172`
**Problema:** `sticky bottom-0` sem ajuste para a `BottomNav` (64 px + safe-area). Resultado: dois rodapés sobrepostos, reduzindo a área de leitura.
**Recomendação:** `bottom-16 lg:bottom-0` na barra de salvar (ou esconder a bottom nav nas páginas de detalhe via contexto).

### 9. Detalhe do paciente — tabs não rolam horizontalmente
**Arquivo:** `pages/clinical/patients/[id].tsx`
**Problema:** São 10+ abas (jornada, anamnese, evoluções, atestados, financeiro, etc.). O `TabsList` padrão do shadcn não tem scroll horizontal.
**Recomendação:** Wrapper `overflow-x-auto` no `TabsList` + `whitespace-nowrap` nos triggers, ou converter para `Select` em mobile (`hidden md:block` no TabsList + `block md:hidden` no Select).

### 10. Financeiro — header com mês/ano apertado
**Arquivo:** `pages/financial/index.tsx:33-54`
**Problema:** Título "Controle Financeiro", ícone, select de mês e select de ano em uma única `flex` row. Em 375 px fica todo espremido.
**Recomendação:** `flex-col sm:flex-row` no container principal, e `flex-1` nos selects para ocuparem largura igual em mobile.

### 11. Relatórios — KPIs em duas colunas com valores grandes
**Arquivo:** `pages/financial/relatorios.tsx:142, 182`
**Problema:** Mesmo padrão do dashboard: `grid-cols-2` com moedas longas.
**Recomendação:** `grid-cols-1 xs:grid-cols-2` ou reduzir tipografia em mobile.

### 12. Relatórios — gráficos com 12 meses ilegíveis
**Arquivo:** `pages/financial/relatorios.tsx:246`
**Problema:** Recharts com `XAxis` mostrando 12 rótulos sobre ~340 px de largura. Os labels viram um borrão.
**Recomendação:** Usar `interval="preserveStartEnd"` ou rótulos abreviados (`"jan", "fev"`) em mobile; alternativamente, scroll horizontal com `min-w-[640px]` no container do gráfico.

### 13. Catálogo — botões de ação invisíveis em mobile
**Arquivo:** `pages/catalog/procedimentos/components/ListView.tsx:149`
**Problema:** `opacity-0 group-hover:opacity-100` nos botões editar/excluir/custos. iPhone não tem hover → botões ficam permanentemente invisíveis.
**Recomendação:** `opacity-100 lg:opacity-0 lg:group-hover:opacity-100` ou trocar por menu de 3 pontos (`DropdownMenu`).

### 14. Modal de pacote — teclado empurra ações para fora
**Arquivo:** `pages/catalog/pacotes/PackageFormModal.tsx:67, 111`
**Problema:** `max-h-[92dvh]` com várias seções; quando o teclado abre para digitar nome, os botões "Salvar/Cancelar" no rodapé saem da tela.
**Recomendação:** `DialogContent` com `flex flex-col` + corpo `flex-1 overflow-y-auto` + footer fixo dentro do dialog. Considerar usar `Drawer` (vaul) em mobile no lugar de Dialog.

---

## 🟡 Médio — fricção e estética

### 15. Bottom nav — alvos de toque apertados com 5 itens
**Arquivo:** `components/layout/app-layout.tsx:434-443`
**Problema:** Sem `min-w-[60px]` nos itens, os 5 botões dividem ~75 px cada. Aceitável, mas próximo do limite (44 px para alvos confortáveis).
**Recomendação:** `min-h-[56px]` e ícones de `20px` com label `text-[10px]` para garantir leitura.

### 16. Header mobile — título da clínica trunca/conflita com data
**Arquivo:** `components/layout/app-layout.tsx:508-541`
**Problema:** Header com `MenuTrigger + título + data`. Nomes de clínica longos colidem com a data.
**Recomendação:** `hidden md:flex` na data (já está); garantir `truncate min-w-0 flex-1` no título.

### 17. Lista de pacientes — colunas apertadas entre 400–640 px
**Arquivo:** `pages/clinical/patients/index.tsx:348`
**Problema:** Salto de `grid-cols-[1fr_36px]` para `sm:grid-cols-[1fr_140px_36px]` aos 640 px. Em iPhones largos (Plus/Pro Max), entra a coluna de 140 px sem espaço.
**Recomendação:** Quebra em `md:` (768 px) em vez de `sm:`.

### 18. Formulário de criar paciente — campos lado-a-lado
**Arquivo:** `pages/clinical/patients/index.tsx:563`
**Problema:** `grid-cols-2` para Telefone + CPF + Email etc. Cada coluna fica com ~150 px.
**Recomendação:** `grid-cols-1 sm:grid-cols-2`.

### 19. Tabs do financeiro — scroll horizontal sem indicação visual
**Arquivo:** `pages/financial/index.tsx:60`
**Problema:** `overflow-x-auto` está correto, mas usuário não percebe que pode rolar.
**Recomendação:** Adicionar fade/sombra na borda direita (`bg-gradient-to-l from-background`) ou reduzir tamanho da fonte das tabs em mobile.

### 20. Agendar (público) — grade de horários com 4 colunas apertadas
**Arquivo:** `pages/clinical/agendar/components/StepDataHora.tsx:230`
**Problema:** `grid-cols-4 sm:grid-cols-6 gap-2` deixa cada slot com ~80 px. Texto "08:00" com `font-semibold` pode encostar nas bordas.
**Recomendação:** `grid-cols-3 sm:grid-cols-4 md:grid-cols-6`.

### 21. Login — badge "CPF/E-MAIL" sobreposto ao texto
**Arquivo:** `pages/auth/login.tsx:112`
**Problema:** Badge `absolute right-3` com `pr-16`. Em emails longos no iPhone SE (375 px), o texto escorrega por baixo do badge.
**Recomendação:** Aumentar `pr-20` ou colocar o label acima do input em mobile.

### 22. Configurações — cards de tipo de estabelecimento muito altos
**Arquivo:** `pages/settings/configuracoes/components/ClinicaSection.tsx:210`
**Problema:** `grid-cols-1 sm:grid-cols-2` com cards bulky ocupa quase a tela toda no iPhone.
**Recomendação:** Reduzir padding (`p-3` em mobile) e tipografia, ou usar lista compacta com radio.

### 23. Cadastro — seleção de perfil com descrições longas
**Arquivo:** `pages/auth/register.tsx:294`
**Problema:** `grid-cols-2` com descrições longas vira botões altos e estreitos.
**Recomendação:** `grid-cols-1 sm:grid-cols-2`.

---

## 🟢 Baixo — polimento

### 24. Landing — mockup do dashboard apertado
**Arquivo:** `components/landing/HeroSection.tsx:55, 106`
**Problema:** Mini-stats em 3 colunas dentro do mockup ficam pequenos no iPhone.
**Recomendação:** `overflow-x-auto` no container do mockup ou esconder mini-stats em `<sm`.

### 25. Detalhe do paciente — sidebar com 2 colunas de stats
**Arquivo:** `pages/clinical/patients/[id].tsx:509`
**Problema:** "Consultas" + "Total Gasto" lado a lado encolhem com valores altos.
**Recomendação:** `grid-cols-1 xs:grid-cols-2`.

### 26. Cadastro — preço com risco e desconto lado a lado
**Arquivo:** `pages/auth/register.tsx:197-217`
**Problema:** `text-right` com preço riscado + desconto pode quebrar em duas linhas em mobile.
**Recomendação:** Empilhar verticalmente em `<sm`.

---

## Padrões recomendados (correções globais)

Aplicar em toda a base — economiza tempo a longo prazo:

1. **Wrapper para tabelas:** criar um componente `<ResponsiveTable>` que já vem com `overflow-x-auto` e padrão de "vira lista no mobile".
2. **Hook `useIsMobile`:** já existe (`hooks/use-mobile.tsx`?). Padronizar uso para troca de visualização (Agenda, tabelas, dialogs ↔ drawers).
3. **Padding de scroll:** garantir `pb-24 lg:pb-8` em todos os containers principais para não esconder conteúdo atrás da bottom nav.
4. **Sticky bars:** todo `sticky bottom-0` precisa de `bottom-16 lg:bottom-0` para empilhar acima da bottom nav.
5. **Dialogs longos:** estrutura `flex flex-col h-full` + corpo `flex-1 overflow-y-auto` + footer fixo, para que o teclado virtual não esconda os botões.
6. **Hover-only:** substituir todo `opacity-0 group-hover:opacity-100` por `DropdownMenu` de 3 pontos visível por padrão em mobile.
7. **Tabs com 4+ itens:** envolver `TabsList` em `overflow-x-auto whitespace-nowrap` ou virar `Select` em `<md`.
8. **Moedas em KPIs:** classes `text-lg sm:text-2xl tabular-nums truncate` para evitar quebra.

---

## Próximos passos sugeridos

1. **Prioridade 1 (1–2 dias):** Itens 🔴 críticos 1, 2, 3, 5 — Agenda + tabelas SuperAdmin.
2. **Prioridade 2 (2–3 dias):** Itens 🟠 6, 8, 9, 13, 14 — KPIs, sticky bars colidindo, tabs do paciente, ações invisíveis no catálogo, modal com teclado.
3. **Prioridade 3 (cosmético):** Demais itens conforme oportunidade.

---

## Atualização — Correções aplicadas (rodada 3 — 26/04/2026)

Fechamento dos itens pendentes restantes do audit:

* **#3 SuperAdmin — tabela de clínicas** (`pages/saas/superadmin/components/ClinicsTab.tsx`): adicionada lista de cards `sm:hidden` (Clínica + e-mail + CNPJ no topo, badges de plano/status/pagamento na linha do meio, vencimento + valor no rodapé). Tabela permanece como `hidden sm:block`.
* **#7 Banner de agendamento online** (`pages/dashboard.tsx:354`): container vira `flex-col sm:flex-row`; em mobile os botões "Copiar" e "Abrir" ocupam largura total (`flex-1 sm:flex-none`).
* **#17 Lista de pacientes — colunas** (`pages/clinical/patients/index.tsx:354`): breakpoint da coluna de 140 px movido de `sm:` para `md:`.
* **#19 Tabs do financeiro — fade** (`pages/financial/index.tsx:62`): wrapper `relative`, scroll interno com scrollbar oculta + `pr-6`, gradiente `bg-gradient-to-l from-background` na borda direita visível só em `<sm`.
* **#22 Cards de tipo de estabelecimento** (`pages/settings/configuracoes/components/ClinicaSection.tsx:213`): em mobile vira layout horizontal compacto (`flex-row sm:flex-col`), padding reduzido (`p-3 sm:p-4`), ícone menor (`h-5 w-5 sm:h-6 sm:w-6`).
* **#24 Mockup do dashboard na landing** (`components/landing/HeroSection.tsx:55`): mini-stats agora `grid-cols-2 sm:grid-cols-3`, terceiro card "Hoje" oculto em `<sm` para evitar aperto.

Itens reavaliados que **já estavam corrigidos** (apesar do audit original):
* **#6 e #11** — `KpiCard` já usa `text-lg sm:text-2xl tabular-nums break-words`, exatamente a recomendação.
* **#13** — `ListView` do catálogo já usa `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`.
* **#14** — `PackageFormModal` já tem `flex flex-col` + body `flex-1 overflow-y-auto` + footer `shrink-0`.
* **#18** — Form de novo paciente já usa `grid-cols-1 sm:grid-cols-2`.
* **#20** — Slots de horário já usam `grid-cols-3 sm:grid-cols-4 md:grid-cols-6`.
* **#21** — Login já tem `pr-20` no input com badge.
* **#26** — Preço com risco usa `<span>` inline + `<span class="block">` discount, já empilhando.

**Resultado final:** 26/26 itens do audit endereçados.

---

## Atualização — Correções aplicadas (rodada 2)

Padrões idênticos aos das telas Agenda/Histórico foram corrigidos em outras
páginas/abas:

### Padrão A — Sticky header + scroll aninhado
* **Agenda (corrigido):** `pages/clinical/agenda/index.tsx` — `WeekHeader` e
  grid agora compartilham um único container `overflow-auto`, com `sticky
  top-0` no cabeçalho.
* Auditoria do restante dos modais/listas: nenhuma outra ocorrência detectada
  (modais usam um único container de scroll).

### Padrão B — Cards/linhas com `shrink-0` espremendo o texto
* **HistoryTab (corrigido):** ações empilham com `flex-col sm:flex-row` e
  `flex-wrap` nos botões.
* **FinancialTab — cartões de lançamentos
  (`tabs/FinancialTab.tsx:279-321`):** reorganização da linha — descrição,
  valor e botão de estorno agora dividem a linha do topo do cartão; chips
  (categoria/status/data/forma de pagamento) caem para a linha de baixo com
  `flex-wrap`. Botão de estorno passa a ser visível por padrão no mobile
  (antes só aparecia em hover).
* **EvaluationsTab — linha da avaliação
  (`tabs/EvaluationsTab.tsx:342-381`):** badge "EVA n" exibida como pill grande
  apenas em ≥ sm; em < sm é renderizada como pequeno badge numérico junto dos
  ícones de ação (`hidden sm:flex` / `sm:hidden`). Padding reduzido (`p-3
  sm:p-4`), título/data com `truncate`, ícone do chevron com `ml-0.5`.
* **BlockedSlotModal — linha de bloqueio
  (`agenda/components/BlockedSlotModal.tsx:376-399`):** linha agora alinha
  por `items-start`, conteúdo principal usa `flex-wrap`. O motivo
  (`b.reason`) ocupa toda a linha em mobile (`basis-full sm:basis-auto
  sm:flex-1`) com `break-words`. Hora e ícone permanecem juntos com
  `whitespace-nowrap`.
