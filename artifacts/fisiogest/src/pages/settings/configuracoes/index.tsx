import { Section, getHashSection } from "./helpers";
import { BASE, API_BASE, ROLE_COLORS, DAYS_OF_WEEK, PRESET_COLORS, DEFAULT_SCHEDULE_FORM, EMPTY_USER_FORM, parseDays, formatDaysBadges, SECTIONS } from "./constants";
import { Clinic, SystemUser, Professional, Schedule, ScheduleFormState, SectionConfig } from "./types";
import { AgendasSection, ClinicaSection, ScheduleCard, UsuariosSection } from "./components";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { maskCpf, maskPhone, maskCnpj, displayCpf } from "@/utils/masks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/utils/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Save,
  Phone,
  Mail,
  MapPin,
  Hash,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  Calendar,
  User2,
  Power,
  PowerOff,
  Settings2,
  ChevronRight,
  Globe,
  Upload,
  ImageIcon,
  Award,
  UserCheck,
  X,
  ShieldAlert,
  Timer,
  BadgeDollarSign,
  CheckCircle2,
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/utils/permissions";
import type { Role } from "@/utils/permissions";
import { Sparkles } from "lucide-react";
import { PlanoSection } from "../plano-section";

export default function Configuracoes() {
  const { hasPermission } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>(getHashSection);

  const visibleSections = SECTIONS.filter((s) => s.permission === null || hasPermission(s.permission));

  const currentSection = visibleSections.find((s) => s.id === activeSection) ?? visibleSections[0];

  const navigate = useCallback(
    (section: Section) => {
      setActiveSection(section);
      window.history.replaceState(null, "", `${window.location.pathname}#${section}`);
    },
    []
  );

  useEffect(() => {
    if (currentSection && currentSection.id !== activeSection) {
      setActiveSection(currentSection.id);
    }
  }, [currentSection, activeSection]);

  useEffect(() => {
    const onHashChange = () => setActiveSection(getHashSection());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (visibleSections.length === 0) {
    return (
      <AppLayout title="Configurações">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2">
            Você não tem permissão para acessar as configurações.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Configurações">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* ── Navigation — horizontal tabs on mobile, sidebar on md+ ── */}
        <aside className="md:w-56 md:shrink-0">
          {/* Mobile: scrollable pill tabs */}
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0 md:sticky md:top-0 scrollbar-none">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              const isActive = currentSection?.id === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => navigate(section.id)}
                  className={`
                    shrink-0 flex items-center gap-2 px-3 py-2 md:py-2.5 rounded-xl text-left transition-all
                    md:w-full
                    ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }
                  `}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm leading-tight whitespace-nowrap md:whitespace-normal md:truncate">{section.label}</div>
                    <div
                      className={`text-xs leading-tight truncate mt-0.5 hidden md:block ${
                        isActive ? "text-primary/70" : "text-muted-foreground/70"
                      }`}
                    >
                      {section.description}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary hidden md:block" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Divider — vertical on desktop, horizontal on mobile ── */}
        <div className="hidden md:block w-px bg-border shrink-0" />
        <div className="md:hidden h-px bg-border" />

        {/* ── Content area ── */}
        <div className="flex-1 min-w-0">
          {/* Section header */}
          {currentSection && (
            <div className="mb-6">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <currentSection.icon className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{currentSection.label}</h2>
              </div>
              <p className="text-sm text-muted-foreground pl-0.5">
                {currentSection.description}
              </p>
              <Separator className="mt-4" />
            </div>
          )}

          {/* Section content */}
          <div className="mt-6">
            {currentSection?.id === "clinica" && <ClinicaSection />}
            {currentSection?.id === "usuarios" && <UsuariosSection />}
            {currentSection?.id === "agendas" && <AgendasSection />}
            {currentSection?.id === "plano" && <PlanoSection />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
