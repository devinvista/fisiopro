import { useState } from "react";
import { useUpdateAppointment, useCompleteAppointment } from "@workspace/api-client-react";
import { useToast } from "@/lib/toast";

interface UseAgendaMutationsArgs {
  todayCompareceuIds: number[];
  refetch: () => void;
}

export function useAgendaMutations({ todayCompareceuIds, refetch }: UseAgendaMutationsArgs) {
  const { toast } = useToast();
  const quickUpdateMutation = useUpdateAppointment();
  const quickCompleteMutation = useCompleteAppointment();

  const [quickCheckInId, setQuickCheckInId] = useState<number | null>(null);
  const [batchCompleting, setBatchCompleting] = useState(false);

  const handleQuickCheckIn = (aptId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickCheckInId(aptId);
    quickUpdateMutation.mutate(
      { id: aptId, data: { status: "compareceu" } },
      {
        onSuccess: () => {
          setQuickCheckInId(null);
          refetch();
        },
        onError: () => {
          setQuickCheckInId(null);
          toast({ variant: "destructive", title: "Erro ao registrar chegada." });
        },
      },
    );
  };

  const handleBatchComplete = async () => {
    if (todayCompareceuIds.length === 0) return;
    setBatchCompleting(true);
    try {
      await Promise.all(
        todayCompareceuIds.map(
          (id) =>
            new Promise<void>((resolve) => {
              quickCompleteMutation.mutate(
                { id },
                { onSuccess: () => resolve(), onError: () => resolve() },
              );
            }),
        ),
      );
      const n = todayCompareceuIds.length;
      toast({ title: `${n} consulta${n !== 1 ? "s" : ""} concluída${n !== 1 ? "s" : ""}!` });
      refetch();
    } finally {
      setBatchCompleting(false);
    }
  };

  return {
    quickCheckInId,
    batchCompleting,
    handleQuickCheckIn,
    handleBatchComplete,
  };
}
