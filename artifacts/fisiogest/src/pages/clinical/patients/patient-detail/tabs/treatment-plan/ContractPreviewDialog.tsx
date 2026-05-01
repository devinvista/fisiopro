/**
 * ContractPreviewDialog — exibe o contrato gerado (HTML) em um modal
 * de tela cheia para revisão interna antes de imprimir ou enviar ao paciente.
 *
 * Oferece:
 *  - Visualização fiel do documento (mesmas classes CSS do aceite público)
 *  - Botão de impressão / salvar PDF
 *  - Badge de status (assinado / aguardando)
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const statusBadge = isAccepted
    ? { label: "Assinado", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: BadgeCheck }
    : { label: "Aguardando assinatura", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock };

  const StatusIcon = statusBadge.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="flex-none px-5 py-3.5 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <DialogTitle className="text-base font-semibold text-slate-800 truncate">
                Contrato — {patientName}
              </DialogTitle>
              <Badge
                className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${statusBadge.cls}`}
              >
                <StatusIcon className="w-3 h-3" />
                {statusBadge.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs rounded-xl"
                onClick={handlePrint}
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / Salvar PDF
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-slate-700"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6">
          <style dangerouslySetInnerHTML={{ __html: CONTRACT_PRINT_CSS }} />
          <div
            className="doc-root max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm px-8 py-10"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {isAccepted
              ? "Contrato assinado — a trilha de aceite (LGPD) está registrada no rodapé do documento."
              : isStarted
                ? "Plano em andamento."
                : "Revise o contrato antes de enviar o link de aceite ao paciente."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs rounded-xl shrink-0"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
