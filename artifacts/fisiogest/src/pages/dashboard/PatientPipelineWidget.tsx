import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, ArrowRight, AlertTriangle, ClipboardList, Activity,
  Target, CalendarDays, Zap, CheckCircle2, Clock, TrendingUp, UserPlus, FileText,
} from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OnboardingPatient {
  patientId: number;
  name: string;
  phone: string | null;
  stage: string;
  joinedAt: string | null;
  daysSinceJoined: number;
}

interface NearingCompletionPatient {
  patientId: number;
  planId: number;
  name: string;
  phone: string | null;
  completedSessions: number;
  totalSessions: number;
  pct: number;
  planStatus: string;
}

interface PipelineData {
  onboarding: OnboardingPatient[];
  nearingCompletion: NearingCompletionPatient[];
}

const STAGE_CONFIG: Record<string, {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  ring: string;
  ctaLabel: string;
  tab: string;
}> = {
  anamnese: {
    label: "Anamnese pendente",
    shortLabel: "Anamnese",
    icon: <ClipboardList className="w-3 h-3" />,
    color: "text-violet-700",
    bg: "bg-violet-50",
    ring: "ring-violet-200",
    ctaLabel: "Fazer anamnese",
    tab: "anamnesis",
  },
  avaliacao: {
    label: "Avaliação pendente",
    shortLabel: "Avaliação",
    icon: <Activity className="w-3 h-3" />,
    color: "text-sky-700",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
    ctaLabel: "Avaliar",
    tab: "evaluations",
  },
  plano_tratamento: {
    label: "Plano de tratamento",
    shortLabel: "Plano",
    icon: <Target className="w-3 h-3" />,
    color: "text-teal-700",
    bg: "bg-teal-50",
    ring: "ring-teal-200",
    ctaLabel: "Criar plano",
    tab: "treatment",
  },
  aceite_plano: {
    label: "Aguardando aceite do plano",
    shortLabel: "Aceite",
    icon: <FileText className="w-3 h-3" />,
    color: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    ctaLabel: "Aceitar Plano",
    tab: "treatment",
  },
  aguardando_sessao: {
    label: "Aguardando 1ª sessão",
    shortLabel: "1ª sessão",
    icon: <Zap className="w-3 h-3" />,
    color: "text-orange-700",
    bg: "bg-orange-50",
    ring: "ring-orange-200",
    ctaLabel: "Ver agenda",
    tab: "",
  },
};

const STAGE_ORDER = ["anamnese", "avaliacao", "plano_tratamento", "aceite_plano", "aguardando_sessao"];

function InitialAvatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
  const colors = [
    "from-violet-500 to-purple-600",
    "from-sky-500 to-blue-600",
    "from-teal-500 to-emerald-600",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600",
  ];
  const colorIdx = name.charCodeAt(0) % colors.length;
  return (
    <div className={`rounded-full bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white font-bold shrink-0 ${className}`}>
      {initials}
    </div>
  );
}

