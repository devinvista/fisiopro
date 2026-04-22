import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, ProcedureCard, StepConfirmacao, StepDataHora, StepIndicator, StepProcedimento } from "./";
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

// ── Step 1: Seus Dados (identificação + dados do paciente) ────────────────────


export function StepSeusDados({
  onNext,
  initialForm,
}: {
  onNext: (data: PatientFormData, patient: PatientLookupResult | null) => void;
  initialForm?: Partial<PatientFormData>;
}) {
  const [form, setForm] = useState<PatientFormData>({
    name: initialForm?.name ?? "",
    phone: initialForm?.phone ?? "",
    email: initialForm?.email ?? "",
    cpf: initialForm?.cpf ?? "",
    notes: initialForm?.notes ?? "",
  });

  const [lookupState, setLookupState] = useState<"idle" | "searching" | "found" | "new">("idle");
  const [foundPatient, setFoundPatient] = useState<PatientLookupResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runLookup = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const cleaned = q.replace(/\D/g, "");
    if (cleaned.length < 8 && q.trim().length < 8) {
      setLookupState("idle");
      setFoundPatient(null);
      return;
    }
    setLookupState("searching");
    debounceRef.current = setTimeout(async () => {
      const r = await lookupPatient(q);
      if (r.found && r.patient) {
        setFoundPatient(r);
        setLookupState("found");
        setForm((prev) => ({
          ...prev,
          name: r.patient!.name,
          phone: r.patient!.phone ?? prev.phone,
          email: r.patient!.email ?? prev.email,
          cpf: r.patient!.cpf ?? prev.cpf,
        }));
      } else {
        setFoundPatient(null);
        setLookupState("new");
      }
    }, 600);
  }, []);

  // CPF is the primary lookup field — applies mask and triggers search on all 11 digits
  const handleCpfChange = (val: string) => {
    const masked = formatCpfMask(val);
    setForm((prev) => ({ ...prev, cpf: masked }));
    const digits = masked.replace(/\D/g, "");
    if (digits.length === 11) {
      runLookup(masked);
    } else if (digits.length === 0) {
      // Reset lookup state when user clears the CPF field
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLookupState("idle");
      setFoundPatient(null);
    }
  };

  // Phone is secondary — only triggers lookup if CPF hasn't already found the patient
  const handlePhoneChange = (val: string) => {
    const masked = formatPhoneMask(val);
    setForm((prev) => ({ ...prev, phone: masked }));
    if (lookupState !== "found") {
      runLookup(masked);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(form, foundPatient);
  };

  const isPreFilled = lookupState === "found" && !!foundPatient?.patient;

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Seus Dados</h2>
        <p className="text-slate-500 text-sm">
          Digite seu CPF para buscar seu cadastro automaticamente. Se for seu primeiro agendamento, preencha os demais campos.
        </p>
      </div>

      {/* Lookup status banners */}
      {isPreFilled && foundPatient?.patient && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">
                Bem-vindo de volta, {foundPatient.patient.name.split(" ")[0]}!
              </p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Cadastro encontrado — dados preenchidos automaticamente.
              </p>
              {foundPatient.activeTreatmentPlan && (
                <div className="mt-3 bg-white border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> Plano de tratamento ativo
                  </p>
                  {foundPatient.activeTreatmentPlan.frequency && (
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Frequência:</span> {foundPatient.activeTreatmentPlan.frequency}
                    </p>
                  )}
                  {foundPatient.activeTreatmentPlan.objectives && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {foundPatient.activeTreatmentPlan.objectives}
                    </p>
                  )}
                </div>
              )}
              {!foundPatient.activeTreatmentPlan && (foundPatient.recommendedProcedureIds?.length ?? 0) > 0 && (
                <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Seus procedimentos mais usados serão destacados na próxima etapa.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {lookupState === "new" && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-blue-800">Primeiro agendamento?</p>
            <p className="text-sm text-blue-700 mt-0.5">
              Não encontramos um cadastro com esses dados. Preencha as informações abaixo — faremos seu cadastro automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CPF — campo principal de identificação, sempre dispara lookup */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">CPF *</Label>
            <div className="relative">
              <Input
                autoFocus
                required
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => handleCpfChange(e.target.value)}
                className={`h-11 rounded-xl pr-10 transition-all
                  ${isPreFilled ? "border-emerald-300 bg-emerald-50/30" : ""}
                  ${lookupState === "new" ? "border-blue-300" : ""}`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {lookupState === "searching" && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                {lookupState === "found" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {lookupState === "new" && <UserPlus className="w-4 h-4 text-blue-400" />}
              </div>
            </div>
          </div>

          {/* Telefone — campo secundário de identificação */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Telefone / WhatsApp *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                required
                placeholder="(11) 99999-0000"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className={`h-11 rounded-xl pl-9 transition-all
                  ${isPreFilled ? "border-emerald-300 bg-emerald-50/30" : ""}
                  ${lookupState === "new" ? "border-blue-300" : ""}`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Nome completo *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                required
                placeholder="Seu nome completo"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={`h-11 rounded-xl pl-9 ${isPreFilled ? "border-emerald-300 bg-emerald-50/30" : ""}`}
              />
            </div>
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type="email"
                placeholder="seu@email.com (opcional)"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className={`h-11 rounded-xl pl-9 ${isPreFilled && form.email ? "border-emerald-300 bg-emerald-50/30" : ""}`}
              />
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" /> Observações
          </Label>
          <Textarea
            placeholder="Alguma informação adicional para a clínica? (opcional)"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="rounded-xl resize-none"
            rows={3}
          />
        </div>

        <p className="text-xs text-slate-400">
          * campos obrigatórios. Seus dados são utilizados apenas para gestão do seu agendamento.
        </p>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            className="rounded-xl h-11 px-8 gap-2"
            disabled={lookupState === "searching"}
          >
            {isPreFilled ? (
              <><UserCheck className="w-4 h-4" /> Continuar como {foundPatient?.patient?.name.split(" ")[0]}</>
            ) : (
              <>Próximo <ChevronRight className="w-4 h-4" /></>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

