import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { formatDateTime, formatDate } from "../../utils/format";

interface EvolutionCardProps {
  ev: any;
  sessionNum: number;
  linkedAppt: any;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

export function EvolutionCard({ ev, sessionNum, linkedAppt, onEdit, onDelete, isDeleting }: EvolutionCardProps) {
  return (
    <Card className="flex-1 border border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">{formatDateTime(ev.createdAt)}</p>
            {linkedAppt && (
              <p className="text-xs text-primary font-medium mt-0.5">
                📅 Consulta: {formatDate(linkedAppt.date)} — {linkedAppt.startTime} — {linkedAppt.procedure?.name || "Consulta"}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0 ml-2">
            <button
              onClick={onEdit}
              className="h-7 w-7 p-0 flex items-center justify-center text-slate-400 hover:text-primary transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="h-7 w-7 p-0 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {ev.painScale !== null && ev.painScale !== undefined && (
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 flex-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">EVA</span>
              <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${ev.painScale >= 7 ? "bg-red-500" : ev.painScale >= 4 ? "bg-orange-400" : "bg-green-500"}`}
                  style={{ width: `${(ev.painScale / 10) * 100}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${ev.painScale >= 7 ? "text-red-600" : ev.painScale >= 4 ? "text-orange-600" : "text-green-600"}`}>
                {ev.painScale}/10
              </span>
            </div>
          )}
          {ev.sessionDuration && (
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Duração</span>
              <span className="text-sm font-bold text-slate-700">{ev.sessionDuration} min</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-3">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Descrição da Sessão</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ev.description}</p>
            </div>
            {ev.patientResponse && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Resposta do Paciente</h4>
                <p className="text-sm text-slate-600 italic leading-relaxed whitespace-pre-wrap">{ev.patientResponse}</p>
              </div>
            )}
            {ev.techniquesUsed && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Técnicas / Recursos</h4>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{ev.techniquesUsed}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {ev.clinicalNotes && (
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notas Clínicas</h4>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{ev.clinicalNotes}</p>
              </div>
            )}
            {ev.homeExercises && (
              <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                  🏠 Exercícios Domiciliares
                </h4>
                <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">{ev.homeExercises}</p>
              </div>
            )}
            {ev.nextSessionGoals && (
              <div className="bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                <h4 className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                  🎯 Objetivos Próxima Sessão
                </h4>
                <p className="text-xs text-indigo-800 leading-relaxed whitespace-pre-wrap">{ev.nextSessionGoals}</p>
              </div>
            )}
            {ev.complications && (
              <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                <h4 className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                  ⚠️ Intercorrências
                </h4>
                <p className="text-xs text-red-800 leading-relaxed whitespace-pre-wrap">{ev.complications}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
