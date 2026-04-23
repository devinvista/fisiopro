import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListEvolutions,
  useCreateEvolution,
  useUpdateEvolution,
  useDeleteEvolution,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Printer, TrendingUp } from "lucide-react";
import { useToast } from "@/lib/toast";
import { apiFetchJson } from "@/utils/api";

import { PatientBasic, ClinicInfo } from "../types";
import { formatDate, formatDateTime } from "../utils/format";
import { fetchClinicForPrint, printDocument, generateEvolutionsHTML } from "../utils/print-html";

import { EvoForm } from "./evolutions/EvoForm";
import { EvolutionCard } from "./evolutions/EvolutionCard";
import { PainTrendChart } from "./evolutions/PainTrendChart";
import { emptyEvoForm } from "./evolutions/constants";
import { EvoFormState } from "./evolutions/types";

export function EvolutionsTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { data: evolutions = [], isLoading } = useListEvolutions(patientId);
  const createMutation = useCreateEvolution();
  const updateMutation = useUpdateEvolution();
  const deleteMutation = useDeleteEvolution();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({
    queryKey: ["clinic-current"],
    queryFn: fetchClinicForPrint,
    staleTime: 60000
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EvoFormState>(emptyEvoForm);

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => apiFetchJson<any[]>(`/api/patients/${patientId}/appointments`),
    enabled: !!patientId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/evolutions`] });

  const sortedApptsByDate = [...appointments].sort((a: any, b: any) =>
    new Date(a.date + "T" + (a.startTime || "00:00")).getTime() -
    new Date(b.date + "T" + (b.startTime || "00:00")).getTime()
  );

  const getSessionNumber = (ev: any, fallbackIdx: number): number => {
    if (ev.appointmentId) {
      const pos = sortedApptsByDate.findIndex((a: any) => a.id === ev.appointmentId);
      if (pos !== -1) return pos + 1;
    }
    return evolutions.length - fallbackIdx;
  };

  const buildPayload = () => ({
    ...form,
    appointmentId: form.appointmentId ? Number(form.appointmentId) : undefined,
    painScale: form.painScale ?? undefined,
    sessionDuration: form.sessionDuration !== "" ? Number(form.sessionDuration) : undefined,
    techniquesUsed: form.techniquesUsed || undefined,
    homeExercises: form.homeExercises || undefined,
    nextSessionGoals: form.nextSessionGoals || undefined,
  });

  const handleCreate = () => {
    createMutation.mutate({ patientId, data: buildPayload() }, {
      onSuccess: () => {
        toast({ title: "Evolução registrada", description: "Anotação de evolução salva com sucesso." });
        invalidate();
        setForm(emptyEvoForm);
        setShowForm(false);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  const handleUpdate = (id: number) => {
    updateMutation.mutate({ patientId, evolutionId: id, data: buildPayload() }, {
      onSuccess: () => {
        toast({ title: "Evolução atualizada", description: "Alterações salvas com sucesso." });
        invalidate();
        setEditingId(null);
        setForm(emptyEvoForm);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("Excluir esta evolução permanentemente?")) return;
    deleteMutation.mutate({ patientId, evolutionId: id }, {
      onSuccess: () => { toast({ title: "Evolução excluída" }); invalidate(); },
      onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
    });
  };

  const startEdit = (ev: any) => {
    setEditingId(ev.id);
    setShowForm(false);
    setForm({
      appointmentId: ev.appointmentId || "",
      description: ev.description || "",
      patientResponse: ev.patientResponse || "",
      clinicalNotes: ev.clinicalNotes || "",
      complications: ev.complications || "",
      painScale: ev.painScale ?? null,
      sessionDuration: ev.sessionDuration ?? "",
      techniquesUsed: ev.techniquesUsed || "",
      homeExercises: ev.homeExercises || "",
      nextSessionGoals: ev.nextSessionGoals || "",
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Evoluções de Sessão</h3>
          <p className="text-sm text-slate-500">{evolutions.length} evolução(ões) registrada(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {patient && evolutions.length > 0 && (
            <Button variant="outline" size="sm" className="h-9 px-3 rounded-xl text-xs gap-1.5"
              onClick={() => printDocument(generateEvolutionsHTML(patient, evolutions, appointments, clinic), `Evoluções — ${patient.name}`)}>
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </Button>
          )}
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyEvoForm); }} className="h-10 px-5 rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Nova Evolução
          </Button>
        </div>
      </div>

      {showForm && !editingId && (
        <EvoForm
          title="Registrar Evolução de Sessão"
          onSave={handleCreate}
          onCancel={() => { setShowForm(false); setForm(emptyEvoForm); }}
          saving={createMutation.isPending}
          form={form}
          setForm={setForm}
          appointments={appointments}
        />
      )}

      {/* Pain Trend Mini-Chart */}
      {evolutions.length >= 2 && <PainTrendChart evolutions={evolutions} />}

      {evolutions.length === 0 && !showForm ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-12 text-center text-slate-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma evolução registrada</p>
            <p className="text-sm mt-1">Registre evoluções após cada sessão.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200" />
          <div className="space-y-4">
            {evolutions.map((ev, idx) => {
              const linkedAppt = appointments.find((a: any) => a.id === ev.appointmentId);
              const sessionNum = getSessionNumber(ev, idx);
              return (
                <div key={ev.id} className="relative flex gap-4 pl-10">
                  <div className="absolute left-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shadow-md z-10">
                    {sessionNum}
                  </div>
                  {editingId === ev.id ? (
                    <div className="flex-1">
                      <EvoForm
                        title={`Editar Sessão #${sessionNum}`}
                        onSave={() => handleUpdate(ev.id)}
                        onCancel={() => { setEditingId(null); setForm(emptyEvoForm); }}
                        saving={updateMutation.isPending}
                        form={form}
                        setForm={setForm}
                        appointments={appointments}
                      />
                    </div>
                  ) : (
                    <EvolutionCard
                      ev={ev}
                      sessionNum={sessionNum}
                      linkedAppt={linkedAppt}
                      onEdit={() => startEdit(ev)}
                      onDelete={() => handleDelete(ev.id)}
                      isDeleting={deleteMutation.isPending}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
