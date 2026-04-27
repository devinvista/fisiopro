import { createContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { getCurrentUser } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { apiSendJson } from "@/lib/api";
import { resolvePermissions, type Permission } from "@/utils/permissions";
import { planHasFeature, type Feature, type PlanTier } from "@/utils/plan-features";

export interface SubscriptionInfo {
  planId: number;
  planName: string;
  status: string;
  paymentStatus: string;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
  maxProfessionals: number | null;
  maxPatients: number | null;
  maxSchedules: number | null;
  maxUsers: number | null;
}

export interface ClinicInfo {
  id: number;
  name: string;
  roles: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  clinicId: number | null;
  clinics: ClinicInfo[];
  isSuperAdmin: boolean;
  subscription: SubscriptionInfo | null;
  features: Feature[];
  planName: PlanTier | null;
  /**
   * Chamado APÓS o backend ter setado o cookie httpOnly via /api/auth/login
   * ou /api/auth/register. O argumento `_token` é mantido por compat e ignorado.
   */
  login: (_token: string, user: User, clinics?: ClinicInfo[]) => void;
  logout: () => Promise<void>;
  switchClinic: (clinicId: number) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (role: string) => boolean;
  hasFeature: (feature: Feature) => boolean;
  /** Recarrega /api/auth/me e atualiza o usuário no contexto (LGPD, planos, etc). */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_CLINIC_ID = "fisiogest_clinic_id";
const STORAGE_CLINICS = "fisiogest_clinics";
/** Sinaliza que existe uma sessão ativa (presença booleana). NÃO é o token. */
const STORAGE_AUTH_HINT = "fisiogest_authenticated";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => localStorage.getItem(STORAGE_AUTH_HINT) === "1",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [clinicId, setClinicId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_CLINIC_ID);
    return stored ? parseInt(stored) : null;
  });
  const [clinics, setClinics] = useState<ClinicInfo[]>(() => {
    const stored = localStorage.getItem(STORAGE_CLINICS);
    if (!stored) return [];
    try {
      return JSON.parse(stored) as ClinicInfo[];
    } catch {
      localStorage.removeItem(STORAGE_CLINICS);
      return [];
    }
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    async function verifyAuth() {
      try {
        const userData = (await getCurrentUser()) as any;
        if (cancelled) return;
        setUser(userData);
        setIsAuthenticated(true);
        localStorage.setItem(STORAGE_AUTH_HINT, "1");
        setIsSuperAdmin(userData.isSuperAdmin ?? false);
        setSubscription(userData.subscription ?? null);
        setFeatures(userData.features ?? []);
        if (userData.clinicId !== undefined) setClinicId(userData.clinicId);
        if (userData.clinics) {
          setClinics(userData.clinics);
          localStorage.setItem(STORAGE_CLINICS, JSON.stringify(userData.clinics));
        }
      } catch {
        if (cancelled) return;
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem(STORAGE_AUTH_HINT);
        localStorage.removeItem(STORAGE_CLINIC_ID);
        localStorage.removeItem(STORAGE_CLINICS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    verifyAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (_token: string, newUser: User, newClinics?: ClinicInfo[]) => {
    const userData = newUser as any;
    const clinicIdVal = userData.clinicId ?? null;
    const isSA = userData.isSuperAdmin ?? false;

    localStorage.setItem(STORAGE_AUTH_HINT, "1");
    if (clinicIdVal) localStorage.setItem(STORAGE_CLINIC_ID, String(clinicIdVal));
    if (newClinics) localStorage.setItem(STORAGE_CLINICS, JSON.stringify(newClinics));

    setUser(newUser);
    setIsAuthenticated(true);
    setClinicId(clinicIdVal);
    setIsSuperAdmin(isSA);
    if (newClinics) setClinics(newClinics);
    setLocation(isSA ? "/superadmin" : "/dashboard");
  };

  const logout = async () => {
    try {
      await apiSendJson("/api/auth/logout", "POST");
    } catch {
      // ignore — vamos limpar do lado do cliente de qualquer jeito
    }
    localStorage.removeItem(STORAGE_AUTH_HINT);
    localStorage.removeItem(STORAGE_CLINIC_ID);
    localStorage.removeItem(STORAGE_CLINICS);
    setUser(null);
    setIsAuthenticated(false);
    setClinicId(null);
    setClinics([]);
    setIsSuperAdmin(false);
    setLocation("/login");
  };

  const switchClinic = async (newClinicId: number) => {
    try {
      const data = await apiSendJson<{ clinicId: number | null }>(
        "/api/auth/switch-clinic",
        "POST",
        { clinicId: newClinicId === 0 ? null : newClinicId },
      );

      if (data.clinicId) {
        localStorage.setItem(STORAGE_CLINIC_ID, String(data.clinicId));
      } else {
        localStorage.removeItem(STORAGE_CLINIC_ID);
      }

      setClinicId(data.clinicId ?? null);
      setLocation("/dashboard");
    } catch (err) {
      console.error("Failed to switch clinic", err);
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    const perms = resolvePermissions((user as any).roles ?? [], isSuperAdmin);
    return perms.has(permission);
  };

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    if (role === "super_admin") return isSuperAdmin;
    return ((user as any).roles ?? []).includes(role);
  };

  const hasFeature = (feature: Feature): boolean => {
    if (isSuperAdmin) return true;
    if (features.length > 0) return features.includes(feature);
    return planHasFeature(subscription?.planName ?? null, feature);
  };

  const refreshUser = async () => {
    try {
      const userData = (await getCurrentUser()) as any;
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem(STORAGE_AUTH_HINT, "1");
      setIsSuperAdmin(userData.isSuperAdmin ?? false);
      setSubscription(userData.subscription ?? null);
      setFeatures(userData.features ?? []);
      if (userData.clinicId !== undefined) setClinicId(userData.clinicId);
      if (userData.clinics) {
        setClinics(userData.clinics);
        localStorage.setItem(STORAGE_CLINICS, JSON.stringify(userData.clinics));
      }
    } catch {
      /* mantém estado atual se a re-busca falhar */
    }
  };

  const planName = (subscription?.planName as PlanTier | undefined) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        clinicId,
        clinics,
        isSuperAdmin,
        subscription,
        features,
        planName,
        login,
        logout,
        switchClinic,
        hasPermission,
        hasRole,
        hasFeature,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
