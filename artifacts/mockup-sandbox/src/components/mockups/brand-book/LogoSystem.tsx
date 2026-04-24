import "./_group.css";

const TEAL = "hsl(180, 100%, 25%)";
const TEAL_DARK = "hsl(183, 50%, 9%)";

type MarkProps = { size?: number; color?: string; bg?: string };

function MarkPrimary({ size = 64, color = TEAL, bg = "transparent" }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro">
      <rect width="36" height="36" rx="10" fill={color === "currentColor" ? "currentColor" : color} />
      <path d="M18 8v20M8 18h20" stroke={bg === "transparent" ? "white" : bg} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="18" cy="18" r="6" stroke={bg === "transparent" ? "white" : bg} strokeWidth="2" fill="none" opacity="0.6" />
    </svg>
  );
}

function MarkPulse({ size = 64, color = TEAL, bg = "transparent" }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro Pulse">
      <rect width="36" height="36" rx="10" fill={color} />
      <path d="M18 8v8" stroke={bg === "transparent" ? "white" : bg} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 21v7" stroke={bg === "transparent" ? "white" : bg} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M5 18h6l2-4 3 8 3-6 2 2h10" stroke={bg === "transparent" ? "white" : bg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function MarkMotion({ size = 64, color = TEAL, bg = "transparent" }: MarkProps) {
  const stroke = bg === "transparent" ? "white" : bg;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro Motion">
      <rect width="36" height="36" rx="10" fill={color} />
      <path d="M9 18a9 9 0 0 1 18 0" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M27 18a9 9 0 0 1-18 0" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" fill="none" strokeDasharray="2 3" opacity="0.45" />
      <path d="M18 11v14M12 18h12" stroke={stroke} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function MonogramFG({ size = 64, color = TEAL, bg = "transparent" }: MarkProps) {
  const stroke = bg === "transparent" ? "white" : bg;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro Monogram">
      <rect width="36" height="36" rx="10" fill={color} />
      <path d="M11 26V10h7" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11 18h5" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <path d="M27 14a4.5 4.5 0 0 0-4.5-4 4.5 4.5 0 0 0 0 9c2.5 0 4.5-1.5 4.5-4v-1h-3" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="22.5" cy="22.5" r="1.6" fill={stroke} />
    </svg>
  );
}

type ConceptCardProps = {
  num: string;
  name: string;
  blurb: string;
  Component: React.FC<MarkProps>;
};

function ConceptCard({ num, name, blurb, Component }: ConceptCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-[hsl(210,40%,98%)] flex items-center justify-center relative">
        <div className="absolute top-4 left-4 text-[11px] font-mono font-semibold text-slate-400 tracking-widest">{num}</div>
        <Component size={120} color={TEAL} />
      </div>
      <div className="grid grid-cols-2 border-t border-slate-200">
        <div className="p-6 bg-white flex items-center justify-center">
          <Component size={56} color={TEAL} />
        </div>
        <div className="p-6 bg-[hsl(183,50%,9%)] flex items-center justify-center">
          <Component size={56} color="white" bg={TEAL_DARK} />
        </div>
      </div>
      <div className="p-6 border-t border-slate-200">
        <h4 className="font-bold text-lg text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>{name}</h4>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{blurb}</p>
      </div>
    </div>
  );
}

function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className="text-3xl font-extrabold tracking-tight inline-flex items-baseline"
      style={{ fontFamily: "'Outfit', sans-serif", color: inverted ? "white" : TEAL_DARK }}
    >
      Fisio<span style={{ color: TEAL }}>Gest</span>
      <span className="ml-1.5 text-[0.55em] font-bold tracking-[0.2em] uppercase translate-y-[-2px]" style={{ color: inverted ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.55)" }}>
        Pro
      </span>
    </span>
  );
}

