import { BASE, API_BASE, ROLE_COLORS, DAYS_OF_WEEK, PRESET_COLORS, DEFAULT_SCHEDULE_FORM, EMPTY_USER_FORM, parseDays, formatDaysBadges, SECTIONS } from "../constants";
import { Clinic, SystemUser, Professional, Schedule, ScheduleFormState, SectionConfig } from "../types";
import { AgendasSection, ClinicaSection, UsuariosSection } from "./";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { maskCpf, maskPhone, maskCnpj, displayCpf } from "@/utils/masks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/utils/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Save,
  Phone,
  Mail,
  MapPin,
  Hash,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  Calendar,
  User2,
  Power,
  PowerOff,
  Settings2,
  ChevronRight,
  Globe,
  Upload,
  ImageIcon,
  Award,
  UserCheck,
  X,
  ShieldAlert,
  Timer,
  BadgeDollarSign,
  CheckCircle2,
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/utils/permissions";
import type { Role } from "@/utils/permissions";
import { Sparkles } from "lucide-react";
import { PlanoSection } from "../../plano-section";

export function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onToggle,
}: {
  schedule: Schedule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const days = formatDaysBadges(schedule.workingDays);

  return (
    <div
      className={`relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-md ${
        !schedule.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: schedule.color }} />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate">
              {schedule.name}
            </h3>
            {schedule.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {schedule.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {schedule.type === "professional" ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <User2 className="h-3 w-3" />
              {schedule.professional?.name ?? "Profissional"}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs">
              <Building2 className="h-3 w-3" />
              Geral da clínica
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {schedule.startTime} – {schedule.endTime}
          </span>
          <span className="text-border">·</span>
          <span>{schedule.slotDurationMinutes} min/slot</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-wrap gap-1">
            {days.length === 7 ? (
              <span className="font-medium text-foreground">Todos os dias</span>
            ) : days.length === 0 ? (
              <span className="text-destructive">Nenhum dia selecionado</span>
            ) : (
              days.map((d) => (
                <span key={d.value} className="font-medium text-foreground">
                  {d.label}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {schedule.isActive ? (
              <Power className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <PowerOff className="h-3.5 w-3.5" />
            )}
            <span className={schedule.isActive ? "text-green-600 font-medium" : ""}>
              {schedule.isActive ? "Ativa" : "Inativa"}
            </span>
          </div>
          <Switch
            checked={schedule.isActive}
            onCheckedChange={onToggle}
            className="scale-75"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Settings nav config ───────────────────────────────────── */

