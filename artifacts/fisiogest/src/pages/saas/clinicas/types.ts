export interface Clinic {
  id: number;
  name: string;
  type?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  crefito?: string | null;
  responsibleTechnical?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ClinicUser {
  id: number;
  name: string;
  email: string | null;
  roles: string[];
}

export interface ClinicFormData {
  name: string;
  type: string;
  cnpj: string;
  cpf: string;
  crefito: string;
  responsibleTechnical: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  logoUrl: string;
}

export interface AddUserFormData {
  name: string;
  cpf: string;
  email: string;
  password: string;
  roles: string[];
}

export interface EditUserFormData {
  name: string;
  email: string;
  password: string;
  roles: string[];
}
