import React from "react";
import "./_group.css";
import { 
  HeartHandshake, CalendarDays, Dumbbell, Activity, Stethoscope, 
  ClipboardList, Wallet, BarChart3, Users, Settings, Shield, 
  Calendar, FileText, Pill, CheckCircle2, XCircle, ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const Logo = ({ className = "w-12 h-12", color = "currentColor" }) => (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro" className={className} style={{ color }}>
    <rect width="36" height="36" rx="10" fill="currentColor" />
    <path d="M18 8v20M8 18h20" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="18" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
  </svg>
);

const ColorSwatch = ({ name, hex, hsl, className, textClass = "text-white" }) => (
  <div className="flex flex-col gap-2">
    <div className={`h-32 w-full rounded-2xl shadow-sm border border-slate-200 ${className} flex items-end p-4`}>
      <div className={`font-mono text-sm font-medium ${textClass}`}>{hex}</div>
    </div>
    <div>
      <h4 className="font-semibold text-[hsl(222,47%,11%)]">{name}</h4>
      <p className="text-sm text-slate-500 font-mono">{hsl}</p>
    </div>
  </div>
);

const TypographySpecimen = ({ family, name, weights, sample }) => (
  <div className="space-y-6">
    <div className="flex items-baseline justify-between border-b pb-4">
      <div>
        <h3 className="text-2xl font-bold" style={{ fontFamily: family }}>{name}</h3>
        <p className="text-slate-500 font-mono text-sm">font-family: '{name}', sans-serif</p>
      </div>
      <div className="text-right text-sm text-slate-500 font-mono">
        Weights: {weights.join(", ")}
      </div>
    </div>
    <div className="space-y-8">
      {sample.map((s, i) => (
        <div key={i} className="flex items-start gap-8">
          <div className="w-16 shrink-0 text-sm font-mono text-slate-400 pt-1">{s.label}</div>
          <div className={s.className} style={{ fontFamily: family, fontWeight: s.weight }}>
            {s.text}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export function Page() {
  return (
    <div className="min-h-[2000px] w-full bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] font-sans antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      
      {/* Cover */}
      <section className="relative w-full h-[80vh] flex flex-col items-center justify-center bg-white border-b overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, black 1px, transparent 0)", backgroundSize: "32px 32px" }}></div>
        <div className="z-10 flex flex-col items-center text-center max-w-3xl px-6">
          <Logo className="w-32 h-32 mb-12" color="hsl(180, 100%, 25%)" />
          <h1 className="text-7xl font-extrabold tracking-tight mb-6 text-[hsl(222,47%,11%)]" style={{ fontFamily: "'Outfit', sans-serif" }}>
            FisioGest Pro
          </h1>
          <p className="text-2xl text-slate-500 font-light tracking-wide">
            Brand Book v1.0 — Identidade Visual
          </p>
        </div>
      </section>

      <main className="max-w-[1280px] mx-auto px-12 py-32 space-y-40">
        
        {/* Essência */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">01</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>A Marca</h3>
          </div>
          <div className="col-span-8 space-y-8 text-xl leading-relaxed text-slate-600">
            <p>
              O FisioGest Pro não é apenas um software. É o parceiro invisível na jornada de cuidado do paciente. Projetado para fisioterapeutas, estetas e instrutores de pilates, nossa identidade visual reflete a precisão clínica exigida pelo COFFITO, mas com um toque profundamente humano.
            </p>
            <p>
              Nossa interface utiliza espaços generosos e uma paleta de cores "Teal" que transmite tranquilidade, higiene e foco. Reduzimos a carga cognitiva para que o profissional possa focar no que realmente importa: a reabilitação e o bem-estar de seus pacientes.
            </p>
            <div className="grid grid-cols-3 gap-8 pt-8">
              <div className="border-t-2 border-[hsl(180,100%,25%)] pt-4">
                <h4 className="font-bold text-slate-900 mb-2">Profissional</h4>
                <p className="text-base text-slate-500">Confiável, preciso e alinhado aos padrões éticos e clínicos.</p>
              </div>
              <div className="border-t-2 border-[hsl(180,100%,25%)] pt-4">
                <h4 className="font-bold text-slate-900 mb-2">Acolhedor</h4>
                <p className="text-base text-slate-500">Acessível, focado no ser humano e no bem-estar.</p>
              </div>
              <div className="border-t-2 border-[hsl(180,100%,25%)] pt-4">
                <h4 className="font-bold text-slate-900 mb-2">Especialista</h4>
                <p className="text-base text-slate-500">Feito sob medida para as necessidades reais da fisioterapia.</p>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Logo */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">02</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Logotipo</h3>
          </div>
          <div className="col-span-8 space-y-8">
            <div className="bg-white p-16 rounded-3xl border shadow-sm flex items-center justify-center gap-6">
              <Logo className="w-16 h-16" color="hsl(180, 100%, 25%)" />
              <span className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>FisioGest Pro</span>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="bg-[hsl(183,50%,9%)] p-12 rounded-3xl flex items-center justify-center gap-4 text-white">
                <Logo className="w-12 h-12" color="currentColor" />
                <span className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>FisioGest Pro</span>
              </div>
              <div className="bg-[hsl(180,100%,25%)] p-12 rounded-3xl flex items-center justify-center gap-4 text-white">
                <Logo className="w-12 h-12" color="currentColor" />
                <span className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>FisioGest Pro</span>
              </div>
            </div>

            <div className="bg-slate-100 p-12 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden border border-dashed border-slate-300">
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }}></div>
              <div className="relative border border-[hsl(180,100%,25%)] border-dashed p-8 bg-white z-10">
                <Logo className="w-16 h-16" color="hsl(180, 100%, 25%)" />
                <div className="absolute top-0 left-0 w-full h-8 -translate-y-full border-x border-[hsl(180,100%,25%)] flex items-center justify-center text-xs text-[hsl(180,100%,25%)] font-mono bg-white/80">clear space (0.5x)</div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Cores */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">03</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Cores</h3>
            <p className="mt-4 text-slate-500">
              Nossa paleta é baseada em tons de "Teal" médico, combinando a calma do azul com o equilíbrio do verde. Os tons escuros trazem sobriedade e alto contraste.
            </p>
          </div>
          <div className="col-span-8 space-y-12">
            <div>
              <h4 className="text-lg font-semibold mb-6">Cores de Marca e UI</h4>
              <div className="grid grid-cols-3 gap-6">
                <ColorSwatch name="Primary" hex="#008080" hsl="hsl(180, 100%, 25%)" className="bg-[hsl(180,100%,25%)]" />
                <ColorSwatch name="Sidebar Dark" hex="#0B1C1D" hsl="hsl(183, 50%, 9%)" className="bg-[hsl(183,50%,9%)]" />
                <ColorSwatch name="Foreground" hex="#0F172A" hsl="hsl(222, 47%, 11%)" className="bg-[hsl(222,47%,11%)]" />
                <ColorSwatch name="Background" hex="#F8FAFD" hsl="hsl(210, 40%, 98%)" className="bg-[hsl(210,40%,98%)]" textClass="text-slate-800" />
                <ColorSwatch name="Accent" hex="#DCF2F2" hsl="hsl(180, 40%, 91%)" className="bg-[hsl(180,40%,91%)]" textClass="text-slate-800" />
                <ColorSwatch name="Muted" hex="#E2E8F0" hsl="hsl(214, 32%, 91%)" className="bg-[hsl(214,32%,91%)]" textClass="text-slate-800" />
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-6">Gráficos e Dados Clínicos</h4>
              <div className="grid grid-cols-5 gap-4">
                <div className="h-20 rounded-xl bg-[hsl(180,100%,25%)]"></div>
                <div className="h-20 rounded-xl bg-[hsl(210,100%,45%)]"></div>
                <div className="h-20 rounded-xl bg-[hsl(150,60%,40%)]"></div>
                <div className="h-20 rounded-xl bg-[hsl(43,100%,50%)]"></div>
                <div className="h-20 rounded-xl bg-[hsl(0,84%,60%)]"></div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Tipografia */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">04</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Tipografia</h3>
          </div>
          <div className="col-span-8 space-y-16">
            <TypographySpecimen 
              family="'Outfit', sans-serif" 
              name="Outfit" 
              weights={[500, 600, 700, 800]}
              sample={[
                { label: "h1 / 5xl", weight: 800, className: "text-5xl tracking-tight leading-tight", text: "Evolução do Paciente" },
                { label: "h2 / 3xl", weight: 700, className: "text-3xl tracking-tight leading-snug", text: "Agendamentos de Hoje" },
                { label: "h3 / 2xl", weight: 600, className: "text-2xl tracking-tight leading-snug", text: "Resumo Financeiro" },
                { label: "h4 / xl", weight: 500, className: "text-xl tracking-tight leading-snug", text: "Configurações da Clínica" }
              ]}
            />

            <TypographySpecimen 
              family="'Inter', sans-serif" 
              name="Inter" 
              weights={[400, 500, 600, 700]}
              sample={[
                { label: "lg / 400", weight: 400, className: "text-lg leading-relaxed text-slate-700", text: "A reabilitação funcional apresenta evolução positiva significativa na amplitude de movimento." },
                { label: "base / 400", weight: 400, className: "text-base leading-relaxed text-slate-700", text: "Paciente relata diminuição do quadro álgico para EVA 3 durante a noite. Mantém exercícios domiciliares." },
                { label: "sm / 500", weight: 500, className: "text-sm leading-none text-slate-900", text: "Próxima sessão: Quinta-feira, 14:30" },
                { label: "xs / 600", weight: 600, className: "text-xs uppercase tracking-wider text-slate-500", text: "Apenas leitura" }
              ]}
            />
          </div>
        </section>

        <Separator />

        {/* Iconografia */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">05</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Iconografia</h3>
            <p className="mt-4 text-slate-500">
              Utilizamos a biblioteca Lucide React. Traço de 2px, bordas arredondadas. Ícones claros e literais para ações médicas e administrativas.
            </p>
          </div>
          <div className="col-span-8">
            <div className="grid grid-cols-4 gap-6">
              {[
                { icon: HeartHandshake, name: "Pacientes", ctx: "Prontuário, lista" },
                { icon: CalendarDays, name: "Agenda", ctx: "Módulo principal" },
                { icon: Dumbbell, name: "Procedimentos", ctx: "Tabela, planos" },
                { icon: Wallet, name: "Financeiro", ctx: "DRE, extrato" },
                { icon: Stethoscope, name: "Anamnese", ctx: "Avaliação clínica" },
                { icon: Activity, name: "Evolução", ctx: "Acompanhamento" },
                { icon: ClipboardList, name: "Planos", ctx: "Plano terapêutico" },
                { icon: BarChart3, name: "Relatórios", ctx: "Dashboards, KPIs" },
                { icon: Users, name: "Multi-clínica", ctx: "Unidades, equipes" },
                { icon: Shield, name: "Superadmin", ctx: "Gestão SaaS" },
                { icon: Settings, name: "Ajustes", ctx: "Configurações" },
                { icon: FileText, name: "Arquivos", ctx: "Atestados, recibos" }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center p-6 bg-white border rounded-2xl hover:shadow-md transition-shadow">
                  <item.icon className="w-8 h-8 text-[hsl(180,100%,25%)] mb-4" strokeWidth={2} />
                  <span className="font-semibold text-sm">{item.name}</span>
                  <span className="text-xs text-slate-500 mt-1">{item.ctx}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* UI Mockups */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">06</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Componentes UI</h3>
            <p className="mt-4 text-slate-500">
              Nossa interface utiliza bordas arredondadas suaves, sombras sutis e hierarquia tipográfica forte. Botões têm padding generoso. Badges são claros.
            </p>
          </div>
          <div className="col-span-8 space-y-12">
            <div className="grid grid-cols-2 gap-8">
              
              {/* Card Paciente */}
              <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                <div className="h-2 bg-[hsl(180,100%,25%)]"></div>
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="w-12 h-12 rounded-full bg-[hsl(180,40%,91%)] flex items-center justify-center text-[hsl(180,100%,25%)] font-bold text-lg">
                    MS
                  </div>
                  <div>
                    <CardTitle className="text-xl" style={{ fontFamily: "'Outfit', sans-serif" }}>Mariana Silva</CardTitle>
                    <CardDescription>Reabilitação Pós-Operatória</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 mb-4">
                    <Badge variant="secondary" className="bg-[hsl(214,32%,91%)] text-slate-700 hover:bg-[hsl(214,32%,91%)] font-medium rounded-md px-2 py-1">
                      Última EVA: 3
                    </Badge>
                    <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] font-medium rounded-md px-2 py-1">
                      12 Sessões Restantes
                    </Badge>
                  </div>
                  <Button className="w-full bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,20%)] text-white rounded-xl h-10">
                    Abrir Prontuário
                  </Button>
                </CardContent>
              </Card>

              {/* KPI */}
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Receita Recorrente (MRR)</p>
                      <h4 className="text-3xl font-bold text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>R$ 24.580,00</h4>
                    </div>
                    <div className="p-3 rounded-full bg-[hsl(150,60%,40%)]/10 text-[hsl(150,60%,40%)]">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center text-sm">
                    <span className="text-[hsl(150,60%,40%)] font-semibold flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 -rotate-45" />
                      +12.5%
                    </span>
                    <span className="text-slate-500 ml-2">vs mês anterior</span>
                  </div>
                </CardContent>
              </Card>

            </div>

            <div className="p-8 bg-white border rounded-3xl shadow-sm space-y-6">
              <h4 className="font-semibold text-lg text-slate-900">Estados & Botões</h4>
              <div className="flex flex-wrap gap-4 items-center">
                <Button className="bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,20%)] text-white rounded-xl px-6 h-11">Ação Primária</Button>
                <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl px-6 h-11">Secundário</Button>
                <Button variant="ghost" className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl px-6 h-11">Ghost</Button>
                <Button variant="destructive" className="bg-[hsl(0,84%,60%)] hover:bg-red-600 text-white rounded-xl px-6 h-11">Destrutivo</Button>
              </div>
              <div className="flex gap-4 pt-4 border-t">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Confirmado</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">Pendente</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">Cancelado</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">Rascunho</span>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Exemplos de Aplicação */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">07</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Aplicações</h3>
            <p className="mt-4 text-slate-500">
              A identidade visual aplicada em diferentes contextos: web app, mobile e telas externas.
            </p>
          </div>
          <div className="col-span-8 space-y-12">
            
            {/* Dashboard Mockup */}
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-xl bg-slate-100">
              <div className="h-8 bg-slate-200 border-b flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="flex h-64">
                <div className="w-48 bg-[hsl(183,50%,9%)] p-4 flex flex-col gap-4">
                  <Logo className="w-8 h-8 text-white mb-4" />
                  <div className="h-6 bg-white/10 rounded"></div>
                  <div className="h-6 bg-white/10 rounded"></div>
                  <div className="h-6 bg-white/5 rounded"></div>
                </div>
                <div className="flex-1 p-6 bg-[hsl(210,40%,98%)] flex flex-col gap-4">
                  <div className="h-8 w-48 bg-slate-200 rounded"></div>
                  <div className="flex gap-4">
                    <div className="flex-1 h-24 bg-white border rounded-xl"></div>
                    <div className="flex-1 h-24 bg-white border rounded-xl"></div>
                    <div className="flex-1 h-24 bg-white border rounded-xl"></div>
                  </div>
                  <div className="flex-1 bg-white border rounded-xl mt-2"></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12">
              {/* Login Mockup */}
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-lg bg-slate-100">
                <div className="h-8 bg-slate-200 border-b flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                  <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                  <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                </div>
                <div className="h-72 flex bg-[hsl(210,40%,98%)]">
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
                    <Logo className="w-10 h-10 text-[hsl(180,100%,25%)] mb-6" />
                    <div className="w-full h-8 bg-slate-100 rounded mb-4"></div>
                    <div className="w-full h-8 bg-slate-100 rounded mb-6"></div>
                    <div className="w-full h-10 bg-[hsl(180,100%,25%)] rounded-xl"></div>
                  </div>
                  <div className="flex-1 bg-[hsl(183,50%,9%)]"></div>
                </div>
              </div>

              {/* Mobile Mockup */}
              <div className="flex justify-center">
                <div className="w-48 h-80 bg-white border-[6px] border-slate-800 rounded-[2rem] shadow-xl overflow-hidden flex flex-col relative">
                  <div className="absolute top-0 inset-x-0 h-4 bg-slate-800 rounded-b-xl mx-12"></div>
                  <div className="h-16 bg-[hsl(180,100%,25%)] p-4 flex items-end">
                    <div className="h-4 w-24 bg-white/20 rounded"></div>
                  </div>
                  <div className="flex-1 bg-[hsl(210,40%,98%)] p-4 flex flex-col gap-3">
                    <div className="h-16 bg-white border rounded-xl"></div>
                    <div className="h-16 bg-white border rounded-xl"></div>
                    <div className="h-16 bg-white border rounded-xl"></div>
                  </div>
                  <div className="h-12 border-t flex items-center justify-around px-2 pb-1">
                    <div className="w-5 h-5 rounded bg-[hsl(180,100%,25%)]"></div>
                    <div className="w-5 h-5 rounded bg-slate-200"></div>
                    <div className="w-5 h-5 rounded bg-slate-200"></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        <Separator />

        {/* Dos & Don'ts */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">08</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Do's & Don'ts</h3>
            <p className="mt-4 text-slate-500">Regras básicas de aplicação da marca e interface.</p>
          </div>
          <div className="col-span-8 grid grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="border rounded-2xl p-6 bg-slate-50">
                <div className="flex items-center gap-2 mb-4 text-green-700 font-bold">
                  <CheckCircle2 className="w-5 h-5" /> Faça
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-center items-center h-32">
                  <Logo className="w-12 h-12" color="hsl(180, 100%, 25%)" />
                </div>
                <p className="mt-3 text-sm text-slate-600">Usar o logo na cor primária sobre fundo claro.</p>
              </div>
              
              <div className="border rounded-2xl p-6 bg-slate-50">
                <div className="flex items-center gap-2 mb-4 text-green-700 font-bold">
                  <CheckCircle2 className="w-5 h-5" /> Faça
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-center items-center h-32 gap-3">
                  <Button className="bg-[hsl(180,100%,25%)] text-white">Salvar Evolução</Button>
                  <Button variant="ghost">Cancelar</Button>
                </div>
                <p className="mt-3 text-sm text-slate-600">Destacar claramente a ação primária.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="border rounded-2xl p-6 bg-slate-50">
                <div className="flex items-center gap-2 mb-4 text-red-600 font-bold">
                  <XCircle className="w-5 h-5" /> Não Faça
                </div>
                <div className="bg-[hsl(180,100%,25%)] p-4 rounded-xl border border-slate-200 flex justify-center items-center h-32">
                  <Logo className="w-12 h-12" color="hsl(222, 47%, 11%)" />
                </div>
                <p className="mt-3 text-sm text-slate-600">Usar logo escuro sobre o fundo primário Teal.</p>
              </div>
              
              <div className="border rounded-2xl p-6 bg-slate-50">
                <div className="flex items-center gap-2 mb-4 text-red-600 font-bold">
                  <XCircle className="w-5 h-5" /> Não Faça
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-center items-center h-32 gap-3">
                  <Button className="bg-[hsl(180,100%,25%)] text-white">Salvar Evolução</Button>
                  <Button className="bg-[hsl(180,100%,25%)] text-white">Cancelar</Button>
                </div>
                <p className="mt-3 text-sm text-slate-600">Ter múltiplos botões primários lado a lado.</p>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Tom de Voz */}
        <section className="grid grid-cols-12 gap-16">
          <div className="col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(180,100%,25%)] mb-2">08</h2>
            <h3 className="text-4xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>Tom de Voz</h3>
          </div>
          <div className="col-span-8 space-y-6">
            <div className="grid grid-cols-2 gap-4 border-b pb-4">
              <div className="font-semibold text-green-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Aprovado (Acolhedor & Direto)</div>
              <div className="font-semibold text-red-600 flex items-center gap-2"><XCircle className="w-4 h-4"/> Reprovado (Frio ou Informal Demais)</div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-slate-700 border">"Olá, Mariana! Sua próxima sessão de Pilates está confirmada para amanhã."</div>
              <div className="p-4 bg-slate-50 rounded-xl text-slate-500 border line-through">"Aviso: consulta agendada amanhã."</div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-slate-700 border">"Não foi possível salvar o prontuário. Por favor, verifique sua conexão."</div>
              <div className="p-4 bg-slate-50 rounded-xl text-slate-500 border line-through">"ERRO FATAL: Falha ao inserir registro na base de dados."</div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-slate-700 border">"Finalizar Evolução Clínica"</div>
              <div className="p-4 bg-slate-50 rounded-xl text-slate-500 border line-through">"Mandar brasa na anotação!"</div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-[hsl(183,50%,9%)] text-slate-400 py-16 text-center mt-32 border-t-4 border-[hsl(180,100%,25%)]">
        <Logo className="w-12 h-12 mx-auto mb-6 text-white" />
        <p className="font-semibold text-white tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>FisioGest Pro</p>
        <p className="mt-2 text-sm">Brand Book v1.0 — Abril 2026</p>
        <p className="mt-8 text-xs opacity-60">Confidencial. Uso restrito para parceiros e equipe interna.</p>
      </footer>

    </div>
  );
}
