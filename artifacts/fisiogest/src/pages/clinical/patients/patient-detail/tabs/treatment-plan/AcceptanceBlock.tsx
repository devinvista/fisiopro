import { useState } from "react";
import {
  BadgeCheck, ClipboardCheck, Link2, Loader2, Mail, Paperclip, PenLine, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/toast";
import { apiSendJson } from "@/lib/api";

function buildWhatsAppUrl(rawPhone: string, message: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  const withCountry = digits.length === 10 || digits.length === 11
    ? `55${digits}`
    : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function buildMailtoUrl(to: string, opts: { subject: string; body: string }): string {
  const params = new URLSearchParams();
  params.set("subject", opts.subject);
  params.set("body", opts.body);
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${to}?${qs}`;
}

function buildShareMessage(opts: {
  patientName: string;
  clinicName: string | null;
  url: string;
  expiresAt: string;
}): string {
  const firstName = (opts.patientName || "").trim().split(/\s+/)[0] || "";
  const greet = firstName ? `Olá, ${firstName}!` : "Olá!";
  const clinicLine = opts.clinicName
    ? `Aqui é da ${opts.clinicName}.`
    : "Aqui é da clínica.";
  const expires = new Date(opts.expiresAt).toLocaleDateString("pt-BR");
  return [
    greet,
    "",
    `${clinicLine} Preparamos seu contrato do plano de tratamento.`,
    "Para revisar e assinar digitalmente, acesse o link abaixo:",
    "",
    opts.url,
    "",
    `O link é pessoal e fica disponível até ${expires}.`,
    "Qualquer dúvida, é só responder esta mensagem.",
  ].join("\n");
}

interface Props {
  patientId: number;
  planId: number;
  plan: any;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  clinicName: string | null;
  onChanged: () => void;
}

export function AcceptanceBlock({
  patientId, planId, plan, onChanged,
  patientName, patientPhone, patientEmail, clinicName,
}: Props) {
  const { toast } = useToast();
  const [openPresencial, setOpenPresencial] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{ url: string; expiresAt: string; reused: boolean } | null>(null);

  const isAccepted = !!plan?.acceptedAt;

  async function handlePresencial() {
    if (!signature.trim() || !agreed) return;
    setBusy(true);
    try {
      await apiSendJson(`/api/patients/${patientId}/treatment-plans/${planId}/accept`, "POST", {
        signature: signature.trim(),
      });
      toast({
        title: "Plano aceito!",
        description: "Faturas e créditos do mês foram gerados (sem agendamentos automáticos).",
      });
      setOpenPresencial(false);
      setSignature("");
      setAgreed(false);
      onChanged();
    } catch (err: any) {
      toast({
        title: "Erro ao aceitar plano",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateLink() {
    setBusy(true);
    try {
      const res = await apiSendJson<{ url: string; expiresAt: string; reused: boolean }>(
        `/api/patients/${patientId}/treatment-plans/${planId}/public-link`, "POST", {},
      );
      setLinkInfo(res);
      setOpenLink(true);
    } catch (err: any) {
      toast({
        title: "Não foi possível gerar o link",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (isAccepted) {
    const acceptedAt = plan.acceptedAt ? new Date(plan.acceptedAt) : null;
    const via = (plan.acceptedVia ?? "presencial") as string;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <BadgeCheck className="w-5 h-5" /> Plano aceito formalmente
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700">
          <div>
            <span className="text-slate-500">Data:</span>{" "}
            <span className="font-medium">
              {acceptedAt ? acceptedAt.toLocaleString("pt-BR") : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Via:</span>{" "}
            <span className="font-medium capitalize">{via}</span>
          </div>
          {plan.acceptedBySignature && (
            <div className="sm:col-span-2">
              <span className="text-slate-500">Assinatura:</span>{" "}
              <span className="font-medium">{plan.acceptedBySignature}</span>
            </div>
          )}
          {plan.acceptedIp && (
            <div>
              <span className="text-slate-500">IP:</span>{" "}
              <span className="font-mono">{plan.acceptedIp}</span>
            </div>
          )}
          {plan.acceptedDevice && (
            <div className="sm:col-span-2 truncate">
              <span className="text-slate-500">Dispositivo:</span>{" "}
              <span className="font-mono text-[11px]">{plan.acceptedDevice}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-emerald-700/80 pt-1 border-t border-emerald-100">
          Trilha LGPD imutável · agendamentos liberados abaixo.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <PenLine className="w-5 h-5" /> Aceite formal pendente
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          O plano só fica ativo após o aceite. Assim que aceito, a agenda do paciente é liberada para
          escolha de dias e horários. <strong>Nada é cobrado e nada vai para a agenda</strong> antes disso.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-xl shadow-sm"
            onClick={() => setOpenPresencial(true)}
            disabled={busy}
          >
            <ClipboardCheck className="w-4 h-4" /> Coletar aceite presencial
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100/60"
            onClick={handleGenerateLink}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Enviar link de aceite (7 dias)
          </Button>
        </div>
      </div>

      <Dialog open={openPresencial} onOpenChange={setOpenPresencial}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aceite presencial</DialogTitle>
            <DialogDescription>
              Peça ao paciente que digite o nome completo. Capturamos data, IP e
              dispositivo para a trilha LGPD.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-sig">Nome completo (assinatura)</Label>
              <input
                id="acc-sig"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:border-primary outline-none"
                placeholder="Ex.: Maria da Silva Souza"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                autoFocus
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                O paciente leu e concorda com os procedimentos, valores e condições
                deste plano.
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpenPresencial(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handlePresencial} disabled={busy || !signature.trim() || !agreed}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />} Confirmar aceite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link de aceite gerado</DialogTitle>
            <DialogDescription>
              Envie ao paciente. Válido até{" "}
              {linkInfo ? new Date(linkInfo.expiresAt).toLocaleString("pt-BR") : "—"}.
              {linkInfo?.reused && " (link existente reaproveitado)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono break-all">
              {linkInfo?.url ?? ""}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  if (!linkInfo) return;
                  try {
                    await navigator.clipboard.writeText(linkInfo.url);
                    toast({ title: "Link copiado!" });
                  } catch {
                    toast({ title: "Não foi possível copiar", variant: "destructive" });
                  }
                }}
              >
                <Paperclip className="w-4 h-4" /> Copiar
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                disabled={!patientPhone}
                title={!patientPhone ? "Paciente sem telefone cadastrado" : "Abrir WhatsApp"}
                onClick={() => {
                  if (!linkInfo || !patientPhone) return;
                  const wa = buildWhatsAppUrl(patientPhone, buildShareMessage({
                    patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt,
                  }));
                  window.open(wa, "_blank", "noopener,noreferrer");
                }}
              >
                <Phone className="w-4 h-4" /> WhatsApp
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!patientEmail}
                title={!patientEmail ? "Paciente sem e-mail cadastrado" : "Abrir e-mail"}
                onClick={() => {
                  if (!linkInfo) return;
                  const mailto = buildMailtoUrl(patientEmail ?? "", {
                    subject: `Contrato de plano de tratamento — ${clinicName ?? "Clínica"}`,
                    body: buildShareMessage({
                      patientName, clinicName, url: linkInfo.url, expiresAt: linkInfo.expiresAt,
                    }),
                  });
                  window.location.href = mailto;
                }}
              >
                <Mail className="w-4 h-4" /> E-mail
              </Button>
            </div>

            {(!patientPhone || !patientEmail) && (
              <p className="text-[11px] text-slate-500">
                {!patientPhone && "Cadastre um telefone no paciente para enviar via WhatsApp. "}
                {!patientEmail && "Cadastre um e-mail no paciente para enviar por e-mail."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
