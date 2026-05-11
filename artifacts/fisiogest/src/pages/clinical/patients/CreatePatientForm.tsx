import { useState } from "react";
import { Loader2, UserPlus, ShieldAlert } from "lucide-react";
import { apiFetch, isPlanLimitPayload } from "@/lib/api";
import { usePlanLimit } from "@/contexts/plan-limit-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/toast";
import { maskCpf, maskPhone } from "@/utils/masks";
import { patientFormSchema, buildPatientPayload } from "@/schemas/patient.schema";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useQueryClient } from "@tanstack/react-query";

interface CrossClinicPatient {
  id: number; name: string; cpf: string; phone: string;
  email?: string | null; birthDate?: string | null;
  address?: string | null; profession?: string | null; emergencyContact?: string | null;
}

export function CreatePatientForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: "", cpf: "", phone: "", email: "", birthDate: "",
    sex: "" as "" | "M" | "F" | "O",
    profession: "", address: "", emergencyContact: "", notes: "",
  });
  const [cpfLookupState, setCpfLookupState] = useState<"idle" | "loading" | "found" | "not_found" | "already_exists">("idle");
  const [crossClinicPatient, setCrossClinicPatient] = useState<CrossClinicPatient | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const { show: planLimitModal } = usePlanLimit();
  const qc = useQueryClient();

  async function handleCpfBlur() {
    const raw = formData.cpf.replace(/\D/g, "");
    if (raw.length !== 11) return;
    setCpfLookupState("loading");
    try {
      const res = await apiFetch(`/api/patients/lookup?cpf=${raw}`);
      if (res.status === 404) { setCpfLookupState("not_found"); return; }
      if (!res.ok) { setCpfLookupState("idle"); return; }
      const body = await res.json();
      if (body.existsInThisClinic) { setCpfLookupState("already_exists"); return; }
      if (body.existsInOtherClinic) { setCrossClinicPatient(body.patient); setCpfLookupState("found"); }
      else { setCpfLookupState("not_found"); }
    } catch { setCpfLookupState("idle"); }
  }

  async function handleImport() {
    if (!crossClinicPatient) return;
    setIsImporting(true);
    try {
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch("/api/patients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}) },
        body: JSON.stringify({ cpf: crossClinicPatient.cpf }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (isPlanLimitPayload(err)) { planLimitModal(err); return; }
        throw new Error(err?.message ?? "Erro ao importar");
      }
      qc.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Paciente importado", description: `${crossClinicPatient.name} foi adicionado à sua clínica.` });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao importar", description: err?.message ?? "Tente novamente." });
    } finally { setIsImporting(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = patientFormSchema.safeParse({ ...formData, sex: formData.sex || undefined });
    if (!parsed.success) {
      toast({ variant: "destructive", title: "Dados inválidos", description: parsed.error.issues[0]?.message });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = buildPatientPayload(parsed.data);
      const csrfCookie = document.cookie.split(";").find(c => c.trim().startsWith("fisiogest_csrf="))?.split("=")[1];
      const res = await apiFetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfCookie ? { "x-csrf-token": decodeURIComponent(csrfCookie) } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (isPlanLimitPayload(err)) { planLimitModal(err); return; }
        throw new Error(err?.message ?? "Erro ao cadastrar");
      }
      qc.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Paciente cadastrado!", description: `${formData.name} foi adicionado com sucesso.` });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: err?.message ?? "Tente novamente." });
    } finally { setIsSubmitting(false); }
  }

  const f = formData;
  const set = (k: keyof typeof formData) => (v: string) => setFormData(prev => ({ ...prev, [k]: v }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-900 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          Novo Paciente
        </h2>
        <p className="text-sm text-slate-500 mt-1">Preencha os dados para cadastrar um novo paciente.</p>
      </div>

      {cpfLookupState === "already_exists" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
          Este CPF já está cadastrado nesta clínica.
        </div>
      )}
      {cpfLookupState === "found" && crossClinicPatient && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Paciente encontrado em outra clínica</p>
          <p className="text-xs text-slate-500">{crossClinicPatient.name} · {crossClinicPatient.phone}</p>
          <Button type="button" size="sm" className="h-8 gap-1.5 rounded-lg" onClick={handleImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Importar este paciente
          </Button>
        </div>
      )}

      <div className="space-y-5">
        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Identificação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Nome Completo *</Label>
              <Input required value={f.name} onChange={e => set("name")(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">CPF *</Label>
              <Input required type="text" inputMode="numeric" maxLength={14} value={f.cpf}
                onChange={e => set("cpf")(maskCpf(e.target.value))} onBlur={handleCpfBlur}
                placeholder="000.000.000-00" className="h-10 rounded-xl font-mono" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contato</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Telefone / WhatsApp *</Label>
              <Input required type="tel" value={f.phone} onChange={e => set("phone")(maskPhone(e.target.value))}
                placeholder="(11) 99999-0000" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">E-mail</Label>
              <Input type="email" value={f.email} onChange={e => set("email")(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados Pessoais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Data de Nascimento</Label>
              <DatePickerPTBR value={f.birthDate} onChange={v => set("birthDate")(v)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Sexo</Label>
              <Select value={f.sex} onValueChange={v => setFormData(prev => ({ ...prev, sex: v as "" | "M" | "F" | "O" }))}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="F">Feminino</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="O">Outro / Não informado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Profissão</Label>
              <Input value={f.profession} onChange={e => set("profession")(e.target.value)} placeholder="Ex: Professora" className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Endereço</Label>
            <Input value={f.address} onChange={e => set("address")(e.target.value)} placeholder="Rua, número, bairro" className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Contato de Emergência
            </Label>
            <Input value={f.emergencyContact} onChange={e => set("emergencyContact")(e.target.value)}
              placeholder="Nome — Telefone" className="h-10 rounded-xl" />
          </div>
        </section>

        <section className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Observações internas</Label>
          <Textarea value={f.notes} onChange={e => set("notes")(e.target.value)}
            placeholder="Alergias, restrições, histórico relevante…"
            className="min-h-[80px] resize-none text-sm rounded-xl" />
        </section>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <Button type="submit" className="h-10 px-8 rounded-xl" disabled={isSubmitting || cpfLookupState === "already_exists"}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Cadastrar Paciente
        </Button>
      </div>
    </form>
  );
}
