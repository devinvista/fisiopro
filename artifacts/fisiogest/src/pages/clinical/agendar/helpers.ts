import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BASE } from "./constants";
import type { PatientLookupResult } from "./types";

export function formatCpfMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function formatDateBR(isoDate: string) {
  try {
    return format(parseISO(isoDate), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return isoDate;
  }
}

export async function lookupPatient(q: string): Promise<PatientLookupResult> {
  if (q.trim().length < 4) return { found: false };
  const res = await fetch(`${BASE}/api/public/patient-lookup?q=${encodeURIComponent(q.trim())}`);
  if (!res.ok) return { found: false };
  return res.json();
}
