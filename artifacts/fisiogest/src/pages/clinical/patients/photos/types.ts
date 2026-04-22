import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export type ViewType = "frontal" | "lateral_d" | "lateral_e" | "posterior" | "detalhe";

export interface AppointmentDetails {
  id: number;
  date: string;
  startTime: string;
  status: string;
  procedure: { id: number; name: string } | null;
}

export interface PatientPhoto {
  id: number;
  patientId: number;
  clinicId: number | null;
  takenAt: string;
  viewType: ViewType;
  sessionLabel: string | null;
  objectPath: string;
  originalFilename: string | null;
  contentType: string | null;
  fileSize: number | null;
  notes: string | null;
  appointmentId: number | null;
  appointmentDetails: AppointmentDetails | null;
  createdAt: string;
}

export interface AppointmentOption {
  id: number;
  date: string;
  startTime: string;
  status: string;
  procedure: { id: number; name: string } | null;
}

export interface PhotoSession {
  dateKey: string;
  label: string | null;
  photos: PatientPhoto[];
}

export interface FileEntry {
  file: File;
  previewUrl: string;
  viewType: ViewType;
}

export const VIEW_LABELS: Record<ViewType, string> = {
  frontal: "Frontal",
  lateral_d: "Lateral Dir.",
  lateral_e: "Lateral Esq.",
  posterior: "Posterior",
  detalhe: "Detalhe",
};

export const VIEW_ORDER: ViewType[] = [
  "frontal",
  "lateral_d",
  "lateral_e",
  "posterior",
  "detalhe",
];

export const VIEW_COLORS: Record<ViewType, string> = {
  frontal: "bg-blue-100 text-blue-700 border-blue-200",
  lateral_d: "bg-violet-100 text-violet-700 border-violet-200",
  lateral_e: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  posterior: "bg-amber-100 text-amber-700 border-amber-200",
  detalhe: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
  remarcado: "Remarcado",
};

export const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const COMPRESSION_OPTIONS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2400,
  useWebWorker: true,
  preserveExif: true,
};

export function groupBySession(photos: PatientPhoto[]): PhotoSession[] {
  const map = new Map<string, PatientPhoto[]>();
  for (const p of photos) {
    const key = p.takenAt.split("T")[0];
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, photos]) => ({
      dateKey,
      label: photos[0].sessionLabel,
      photos,
    }));
}

export function formatDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "dd 'de' MMMM 'de' yyyy", {
      locale: ptBR,
    });
  } catch {
    return isoDate;
  }
}

export function formatDateShort(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return isoDate;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function autoAssignViews(files: File[]): FileEntry[] {
  return files.map((file, i) => ({
    file,
    previewUrl: URL.createObjectURL(file),
    viewType: VIEW_ORDER[i % VIEW_ORDER.length],
  }));
}

export function appointmentLabel(appt: AppointmentOption): string {
  const dateStr = formatDateShort(appt.date + "T12:00:00");
  const proc = appt.procedure?.name ?? "Atendimento";
  const status = STATUS_LABELS[appt.status] ?? appt.status;
  return `${dateStr} ${appt.startTime} — ${proc} (${status})`;
}
