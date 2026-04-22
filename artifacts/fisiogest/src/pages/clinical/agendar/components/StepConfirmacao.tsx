import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, ProcedureCard, StepDataHora, StepIndicator, StepProcedimento, StepSeusDados } from "./";
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

// ── Step 3: Confirmação ───────────────────────────────────────────────────────

export function StepConfirmacao({
  confirmation,
  patientName,
  onNew,
}: {
  confirmation: BookingConfirmation;
  patientName: string;
  onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const cancelUrl = `${window.location.origin}${BASE}/agendar/${confirmation.bookingToken}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(cancelUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Agendamento Confirmado!</h2>
      <p className="text-slate-500 mb-8">
        Olá, <strong>{patientName}</strong>! Seu horário foi reservado com sucesso.
      </p>

      <Card className="border-none shadow-xl bg-white text-left mb-6">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-slate-800">{confirmation.appointment.procedure.name}</p>
              <p className="text-sm text-slate-500">{confirmation.appointment.procedure.durationMinutes} min</p>
            </div>
            <div className="ml-auto text-right">
              <p className="font-bold text-primary">{formatCurrency(confirmation.appointment.procedure.price)}</p>
              <Badge className="bg-green-100 text-green-700 border-0 text-xs">Agendado</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Data</p>
              <p className="font-semibold text-slate-800 text-sm capitalize">
                {formatDateBR(confirmation.appointment.date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Horário</p>
              <p className="font-semibold text-slate-800">
                {confirmation.appointment.startTime} – {confirmation.appointment.endTime}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Link de gerenciamento */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-left">
        <div className="flex items-start gap-3">
          <Link2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 mb-1">Guarde este link para cancelar</p>
            <p className="text-xs text-amber-700 mb-3">
              Através deste link você pode visualizar ou cancelar seu agendamento a qualquer momento.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-lg break-all flex-1">
                {cancelUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={copyLink}
                className="shrink-0 h-7 rounded-lg border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={onNew} variant="outline" className="rounded-xl h-11 w-full">
        Fazer outro agendamento
      </Button>
    </div>
  );
}

