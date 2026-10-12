/** Pure strategy math. No I/O. Prices in USD, edges in basis points. */

export interface CostInputs {
  poolFeeBps: number;      // Uniswap fee tier, per swap
  hlTakerBps: number;      // HIP-3 taker fee (assumed 9 bps - VERIFY)
  hlHalfSpreadBps: number; // crossing half the HL spread per HL order
  slippageBps?: number;    // extra pool price impact per swap
  gasUsd?: number;         // total gas for the round trip
  notionalUsd: number;
}

/** Positive = perp trades ABOVE the stock token, i.e. buy token / short perp captures convergence. */
export const basisBps = (tokenPx: number, perpPx: number) => ((perpPx - tokenPx) / tokenPx) * 1e4;

/** Round trip = open (swap + HL order) + close (swap + HL order). */
export function roundTripCostBps(c: CostInputs): number {
  const perSide = c.poolFeeBps + (c.slippageBps ?? 0) + c.hlTakerBps + c.hlHalfSpreadBps;
  const gas = c.notionalUsd > 0 ? ((c.gasUsd ?? 0) / c.notionalUsd) * 1e4 : 0;
  return perSide * 2 + gas;
}

/** Short perp earns funding when funding > 0 (longs pay shorts). `fundingPerHour` is a fraction (e.g. 0.0000125). */
export const fundingCarryBps = (fundingPerHour: number, hoursHeld: number) => fundingPerHour * hoursHeld * 1e4;

/** Net edge assuming the basis fully converges to zero by exit. */
export function netEdgeBps(basis: number, costs: CostInputs, carryBps = 0): number {
  return basis + carryBps - roundTripCostBps(costs);
}

/** Size = min(configured cap, fraction of pool depth, fraction of HL book depth). */
export function sizeNotionalUsd(args: { capUsd: number; poolDepthUsd: number; hlDepthUsd: number; poolFrac?: number; hlFrac?: number }): number {
  const pf = args.poolFrac ?? 0.02, hf = args.hlFrac ?? 0.25;
  return Math.max(0, Math.min(args.capUsd, args.poolDepthUsd * pf, args.hlDepthUsd * hf));
}

export interface Sample { ts: number; weekend: boolean; basisBps: number; netEdgeBps: number }
export const isWeekendUtc = (ts: number) => { const d = new Date(ts).getUTCDay(); return d === 0 || d === 6; };

const pct = (xs: number[], p: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export interface Summary { n: number; meanBasis: number; p90Basis: number; meanNet: number; p90Net: number; shareProfitable: number }
export function summarize(xs: Sample[]): Summary {
  const n = xs.length; if (!n) return { n: 0, meanBasis: NaN, p90Basis: NaN, meanNet: NaN, p90Net: NaN, shareProfitable: NaN };
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    n, meanBasis: mean(xs.map((x) => x.basisBps)), p90Basis: pct(xs.map((x) => x.basisBps), 0.9),
    meanNet: mean(xs.map((x) => x.netEdgeBps)), p90Net: pct(xs.map((x) => x.netEdgeBps), 0.9),
    shareProfitable: xs.filter((x) => x.netEdgeBps > 0).length / n,
  };
}

export type Verdict = "GO" | "PIVOT" | "INSUFFICIENT_DATA";
/** GO if >=25% of samples clear costs and the p90 net edge is positive. Tunable; honest by construction. */
export function verdict(s: Summary, minSamples = 30): Verdict {
  if (s.n < minSamples) return "INSUFFICIENT_DATA";
  return s.shareProfitable >= 0.25 && s.p90Net > 0 ? "GO" : "PIVOT";
}
