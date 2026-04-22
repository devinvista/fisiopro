import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2, ArrowLeft, Building2, UserRound, Check, Package, ChevronRight, Tag, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskCpf } from "@/utils/masks";
import { cn } from "@/utils/utils";

type ProfileType = "clinica" | "autonomo";

interface ProfileOption {
  type: ProfileType;
  icon: React.ElementType;
  label: string;
  description: string;
  roles: string;
}

const PROFILE_OPTIONS: ProfileOption[] = [
  {
    type: "clinica",
    icon: Building2,
    label: "Clínica",
    description: "Gestão de clínica com múltiplos profissionais e secretaria.",
    roles: "Perfil: Administrador",
  },
  {
    type: "autonomo",
    icon: UserRound,
    label: "Profissional Autônomo",
    description: "Trabalha individualmente com acesso completo à agenda e prontuário.",
    roles: "Perfil: Administrador + Profissional",
  },
];

const PLAN_INFO: Record<string, { displayName: string; price: string; priceNum: number; description: string; color: string }> = {
  essencial:    { displayName: "Essencial",    price: "R$ 89/mês",  priceNum: 89,  description: "Para profissionais autônomos",    color: "#0ea5e9" },
  profissional: { displayName: "Profissional", price: "R$ 179/mês", priceNum: 179, description: "Para clínicas em crescimento",     color: "#6366f1" },
  premium:      { displayName: "Premium",      price: "R$ 349/mês", priceNum: 349, description: "Para redes e franquias",          color: "#8b5cf6" },
};

function getPlanFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const plano = params.get("plano");
  return plano && PLAN_INFO[plano] ? plano : "essencial";
}

function getCouponFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("cupom") ?? "";
}

type CouponState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "valid"; discountLabel: string; discountType: "percent" | "fixed"; discountValue: number; description: string }
  | { status: "invalid"; message: string };

