import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Printer, BadgeCheck, Clock, X, Share2, Copy, Phone, Mail,
  Loader2, Check, ChevronDown,
} from "lucide-react";
import { CONTRACT_PRINT_CSS, printDocument } from "../../utils/print-html";
import { apiSendJson } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface ContractPreviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  html: string;
  patientName: string;
  patientId: number;
  planId: number | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  clinicName?: string | null;
  isAccepted: boolean;
  isStarted: boolean;
}

interface LinkInfo {
  url: string;
  expiresAt: string;
  reused: boolean;
}

function buildShareMessage(opts: {
  patientName: string;
  clinicName: string | null | undefined;
  url: string;
  expiresAt: string;
}): string {
  const firstName = (opts.patientName || "").trim().split(/\s+/)[0] || "";
  const greet = firstName ? `Olá, ${firstName}!` : "Olá!";
  const clinicLine = opts.clinicName ? `Aqui é da ${opts.clinicName}.` : "Aqui é da clínica.";
  const expires = new Date(opts.expiresAt).toLocaleDateString("pt-BR");
  return [
    greet,
    "",
    `${clinicLine} Preparamos seu contrato do plano de tratamento.`,
    "Para revisar, assinar e iniciar o tratamento, acesse o link abaixo:",
    "",
    opts.url,
    "",
    `O link é pessoal e fica disponível até ${expires}.`,
    "Qualquer dúvida, é só responder esta mensagem.",
  ].join("\n");
}

function buildWhatsAppUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  const withCountry =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function buildMailtoUrl(to: string, opts: { subject: string; body: string }): string {
  const params = new URLSearchParams();
  params.set("subject", opts.subject);
  params.set("body", opts.body);
  return `mailto:${to}?${params.toString().replace(/\+/g, "%20")}`;
}

export function ContractPreviewDialog({
  open,
  onOpenChange,
  html,
  patientName,
  patientId,
  planId,
  patientPhone,
  patientEmail,
  clinicName,
  isAccepted,
  isStarted,
}: ContractPreviewDialogProps) {
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  function handlePrint() {
    printDocument(html, `Contrato — ${patientName}`);
  }

  async function handleShare() {
    if (shareOpen && linkInfo) {
      setShareOpen(false);
      return;
    }
    if (linkInfo) {
      setShareOpen(true);
      return;
    }
    if (!planId) return;
    setLoadingLink(true);
    try {
      const res = await apiSendJson<LinkInfo>(
        `/api/patients/${patientId}/treatment-plans/${planId}/public-link`,
        "POST",
        {},
      );
      setLinkInfo(res);
      setShareOpen(true);
    } catch (err: any) {
      toast({
        title: "Não foi possível gerar o link",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingLink(false);
    }
  }

  async function handleCopy() {
    if (!linkInfo) return;
    try {
      await navigator.clipboard.writeText(linkInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  function handleWhatsApp() {
    if (!linkInfo || !patientPhone) return;
    const wa = buildWhatsAppUrl(
      patientPhone,
      buildShareMessage({ patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt }),
    );
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function handleEmail() {
    if (!linkInfo || !patientEmail) return;
    const mailto = buildMailtoUrl(patientEmail, {
      subject: `Contrato de plano de tratamento — ${clinicName ?? "Clínica"}`,
      body: buildShareMessage({ patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt }),
    });
    window.location.href = mailto;
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) setShareOpen(false); onOpenChange(v); }}>
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
            {!isAccepted && planId && (
              <Button
                size="sm"
                variant={shareOpen ? "default" : "outline"}
                className="h-8 gap-1.5 text-xs rounded-xl"
                onClick={handleShare}
                disabled={loadingLink}
              >
                {loadingLink
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Share2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Compartilhar</span>
                {linkInfo && <ChevronDown className={`w-3 h-3 transition-transform ${shareOpen ? "rotate-180" : ""}`} />}
              </Button>
            )}
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

        {/* ── Share panel (collapsible) ── */}
        {shareOpen && linkInfo && (
          <div className="flex-none bg-blue-50 border-b border-blue-100 px-4 py-3 sm:px-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-blue-800">
                Link válido até {new Date(linkInfo.expiresAt).toLocaleDateString("pt-BR")}
                {linkInfo.reused ? " · link existente reaproveitado" : ""}
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-mono text-slate-700 break-all select-all">
              {linkInfo.url}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className={`h-8 gap-1.5 text-xs rounded-xl border-blue-200 ${copied ? "text-emerald-700 border-emerald-300 bg-emerald-50" : "text-blue-700 hover:bg-blue-100"}`}
                onClick={handleCopy}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                disabled={!patientPhone}
                title={!patientPhone ? "Paciente sem telefone cadastrado" : "Abrir WhatsApp"}
                onClick={handleWhatsApp}
              >
                <Phone className="w-3.5 h-3.5" />
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs rounded-xl disabled:opacity-40"
                disabled={!patientEmail}
                title={!patientEmail ? "Paciente sem e-mail cadastrado" : "Abrir e-mail"}
                onClick={handleEmail}
              >
                <Mail className="w-3.5 h-3.5" />
                E-mail
              </Button>
            </div>
            {(!patientPhone || !patientEmail) && (
              <p className="text-[11px] text-blue-700/70">
                {!patientPhone && "Cadastre um telefone para enviar via WhatsApp. "}
                {!patientEmail && "Cadastre um e-mail para enviar por e-mail."}
              </p>
            )}
          </div>
        )}

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
