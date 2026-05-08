import { Card, CardContent } from "@/components/ui/card";
import {
  Pencil,
  Trash2,
  Calendar,
  Home,
  Target,
  AlertTriangle,
  Clock,
  Stethoscope,
  MessageSquare,
  FileText,
  Zap,
} from "lucide-react";
import { formatDateTime, formatDate } from "../../utils/format";

interface EvolutionCardProps {
  ev: any;
  sessionNum: number;
  linkedAppt: any;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

const painLabel = (v: number) => {
  if (v === 0) return "Sem dor";
  if (v <= 3) return "Leve";
  if (v <= 6) return "Moderada";
  if (v <= 9) return "Intensa";
  return "Insuportável";
};

const painScheme = (v: number) =>
  v >= 7
    ? { bar: "bg-red-500", text: "text-red-600", badge: "bg-red-50 border-red-100 text-red-700" }
    : v >= 4
      ? { bar: "bg-orange-400", text: "text-orange-600", badge: "bg-orange-50 border-orange-100 text-orange-700" }
      : { bar: "bg-emerald-500", text: "text-emerald-600", badge: "bg-emerald-50 border-emerald-100 text-emerald-700" };

function SectionLabel({ icon: Icon, label, className = "" }: { icon: any; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 mb-1.5 ${className}`}>
      <Icon className="w-3 h-3 opacity-60 shrink-0" />
      <span className="text-[11px] font-semibold uppercase tracking-widest opacity-70">{label}</span>
    </div>
  );
}

export function EvolutionCard({ ev, sessionNum, linkedAppt, onEdit, onDelete, isDeleting }: EvolutionCardProps) {
  const hasPain = ev.painScale !== null && ev.painScale !== undefined;
  const scheme = hasPain ? painScheme(ev.painScale) : null;

  return (
    <Card className="flex-1 border border-slate-200 shadow-sm overflow-hidden">
      {/* Accent stripe */}
      <div className={`h-0.5 w-full ${hasPain ? (ev.painScale >= 7 ? "bg-red-400" : ev.painScale >= 4 ? "bg-orange-400" : "bg-emerald-400") : "bg-primary/40"}`} />

      <CardContent className="p-4 pt-3.5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium">{formatDateTime(ev.createdAt)}</p>
            {linkedAppt && (
              <div className="flex items-center gap-1.5 mt-1">
                <Calendar className="w-3 h-3 text-primary shrink-0" />
                <p className="text-xs text-primary font-medium truncate">
                  {formatDate(linkedAppt.date)} · {linkedAppt.startTime}
                  {linkedAppt.procedure?.name ? ` · ${linkedAppt.procedure.name}` : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0 ml-3">
            <button
              onClick={onEdit}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/8 transition-all"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* EVA + Duration badges */}
        {(hasPain || ev.sessionDuration) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {hasPain && scheme && (
              <div className={`flex items-center gap-2.5 rounded-xl px-3 py-1.5 border flex-1 min-w-[160px] ${scheme.badge}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">EVA</span>
                <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scheme.bar}`}
                    style={{ width: `${(ev.painScale / 10) * 100}%` }}
                  />
                </div>
                <span className={`text-sm font-bold tabular-nums ${scheme.text}`}>
                  {ev.painScale}/10
                </span>
                <span className={`text-[10px] font-semibold ${scheme.text} opacity-80`}>
                  {painLabel(ev.painScale)}
                </span>
              </div>
            )}
            {ev.sessionDuration && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-xs font-bold text-slate-700">{ev.sessionDuration} min</span>
              </div>
            )}
          </div>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-1">
          {/* Left column */}
          <div className="space-y-3">
            <div>
              <SectionLabel icon={FileText} label="Descrição da Sessão" className="text-slate-400" />
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ev.description}</p>
            </div>

            {ev.patientResponse && (
              <div>
                <SectionLabel icon={MessageSquare} label="Resposta do Paciente" className="text-slate-400" />
                <p className="text-sm text-slate-600 italic leading-relaxed whitespace-pre-wrap">{ev.patientResponse}</p>
              </div>
            )}

            {ev.techniquesUsed && (
              <div>
                <SectionLabel icon={Zap} label="Técnicas / Recursos" className="text-slate-400" />
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{ev.techniquesUsed}</p>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-3">
            {ev.clinicalNotes && (
              <div>
                <SectionLabel icon={Stethoscope} label="Notas Clínicas" className="text-slate-400" />
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{ev.clinicalNotes}</p>
              </div>
            )}

            {ev.homeExercises && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <SectionLabel icon={Home} label="Exercícios Domiciliares" className="text-emerald-700" />
                <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">{ev.homeExercises}</p>
              </div>
            )}

            {ev.nextSessionGoals && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <SectionLabel icon={Target} label="Objetivos — Próxima Sessão" className="text-indigo-700" />
                <p className="text-xs text-indigo-800 leading-relaxed whitespace-pre-wrap">{ev.nextSessionGoals}</p>
              </div>
            )}

            {ev.complications && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <SectionLabel icon={AlertTriangle} label="Intercorrências" className="text-red-700" />
                <p className="text-xs text-red-800 leading-relaxed whitespace-pre-wrap">{ev.complications}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
