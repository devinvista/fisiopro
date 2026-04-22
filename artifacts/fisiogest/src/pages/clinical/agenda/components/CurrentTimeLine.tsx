import { HOUR_START, HOUR_END } from "../constants";
import { minutesToTop } from "../utils";

export function CurrentTimeLine({
  hourStart = HOUR_START,
  hourEnd = HOUR_END,
}: {
  hourStart?: number;
  hourEnd?: number;
}) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < hourStart * 60 || minutes > hourEnd * 60) return null;
  const top = minutesToTop(minutes, hourStart);
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
        <div className="flex-1 h-[1.5px] bg-red-400" />
      </div>
    </div>
  );
}
