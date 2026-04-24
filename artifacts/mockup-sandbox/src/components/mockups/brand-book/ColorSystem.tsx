import "./_group.css";

const TEAL = "hsl(180, 100%, 25%)";
const TEAL_DARK = "hsl(183, 50%, 9%)";

type Shade = { step: number; hex: string; oklch: string; onLight: "AA" | "AAA" | "fail"; onDark: "AA" | "AAA" | "fail" };

const tealRamp: Shade[] = [
  { step: 50,  hex: "#E6F7F7", oklch: "oklch(96% 0.018 195)", onLight: "fail", onDark: "AAA" },
  { step: 100, hex: "#C7EBEB", oklch: "oklch(91% 0.035 195)", onLight: "fail", onDark: "AAA" },
  { step: 200, hex: "#9DD9D9", oklch: "oklch(83% 0.060 195)", onLight: "fail", onDark: "AAA" },
  { step: 300, hex: "#6FC4C4", oklch: "oklch(75% 0.085 195)", onLight: "fail", onDark: "AAA" },
  { step: 400, hex: "#3FA8A8", oklch: "oklch(66% 0.105 195)", onLight: "fail", onDark: "AA" },
  { step: 500, hex: "#1E8A8A", oklch: "oklch(57% 0.110 195)", onLight: "AA", onDark: "AA" },
  { step: 600, hex: "#008080", oklch: "oklch(52% 0.115 195)", onLight: "AA", onDark: "fail" },
  { step: 700, hex: "#006464", oklch: "oklch(43% 0.095 195)", onLight: "AAA", onDark: "fail" },
  { step: 800, hex: "#024F4F", oklch: "oklch(36% 0.075 195)", onLight: "AAA", onDark: "fail" },
  { step: 900, hex: "#0B3838", oklch: "oklch(28% 0.055 195)", onLight: "AAA", onDark: "fail" },
];

const sidebarRamp: Shade[] = [
  { step: 50,  hex: "#E8EDED", oklch: "oklch(94% 0.008 195)", onLight: "fail", onDark: "AAA" },
  { step: 100, hex: "#C9D2D2", oklch: "oklch(86% 0.012 195)", onLight: "fail", onDark: "AAA" },
  { step: 200, hex: "#9AAAAA", oklch: "oklch(71% 0.018 195)", onLight: "fail", onDark: "AAA" },
  { step: 300, hex: "#697C7C", oklch: "oklch(56% 0.020 195)", onLight: "AA", onDark: "AA" },
  { step: 400, hex: "#445858", oklch: "oklch(43% 0.020 195)", onLight: "AAA", onDark: "fail" },
  { step: 500, hex: "#2A3D3D", oklch: "oklch(33% 0.020 195)", onLight: "AAA", onDark: "fail" },
  { step: 600, hex: "#1F2F2F", oklch: "oklch(27% 0.022 195)", onLight: "AAA", onDark: "fail" },
  { step: 700, hex: "#172525", oklch: "oklch(22% 0.024 195)", onLight: "AAA", onDark: "fail" },
  { step: 800, hex: "#10191A", oklch: "oklch(17% 0.024 195)", onLight: "AAA", onDark: "fail" },
  { step: 900, hex: "#0B1314", oklch: "oklch(13% 0.022 195)", onLight: "AAA", onDark: "fail" },
];

const neutralRamp = [
  { step: 50,  hex: "#F8FAFC" },
  { step: 100, hex: "#F1F5F9" },
  { step: 200, hex: "#E2E8F0" },
  { step: 300, hex: "#CBD5E1" },
  { step: 400, hex: "#94A3B8" },
  { step: 500, hex: "#64748B" },
  { step: 600, hex: "#475569" },
  { step: 700, hex: "#334155" },
  { step: 800, hex: "#1E293B" },
  { step: 900, hex: "#0F172A" },
];

