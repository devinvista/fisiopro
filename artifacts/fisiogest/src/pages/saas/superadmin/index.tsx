import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "./constants";
import { Plan, PlanStats, SubRow } from "./types";
import { fmtDate, fmtCurrency, limitLabel } from "./utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./components";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard,
  Package,
  CreditCard,
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Activity,
  Infinity,
  Sparkles,
  Zap,
  Crown,
  Search,
  Filter,
  Check,
  RefreshCw,
  ChevronDown,
  BadgeDollarSign,
  Users,
  BarChart3,
  Receipt,
  DollarSign,
  CalendarDays,
  Banknote,
  Tag,
  Link2,
  Copy,
  CheckCircle2,
  Percent,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiFetch } from "@/utils/api";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState<TabId>("painel");

  return (
    <AppLayout title="Painel SuperAdmin">
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Painel SuperAdmin</h1>
            <p className="text-sm text-slate-500">Gestão de planos de adesão e assinaturas das clínicas</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                activeTab === id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "painel" && <PainelTab />}
        {activeTab === "planos" && <PlansTab />}
        {activeTab === "assinaturas" && <SubscriptionsTab />}
        {activeTab === "clinicas" && <ClinicsTab />}
        {activeTab === "pagamentos" && <PaymentsTab />}
        {activeTab === "cupons" && <CouponsTab />}
      </div>
    </AppLayout>
  );
}
