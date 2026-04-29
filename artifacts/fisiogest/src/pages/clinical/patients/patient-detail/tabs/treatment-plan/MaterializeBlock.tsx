import { useState } from "react";
import {
  AlertCircle, CheckCircle, Loader2, RotateCcw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/lib/toast";
import { apiSendJson } from "@/lib/api";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtBR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

interface Props {
  planId: number;
  patientId: number;
  materializedAt: string | null;
  planStartDate: string | null;
  planDurationMonths: number;
  planItems: any[];
  onChanged: () => void;
}

/**
 * "Iniciar plano" — gera as consultas no calendário e as parcelas mensais.
 * Usa como única fonte de verdade `planStartDate` e `planDurationMonths` do plano
 * (definidos na Etapa 1). Não duplica os campos.
 */
export function MaterializeBlock({
  planId, patientId, materializedAt, planStartDate, planDurationMonths, planItems, onChanged,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"materialize" | "dematerialize" | null>(null);
  const [confirmDematerialize, setConfirmDematerialize] = useState(false);

  // Resolve start date — usa o do plano; se vazio, usa hoje só na chamada.
  const startDate = planStartDate ?? todayISO();
  const durationMonths = planDurationMonths || 12;

  const monthlyItems = planItems.filter(i => i.packageType === "mensal");
  const hasMonthly = monthlyItems.length > 0;
  const isMaterialized = !!materializedAt;

  // Detecta itens recorrentes sem dias/horários configurados.
  const itemsMissingSchedule = monthlyItems.filter((i) => {
    let weekDaysCount = 0;
    try {
      const wd = i.weekDays ? (typeof i.weekDays === "string" ? JSON.parse(i.weekDays) : i.weekDays) : [];
      weekDaysCount = Array.isArray(wd) ? wd.length : 0;
    } catch { weekDaysCount = 0; }
    return weekDaysCount === 0 || !i.defaultStartTime;
  });
  const hasMissingSchedule = itemsMissingSchedule.length > 0;

  const totalApptsEstimate = monthlyItems.reduce((sum, i) => {
    let weekDaysCount = 0;
    try {
      const wd = i.weekDays ? (typeof i.weekDays === "string" ? JSON.parse(i.weekDays) : i.weekDays) : [];
      weekDaysCount = Array.isArray(wd) ? wd.length : 0;
    } catch { weekDaysCount = 0; }
    return sum + weekDaysCount * 4 * durationMonths;
  }, 0);

  async function doMaterialize() {
    setBusy("materialize");
    try {
      const res = await apiSendJson<any>(
        `/api/treatment-plans/${planId}/materialize`,
        "POST",
        { startDate, durationMonths },
      );
      toast({
        title: "Plano iniciado!",
        description: `Geradas ${res.appointmentsCreated ?? "?"} consultas e ${res.invoicesCreated ?? "?"} parcelas a partir de ${fmtBR(startDate)}.`,
      });
      onChanged();
    } catch (err: any) {
      toast({ title: "Erro ao iniciar plano", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function doDematerialize() {
    setBusy("dematerialize");
    try {
      const res = await apiSendJson<any>(`/api/treatment-plans/${planId}/materialize`, "DELETE", {});
      toast({
        title: "Plano revertido",
        description: `Removidos ${res.appointmentsDeleted ?? "?"} consultas e ${res.invoicesDeleted ?? "?"} parcelas.`,
      });
      onChanged();
      setConfirmDematerialize(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  if (isMaterialized) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <h4 className="text-sm font-semibold text-emerald-800">Plano em andamento</h4>
        </div>
        <p className="text-xs text-emerald-700/90 leading-relaxed">
          Iniciado em {new Date(materializedAt!).toLocaleDateString("pt-BR")}.
          Consultas e parcelas mensais já estão na agenda e no financeiro.
          A duração de cada consulta segue a duração cadastrada no procedimento vinculado.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant="outline"
            className="h-9 gap-1.5 rounded-xl border-rose-300 text-rose-600 hover:bg-rose-50"
            onClick={() => setConfirmDematerialize(true)}
            disabled={busy !== null}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reverter início do plano
          </Button>
        </div>

        <AlertDialog open={confirmDematerialize} onOpenChange={setConfirmDematerialize}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reverter início do plano?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso apaga todas as consultas futuras (status agendado) e parcelas
                pendentes não pagas vinculadas a este plano. Parcelas já pagas
                permanecem. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                onClick={(e) => { e.preventDefault(); doDematerialize(); }}
                disabled={busy !== null}
              >
                {busy === "dematerialize" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sim, reverter"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">Iniciar plano</h4>
          <p className="text-[11px] text-slate-500">Gera consultas e parcelas para todo o período</p>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-100 p-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
            Início
          </p>
          <p className="font-semibold text-slate-700">{fmtBR(startDate)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
            Duração
          </p>
          <p className="font-semibold text-slate-700">
            {durationMonths} {durationMonths === 1 ? "mês" : "meses"}
          </p>
        </div>
        {hasMonthly && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
                Consultas a gerar
              </p>
              <p className="font-semibold text-slate-700">~{totalApptsEstimate}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
                Parcelas mensais
              </p>
              <p className="font-semibold text-slate-700">{monthlyItems.length * durationMonths}</p>
            </div>
          </>
        )}
      </div>

      {hasMissingSchedule && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-0.5">
              {itemsMissingSchedule.length} item recorrente sem agenda definida
            </p>
            <p className="text-amber-700">
              Volte para a etapa <strong>Aceite & Agenda</strong> e configure dias da semana e horário.
            </p>
          </div>
        </div>
      )}

      {!hasMonthly && !hasMissingSchedule && (
        <p className="text-xs text-slate-600">
          Plano sem itens mensais. Iniciando agora, o plano fica ativo e os atendimentos avulsos
          passam a gerar cobrança conforme realizados.
        </p>
      )}

      <Button
        className="w-full h-11 gap-2 rounded-xl shadow-md shadow-primary/20 text-sm font-semibold"
        onClick={doMaterialize}
        disabled={busy !== null || hasMissingSchedule}
      >
        {busy === "materialize" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Iniciar plano agora
      </Button>
    </div>
  );
}
