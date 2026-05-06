import { useState } from "react";
import { CalendarDays, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { apiSendJson } from "@/lib/api";

interface Props {
  patientId: number;
  planId: number;
  startDate?: string | null;
  durationMonths?: number | null;
  onClosed: () => void;
}

function buildMonthOptions(startDate?: string | null, durationMonths?: number | null) {
  const months: { value: string; label: string }[] = [];

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  if (startDate && durationMonths && durationMonths > 0) {
    const [y, m] = startDate.split("-").map(Number);
    for (let i = 0; i < durationMonths; i++) {
      const totalMonths = m - 1 + i;
      const year = y + Math.floor(totalMonths / 12);
      const month = (totalMonths % 12) + 1;
      const value = `${year}-${String(month).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[month - 1]} ${year}`;
      months.push({ value, label });
    }
  } else {
    // Fallback: últimos 12 meses + mês atual
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const value = `${year}-${String(month).padStart(2, "0")}`;
      const MONTH_NAMES_LOCAL = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
      ];
      months.push({ value, label: `${MONTH_NAMES_LOCAL[month - 1]} ${year}` });
    }
  }

  return months;
}

export function CloseMonthBlock({ patientId, planId, startDate, durationMonths, onClosed }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const options = buildMonthOptions(startDate, durationMonths);

  const defaultRef = (() => {
    const current = new Date().toISOString().slice(0, 7);
    if (options.some((o) => o.value === current)) return current;
    return options[0]?.value ?? current;
  })();

  const [ref, setRef] = useState(defaultRef);

  async function doClose() {
    setBusy(true);
    try {
      const res = await apiSendJson<any>(
        `/api/patients/${patientId}/treatment-plans/${planId}/close-month?ref=${ref}`,
        "POST", {},
      );
      if (res?.alreadyClosed) {
        toast({ title: "Mês já fechado", description: `Fatura #${res.invoiceId ?? res.financialRecordId} já existe.` });
      } else {
        const modeLabel = res?.mode === "pregen_updated"
          ? "Estimativa atualizada com sessões reais"
          : "Fatura consolidada criada";
        toast({
          title: "Mês fechado!",
          description: `${modeLabel}: R$ ${Number(res?.totalAmount ?? res?.amount ?? 0).toFixed(2)} — ${res?.sessionsCount ?? res?.itemsConsolidated ?? 0} sessão(ões).`,
        });
      }
      onClosed();
    } catch (err: any) {
      toast({ title: "Erro ao fechar mês", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-blue-700" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">Fechar mês de avulsos</h4>
          <p className="text-[11px] text-slate-500">Consolida sessões avulsas em uma única fatura</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={ref} onValueChange={setRef}>
          <SelectTrigger className="h-10 w-52 bg-white">
            <SelectValue placeholder="Selecione o mês" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-10 gap-1.5 rounded-xl"
          onClick={doClose}
          disabled={busy || !ref}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Fechar mês
        </Button>
      </div>
    </div>
  );
}
