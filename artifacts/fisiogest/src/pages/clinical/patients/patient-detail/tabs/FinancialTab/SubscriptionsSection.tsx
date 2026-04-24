import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, parseISO } from "date-fns";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/hooks/use-auth";
import { apiFetchJson, apiSendJson } from "@/lib/api";
import { PlanBadge } from "@/components/guards/plan-badge";
import { formatCurrency } from "../../utils/format";
import { subscriptionStatusStyle } from "../HistoryTab";

export function SubscriptionsSection({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasFeature } = useAuth();
  const subscriptionsEnabled = hasFeature("module.patient_subscriptions");

  const { data: subscriptions = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/financial/patients/${patientId}/subscriptions`],
    queryFn: () => apiFetchJson<any[]>(`/api/financial/patients/${patientId}/subscriptions`),
    enabled: !!patientId,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ procedureId: "", startDate: "", billingDay: "", monthlyAmount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const { data: procedures = [] } = useQuery<any[]>({
    queryKey: ["procedures", "all"],
    queryFn: () => apiFetchJson<any[]>("/api/procedures"),
  });

  const handleCreate = async () => {
    if (!form.procedureId || !form.startDate || !form.monthlyAmount) {
      toast({ title: "Preencha procedimento, data de início e valor", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: any = { patientId, procedureId: parseInt(form.procedureId), startDate: form.startDate, monthlyAmount: Number(form.monthlyAmount), notes: form.notes || undefined };
      if (form.billingDay) body.billingDay = parseInt(form.billingDay);
      await apiSendJson("/api/subscriptions", "POST", body);
      toast({ title: "Assinatura criada com sucesso" });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/subscriptions`] });
      setForm({ procedureId: "", startDate: "", billingDay: "", monthlyAmount: "", notes: "" });
      setShowForm(false);
    } catch {
      toast({ title: "Erro ao criar assinatura", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await apiSendJson(`/api/subscriptions/${id}`, "PUT", { status: newStatus });
      toast({ title: "Status atualizado" });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/subscriptions`] });
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-slate-800">Assinaturas / Mensalidades</h4>
            <p className="text-xs text-slate-500">{subscriptions.length} assinatura(s) vinculada(s)</p>
          </div>
          {!subscriptionsEnabled && <PlanBadge feature="module.patient_subscriptions" />}
        </div>
        {subscriptionsEnabled ? (
          <Button className="w-full sm:w-auto h-10 rounded-xl gap-1.5" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 shrink-0" />{showForm ? "Cancelar" : "Nova Assinatura"}
          </Button>
        ) : (
          <Button variant="outline" className="w-full sm:w-auto h-10 rounded-xl gap-1.5" disabled>
            <Plus className="w-4 h-4 shrink-0" /> Indisponível no plano
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Procedimento *</Label>
                <Select value={form.procedureId} onValueChange={v => setForm(f => ({ ...f, procedureId: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {procedures.filter((p: any) => p.billingType === "mensal").map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Início *</Label>
                <DatePickerPTBR value={form.startDate} onChange={(v) => setForm(f => ({ ...f, startDate: v }))} className="text-sm h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor Mensal (R$) *</Label>
                <Input type="number" step="0.01" value={form.monthlyAmount} onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))} placeholder="Ex: 350,00" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dia de Cobrança <span className="text-slate-400 font-normal">(auto)</span></Label>
                <Input type="number" min="1" max="31" value={form.billingDay} onChange={e => setForm(f => ({ ...f, billingDay: e.target.value }))} placeholder="Usa o dia do início" className="text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." className="text-sm" />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto h-10 rounded-xl" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="w-full sm:w-auto h-10 rounded-xl gap-1.5" disabled={saving} onClick={handleCreate}>
                {saving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />} Criar Assinatura
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
      ) : subscriptions.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-8 text-center text-slate-400 text-sm">Nenhuma assinatura ativa para este paciente</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub: any) => (
            <Card key={sub.id} className="border border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{sub.procedure?.name ?? "Procedimento"}</p>
                      <Badge variant="outline" className={`text-[10px] border ${subscriptionStatusStyle(sub.status)}`}>
                        {sub.status === "ativa" ? "Ativa" : sub.status === "pausada" ? "Pausada" : "Cancelada"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {sub.subscriptionType === "faturaConsolidada" ? (
                        <span className="inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-medium">Fatura Consolidada</span>
                      ) : null}
                      Cobrança todo dia <strong>{sub.billingDay}</strong> · Valor: <strong>{formatCurrency(sub.monthlyAmount)}</strong>
                      {sub.startDate && ` · Desde ${format(parseISO(sub.startDate), "dd/MM/yyyy")}`}
                    </p>
                    {sub.expiryDate && (() => {
                      const expiry = parseISO(sub.expiryDate);
                      const daysLeft = differenceInDays(expiry, new Date());
                      const expired = daysLeft < 0;
                      const soonExpiry = daysLeft >= 0 && daysLeft <= 7;
                      if (!expired && !soonExpiry) return null;
                      return (
                        <p className={`text-[10px] flex items-center gap-1 mt-0.5 font-medium ${expired ? "text-red-600" : "text-amber-600"}`}>
                          <AlertCircle className="w-3 h-3" />
                          {expired
                            ? `Pacote vencido em ${format(expiry, "dd/MM/yyyy")}`
                            : `Vence em ${format(expiry, "dd/MM/yyyy")} (${daysLeft} dia${daysLeft === 1 ? "" : "s"})`}
                        </p>
                      );
                    })()}
                    {sub.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{sub.notes}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {sub.status === "ativa" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => handleStatusChange(sub.id, "pausada")}>
                        Pausar
                      </Button>
                    )}
                    {sub.status === "pausada" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => handleStatusChange(sub.id, "ativa")}>
                        Reativar
                      </Button>
                    )}
                    {sub.status !== "cancelada" && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px] text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleStatusChange(sub.id, "cancelada")}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
