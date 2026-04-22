import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, StepConfirmacao, StepDataHora, StepIndicator, StepProcedimento, StepSeusDados } from "./";
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

// ── Step 2: Selecionar Procedimento ──────────────────────────────────────────

export function ProcedureCard({
  proc,
  selected,
  recommended,
  onSelect,
}: {
  proc: PublicProcedure;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md relative
        ${selected
          ? "border-primary bg-primary/5 shadow-md"
          : recommended
          ? "border-amber-300 bg-amber-50/60 hover:border-amber-400"
          : "border-slate-200 bg-white hover:border-primary/40"}`}
    >
      {recommended && !selected && (
        <span className="absolute -top-2 left-3 inline-flex items-center gap-1 text-[9px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
          <Star className="w-2.5 h-2.5" /> Recomendado
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-slate-800 text-sm leading-tight">{proc.name}</span>
        {selected && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="w-3 h-3" /> {proc.durationMinutes} min
        </span>
        <span className="text-sm font-bold text-primary">{formatCurrency(proc.price)}</span>
        {proc.maxCapacity > 1 && (
          <Badge variant="secondary" className="text-[10px] h-4">
            Grupo • até {proc.maxCapacity} pessoas
          </Badge>
        )}
      </div>
      {proc.description && (
        <p className="text-xs text-slate-400 mt-2 line-clamp-2">{proc.description}</p>
      )}
    </button>
  );
}

