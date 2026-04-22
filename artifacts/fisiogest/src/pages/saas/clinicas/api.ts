import { apiFetch } from "@/utils/api";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");

export async function fetchClinics() {
  const res = await apiFetch(`${API_BASE}/api/clinics`);
  if (!res.ok) throw new Error("Failed to fetch clinics");
  return res.json();
}

export async function createClinic(data: Record<string, string>) {
  const res = await apiFetch(`${API_BASE}/api/clinics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Erro ao criar clínica");
  }
  return res.json();
}

export async function updateClinic(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erro ao atualizar clínica");
  return res.json();
}

export async function deleteClinic(id: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao excluir clínica");
}

export async function fetchClinicUsers(clinicId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users`);
  if (!res.ok) throw new Error("Falha ao buscar usuários");
  return res.json();
}

export async function addUserToClinic(clinicId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Erro ao adicionar usuário");
  }
  return res.json();
}

export async function updateUserInClinic(
  clinicId: number,
  userId: number,
  data: Record<string, unknown>
) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Erro ao atualizar usuário");
  }
  return res.json();
}

export async function removeUserFromClinic(clinicId: number, userId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erro ao remover usuário");
}

export async function impersonateClinic(clinicId: number) {
  const res = await apiFetch(`${API_BASE}/api/clinics/${clinicId}/impersonate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Erro ao acessar clínica");
  return res.json();
}
