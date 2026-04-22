import { fetchUsers, fetchCurrentClinic, updateCurrentClinic } from "../helpers";
import { BASE, API_BASE, ROLE_COLORS, DAYS_OF_WEEK, PRESET_COLORS, DEFAULT_SCHEDULE_FORM, EMPTY_USER_FORM, parseDays, formatDaysBadges, SECTIONS } from "../constants";
import { Clinic, SystemUser, Professional, Schedule, ScheduleFormState, SectionConfig } from "../types";
import { AgendasSection, ScheduleCard, UsuariosSection } from "./";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { maskCpf, maskPhone, maskCnpj, displayCpf } from "@/utils/masks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/utils/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Save,
  Phone,
  Mail,
  MapPin,
  Hash,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  Calendar,
  User2,
  Power,
  PowerOff,
  Settings2,
  ChevronRight,
  Globe,
  Upload,
  ImageIcon,
  Award,
  UserCheck,
  X,
  ShieldAlert,
  Timer,
  BadgeDollarSign,
  CheckCircle2,
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/utils/permissions";
import type { Role } from "@/utils/permissions";
import { Sparkles } from "lucide-react";
import { PlanoSection } from "../../plano-section";

export function ClinicaSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    type: "clinica",
    cnpj: "",
    cpf: "",
    crefito: "",
    responsibleTechnical: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    logoUrl: "",
    cancellationPolicyHours: "" as string | number,
    autoConfirmHours: "" as string | number,
    noShowFeeEnabled: false,
    noShowFeeAmount: "",
    defaultDueDays: 3 as string | number,
  });
  const [logoPreview, setLogoPreview] = useState<string>("");

  const { data: clinic, isLoading } = useQuery<Clinic>({
    queryKey: ["clinic-current"],
    queryFn: fetchCurrentClinic,
  });

  useEffect(() => {
    if (clinic) {
      setFormData({
        name: clinic.name ?? "",
        type: clinic.type ?? "clinica",
        cnpj: clinic.cnpj ? maskCnpj(clinic.cnpj) : "",
        cpf: clinic.cpf ? maskCpf(clinic.cpf) : "",
        crefito: clinic.crefito ?? "",
        responsibleTechnical: clinic.responsibleTechnical ?? "",
        phone: clinic.phone ?? "",
        email: clinic.email ?? "",
        address: clinic.address ?? "",
        website: clinic.website ?? "",
        logoUrl: clinic.logoUrl ?? "",
        cancellationPolicyHours: clinic.cancellationPolicyHours ?? "",
        autoConfirmHours: clinic.autoConfirmHours ?? "",
        noShowFeeEnabled: clinic.noShowFeeEnabled ?? false,
        noShowFeeAmount: clinic.noShowFeeAmount ?? "",
        defaultDueDays: clinic.defaultDueDays ?? 3,
      });
      setLogoPreview(clinic.logoUrl ?? "");
    }
  }, [clinic]);

  const updateMutation = useMutation({
    mutationFn: updateCurrentClinic,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-current"] });
      queryClient.invalidateQueries({ queryKey: ["all-clinics-switcher"] });
      toast({ title: "Dados da clínica atualizados com sucesso!" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Logo muito grande", description: "Selecione uma imagem de até 2 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setFormData((p) => ({ ...p, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Clinic> = {
      ...formData,
      cancellationPolicyHours: formData.cancellationPolicyHours !== "" ? Number(formData.cancellationPolicyHours) : null,
      autoConfirmHours: formData.autoConfirmHours !== "" ? Number(formData.autoConfirmHours) : null,
      defaultDueDays: formData.defaultDueDays !== "" ? Number(formData.defaultDueDays) : 3,
    };
    updateMutation.mutate(payload);
  };

  const isAutonomo = formData.type === "autonomo";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* ── Tipo de Estabelecimento ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Tipo de Estabelecimento
          </CardTitle>
          <CardDescription>Define o modelo jurídico e os campos de identificação exibidos nos documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData((p) => ({ ...p, type: "autonomo" }))}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                isAutonomo
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-slate-200 hover:border-slate-300 text-slate-600"
              }`}
            >
              <User2 className="h-6 w-6" />
              <div className="text-center">
                <p className="text-sm font-semibold">Profissional Autônomo</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">CPF · CREFITO / CREF individual</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFormData((p) => ({ ...p, type: "clinica" }))}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                !isAutonomo
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-slate-200 hover:border-slate-300 text-slate-600"
              }`}
            >
              <Building2 className="h-6 w-6" />
              <div className="text-center">
                <p className="text-sm font-semibold">Clínica / Empresa</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">CNPJ · Responsável Técnico (RT)</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Identidade & Logotipo ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" />
            Identidade Visual
          </CardTitle>
          <CardDescription>Nome e logotipo aparecem no cabeçalho de todos os documentos gerados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinic-name">
              {isAutonomo ? "Nome do Profissional / Consultório *" : "Nome da Clínica *"}
            </Label>
            <Input
              id="clinic-name"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder={isAutonomo ? "Ex: Dr. João Silva — Fisioterapia" : "Ex: Clínica FisioGest"}
              required
            />
          </div>

          {/* Logo upload */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Logotipo
            </Label>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-slate-300" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    Escolher imagem
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </label>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => { setLogoPreview(""); setFormData((p) => ({ ...p, logoUrl: "" })); }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" /> Remover logo
                  </button>
                )}
                <p className="text-[11px] text-muted-foreground">PNG, JPG ou SVG · máx. 2 MB · recomendado 300×100 px</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Identificação Legal ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="h-4 w-4" />
            {isAutonomo ? "Identificação do Profissional" : "Identificação da Empresa"}
          </CardTitle>
          <CardDescription>
            {isAutonomo
              ? "CPF e registro profissional usados nos documentos clínicos."
              : "CNPJ e dados do Responsável Técnico (RT) para emissão de documentos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAutonomo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clinic-cpf" className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> CPF do Profissional
                </Label>
                <Input
                  id="clinic-cpf"
                  value={formData.cpf}
                  onChange={(e) => setFormData((p) => ({ ...p, cpf: maskCpf(e.target.value) }))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic-crefito" className="flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5" /> CREFITO / CREF
                </Label>
                <Input
                  id="clinic-crefito"
                  value={formData.crefito}
                  onChange={(e) => setFormData((p) => ({ ...p, crefito: e.target.value }))}
                  placeholder="Ex: CREFITO-3/12345-F"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinic-cnpj" className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> CNPJ
                </Label>
                <Input
                  id="clinic-cnpj"
                  value={formData.cnpj}
                  onChange={(e) => setFormData((p) => ({ ...p, cnpj: maskCnpj(e.target.value) }))}
                  placeholder="00.000.000/0001-00"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clinic-rt" className="flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5" /> Responsável Técnico (RT)
                  </Label>
                  <Input
                    id="clinic-rt"
                    value={formData.responsibleTechnical}
                    onChange={(e) => setFormData((p) => ({ ...p, responsibleTechnical: e.target.value }))}
                    placeholder="Nome completo do RT"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-crefito" className="flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" /> CREFITO / CREF do RT
                  </Label>
                  <Input
                    id="clinic-crefito"
                    value={formData.crefito}
                    onChange={(e) => setFormData((p) => ({ ...p, crefito: e.target.value }))}
                    placeholder="Ex: CREFITO-3/12345-F"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Contato ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato e Endereço</CardTitle>
          <CardDescription>Aparecem no rodapé e cabeçalho dos documentos emitidos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clinic-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Telefone
              </Label>
              <Input
                id="clinic-phone"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: maskPhone(e.target.value) }))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> E-mail
              </Label>
              <Input
                id="clinic-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                placeholder="contato@clinica.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-address" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Endereço Completo
            </Label>
            <Input
              id="clinic-address"
              value={formData.address}
              onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
              placeholder="Rua, número, bairro, cidade - Estado, CEP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic-website" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Site / Redes Sociais
            </Label>
            <Input
              id="clinic-website"
              value={formData.website}
              onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
              placeholder="www.clinica.com.br"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Políticas de Agendamento ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" />
            Políticas de Agendamento
          </CardTitle>
          <CardDescription>
            Regras automáticas de confirmação, cancelamento e taxa de ausência. Aplicadas pelo sistema a cada hora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Cancelamento / Reagendamento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                  Antecedência mínima para cancelamento
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Número de horas de aviso prévio exigidas para cancelar ou reagendar sem penalidade.
                  Deixe em branco para desativar.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="168"
                value={formData.cancellationPolicyHours}
                onChange={(e) => setFormData((p) => ({ ...p, cancellationPolicyHours: e.target.value }))}
                placeholder="Ex: 24"
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">horas de antecedência</span>
            </div>
            {formData.cancellationPolicyHours && Number(formData.cancellationPolicyHours) > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Pacientes devem cancelar/reagendar com pelo menos <strong className="mx-1">{formData.cancellationPolicyHours}h</strong> de antecedência.
                Essa cláusula aparecerá automaticamente nos contratos gerados.
              </div>
            )}
          </div>

          <Separator />

          {/* Confirmação Automática */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Confirmação automática
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Agendamentos pendentes serão confirmados automaticamente quando faltarem menos de X horas.
                  Deixe em branco para desativar.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="72"
                value={formData.autoConfirmHours}
                onChange={(e) => setFormData((p) => ({ ...p, autoConfirmHours: e.target.value }))}
                placeholder="Ex: 2"
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">horas antes do atendimento</span>
            </div>
            {formData.autoConfirmHours && Number(formData.autoConfirmHours) > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Agendamentos serão confirmados automaticamente <strong className="mx-1">{formData.autoConfirmHours}h</strong> antes do horário marcado.
              </div>
            )}
          </div>

          <Separator />

          {/* Taxa de Não Comparecimento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <BadgeDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Taxa de não comparecimento (no-show)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valor cobrado automaticamente quando um agendamento é marcado como "Faltou" sem justificativa.
                </p>
              </div>
              <Switch
                checked={formData.noShowFeeEnabled}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, noShowFeeEnabled: v }))}
              />
            </div>
            {formData.noShowFeeEnabled && (
              <div className="flex items-center gap-3 pl-1">
                <span className="text-sm font-medium text-muted-foreground">R$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.noShowFeeAmount}
                  onChange={(e) => setFormData((p) => ({ ...p, noShowFeeAmount: e.target.value }))}
                  placeholder="0,00"
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">por falta não justificada</span>
              </div>
            )}
            {formData.noShowFeeEnabled && formData.noShowFeeAmount && Number(formData.noShowFeeAmount) > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                <BadgeDollarSign className="h-3.5 w-3.5 shrink-0" />
                Uma cobrança de <strong className="mx-1">R$ {Number(formData.noShowFeeAmount).toFixed(2).replace(".", ",")}</strong>
                será gerada automaticamente para cada falta não justificada.
              </div>
            )}
          </div>

          <Separator />

          {/* Prazo de vencimento de recebíveis */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Prazo de vencimento de recebíveis
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Número de dias após a data do atendimento para o vencimento do título a receber gerado por sessão avulsa.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="0"
                max="90"
                value={formData.defaultDueDays}
                onChange={(e) => setFormData((p) => ({ ...p, defaultDueDays: e.target.value }))}
                placeholder="3"
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">dias após o atendimento</span>
            </div>
            {Number(formData.defaultDueDays) >= 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {Number(formData.defaultDueDays) === 0
                  ? "Recebíveis vencerão no próprio dia do atendimento."
                  : <>Recebíveis por sessão vencerão <strong className="mx-1">{formData.defaultDueDays} {Number(formData.defaultDueDays) === 1 ? "dia" : "dias"}</strong> após o atendimento.</>
                }
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={updateMutation.isPending}
          className="gap-2 min-w-36"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/* ─── Section: Usuários ─────────────────────────────────────── */

