import { FadeIn } from "./utils";
import {
  CalendarX,
  UserMinus,
  TrendingDown,
  Clock,
  FolderX,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

const PROBLEMS = [
  {
    icon: CalendarX,
    title: "Agenda desorganizada",
    description: "Conflitos de horários e over booking prejudicam pacientes e geram retrabalho constante.",
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-100 hover:border-red-200",
  },
  {
    icon: UserMinus,
    title: "Perda de pacientes",
    description: "Sem lembretes automáticos e follow-up estruturado, pacientes somem e a carteira encolhe.",
    color: "text-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-100 hover:border-orange-200",
  },
  {
    icon: TrendingDown,
    title: "Falta de controle financeiro",
    description: "Sem visibilidade de receitas e despesas, é impossível saber se a clínica dá lucro.",
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-100 hover:border-amber-200",
  },
  {
    icon: Clock,
    title: "Tempo perdido",
    description: "Planilhas, WhatsApp e papel consomem horas que deveriam ser usadas com pacientes.",
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-100 hover:border-rose-200",
  },
  {
    icon: FolderX,
    title: "Desorganização da clínica",
    description: "Prontuários físicos espalhados e dados duplicados tornam tudo mais lento e sujeito a erros.",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-100 hover:border-red-200",
  },
];

export function ProblemsSection() {
  return (
    <section
      id="problemas"
      aria-labelledby="problems-heading"
      className="py-24 lg:py-32 bg-slate-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <CalendarX className="w-3.5 h-3.5" aria-hidden="true" />
            Problemas que você conhece bem
          </div>
          <h2
            id="problems-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            Sua clínica merece mais
            <br className="hidden sm:block" /> do que isso
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            Esses obstáculos são comuns, mas não precisam ser permanentes.
            Cada dia sem um sistema adequado custa tempo e dinheiro.
          </p>
        </FadeIn>

        {/* 5 cards: 2 rows — top row 3 cols, bottom row 2 cols centered */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {PROBLEMS.slice(0, 3).map((problem, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div className={`h-full p-6 rounded-2xl border ${problem.border} bg-white hover:shadow-lg transition-all duration-300`}>
                <div className={`w-11 h-11 rounded-xl ${problem.bg} flex items-center justify-center mb-4`} aria-hidden="true">
                  <problem.icon className={`w-5 h-5 ${problem.color}`} />
                </div>
                <h3 className="font-display font-bold text-slate-900 text-base mb-2">{problem.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{problem.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Bottom row — 2 cards centered in a 2-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:w-2/3 lg:mx-auto mb-10">
          {PROBLEMS.slice(3).map((problem, i) => (
            <FadeIn key={i + 3} delay={(i + 3) * 0.08}>
              <div className={`h-full p-6 rounded-2xl border ${problem.border} bg-white hover:shadow-lg transition-all duration-300`}>
                <div className={`w-11 h-11 rounded-xl ${problem.bg} flex items-center justify-center mb-4`} aria-hidden="true">
                  <problem.icon className={`w-5 h-5 ${problem.color}`} />
                </div>
                <h3 className="font-display font-bold text-slate-900 text-base mb-2">{problem.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{problem.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Full-width CTA banner */}
        <FadeIn delay={0.45}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-100">
            <div>
              <p className="font-display font-bold text-teal-800 text-xl mb-1">
                Existe uma solução melhor
              </p>
              <p className="text-teal-600/80 text-sm max-w-lg">
                FisioGest Pro foi criado especificamente para resolver cada um desses problemas com automação e organização.
              </p>
            </div>
            <Link
              href="/register"
              className="shrink-0 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold px-6 py-3 rounded-xl text-sm shadow-lg shadow-teal-500/20 hover:-translate-y-0.5 transition-all duration-200"
              aria-label="Conhecer a solução FisioGest Pro"
            >
              Conhecer a solução
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