export default function Register() {
  const [planName, setPlanName] = useState<string>(getPlanFromUrl);
  const [profileType, setProfileType] = useState<ProfileType>(
    planName === "essencial" ? "autonomo" : "clinica"
  );
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cpf: "",
    password: "",
    clinicName: "",
  });
  const [couponCode, setCouponCode] = useState(getCouponFromUrl);
  const [couponState, setCouponState] = useState<CouponState>({ status: "idle" });
  const couponTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerMutation = useRegister();
  const { login } = useAuth();
  const { toast } = useToast();

  const plan = PLAN_INFO[planName] ?? PLAN_INFO.essencial;

  // Validate coupon from URL on mount
  useEffect(() => {
    const initial = getCouponFromUrl();
    if (initial) {
      setCouponCode(initial);
      validateCoupon(initial, planName);
    }
  }, []);

  async function validateCoupon(code: string, pName: string) {
    if (!code.trim()) {
      setCouponState({ status: "idle" });
      return;
    }
    setCouponState({ status: "loading" });
    try {
      const res = await fetch("/api/coupon-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), planName: pName }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponState({
          status: "valid",
          discountLabel: data.discountLabel,
          discountType: data.discountType,
          discountValue: data.discountValue,
          description: data.description,
        });
      } else {
        setCouponState({ status: "invalid", message: data.error ?? "Cupom inválido" });
      }
    } catch {
      setCouponState({ status: "invalid", message: "Erro ao validar cupom" });
    }
  }

  function handleCouponChange(value: string) {
    const upper = value.toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
    setCouponCode(upper);
    setCouponState({ status: "idle" });
    if (couponTimeout.current) clearTimeout(couponTimeout.current);
    if (upper.length >= 3) {
      couponTimeout.current = setTimeout(() => validateCoupon(upper, planName), 700);
    }
  }

  function computeDiscountedPrice(): string | null {
    if (couponState.status !== "valid") return null;
    const base = plan.priceNum;
    let final: number;
    if (couponState.discountType === "percent") {
      final = Math.max(0, base - (base * couponState.discountValue) / 100);
    } else {
      final = Math.max(0, base - couponState.discountValue);
    }
    return `R$ ${final.toFixed(0).replace(".", ",")}/mês`;
  }

  const discountedPrice = computeDiscountedPrice();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      {
        data: {
          ...formData,
          email: formData.email || undefined,
          clinicName: formData.clinicName || undefined,
          profileType,
          planName,
          couponCode: couponState.status === "valid" ? couponCode.trim() : undefined,
        } as any,
      },
      {
        onSuccess: (res: any) => {
          const couponMsg = couponState.status === "valid"
            ? ` Cupom ${couponCode} aplicado!`
            : "";
          toast({ title: "Conta criada!", description: `Bem-vindo ao FisioGest Pro.${couponMsg}` });
          login(res.token, res.user, res.clinics);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erro no cadastro",
            description: err?.message || "Verifique os dados e tente novamente.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      <div className="w-full flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 sm:p-10 border border-slate-100">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary p-2 rounded-lg">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <span className="font-display font-bold text-2xl">FisioGest Pro</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-foreground mb-1">Criar Conta</h2>
            <p className="text-muted-foreground text-sm">Teste gratuito de 30 dias · Sem cartão de crédito</p>
          </div>

          {/* Plan Selector */}
          <div className="mb-5 space-y-2">
            <Label>Plano selecionado</Label>
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: plan.color + "18" }}>
                  <Package className="w-4 h-4" style={{ color: plan.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{plan.displayName}</p>
                  <p className="text-xs text-slate-500">{plan.description}</p>
                </div>
              </div>
              <div className="text-right">
                {discountedPrice ? (
                  <div>
                    <span className="text-xs line-through text-slate-400 tabular-nums">{plan.price}</span>
                    <span className="block text-sm font-bold tabular-nums text-emerald-600">{discountedPrice}</span>
                  </div>
                ) : (
                  <span className="text-sm font-bold tabular-nums" style={{ color: plan.color }}>{plan.price}</span>
                )}
              </div>
            </div>

            {/* Plan pills */}
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PLAN_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPlanName(key);
                    if (key === "essencial") setProfileType("autonomo");
                    else setProfileType("clinica");
                    if (couponCode) validateCoupon(couponCode, key);
                  }}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                    planName === key
                      ? "border-transparent text-white"
                      : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"
                  )}
                  style={planName === key ? { backgroundColor: info.color } : {}}
                >
                  {info.displayName}
                </button>
              ))}
            </div>

            {/* Coupon field — right after plan selection */}
            <div className="space-y-2 pt-1">
              <Label htmlFor="coupon" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                Cupom de desconto
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="coupon"
                  placeholder="Ex: FISIO30 ou INDICA-SILVA"
                  value={couponCode}
                  onChange={(e) => handleCouponChange(e.target.value)}
                  className={cn(
                    "h-12 rounded-xl pr-10 font-mono uppercase tracking-widest text-sm",
                    couponState.status === "valid" && "border-emerald-400 bg-emerald-50/50 focus-visible:ring-emerald-300",
                    couponState.status === "invalid" && "border-red-400 bg-red-50/50 focus-visible:ring-red-300"
                  )}
                  autoComplete="off"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {couponState.status === "loading" && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  {couponState.status === "valid" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {couponState.status === "invalid" && <XCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>

              {couponState.status === "valid" && (
                <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">{couponState.discountLabel} aplicado!</span>
                    {couponState.description && (
                      <span className="text-emerald-600 block">{couponState.description}</span>
                    )}
                  </div>
                </div>
              )}
              {couponState.status === "invalid" && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> {couponState.message}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
            {/* Profile type selector */}
            <div className="space-y-2">
              <Label>Tipo de Perfil</Label>
              <div className="grid grid-cols-2 gap-3">
                {PROFILE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = profileType === option.type;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setProfileType(option.type)}
                      className={cn(
                        "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        selected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {selected && (
                        <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl",
                          selected ? "bg-primary/15" : "bg-slate-100"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-slate-500")} />
                      </div>
                      <div>
                        <p className={cn("text-sm font-semibold leading-tight", selected ? "text-primary" : "text-slate-800")}>
                          {option.label}
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-slate-500">{option.description}</p>
                      </div>
                      <span className={cn("mt-auto text-[10px] font-semibold uppercase tracking-wide", selected ? "text-primary/70" : "text-slate-400")}>
                        {option.roles}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicName">
                {profileType === "autonomo" ? "Nome do Consultório / Studio" : "Nome da Clínica"} *
              </Label>
              <Input
                id="clinicName"
                placeholder={profileType === "autonomo" ? "Ex: Studio Pilates Maria" : "Ex: Clínica Fisio São Paulo"}
                value={formData.clinicName}
                onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                required
                autoComplete="organization"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                placeholder="Dr. João Silva"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                autoComplete="name"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={formData.cpf}
                onChange={(e) => setFormData({ ...formData, cpf: maskCpf(e.target.value) })}
                maxLength={14}
                required
                autoComplete="off"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                E-mail{" "}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                autoComplete="email"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                autoComplete="new-password"
                className="h-12 rounded-xl"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all mt-4"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                <>Criar conta grátis <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-primary font-medium inline-flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar para o Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
