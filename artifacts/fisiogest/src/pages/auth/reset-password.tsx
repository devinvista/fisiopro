import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetchJson } from "@/lib/api";
import { useToast } from "@/lib/toast";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const passwordError =
    password.length > 0 && password.length < 6
      ? "A senha deve ter no mínimo 6 caracteres."
      : confirm.length > 0 && confirm !== password
        ? "As senhas não coincidem."
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 6 || password !== confirm) return;

    setSubmitting(true);
    try {
      await apiFetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => setLocation("/login"), 2500);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Não foi possível redefinir",
        description:
          err?.data?.message ??
          "Token inválido ou expirado. Solicite um novo link de redefinição.",
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
            Defina uma nova senha segura para continuar gerenciando sua clínica.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 sm:p-8 lg:p-10 border border-slate-100">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 focus-visible:outline-none focus-visible:underline"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar ao login
          </Link>

          {!token ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 p-4">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-900">Link inválido</p>
                  <p className="text-sm text-red-800">
                    O link de redefinição não contém um token válido. Solicite um novo.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full h-12 rounded-xl">
                <Link href="/recuperar-senha">Solicitar novo link</Link>
              </Button>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900">Senha redefinida!</p>
                  <p className="text-sm text-emerald-800">
                    Você já pode entrar com a nova senha. Redirecionando…
                  </p>
                </div>
              </div>
              <Button asChild className="w-full h-12 rounded-xl">
                <Link href="/login">Ir para o login</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="font-display text-3xl font-bold text-foreground mb-2">
                  Nova senha
                </h2>
                <p className="text-muted-foreground">
                  Escolha uma senha de pelo menos 6 caracteres.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 rounded-xl"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? "password-error" : undefined}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar nova senha</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 rounded-xl"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? "password-error" : undefined}
                  />
                  {passwordError && (
                    <p id="password-error" className="text-sm text-red-600" role="alert">
                      {passwordError}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold"
                  disabled={submitting || !!passwordError || password.length < 6 || password !== confirm}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">Salvando…</span>
                    </>
                  ) : (
                    "Redefinir senha"
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
