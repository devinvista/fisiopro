import { useState } from "react";
import { apiSendJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2, Search, AlertTriangle, CheckCircle, Loader2, ShieldAlert,
} from "lucide-react";
import { useToast } from "@/lib/toast";

type TableCount = { tabela: string; count: number };
type TableDeleted = { tabela: string; deleted: number };

const TABLE_LABELS: Record<string, string> = {
  appointments:                  "Agendamentos",
  evolutions:                    "Evoluções",
  financial_records:             "Registros financeiros",
  accounting_journal_entries:    "Lançamentos contábeis",
  session_credits:               "Créditos de sessão",
  appointment_reschedules:       "Reagendamentos",
  patient_wallet_transactions:   "Transações de carteira",
  treatment_plan_acceptance_tokens: "Tokens de aceite de plano",
  treatment_plan_procedures:     "Itens de plano",
  treatment_plans:               "Planos de tratamento",
  patient_packages:              "Pacotes de pacientes",
  billing_run_logs:              "Logs de cobrança",
  audit_log:                     "Audit log",
  blocked_slots:                 "Horários bloqueados",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
}

export function LimpezaTab() {
  const { toast } = useToast();
  const [afterDate, setAfterDate] = useState(todayISO());
  const [preview, setPreview] = useState<TableCount[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<TableDeleted[] | null>(null);

  async function handlePreview() {
    if (!afterDate) return;
    setLoadingPreview(true);
    setPreview(null);
    setResult(null);
    try {
      const data = await apiSendJson<{ counts: TableCount[]; total: number }>(
        "/api/admin/data-cleanup/preview",
        "POST",
        { afterDate },
      );
      setPreview(data.counts.filter((r) => r.count > 0));
      setPreviewTotal(data.total);
    } catch (err: any) {
      toast({ title: "Erro ao consultar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleExecute() {
    setExecuting(true);
    try {
      const data = await apiSendJson<{ deleted: TableDeleted[]; total: number }>(
        "/api/admin/data-cleanup/execute",
        "POST",
        { afterDate, confirm: true },
      );
      setResult(data.deleted);
      setPreview(null);
      setPreviewTotal(0);
      setConfirmOpen(false);
      setConfirmText("");
      toast({
        title: "Limpeza concluída",
        description: `${data.total} registro(s) apagados permanentemente.`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao executar limpeza", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  }

  const CONFIRM_PHRASE = "APAGAR TUDO";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-200 bg-rose-50">
        <ShieldAlert className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-rose-800">Zona de perigo — exclusão permanente</p>
          <p className="text-xs text-rose-700 mt-0.5">
            Esta operação apaga <strong>permanentemente</strong> todos os registros criados após a data informada, em <strong>todas as tabelas</strong>. Não há como desfazer. Use apenas para limpeza de dados de teste.
          </p>
        </div>
      </div>

      {/* Date picker + Preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" /> Selecionar período de limpeza
        </h3>

        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label className="text-xs">Apagar registros criados após</Label>
            <DatePickerPTBR
              value={afterDate}
              onChange={(v) => { setAfterDate(v); setPreview(null); setResult(null); }}
            />
          </div>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!afterDate || loadingPreview}
            className="gap-2"
          >
            {loadingPreview
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Search className="w-4 h-4" />}
            Pré-visualizar
          </Button>
        </div>

        {/* Preview results */}
        {preview !== null && (
          <div className="space-y-3 pt-1">
            {preview.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Nenhum registro encontrado após {fmtDate(afterDate)}. Nada será apagado.
              </div>
            ) : (
              <>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Registros que serão apagados após {fmtDate(afterDate)}
                </div>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-2">Tabela</th>
                        <th className="text-right px-4 py-2">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((r) => (
                        <tr key={r.tabela} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2 text-slate-700">
                            {TABLE_LABELS[r.tabela] ?? r.tabela}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-rose-700">
                            {r.count.toLocaleString("pt-BR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-rose-700">
                          {previewTotal.toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <Button
                  variant="destructive"
                  className="gap-2 w-full sm:w-auto"
                  onClick={() => { setConfirmOpen(true); setConfirmText(""); }}
                >
                  <Trash2 className="w-4 h-4" />
                  Executar limpeza permanente ({previewTotal.toLocaleString("pt-BR")} registros)
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Result after execution */}
      {result !== null && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <CheckCircle className="w-4 h-4" /> Limpeza concluída com sucesso
          </div>
          {result.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-emerald-100 text-xs text-emerald-700 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Tabela</th>
                    <th className="text-right px-4 py-2">Apagados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {result.map((r) => (
                    <tr key={r.tabela}>
                      <td className="px-4 py-2 text-emerald-800">{TABLE_LABELS[r.tabela] ?? r.tabela}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-700">
                        {r.deleted.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Nenhum registro foi apagado.</p>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5" /> Confirmar exclusão permanente
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Você está prestes a apagar <strong>{previewTotal.toLocaleString("pt-BR")} registros</strong> criados
              após <strong>{fmtDate(afterDate)}</strong> de todas as tabelas. Esta ação é <strong>irreversível</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-600">
              Para confirmar, digite <strong className="font-mono text-rose-700">{CONFIRM_PHRASE}</strong> no campo abaixo:
            </p>
            <Input
              placeholder={CONFIRM_PHRASE}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="font-mono border-rose-200 focus-visible:ring-rose-400"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={executing}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== CONFIRM_PHRASE || executing}
              onClick={handleExecute}
              className="gap-2"
            >
              {executing && <Loader2 className="w-4 h-4 animate-spin" />}
              <Trash2 className="w-4 h-4" />
              Apagar permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
