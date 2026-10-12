export interface RiskLimits { maxNotionalUsd: number; maxBasisBps: number; maxOpenPairs: number; minHlDepthMult: number }
export interface TradeCtx { notionalUsd: number; basisBps: number; netEdgeBps: number; minNetEdgeBps: number; hlDepthUsd: number; openPairs: number; tokenPxAgeSec: number; hlOracleDevBps: number }

/** Returns a list of blocking reasons; empty = OK. */
export function preTradeChecks(t: TradeCtx, l: RiskLimits): string[] {
  const r: string[] = [];
  if (t.notionalUsd <= 0) r.push("zero size");
  if (t.notionalUsd > l.maxNotionalUsd) r.push("notional above limit");
  if (t.netEdgeBps < t.minNetEdgeBps) r.push("net edge below minimum");
  // an enormous basis is more likely a stale/illiquid quote or halted market than free money
  if (Math.abs(t.basisBps) > l.maxBasisBps) r.push("basis implausibly large (stale quote?)");
  if (t.hlDepthUsd < t.notionalUsd * l.minHlDepthMult) r.push("HL book too thin");
  if (t.openPairs >= l.maxOpenPairs) r.push("max open pairs reached");
  if (t.tokenPxAgeSec > 30) r.push("token price stale");
  if (Math.abs(t.hlOracleDevBps) > 150) r.push("HL mark deviates from oracle");
  return r;
}
