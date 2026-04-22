import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "./helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "./constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "./types";
import { BookingView, ProcedureCard, StepConfirmacao, StepDataHora, StepIndicator, StepProcedimento, StepSeusDados } from "./components";
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Agendar() {
  const [matchToken, paramsToken] = useRoute("/agendar/:token");
  const token = matchToken ? (paramsToken as any).token : null;

  const [clinicInfo, setClinicInfo] = useState<{ name: string; logoUrl?: string | null } | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/public/clinic-info`)
      .then((r) => r.json())
      .then((data) => setClinicInfo(data))
      .catch(() => {});
  }, []);

  const clinicName = clinicInfo?.name || "FisioGest Pro";

  // Wizard state — 3 steps: Seus Dados → Procedimento → Data e Hora → Confirmação
  const [step, setStep] = useState(1);
  const [patientFormData, setPatientFormData] = useState<PatientFormData | null>(null);
  const [foundPatient, setFoundPatient] = useState<PatientLookupResult | null>(null);
  const [activeClinicId, setActiveClinicId] = useState<number | null>(null);
  const [procedure, setProcedure] = useState<PublicProcedure | null>(null);
  const [patientName, setPatientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1: Seus Dados — collect patient info + auto-lookup
  const handlePatientNext = (data: PatientFormData, patient: PatientLookupResult | null) => {
    setPatientFormData(data);
    setFoundPatient(patient);
    setActiveClinicId(patient?.activeClinicId ?? null);
    setStep(2);
  };

  // Step 2: Procedimento — choose procedure filtered by active plan
  const handleProcedureSelect = (proc: PublicProcedure) => {
    setProcedure(proc);
    setStep(3);
  };

  // Step 3: Data e Hora — select date/time and submit booking
  const handleDateTimeSelect = async (d: string, t: string, scheduleId: number | null) => {
    if (!procedure || !patientFormData) return;
    setSubmitting(true);
    setSubmitError(null);
    setPatientName(patientFormData.name);

    try {
      const r = await fetch(`${BASE}/api/public/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procedureId: procedure.id,
          date: d,
          startTime: t,
          patientName: patientFormData.name,
          patientPhone: patientFormData.phone,
          patientEmail: patientFormData.email || undefined,
          patientCpf: patientFormData.cpf || undefined,
          notes: patientFormData.notes || undefined,
          clinicId: activeClinicId || undefined,
          scheduleId: scheduleId ?? undefined,
        }),
      });

      const result = await r.json();

      if (!r.ok) {
        setSubmitError(result.message ?? result.error ?? "Erro ao confirmar agendamento.");
      } else {
        setConfirmation(result);
        setStep(4);
      }
    } catch {
      setSubmitError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNew = () => {
    setPatientFormData(null);
    setFoundPatient(null);
    setActiveClinicId(null);
    setProcedure(null);
    setConfirmation(null);
    setSubmitError(null);
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/30">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {clinicInfo?.logoUrl ? (
              <img src={clinicInfo.logoUrl} alt={clinicName} className="h-9 w-auto max-w-[120px] object-contain" />
            ) : (
              <div className="w-9 h-9"><LogoMark /></div>
            )}
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">{clinicName}</p>
              <p className="text-[10px] text-slate-400 leading-tight">Agendamento Online</p>
            </div>
          </div>
          {!token && (
            <a
              href={`${BASE}/login`}
              className="text-xs text-primary underline hidden sm:inline"
            >
              Acesso para profissionais
            </a>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {token ? (
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <BookingView token={token} />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              {step < 4 && <StepIndicator step={step} total={3} />}

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <p className="text-red-800 text-sm font-medium">Não foi possível confirmar o agendamento</p>
                    <p className="text-red-700 text-xs mt-0.5">{submitError}</p>
                  </div>
                </div>
              )}

              {/* Step 1: Seus Dados */}
              {step === 1 && (
                <StepSeusDados
                  onNext={handlePatientNext}
                  initialForm={patientFormData ?? undefined}
                />
              )}

              {/* Step 2: Procedimento */}
              {step === 2 && (
                <StepProcedimento
                  onSelect={handleProcedureSelect}
                  foundPatient={foundPatient}
                  onBack={() => setStep(1)}
                  clinicId={activeClinicId}
                />
              )}

              {/* Step 3: Data e Hora (submits on confirm) */}
              {step === 3 && procedure && (
                <StepDataHora
                  procedure={procedure}
                  onSelect={handleDateTimeSelect}
                  onBack={() => setStep(2)}
                  submitting={submitting}
                  clinicId={activeClinicId}
                />
              )}

              {/* Confirmação */}
              {step === 4 && confirmation && (
                <StepConfirmacao
                  confirmation={confirmation}
                  patientName={patientName}
                  onNew={handleNew}
                />
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-slate-400">
        <p>© {new Date().getFullYear()} {clinicName} — Gestão Clínica</p>
      </footer>
    </div>
  );
}
