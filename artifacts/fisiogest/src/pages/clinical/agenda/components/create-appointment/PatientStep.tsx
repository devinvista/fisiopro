import { ArrowRight, CheckCircle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TreatmentPlan } from "../../types";

export interface PatientLite {
  id: number;
  name: string;
  phone?: string | null;
  cpf?: string | null;
}

export function PatientStep({
  patientSearch,
  setPatientSearch,
  filteredPatients,
  selectedPatientId,
  onSelect,
  selectedPatient,
  hasActivePlan,
  treatmentPlan,
  onContinue,
  canContinue,
}: {
  patientSearch: string;
  setPatientSearch: (v: string) => void;
  filteredPatients: PatientLite[];
  selectedPatientId: string;
  onSelect: (id: string) => void;
  selectedPatient: PatientLite | undefined;
  hasActivePlan: boolean;
  treatmentPlan: TreatmentPlan | null | undefined;
  onContinue: () => void;
  canContinue: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Buscar paciente *</Label>
        <Input
          placeholder="Nome, telefone ou CPF..."
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
          className="h-11 rounded-xl"
          autoFocus
        />
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
        {filteredPatients.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Nenhum paciente encontrado.</p>
        )}
        {filteredPatients.map((p) => {
          const isSelected = selectedPatientId === p.id.toString();
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id.toString())}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
              )}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                {p.phone && <p className="text-xs text-slate-400 truncate">{p.phone}</p>}
              </div>
              {isSelected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>

      {selectedPatient && hasActivePlan && (
        <div className="space-y-2">
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="text-xs font-bold text-teal-700">Plano de Tratamento Ativo</span>
            </div>
            {treatmentPlan?.frequency && (
              <p className="text-xs text-teal-600">
                <span className="font-semibold">Frequência:</span> {treatmentPlan.frequency}
              </p>
            )}
            {treatmentPlan?.objectives && (
              <p className="text-xs text-teal-600 line-clamp-2">
                <span className="font-semibold">Objetivos:</span> {treatmentPlan.objectives}
              </p>
            )}
            {treatmentPlan?.techniques && (
              <p className="text-xs text-teal-600 line-clamp-2">
                <span className="font-semibold">Técnicas:</span> {treatmentPlan.techniques}
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full h-11 rounded-xl shadow-md shadow-primary/20"
        disabled={!canContinue}
        onClick={onContinue}
      >
        Continuar <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
