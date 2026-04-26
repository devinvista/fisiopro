import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { acceptPolicy, getCurrentPolicies, type PolicyDocument } from "@/lib/lgpd";

interface PolicyAcceptanceModalProps {
  /** IDs ainda pendentes; quando vazio, o modal não abre. */
  pendingIds: number[];
  onAllAccepted: () => void;
}

export function PolicyAcceptanceModal({ pendingIds, onAllAccepted }: PolicyAcceptanceModalProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<PolicyDocument[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const open = pendingIds.length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getCurrentPolicies()
      .then((res) => {
        if (cancelled) return;
        const filtered = res.items.filter((d) => pendingIds.includes(d.id));
        setDocs(filtered);
      })
      .catch((err: Error) => {
        toast({
          variant: "destructive",
          title: "Não foi possível carregar as políticas",
          description: err.message,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pendingIds.join(","), toast]);

  async function handleAccept() {
    if (!agreed) return;
    setSubmitting(true);
    try {
      for (const doc of docs) {
        await acceptPolicy(doc.id);
      }
      toast({
        title: "Aceite registrado",
        description: "Obrigado! Seu consentimento foi salvo com data, hora e IP.",
      });
      onAllAccepted();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao registrar aceite",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg [&>button[aria-label='Fechar diálogo']]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center font-display text-xl">
            Atualização nos nossos termos
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-slate-600">
          {loading ? (
            <p className="text-center text-slate-500">Carregando…</p>
          ) : (
            <>
              <p>
                Para continuar usando o FisioGest Pro precisamos do seu aceite nas
                versões vigentes dos documentos abaixo:
              </p>
              <ul className="mt-3 space-y-2">
                {docs.map((doc) => {
                  const path = doc.type === "privacy" ? "/politica-de-privacidade" : "/termos-de-uso";
                  return (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{doc.title}</div>
                        <div className="text-xs text-slate-500">Versão {doc.version}</div>
                      </div>
                      <Link
                        href={path}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Abrir em nova página
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug text-slate-700">
                  Li e concordo com a Política de Privacidade e os Termos de Uso
                  vigentes.
                </span>
              </label>

              <p className="mt-3 text-xs text-slate-500">
                Registramos a data/hora, o seu IP e o User-Agent deste aceite para
                fins de auditoria, conforme exigido pela ANPD.
              </p>
            </>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            disabled={!agreed || submitting || loading}
            onClick={handleAccept}
            className="min-w-[140px]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando…
              </>
            ) : (
              "Aceitar e continuar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
