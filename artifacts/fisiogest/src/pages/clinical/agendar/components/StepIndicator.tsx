import { formatCpfMask, formatPhoneMask, todayBRT, formatCurrency, formatDateBR, lookupPatient } from "../helpers";
import { BASE, CATEGORY_ICONS, STATUS_LABELS } from "../constants";
import { PublicProcedure, TimeSlot, PublicSchedule, BookingConfirmation, BookingDetails, PatientLookupResult, PatientFormData } from "../types";
import { BookingView, ProcedureCard, StepConfirmacao, StepDataHora, StepProcedimento, StepSeusDados } from "./";
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

// ── Step indicators ───────────────────────────────────────────────────────────

export function StepIndicator({ step, total }: { step: number; total: number }) {
  const steps = [
    { label: "Seus Dados", icon: <FileText className="w-4 h-4" /> },
    { label: "Procedimento", icon: <Dumbbell className="w-4 h-4" /> },
    { label: "Data e Hora", icon: <Calendar className="w-4 h-4" /> },
  ];

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => {
        const idx = i + 1;
        const isActive = idx === step;
        const isDone = idx < step;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className={`flex flex-col items-center gap-1.5 ${i < total - 1 ? "flex-1" : ""}`}>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${isDone ? "bg-primary text-white" : isActive ? "bg-primary text-white ring-4 ring-primary/20" : "bg-slate-100 text-slate-400"}`}
              >
                {isDone ? <Check className="w-4 h-4" /> : s.icon}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide hidden sm:block ${isActive ? "text-primary" : "text-slate-400"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-5 transition-colors ${isDone ? "bg-primary" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

