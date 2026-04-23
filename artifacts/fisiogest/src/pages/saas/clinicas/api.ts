import { API_BASE, apiFetchJson, apiSendJson } from "@/utils/api";

const url = (path: string) => `${API_BASE}/api${path}`;

export function fetchClinics() {
  return apiFetchJson(url("/clinics"));
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

export function fetchClinicUsers(clinicId: number) {
  return apiFetchJson(url(`/clinics/${clinicId}/users`));
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

export function impersonateClinic(clinicId: number) {
  return apiSendJson(url(`/clinics/${clinicId}/impersonate`), "POST");
}
