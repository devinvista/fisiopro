import { QueryClient } from "@tanstack/react-query";

export const STALE_TIMES = {
  realtime: 0,
  short: 30_000,
  default: 60_000,
  long: 10 * 60_000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: STALE_TIMES.default,
      gcTime: 5 * 60_000,
    },
  },
});
