import { useState } from "react";
import {
  BadgeCheck, ClipboardCheck, Link2, Loader2, Mail, Paperclip, PenLine, Phone,
  ShieldAlert, Sparkles, AlertCircle, CalendarRange, Wallet, ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/toast";
import { apiSendJson, apiFetchJson, API_BASE } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// ───────────────────────────────────────────────────────────────────────────
// ContractAcceptanceBlock — etapa "Contrato" no fluxo v2.
//
// Diferenças vs. AcceptanceBlock (legado):
//   • Bate em POST /accept-and-materialize (1 request) ao invés de
//     POST /accept + POST /materialize (2 requests com janela de inconsistência).
//   • Pré-validação via GET /atomic-validation antes de habilitar o botão,
//     mostrando ao usuário exatamente o que está faltando (ex.: agenda de um
//     item recorrente, horário em determinado dia, preço de avulso etc).
//   • Cláusulas vêm do mesmo endpoint /atomic-validation (resolvido por
//     paciente → clínica), evitando uma 2ª chamada.
//   • Sucesso: o plano vai DIRETO para "iniciado" (acceptedAt + materializedAt
//     em uma única transação). Sem estado intermediário.
// ───────────────────────────────────────────────────────────────────────────

interface ContractClause {
  id: number;
  code: string;
  title: string;
  body: string;
  version: number;
  isRequired: boolean;
}

interface ValidationError {
  code: string;
  message: string;
  itemId?: number;
}

interface AtomicValidationResponse {
  ok: boolean;
  errors: ValidationError[];
  clauses: ContractClause[];
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
    "Para revisar, assinar e iniciar o tratamento, acesse o link abaixo:",
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

export function ContractAcceptanceBlock({
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
  const [acceptedClauseCodes, setAcceptedClauseCodes] = useState<Set<string>>(new Set());

  const isAccepted = !!plan?.acceptedAt;
  const isMaterialized = !!plan?.materializedAt;

  // Validação atômica — busca pendências + cláusulas vigentes em uma só chamada.
  const { data: validation, isLoading: validationLoading, refetch: refetchValidation } =
    useQuery<AtomicValidationResponse>({
      queryKey: [
        "atomic-validation",
        patientId,
        planId,
        plan?.acceptedAt ?? null,
        plan?.materializedAt ?? null,
      ],
      queryFn: () =>
        apiFetchJson<AtomicValidationResponse>(
          `${API_BASE}/api/patients/${patientId}/treatment-plans/${planId}/atomic-validation`,
        ),
      enabled: !isMaterialized,
    });

  const clauses = validation?.clauses ?? [];
  const errors = validation?.errors ?? [];
  const requiredCodes = clauses.filter((c) => c.isRequired).map((c) => c.code);
  const allRequiredAccepted = requiredCodes.every((c) => acceptedClauseCodes.has(c));
  const canAccept =
    !!validation && validation.ok && allRequiredAccepted && !!signature.trim() && agreed;

  function toggleClause(code: string) {
    setAcceptedClauseCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleAcceptAndMaterialize() {
    if (!canAccept) return;
    setBusy(true);
    try {
      await apiSendJson(
        `/api/patients/${patientId}/treatment-plans/${planId}/accept-and-materialize`,
        "POST",
        {
          signature: signature.trim(),
          acceptedClauseCodes: Array.from(acceptedClauseCodes),
        },
      );
      toast({
        title: "Plano assinado e iniciado!",
        description: "Consultas geradas, faturas emitidas e contrato registrado.",
      });
      setOpenPresencial(false);
      setSignature("");
      setAgreed(false);
      setAcceptedClauseCodes(new Set());
      onChanged();
    } catch (err: any) {
      // O backend retorna 400 com `errors[]` quando a validação falha — mostra
      // o detalhe ao operador para que ele saiba o que ajustar.
      const detail = err?.errors?.[0]?.message ?? err?.message ?? "Tente novamente.";
      toast({
        title: "Não foi possível assinar e iniciar o plano",
        description: detail,
        variant: "destructive",
      });
      // Recarrega a validação para refletir mudanças que outro usuário possa ter feito.
      refetchValidation();
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

  // ── Estado: já assinado + iniciado (estado terminal v2) ───────────────────
  if (isAccepted && isMaterialized) {
    const acceptedAt = plan.acceptedAt ? new Date(plan.acceptedAt) : null;
    const via = (plan.acceptedVia ?? "presencial") as string;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <BadgeCheck className="w-5 h-5" /> Plano assinado e iniciado
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700">
          <div>
            <span className="text-slate-500">Assinado em:</span>{" "}
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
          Trilha LGPD imutável · faturas emitidas · agenda gerada.
        </p>
      </div>
    );
  }

  // ── Estado: aceito (legado) mas ainda não materializado ──────────────────
  // No fluxo v2 esse estado nunca deveria existir, mas pode aparecer se o plano
  // foi parcialmente aceito no fluxo v1 antes da clínica migrar para v2.
  if (isAccepted && !isMaterialized) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <AlertCircle className="w-5 h-5" /> Plano aceito mas não iniciado
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Este plano foi assinado em uma versão anterior do fluxo. Use o botão
          "Iniciar plano" abaixo para gerar consultas e faturas.
        </p>
      </div>
    );
  }

  // ── Estado: pendente — exibe pré-condições + ação ─────────────────────────
  const blocked = !validation || !validation.ok;

  return (
    <>
      <div className="space-y-4">
        {/* Resumo do que será feito ao confirmar */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
            <ScrollText className="w-5 h-5 text-primary" />
            Pronto para assinar?
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ao confirmar o aceite, executamos <strong>em uma única transação</strong>:
          </p>
          <ul className="text-xs text-slate-700 space-y-1.5 pl-1">
            <li className="flex items-start gap-2">
              <CalendarRange className="w-3.5 h-3.5 mt-0.5 text-blue-600 shrink-0" />
              <span>Consultas criadas na agenda do paciente conforme dias/horários definidos.</span>
            </li>
            <li className="flex items-start gap-2">
              <Wallet className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
              <span>Faturas mensais emitidas para toda a vigência do plano.</span>
            </li>
            <li className="flex items-start gap-2">
              <BadgeCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
              <span>Trilha LGPD com data, IP, dispositivo e cláusulas aceitas.</span>
            </li>
          </ul>
          <p className="text-[11px] text-slate-500 pt-1 italic">
            Se algo der errado, todas as alterações são desfeitas automaticamente.
          </p>
        </div>

        {/* Pendências (validação atômica) */}
        {validationLoading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando pré-condições…
          </div>
        )}
        {!validationLoading && validation && !validation.ok && errors.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <ShieldAlert className="w-4 h-4" />
              Ajustes pendentes antes de assinar
            </div>
            <ul className="space-y-1.5 pl-1">
              {errors.map((e, i) => (
                <li key={i} className="text-xs text-amber-900 flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-700 pt-1 border-t border-amber-200">
              Volte para a etapa correspondente e ajuste os pontos acima.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
            <PenLine className="w-5 h-5" /> Coletar aceite formal
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Use a opção presencial se o paciente está na clínica, ou envie um link
            para que ele assine de onde estiver (validade 7 dias).
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="gap-1.5 rounded-xl shadow-sm"
              onClick={() => setOpenPresencial(true)}
              disabled={busy || blocked}
              title={blocked ? "Resolva as pendências acima primeiro" : undefined}
            >
              <ClipboardCheck className="w-4 h-4" /> Assinar e iniciar (presencial)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100/60"
              onClick={handleGenerateLink}
              disabled={busy || blocked}
              title={blocked ? "Resolva as pendências acima primeiro" : undefined}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Enviar link de aceite (7 dias)
            </Button>
          </div>
        </div>
      </div>

      {/* Diálogo presencial */}
      <Dialog open={openPresencial} onOpenChange={setOpenPresencial}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assinatura presencial</DialogTitle>
            <DialogDescription>
              Confirme as cláusulas e peça ao paciente que digite o nome completo.
              Ao confirmar, geramos consultas, faturas e gravamos a trilha LGPD —
              tudo na mesma transação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {clauses.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">
                  Cláusulas contratuais
                </Label>
                <ul className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-2.5 bg-slate-50/60">
                  {clauses.map((c) => {
                    const checked = acceptedClauseCodes.has(c.code);
                    return (
                      <li
                        key={c.id}
                        className={`rounded-md p-2 ${
                          checked ? "bg-white" : c.isRequired ? "bg-amber-50/40" : "bg-white/60"
                        }`}
                      >
                        <label className="flex items-start gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => toggleClause(c.code)}
                          />
                          <span className="min-w-0 space-y-0.5">
                            <span className="flex items-center gap-1.5 font-medium text-slate-800">
                              {c.title}
                              {c.isRequired && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 font-normal">
                                  <ShieldAlert className="w-3 h-3" /> obrigatória
                                </span>
                              )}
                            </span>
                            <span className="block text-slate-600 leading-relaxed">
                              {c.body}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {!allRequiredAccepted && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Marque todas as cláusulas obrigatórias para concluir.
                  </p>
                )}
              </div>
            )}
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
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5 text-[11px] text-blue-800 flex gap-2">
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Após confirmar, as consultas vão direto para a agenda e as faturas
                serão emitidas — não há etapa adicional.
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpenPresencial(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              onClick={handleAcceptAndMaterialize}
              disabled={busy || !canAccept}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Confirmar e iniciar plano
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo do link público */}
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
