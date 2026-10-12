import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';

const HL_INFO_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_HL_INFO_URL ?? 'https://api.hyperliquid.xyz/info';

export type HyperliquidQueryResponse = {
  data: unknown;
  source: string;
  fetchedAt: number;
};

type HealthResponse = { status: string };

/** Backend health substitute: reports Hyperliquid public API reachability. */
export function useHealthCheck(opts?: {
  query?: Partial<UseQueryOptions<HealthResponse>>;
}) {
  return useQuery<HealthResponse>({
    queryKey: ['hl-health'],
    refetchInterval: 30000,
    retry: 1,
    ...opts?.query,
    queryFn: async () => {
      const r = await fetch(HL_INFO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'meta', dex: 'xyz' }),
      });
      if (!r.ok) throw new Error(`HL info ${r.status}`);
      await r.json();
      return { status: 'ok' };
    },
  });
}

export function useQueryHyperliquidMarket() {
  return useMutation<HyperliquidQueryResponse, Error, { data: unknown }>({
    mutationFn: async ({ data }) => {
      const r = await fetch(HL_INFO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`HL info ${r.status}`);
      return {
        data: (await r.json()) as unknown,
        source: 'HYPERLIQUID PUBLIC INFO',
        fetchedAt: Date.now(),
      };
    },
  });
}
