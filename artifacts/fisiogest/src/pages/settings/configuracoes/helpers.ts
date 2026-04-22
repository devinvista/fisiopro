import { apiFetch } from "@/utils/api";
import { API_BASE } from "./constants";
import type { Clinic, SystemUser } from "./types";

export async function fetchCurrentClinic(): Promise<Clinic> {
  const res = await apiFetch(`${API_BASE}/api/clinics/current`);
  if (!res.ok) throw new Error("Erro ao carregar clínica");
  return res.json();
}

export async function updateCurrentClinic(data: Partial<Clinic>): Promise<Clinic> {
  const res = await apiFetch(`${API_BASE}/api/clinics/current`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erro ao salvar clínica");
  return res.json();
}

export async function fetchUsers(): Promise<SystemUser[]> {
  const res = await apiFetch(`${API_BASE}/api/users`);
  if (!res.ok) throw new Error("Erro ao carregar usuários");
  return res.json();
}

export type Section = "clinica" | "usuarios" | "agendas" | "plano";

export function getHashSection(): Section {
  if (typeof window === "undefined") return "clinica";
  const h = window.location.hash.replace("#", "");
  if (h === "usuarios" || h === "agendas" || h === "plano") return h;
  return "clinica";
}
