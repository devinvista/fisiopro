import { apiFetchJson, apiSendJson, API_BASE } from "./api";

export type PolicyType = "privacy" | "terms";

export interface PolicyDocument {
  id: number;
  type: PolicyType;
  version: string;
  title: string;
  contentMd: string;
  summary: string | null;
  publishedAt: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface PolicySummary {
  id: number;
  type: PolicyType;
  version: string;
  title: string;
}

export interface UserPolicyStatus {
  current: Array<PolicySummary & { publishedAt: string; accepted: boolean }>;
  pending: PolicySummary[];
  hasPending: boolean;
}

export async function getCurrentPolicies(): Promise<{ items: PolicyDocument[] }> {
  return apiFetchJson(`${API_BASE}/api/lgpd/policies/current`);
}

export async function getCurrentPolicyByType(type: PolicyType): Promise<PolicyDocument> {
  return apiFetchJson(`${API_BASE}/api/lgpd/policies/${type}/current`);
}

export async function getPolicyHistory(type: PolicyType): Promise<{ items: PolicyDocument[] }> {
  return apiFetchJson(`${API_BASE}/api/lgpd/policies/${type}/history`);
}

export async function getMyPolicyStatus(): Promise<UserPolicyStatus> {
  return apiFetchJson(`${API_BASE}/api/lgpd/me/status`);
}

export async function acceptPolicy(policyDocumentId: number): Promise<{ ok: true; policyDocumentId: number }> {
  return apiSendJson(`${API_BASE}/api/lgpd/me/accept`, "POST", { policyDocumentId });
}

/**
 * Dispara o download do JSON de portabilidade de dados de um paciente
 * (LGPD art. 18, V).
 */
export async function downloadPatientExport(patientId: number): Promise<void> {
  const url = `${API_BASE}/api/lgpd/patients/${patientId}/export`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = `Falha ao exportar dados (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ?? `paciente-${patientId}-lgpd.json`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
