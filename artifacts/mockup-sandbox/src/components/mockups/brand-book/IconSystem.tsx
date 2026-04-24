import "./_group.css";

const TEAL = "hsl(180, 100%, 25%)";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function I({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.8,
  children,
  label,
}: IconProps & { children: React.ReactNode; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={label}
      role="img"
    >
      {children}
    </svg>
  );
}

const Icons = {
  Patient: (p: IconProps) => (
    <I {...p} label="Paciente">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      <path d="M16.5 5.5l1.2 1.2 2.3-2.3" />
    </I>
  ),
  Calendar: (p: IconProps) => (
    <I {...p} label="Agenda">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <circle cx="12" cy="14.5" r="0.9" fill={p.color || "currentColor"} stroke="none" />
    </I>
  ),
  Anamnesis: (p: IconProps) => (
    <I {...p} label="Anamnese">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4v2h6V4" />
      <path d="M9 11h6M9 14.5h6M9 18h4" />
    </I>
  ),
  Evolution: (p: IconProps) => (
    <I {...p} label="Evolução">
      <path d="M3 17l4-5 3 3 4-7 3 5 4-3" />
      <circle cx="7" cy="12" r="0.9" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="14" cy="8" r="0.9" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="17" cy="13" r="0.9" fill={p.color || "currentColor"} stroke="none" />
    </I>
  ),
  TreatmentPlan: (p: IconProps) => (
    <I {...p} label="Plano Terapêutico">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M16 4v3h3" />
      <path d="M8 12l2.5 2.5L16 9.5" />
    </I>
  ),
  Exercise: (p: IconProps) => (
    <I {...p} label="Exercício">
      <path d="M6 9v6M18 9v6" />
      <rect x="3" y="10" width="3" height="4" rx="0.6" />
      <rect x="18" y="10" width="3" height="4" rx="0.6" />
      <path d="M6 12h12" />
    </I>
  ),
  Session: (p: IconProps) => (
    <I {...p} label="Sessão">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13V8.5" />
      <path d="M12 13l3 2" />
      <path d="M10 3h4" />
    </I>
  ),
  Certificate: (p: IconProps) => (
    <I {...p} label="Atestado">
      <rect x="4" y="4" width="16" height="13" rx="1.5" />
      <path d="M7 9h10M7 12h7" />
      <circle cx="16.5" cy="17.5" r="2.5" />
      <path d="M15.5 19.5l-1 2.5 2-1 2 1-1-2.5" />
    </I>
  ),
  Receipt: (p: IconProps) => (
    <I {...p} label="Recibo">
      <path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3z" />
      <path d="M8 8h8M8 11.5h8M8 15h5" />
    </I>
  ),
  Signature: (p: IconProps) => (
    <I {...p} label="Assinatura Digital">
      <path d="M3 18c2 0 3-3 5-3s3 2 5 0 2-5 4-5 2 3 4 3" />
      <path d="M3 21h18" />
    </I>
  ),
  Wallet: (p: IconProps) => (
    <I {...p} label="Financeiro">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.3" fill={p.color || "currentColor"} stroke="none" />
    </I>
  ),
  Folder: (p: IconProps) => (
    <I {...p} label="Prontuário">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M8 13.5h8M8 16.5h5" />
    </I>
  ),
  Procedures: (p: IconProps) => (
    <I {...p} label="Procedimentos">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" />
      <circle cx="6" cy="9" r="0.6" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="6" cy="13" r="0.6" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="6" cy="17" r="0.6" fill={p.color || "currentColor"} stroke="none" />
    </I>
  ),
  Reports: (p: IconProps) => (
    <I {...p} label="Relatórios">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8 16V12M12 16V8M16 16v-6" />
    </I>
  ),
  Clinic: (p: IconProps) => (
    <I {...p} label="Clínica">
      <path d="M3 21V11l9-6 9 6v10" />
      <path d="M9 21v-6h6v6" />
      <path d="M11 9h2M12 8v2" />
    </I>
  ),
  Team: (p: IconProps) => (
    <I {...p} label="Equipe">
      <circle cx="9" cy="9" r="2.6" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M3 19c0-2.8 2.5-5 6-5s6 2.2 6 5" />
      <path d="M14.5 14.5c1-.4 2-.5 2.5-.5 2.8 0 4 2 4 4" />
    </I>
  ),
  Bell: (p: IconProps) => (
    <I {...p} label="Notificação">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </I>
  ),
  Queue: (p: IconProps) => (
    <I {...p} label="Fila de Espera">
      <circle cx="6" cy="8" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M3 16c0-2 1.5-3 3-3s3 1 3 3" />
      <path d="M9 16c0-2 1.5-3 3-3s3 1 3 3" />
      <path d="M15 16c0-2 1.5-3 3-3s3 1 3 3" />
    </I>
  ),
  Stethoscope: (p: IconProps) => (
    <I {...p} label="Avaliação">
      <path d="M5 4v6a4 4 0 0 0 8 0V4" />
      <circle cx="9" cy="14.5" r="0.6" fill={p.color || "currentColor"} stroke="none" />
      <path d="M9 14.5v3a3 3 0 0 0 3 3 4 4 0 0 0 4-4v-2" />
      <circle cx="16" cy="11.5" r="2.2" />
    </I>
  ),
  Pilates: (p: IconProps) => (
    <I {...p} label="Pilates">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <path d="M6 13l6-2 6 2" />
      <path d="M9 21l3-7 3 7" />
      <path d="M9 21l-1.5 0" />
      <path d="M15 21l1.5 0" />
    </I>
  ),
  Rehab: (p: IconProps) => (
    <I {...p} label="Reabilitação">
      <circle cx="8" cy="5" r="2" />
      <path d="M8 7v5" />
      <path d="M5 16l3-4h4l4 5" />
      <path d="M8 12l-2 9" />
      <path d="M12 12l3 4 4-1" />
      <circle cx="20" cy="14" r="0.8" fill={p.color || "currentColor"} stroke="none" />
    </I>
  ),
  Aesthetics: (p: IconProps) => (
    <I {...p} label="Estética">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  Settings: (p: IconProps) => (
    <I {...p} label="Configurações">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </I>
  ),
  Shield: (p: IconProps) => (
    <I {...p} label="Superadmin">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </I>
  ),
};

const groups = [
  {
    title: "Clínica & Pacientes",
    desc: "Pessoas, agenda e prontuário — usados na navegação principal.",
    items: [
      { Icon: Icons.Patient, name: "Paciente", code: "patient" },
      { Icon: Icons.Calendar, name: "Agenda", code: "calendar" },
      { Icon: Icons.Anamnesis, name: "Anamnese", code: "anamnesis" },
      { Icon: Icons.Evolution, name: "Evolução", code: "evolution" },
      { Icon: Icons.TreatmentPlan, name: "Plano Terapêutico", code: "treatment-plan" },
      { Icon: Icons.Stethoscope, name: "Avaliação", code: "evaluation" },
    ],
  },
  {
    title: "Sessões & Especialidades",
    desc: "Modalidades atendidas: fisio, pilates, RPG, estética.",
    items: [
      { Icon: Icons.Session, name: "Sessão", code: "session" },
      { Icon: Icons.Exercise, name: "Exercício", code: "exercise" },
      { Icon: Icons.Pilates, name: "Pilates", code: "pilates" },
      { Icon: Icons.Rehab, name: "Reabilitação", code: "rehab" },
      { Icon: Icons.Aesthetics, name: "Estética", code: "aesthetics" },
      { Icon: Icons.Procedures, name: "Procedimentos", code: "procedures" },
    ],
  },
  {
    title: "Documentos & Financeiro",
    desc: "Atestados, recibos, assinatura digital e gestão financeira.",
    items: [
      { Icon: Icons.Certificate, name: "Atestado", code: "certificate" },
      { Icon: Icons.Receipt, name: "Recibo", code: "receipt" },
      { Icon: Icons.Signature, name: "Assinatura", code: "signature" },
      { Icon: Icons.Folder, name: "Prontuário", code: "folder" },
      { Icon: Icons.Wallet, name: "Financeiro", code: "wallet" },
      { Icon: Icons.Reports, name: "Relatórios", code: "reports" },
    ],
  },
  {
    title: "Operação & Plataforma",
    desc: "Multi-clínica, equipe, notificações e configuração SaaS.",
    items: [
      { Icon: Icons.Clinic, name: "Clínica", code: "clinic" },
      { Icon: Icons.Team, name: "Equipe", code: "team" },
      { Icon: Icons.Queue, name: "Fila", code: "queue" },
      { Icon: Icons.Bell, name: "Notificação", code: "bell" },
      { Icon: Icons.Settings, name: "Configurações", code: "settings" },
      { Icon: Icons.Shield, name: "Superadmin", code: "shield" },
    ],
  },
];

export function IconSystem() {
  return (
    <div className="min-h-screen w-full bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] font-sans antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-12 py-12">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(180,100%,25%)]">Sistema de Ícones</p>
            <p className="text-xs font-mono text-slate-400">Brand Book v1.0 · Board 3 / 4</p>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Iconografia clínica autoral
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl leading-relaxed">
            Conjunto de 24 ícones desenhados sob medida para o domínio do FisioGest Pro. Mesmo grid 24×24, traço de 1.8px, cantos arredondados — pareiam de forma natural com o mark da marca.
          </p>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-12 py-16 space-y-20">
        {/* Spec card */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-3xl bg-white border border-slate-200 p-8">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Grid</p>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-32 h-32 bg-[hsl(180,40%,96%)] rounded-2xl">
                <div className="absolute inset-0 grid grid-cols-6 grid-rows-6">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="border-r border-b border-[hsl(180,100%,25%)]/15" />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icons.Calendar size={64} color={TEAL} strokeWidth={1.6} />
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Canvas <span className="font-mono">24×24</span>, padding interno mínimo <span className="font-mono">1px</span>. Ícones devem se manter dentro do campo seguro.
            </p>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-8">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Traço & Forma</p>
            <div className="flex items-end justify-around mb-4 h-32">
              {[1.4, 1.8, 2.4].map((sw) => (
                <div key={sw} className="flex flex-col items-center gap-2">
                  <Icons.Patient size={48} color={TEAL} strokeWidth={sw} />
                  <span className="text-[10px] font-mono text-slate-400">{sw}px</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              Default: <span className="font-mono">1.8px</span>. Cantos sempre <span className="italic">round</span>. Sem ângulos retos nem sombras.
            </p>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-8">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Tamanhos</p>
            <div className="flex items-end justify-around mb-4 h-32">
              {[16, 20, 24, 32, 48].map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Icons.Evolution size={s} color={TEAL} />
                  <span className="text-[10px] font-mono text-slate-400">{s}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              Mínimo no UI: <span className="font-mono">16px</span>. Botões: <span className="font-mono">20px</span>. Headers: <span className="font-mono">24px</span>. Empty states: <span className="font-mono">48px+</span>.
            </p>
          </div>
        </section>

        {/* Groups */}
        {groups.map((g) => (
          <section key={g.title}>
            <div className="flex items-baseline gap-4 mb-6">
              <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>{g.title}</h2>
              <span className="text-sm text-slate-400">{g.desc}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {g.items.map(({ Icon, name, code }) => (
                <div key={code} className="group rounded-2xl bg-white border border-slate-200 p-5 flex flex-col items-center gap-3 hover:border-[hsl(180,100%,25%)] hover:shadow-md transition-all">
                  <div className="h-14 flex items-center">
                    <Icon size={36} color={TEAL} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-900">{name}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">ic-{code}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Estados */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Estados & cores</h2>
            <span className="text-sm text-slate-400">como aplicar em contexto</span>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-10">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                { label: "Default", color: "hsl(215, 20%, 45%)", bg: "transparent" },
                { label: "Active / Brand", color: TEAL, bg: "transparent" },
                { label: "Sobre escuro", color: "white", bg: "hsl(183, 50%, 9%)" },
                { label: "Sucesso", color: "hsl(150, 60%, 35%)", bg: "transparent" },
                { label: "Erro", color: "hsl(0, 70%, 50%)", bg: "transparent" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor: s.bg === "transparent" ? "hsl(210, 40%, 98%)" : s.bg }}>
                  <Icons.Calendar size={32} color={s.color} />
                  <span className="text-xs font-mono uppercase tracking-widest" style={{ color: s.bg === "transparent" ? "hsl(215, 16%, 47%)" : "rgba(255,255,255,0.6)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* In context */}
        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Em contexto</h2>
            <span className="text-sm text-slate-400">como aparecem na sidebar e em botões</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sidebar */}
            <div className="rounded-3xl bg-[hsl(183,50%,9%)] border border-slate-800 p-6">
              <div className="flex items-center gap-2.5 px-3 py-2 mb-4 text-white/60 text-xs font-bold uppercase tracking-widest">Menu principal</div>
              {[
                { Icon: Icons.Calendar, label: "Agenda", active: true, badge: "12" },
                { Icon: Icons.Patient, label: "Pacientes", active: false, badge: null },
                { Icon: Icons.Folder, label: "Prontuários", active: false, badge: null },
                { Icon: Icons.Wallet, label: "Financeiro", active: false, badge: "3" },
                { Icon: Icons.Reports, label: "Relatórios", active: false, badge: null },
                { Icon: Icons.Team, label: "Equipe", active: false, badge: null },
              ].map(({ Icon, label, active, badge }) => (
                <div key={label} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${active ? "bg-[hsl(180,100%,25%)] text-white" : "text-white/70 hover:bg-white/5"}`}>
                  <Icon size={20} color="currentColor" />
                  <span className="text-sm font-medium flex-1" style={{ fontFamily: "'Inter', sans-serif" }}>{label}</span>
                  {badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? "bg-white/20" : "bg-[hsl(180,100%,25%)]/20 text-[hsl(180,40%,75%)]"}`}>{badge}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Buttons & cards */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-3">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">Botões</p>
                <button className="w-full bg-[hsl(180,100%,25%)] text-white rounded-xl px-4 h-11 flex items-center justify-center gap-2 font-medium text-sm hover:bg-[hsl(180,100%,20%)]">
                  <Icons.Calendar size={18} color="white" />
                  <span>Agendar nova sessão</span>
                </button>
                <button className="w-full bg-white border border-slate-300 text-slate-700 rounded-xl px-4 h-11 flex items-center justify-center gap-2 font-medium text-sm hover:bg-slate-50">
                  <Icons.Certificate size={18} color="currentColor" />
                  <span>Emitir atestado</span>
                </button>
                <button className="w-full bg-[hsl(180,40%,91%)] text-[hsl(180,100%,20%)] rounded-xl px-4 h-11 flex items-center justify-center gap-2 font-medium text-sm">
                  <Icons.Receipt size={18} color="currentColor" />
                  <span>Gerar recibo</span>
                </button>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 p-6">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-4">Stat cards</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { Icon: Icons.Patient, label: "Pacientes ativos", value: "247", trend: "+12" },
                    { Icon: Icons.Session, label: "Sessões / mês", value: "1.483", trend: "+8%" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-[hsl(210,40%,98%)] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <s.Icon size={20} color={TEAL} />
                        <span className="text-[10px] font-bold text-[hsl(150,60%,35%)] bg-[hsl(150,60%,90%)] px-1.5 py-0.5 rounded">{s.trend}</span>
                      </div>
                      <p className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>{s.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-[1280px] mx-auto px-12 flex justify-between items-center">
          <span className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Fisio<span style={{ color: TEAL }}>Gest</span>
          </span>
          <p className="text-xs font-mono text-slate-400">Icon System · 24 ícones · v1.0</p>
        </div>
      </footer>
    </div>
  );
}
