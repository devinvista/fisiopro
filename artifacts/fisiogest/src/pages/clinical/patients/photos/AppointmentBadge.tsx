import { 
  Link2, 
  Calendar, 
  Clock 
} from "lucide-react";
import { 
  AppointmentDetails, 
  formatDateShort 
} from "./types";

export function AppointmentBadge({ appt }: { appt: AppointmentDetails }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
      <Link2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
      <span className="font-medium text-blue-700">
        {appt.procedure?.name ?? "Atendimento"}
      </span>
      <span className="text-slate-400">·</span>
      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
      <span>{formatDateShort(appt.date + "T12:00:00")}</span>
      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
      <span>{appt.startTime}</span>
    </div>
  );
}
