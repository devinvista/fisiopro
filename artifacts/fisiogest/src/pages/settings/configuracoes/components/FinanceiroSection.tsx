/**
 * FinanceiroSection — Sprint 2 — T5
 *
 * Permite a clínica configurar:
 *  - Meta mensal de receita
 *  - Orçamento total mensal de despesa
 *  - Reserva mínima de caixa (alerta no fluxo projetado — Sprint 3 T7)
 *  - Prazo padrão de vencimento de recebíveis por sessão
 *
 * Endpoint: GET/PUT  /api/clinics/current/financial-settings
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Wallet, Target, Receipt, PiggyBank, Calendar, Save, Loader2, Info,
} from "lucide-react";
import { apiFetchJson, apiSendJson, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ClinicFinancialSettings } from "../types";

const ENDPOINT = `${API_BASE}/api/clinics/current/financial-settings`;

type FormState = {
  monthlyRevenueGoal: string;
  monthlyExpenseBudget: string;
  cashReserveTarget: string;
  defaultDueDays: string;
};

const EMPTY_FORM: FormState = {
  monthlyRevenueGoal: "",
  monthlyExpenseBudget: "",
  cashReserveTarget: "",
  defaultDueDays: "3",
};

function toFormString(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function parseMoney(s: string): number | null {
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function FinanceiroSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery<ClinicFinancialSettings>({
    queryKey: ["clinic-financial-settings"],
    queryFn: () => apiFetchJson<ClinicFinancialSettings>(ENDPOINT),
  });

  useEffect(() => {
    if (data) {
      setForm({
        monthlyRevenueGoal: toFormString(data.monthlyRevenueGoal),
        monthlyExpenseBudget: toFormString(data.monthlyExpenseBudget),
        cashReserveTarget: toFormString(data.cashReserveTarget),
        defaultDueDays: String(data.defaultDueDays ?? 3),
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, number | null>) =>
      apiSendJson<ClinicFinancialSettings>(ENDPOINT, "PUT", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-financial-settings"] });
      // O DRE/Orçado vs Realizado dependem dessas configurações.
      queryClient.invalidateQueries({ queryKey: ["financial-dre"] });
      toast({ title: "Configurações financeiras atualizadas." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dueDays = Number(form.defaultDueDays);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      toast({ variant: "destructive", title: "Prazo inválido", description: "Informe um número entre 0 e 365." });
      return;
    }
    mutation.mutate({
      monthlyRevenueGoal: parseMoney(form.monthlyRevenueGoal),
      monthlyExpenseBudget: parseMoney(form.monthlyExpenseBudget),
      cashReserveTarget: parseMoney(form.cashReserveTarget),
      defaultDueDays: dueDays,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Metas e orçamento mensal
          </CardTitle>
          <CardDescription>
            Estes valores alimentam o "Orçado vs Realizado", o DRE mensal e o fluxo de caixa projetado.
            Deixe em branco para usar o cálculo automático (despesas recorrentes + receita estimada por MRR).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="monthlyRevenueGoal" className="flex items-center gap-1.5 text-sm font-medium">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              Meta mensal de receita (R$)
            </Label>
            <Input
              id="monthlyRevenueGoal"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="ex.: 25000"
              value={form.monthlyRevenueGoal}
              onChange={(e) => setForm((p) => ({ ...p, monthlyRevenueGoal: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Quando configurada, sobrescreve a estimativa baseada em MRR + recebíveis pendentes.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthlyExpenseBudget" className="flex items-center gap-1.5 text-sm font-medium">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
              Orçamento total mensal de despesa (R$)
            </Label>
            <Input
              id="monthlyExpenseBudget"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="ex.: 18000"
              value={form.monthlyExpenseBudget}
              onChange={(e) => setForm((p) => ({ ...p, monthlyExpenseBudget: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Quando configurado, substitui o somatório das despesas recorrentes como base do "orçado".</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cashReserveTarget" className="flex items-center gap-1.5 text-sm font-medium">
              <PiggyBank className="h-3.5 w-3.5 text-muted-foreground" />
              Reserva mínima de caixa (R$)
            </Label>
            <Input
              id="cashReserveTarget"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="ex.: 10000"
              value={form.cashReserveTarget}
              onChange={(e) => setForm((p) => ({ ...p, cashReserveTarget: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Linha de alerta no fluxo de caixa projetado. Em desenvolvimento (Sprint 3).</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Prazo padrão de cobrança
          </CardTitle>
          <CardDescription>
            Define o vencimento dos recebíveis gerados automaticamente quando uma sessão avulsa é confirmada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="defaultDueDays" className="text-sm font-medium">
              Vencimento (dias após o atendimento)
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="defaultDueDays"
                type="number"
                min="0"
                max="365"
                className="w-32"
                value={form.defaultDueDays}
                onChange={(e) => setForm((p) => ({ ...p, defaultDueDays: e.target.value }))}
              />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {Number(form.defaultDueDays) === 0
                ? "Recebíveis vencerão no próprio dia do atendimento."
                : <>Recebíveis por sessão vencerão <strong className="mx-1">{form.defaultDueDays} {Number(form.defaultDueDays) === 1 ? "dia" : "dias"}</strong> após o atendimento.</>}
            </span>
          </div>
        </CardContent>
      </Card>

      {!data?.configured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Você ainda não configurou metas financeiras. Salve qualquer alteração para criar a configuração desta clínica.
          </span>
        </div>
      )}

      <Separator />

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2 min-w-36">
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
