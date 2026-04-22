import type { SystemUser, SectionConfig } from "./types";
import { Building2, UserCog, CalendarDays, Sparkles } from "lucide-react";
import { apiFetch } from "@/utils/api";
import type { Role } from "@/utils/permissions";
import type { Clinic } from "./types";
import type { ScheduleFormState } from "./types";

export const BASE = import.meta.env.BASE_URL ?? "/";
export const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");
export const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-100 text-red-800 border-red-200",
  profissional: "bg-blue-100 text-blue-800 border-blue-200",
  secretaria: "bg-green-100 text-green-800 border-green-200",
};

export const DAYS_OF_WEEK = [
  { value: "0", label: "Dom", fullLabel: "Domingo" },
  { value: "1", label: "Seg", fullLabel: "Segunda-feira" },
  { value: "2", label: "Ter", fullLabel: "Terça-feira" },
  { value: "3", label: "Qua", fullLabel: "Quarta-feira" },
  { value: "4", label: "Qui", fullLabel: "Quinta-feira" },
  { value: "5", label: "Sex", fullLabel: "Sexta-feira" },
  { value: "6", label: "Sáb", fullLabel: "Sábado" },
];

export const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
];

export const DEFAULT_SCHEDULE_FORM: ScheduleFormState = {
  name: "",
  description: "",
  type: "clinic",
  professionalId: "",
  workingDays: ["1", "2", "3", "4", "5"],
  startTime: "08:00",
  endTime: "18:00",
  slotDurationMinutes: "30",
  color: "#6366f1",
};

export const EMPTY_USER_FORM = {
  name: "",
  cpf: "",
  email: "",
  password: "",
  roles: ["profissional"] as Role[],
};

/* ─── Helpers ───────────────────────────────────────────────── */

export function parseDays(workingDays: string): string[] {
  if (!workingDays) return [];
  return workingDays
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function formatDaysBadges(workingDays: string) {
  const days = parseDays(workingDays);
  return DAYS_OF_WEEK.filter((d) => days.includes(d.value));
}

/* ─── API functions ─────────────────────────────────────────── */

async function fetchCurrentClinic(): Promise<Clinic> {
  const res = await apiFetch(`${API_BASE}/api/clinics/current`);
  if (!res.ok) throw new Error("Falha ao carregar dados da clínica");
  return res.json();
}

async function updateCurrentClinic(data: Partial<Clinic>): Promise<Clinic> {
  const res = await apiFetch(`${API_BASE}/api/clinics/current`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Erro ao atualizar clínica");
  }
  return res.json();
}

async function fetchUsers(): Promise<SystemUser[]> {
  const res = await apiFetch("/api/users");
  if (!res.ok) throw new Error("Falha ao carregar usuários");
  return res.json();
}

/* ─── Section: Minha Clínica ────────────────────────────────── */

export const SECTIONS: SectionConfig[] = [
  {
    id: "clinica",
    label: "Minha Clínica",
    description: "Dados e informações da clínica",
    icon: Building2,
    permission: "settings.manage",
  },
  {
    id: "usuarios",
    label: "Usuários",
    description: "Gestão de usuários e perfis",
    icon: UserCog,
    permission: "users.manage",
  },
  {
    id: "agendas",
    label: "Agendas",
    description: "Configurações de horários e agendas",
    icon: CalendarDays,
    permission: "settings.manage",
  },
  {
    id: "plano",
    label: "Plano",
    description: "Plano contratado e upgrades",
    icon: Sparkles,
    permission: null,
  },
];

/* ─── Main Page ─────────────────────────────────────────────── */

