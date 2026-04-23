import { API_BASE, apiFetchJson, apiSendJson } from "@/lib/api";
import type { Clinic, ClinicUser } from "@/pages/saas/clinicas/types";

const url = (path: string) => `${API_BASE}/api${path}`;

export function fetchClinics(): Promise<Clinic[]> {
  return apiFetchJson(url("/clinics")) as Promise<Clinic[]>;
}

export function createClinic(data: Record<string, string>) {
  return apiSendJson(url("/clinics"), "POST", data);
}

export function updateClinic(id: number, data: Record<string, unknown>) {
  return apiSendJson(url(`/clinics/${id}`), "PUT", data);
}

export function deleteClinic(id: number): Promise<void> {
  return apiSendJson<void>(url(`/clinics/${id}`), "DELETE");
}

export function fetchClinicUsers(clinicId: number): Promise<ClinicUser[]> {
  return apiFetchJson(url(`/clinics/${clinicId}/users`)) as Promise<ClinicUser[]>;
}

export function addUserToClinic(clinicId: number, data: Record<string, unknown>) {
  return apiSendJson(url(`/clinics/${clinicId}/users`), "POST", data);
}

export function updateUserInClinic(
  clinicId: number,
  userId: number,
  data: Record<string, unknown>,
) {
  return apiSendJson(url(`/clinics/${clinicId}/users/${userId}`), "PUT", data);
}

export function removeUserFromClinic(clinicId: number, userId: number): Promise<void> {
  return apiSendJson<void>(url(`/clinics/${clinicId}/users/${userId}`), "DELETE");
}

export function impersonateClinic(clinicId: number): Promise<{ token: string; clinicId: number }> {
  return apiSendJson(url(`/clinics/${clinicId}/impersonate`), "POST") as Promise<{ token: string; clinicId: number }>;
}
