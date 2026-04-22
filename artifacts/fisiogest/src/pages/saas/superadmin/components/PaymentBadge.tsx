import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentsTab, PlansTab, RegisterPaymentDialog, StatusBadge, SubscriptionsTab } from "./";
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

export function PaymentBadge({ status }: { status: string }) {
  const cfg = PAYMENT_CONFIG[status] ?? PAYMENT_CONFIG.pending;
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

