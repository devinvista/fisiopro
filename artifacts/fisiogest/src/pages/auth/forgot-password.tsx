import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { apiFetchJson } from "@/lib/api";
import { useToast } from "@/lib/toast";

type ForgotResponse = { ok: true; devResetUrl: string | null };

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetchJson<ForgotResponse>("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDevResetUrl(res?.devResetUrl ?? null);
      setSubmitted(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao solicitar",
        description: err?.data?.message ?? "Não foi possível enviar o link. Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      <div className="hidden lg:flex w-1/2 relative bg-primary items-center justify-center overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="relative z-10 p-12 text-white max-w-lg text-center">
          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md inline-block mb-8 border border-white/20">
            <Stethoscope className="w-16 h-16" aria-hidden="true" />
          </div>
          <h1 className="font-display text-5xl font-bold mb-6">FisioGest Pro</h1>
          <p className="text-xl text-white/80 leading-relaxed text-balance">
            Recupere o acesso à sua conta em poucos segundos.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 sm:p-10 border border-slate-100">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 focus-visible:outline-none focus-visible:underline"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar ao login
          </Link>

          {submitted ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <MailCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900">Se este e-mail estiver cadastrado…</p>
                  <p className="text-sm text-emerald-800">
                    Enviaremos um link de redefinição de senha válido por 1 hora.
                    Verifique sua caixa de entrada e a pasta de spam.
                  </p>
                </div>
              </div>

              {devResetUrl && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Ambiente de desenvolvimento
                  </p>
                  <p className="text-xs text-amber-900">
                    Como não há e-mail configurado, use o link abaixo para testar:
                  </p>
                  <a
                    href={devResetUrl}
                    className="block text-xs text-amber-900 underline break-all font-mono"
                  >
                    {devResetUrl}
                  </a>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 rounded-xl"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                  setDevResetUrl(null);
                }}
              >
                Enviar para outro e-mail
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="font-display text-3xl font-bold text-foreground mb-2">
                  Esqueceu a senha?
                </h2>
                <p className="text-muted-foreground">
                  Informe o e-mail da sua conta e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">Enviando…</span>
                    </>
                  ) : (
                    "Enviar link de redefinição"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
