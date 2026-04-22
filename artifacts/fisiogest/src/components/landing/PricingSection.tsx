import { FadeIn } from "./utils";
import { Link } from "wouter";
import { CheckCircle, DollarSign, ArrowRight } from "lucide-react";

interface PricingCardProps {
  plan: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
}

function PricingCard({
  plan,
  price,
  period = "/mês",
  description,
  features,
  cta,
  ctaHref,
  highlighted = false,
  badge = "",
}: PricingCardProps) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl p-8 border transition-all duration-300 ${
        highlighted
          ? "bg-[#0a1628] border-teal-500/40 shadow-2xl shadow-teal-500/20 scale-105"
          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg"
      }`}
      aria-label={`Plano ${plan}`}
    >
      {badge && (
        <div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-teal-500/30"
          aria-label={badge}
        >
          {badge}
        </div>
      )}

      <div className={`text-sm font-semibold mb-1 ${highlighted ? "text-teal-400" : "text-teal-600"}`}>
        {plan}
      </div>
      <p className={`text-sm mb-5 ${highlighted ? "text-white/40" : "text-slate-400"}`}>
        {description}
      </p>

      <div className="mb-6">
        <span className={`font-display text-5xl font-bold ${highlighted ? "text-white" : "text-slate-900"}`}>
          {price}
        </span>
        <span className={`text-sm ml-1 ${highlighted ? "text-white/40" : "text-slate-400"}`}>
          {period}
        </span>
      </div>

      <ul className="space-y-3 mb-8 flex-1" aria-label={`Recursos do plano ${plan}`}>
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <CheckCircle
              className={`w-4 h-4 mt-0.5 shrink-0 ${highlighted ? "text-teal-400" : "text-teal-500"}`}
              aria-hidden="true"
            />
            <span className={highlighted ? "text-white/70" : "text-slate-600"}>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 text-center block ${
          highlighted
            ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-teal-500/40 hover:-translate-y-0.5"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
        aria-label={`${cta} — Plano ${plan}`}
      >
        {cta}
      </Link>
    </article>
  );
}

export function PricingSection() {
  const plans: PricingCardProps[] = [
    {
      plan: "Essencial",
      price: "R$ 89",
      description: "Para profissionais autônomos",
      features: [
        "1 fisioterapeuta",
        "Até 100 pacientes",
        "Agenda completa",
        "Prontuários digitais",
        "Controle financeiro básico",
        "Suporte por e-mail",
      ],
      cta: "Começar grátis",
      ctaHref: "/register?plano=essencial",
    },
    {
      plan: "Profissional",
      price: "R$ 179",
      description: "Para clínicas em crescimento",
      features: [
        "Até 3 fisioterapeutas",
        "Pacientes ilimitados",
        "Tudo do plano Essencial",
        "Relatórios avançados",
        "Agendamento online",
        "Suporte prioritário",
        "Multi-procedimentos e pacotes",
      ],
      cta: "Assinar agora",
      ctaHref: "/register?plano=profissional",
      highlighted: true,
      badge: "Mais popular",
    },
    {
      plan: "Premium",
      price: "R$ 349",
      description: "Para redes e franquias",
      features: [
        "Fisioterapeutas ilimitados",
        "Pacientes ilimitados",
        "Multi-clínica",
        "Controle de acesso avançado",
        "API e integrações",
        "Gerente de conta dedicado",
        "Treinamento personalizado",
      ],
      cta: "Começar grátis",
      ctaHref: "/register?plano=premium",
    },
  ];

  return (
    <section
      id="planos"
      aria-labelledby="pricing-heading"
      className="py-24 lg:py-32 bg-slate-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-100 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />
            Planos e preços
          </div>
          <h2
            id="pricing-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            Investimento que cabe
            <br className="hidden sm:block" /> no orçamento da sua clínica
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            30 dias grátis em qualquer plano. Sem cartão de crédito. Cancele quando quiser.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-4 items-start">
          {plans.map((plan, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <PricingCard {...plan} />
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35} className="text-center mt-10">
          <p className="text-slate-400 text-sm">
            Precisa de um plano personalizado?{" "}
            <a
              href="mailto:contato@fisiogest.com.br"
              className="text-teal-600 font-medium hover:underline"
              aria-label="Entrar em contato para plano personalizado"
            >
              Entre em contato
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
