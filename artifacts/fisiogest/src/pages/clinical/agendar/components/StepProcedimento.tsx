import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, ProcedureCard, StepConfirmacao, StepDataHora, StepIndicator, StepSeusDados } from "./";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Phone,
  Mail,
  FileText,
  XCircle,
  AlertCircle,
  Dumbbell,
  Link2,
  Copy,
  Check,
  Star,
  Sparkles,
  UserCheck,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { format, addDays, isBefore, startOfToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import LogoMark from "@/components/logo-mark";

export function StepProcedimento({
  onSelect,
  foundPatient,
  onBack,
  clinicId,
}: {
  onSelect: (procedure: PublicProcedure) => void;
  foundPatient: PatientLookupResult | null;
  onBack?: () => void;
  clinicId?: number | null;
}) {
  const [procedures, setProcedures] = useState<PublicProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedProc, setSelectedProc] = useState<PublicProcedure | null>(null);

  useEffect(() => {
    const url = clinicId
      ? `${BASE}/api/public/procedures?clinicId=${clinicId}`
      : `${BASE}/api/public/procedures`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProcedures(data);
        } else {
          setError("Erro ao carregar procedimentos");
        }
      })
      .catch(() => setError("Não foi possível conectar ao servidor"))
      .finally(() => setLoading(false));
  }, [clinicId]);

  const recommendedIds = foundPatient?.recommendedProcedureIds ?? [];
  const hasPlan = !!foundPatient?.activeTreatmentPlan;

  // Sort: recommended first, then by category/name
  const sortedProcedures = [...procedures].sort((a, b) => {
    const aRank = recommendedIds.indexOf(a.id);
    const bRank = recommendedIds.indexOf(b.id);
    if (aRank !== -1 && bRank === -1) return -1;
    if (bRank !== -1 && aRank === -1) return 1;
    if (aRank !== -1 && bRank !== -1) return aRank - bRank;
    return 0;
  });

  const grouped = sortedProcedures.reduce<Record<string, PublicProcedure[]>>((acc, p) => {
    const key = recommendedIds.includes(p.id) ? "__recomendados__" : p.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  // Build ordered category list: recommended first, then the rest
  const categoryOrder = [
    ...(grouped["__recomendados__"] ? ["__recomendados__"] : []),
    ...Object.keys(grouped).filter((k) => k !== "__recomendados__"),
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-500">Carregando procedimentos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-red-600">
        <AlertCircle className="w-10 h-10" />
        <p>{error}</p>
      </div>
    );
  }

  if (procedures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
        <Dumbbell className="w-12 h-12 opacity-40" />
        <p className="text-lg font-medium">Nenhum procedimento disponível para agendamento online no momento</p>
        <p className="text-sm">Entre em contato direto com a clínica para agendar.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">Escolha o Procedimento</h2>
      <p className="text-slate-500 text-sm mb-4">Selecione o serviço que deseja agendar</p>

      {/* Patient welcome banner */}
      {foundPatient?.found && foundPatient.patient && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-5 flex items-start gap-3">
          <UserCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Bem-vindo de volta, {foundPatient.patient.name.split(" ")[0]}!
            </p>
            {hasPlan ? (
              <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1">
                <ClipboardList className="w-3 h-3" />
                Você tem um plano ativo{foundPatient.activeClinicName ? ` em ${foundPatient.activeClinicName}` : ""} — procedimentos recomendados estão destacados abaixo.
              </p>
            ) : (
              <p className="text-xs text-emerald-700 mt-0.5">
                {recommendedIds.length > 0
                  ? "Seus procedimentos mais usados estão destacados abaixo."
                  : "Seus dados serão preenchidos automaticamente na próxima etapa."}
              </p>
            )}
          </div>
        </div>
      )}

      {categoryOrder.map((category) => {
        const procs = grouped[category];
        const isRecommended = category === "__recomendados__";
        return (
          <div key={category} className="mb-6">
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5 ${isRecommended ? "text-amber-600" : "text-slate-400"}`}>
              {isRecommended ? (
                <><Sparkles className="w-3.5 h-3.5" /> {hasPlan ? "Do seu plano de tratamento" : "Usados recentemente"}</>
              ) : (
                <><span>{CATEGORY_ICONS[category] ?? CATEGORY_ICONS["default"]}</span>{category}</>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {procs.map((proc) => (
                <ProcedureCard
                  key={proc.id}
                  proc={proc}
                  selected={selected === proc.id}
                  recommended={isRecommended}
                  onSelect={() => { setSelected(proc.id); setSelectedProc(proc); }}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-6 flex justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack} className="rounded-xl h-11 gap-2">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </Button>
        ) : <div />}
        <Button
          disabled={!selected || !selectedProc}
          onClick={() => selectedProc && onSelect(selectedProc)}
          className="rounded-xl h-11 px-8 gap-2"
        >
          Próximo <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

