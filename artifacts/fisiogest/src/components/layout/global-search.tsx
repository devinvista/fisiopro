import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  CalendarPlus,
  Calendar,
  Users,
  LayoutDashboard,
  Wallet,
  Stethoscope,
  Settings,
  BarChart3,
  Loader2,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useListPatients } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/utils/permissions";

interface QuickAction {
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  path: string;
  permission?: Permission;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Dashboard", hint: "Visão geral", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Agenda", hint: "Ver atendimentos do dia", icon: Calendar, path: "/agenda", permission: "appointments.read" },
  { label: "Novo agendamento", hint: "Agendar para um paciente", icon: CalendarPlus, path: "/agendar", permission: "appointments.create" },
  { label: "Pacientes", hint: "Lista completa", icon: Users, path: "/pacientes", permission: "patients.read" },
  { label: "Procedimentos", hint: "Catálogo de serviços", icon: Stethoscope, path: "/procedimentos", permission: "procedures.manage" },
  { label: "Financeiro", hint: "Receitas e despesas", icon: Wallet, path: "/financeiro", permission: "financial.read" },
  { label: "Relatórios", hint: "Indicadores e exportações", icon: BarChart3, path: "/relatorios", permission: "reports.read" },
  { label: "Configurações", hint: "Clínica, usuários e agendas", icon: Settings, path: "/configuracoes" },
];

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

interface PatientHit {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 220);
  const [, setLocation] = useLocation();
  const { hasPermission } = useAuth();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut =
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = debouncedQuery.trim();
  const canSearchPatients = hasPermission("patients.read");

  const patientsQuery = useListPatients(
    { search: trimmedQuery, limit: 8 },
    {
      query: {
        enabled: open && canSearchPatients && trimmedQuery.length >= 2,
        staleTime: 30_000,
      },
    },
  );

  const patients = useMemo<PatientHit[]>(() => {
    const raw = (patientsQuery.data?.data ?? []) as PatientHit[];
    return raw.slice(0, 8);
  }, [patientsQuery.data]);

  const visibleActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => !action.permission || hasPermission(action.permission)),
    [hasPermission],
  );

  const handleSelect = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex h-9 items-center gap-2 rounded-full border-slate-200 bg-white/60 px-3 text-sm font-medium text-slate-500 hover:text-foreground hover:bg-white"
        aria-label="Abrir busca global"
        title="Buscar (Ctrl + K)"
      >
        <Search className="h-4 w-4" />
        <span>Buscar…</span>
        <kbd className="ml-2 hidden lg:inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden h-10 w-10 text-muted-foreground"
        aria-label="Abrir busca global"
      >
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar pacientes, ir para uma página…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {canSearchPatients && trimmedQuery.length >= 2 && (
            <CommandGroup heading="Pacientes">
              {patientsQuery.isFetching && patients.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </div>
              )}
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={`patient-${patient.id}-${patient.name}`}
                  onSelect={() => handleSelect(`/pacientes/${patient.id}`)}
                >
                  <Users className="text-teal-600" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{patient.name}</span>
                    {(patient.phone || patient.email) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {patient.phone ?? patient.email}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {!patientsQuery.isFetching && patients.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  Nenhum paciente encontrado para “{trimmedQuery}”.
                </div>
              )}
            </CommandGroup>
          )}

          {canSearchPatients && trimmedQuery.length >= 2 && visibleActions.length > 0 && (
            <CommandSeparator />
          )}

          <CommandGroup heading="Ações rápidas">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.path}
                  value={`${action.label} ${action.hint}`}
                  onSelect={() => handleSelect(action.path)}
                >
                  <Icon className="text-slate-500" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{action.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{action.hint}</span>
                  </div>
                  <CommandShortcut>{action.path}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {canSearchPatients && trimmedQuery.length > 0 && trimmedQuery.length < 2 && (
            <CommandEmpty>Digite pelo menos 2 caracteres para buscar pacientes.</CommandEmpty>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
