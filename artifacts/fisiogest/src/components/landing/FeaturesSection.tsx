import { FadeIn } from "./utils";
import {
  Calendar,
  Users,
  FileText,
  DollarSign,
  BarChart3,
  Globe,
  ShieldCheck,
  Package,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Calendar,
    title: "Agenda",
    description: "Visualização semanal e diária, confirmações automáticas, sem conflitos de horário.",
    accent: "teal",
  },
  {
    icon: Users,
    title: "Pacientes",
    description: "Cadastro completo, histórico de atendimentos, busca rápida e filtros avançados.",
    accent: "blue",
  },
  {
    icon: FileText,
    title: "Prontuário",
    description: "Evolução clínica por sessão, anamnese estruturada, anexo de documentos e imagens.",
    accent: "cyan",
  },
  {
    icon: DollarSign,
    title: "Financeiro",
    description: "Receitas, despesas, fluxo de caixa e gestão de inadimplência em tempo real.",
    accent: "emerald",
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    description: "KPIs automáticos, taxa de ocupação, receita por procedimento e análise de retenção.",
    accent: "violet",
  },
  {
    icon: Package,
    title: "Procedimentos",
    description: "Catálogo de procedimentos, pacotes de sessões e controle de execução.",
    accent: "amber",
  },
  {
    icon: ShieldCheck,
    title: "Multiusuários",
    description: "Controle de acesso por perfil — admin, fisioterapeuta, secretaria e recepção.",
    accent: "rose",
  },
  {
    icon: Globe,
    title: "Agendamento Online",
    description: "Página pública para seus pacientes agendarem sem necessidade de ligação.",
    accent: "teal",
  },
  {
    icon: Zap,
    title: "Segurança",
    description: "Dados criptografados, conformidade com LGPD e backup automático diário.",
    accent: "slate",
  },
];

const ACCENT_COLORS: Record<string, { icon: string; bg: string; hover: string }> = {
  teal: { icon: "text-teal-600", bg: "bg-teal-50", hover: "group-hover:bg-teal-100" },
  blue: { icon: "text-blue-600", bg: "bg-blue-50", hover: "group-hover:bg-blue-100" },
  cyan: { icon: "text-cyan-600", bg: "bg-cyan-50", hover: "group-hover:bg-cyan-100" },
  emerald: { icon: "text-emerald-600", bg: "bg-emerald-50", hover: "group-hover:bg-emerald-100" },
  violet: { icon: "text-violet-600", bg: "bg-violet-50", hover: "group-hover:bg-violet-100" },
  amber: { icon: "text-amber-600", bg: "bg-amber-50", hover: "group-hover:bg-amber-100" },
  rose: { icon: "text-rose-600", bg: "bg-rose-50", hover: "group-hover:bg-rose-100" },
  slate: { icon: "text-slate-600", bg: "bg-slate-100", hover: "group-hover:bg-slate-200" },
};

export function FeaturesSection() {
  return (
    <section
      id="recursos"
      aria-labelledby="features-heading"
      className="py-24 lg:py-32 bg-slate-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-100 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            Funcionalidades completas
          </div>
          <h2
            id="features-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            Tudo que sua clínica precisa,
            <br className="hidden sm:block" /> em um único lugar
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Cada funcionalidade foi desenvolvida especificamente para a realidade das clínicas de fisioterapia, estética e pilates.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => {
            const colors = ACCENT_COLORS[f.accent] ?? ACCENT_COLORS.teal;
            return (
              <FadeIn key={i} delay={i * 0.06}>
                <article className="h-full p-6 rounded-2xl border border-slate-200/60 bg-white hover:border-teal-200 hover:shadow-xl hover:shadow-teal-500/5 transition-all duration-300 group cursor-default">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300 ${colors.bg} ${colors.hover}`}
                    aria-hidden="true"
                  >
                    <f.icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  <h3 className="font-display font-bold text-slate-900 text-lg mb-2">{f.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{f.description}</p>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
