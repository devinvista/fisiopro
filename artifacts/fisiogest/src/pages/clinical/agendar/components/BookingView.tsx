import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { ProcedureCard, StepConfirmacao, StepDataHora, StepIndicator, StepProcedimento, StepSeusDados } from "./";
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

// ── Booking Details View (via token) ─────────────────────────────────────────

export function BookingView({ token }: { token: string }) {
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/public/booking/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then(setBooking)
      .catch(() => setError("Agendamento não encontrado. Verifique o link."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!window.confirm("Deseja cancelar este agendamento?")) return;
    setCanceling(true);
    setCancelError(null);
    try {
      const r = await fetch(`${BASE}/api/public/booking/${token}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) {
        setCancelError(data.error ?? "Não foi possível cancelar.");
      } else {
        setCanceled(true);
        setBooking((b) => b ? { ...b, status: "cancelado" } : b);
      }
    } catch {
      setCancelError("Erro de conexão. Tente novamente.");
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-500">Carregando agendamento...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-16 gap-4 text-red-600">
        <XCircle className="w-12 h-12" />
        <p className="text-lg font-medium">{error}</p>
        <a href={`${BASE}/agendar`} className="text-primary underline text-sm">
          Fazer um novo agendamento
        </a>
      </div>
    );
  }

  if (!booking) return null;

  const statusInfo = STATUS_LABELS[booking.status] ?? { label: booking.status, color: "text-slate-700 bg-slate-100" };
  const today = todayBRT();
  const canCancel = booking.status === "agendado" && booking.date >= today;

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-6">Meu Agendamento</h2>

      {canceled && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-green-800 text-sm font-medium">Seu agendamento foi cancelado com sucesso.</p>
        </div>
      )}

      {cancelError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800 text-sm">{cancelError}</p>
        </div>
      )}

      <Card className="border-none shadow-xl bg-white">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            <span className="text-xs text-slate-400">#{booking.id}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Dumbbell className="w-4 h-4 text-primary" />
              <span className="font-semibold text-slate-800">{booking.procedure?.name ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-slate-700 capitalize">{formatDateBR(booking.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-slate-700">{booking.startTime} – {booking.endTime}</span>
            </div>
            {booking.patient && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">{booking.patient.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">{booking.patient.phone}</span>
                </div>
                {booking.patient.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700">{booking.patient.email}</span>
                  </div>
                )}
              </>
            )}
            {booking.notes && (
              <div className="flex items-start gap-2 text-sm">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <span className="text-slate-600 italic">{booking.notes}</span>
              </div>
            )}
          </div>

          {canCancel && (
            <div className="pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={canceling}
                className="w-full h-11 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
              >
                {canceling ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cancelando...</>
                ) : (
                  <><XCircle className="w-4 h-4 mr-2" /> Cancelar Agendamento</>
                )}
              </Button>
            </div>
          )}

          {!canCancel && booking.status === "agendado" && booking.date < today && (
            <p className="text-xs text-slate-400 text-center pt-2">
              Esta consulta já passou e não pode mais ser cancelada.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 text-center">
        <a href={`${BASE}/agendar`} className="text-primary text-sm underline">
          Fazer um novo agendamento
        </a>
      </div>
    </div>
  );
}

