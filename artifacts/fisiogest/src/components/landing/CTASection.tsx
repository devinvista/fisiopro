import { FadeIn } from "./utils";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";

export function CTASection() {
  return (
    <section
      id="cta"
      aria-labelledby="cta-heading"
      className="relative bg-[#060f1e] py-24 lg:py-32 overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <FadeIn>
          <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            30 dias grátis · Sem cartão de crédito
          </div>
          <h2
            id="cta-heading"
            className="font-display font-bold text-white text-4xl lg:text-6xl mb-6 leading-tight"
          >
            Sua clínica merece
            <br /> uma gestão{" "}
            <span className="bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
              profissional.
            </span>
          </h2>
          <p className="text-white/50 text-lg mb-12 max-w-xl mx-auto">
            Junte-se a mais de 500 clínicas que já transformaram sua gestão com
            FisioGest Pro. Comece hoje mesmo, sem compromisso.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-semibold px-10 py-4 rounded-2xl text-base shadow-2xl shadow-teal-500/30 hover:shadow-teal-500/50 hover:-translate-y-1 transition-all duration-200"
              aria-label="Começar a usar FisioGest Pro gratuitamente"
            >
              Começar Gratuitamente
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-semibold px-10 py-4 rounded-2xl text-base backdrop-blur-sm transition-all"
              aria-label="Entrar na conta existente"
            >
              Já tenho uma conta
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
