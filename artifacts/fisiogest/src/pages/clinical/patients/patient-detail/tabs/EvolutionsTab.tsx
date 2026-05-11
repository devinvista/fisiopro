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
import { PrimaryActionButton } from "@/components/ui/primary-action-button";
import { Loader2, Plus, Printer, TrendingUp } from "lucide-react";
import { useToast } from "@/lib/toast";
import { apiFetchJson } from "@/lib/api";
import { confirm as confirmDialog } from "@/lib/confirm";

import { PatientBasic, ClinicInfo } from "../types";
import { formatDate, formatDateTime } from "../utils/format";
import { fetchClinicForPrint, printDocument, generateEvolutionsHTML } from "../utils/print-html";

import { EvoForm } from "./evolutions/EvoForm";
import { EvolutionCard } from "./evolutions/EvolutionCard";
import { PainTrendChart } from "./evolutions/PainTrendChart";
import { emptyEvoForm } from "./evolutions/constants";
import { EvoFormState } from "./evolutions/types";

function pluralEvo(n: number) {
  return n === 1 ? "1 evolução registrada" : `${n} evoluções registradas`;
}

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
    if (!form.appointmentId) {
      toast({ title: "Selecione o agendamento", description: "É obrigatório vincular a evolução a um agendamento.", variant: "destructive" });
      return;
    }
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
    if (!form.appointmentId) {
      toast({ title: "Selecione o agendamento", description: "É obrigatório vincular a evolução a um agendamento.", variant: "destructive" });
      return;
    }
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

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog({
      title: "Excluir esta evolução?",
      description: "Esta ação é permanente e não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
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

  if (isLoading) return (
    <div className="p-10 text-center">
      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">Evoluções de Sessão</h3>
          <p className="text-xs sm:text-sm text-slate-500">{pluralEvo(evolutions.length)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {patient && evolutions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto h-10 sm:h-9 px-3 rounded-xl text-xs gap-1.5"
              onClick={() => printDocument(generateEvolutionsHTML(patient, evolutions, appointments, clinic), `Evoluções — ${patient.name}`)}
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Imprimir / PDF</span>
            </Button>
          )}
          <PrimaryActionButton
            label="Nova Evolução"
            mobileLabel="Nova"
            onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyEvoForm); }}
            className="w-full sm:w-auto justify-center"
          />
        </div>
      </div>

      {/* New evolution form */}
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

      {/* Pain trend chart */}
      {evolutions.length >= 2 && <PainTrendChart evolutions={evolutions} />}

      {/* Empty state */}
      {evolutions.length === 0 && !showForm ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-14 flex flex-col items-center text-center text-slate-400 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 opacity-40" />
            </div>
            <div>
              <p className="font-semibold text-slate-500">Nenhuma evolução registrada</p>
              <p className="text-sm mt-0.5">Registre a evolução após cada sessão para acompanhar o progresso do paciente.</p>
            </div>
            <Button
              size="sm"
              className="mt-1 rounded-xl gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar primeira evolução
            </Button>
          </CardContent>
        </Card>
      ) : evolutions.length > 0 ? (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[17px] top-5 bottom-5 w-px bg-gradient-to-b from-primary/30 via-slate-200 to-transparent" />

          <div className="space-y-4">
            {evolutions.map((ev, idx) => {
              const linkedAppt = appointments.find((a: any) => a.id === ev.appointmentId);
              const sessionNum = getSessionNumber(ev, idx);
              return (
                <div key={ev.id} className="relative flex gap-4 pl-10">
                  {/* Session bubble */}
                  <div className="absolute left-0 w-[34px] h-[34px] rounded-full bg-primary ring-4 ring-primary/10 flex items-center justify-center text-white text-xs font-bold shadow-md z-10">
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
      ) : null}
    </div>
  );
}
