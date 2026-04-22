import { FadeIn } from "./utils";
import {
  LayoutGrid,
  Zap,
  BarChart3,
  TrendingUp,
  Award,
  CheckCircle,
} from "lucide-react";
import { Link } from "wouter";

const BENEFITS = [
  {
    icon: LayoutGrid,
    number: "01",
    title: "Mais organização",
    description:
      "Agenda, pacientes, financeiro e prontuários em um só lugar. Fim das planilhas espalhadas e papelada.",
    highlight: "bg-teal-500/10 text-teal-600",
  },
  {
    icon: Zap,
    number: "02",
    title: "Mais produtividade",
    description:
      "Automatize tarefas repetitivas e dedique mais tempo ao que realmente importa: cuidar dos seus pacientes.",
    highlight: "bg-cyan-500/10 text-cyan-600",
  },
  {
    icon: BarChart3,
    number: "03",
    title: "Mais controle",
    description:
      "Visibilidade total sobre ocupação, receita e desempenho da equipe com dashboards em tempo real.",
    highlight: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: TrendingUp,
    number: "04",
    title: "Mais lucro",
    description:
      "Reduza a inadimplência, aumente a retenção de pacientes e identifique os procedimentos mais rentáveis.",
    highlight: "bg-emerald-500/10 text-emerald-600",
  },
  {
    icon: Award,
    number: "05",
    title: "Mais profissionalismo",
    description:
      "Impressione seus pacientes com prontuários digitais, confirmações automáticas e uma gestão impecável.",
    highlight: "bg-violet-500/10 text-violet-600",
  },
];

export function BenefitsSection() {
  return (
    <section
      id="beneficios"
      aria-labelledby="benefits-heading"
      className="py-24 lg:py-32 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Por que escolher FisioGest Pro
          </div>
          <h2
            id="benefits-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            O que você ganha com
            <br className="hidden sm:block" /> FisioGest Pro
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Resultados tangíveis que fisioterapeutas notam já na primeira semana de uso.
          </p>
        </FadeIn>

        {/* Top row — 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {BENEFITS.slice(0, 3).map((b, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <article className="relative h-full p-7 rounded-2xl border border-slate-100 bg-slate-50/50 hover:border-teal-100 hover:shadow-lg hover:shadow-teal-500/5 hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${b.highlight}`}
                    aria-hidden="true"
                  >
                    <b.icon className="w-5 h-5" />
                  </div>
                  <span className="font-display font-bold text-3xl text-slate-100 select-none leading-none mt-1">
                    {b.number}
                  </span>
                </div>
                <h3 className="font-display font-bold text-slate-900 text-xl mb-3">{b.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{b.description}</p>
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-b-2xl scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                  aria-hidden="true"
                />
              </article>
            </FadeIn>
          ))}
        </div>

        {/* Bottom row — 2 cards centered */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:w-2/3 lg:mx-auto mb-8">
          {BENEFITS.slice(3).map((b, i) => (
            <FadeIn key={i + 3} delay={(i + 3) * 0.1}>
              <article className="relative h-full p-7 rounded-2xl border border-slate-100 bg-slate-50/50 hover:border-teal-100 hover:shadow-lg hover:shadow-teal-500/5 hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${b.highlight}`}
                    aria-hidden="true"
                  >
                    <b.icon className="w-5 h-5" />
                  </div>
                  <span className="font-display font-bold text-3xl text-slate-100 select-none leading-none mt-1">
                    {b.number}
                  </span>
                </div>
                <h3 className="font-display font-bold text-slate-900 text-xl mb-3">{b.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{b.description}</p>
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-b-2xl scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                  aria-hidden="true"
                />
              </article>
            </FadeIn>
          ))}
        </div>

        {/* Full-width trial CTA — outside the grid */}
        <FadeIn delay={0.55}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-7 sm:p-8 rounded-2xl bg-gradient-to-br from-[#060f1e] to-[#0a1628]">
            <div>
              <div className="text-4xl font-display font-bold text-teal-400 mb-1">
                14 dias
              </div>
              <div className="text-white/70 text-sm mb-3">grátis para testar tudo</div>
              <p className="text-white/50 text-sm leading-relaxed max-w-lg">
                Sem cartão de crédito. Sem burocracia. Acesse agora e veja a diferença que um bom sistema faz na sua clínica.
              </p>
            </div>
            <Link
              href="/register"
              className="shrink-0 inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold px-7 py-3.5 rounded-xl text-sm shadow-lg shadow-teal-500/25 hover:-translate-y-0.5 transition-all duration-200"
              aria-label="Criar conta grátis no FisioGest Pro"
            >
              Criar minha conta grátis
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
