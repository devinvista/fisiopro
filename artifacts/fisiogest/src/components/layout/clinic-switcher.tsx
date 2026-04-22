import { Building2, ChevronDown, Check, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/utils/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");

interface ClinicItem {
  id: number;
  name: string;
  isActive?: boolean;
}

export function ClinicSwitcher() {
  const { clinicId, clinics, switchClinic, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: allClinics = [], isLoading } = useQuery<ClinicItem[]>({
    queryKey: ["all-clinics-switcher"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/api/clinics`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: isSuperAdmin,
  });

  const displayClinics: ClinicItem[] = isSuperAdmin ? allClinics : clinics;

  if (!isSuperAdmin && clinics.length <= 1) return null;

  const activeClinic =
    displayClinics.find((c) => c.id === clinicId) ??
    (clinics.length > 0 ? clinics[0] : null);

  const activeName = activeClinic?.name ?? (isSuperAdmin ? "Selecionar clínica" : "Selecionar clínica");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between text-left text-sidebar-foreground/80 hover:bg-white/10 hover:text-white h-auto py-2 px-3 rounded-lg"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-primary/30 flex items-center justify-center shrink-0 border border-primary/50">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {activeName}
              </p>
              {isSuperAdmin && (
                <p className="text-[10px] text-sidebar-foreground/50">Super Admin</p>
              )}
            </div>
          </div>
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sidebar-foreground/50" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start" side="right">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {isSuperAdmin ? "Todas as Clínicas" : "Suas Clínicas"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {displayClinics.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {isLoading ? "Carregando..." : "Nenhuma clínica encontrada"}
          </div>
        )}
        {displayClinics.map((clinic) => (
          <DropdownMenuItem
            key={clinic.id}
            onClick={async () => {
              if (clinic.id !== clinicId) {
                await switchClinic(clinic.id);
                queryClient.clear();
              }
            }}
            className="gap-2 cursor-pointer"
          >
            <div className="h-6 w-6 rounded bg-primary/15 flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{clinic.name}</p>
              {!isSuperAdmin && "roles" in clinic && (
                <p className="text-xs text-muted-foreground capitalize">
                  {(clinic as any).roles?.join(", ")}
                </p>
              )}
              {isSuperAdmin && (
                <p className="text-xs text-muted-foreground">
                  {(clinic as any).isActive === false ? "Inativa" : "Ativa"}
                </p>
              )}
            </div>
            {clinic.id === clinicId && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
        {isSuperAdmin && clinicId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => { await switchClinic(0); queryClient.clear(); }}
              className="gap-2 cursor-pointer text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm">Sair da clínica</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
