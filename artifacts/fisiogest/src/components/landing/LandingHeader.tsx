import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import LogoMark from "@/components/logo-mark";

const NAV_LINKS = [
  { label: "Recursos", href: "#recursos" },
  { label: "Benefícios", href: "#beneficios" },
  { label: "Planos", href: "#planos" },
  { label: "Contato", href: "#contato" },
];

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header
      role="banner"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="FisioGest Pro — Página inicial">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <LogoMark className="w-8 h-8" />
            <span
              className={`font-display font-bold text-xl transition-colors ${
                scrolled ? "text-slate-900" : "text-white"
              }`}
            >
              FisioGest{" "}
              <span className={scrolled ? "text-teal-600" : "text-teal-400"}>
                Pro
              </span>
            </span>
          </div>
        </Link>

        <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => scrollTo(l.href)}
              aria-label={`Ir para seção ${l.label}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                scrolled
                  ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className={`text-sm font-medium transition-colors ${
              scrolled
                ? "text-slate-600 hover:text-slate-900"
                : "text-white/80 hover:text-white"
            }`}
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-0.5 transition-all duration-200"
          >
            Começar agora
          </Link>
        </div>

        <button
          className={`md:hidden p-2 rounded-lg transition-colors ${
            scrolled ? "text-slate-600" : "text-white"
          }`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Abrir menu de navegação"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            aria-label="Menu mobile"
            className="md:hidden bg-white border-b border-slate-200 px-4 pb-4"
          >
            {NAV_LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.href)}
                className="block w-full text-left px-3 py-3 text-slate-700 text-sm font-medium hover:text-teal-600 border-b border-slate-100 last:border-0"
              >
                {l.label}
              </button>
            ))}
            <div className="flex gap-3 mt-4">
              <Link
                href="/login"
                className="flex-1 text-center py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="flex-1 text-center py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl"
              >
                Começar agora
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
