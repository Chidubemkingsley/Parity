import { HL_INFO } from "./env.js";

async function info<T>(body: unknown): Promise<T> {
  const r = await fetch(HL_INFO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HL info ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export interface HlCtx { coin: string; assetIndex: number; szDecimals: number; markPx: number; oraclePx: number; midPx: number | null; funding: number; openInterest: number; dayNtlVlm: number }

/** metaAndAssetCtxs for a HIP-3 dex (e.g. "xyz"). Shape is from memory of the docs; verify with a live call. */
export async function metaAndCtxs(dex: string): Promise<HlCtx[]> {
  const [meta, ctxs] = await info<[{ universe: { name: string; szDecimals: number }[] }, Record<string, string | null>[]]>({ type: "metaAndAssetCtxs", dex });
  return meta.universe.map((u, i) => ({
    coin: u.name, assetIndex: i, szDecimals: u.szDecimals,
    markPx: Number(ctxs[i].markPx), oraclePx: Number(ctxs[i].oraclePx),
    midPx: ctxs[i].midPx == null ? null : Number(ctxs[i].midPx),
    funding: Number(ctxs[i].funding), openInterest: Number(ctxs[i].openInterest), dayNtlVlm: Number(ctxs[i].dayNtlVlm),
  }));
}

export interface Book { bestBid: number; bestAsk: number; mid: number; halfSpreadBps: number; bidDepthUsd: number; askDepthUsd: number }
export async function l2(coin: string, levels = 5): Promise<Book> {
  const r = await info<{ levels: { px: string; sz: string }[][] }>({ type: "l2Book", coin });
  const [bids, asks] = r.levels;
  if (!bids?.length || !asks?.length) throw new Error(`empty book for ${coin}`);
  const bestBid = Number(bids[0].px), bestAsk = Number(asks[0].px), mid = (bestBid + bestAsk) / 2;
  const depth = (ls: { px: string; sz: string }[]) => ls.slice(0, levels).reduce((a, l) => a + Number(l.px) * Number(l.sz), 0);
  return { bestBid, bestAsk, mid, halfSpreadBps: ((bestAsk - bestBid) / 2 / mid) * 1e4, bidDepthUsd: depth(bids), askDepthUsd: depth(asks) };
}

/** HIP-3 asset id = 100000 + dexIndex*10000 + indexInMeta (from memory - VERIFY). */
export const hip3AssetId = (dexIndex: number, idx: number) => 100000 + dexIndex * 10000 + idx;
