import type { ClinicFormData, AddUserFormData } from "./types";

export const EMPTY_FORM: ClinicFormData = {
  name: "",
  type: "clinica",
  cnpj: "",
  cpf: "",
  crefito: "",
  responsibleTechnical: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  logoUrl: "",
};

export const EMPTY_ADD_USER: AddUserFormData = {
  name: "",
  cpf: "",
  email: "",
  password: "",
  roles: ["profissional"],
};

export const ALL_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "profissional", label: "Profissional" },
  { value: "secretaria", label: "Secretaria" },
];

export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800 border-violet-200",
  profissional: "bg-blue-100 text-blue-800 border-blue-200",
  secretaria: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
