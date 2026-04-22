import { useQuery } from "@tanstack/react-query";
import { useListAppointments } from "@workspace/api-client-react";
import { apiFetch } from "@/utils/api";
import type { BlockedSlot, ScheduleOption } from "../types";

interface ProfessionalOption {
  id: number;
  name: string;
  roles: string[];
}

interface UseAgendaQueriesArgs {
  startDate: string;
  endDate: string;
  selectedScheduleId: number | null;
  canFilterByProfessional: boolean;
}

export function useAgendaQueries({
  startDate,
  endDate,
  selectedScheduleId,
  canFilterByProfessional,
}: UseAgendaQueriesArgs) {
  const schedulesQuery = useQuery<ScheduleOption[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch("/api/schedules").then((r) => r.json()),
    staleTime: 60_000,
  });

  const professionalsQuery = useQuery<ProfessionalOption[]>({
    queryKey: ["professionals"],
    queryFn: () =>
      apiFetch("/api/users/professionals", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: canFilterByProfessional,
    select: (data) => data.filter((u) => u.roles.includes("profissional")),
  });

  const appointmentsQuery = useListAppointments({ startDate, endDate });

  const blockedSlotsQuery = useQuery<BlockedSlot[]>({
    queryKey: ["blocked-slots", startDate, endDate, selectedScheduleId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedScheduleId) params.set("scheduleId", String(selectedScheduleId));
      const res = await apiFetch(`/api/blocked-slots?${params}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });

  return {
    schedules: schedulesQuery.data ?? [],
    professionals: professionalsQuery.data ?? [],
    appointments: appointmentsQuery.data ?? [],
    isLoadingAppointments: appointmentsQuery.isLoading,
    refetchAppointments: appointmentsQuery.refetch,
    blockedSlots: blockedSlotsQuery.data ?? [],
    refetchBlocked: blockedSlotsQuery.refetch,
  };
}
