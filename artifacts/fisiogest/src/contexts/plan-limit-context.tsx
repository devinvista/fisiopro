import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlanLimitError, type PlanLimitInfo } from "@/lib/api";
import { PlanLimitDialog } from "@/components/feedback/plan-limit-dialog";

interface PlanLimitContextType {
  /** Abre o diálogo manualmente (ex.: ao calcular limite no cliente). */
  show: (info: PlanLimitInfo) => void;
  /** Fecha o diálogo. */
  dismiss: () => void;
}

const PlanLimitContext = createContext<PlanLimitContextType | undefined>(undefined);

/**
 * Provider que captura `PlanLimitError` lançado por `apiFetchJson` em qualquer
 * mutation do react-query e abre o diálogo contextual de upgrade. Também
 * expõe `show()` para chamadores que detectam o limite no cliente (ex.:
 * pré-validação em formulários).
 */
export function PlanLimitProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<PlanLimitInfo | null>(null);
  const queryClient = useQueryClient();

  const show = useCallback((next: PlanLimitInfo) => setInfo(next), []);
  const dismiss = useCallback(() => setInfo(null), []);

  // Subscribe ao MutationCache para interceptar PlanLimitError sem precisar
  // que cada mutation trate `onError` individualmente.
  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const error = event.mutation.state.error;
      if (error instanceof PlanLimitError) {
        setInfo(error.info);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const value = useMemo<PlanLimitContextType>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <PlanLimitContext.Provider value={value}>
      {children}
      <PlanLimitDialog info={info} onClose={dismiss} />
    </PlanLimitContext.Provider>
  );
}

export function usePlanLimit(): PlanLimitContextType {
  const ctx = useContext(PlanLimitContext);
  if (!ctx) throw new Error("usePlanLimit must be used within a PlanLimitProvider");
  return ctx;
}
