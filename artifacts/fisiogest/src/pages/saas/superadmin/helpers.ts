import { apiFetchJson } from "@/utils/api";

/** Alias para chamadas GET autenticadas — mantido para compat com os componentes existentes. */
export const fetchJSON = apiFetchJson;

export type ClinicBasic = {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
};
