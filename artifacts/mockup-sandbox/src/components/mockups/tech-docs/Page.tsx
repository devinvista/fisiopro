import React from "react";
import {
  Server,
  Database,
  Globe,
  Layers,
  Shield,
  Activity,
  Cpu,
  Code,
  FileCode,
  Box,
  LayoutTemplate,
  CalendarDays,
  HeartHandshake,
  Dumbbell,
  Wallet,
  Package,
  LineChart,
  Users,
  Settings,
  Lock,
  Clock,
  Terminal,
  CheckCircle2,
  ArrowRight,
  DatabaseZap,
  Network,
  KeyRound
} from "lucide-react";
import "./_group.css";

const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="FisioGest Pro" className={className}>
    <rect width="36" height="36" rx="10" fill="currentColor" />
    <path d="M18 8v20M8 18h20" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="18" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
  </svg>
);

export function Page() {
  return (
    <div className="min-h-[2000px] w-full bg-[hsl(210,40%,98%)] text-[hsl(222,47%,11%)] tech-docs-container selection:bg-[hsl(180,100%,25%)] selection:text-white">
      
      {/* 1. Capa Técnica */}
      <header className="bg-[hsl(183,50%,9%)] text-white pt-24 pb-32 px-8 relative overflow-hidden border-b-4 border-[hsl(180,100%,25%)]">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        <div className="max-w-[1280px] mx-auto relative z-10 flex flex-col items-center text-center">
          <div className="text-[hsl(180,100%,25%)] mb-8">
            <Logo className="w-24 h-24" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tech-docs-heading tracking-tight">
            Documentação Técnica <span className="text-[hsl(180,100%,25%)]">v1.0</span>
          </h1>
          <p className="text-xl md:text-2xl text-[hsl(214,32%,91%)] mb-10 max-w-3xl font-light">
            Arquitetura, Módulos, Fluxos & Deploy
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {['React 19', 'Vite 7', 'Express 5', 'PostgreSQL', 'Drizzle', 'pnpm 10', 'Node 22'].map(tag => (
              <span key={tag} className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm font-medium tracking-wide backdrop-blur-sm">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-8 py-16 flex flex-col gap-24">

        {/* 2. Stack Overview */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <Layers className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Stack Overview</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { name: 'React', ver: '19', desc: 'UI Library', color: 'text-sky-500' },
              { name: 'Vite', ver: '7', desc: 'Bundler / Dev Server', color: 'text-purple-500' },
              { name: 'TailwindCSS', ver: 'v4', desc: 'Styling', color: 'text-cyan-400' },
              { name: 'shadcn/ui', ver: 'new-york', desc: 'Component System', color: 'text-zinc-800' },
              { name: 'Express', ver: '5', desc: 'REST API Framework', color: 'text-green-600' },
              { name: 'Node.js', ver: '22 LTS', desc: 'Runtime', color: 'text-green-500' },
              { name: 'PostgreSQL', ver: '16', desc: 'Database', color: 'text-blue-600' },
              { name: 'Drizzle ORM', ver: '0.30', desc: 'Database Toolkit', color: 'text-lime-500' },
              { name: 'Zod', ver: '4', desc: 'Schema Validation', color: 'text-indigo-500' },
              { name: 'pnpm', ver: '10', desc: 'Package Manager', color: 'text-yellow-500' },
              { name: 'JWT + bcryptjs', ver: '', desc: 'Auth & Security', color: 'text-red-500' },
              { name: 'Recharts', ver: '2', desc: 'Data Visualization', color: 'text-teal-500' },
              { name: 'TypeScript', ver: '5.9', desc: 'Type System', color: 'text-blue-500' },
              { name: 'Vitest', ver: '1.5', desc: 'Test Runner', color: 'text-yellow-400' },
            ].map((tech) => (
              <div key={tech.name} className="p-5 rounded-xl border border-[hsl(214,32%,91%)] bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-bold text-xl ${tech.color}`}>{tech.name.charAt(0)}</span>
                  {tech.ver && <span className="text-xs font-mono bg-[hsl(210,40%,98%)] px-2 py-1 rounded text-[hsl(180,100%,25%)] border border-[hsl(180,40%,91%)]">{tech.ver}</span>}
                </div>
                <h3 className="font-semibold text-lg">{tech.name}</h3>
                <p className="text-sm text-[hsl(214,15%,40%)] mt-1">{tech.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Diagrama de arquitetura monorepo */}
        <section className="bg-white p-8 rounded-2xl border border-[hsl(214,32%,91%)] shadow-sm">
          <div className="flex items-center gap-3 mb-10">
            <Network className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Arquitetura Monorepo</h2>
          </div>
          
          <div className="relative bg-[hsl(210,40%,98%)] p-8 rounded-xl border border-dashed border-[hsl(180,40%,91%)]">
            <div className="absolute top-4 left-4 text-xs font-bold tracking-widest text-[hsl(180,100%,25%)] uppercase opacity-70">Replit Container (NixOS)</div>
            
            {/* Top: Proxy */}
            <div className="flex justify-center mb-12 mt-4">
              <div className="bg-[hsl(183,50%,9%)] text-white px-8 py-3 rounded-lg font-mono text-sm border-2 border-[hsl(180,100%,25%)] shadow-lg z-10">
                Replit Reverse Proxy (80/443)
              </div>
            </div>

            {/* Arrows from Proxy to Artifacts */}
            <svg className="absolute top-[80px] left-0 w-full h-[60px] pointer-events-none" style={{ zIndex: 0 }}>
              <path d="M 50% 0 L 50% 30 L 20% 30 L 20% 60" fill="none" stroke="hsl(180,40%,70%)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              <path d="M 50% 0 L 50% 60" fill="none" stroke="hsl(180,40%,70%)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              <path d="M 50% 0 L 50% 30 L 80% 30 L 80% 60" fill="none" stroke="hsl(180,40%,70%)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(180,40%,70%)" />
                </marker>
              </defs>
            </svg>

            {/* Middle: Artifacts */}
            <div className="grid grid-cols-3 gap-8 relative z-10">
              <div className="bg-white p-5 rounded-xl border border-[hsl(214,32%,91%)] shadow-sm flex flex-col items-center">
                <Globe className="w-6 h-6 text-sky-500 mb-2" />
                <div className="font-bold text-sm mb-1">artifacts/fisiogest</div>
                <div className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded font-mono mb-2">Port 3000</div>
                <div className="text-xs text-center text-gray-500">Vite dev → React 19</div>
                <div className="text-[10px] font-mono text-gray-400 mt-2 bg-gray-50 px-2 py-1 rounded w-full text-center">Path: /</div>
              </div>
              
              <div className="bg-white p-5 rounded-xl border border-[hsl(180,100%,25%)] shadow-md flex flex-col items-center relative">
                <Server className="w-6 h-6 text-[hsl(180,100%,25%)] mb-2" />
                <div className="font-bold text-sm mb-1">artifacts/api-server</div>
                <div className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded font-mono mb-2">Port 8080</div>
                <div className="text-xs text-center text-gray-500">Express 5 → tsx</div>
                <div className="text-[10px] font-mono text-gray-400 mt-2 bg-gray-50 px-2 py-1 rounded w-full text-center">Path: /api</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-[hsl(214,32%,91%)] shadow-sm flex flex-col items-center">
                <LayoutTemplate className="w-6 h-6 text-purple-500 mb-2" />
                <div className="font-bold text-sm mb-1">artifacts/mockup-sandbox</div>
                <div className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded font-mono mb-2">Port 8081</div>
                <div className="text-xs text-center text-gray-500">Vite dev → React 19</div>
                <div className="text-[10px] font-mono text-gray-400 mt-2 bg-gray-50 px-2 py-1 rounded w-full text-center">Path: /__mockup</div>
              </div>
            </div>

            {/* Bottom: Libs & DB */}
            <div className="mt-16 relative">
              {/* Arrows from Artifacts to Libs */}
              <svg className="absolute -top-[40px] left-0 w-full h-[40px] pointer-events-none" style={{ zIndex: 0 }}>
                <path d="M 20% 0 L 20% 20 L 50% 20 L 50% 40" fill="none" stroke="hsl(214,32%,80%)" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M 50% 0 L 50% 40" fill="none" stroke="hsl(214,32%,80%)" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M 80% 0 L 80% 20 L 50% 20 L 50% 40" fill="none" stroke="hsl(214,32%,80%)" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>

              <div className="grid grid-cols-4 gap-4 mb-8 relative z-10">
                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center flex flex-col items-center justify-center">
                  <DatabaseZap className="w-4 h-4 text-gray-500 mb-1" />
                  <span className="text-xs font-mono font-semibold">lib/db</span>
                </div>
                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center flex flex-col items-center justify-center">
                  <Shield className="w-4 h-4 text-gray-500 mb-1" />
                  <span className="text-xs font-mono font-semibold">lib/api-zod</span>
                </div>
                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center flex flex-col items-center justify-center">
                  <Code className="w-4 h-4 text-gray-500 mb-1" />
                  <span className="text-xs font-mono font-semibold text-wrap break-all">lib/api-client-react</span>
                </div>
                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center flex flex-col items-center justify-center">
                  <Box className="w-4 h-4 text-gray-500 mb-1" />
                  <span className="text-xs font-mono font-semibold text-wrap break-all">lib/shared-constants</span>
                </div>
              </div>

              {/* DB Block */}
              <div className="flex justify-center relative z-10">
                <div className="flex items-center gap-4 bg-blue-50 px-8 py-4 rounded-xl border border-blue-200 shadow-sm">
                  <Database className="w-8 h-8 text-blue-600" />
                  <div>
                    <div className="font-bold text-blue-900">PostgreSQL (Replit DB)</div>
                    <div className="text-xs text-blue-700 font-mono">postgres://...</div>
                  </div>
                </div>
                
                {/* Arrow to API */}
                <svg className="absolute top-[-90px] left-[50%] ml-[60px] w-[100px] h-[90px] pointer-events-none" style={{ zIndex: 0 }}>
                   <path d="M 0 90 L 50 90 L 50 0" fill="none" stroke="hsl(180,100%,25%)" strokeWidth="2" markerEnd="url(#arrow-solid)" />
                   <defs>
                    <marker id="arrow-solid" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(180,100%,25%)" />
                    </marker>
                  </defs>
                </svg>
              </div>

            </div>
          </div>
        </section>

        {/* 4. Fluxo de uma requisição */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <ArrowRight className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Fluxo de Requisição</h2>
          </div>
          
          <div className="overflow-x-auto pb-8">
            <div className="flex items-start gap-4 min-w-[1000px]">
              {[
                { name: 'Browser', desc: 'UI Action', icon: Globe },
                { name: 'Replit Proxy', desc: 'Port 80/443', icon: Network },
                { name: 'Vite', desc: 'fisiogest', icon: LayoutTemplate },
                { name: 'Fetch API', desc: 'react-query', icon: Activity },
                { name: 'Express', desc: 'api-server', icon: Server },
                { name: 'Middleware', desc: 'JWT/RBAC', icon: Shield },
                { name: 'Controller', desc: 'routes.ts', icon: FileCode },
                { name: 'Service', desc: 'Business Logic', icon: Cpu },
                { name: 'Repository', desc: 'Drizzle Queries', icon: DatabaseZap },
                { name: 'PostgreSQL', desc: 'Database', icon: Database },
              ].map((step, i, arr) => (
                <React.Fragment key={step.name}>
                  <div className="flex flex-col items-center w-32 shrink-0">
                    <div className="w-16 h-16 rounded-2xl bg-white border-2 border-[hsl(180,40%,91%)] flex items-center justify-center shadow-sm mb-3 relative group hover:border-[hsl(180,100%,25%)] transition-colors">
                      <step.icon className="w-6 h-6 text-[hsl(222,47%,11%)] group-hover:text-[hsl(180,100%,25%)] transition-colors" />
                    </div>
                    <div className="font-bold text-sm text-center">{step.name}</div>
                    <div className="text-[10px] text-[hsl(214,15%,40%)] font-mono mt-1 text-center bg-gray-100 px-2 py-0.5 rounded">{step.desc}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="mt-8 shrink-0 text-[hsl(180,40%,70%)]">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Módulos do produto */}
        <section className="bg-[hsl(183,50%,9%)] -mx-8 px-8 py-16 text-white border-y border-[hsl(180,100%,25%)]">
          <div className="max-w-[1280px] mx-auto">
            <div className="flex items-center gap-3 mb-10">
              <Box className="w-8 h-8 text-[hsl(180,40%,91%)]" />
              <h2 className="text-3xl font-bold tech-docs-heading text-white">Módulos do Produto</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { name: 'Pacientes', icon: HeartHandshake, desc: 'Prontuário eletrônico completo e gestão do paciente.', feats: ['Anamnese e Evolução', 'Plano de Tratamento', 'Galeria de Fotos'] },
                { name: 'Agenda', icon: CalendarDays, desc: 'Gestão de horários, bloqueios e auto-confirmação.', feats: ['Multi-profissionais', 'No-show tracking', 'WhatsApp Conf.'] },
                { name: 'Procedimentos', icon: Dumbbell, desc: 'Catálogo de serviços e planos terapêuticos.', feats: ['Tabela de Preços', 'Custo e Margem', 'Kits/Sessões'] },
                { name: 'Financeiro', icon: Wallet, desc: 'Ledger contábil, contas a receber e DRE.', feats: ['Partidas Dobradas', 'Faturamento', 'Adiantamentos'] },
                { name: 'Pacotes & Assinaturas', icon: Package, desc: 'Controle de planos recorrentes e sessões.', feats: ['Créditos por Sessão', 'Mensalidades', 'Fatura Consolidada'] },
                { name: 'Relatórios', icon: LineChart, desc: 'Dashboards e KPIs operacionais e financeiros.', feats: ['Receita por Categoria', 'Taxa de Ocupação', 'Retenção'] },
                { name: 'Multi-clínica', icon: Users, desc: 'Isolamento de dados por unidade clínica.', feats: ['Tenant ID', 'Troca de Contexto', 'Políticas por Clínica'] },
                { name: 'Superadmin', icon: Settings, desc: 'Gestão do SaaS, billing e cupons de desconto.', feats: ['Planos SaaS', 'Cobrança Stripe', 'Auditoria Global'] },
                { name: 'Segurança & RBAC', icon: Lock, desc: 'Controle de acesso granular baseado em roles.', feats: ['JWT Auth', 'Permissões por Rota', 'Audit Log'] },
              ].map((mod) => (
                <div key={mod.name} className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-[hsl(180,100%,25%)] rounded-lg">
                      <mod.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-lg">{mod.name}</h3>
                  </div>
                  <p className="text-[hsl(214,32%,91%)] text-sm mb-5 font-light">{mod.desc}</p>
                  <ul className="space-y-2">
                    {mod.feats.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs font-mono text-[hsl(180,40%,91%)]">
                        <CheckCircle2 className="w-3 h-3 text-[hsl(180,100%,25%)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Estrutura de uma Feature */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <FileCode className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Estrutura de Feature (Backend)</h2>
          </div>
          
          <div className="flex flex-col md:flex-row gap-8">
            <div className="bg-[#0d1117] text-gray-300 p-6 rounded-xl font-mono text-sm w-full md:w-1/3 border border-gray-800 shadow-xl">
              <div className="text-gray-500 mb-2">modules/clinical/patients/</div>
              <div className="pl-4 border-l border-gray-800 ml-2 space-y-3">
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-sky-400" /> patients.routes.ts</div>
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-green-400" /> patients.service.ts</div>
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-purple-400" /> patients.repository.ts</div>
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-yellow-400" /> patients.schemas.ts</div>
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-gray-400" /> patients.helpers.ts</div>
                <div className="flex items-center gap-2"><FileCode className="w-4 h-4 text-red-400" /> patients.errors.ts</div>
              </div>
            </div>
            
            <div className="w-full md:w-2/3 grid gap-3">
              {[
                { f: 'routes.ts', d: 'Controller fino (< 200 linhas). Define endpoints Express, aplica middlewares (auth, rbac) e chama o service. Sem queries DB cruas.', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
                { f: 'service.ts', d: 'Regras de negócio. Orquestra validações complexas, regras de estado e chama os métodos do repository.', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
                { f: 'repository.ts', d: 'Única camada autorizada a importar o Drizzle ORM. Executa selects, inserts, updates e transactions no PostgreSQL.', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
                { f: 'schemas.ts', d: 'Validação Zod para Requests e Responses. Exporta tipos TypeScript inferidos (z.infer).', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
                { f: 'helpers.ts', d: 'Funções puras, utilitários específicos da feature, fáceis de testar unitariamente.', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
                { f: 'errors.ts', d: 'Classes de erro de domínio customizadas (ex: PatientNotFoundError, PlanExpiredError).', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
              ].map(item => (
                <div key={item.f} className={`p-4 rounded-lg border ${item.border} ${item.bg} flex flex-col md:flex-row gap-4 md:items-center`}>
                  <div className={`font-mono font-bold w-40 shrink-0 ${item.color}`}>{item.f}</div>
                  <div className="text-sm text-gray-700">{item.d}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Schema do Banco (Mini-ERD) */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <Database className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Core Database Schema (ERD)</h2>
          </div>
          
          <div className="bg-white border border-[hsl(214,32%,91%)] p-8 rounded-2xl shadow-inner overflow-x-auto">
            <div className="min-w-[1000px] relative h-[600px]">
              
              {/* Tables */}
              <div className="absolute top-10 left-10 w-64 bg-white border-2 border-gray-800 rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-gray-800 text-white font-bold px-3 py-2 text-sm">clinics</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>name</div>
                  <div>document (CNPJ)</div>
                  <div>saas_plan_id (FK)</div>
                </div>
              </div>

              <div className="absolute top-10 left-[350px] w-64 bg-white border-2 border-blue-800 rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-blue-800 text-white font-bold px-3 py-2 text-sm">users</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>email</div>
                  <div>password_hash</div>
                  <div>clinic_id (FK)</div>
                </div>
              </div>

              <div className="absolute top-[280px] left-[350px] w-64 bg-white border-2 border-[hsl(180,100%,25%)] rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-[hsl(180,100%,25%)] text-white font-bold px-3 py-2 text-sm">patients</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>name</div>
                  <div>cpf</div>
                  <div>clinic_id (FK)</div>
                </div>
              </div>

              <div className="absolute top-[280px] left-[700px] w-64 bg-white border-2 border-purple-800 rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-purple-800 text-white font-bold px-3 py-2 text-sm">appointments</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>patient_id (FK)</div>
                  <div>professional_id (FK)</div>
                  <div>start_time</div>
                  <div>status</div>
                </div>
              </div>

              <div className="absolute top-[50px] left-[700px] w-64 bg-white border-2 border-orange-800 rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-orange-800 text-white font-bold px-3 py-2 text-sm">procedures</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>clinic_id (FK)</div>
                  <div>name</div>
                  <div>base_price</div>
                </div>
              </div>

              <div className="absolute top-[500px] left-[700px] w-64 bg-white border-2 border-green-800 rounded-lg overflow-hidden shadow-lg z-10">
                <div className="bg-green-800 text-white font-bold px-3 py-2 text-sm">accounting_journal_entries</div>
                <div className="p-2 text-xs font-mono space-y-1">
                  <div className="font-bold">id (PK)</div>
                  <div>clinic_id (FK)</div>
                  <div>date</div>
                  <div>description</div>
                </div>
              </div>

              {/* SVG Lines */}
              <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {/* Clinics to Users */}
                <path d="M 266 70 L 350 70" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />
                {/* Clinics to Patients */}
                <path d="M 138 140 L 138 340 L 350 340" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />
                {/* Clinics to Procedures */}
                <path d="M 266 50 L 700 100" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />
                
                {/* Patients to Appointments */}
                <path d="M 606 340 L 700 340" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />
                {/* Users to Appointments (Prof) */}
                <path d="M 478 180 L 478 230 L 828 230 L 828 280" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />
                
                {/* Appointments to Accounting */}
                <path d="M 828 420 L 828 500" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow-erd)" />

                <defs>
                  <marker id="arrow-erd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#4b5563" />
                  </marker>
                </defs>
              </svg>

            </div>
          </div>
        </section>

        {/* 8. Scheduler de jobs (timeline 24h) */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <Clock className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Scheduler de Background (CRON)</h2>
          </div>
          
          <div className="bg-white p-8 rounded-xl border border-[hsl(214,32%,91%)] shadow-sm">
            <div className="relative pt-12 pb-20 px-4">
              {/* Timeline Line */}
              <div className="absolute top-[80px] left-0 w-full h-2 bg-gray-100 rounded-full"></div>
              
              <div className="flex justify-between relative">
                {[
                  { time: '00:00', label: '', empty: true },
                  { time: '06:00', label: 'Billing Auto', color: 'bg-red-500', icon: Wallet },
                  { time: '06:05', label: 'Fatura Consol.', color: 'bg-orange-500', icon: FileCode },
                  { time: '07:00', label: 'Check Assinaturas', color: 'bg-blue-500', icon: Shield },
                  { time: '12:00', label: 'Auto-conf (15m)', color: 'bg-green-500', icon: Clock, up: true },
                  { time: '22:00', label: 'Fechamento Dia', color: 'bg-[hsl(183,50%,9%)]', icon: DatabaseZap },
                  { time: '24:00', label: '', empty: true },
                ].map((job, i) => (
                  <div key={i} className="flex flex-col items-center relative" style={{ width: '40px' }}>
                    {!job.empty && (
                      <>
                        <div className={`absolute ${job.up ? 'top-[-60px]' : 'top-[30px]'} w-max text-center`}>
                          <div className={`p-2 rounded-full ${job.color} text-white mx-auto w-max mb-1 shadow-md`}>
                            <job.icon className="w-4 h-4" />
                          </div>
                          <div className="font-bold text-xs">{job.label}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full ${job.color} border-2 border-white absolute top-[-6px] z-10 shadow-sm`}></div>
                      </>
                    )}
                    {job.empty && <div className="w-2 h-2 rounded-full bg-gray-300 absolute top-0 z-10"></div>}
                    <div className="text-xs font-mono text-gray-500 mt-4">{job.time}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-lg border border-blue-200 mt-4 flex items-start gap-3">
              <Clock className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong>Fuso Horário Padrão:</strong> America/Sao_Paulo (UTC-3). O job de fechamento do dia as 22:00 processa apenas os agendamentos do dia corrente para permitir ajustes manuais durante o expediente.
              </div>
            </div>
          </div>
        </section>

        {/* 9. Fluxo de Autenticação */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <KeyRound className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Fluxo de Autenticação (Auth & RBAC)</h2>
          </div>
          
          <div className="overflow-x-auto pb-8">
            <div className="flex items-start gap-4 min-w-[1000px]">
              {[
                { name: 'Login Form', desc: 'UI', icon: LayoutTemplate },
                { name: 'POST /api/auth/login', desc: 'Auth Endpoint', icon: Activity },
                { name: 'bcrypt.compare', desc: 'Password Check', icon: Shield },
                { name: 'JWT Sign', desc: 'Generate Token', icon: FileCode },
                { name: 'Set-Cookie', desc: 'HttpOnly, Secure', icon: Globe },
                { name: 'Protected Route', desc: 'fetch /api/...', icon: Server },
                { name: 'Middleware verify', desc: 'Validate JWT', icon: KeyRound },
                { name: 'RBAC Check', desc: 'Roles & Perms', icon: Users },
              ].map((step, i, arr) => (
                <React.Fragment key={step.name}>
                  <div className="flex flex-col items-center w-32 shrink-0">
                    <div className="w-16 h-16 rounded-2xl bg-white border-2 border-[hsl(180,40%,91%)] flex items-center justify-center shadow-sm mb-3 relative group hover:border-[hsl(180,100%,25%)] transition-colors">
                      <step.icon className="w-6 h-6 text-[hsl(222,47%,11%)] group-hover:text-[hsl(180,100%,25%)] transition-colors" />
                    </div>
                    <div className="font-bold text-sm text-center">{step.name}</div>
                    <div className="text-[10px] text-[hsl(214,15%,40%)] font-mono mt-1 text-center bg-gray-100 px-2 py-0.5 rounded">{step.desc}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="mt-8 shrink-0 text-[hsl(180,40%,70%)]">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Deploy & Infra + 11. Padrões de código */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          <section>
            <div className="flex items-center gap-3 mb-8">
              <Globe className="w-8 h-8 text-[hsl(180,100%,25%)]" />
              <h2 className="text-3xl font-bold tech-docs-heading">Deploy & Infra</h2>
            </div>
            <div className="grid gap-4">
              <div className="p-4 rounded-xl border border-[hsl(214,32%,91%)] bg-white flex items-center gap-4">
                <div className="p-3 bg-gray-100 rounded-lg"><Terminal className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold">Build Command</div>
                  <div className="text-sm text-gray-600 font-mono">pnpm run build</div>
                  <div className="text-xs text-gray-400">Bundle Vite + esbuild API</div>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[hsl(214,32%,91%)] bg-white flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Server className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold">Hosting</div>
                  <div className="text-sm text-gray-600">Replit Deployments (.replit.app)</div>
                  <div className="text-xs text-gray-400">Autoscale com proxy reverso e TLS automático.</div>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[hsl(214,32%,91%)] bg-white flex items-center gap-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Activity className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold">Healthcheck</div>
                  <div className="text-sm text-gray-600 font-mono">GET /api/healthz</div>
                  <div className="text-xs text-gray-400">Monitoramento de Liveness.</div>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[hsl(214,32%,91%)] bg-white flex items-center gap-4">
                <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg"><Lock className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold">Variáveis de Ambiente</div>
                  <div className="text-sm text-gray-600 font-mono">DATABASE_URL, JWT_SECRET</div>
                  <div className="text-xs text-gray-400">Armazenadas seguramente via Secrets.</div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-8">
              <Shield className="w-8 h-8 text-[hsl(180,100%,25%)]" />
              <h2 className="text-3xl font-bold tech-docs-heading">Padrões de Código</h2>
            </div>
            <div className="bg-white rounded-xl border border-[hsl(214,32%,91%)] overflow-hidden">
              <ul className="divide-y divide-[hsl(214,32%,91%)]">
                {[
                  'TypeScript strict & ESM only em todo o monorepo.',
                  'ESLint + Prettier configurados no workspace raiz.',
                  'Conventional commits exigidos no CI/CD.',
                  'Test pyramid: Unit (services/helpers) > Integration > E2E.',
                  'Drizzle migrations versionadas rigorosamente.',
                  'Nunca usar new Date() puro; usar lib/dateUtils.ts (fuso BRT).'
                ].map((rule, idx) => (
                  <li key={idx} className="p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-[hsl(180,100%,25%)] shrink-0 mt-0.5" />
                    <span className="text-gray-700 text-sm font-medium">{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

        </div>

        {/* 12. Comandos Essenciais */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <Terminal className="w-8 h-8 text-[hsl(180,100%,25%)]" />
            <h2 className="text-3xl font-bold tech-docs-heading">Comandos Essenciais</h2>
          </div>
          <div className="bg-[#0a0a0a] rounded-xl p-6 shadow-2xl font-mono text-sm border border-gray-800">
            <div className="flex gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="space-y-3 text-gray-300">
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm install <span className="text-gray-500"># Instala deps e linka workspaces</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run dev <span className="text-gray-500"># Inicia web (3000) e api (8080) em dev</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run build:libs <span className="text-gray-500"># Compila libs compartilhadas (.d.ts)</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run typecheck <span className="text-gray-500"># Verifica TypeScript em todo o monorepo</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run test <span className="text-gray-500"># Roda suíte Vitest</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run db:push <span className="text-gray-500"># Sincroniza schema Drizzle com PostgreSQL</span></span></div>
              <div className="flex"><span className="text-pink-500 mr-2">$</span> <span>pnpm run db:seed-demo <span className="text-gray-500"># Popula DB com dados fictícios para teste</span></span></div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

export default Page;