const semanticPalette = [
  { name: "Sucesso", role: "Confirmação, evolução positiva, pagamento ok", hex: "#16A34A", hsl: "hsl(150, 60%, 38%)", bg: "hsl(150, 60%, 95%)", fg: "hsl(150, 60%, 25%)" },
  { name: "Atenção", role: "Pendência, lembrete, ação necessária", hex: "#F59E0B", hsl: "hsl(38, 92%, 50%)", bg: "hsl(48, 100%, 95%)", fg: "hsl(35, 80%, 30%)" },
  { name: "Erro", role: "Cancelamento, falha, alerta crítico", hex: "#DC2626", hsl: "hsl(0, 75%, 50%)", bg: "hsl(0, 80%, 96%)", fg: "hsl(0, 75%, 35%)" },
  { name: "Informação", role: "Dicas, novidades, banners", hex: "#0284C7", hsl: "hsl(199, 89%, 48%)", bg: "hsl(204, 100%, 95%)", fg: "hsl(204, 80%, 30%)" },
];

const chartPalette = [
  { name: "Brand", hex: "#008080", hsl: "180, 100%, 25%" },
  { name: "Ocean", hex: "#1E6BD8", hsl: "215, 75%, 48%" },
  { name: "Mint", hex: "#16A34A", hsl: "150, 60%, 38%" },
  { name: "Amber", hex: "#F59E0B", hsl: "38, 92%, 50%" },
  { name: "Coral", hex: "#EF4444", hsl: "0, 75%, 50%" },
  { name: "Plum", hex: "#9333EA", hsl: "270, 75%, 55%" },
];

