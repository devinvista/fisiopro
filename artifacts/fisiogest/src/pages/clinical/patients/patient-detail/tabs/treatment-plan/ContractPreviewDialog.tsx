import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, BadgeCheck, Clock, X } from "lucide-react";
import { CONTRACT_PRINT_CSS, printDocument } from "../../utils/print-html";

interface ContractPreviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  html: string;
  patientName: string;
  isAccepted: boolean;
  isStarted: boolean;
}

export function ContractPreviewDialog({
  open,
  onOpenChange,
  html,
  patientName,
  isAccepted,
  isStarted,
}: ContractPreviewDialogProps) {
  function handlePrint() {
    printDocument(html, `Contrato — ${patientName}`);
  }

  const statusLabel = isAccepted ? "Assinado" : "Aguardando assinatura";
  const StatusIcon = isAccepted ? BadgeCheck : Clock;
  const statusCls = isAccepted
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-amber-100 text-amber-700 border-amber-200";

  const footerNote = isAccepted
    ? "Contrato assinado — trilha de aceite registrada no rodapé."
    : isStarted
      ? "Plano em andamento."
      : "Revise antes de enviar o link de aceite ao paciente.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="
          flex flex-col gap-0 p-0 overflow-hidden
          fixed inset-0 w-screen h-[100dvh] max-w-none rounded-none
          sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-[calc(100vw-32px)] sm:max-w-4xl sm:h-[92vh] sm:rounded-2xl
        "
      >
        {/* ── Header ── */}
        <div className="flex-none flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <DialogTitle className="text-sm font-semibold text-slate-800 truncate sm:text-base">
              Contrato
              <span className="hidden sm:inline"> — {patientName}</span>
            </DialogTitle>
            <span
              className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}
            >
              <StatusIcon className="w-3 h-3" />
              <span className="hidden xs:inline">{statusLabel}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs rounded-xl"
              onClick={handlePrint}
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir / </span>PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-slate-700"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Document body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50">
          <style dangerouslySetInnerHTML={{ __html: CONTRACT_PRINT_CSS }} />
          <div
            className="doc-root mx-auto bg-white border-x border-slate-200 min-h-full
              px-4 py-6
              sm:max-w-3xl sm:my-6 sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-sm
              sm:px-8 sm:py-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {/* ── Footer ── */}
        <div className="flex-none flex flex-col gap-2 px-4 py-3 border-t border-slate-100 bg-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500 leading-snug">{footerNote}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs rounded-xl w-full sm:w-auto shrink-0"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
