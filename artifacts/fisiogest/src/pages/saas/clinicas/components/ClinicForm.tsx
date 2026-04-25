import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Upload,
  ImageIcon,
  X,
  User2,
  Award,
  UserCheck,
  Hash,
  Phone,
  Mail,
  MapPin,
  Globe,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { maskCpf, maskPhone, maskCnpj } from "@/utils/masks";
import type { ClinicFormData } from "../types";

export function ClinicForm({
  formData,
  setFormData,
}: {
  formData: ClinicFormData;
  setFormData: (data: any) => void;
}) {
  const { toast } = useToast();
  const isAutonomo = formData.type === "autonomo";
  const [logoPreview, setLogoPreview] = useState(formData.logoUrl || "");

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
      setFormData((p: any) => ({ ...p, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4 max-h-[70dvh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setFormData((p: any) => ({ ...p, type: "autonomo" }))}
          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all cursor-pointer ${
            isAutonomo ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/80 text-muted-foreground"
          }`}
        >
          <User2 className="h-5 w-5" />
          <div className="text-center">
            <p className="text-xs font-semibold">Profissional Autônomo</p>
            <p className="text-[10px] text-muted-foreground">CPF · CREFITO/CREF</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setFormData((p: any) => ({ ...p, type: "clinica" }))}
          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all cursor-pointer ${
            !isAutonomo ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/80 text-muted-foreground"
          }`}
        >
          <Building2 className="h-5 w-5" />
          <div className="text-center">
            <p className="text-xs font-semibold">Clínica / Empresa</p>
            <p className="text-[10px] text-muted-foreground">CNPJ · Resp. Técnico</p>
          </div>
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5"><Upload className="h-3 w-3" /> Logotipo</Label>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30 shrink-0">
            {logoPreview
              ? <img src={logoPreview} alt="Logo da clínica" width={120} height={120} className="w-full h-full object-contain p-1" />
              : <ImageIcon className="h-5 w-5 text-muted-foreground/40" />}
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 cursor-pointer w-fit">
              <div className="inline-flex items-center gap-1 text-xs font-medium border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors">
                <Upload className="h-3 w-3" /> Escolher imagem
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
            {logoPreview && (
              <button type="button" onClick={() => { setLogoPreview(""); setFormData((p: any) => ({ ...p, logoUrl: "" })); }}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80">
                <X className="h-3 w-3" /> Remover
              </button>
            )}
            <p className="text-[10px] text-muted-foreground">PNG, JPG · máx. 2 MB</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clinicName" className="text-xs">
          {isAutonomo ? "Nome do Profissional / Consultório *" : "Nome da Clínica *"}
        </Label>
        <Input id="clinicName" value={formData.name} required
          onChange={(e) => setFormData((p: any) => ({ ...p, name: e.target.value }))}
          placeholder={isAutonomo ? "Dr. João Silva — Fisioterapia" : "Clínica FisioGest"} />
      </div>

      {isAutonomo ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> CPF</Label>
            <Input value={formData.cpf}
              type="text" inputMode="numeric" autoComplete="off"
              onChange={(e) => setFormData((p: any) => ({ ...p, cpf: maskCpf(e.target.value) }))}
              placeholder="000.000.000-00" maxLength={14} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Award className="h-3 w-3" /> CREFITO / CREF</Label>
            <Input value={formData.crefito}
              onChange={(e) => setFormData((p: any) => ({ ...p, crefito: e.target.value }))}
              placeholder="CREFITO-3/12345-F" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> CNPJ</Label>
            <Input value={formData.cnpj}
              type="text" inputMode="numeric" autoComplete="off" maxLength={18}
              onChange={(e) => setFormData((p: any) => ({ ...p, cnpj: maskCnpj(e.target.value) }))}
              placeholder="00.000.000/0001-00" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><UserCheck className="h-3 w-3" /> Responsável Técnico</Label>
              <Input value={formData.responsibleTechnical}
                onChange={(e) => setFormData((p: any) => ({ ...p, responsibleTechnical: e.target.value }))}
                placeholder="Nome completo do RT" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Award className="h-3 w-3" /> CREFITO / CREF do RT</Label>
              <Input value={formData.crefito}
                onChange={(e) => setFormData((p: any) => ({ ...p, crefito: e.target.value }))}
                placeholder="CREFITO-3/12345-F" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
          <Input value={formData.phone}
            type="tel" inputMode="tel" autoComplete="off"
            onChange={(e) => setFormData((p: any) => ({ ...p, phone: maskPhone(e.target.value) }))}
            placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</Label>
          <Input type="email" inputMode="email" autoComplete="off"
            value={formData.email}
            onChange={(e) => setFormData((p: any) => ({ ...p, email: e.target.value }))}
            placeholder="contato@clinica.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço</Label>
        <Input value={formData.address}
          onChange={(e) => setFormData((p: any) => ({ ...p, address: e.target.value }))}
          placeholder="Rua, número, bairro, cidade" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Site / Redes Sociais</Label>
        <Input value={formData.website}
          onChange={(e) => setFormData((p: any) => ({ ...p, website: e.target.value }))}
          placeholder="www.clinica.com.br" />
      </div>
    </div>
  );
}
