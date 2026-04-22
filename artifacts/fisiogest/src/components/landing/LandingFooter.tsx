import { Link } from "wouter";
import LogoMark from "@/components/logo-mark";
import { Mail, Phone, MapPin, Instagram, Linkedin, Facebook } from "lucide-react";

const FOOTER_LINKS = {
  Produto: [
    { label: "Funcionalidades", href: "#recursos" },
    { label: "Planos", href: "#planos" },
    { label: "Depoimentos", href: "#depoimentos" },
    { label: "FAQ", href: "#faq" },
  ],
  Sistema: [
    { label: "Entrar", href: "/login", isRouter: true },
    { label: "Criar conta", href: "/register", isRouter: true },
    { label: "Agendar demo", href: "mailto:contato@fisiogest.com.br" },
  ],
  Legal: [
    { label: "Privacidade", href: "#" },
    { label: "Termos de uso", href: "#" },
    { label: "LGPD", href: "#" },
  ],
};

const SOCIAL_LINKS = [
  {
    label: "Instagram do FisioGest Pro",
    icon: Instagram,
    href: "https://instagram.com/fisiogestpro",
  },
  {
    label: "LinkedIn do FisioGest Pro",
    icon: Linkedin,
    href: "https://linkedin.com/company/fisiogestpro",
  },
  {
    label: "Facebook do FisioGest Pro",
    icon: Facebook,
    href: "https://facebook.com/fisiogestpro",
  },
];

export function LandingFooter() {
  const scrollTo = (href: string) => {
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <footer
      id="contato"
      role="contentinfo"
      className="bg-[#040c19] border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <LogoMark className="w-8 h-8" />
              <span className="font-display font-bold text-white text-xl">
                FisioGest <span className="text-teal-400">Pro</span>
              </span>
            </div>
            <p className="text-white/35 text-sm leading-relaxed mb-6 max-w-xs">
              A plataforma definitiva para gestão de clínicas de fisioterapia,
              estética e pilates. Simples, completo e desenvolvido para o mercado
              brasileiro.
            </p>

            <div className="space-y-2.5">
              <a
                href="mailto:contato@fisiogest.com.br"
                className="flex items-center gap-2.5 text-white/30 text-sm hover:text-white/60 transition-colors"
                aria-label="Enviar e-mail para FisioGest Pro"
              >
                <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                contato@fisiogest.com.br
              </a>
              <div className="flex items-center gap-2.5 text-white/30 text-sm">
                <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                São Paulo, SP — Brasil
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
                >
                  <s.icon className="w-4 h-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <h3 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-4">
                {section}
              </h3>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    {"isRouter" in l && l.isRouter ? (
                      <Link
                        href={l.href}
                        className="text-white/30 text-sm hover:text-white/60 transition-colors"
                      >
                        {l.label}
                      </Link>
                    ) : l.href.startsWith("#") ? (
                      <button
                        onClick={() => scrollTo(l.href)}
                        className="text-white/30 text-sm hover:text-white/60 transition-colors text-left"
                      >
                        {l.label}
                      </button>
                    ) : (
                      <a
                        href={l.href}
                        className="text-white/30 text-sm hover:text-white/60 transition-colors"
                      >
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/20 text-xs text-center md:text-left">
            © {new Date().getFullYear()} FisioGest. Todos os direitos reservados.
          </p>
          <p className="text-white/15 text-xs">
            Desenvolvido com ♥ para fisioterapeutas brasileiros
          </p>
        </div>
      </div>
    </footer>
  );
}