export function LogoSystem() {
  return (
    <div className="min-h-screen w-full bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] font-sans antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-12 py-12">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(180,100%,25%)]">Sistema de Logos</p>
            <p className="text-xs font-mono text-slate-400">Brand Book v1.0 · Board 2 / 4</p>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Modelos & variações da marca
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Quatro conceitos de marca refinados a partir do mark original (cruz + círculo), mais o conjunto completo de lockups, escala e aplicações monocromáticas.
          </p>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-12 py-20 space-y-24">
        {/* 4 concepts */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>4 conceitos de mark</h2>
            <span className="text-sm text-slate-400">testados em fundo claro e escuro</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <ConceptCard num="01" name="Cruz Clínica" blurb="Mark oficial. Cruz médica + círculo sutil de movimento. Equilíbrio entre clínico e humano." Component={MarkPrimary} />
            <ConceptCard num="02" name="Pulso" blurb="Variação para contextos de evolução clínica e relatórios — combina cruz com onda de pulso." Component={MarkPulse} />
            <ConceptCard num="03" name="Movimento" blurb="Mark com órbita dupla, ideal para conteúdo de reabilitação e marketing de bem-estar." Component={MarkMotion} />
            <ConceptCard num="04" name="Monograma FG" blurb="Para favicon, badge no rodapé de e-mails e selo em documentos PDF (16-32px)." Component={MonogramFG} />
          </div>
        </section>

        {/* Lockups */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Lockups oficiais</h2>
            <span className="text-sm text-slate-400">combinações aprovadas de mark + wordmark</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl bg-white border border-slate-200 p-12 flex flex-col items-center justify-center gap-6 min-h-[260px]">
              <div className="flex items-center gap-4">
                <MarkPrimary size={56} />
                <Wordmark />
              </div>
              <p className="text-xs font-mono uppercase tracking-widest text-slate-400">Horizontal · primário</p>
            </div>

            <div className="rounded-3xl bg-[hsl(183,50%,9%)] border border-slate-800 p-12 flex flex-col items-center justify-center gap-6 min-h-[260px]">
              <div className="flex items-center gap-4">
                <MarkPrimary size={56} color="white" bg={TEAL_DARK} />
                <Wordmark inverted />
              </div>
              <p className="text-xs font-mono uppercase tracking-widest text-white/40">Horizontal · invertido</p>
            </div>

            <div className="rounded-3xl bg-white border border-slate-200 p-12 flex flex-col items-center justify-center gap-3 min-h-[260px]">
              <MarkPrimary size={72} />
              <Wordmark />
              <p className="mt-3 text-xs font-mono uppercase tracking-widest text-slate-400">Vertical · stacked</p>
            </div>

            <div className="rounded-3xl bg-[hsl(180,100%,25%)] border border-[hsl(180,100%,20%)] p-12 flex flex-col items-center justify-center gap-3 min-h-[260px]">
              <MarkPrimary size={72} color="white" bg={TEAL} />
              <span className="text-3xl font-extrabold tracking-tight text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                FisioGest <span className="opacity-70">Pro</span>
              </span>
              <p className="mt-3 text-xs font-mono uppercase tracking-widest text-white/60">Sobre cor primária</p>
            </div>
          </div>
        </section>

        {/* Escala / favicon test */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Teste de escala</h2>
            <span className="text-sm text-slate-400">mantém legibilidade de 16px até display</span>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-12">
            <div className="flex items-end justify-center gap-12 flex-wrap">
              {[16, 24, 32, 48, 64, 96, 128].map((s) => (
                <div key={s} className="flex flex-col items-center gap-3">
                  <div className="flex items-end" style={{ height: 128 }}>
                    <MarkPrimary size={s} />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{s}px</span>
                </div>
              ))}
            </div>
            <p className="text-center mt-10 text-sm text-slate-500 max-w-xl mx-auto">
              Para tamanhos abaixo de 24px (favicon, status bar, e-mail header), prefira o
              <span className="text-[hsl(180,100%,25%)] font-semibold"> Monograma FG</span> — mantém densidade visual sem detalhes que somem.
            </p>
          </div>
        </section>

        {/* Monocromático */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Versões monocromáticas</h2>
            <span className="text-sm text-slate-400">para impressão, fax, marca d'água e favicon</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-3xl bg-white border border-slate-200 p-12 aspect-square flex flex-col items-center justify-center gap-3">
              <MarkPrimary size={88} color="black" />
              <p className="text-xs font-mono uppercase tracking-widest text-slate-400">Preto · 100%</p>
            </div>
            <div className="rounded-3xl bg-slate-100 border border-slate-200 p-12 aspect-square flex flex-col items-center justify-center gap-3">
              <MarkPrimary size={88} color="hsl(222, 47%, 11%)" />
              <p className="text-xs font-mono uppercase tracking-widest text-slate-400">Foreground</p>
            </div>
            <div className="rounded-3xl bg-[hsl(222,47%,11%)] p-12 aspect-square flex flex-col items-center justify-center gap-3">
              <MarkPrimary size={88} color="white" bg="hsl(222, 47%, 11%)" />
              <p className="text-xs font-mono uppercase tracking-widest text-white/40">Branco · invertido</p>
            </div>
            <div className="rounded-3xl bg-white border-2 border-dashed border-slate-300 p-12 aspect-square flex flex-col items-center justify-center gap-3 relative">
              <svg width="88" height="88" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="10" fill="none" stroke="black" strokeWidth="1" />
                <path d="M18 8v20M8 18h20" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="18" cy="18" r="6" stroke="black" strokeWidth="1" fill="none" />
              </svg>
              <p className="text-xs font-mono uppercase tracking-widest text-slate-400">Outline · linework</p>
            </div>
          </div>
        </section>

        {/* App icons */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>App icon & favicon</h2>
            <span className="text-sm text-slate-400">iOS, Android, navegador e selo de PDF</span>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-slate-100 via-white to-[hsl(180,40%,95%)] border border-slate-200 p-12">
            <div className="flex flex-wrap items-end justify-center gap-12">
              {/* iOS */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-32 rounded-[28px] shadow-xl overflow-hidden bg-gradient-to-br from-[hsl(180,100%,30%)] to-[hsl(180,100%,18%)] flex items-center justify-center">
                  <MarkPrimary size={84} color="transparent" bg="white" />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">iOS · 1024px</p>
              </div>
              {/* Android adaptive */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-32 rounded-full shadow-xl overflow-hidden bg-[hsl(180,100%,25%)] flex items-center justify-center">
                  <MarkPrimary size={72} color="transparent" bg="white" />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Android · adaptive</p>
              </div>
              {/* Maskable */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-2xl shadow-md overflow-hidden bg-[hsl(183,50%,9%)] flex items-center justify-center">
                  <MarkPrimary size={56} color="transparent" bg="white" />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">PWA · maskable</p>
              </div>
              {/* Browser tab */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-9 rounded-t-lg bg-white border border-b-0 border-slate-200 flex items-center px-2 gap-1.5">
                  <MonogramFG size={16} />
                  <div className="h-1 flex-1 bg-slate-200 rounded" />
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Browser tab · 16px</p>
              </div>
              {/* PDF seal */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-44 rounded-md shadow-md bg-white border border-slate-200 p-3 flex flex-col">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                    <MonogramFG size={14} />
                    <span className="text-[8px] font-bold tracking-wider text-slate-700" style={{ fontFamily: "'Outfit', sans-serif" }}>FisioGest Pro</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1 pt-2">
                    <div className="h-1 bg-slate-200 rounded w-full" />
                    <div className="h-1 bg-slate-200 rounded w-4/5" />
                    <div className="h-1 bg-slate-200 rounded w-full" />
                    <div className="h-1 bg-slate-200 rounded w-3/4" />
                  </div>
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Atestado · cabeçalho</p>
              </div>
            </div>
          </div>
        </section>

        {/* Clear space */}
        <section>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Área de respiro & proporção</h2>
            <span className="text-sm text-slate-400">x = altura da cruz no mark</span>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-16 flex justify-center">
            <div className="relative inline-block p-12 border border-dashed border-[hsl(180,100%,25%)]">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-2 bg-white text-xs font-mono text-[hsl(180,100%,25%)]">x</div>
              <div className="absolute top-1/2 -left-4 -translate-y-1/2 px-1 bg-white text-xs font-mono text-[hsl(180,100%,25%)]" style={{ writingMode: "vertical-rl" }}>x</div>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-2 bg-white text-xs font-mono text-[hsl(180,100%,25%)]">x</div>
              <div className="absolute top-1/2 -right-4 -translate-y-1/2 px-1 bg-white text-xs font-mono text-[hsl(180,100%,25%)]" style={{ writingMode: "vertical-rl" }}>x</div>
              <div className="flex items-center gap-4">
                <MarkPrimary size={88} />
                <Wordmark />
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-slate-500 text-center max-w-2xl mx-auto">
            Mantenha pelo menos <span className="font-semibold text-[hsl(180,100%,25%)]">x = altura da cruz</span> de respiro em todos os lados. Nunca corte, distorça ou aplique sombras pesadas no mark.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-[1280px] mx-auto px-12 flex justify-between items-center">
          <Wordmark />
          <p className="text-xs font-mono text-slate-400">Logo System · v1.0 · Abril 2026</p>
        </div>
      </footer>
    </div>
  );
}
