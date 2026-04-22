import { BASE, API_BASE, api, TABS, TabId, TIER_CONFIG, getTierConfig, STATUS_CONFIG, PAYMENT_CONFIG, EMPTY_PLAN, PAYMENT_METHOD_LABELS, PaymentRow, PaymentStats, EMPTY_COUPON } from "../constants";
import { Plan, PlanStats, SubRow } from "../types";
import { fmtDate, fmtCurrency, limitLabel } from "../utils";
import { ClinicsTab, CouponsTab, KpiCard, PainelTab, PaymentBadge, PaymentsTab, PlansTab, StatusBadge, SubscriptionsTab } from "./";
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

export function RegisterPaymentDialog({
  open,
  onClose,
  subs,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  subs: SubRow[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [clinicId, setClinicId] = useState<string>("");
  const [subscriptionId, setSubscriptionId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("pix");
  const [referenceMonth, setReferenceMonth] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<boolean>(true);

  const clinicSub = subs.find((s) => String(s.sub.clinicId) === clinicId);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        clinicId: Number(clinicId),
        amount: Number(amount),
        method,
        updateSubscriptionStatus: updateStatus,
      };
      if (subscriptionId) body.subscriptionId = Number(subscriptionId);
      if (referenceMonth) body.referenceMonth = referenceMonth;
      if (paidAt) body.paidAt = new Date(paidAt).toISOString();
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch(api("/payment-history"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Falha ao registrar pagamento");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pagamento registrado com sucesso" });
      onSuccess();
      onClose();
      setClinicId("");
      setSubscriptionId("");
      setAmount("");
      setMethod("pix");
      setReferenceMonth("");
      setPaidAt(new Date().toISOString().slice(0, 10));
      setNotes("");
      setUpdateStatus(true);
    },
    onError: (err: any) =>
      toast({ variant: "destructive", title: "Erro", description: err.message }),
  });

  const canSubmit = clinicId && amount && Number(amount) > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-indigo-600" />
            Registrar Pagamento
          </DialogTitle>
          <DialogDescription>
            Registre um pagamento recebido de uma clínica manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Clinic */}
          <div className="space-y-1.5">
            <Label>Clínica *</Label>
            <Select value={clinicId} onValueChange={(v) => { setClinicId(v); setSubscriptionId(""); }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione a clínica" />
              </SelectTrigger>
              <SelectContent>
                {subs.map((s) => (
                  <SelectItem key={s.sub.clinicId} value={String(s.sub.clinicId)}>
                    {s.clinic?.name ?? "(sem nome)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subscription (auto-filled) */}
          {clinicSub && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Plano <strong>{clinicSub.plan?.displayName ?? "—"}</strong> — {clinicSub.sub.status}
              </span>
            </div>
          )}

          {/* Amount + Method row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference month + paid at row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Input
                type="month"
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              placeholder="Número de comprovante, observações..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl resize-none"
            />
          </div>

          {/* Update subscription status toggle */}
          {clinicSub && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-700">Atualizar status da assinatura</p>
                <p className="text-xs text-slate-400">Marca a assinatura como "Pago" automaticamente</p>
              </div>
              <Switch checked={updateStatus} onCheckedChange={setUpdateStatus} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Registrar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

