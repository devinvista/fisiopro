import { apiFetchJson, apiSendJson } from "@/utils/api";
import { API_BASE } from "./constants";
import type { Clinic, SystemUser } from "./types";

export function fetchCurrentClinic(): Promise<Clinic> {
  return apiFetchJson<Clinic>(`${API_BASE}/api/clinics/current`);
}

export function updateCurrentClinic(data: Partial<Clinic>): Promise<Clinic> {
  return apiSendJson<Clinic>(`${API_BASE}/api/clinics/current`, "PATCH", data);
}

export function fetchUsers(): Promise<SystemUser[]> {
  return apiFetchJson<SystemUser[]>(`${API_BASE}/api/users`);
}

export type Section = "clinica" | "usuarios" | "agendas" | "plano";

export function getHashSection(): Section {
  if (typeof window === "undefined") return "clinica";
  const h = window.location.hash.replace("#", "");
  if (h === "usuarios" || h === "agendas" || h === "plano") return h;
  return "clinica";
}
