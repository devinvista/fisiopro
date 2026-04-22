import { FadeIn } from "./utils";
import { AnimatedCounter } from "./utils";

export function StatsSection() {
  const stats = [
    { value: 500, suffix: "+", label: "Clínicas ativas" },
    { value: 50000, suffix: "+", label: "Pacientes cadastrados" },
    { value: 1200000, suffix: "+", label: "Atendimentos registrados" },
    { value: 99, suffix: "%", label: "Satisfação dos clientes" },
  ];

  return (
    <section aria-label="Números do FisioGest Pro" className="bg-gradient-to-r from-teal-600 to-cyan-600 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-white text-center">
          {stats.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div>
                <div className="font-display font-bold text-4xl lg:text-5xl mb-1">
                  <AnimatedCounter value={s.value} suffix={s.suffix} />
                </div>
                <div className="text-white/70 text-sm font-medium">{s.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
