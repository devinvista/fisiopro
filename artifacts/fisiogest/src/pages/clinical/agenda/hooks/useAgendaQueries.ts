import { useQuery } from "@tanstack/react-query";
import type { AppointmentWithDetails } from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api";
import type { BlockedSlot, ScheduleOption } from "../types";

interface PaginatedAppointmentsResponse {
  data: AppointmentWithDetails[];
  page?: { limit: number; hasMore: boolean; nextCursor: string | null };
}

/**
 * Busca TODOS os agendamentos do intervalo, paginando até o fim.
 * A API limita a 100 por página, então a agenda precisa iterar via cursor
 * — caso contrário, semanas com mais de 20 atendimentos perdem os últimos
 * dias visualmente.
 */
async function fetchAllAppointments(
  startDate: string,
  endDate: string,
): Promise<AppointmentWithDetails[]> {
  const all: AppointmentWithDetails[] = [];
  let cursor: string | null = null;
  // Hard cap defensivo para evitar loop infinito caso o backend mude
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({ startDate, endDate, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await apiFetch(`/api/appointments?${params}`);
    const body = (await res.json()) as PaginatedAppointmentsResponse | AppointmentWithDetails[];
    if (Array.isArray(body)) {
      all.push(...body);
      break;
    }
    all.push(...(body.data ?? []));
    if (!body.page?.hasMore || !body.page.nextCursor) break;
    cursor = body.page.nextCursor;
  }
  return all;
}

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

  const appointmentsQuery = useQuery<AppointmentWithDetails[]>({
    queryKey: ["appointments", "agenda-range", startDate, endDate],
    queryFn: () => fetchAllAppointments(startDate, endDate),
    staleTime: 30_000,
  });

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
