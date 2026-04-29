import { useState } from "react";
import { CalendarDays, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/toast";
import { apiSendJson } from "@/lib/api";

interface Props {
  patientId: number;
  planId: number;
  onClosed: () => void;
}

export function CloseMonthBlock({ patientId, planId, onClosed }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(() => new Date().toISOString().slice(0, 7));

  async function doClose() {
    setBusy(true);
    try {
      const res = await apiSendJson<any>(
        `/api/patients/${patientId}/treatment-plans/${planId}/close-month?ref=${ref}`,
        "POST", {},
      );
      if (res?.alreadyClosed) {
        toast({ title: "Mês já fechado", description: `Fatura #${res.financialRecordId} já existe.` });
      } else {
        toast({
          title: "Mês fechado!",
          description: `Fatura consolidada criada: R$ ${Number(res?.amount ?? 0).toFixed(2)} — ${res?.sessionsCount ?? 0} sessão(ões).`,
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
        <Input
          type="month" value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="h-10 w-44 bg-white"
        />
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
