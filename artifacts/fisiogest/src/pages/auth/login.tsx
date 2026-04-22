import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCpf } from "@/utils/masks";

function looksLikeCpf(value: string): boolean {
  return /^\d/.test(value.trim()) && !value.includes("@");
}

function getLoginErrorMessage(err: any): string {
  return (
    err?.data?.message ||
    err?.data?.error ||
    err?.message?.replace(/^HTTP \d+ [^:]+:\s*/, "") ||
    "Credenciais inválidas. Tente novamente."
  );
}

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useLogin();
  const { login } = useAuth();
  const { toast } = useToast();

  const isCpfMode = looksLikeCpf(identifier);

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (looksLikeCpf(raw)) {
      setIdentifier(maskCpf(raw));
    } else {
      setIdentifier(raw);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email: identifier, password } },
      {
        onSuccess: (res: any) => {
          toast({ title: "Bem-vindo de volta!", description: "Login realizado com sucesso." });
          login(res.token, res.user, res.clinics);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erro no login",
            description: getLoginErrorMessage(err),
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left side */}
      <div className="hidden lg:flex w-1/2 relative bg-primary items-center justify-center overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Healthcare background"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="relative z-10 p-12 text-white max-w-lg text-center">
          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md inline-block mb-8 border border-white/20">
            <Stethoscope className="w-16 h-16" />
          </div>
          <h1 className="font-display text-5xl font-bold mb-6">FisioGest Pro</h1>
          <p className="text-xl text-white/80 leading-relaxed text-balance">
            A plataforma definitiva para gestão clínica de Fisioterapia, Estética e Pilates.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 sm:p-10 border border-slate-100">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="bg-primary p-2 rounded-lg">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <span className="font-display font-bold text-2xl">FisioGest Pro</span>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold text-foreground mb-2">Entrar</h2>
            <p className="text-muted-foreground">Acesse sua conta para gerenciar sua clínica.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on">
            <div className="space-y-2">
              <Label htmlFor="identifier">CPF ou E-mail</Label>
              <div className="relative">
                <Input
                  id="identifier"
                  type="text"
                  inputMode={isCpfMode ? "numeric" : "email"}
                  placeholder="000.000.000-00 ou seu@email.com"
                  value={identifier}
                  onChange={handleIdentifierChange}
                  required
                  autoComplete="username"
                  className="h-12 rounded-xl pr-16"
                />
                {isCpfMode && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    CPF
                  </span>
                )}
                {!isCpfMode && identifier.includes("@") && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                    E-MAIL
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <a href="#" className="text-sm text-primary font-medium hover:underline">
                  Esqueceu a senha?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 rounded-xl"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                "Entrar no Sistema"
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              Não tem uma conta?{" "}
              <Link
                href="/register"
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
              >
                Crie agora <ArrowRight className="w-4 h-4" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