function StageTag({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${cfg.bg} ${cfg.color} ${cfg.ring}`}>
      {cfg.icon}
      {cfg.shortLabel}
    </span>
  );
}

function StageFunnelBar({ onboarding }: { onboarding: OnboardingPatient[] }) {
  const counts = STAGE_ORDER.map(stage => ({
    stage,
    count: onboarding.filter(p => p.stage === stage).length,
    cfg: STAGE_CONFIG[stage],
  }));
  const total = onboarding.length;
  if (total === 0) return null;

  return (
    <div className="flex items-end gap-1.5 px-4 pb-3">
      {counts.map(({ stage, count, cfg }) => {
        if (!cfg) return null;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={stage} className="flex-1 flex flex-col items-center gap-1">
            <span className={`text-xs font-bold ${count > 0 ? cfg.color : "text-slate-300"}`}>{count}</span>
            <div className="w-full rounded-t-sm" style={{ height: 24, background: count > 0 ? undefined : undefined }}>
              <div
                className={`w-full rounded-t-sm transition-all duration-500 ${count > 0 ? cfg.bg : "bg-slate-100"}`}
                style={{ height: `${Math.max(pct, 8)}%`, minHeight: 4 }}
              />
            </div>
            <span className={`text-[9px] font-semibold text-center leading-tight ${count > 0 ? cfg.color : "text-slate-300"}`}>
              {cfg.shortLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PatientPipelineWidget() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/dashboard/patient-pipeline"],
    queryFn: () => apiFetchJson<PipelineData>("/api/dashboard/patient-pipeline"),
    staleTime: 60_000,
  });

  const hasOnboarding = (data?.onboarding?.length ?? 0) > 0;
  const hasNearing = (data?.nearingCompletion?.length ?? 0) > 0;

  if (!isLoading && !hasOnboarding && !hasNearing) return null;

  const goToPatient = (patientId: number, tab?: string) => {
    const path = tab ? `/pacientes/${patientId}?tab=${tab}` : `/pacientes/${patientId}`;
    setLocation(path);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Onboarding Pipeline ── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-xl">
              <UserPlus className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Novos Clientes</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isLoading ? "Carregando..." : `${data?.onboarding?.length ?? 0} aguardando conclusão do onboarding`}
              </p>
            </div>
          </div>
          {!isLoading && hasOnboarding && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
              {data!.onboarding.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : !hasOnboarding ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Tudo em dia!</p>
            <p className="text-xs text-slate-400 mt-1">Todos os clientes já tiveram sua primeira sessão</p>
          </div>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {data!.onboarding.map((patient) => {
                const cfg = STAGE_CONFIG[patient.stage];
                return (
                  <div
                    key={patient.patientId}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => goToPatient(patient.patientId, cfg?.tab || undefined)}
                  >
                    <InitialAvatar name={patient.name} className="w-9 h-9 text-xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{patient.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StageTag stage={patient.stage} />
                        {patient.daysSinceJoined > 0 && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {patient.daysSinceJoined}d
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 shrink-0"
                      onClick={(e) => { e.stopPropagation(); goToPatient(patient.patientId, cfg?.tab || undefined); }}
                    >
                      {cfg?.ctaLabel ?? "Abrir"}
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-slate-50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-slate-500 hover:text-violet-600 gap-1.5"
                onClick={() => setLocation("/pacientes")}
              >
                <Users className="w-3.5 h-3.5" />
                Ver todos os pacientes
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Nearing Completion ── */}
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl">
              <TrendingUp className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Próximos da Alta</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isLoading ? "Carregando..." : `${data?.nearingCompletion?.length ?? 0} planos acima de 80% concluído`}
              </p>
            </div>
          </div>
          {!isLoading && hasNearing && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
              {data!.nearingCompletion.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <Skeleton className="h-7 w-14 rounded-lg" />
              </div>
            ))}
          </div>
        ) : !hasNearing ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Nenhum plano crítico</p>
            <p className="text-xs text-slate-400 mt-1">Planos a partir de 80% de sessões aparecerão aqui</p>
          </div>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {data!.nearingCompletion.map((patient) => {
                const urgency = patient.pct >= 100 ? "red" : patient.pct >= 90 ? "orange" : "amber";
                const barColor = urgency === "red" ? "bg-red-400" : urgency === "orange" ? "bg-orange-400" : "bg-amber-400";
                const pctColor = urgency === "red" ? "text-red-600" : urgency === "orange" ? "text-orange-600" : "text-amber-600";
                return (
                  <div
                    key={patient.patientId}
                    className="px-4 py-3 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => goToPatient(patient.patientId, "jornada")}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <InitialAvatar name={patient.name} className="w-9 h-9 text-xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{patient.name}</p>
                        <p className={`text-xs font-bold ${pctColor}`}>
                          {patient.completedSessions}/{patient.totalSessions} sessões · {patient.pct}%
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs gap-1 shrink-0 ${
                          urgency === "red"
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : urgency === "orange"
                            ? "border-orange-200 text-orange-600 hover:bg-orange-50"
                            : "border-amber-200 text-amber-600 hover:bg-amber-50"
                        }`}
                        onClick={(e) => { e.stopPropagation(); goToPatient(patient.patientId, "discharge"); }}
                      >
                        Alta
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`${barColor} h-1.5 rounded-full transition-all duration-700`}
                        style={{ width: `${Math.min(patient.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-slate-50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-slate-500 hover:text-amber-600 gap-1.5"
                onClick={() => setLocation("/pacientes")}
              >
                <Users className="w-3.5 h-3.5" />
                Ver todos os pacientes
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
