import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInDays, parseISO } from "date-fns";
import { Loader2, AlertCircle, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { apiFetchJson } from "@/lib/api";
import { PlanBadge } from "@/components/guards/plan-badge";
import { formatCurrency } from "../../utils/format";

/**
 * RecurringPackageSection (Sprint 1 — substituto de SubscriptionsSection)
 *
 * Lista os pacotes recorrentes do paciente lendo direto de
 * `GET /api/patients/:patientId/packages` e filtrando por `recurrenceStatus`.
 *
 * Não permite criação direta nesta tela: o fluxo correto é criar um pacote
 * mensal na tela de Pacotes do paciente, que popula automaticamente os
 * campos de recorrência. Templates do tipo `faturaConsolidada` (legado) ainda
 * são exibidos quando existem em bases pré-Sprint 5, com badge "Mensal (legado)".
 */
type PatientPackage = {
  id: number;
  patientId: number;
  procedureId: number;
  procedureName?: string | null;
  procedureCategory?: string | null;
  name: string;
  totalSessions: number;
  usedSessions: number;
  startDate: string;
  expiryDate: string | null;
  price: string;
  paymentStatus: string;
  notes: string | null;
  billingDay: number | null;
  monthlyAmount: string | null;
  nextBillingDate: string | null;
  recurrenceStatus: string | null;
  recurrenceType: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

function recurrenceLabel(type: string | null): { label: string; color: string } {
  if (type === "faturaConsolidada") {
    // Sprint 5: descontinuado — exibido apenas para dados legados.
    return { label: "Mensal (legado)", color: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: "Mensalidade", color: "bg-blue-50 text-blue-700 border-blue-200" };
}

function statusStyle(status: string | null): string {
  if (status === "ativa") return "bg-green-50 text-green-700 border-green-200";
  if (status === "pausada") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

export function RecurringPackageSection({ patientId }: { patientId: number }) {
  const { hasFeature } = useAuth();
  // Feature flag transicional: o módulo "patient_subscriptions" ainda
  // controla acesso à área de recorrência durante a transição.
  const subscriptionsEnabled = hasFeature("module.patient_subscriptions");

  const { data: packages = [], isLoading } = useQuery<PatientPackage[]>({
    queryKey: [`/api/patients/${patientId}/packages`, "recurring"],
    queryFn: () => apiFetchJson<PatientPackage[]>(`/api/patients/${patientId}/packages`),
    enabled: !!patientId,
  });

  const recurring = useMemo(
    () => packages.filter((p) => p.recurrenceType === "mensal" || p.recurrenceType === "faturaConsolidada"),
    [packages],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary shrink-0" />
              Pacotes Recorrentes
            </h4>
            <p className="text-xs text-slate-500">
              {recurring.length} pacote(s) recorrente(s) vinculado(s)
            </p>
          </div>
          {!subscriptionsEnabled && <PlanBadge feature="module.patient_subscriptions" />}
        </div>
      </div>

      <Card className="border border-blue-100 bg-blue-50/40">
        <CardContent className="p-3 text-xs text-blue-800">
          A recorrência mensal agora é gerenciada diretamente nos pacotes do paciente.
          Para criar um novo pacote recorrente, use a aba <strong>Pacotes</strong> e selecione
          um template do tipo <strong>mensalidade</strong>.
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
      ) : recurring.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-8 text-center text-slate-400 text-sm">
            Nenhum pacote recorrente ativo para este paciente
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recurring.map((pkg) => {
            const recur = recurrenceLabel(pkg.recurrenceType);
            const expiry = pkg.expiryDate ? parseISO(pkg.expiryDate) : null;
            const daysLeft = expiry ? differenceInDays(expiry, new Date()) : null;
            const expired = daysLeft !== null && daysLeft < 0;
            const soonExpiry = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

            return (
              <Card key={pkg.id} className="border border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">
                          {pkg.procedureName ?? pkg.name}
                        </p>
                        <Badge variant="outline" className={`text-[10px] border ${statusStyle(pkg.recurrenceStatus)}`}>
                          {pkg.recurrenceStatus === "ativa"
                            ? "Ativa"
                            : pkg.recurrenceStatus === "pausada"
                              ? "Pausada"
                              : "Cancelada"}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] border ${recur.color}`}>
                          {recur.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cobrança todo dia <strong>{pkg.billingDay ?? "—"}</strong>
                        {pkg.monthlyAmount && (
                          <> · Valor: <strong>{formatCurrency(pkg.monthlyAmount)}</strong></>
                        )}
                        {pkg.startDate && ` · Desde ${format(parseISO(pkg.startDate), "dd/MM/yyyy")}`}
                      </p>
                      {pkg.nextBillingDate && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Próxima cobrança: <strong>{format(parseISO(pkg.nextBillingDate), "dd/MM/yyyy")}</strong>
                        </p>
                      )}
                      {expiry && (expired || soonExpiry) && (
                        <p className={`text-[10px] flex items-center gap-1 mt-0.5 font-medium ${expired ? "text-red-600" : "text-amber-600"}`}>
                          <AlertCircle className="w-3 h-3" />
                          {expired
                            ? `Pacote vencido em ${format(expiry, "dd/MM/yyyy")}`
                            : `Vence em ${format(expiry, "dd/MM/yyyy")} (${daysLeft} dia${daysLeft === 1 ? "" : "s"})`}
                        </p>
                      )}
                      {pkg.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{pkg.notes}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
