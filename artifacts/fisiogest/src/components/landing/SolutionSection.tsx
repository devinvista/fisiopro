import { FadeIn } from "./utils";
import { Link } from "wouter";
import {
  CheckCircle,
  ArrowRight,
  Sparkles,
  Calendar,
  DollarSign,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";

const SOLUTIONS = [
  {
    icon: Calendar,
    title: "Agenda inteligente",
    description: "Horários sem conflito, confirmações automáticas e visão completa da semana",
    color: "text-teal-600",
    bg: "bg-teal-50",
  },
  {
    icon: DollarSign,
    title: "Controle financeiro",
    description: "Receitas, despesas e fluxo de caixa em tempo real, sem planilhas",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Users,
    title: "Gestão de pacientes",
    description: "Cadastro completo, histórico de atendimentos e follow-up automatizado",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: BarChart3,
    title: "Relatórios automáticos",
    description: "KPIs, ocupação e desempenho gerados automaticamente, sempre atualizados",
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    icon: FileText,
    title: "Prontuário clínico",
    description: "Evolução por sessão, anamnese e documentos organizados e acessíveis",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
  },
];

export function SolutionSection() {
  return (
    <section
      id="solucao"
      aria-labelledby="solution-heading"
      className="py-24 lg:py-32 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <FadeIn direction="left" className="flex-1">
            <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-100 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              A solução completa
            </div>
            <h2
              id="solution-heading"
              className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-6 leading-tight"
            >
              FisioGest Pro resolve
              <span className="text-teal-600"> todos esses problemas</span>{" "}
              com automação e organização.
            </h2>
            <p className="text-slate-500 text-lg leading-relaxed mb-8">
              Em vez de múltiplas ferramentas, planilhas e papéis, você tem
              tudo integrado em um único sistema desenvolvido para a realidade
              das clínicas brasileiras de saúde.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold px-6 py-3 rounded-xl text-sm shadow-lg shadow-teal-500/25 hover:-translate-y-0.5 transition-all duration-200"
              aria-label="Começar a usar FisioGest Pro gratuitamente"
            >
              Experimentar gratuitamente
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </FadeIn>

          <FadeIn direction="right" delay={0.15} className="flex-1 w-full">
            <div className="space-y-4">
              {SOLUTIONS.map((s, i) => (
                <FadeIn key={i} delay={0.15 + i * 0.07}>
                  <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:border-teal-100 hover:bg-teal-50/30 transition-all duration-200 group">
                    <div
                      className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}
                      aria-hidden="true"
                    >
                      <s.icon className={`w-5 h-5 ${s.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 text-sm">{s.title}</h3>
                        <CheckCircle
                          className="w-4 h-4 text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-slate-500 text-sm">{s.description}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
