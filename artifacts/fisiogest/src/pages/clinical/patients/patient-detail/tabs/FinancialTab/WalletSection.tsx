import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2, Plus, Wallet, ArrowDownRight, TrendingDown, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { apiFetchJson, apiSendJson } from "@/utils/api";
import { formatCurrency } from "../../utils/format";
import { PAYMENT_METHODS, WALLET_TX_LABELS } from "./constants";

export function WalletSection({ patientId }: { patientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ wallet: any; transactions: any[] }>({
    queryKey: [`/api/patients/${patientId}/wallet`],
    queryFn: () => apiFetchJson<{ wallet: any; transactions: any[] }>(`/api/patients/${patientId}/wallet`),
    enabled: !!patientId,
  });

  const wallet = data?.wallet;
  const transactions = data?.transactions ?? [];
  const balance = Number(wallet?.balance ?? 0);

  const [showDeposit, setShowDeposit] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", paymentMethod: "", description: "" });
  const [saving, setSaving] = useState(false);

  const handleDeposit = async () => {
    const amount = Number(depositForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Informe um valor positivo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiSendJson(`/api/patients/${patientId}/wallet/deposit`, "POST", {
        amount,
        paymentMethod: depositForm.paymentMethod || undefined,
        description: depositForm.description || undefined,
      });
      toast({ title: "Depósito realizado", description: `R$ ${amount.toFixed(2)} adicionados à carteira.` });
      setDepositForm({ amount: "", paymentMethod: "", description: "" });
      setShowDeposit(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/patients/${patientId}/summary`] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>;

  const balancePositive = balance > 0;
  const balanceBg   = balancePositive ? "from-emerald-50 to-teal-50 border-emerald-200" : "from-slate-50 to-slate-100 border-slate-200";
  const balanceText = balancePositive ? "text-emerald-700" : "text-slate-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Carteira de Crédito
          </h4>
          <p className="text-xs text-slate-500">Saldo pré-pago em R$ para abatimento automático nas sessões</p>
        </div>
        <Button size="sm" className="h-8 rounded-xl" variant={showDeposit ? "outline" : "default"}
          onClick={() => { setShowDeposit(v => !v); setDepositForm({ amount: "", paymentMethod: "", description: "" }); }}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {showDeposit ? "Cancelar" : "Depositar"}
        </Button>
      </div>

      {/* Balance card */}
      <Card className={`border shadow-sm bg-gradient-to-br ${balanceBg} overflow-hidden`}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Saldo disponível</p>
            <p className={`text-3xl font-bold font-display tabular-nums ${balanceText}`}>
              {formatCurrency(balance)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{transactions.length} transação(ões) registrada(s)</p>
          </div>
          <div className={`p-4 rounded-2xl ${balancePositive ? "bg-emerald-100/60" : "bg-slate-100"}`}>
            <Wallet className={`w-8 h-8 ${balancePositive ? "text-emerald-600" : "text-slate-400"}`} />
          </div>
        </CardContent>
      </Card>

      {/* Deposit form */}
      {showDeposit && (
        <Card className="border-2 border-emerald-200 bg-emerald-50/30 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5 border-b border-emerald-100">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-emerald-600" /> Novo Depósito na Carteira
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor (R$) <span className="text-red-500">*</span></Label>
                <Input type="number" min="0.01" step="0.01" placeholder="Ex: 200,00"
                  className="bg-white border-slate-200"
                  value={depositForm.amount}
                  onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Forma de Pagamento</Label>
                <Select value={depositForm.paymentMethod} onValueChange={v => setDepositForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="bg-white border-slate-200 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição <span className="text-slate-400 font-normal">(opcional)</span></Label>
              <Input placeholder="Ex: Pré-pagamento 10 sessões..."
                className="bg-white border-slate-200"
                value={depositForm.description}
                onChange={e => setDepositForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowDeposit(false)}>Cancelar</Button>
              <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleDeposit}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Confirmar Depósito
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction history */}
      {transactions.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-8 text-center text-slate-400 text-sm">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhuma movimentação na carteira
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx: any) => {
            const info = WALLET_TX_LABELS[tx.type] ?? { label: tx.type, color: "text-slate-700 bg-slate-50 border-slate-200", sign: "" as const };
            const amt = Number(tx.amount);
            const isCredit = info.sign === "+";
            return (
              <Card key={tx.id} className="border border-slate-100 shadow-none hover:border-slate-200 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg border ${info.color}`}>
                      {isCredit
                        ? <ArrowDownRight className="w-3.5 h-3.5" />
                        : <TrendingDown className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${info.color}`}>{info.label}</span>
                        <span className="text-[10px] text-slate-400">{tx.createdAt ? format(new Date(tx.createdAt), "dd/MM/yyyy HH:mm") : "—"}</span>
                      </div>
                    </div>
                  </div>
                  <p className={`text-sm font-bold tabular-nums shrink-0 ${isCredit ? "text-emerald-700" : "text-rose-600"}`}>
                    {info.sign}{formatCurrency(amt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
