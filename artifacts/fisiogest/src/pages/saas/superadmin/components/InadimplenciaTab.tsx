import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Loader2, Mail, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface DelinquentRow {
  sub: {
    id: number;
    status: string;
    paymentStatus: string;
    billingMode: "manual" | "asaas_card";
    asaasSubscriptionId: string | null;
    asaasCheckoutUrl: string | null;
    amount: string | null;
    currentPeriodEnd: string | null;
    trialEndDate: string | null;
    updatedAt: string;
  };
  clinic: { id: number; name: string; email: string | null; phone: string | null };
  plan: { id: number; displayName: string } | null;
}

interface WebhookEventRow {
  id: number;
  eventId: string;
  eventType: string;
  result: string;
  errorMsg: string | null;
  processedAt: string | null;
  createdAt: string;
  relatedClinicId: number | null;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE.replace(/\/$/, "").replace(/\/[^/]+$/, "");
const api = (path: string) => `${API_BASE}/api${path}`;

function fmtCurrency(value: string | null): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    overdue: "bg-amber-100 text-amber-800 border-amber-200",
    expired: "bg-red-100 text-red-800 border-red-200",
    suspended: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={map[status] ?? "bg-slate-100 text-slate-700"}>
      {status}
    </Badge>
  );
}

export function InadimplenciaTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<DelinquentRow | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery<DelinquentRow[]>({
    queryKey: ["saas-billing-delinquent"],
    queryFn: async () => {
      const res = await apiFetch(api("/saas-billing/delinquent"));
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: events = [] } = useQuery<WebhookEventRow[]>({
    queryKey: ["saas-billing-webhook-events"],
    queryFn: async () => {
      const res = await apiFetch(api("/saas-billing/webhook-events"));
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const remindMutation = useMutation({
    mutationFn: async (clinicId: number) => {
      const res = await apiFetch(api(`/saas-billing/clinic-subscriptions/${clinicId}/remind`), {
        method: "POST",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Falha ao reenviar lembrete");
      }
    },
    onSuccess: () => toast({ title: "Lembrete reenviado", description: "O cliente foi notificado pelo gateway." }),
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (clinicId: number) => {
      const res = await apiFetch(api(`/saas-billing/clinic-subscriptions/${clinicId}/cancel`), {
        method: "POST",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Falha ao cancelar");
      }
    },
    onSuccess: () => {
      toast({ title: "Cobrança cancelada", description: "A clínica voltou para cobrança manual." });
      qc.invalidateQueries({ queryKey: ["saas-billing-delinquent"] });
      setCancelTarget(null);
    },
    onError: (err: Error) => toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Inadimplência
          </h3>
          <p className="text-sm text-muted-foreground">
            Clínicas com pagamento em atraso ou faturas vencidas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Carregando inadimplentes…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Nenhuma clínica inadimplente. 🎉
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.sub.id}>
                  <TableCell>
                    <div className="font-medium">{row.clinic.name}</div>
                    <div className="text-xs text-muted-foreground">{row.clinic.email ?? "sem e-mail"}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.plan?.displayName ?? "—"}</TableCell>
                  <TableCell><StatusPill status={row.sub.paymentStatus} /></TableCell>
                  <TableCell>
                    {row.sub.billingMode === "asaas_card" ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        cartão (Asaas)
                      </Badge>
                    ) : (
                      <Badge variant="outline">manual</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(row.sub.currentPeriodEnd ?? row.sub.trialEndDate)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmtCurrency(row.sub.amount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {row.sub.asaasCheckoutUrl && (
                        <Button size="sm" variant="ghost" asChild title="Abrir cobrança no gateway">
                          <a href={row.sub.asaasCheckoutUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      )}
                      {row.sub.billingMode === "asaas_card" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remindMutation.mutate(row.clinic.id)}
                            disabled={remindMutation.isPending}
                            title="Reenviar lembrete pelo gateway"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTarget(row)}
                            title="Cancelar cobrança automática"
                            className="text-red-600"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Webhook events log ── */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Últimos eventos do gateway</h4>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Quando</TableHead>
                  <TableHead className="text-xs">Evento</TableHead>
                  <TableHead className="text-xs">Resultado</TableHead>
                  <TableHead className="text-xs">Clínica</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                      Nenhum evento recebido ainda.
                    </TableCell>
                  </TableRow>
                )}
                {events.slice(0, 30).map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(ev.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{ev.eventType}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          ev.result === "applied"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                            : ev.result === "duplicate"
                              ? "bg-slate-50 text-slate-600 text-[10px]"
                              : ev.result === "no_match"
                                ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                                : "bg-red-50 text-red-700 border-red-200 text-[10px]"
                        }
                      >
                        {ev.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{ev.relatedClinicId ?? "—"}</TableCell>
                    <TableCell className="text-xs text-red-600 max-w-xs truncate">{ev.errorMsg ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cobrança da clínica?</AlertDialogTitle>
            <AlertDialogDescription>
              A assinatura no gateway Asaas será encerrada e {cancelTarget?.clinic.name} voltará para
              cobrança manual. Esta ação não suspende a clínica — apenas para a recorrência no cartão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) cancelMutation.mutate(cancelTarget.clinic.id);
              }}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelando…</>
              ) : (
                "Sim, cancelar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
