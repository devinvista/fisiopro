import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  ChevronRight,
  Play,
  Star,
  Shield,
  Activity,
  Calendar,
  Users,
  DollarSign,
  BarChart3,
  FileText,
  TrendingUp,
} from "lucide-react";

function DashboardMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-teal-500/20 via-transparent to-cyan-400/10 blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 bg-[#0f1a2e]">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#0a1220] border-b border-white/5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
          <div className="ml-4 flex-1 bg-white/5 rounded-md px-3 py-1 text-xs text-white/30 flex items-center gap-2">
            <Shield className="w-3 h-3" />
            app.fisiogest.com.br/dashboard
          </div>
        </div>
        <div className="flex h-80">
          <div className="w-16 bg-[#07111e] flex flex-col items-center py-4 gap-4 border-r border-white/5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-teal-400" />
            </div>
            {[Calendar, Users, DollarSign, BarChart3, FileText].map((Icon, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  i === 0
                    ? "bg-teal-600/30 ring-1 ring-teal-500/50"
                    : "hover:bg-white/5"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    i === 0 ? "text-teal-300" : "text-white/25"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Receita", value: "R$ 12.450", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "Pacientes", value: "142", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "Hoje", value: "8 atend.", icon: Calendar, color: "text-teal-400", bg: "bg-teal-500/10" },
              ].map((k, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <div className={`w-5 h-5 rounded-md ${k.bg} flex items-center justify-center mb-1.5`}>
                    <k.icon className={`w-3 h-3 ${k.color}`} />
                  </div>
                  <div className="text-white text-xs font-bold">{k.value}</div>
                  <div className="text-white/30 text-[9px]">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-white/30 text-[10px] mb-2 font-medium uppercase tracking-widest">
                Agenda de hoje
              </div>
              {[
                { name: "Maria S.", time: "08:00", status: "done", procedure: "Fisioterapia" },
                { name: "João P.", time: "09:30", status: "current", procedure: "Pilates" },
                { name: "Ana C.", time: "11:00", status: "next", procedure: "Drenagem" },
                { name: "Carlos M.", time: "14:00", status: "pending", procedure: "Acupuntura" },
              ].map((appt, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${
                    i === 1
                      ? "bg-teal-500/10 border-teal-500/30"
                      : "bg-white/3 border-white/5"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      i === 0
                        ? "bg-emerald-400"
                        : i === 1
                        ? "bg-teal-400 animate-pulse"
                        : i === 2
                        ? "bg-blue-400"
                        : "bg-white/20"
                    }`}
                  />
                  <span className="text-[10px] text-white/40 w-8 shrink-0">{appt.time}</span>
                  <span className="text-[10px] text-white/70 flex-1 truncate">{appt.name}</span>
                  <span className="text-[9px] text-white/30 truncate">{appt.procedure}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-36 bg-[#07111e] border-l border-white/5 p-3 hidden xl:block">
            <div className="text-white/30 text-[9px] uppercase tracking-widest mb-2">Ocupação</div>
            <div className="relative w-full aspect-square flex items-center justify-center mb-3">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#14b8a6" strokeWidth="3"
                  strokeDasharray="72 100" strokeLinecap="round" />
              </svg>
              <div className="absolute text-center">
                <div className="text-teal-300 font-bold text-sm">72%</div>
                <div className="text-white/25 text-[8px]">taxa</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {["Fis.", "Pilates", "Estética"].map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
                      style={{ width: `${[80, 60, 45][i]}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/25">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface HeroSectionProps {
  onScrollTo: (href: string) => void;
}

export function HeroSection({ onScrollTo }: HeroSectionProps) {
  return (
    <section
      id="hero"
      aria-labelledby="hero-headline"
      className="relative min-h-screen flex items-center bg-[#060f1e] overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl animate-[pulse_6s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl animate-[pulse_8s_ease-in-out_infinite_2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-600/5 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-32 lg:py-0 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 min-h-screen lg:pt-16">
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-8"
            >
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
              Sistema completo para gestão de clínicas
            </motion.div>

            <motion.h1
              id="hero-headline"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="font-display font-bold text-white text-5xl sm:text-6xl lg:text-7xl leading-[1.08] tracking-tight mb-6"
            >
              Sistema completo para{" "}
              <span className="relative">
                <span className="bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
                  gestão de clínicas
                </span>
                <span
                  className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-teal-400/60 to-cyan-300/60"
                  aria-hidden="true"
                />
              </span>{" "}
              e profissionais da saúde.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="text-white/55 text-xl leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0"
            >
              Agenda, pacientes, financeiro e relatórios em um único lugar.
              Simples, rápido e feito para fisioterapeutas.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-semibold px-8 py-4 rounded-2xl text-base shadow-2xl shadow-teal-500/30 hover:shadow-teal-500/50 hover:-translate-y-1 transition-all duration-200"
                aria-label="Testar FisioGest Pro gratuitamente"
              >
                Testar grátis
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-semibold px-8 py-4 rounded-2xl text-base backdrop-blur-sm transition-all duration-200"
                aria-label="Entrar no sistema FisioGest Pro"
              >
                <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                Entrar no sistema
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.75 }}
              className="mt-10 flex items-center gap-6 justify-center lg:justify-start"
            >
              <div className="flex -space-x-2" aria-hidden="true">
                {["MT", "JP", "AS", "CR", "LF"].map((initials, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-600 border-2 border-[#060f1e] flex items-center justify-center text-[9px] font-bold text-white"
                  >
                    {initials}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5" aria-label="5 estrelas">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                  ))}
                </div>
                <p className="text-white/40 text-xs">+500 clínicas confiam no FisioGest Pro</p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex-1 w-full max-w-2xl lg:max-w-none"
            aria-label="Prévia do sistema FisioGest Pro"
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20"
        aria-hidden="true"
      >
        <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent mx-auto mb-2" />
        <ChevronRight className="w-4 h-4 rotate-90" />
      </motion.div>
    </section>
  );
}