function Ramp({ title, shades }: { title: string; shades: Shade[] | typeof neutralRamp }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>{title}</h3>
      <div className="rounded-2xl overflow-hidden border border-slate-200">
        {shades.map((s, i) => {
          const isLight = s.step <= 300;
          return (
            <div key={s.step} className="grid grid-cols-12 items-center px-4 h-12" style={{ backgroundColor: s.hex, borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.04)" }}>
              <span className="col-span-2 font-mono text-xs font-bold" style={{ color: isLight ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.85)" }}>
                {title.split(" ")[0].toLowerCase()}-{s.step}
              </span>
              <span className="col-span-3 font-mono text-xs" style={{ color: isLight ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)" }}>{s.hex}</span>
              {"oklch" in s && (
                <span className="col-span-5 font-mono text-[11px]" style={{ color: isLight ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.65)" }}>{(s as Shade).oklch}</span>
              )}
              {"onLight" in s && (
                <div className="col-span-2 flex justify-end gap-1">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${badgeClass((s as Shade).onLight)}`}>L · {(s as Shade).onLight}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function badgeClass(rating: "AA" | "AAA" | "fail") {
  if (rating === "AAA") return "bg-emerald-500/90 text-white";
  if (rating === "AA") return "bg-emerald-300/90 text-emerald-950";
  return "bg-rose-400/90 text-rose-950";
}

function TokenBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[hsl(222,47%,11%)] text-slate-300 overflow-hidden border border-slate-800">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">{title}</span>
        <span className="text-[10px] font-mono text-slate-600">copy</span>
      </div>
      <pre className="px-5 py-4 text-xs font-mono leading-relaxed overflow-auto whitespace-pre">{children}</pre>
    </div>
  );
}

export function ColorSystem() {
  return (
    <div className="min-h-screen w-full bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] font-sans antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-12 py-12">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(180,100%,25%)]">Cor & Tipografia</p>
            <p className="text-xs font-mono text-slate-400">Brand Book v1.0 · Board 1 / 4</p>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Sistema cromático & tipográfico
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Escala completa de cores em OKLCH (perceptualmente uniforme), modos claro e escuro, paleta semântica e tokens prontos para CSS e Tailwind.
          </p>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-12 py-16 space-y-20">
        {/* Ramps */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Escalas (50 → 900)</h2>
            <span className="text-sm text-slate-400">passos de luminosidade lineares em OKLCH</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Ramp title="Teal Brand" shades={tealRamp} />
            <Ramp title="Sidebar" shades={sidebarRamp} />
            <Ramp title="Neutral" shades={neutralRamp as any} />
          </div>
        </section>

        {/* Semantic */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Paleta semântica</h2>
            <span className="text-sm text-slate-400">estados de UI, feedback ao usuário</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {semanticPalette.map((s) => (
              <div key={s.name} className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <div className="h-24 flex items-end p-4" style={{ backgroundColor: s.hex }}>
                  <span className="font-mono text-xs text-white/90">{s.hex}</span>
                </div>
                <div className="p-5">
                  <h4 className="font-bold text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>{s.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-3 leading-relaxed">{s.role}</p>
                  <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>
                    Texto sobre fundo claro
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Charts */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Paleta de gráficos</h2>
            <span className="text-sm text-slate-400">ordem de aplicação em dashboards e relatórios</span>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-8">
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {chartPalette.map((c, i) => (
                <div key={c.name} className="flex flex-col gap-2">
                  <div className="h-20 rounded-xl flex items-end p-3" style={{ backgroundColor: c.hex }}>
                    <span className="text-xs font-mono font-bold text-white/90">{i + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-[11px] font-mono text-slate-400">{c.hex}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Mini chart preview */}
            <div className="rounded-2xl bg-[hsl(210,40%,98%)] p-6">
              <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-4">Exemplo · barras empilhadas</p>
              <div className="flex items-end gap-3 h-32">
                {[
                  [40, 25, 18, 30, 12],
                  [55, 30, 22, 25, 18],
                  [38, 40, 28, 20, 15],
                  [62, 35, 30, 28, 20],
                  [48, 28, 25, 22, 16],
                  [70, 42, 32, 30, 22],
                  [58, 38, 28, 26, 18],
                ].map((bar, idx) => (
                  <div key={idx} className="flex-1 flex flex-col-reverse gap-0.5">
                    {bar.map((h, i) => (
                      <div key={i} style={{ height: h, backgroundColor: chartPalette[i].hex, opacity: 0.85 }} className={i === 0 ? "rounded-b" : i === bar.length - 1 ? "rounded-t" : ""} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Modes */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Modo claro & escuro</h2>
            <span className="text-sm text-slate-400">tokens base por modo</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Light */}
            <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Light mode</span>
                <span className="text-xs font-mono text-slate-400">default</span>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { token: "background", val: "hsl(210, 40%, 98%)", swatch: "#F8FAFD" },
                  { token: "foreground", val: "hsl(222, 47%, 11%)", swatch: "#0F172A" },
                  { token: "card", val: "hsl(0, 0%, 100%)", swatch: "#FFFFFF" },
                  { token: "border", val: "hsl(214, 32%, 91%)", swatch: "#E2E8F0" },
                  { token: "primary", val: "hsl(180, 100%, 25%)", swatch: "#008080" },
                  { token: "accent", val: "hsl(180, 40%, 91%)", swatch: "#DCF2F2" },
                ].map((t) => (
                  <div key={t.token} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg border border-slate-200" style={{ backgroundColor: t.swatch }} />
                    <span className="font-mono text-xs font-semibold text-slate-700 w-28">--{t.token}</span>
                    <span className="font-mono text-xs text-slate-500">{t.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dark */}
            <div className="rounded-3xl border border-slate-800 overflow-hidden" style={{ backgroundColor: "hsl(195, 25%, 10%)" }}>
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>Dark mode</span>
                <span className="text-xs font-mono text-slate-500">prefers-color-scheme</span>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { token: "background", val: "oklch(15% 0.012 195)", swatch: "#0F1A1B" },
                  { token: "foreground", val: "oklch(96% 0.008 195)", swatch: "#EEF4F4" },
                  { token: "card", val: "oklch(20% 0.015 195)", swatch: "#162425" },
                  { token: "border", val: "oklch(28% 0.018 195)", swatch: "#243435" },
                  { token: "primary", val: "oklch(72% 0.105 195)", swatch: "#5DC1C1" },
                  { token: "accent", val: "oklch(30% 0.045 195)", swatch: "#1F3D3E" },
                ].map((t) => (
                  <div key={t.token} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg border border-slate-700" style={{ backgroundColor: t.swatch }} />
                    <span className="font-mono text-xs font-semibold text-slate-300 w-28">--{t.token}</span>
                    <span className="font-mono text-xs text-slate-500">{t.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Type system */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Sistema tipográfico</h2>
            <span className="text-sm text-slate-400">Outfit (display) + Inter (UI/texto)</span>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-10 space-y-10">
            <div className="space-y-6">
              <div className="grid grid-cols-12 gap-6 items-baseline pb-3 border-b border-slate-200">
                <span className="col-span-2 text-[11px] font-mono uppercase tracking-widest text-slate-400">scale</span>
                <span className="col-span-2 text-[11px] font-mono uppercase tracking-widest text-slate-400">size / line</span>
                <span className="col-span-2 text-[11px] font-mono uppercase tracking-widest text-slate-400">weight</span>
                <span className="col-span-6 text-[11px] font-mono uppercase tracking-widest text-slate-400">specimen</span>
              </div>
              {[
                { scale: "Display", size: "60 / 64", weight: "800", text: "Cuide do paciente.", family: "Outfit", style: { fontSize: 60, lineHeight: "64px", fontWeight: 800, fontFamily: "Outfit", letterSpacing: "-0.02em" } },
                { scale: "H1", size: "40 / 44", weight: "700", text: "Evolução clínica em tempo real", family: "Outfit", style: { fontSize: 40, lineHeight: "44px", fontWeight: 700, fontFamily: "Outfit", letterSpacing: "-0.015em" } },
                { scale: "H2", size: "30 / 36", weight: "700", text: "Resumo financeiro do mês", family: "Outfit", style: { fontSize: 30, lineHeight: "36px", fontWeight: 700, fontFamily: "Outfit" } },
                { scale: "H3", size: "22 / 28", weight: "600", text: "Plano terapêutico ativo", family: "Outfit", style: { fontSize: 22, lineHeight: "28px", fontWeight: 600, fontFamily: "Outfit" } },
                { scale: "Body L", size: "18 / 28", weight: "400", text: "Paciente apresenta evolução positiva na amplitude de movimento do ombro direito.", family: "Inter", style: { fontSize: 18, lineHeight: "28px", fontWeight: 400, fontFamily: "Inter" } },
                { scale: "Body", size: "16 / 24", weight: "400", text: "Próxima sessão agendada para quinta-feira às 14h30 com Dra. Helena Costa.", family: "Inter", style: { fontSize: 16, lineHeight: "24px", fontWeight: 400, fontFamily: "Inter" } },
                { scale: "Small", size: "14 / 20", weight: "500", text: "Última atualização há 3 minutos · sincronizado", family: "Inter", style: { fontSize: 14, lineHeight: "20px", fontWeight: 500, fontFamily: "Inter" } },
                { scale: "Caption", size: "12 / 16", weight: "600", text: "CONFIRMADO · 09:00", family: "Inter", style: { fontSize: 12, lineHeight: "16px", fontWeight: 600, fontFamily: "Inter", letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "hsl(180, 100%, 25%)" } },
              ].map((row) => (
                <div key={row.scale} className="grid grid-cols-12 gap-6 items-baseline">
                  <span className="col-span-2 text-sm font-semibold text-slate-900">{row.scale}</span>
                  <span className="col-span-2 text-xs font-mono text-slate-500">{row.size}</span>
                  <span className="col-span-2 text-xs font-mono text-slate-500">{row.family} {row.weight}</span>
                  <div className="col-span-6 text-slate-900" style={row.style}>{row.text}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-slate-200">
              <div className="rounded-2xl bg-[hsl(210,40%,98%)] p-6">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Outfit (display)</p>
                <p className="text-5xl font-extrabold mb-2" style={{ fontFamily: "Outfit" }}>Aa</p>
                <p className="text-sm text-slate-600">Pesos: 500, 600, 700, 800</p>
                <p className="text-xs text-slate-500 mt-1">Headings, números KPI, marca.</p>
              </div>
              <div className="rounded-2xl bg-[hsl(210,40%,98%)] p-6">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Inter (body & UI)</p>
                <p className="text-5xl font-bold mb-2" style={{ fontFamily: "Inter" }}>Aa</p>
                <p className="text-sm text-slate-600">Pesos: 400, 500, 600, 700</p>
                <p className="text-xs text-slate-500 mt-1">Texto longo, formulários, tabelas.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Tokens */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Tokens exportáveis</h2>
            <span className="text-sm text-slate-400">prontos para colar no projeto</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TokenBlock title="CSS · :root">{`:root {
  --background: 210 40% 98%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --border: 214 32% 91%;
  --primary: 180 100% 25%;
  --primary-foreground: 210 40% 98%;
  --accent: 180 40% 91%;
  --accent-foreground: 180 100% 25%;
  --sidebar-background: 183 50% 9%;
  --sidebar-foreground: 210 40% 98%;
  --success: 150 60% 38%;
  --warning: 38 92% 50%;
  --destructive: 0 75% 50%;
  --info: 199 89% 48%;
  --radius: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 195 25% 10%;
    --foreground: 195 12% 96%;
    --card: 195 25% 14%;
    --border: 195 18% 22%;
    --primary: 180 55% 60%;
    --accent: 195 30% 22%;
  }
}`}</TokenBlock>

            <TokenBlock title="Tailwind · theme.extend">{`colors: {
  brand: {
    50:  '#E6F7F7',
    100: '#C7EBEB',
    200: '#9DD9D9',
    300: '#6FC4C4',
    400: '#3FA8A8',
    500: '#1E8A8A',
    600: '#008080',  // primary
    700: '#006464',
    800: '#024F4F',
    900: '#0B3838',
  },
  sidebar: {
    50:  '#E8EDED',
    500: '#2A3D3D',
    700: '#172525',
    900: '#0B1314',  // sidebar bg
  },
},
fontFamily: {
  display: ['Outfit', 'system-ui', 'sans-serif'],
  sans:    ['Inter', 'system-ui', 'sans-serif'],
},
borderRadius: {
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.25rem',
}`}</TokenBlock>
          </div>
        </section>

        {/* Accessibility */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Padrões de acessibilidade</h2>
            <span className="text-sm text-slate-400">WCAG 2.2 AA + alvos de toque</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-[hsl(180,40%,91%)] flex items-center justify-center text-[hsl(180,100%,25%)] font-bold mb-4">Aa</div>
              <h4 className="font-bold text-slate-900 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Contraste de texto</h4>
              <p className="text-sm text-slate-600 leading-relaxed">Texto normal ≥ <span className="font-mono font-semibold">4.5:1</span>. Texto grande (18px+) e UI ≥ <span className="font-mono font-semibold">3:1</span>. Use teal-700+ para texto sobre fundos claros.</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-[hsl(180,40%,91%)] flex items-center justify-center text-[hsl(180,100%,25%)] font-bold mb-4">px</div>
              <h4 className="font-bold text-slate-900 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Tamanhos mínimos</h4>
              <p className="text-sm text-slate-600 leading-relaxed">Body ≥ <span className="font-mono font-semibold">16px</span> (web) / <span className="font-mono font-semibold">14px</span> (mobile). Caption ≥ <span className="font-mono font-semibold">12px</span>. Nunca usar Outfit para texto longo.</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-[hsl(180,40%,91%)] flex items-center justify-center text-[hsl(180,100%,25%)] font-bold mb-4">⊙</div>
              <h4 className="font-bold text-slate-900 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Alvo de toque</h4>
              <p className="text-sm text-slate-600 leading-relaxed">Botões e links interativos ≥ <span className="font-mono font-semibold">44×44px</span>. Espaçamento mínimo entre alvos: <span className="font-mono font-semibold">8px</span>.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-[1280px] mx-auto px-12 flex justify-between items-center">
          <span className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Fisio<span style={{ color: TEAL }}>Gest</span>
          </span>
          <p className="text-xs font-mono text-slate-400">Color & Type System · v1.0</p>
        </div>
      </footer>
    </div>
  );
}
