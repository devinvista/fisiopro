import { FadeIn } from "./utils";
import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Antes usávamos planilhas para tudo. O FisioGest Pro transformou completamente nossa rotina. Em uma semana já estávamos rodando com 100% da equipe e reduzimos conflitos de agenda a zero.",
    name: "Dra. Marina Tavares",
    role: "Fisioterapeuta",
    clinic: "Clínica Renascer · São Paulo, SP",
    stars: 5,
    initials: "MT",
    gradient: "from-teal-400 to-cyan-600",
  },
  {
    quote:
      "A agenda integrada com o financeiro é incrível. Conseguimos aumentar nossa taxa de ocupação em 28% no primeiro trimestre e finalmente enxergamos para onde vai cada real da clínica.",
    name: "João Pedro Alves",
    role: "Gestor e Fisioterapeuta",
    clinic: "Clínica Revitaliza · Rio de Janeiro, RJ",
    stars: 5,
    initials: "JP",
    gradient: "from-blue-400 to-indigo-600",
  },
  {
    quote:
      "O suporte é excepcional — respondem em minutos. O sistema é super intuitivo e minha equipe aprendeu a usar em menos de um dia. Os prontuários digitais salvaram muito tempo.",
    name: "Adriana Sousa",
    role: "Proprietária",
    clinic: "Studio Pilates & Estética · Belo Horizonte, MG",
    stars: 5,
    initials: "AS",
    gradient: "from-violet-400 to-purple-600",
  },
];

export function TestimonialsSection() {
  return (
    <section
      id="depoimentos"
      aria-labelledby="testimonials-heading"
      className="py-24 lg:py-32 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <Star className="w-3.5 h-3.5 fill-amber-500" aria-hidden="true" />
            Depoimentos reais
          </div>
          <h2
            id="testimonials-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            Clínicas reais,
            <br className="hidden sm:block" /> resultados reais
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Veja o que profissionais de saúde estão dizendo sobre o FisioGest Pro.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <blockquote className="h-full p-7 rounded-2xl border border-slate-200 bg-white hover:border-teal-100 hover:shadow-xl hover:shadow-teal-500/5 transition-all duration-300 flex flex-col">
                <div className="flex gap-1 mb-4" aria-label={`${t.stars} estrelas`}>
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star
                      key={j}
                      className="w-4 h-4 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-6 flex-1 italic">
                  "{t.quote}"
                </p>
                <footer className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-sm font-bold shrink-0`}
                    aria-hidden="true"
                  >
                    {t.initials}
                  </div>
                  <div>
                    <cite className="not-italic text-slate-900 font-semibold text-sm">
                      {t.name}
                    </cite>
                    <div className="text-slate-400 text-xs">{t.role}</div>
                    <div className="text-slate-400 text-xs">{t.clinic}</div>
                  </div>
                </footer>
              </blockquote>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
