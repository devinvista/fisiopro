import { apiFetch } from "@/utils/api";

export async function fetchJSON(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Erro ao carregar dados");
  return res.json();
}

export type ClinicBasic = {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
};
