import React, { useState, useEffect } from "react";
import "./_group.css";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { 
  Check, X, FileText, CalendarDays, Wallet, Building2, 
  PackageSearch, BarChart3, ChevronRight, Activity, 
  Stethoscope, Users, TrendingUp, ArrowRight, ShieldCheck,
  Smartphone, Brain, Network
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const Logo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro" className={className}>
    <rect width="36" height="36" rx="10" fill="currentColor" />
    <path d="M18 8v20M8 18h20" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="18" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
  </svg>
);

const marketData = [
  { year: "2024", value: 320 },
  { year: "2025", value: 410 },
  { year: "2026", value: 580 },
  { year: "2027", value: 850 },
  { year: "2028", value: 1250 },
];

const tractionData = [
  { month: "Jan", clinics: 42, mrr: 18 },
  { month: "Fev", clinics: 85, mrr: 39 },
  { month: "Mar", clinics: 140, mrr: 68 },
  { month: "Abr", clinics: 247, mrr: 124 },
];

export function Page() {
  const [activeSlide, setActiveSlide] = useState(1);
  const totalSlides = 10;

  // Simple scroll spy
  useEffect(() => {
    const handleScroll = () => {
      const slides = document.querySelectorAll(".slide-section");
      let current = 1;
      slides.forEach((slide, index) => {
        const rect = slide.getBoundingClientRect();
        if (rect.top <= window.innerHeight / 2) {
          current = index + 1;
        }
      });
      setActiveSlide(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="pitch-container min-h-[2000px] w-full max-w-[1280px] mx-auto bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] relative">
      
      {/* Slide Indicator */}
      <div className="fixed bottom-8 right-8 z-50 bg-[hsl(183,50%,9%)] text-white px-4 py-2 rounded-full font-medium text-sm shadow-xl flex items-center gap-2">
        <span>Slide {activeSlide}</span>
        <span className="text-white/50">/</span>
        <span className="text-white/50">{totalSlides}</span>
      </div>

      {/* Slide 1: CAPA */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center items-center relative px-8 py-24 border-b border-[hsl(214,32%,91%)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,40%,98%)] to-[hsl(180,40%,91%)] opacity-50 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[hsl(180,100%,25%)]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
          <div className="w-24 h-24 text-[hsl(180,100%,25%)] mb-8 drop-shadow-lg">
            <Logo className="w-full h-full" />
          </div>
          <h1 className="pitch-heading text-6xl md:text-7xl font-bold tracking-tight text-[hsl(183,50%,9%)] mb-6">
            FisioGest Pro
          </h1>
          <p className="text-2xl text-[hsl(222,47%,11%)]/70 font-medium mb-12 max-w-2xl leading-relaxed">
            A Plataforma Definitiva de Gestão Clínica para Fisioterapia e Estética.
          </p>
          <div className="flex flex-col items-center gap-2 text-sm text-[hsl(222,47%,11%)]/60 bg-white/50 px-6 py-4 rounded-2xl backdrop-blur-sm border border-[hsl(214,32%,91%)]">
            <span className="font-semibold text-[hsl(180,100%,25%)]">Apresentado por: Equipe FisioGest</span>
            <span>Abril 2026</span>
          </div>
        </div>
      </section>

      {/* Slide 2: PROBLEMA */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-white relative">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-16">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">O Problema</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              Gestão amadora custa caro.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl">
              Profissionais de saúde perdem até 30% da sua receita por falta de controle, glosas e processos ineficientes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-[hsl(210,40%,98%)] border-none shadow-md">
              <CardHeader>
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl text-[hsl(183,50%,9%)]">Desorganização</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[hsl(222,47%,11%)]/70 text-lg mb-6">
                  Prontuários de papel e planilhas desconectadas geram risco jurídico e perda de histórico clínico.
                </p>
                <div className="bg-white p-4 rounded-lg border border-[hsl(214,32%,91%)]">
                  <span className="block text-3xl font-bold text-red-500 mb-1">73%</span>
                  <span className="text-sm font-medium text-[hsl(222,47%,11%)]/60">das clínicas ainda usam Excel e papel.</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[hsl(210,40%,98%)] border-none shadow-md">
              <CardHeader>
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-4">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl text-[hsl(183,50%,9%)]">No-show Elevado</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[hsl(222,47%,11%)]/70 text-lg mb-6">
                  Falta de lembretes automáticos e políticas de cancelamento resultam em horários ociosos.
                </p>
                <div className="bg-white p-4 rounded-lg border border-[hsl(214,32%,91%)]">
                  <span className="block text-3xl font-bold text-orange-500 mb-1">18%</span>
                  <span className="text-sm font-medium text-[hsl(222,47%,11%)]/60">taxa média de no-show em clínicas.</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[hsl(210,40%,98%)] border-none shadow-md">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                  <Wallet className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl text-[hsl(183,50%,9%)]">Caos Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[hsl(222,47%,11%)]/70 text-lg mb-6">
                  Glosas de convênios, comissionamentos calculados errado e falta de previsibilidade de caixa.
                </p>
                <div className="bg-white p-4 rounded-lg border border-[hsl(214,32%,91%)]">
                  <span className="block text-3xl font-bold text-blue-500 mb-1">R$ 4.2k</span>
                  <span className="text-sm font-medium text-[hsl(222,47%,11%)]/60">perda média mensal por clínica.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Slide 3: SOLUÇÃO */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(183,50%,9%)] bg-[hsl(183,50%,9%)] text-white">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="text-[hsl(180,40%,91%)] border-[hsl(180,40%,91%)] mb-4 bg-white/5">A Solução</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-white mb-6">
              Tudo o que uma clínica precisa. <br />
              <span className="text-[hsl(180,100%,25%)]">Em um único lugar.</span>
            </h2>
            <p className="text-xl text-white/70 max-w-3xl mx-auto">
              FisioGest Pro consolida atendimento clínico, agenda inteligente e um ERP financeiro poderoso.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Stethoscope, title: "Prontuário COFFITO", desc: "Anamnese digital, evolução estruturada e assinaturas conforme conselhos." },
              { icon: CalendarDays, title: "Agenda Inteligente", desc: "Confirmação via WhatsApp, lista de espera e prevenção de conflitos." },
              { icon: Wallet, title: "Financeiro Completo", desc: "DRE, fluxo de caixa, repasses automáticos e ledger de partidas dobradas." },
              { icon: Building2, title: "Multi-Clínica", desc: "Gestão centralizada de múltiplas unidades com controle de acesso granular." },
              { icon: PackageSearch, title: "Pacotes & Assinaturas", desc: "Venda planos recorrentes, pacotes de sessões e controle saldos automaticamente." },
              { icon: BarChart3, title: "Relatórios em Tempo Real", desc: "Dashboards clínicos e financeiros para decisões baseadas em dados." }
            ].map((feature, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                <div className="w-12 h-12 bg-[hsl(180,100%,25%)]/20 text-[hsl(180,40%,91%)] rounded-xl flex items-center justify-center mb-4 border border-[hsl(180,100%,25%)]/30">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-white">{feature.title}</h3>
                <p className="text-white/60 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Slide 4: MERCADO */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-[hsl(210,40%,98%)] relative">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row gap-16 items-center">
            <div className="flex-1">
              <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">Tamanho do Mercado</Badge>
              <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
                Um oceano azul <br />em digitalização.
              </h2>
              <p className="text-xl text-[hsl(222,47%,11%)]/70 mb-10">
                O mercado de saúde suplementar e clínicas particulares no Brasil está passando por uma transformação digital forçada.
              </p>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-[hsl(214,32%,91%)] shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bottom-0 w-2 bg-[hsl(183,50%,9%)]" />
                  <div className="text-sm font-bold tracking-wider text-[hsl(222,47%,11%)]/50 uppercase mb-1">TAM (Total Addressable Market)</div>
                  <div className="text-4xl font-bold text-[hsl(183,50%,9%)]">280 mil</div>
                  <div className="text-[hsl(222,47%,11%)]/70 font-medium">Profissionais ativos no COFFITO</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-[hsl(214,32%,91%)] shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bottom-0 w-2 bg-[hsl(180,100%,25%)]" />
                  <div className="text-sm font-bold tracking-wider text-[hsl(222,47%,11%)]/50 uppercase mb-1">SAM (Serviceable Available Market)</div>
                  <div className="text-4xl font-bold text-[hsl(180,100%,25%)]">60 mil</div>
                  <div className="text-[hsl(222,47%,11%)]/70 font-medium">Pequenas e médias clínicas no Brasil</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-[hsl(214,32%,91%)] shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bottom-0 w-2 bg-[hsl(210,100%,45%)]" />
                  <div className="text-sm font-bold tracking-wider text-[hsl(222,47%,11%)]/50 uppercase mb-1">SOM (Serviceable Obtainable Market - Ano 1)</div>
                  <div className="text-4xl font-bold text-[hsl(210,100%,45%)]">6.000</div>
                  <div className="text-[hsl(222,47%,11%)]/70 font-medium">Clínicas capturadas (Meta)</div>
                </div>
              </div>
            </div>

            <div className="flex-1 bg-white p-8 rounded-3xl border border-[hsl(214,32%,91%)] shadow-xl w-full h-[600px] flex flex-col">
              <h3 className="text-xl font-bold text-[hsl(183,50%,9%)] mb-2">Crescimento do Mercado SaaS Saúde (BRL Milhões)</h3>
              <p className="text-sm text-[hsl(222,47%,11%)]/60 mb-8">Projeção conservadora de adoção de software de gestão 2024-2028</p>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marketData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(214,32%,91%)" />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: 'hsl(222,47%,11%)', opacity: 0.7}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(222,47%,11%)', opacity: 0.7}} tickFormatter={(val) => `R$${val}m`} />
                    <RechartsTooltip 
                      cursor={{fill: 'hsl(214,32%,91%)', opacity: 0.4}}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
                    />
                    <Bar dataKey="value" fill="hsl(180,100%,25%)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Slide 5: PRODUTO (Mockups) */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-white relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-[hsl(180,100%,25%)]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-6xl mx-auto w-full z-10">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">O Produto</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              Design que inspira uso diário.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl mx-auto">
              Interfaces rápidas, limpas e responsivas. Foco total na experiência do profissional de saúde.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Mockup: Dashboard */}
            <div className="bg-[hsl(210,40%,98%)] border border-[hsl(214,32%,91%)] rounded-2xl p-2 shadow-lg hover:shadow-xl transition-shadow">
              <div className="bg-white rounded-xl overflow-hidden h-full border border-[hsl(214,32%,91%)] flex flex-col">
                <div className="bg-[hsl(183,50%,9%)] px-4 py-3 flex items-center justify-between text-white border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 text-[hsl(180,100%,25%)]"><Logo className="w-full h-full" /></div>
                    <span className="font-bold text-sm">Dashboard</span>
                  </div>
                  <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-white/20"/><div className="w-3 h-3 rounded-full bg-white/20"/></div>
                </div>
                <div className="p-6 bg-[hsl(210,40%,98%)] flex-1">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[hsl(214,32%,91%)]">
                      <div className="text-xs font-medium text-[hsl(222,47%,11%)]/50 uppercase mb-1">Receita Mensal</div>
                      <div className="text-2xl font-bold text-[hsl(183,50%,9%)]">R$ 42.500,00</div>
                      <div className="text-xs text-[hsl(150,60%,40%)] flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1"/> +12.5%</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[hsl(214,32%,91%)]">
                      <div className="text-xs font-medium text-[hsl(222,47%,11%)]/50 uppercase mb-1">Atendimentos</div>
                      <div className="text-2xl font-bold text-[hsl(183,50%,9%)]">384</div>
                      <div className="text-xs text-[hsl(150,60%,40%)] flex items-center mt-1"><TrendingUp className="w-3 h-3 mr-1"/> +5.2%</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-[hsl(214,32%,91%)] h-32 flex items-end gap-2">
                    {[30, 45, 25, 60, 75, 40, 85].map((h, i) => (
                      <div key={i} className="flex-1 bg-[hsl(180,100%,25%)] rounded-t-sm" style={{height: `${h}%`, opacity: h > 60 ? 1 : 0.4}} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mockup: Agenda */}
            <div className="bg-[hsl(210,40%,98%)] border border-[hsl(214,32%,91%)] rounded-2xl p-2 shadow-lg hover:shadow-xl transition-shadow">
              <div className="bg-white rounded-xl overflow-hidden h-full border border-[hsl(214,32%,91%)] flex flex-col">
                <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-[hsl(214,32%,91%)]">
                  <div className="font-bold text-[hsl(183,50%,9%)] text-sm">Agenda de Hoje</div>
                  <Badge variant="secondary" className="bg-[hsl(180,40%,91%)] text-[hsl(180,100%,25%)]">14 Abr</Badge>
                </div>
                <div className="p-4 flex-1 space-y-3 bg-[hsl(210,40%,98%)]">
                  <div className="bg-white p-3 rounded-lg border-l-4 border-l-[hsl(180,100%,25%)] shadow-sm flex items-center gap-3">
                    <div className="text-sm font-bold text-[hsl(183,50%,9%)] w-12">09:00</div>
                    <div className="w-8 h-8 rounded-full bg-[hsl(214,32%,91%)] flex items-center justify-center text-xs font-bold">MS</div>
                    <div>
                      <div className="text-sm font-bold text-[hsl(183,50%,9%)]">Marina Silva</div>
                      <div className="text-xs text-[hsl(222,47%,11%)]/60">Pilates • Confirmado</div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border-l-4 border-l-[hsl(210,100%,45%)] shadow-sm flex items-center gap-3">
                    <div className="text-sm font-bold text-[hsl(183,50%,9%)] w-12">10:00</div>
                    <div className="w-8 h-8 rounded-full bg-[hsl(214,32%,91%)] flex items-center justify-center text-xs font-bold">JO</div>
                    <div>
                      <div className="text-sm font-bold text-[hsl(183,50%,9%)]">João Oliveira</div>
                      <div className="text-xs text-[hsl(222,47%,11%)]/60">Fisio Ortopédica • Em andamento</div>
                    </div>
                  </div>
                  <div className="bg-white/50 p-3 rounded-lg border-l-4 border-l-[hsl(214,32%,91%)] flex items-center gap-3 opacity-60">
                    <div className="text-sm font-bold text-[hsl(183,50%,9%)] w-12">11:00</div>
                    <div className="flex-1 text-xs text-[hsl(222,47%,11%)]/60 text-center py-2 border border-dashed border-[hsl(214,32%,91%)] rounded">
                      Horário Livre
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border-l-4 border-l-[hsl(43,100%,50%)] shadow-sm flex items-center gap-3">
                    <div className="text-sm font-bold text-[hsl(183,50%,9%)] w-12">13:00</div>
                    <div className="w-8 h-8 rounded-full bg-[hsl(214,32%,91%)] flex items-center justify-center text-xs font-bold">AL</div>
                    <div>
                      <div className="text-sm font-bold text-[hsl(183,50%,9%)]">Ana Lima</div>
                      <div className="text-xs text-[hsl(222,47%,11%)]/60">Avaliação • Aguardando</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Slide 6: DIFERENCIAIS (Comparativo) */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-[hsl(210,40%,98%)]">
        <div className="max-w-5xl mx-auto w-full">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">Vantagem Competitiva</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              Por que somos a escolha óbvia.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl mx-auto">
              Sistemas genéricos não entendem a complexidade clínica e financeira de uma clínica de fisioterapia. Nós fomos construídos para isso.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-[hsl(214,32%,91%)] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[hsl(214,32%,91%)] bg-[hsl(210,40%,98%)]">
                  <th className="py-6 px-8 font-bold text-[hsl(222,47%,11%)]/60 w-1/3">Feature</th>
                  <th className="py-6 px-8 text-center border-x border-[hsl(214,32%,91%)] bg-white relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[hsl(180,100%,25%)]" />
                    <div className="font-bold text-[hsl(183,50%,9%)] text-xl mb-1">FisioGest Pro</div>
                    <Badge className="bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,25%)]">Avançado</Badge>
                  </th>
                  <th className="py-6 px-8 text-center font-bold text-[hsl(222,47%,11%)]/50">ERPs Genéricos</th>
                  <th className="py-6 px-8 text-center font-bold text-[hsl(222,47%,11%)]/50">Agenda Simples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(214,32%,91%)]">
                {[
                  { name: "Prontuário focado em Fisio (COFFITO)", us: true, erp: false, agenda: false },
                  { name: "Contabilidade Partidas Dobradas (DRE real)", us: true, erp: true, agenda: false },
                  { name: "Gestão nativa de Multi-Clínicas", us: true, erp: false, agenda: false },
                  { name: "Controle de Pacotes de Sessões", us: true, erp: false, agenda: false },
                  { name: "Repasse de Comissionamento Complexo", us: true, erp: false, agenda: false },
                  { name: "Faturamento Consolidado Automático", us: true, erp: true, agenda: false },
                  { name: "Agendamento Inteligente Anti-Conflito", us: true, erp: false, agenda: true },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-[hsl(210,40%,98%)] transition-colors">
                    <td className="py-5 px-8 font-medium text-[hsl(183,50%,9%)]">{row.name}</td>
                    <td className="py-5 px-8 text-center border-x border-[hsl(214,32%,91%)] bg-white/50">
                      {row.us ? <Check className="w-6 h-6 mx-auto text-[hsl(150,60%,40%)]" /> : <X className="w-6 h-6 mx-auto text-[hsl(214,32%,91%)]" />}
                    </td>
                    <td className="py-5 px-8 text-center">
                      {row.erp ? <Check className="w-5 h-5 mx-auto text-[hsl(222,47%,11%)]/40" /> : <span className="text-[hsl(214,32%,91%)] font-bold text-xl">-</span>}
                    </td>
                    <td className="py-5 px-8 text-center">
                      {row.agenda ? <Check className="w-5 h-5 mx-auto text-[hsl(222,47%,11%)]/40" /> : <span className="text-[hsl(214,32%,91%)] font-bold text-xl">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Slide 7: PLANOS */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-white">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">Modelo de Negócio</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              SaaS Recorrente de Alta Retenção.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl mx-auto">
              Pricing desenhado para capturar valor em cada estágio de crescimento da clínica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <Card className="border-[hsl(214,32%,91%)] shadow-md">
              <CardHeader>
                <CardTitle className="text-2xl text-[hsl(183,50%,9%)]">Essencial</CardTitle>
                <CardDescription>Para profissionais autônomos</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-[hsl(183,50%,9%)]">R$ 89</span>
                  <span className="text-[hsl(222,47%,11%)]/60">/mês</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {["1 Profissional", "Agenda Básica", "Prontuário Digital", "Financeiro Simples", "Até 100 pacientes/mês", "Suporte por Email"].map((feat, i) => (
                    <li key={i} className="flex items-center text-[hsl(222,47%,11%)]/70">
                      <Check className="w-5 h-5 mr-3 text-[hsl(180,100%,25%)]" /> {feat}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">Assinar Essencial</Button>
              </CardFooter>
            </Card>

            <Card className="border-[hsl(180,100%,25%)] shadow-2xl relative transform md:scale-105 z-10 bg-[hsl(183,50%,9%)] text-white">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,25%)] text-white px-4 py-1 text-sm">Mais Escolhido</Badge>
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-white">Profissional</CardTitle>
                <CardDescription className="text-white/70">Para clínicas em crescimento</CardDescription>
                <div className="mt-4">
                  <span className="text-5xl font-bold text-white">R$ 189</span>
                  <span className="text-white/60">/mês</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {["Até 5 Profissionais", "Agenda Inteligente", "Prontuário Avançado", "Gestão de Pacotes", "DRE e Fluxo de Caixa", "Suporte WhatsApp"].map((feat, i) => (
                    <li key={i} className="flex items-center text-white/90">
                      <Check className="w-5 h-5 mr-3 text-[hsl(180,40%,91%)]" /> {feat}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,25%)]/90 text-white">Assinar Profissional</Button>
              </CardFooter>
            </Card>

            <Card className="border-[hsl(214,32%,91%)] shadow-md">
              <CardHeader>
                <CardTitle className="text-2xl text-[hsl(183,50%,9%)]">Empresarial</CardTitle>
                <CardDescription>Para redes de clínicas</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-[hsl(183,50%,9%)]">R$ 449</span>
                  <span className="text-[hsl(222,47%,11%)]/60">/mês</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {["Múltiplas Clínicas", "Profissionais Ilimitados", "Ledger Contábil", "Comissionamento Custom", "API Pública", "Suporte Dedicado 24/7"].map((feat, i) => (
                    <li key={i} className="flex items-center text-[hsl(222,47%,11%)]/70">
                      <Check className="w-5 h-5 mr-3 text-[hsl(180,100%,25%)]" /> {feat}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">Falar com Vendas</Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Slide 8: ROADMAP */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-[hsl(210,40%,98%)]">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-20 text-center">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">Visão de Futuro</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              O Roadmap de Expansão.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl mx-auto">
              Construindo um ecossistema que vai além da gestão, entrando em inteligência clínica e conectividade.
            </p>
          </div>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute top-[40px] left-0 right-0 h-1 bg-[hsl(214,32%,91%)] hidden md:block" />
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {[
                { 
                  q: "Q2 2026", 
                  title: "Mobilidade", 
                  icon: Smartphone,
                  items: ["App Nativo iOS/Android", "Agendamento Paciente", "Check-in via QR Code"]
                },
                { 
                  q: "Q3 2026", 
                  title: "Conectividade", 
                  icon: Network,
                  items: ["Telemedicina Integrada", "Integração Padrão TISS", "Pagamentos via Pix/Cartão"]
                },
                { 
                  q: "Q4 2026", 
                  title: "Inteligência", 
                  icon: Brain,
                  items: ["IA para Análise de Evolução", "Predição de No-show", "Benchmarking Financeiro"]
                },
                { 
                  q: "Q1 2027", 
                  title: "Ecossistema", 
                  icon: ShieldCheck,
                  items: ["Marketplace de Cursos", "Seguro Profissional", "Marketplace Materiais"]
                }
              ].map((quarter, i) => (
                <div key={i} className="relative pt-0 md:pt-16">
                  <div className="md:absolute top-0 left-1/2 md:-translate-x-1/2 w-20 h-20 bg-white rounded-2xl shadow-md border-2 border-[hsl(180,100%,25%)] flex items-center justify-center text-[hsl(180,100%,25%)] mb-6 md:mb-0 z-10">
                    <quarter.icon className="w-8 h-8" />
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-[hsl(214,32%,91%)] shadow-sm text-center">
                    <Badge variant="secondary" className="mb-3 bg-[hsl(214,32%,91%)]">{quarter.q}</Badge>
                    <h3 className="text-xl font-bold text-[hsl(183,50%,9%)] mb-4">{quarter.title}</h3>
                    <ul className="text-left space-y-2">
                      {quarter.items.map((item, j) => (
                        <li key={j} className="text-sm text-[hsl(222,47%,11%)]/70 flex items-start gap-2">
                          <ChevronRight className="w-4 h-4 text-[hsl(180,100%,25%)] mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Slide 9: TRAÇÃO */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center px-12 py-24 border-b border-[hsl(214,32%,91%)] bg-white">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="text-[hsl(180,100%,25%)] border-[hsl(180,100%,25%)] mb-4 bg-[hsl(180,40%,91%)]/30">Métricas de Tração</Badge>
            <h2 className="pitch-heading text-4xl md:text-5xl font-bold text-[hsl(183,50%,9%)] mb-6">
              Provando o Product-Market Fit.
            </h2>
            <p className="text-xl text-[hsl(222,47%,11%)]/70 max-w-3xl mx-auto">
              Crescimento acelerado nos primeiros meses de operação com métricas SaaS classe mundial.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            {[
              { label: "MRR Atual", value: "R$ 124,5k", trend: "+82% MoM" },
              { label: "Clínicas Ativas", value: "247", trend: "+76% MoM" },
              { label: "NPS", value: "72", trend: "Zona de Excelência" },
              { label: "Churn Mensal", value: "2,1%", trend: "Abaixo da média (5%)" }
            ].map((kpi, i) => (
              <div key={i} className="bg-[hsl(210,40%,98%)] p-6 rounded-2xl border border-[hsl(214,32%,91%)]">
                <div className="text-sm font-medium text-[hsl(222,47%,11%)]/60 mb-2">{kpi.label}</div>
                <div className="text-3xl lg:text-4xl font-bold text-[hsl(183,50%,9%)] mb-2">{kpi.value}</div>
                <div className="text-xs font-semibold text-[hsl(150,60%,40%)]">{kpi.trend}</div>
              </div>
            ))}
          </div>

          <div className="bg-[hsl(210,40%,98%)] p-8 rounded-3xl border border-[hsl(214,32%,91%)] shadow-sm w-full h-[400px]">
            <h3 className="text-lg font-bold text-[hsl(183,50%,9%)] mb-6">Crescimento de Clínicas e MRR (2026)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tractionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMRR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(180,100%,25%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(180,100%,25%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tickFormatter={(val) => `${val}`} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val}k`} />
                <RechartsTooltip 
                  contentStyle={{borderRadius: '12px', border: '1px solid hsl(214,32%,91%)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
                />
                <Area yAxisId="left" type="monotone" dataKey="clinics" name="Clínicas Ativas" stroke="hsl(222,47%,11%)" fillOpacity={0} strokeWidth={3} />
                <Area yAxisId="right" type="monotone" dataKey="mrr" name="MRR" stroke="hsl(180,100%,25%)" fill="url(#colorMRR)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Slide 10: CTA + CONTATO */}
      <section className="slide-section min-h-[800px] flex flex-col justify-center items-center relative px-8 py-24 bg-[hsl(183,50%,9%)] overflow-hidden text-center">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djI2aDJWMzRoLTIyem0tMjAgMHYyNkgyVjM0aDeyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
        
        <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
          <div className="w-20 h-20 text-[hsl(180,100%,25%)] mb-8">
            <Logo className="w-full h-full" />
          </div>
          <h2 className="pitch-heading text-5xl md:text-6xl font-bold text-white mb-8 leading-tight">
            Pronto para transformar a gestão de clínicas?
          </h2>
          
          <Button className="bg-[hsl(180,100%,25%)] hover:bg-[hsl(180,100%,25%)]/90 text-white text-lg h-14 px-8 rounded-full mb-16 group shadow-[0_0_40px_-10px_hsl(180,100%,25%)]">
            Comece em 7 dias grátis
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left w-full max-w-2xl border-t border-white/10 pt-12">
            <div>
              <div className="text-[hsl(180,40%,91%)]/60 text-sm font-semibold uppercase mb-2">Email</div>
              <div className="text-white text-lg">contato@fisiogest.com.br</div>
            </div>
            <div>
              <div className="text-[hsl(180,40%,91%)]/60 text-sm font-semibold uppercase mb-2">Telefone</div>
              <div className="text-white text-lg">(11) 9 9999-9999</div>
            </div>
            <div>
              <div className="text-[hsl(180,40%,91%)]/60 text-sm font-semibold uppercase mb-2">Site Oficial</div>
              <div className="text-white text-lg">fisiogest.com.br</div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
