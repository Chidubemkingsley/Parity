/**
 * Measure the Stock-Token vs HIP-3 perp basis and decide GO / PIVOT with real numbers.
 *   tsx measure-gap.ts --samples 120 --interval 30
 * Writes out/gap-<ts>.csv and out/gap-<ts>.json. Run it over a weekend AND a weekday for the real answer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, arg, loadPairs, sleep } from "./lib/env.ts";
import { l2, metaAndCtxs } from "./lib/hl.ts";
import { stockPriceUsd } from "./lib/rh.ts";
import { v4PriceUsd, buildV4Key } from "./lib/rhV4.ts";
import { basisBps, netEdgeBps, fundingCarryBps, isWeekendUtc, summarize, verdict, type Sample } from "./strategy.ts";

const HL_TAKER_BPS = Number(process.env.HL_TAKER_BPS ?? 9);
const GAS_USD = Number(process.env.GAS_USD ?? 0.05);
const HOLD_HOURS = Number(process.env.HOLD_HOURS ?? 12);

const cfg = loadPairs();
const samples = Number(arg("samples", "60"));
const interval = Number(arg("interval", "30")) * 1000;
const rows: string[] = ["ts,symbol,weekend,tokenPx,perpMid,perpMark,perpOracle,basisBps,fundingHr,netEdgeBps,hlHalfSpreadBps"];
const bySym: Record<string, Sample[]> = {};

for (let i = 0; i < samples; i++) {
  const ts = Date.now();
  let ctxs: Awaited<ReturnType<typeof metaAndCtxs>> = [];
  try { ctxs = await metaAndCtxs(cfg.hlDex); } catch (e) { console.error("HL meta failed:", (e as Error).message); }
  for (const p of cfg.pairs) {
    try {
      const ctx = ctxs.find((c) => c.coin === p.hlCoin);
      const book = await l2(p.hlCoin);
      let tokenPx = NaN;
      if (p.poolKind === "v4" && p.v4 && p.stockToken) {
        tokenPx = (await v4PriceUsd(p.v4.pm as `0x${string}`, buildV4Key(cfg.quoteToken.address, p.stockToken, p.v4), cfg.quoteToken.decimals, p.stockDecimals)).priceUsd;
      } else if (p.pool && p.stockToken) tokenPx = (await stockPriceUsd(p.pool as `0x${string}`, p.stockToken as `0x${string}`, p.stockDecimals, cfg.quoteToken.decimals)).priceUsd;
      const b = basisBps(tokenPx, book.mid);
      const carry = ctx ? fundingCarryBps(ctx.funding, HOLD_HOURS) : 0;
      const net = netEdgeBps(b, { poolFeeBps: p.poolFeeBps, hlTakerBps: HL_TAKER_BPS, hlHalfSpreadBps: book.halfSpreadBps, gasUsd: GAS_USD, notionalUsd: p.maxNotionalUsd }, carry);
      const wk = isWeekendUtc(ts);
      rows.push([ts, p.symbol, wk, tokenPx, book.mid, ctx?.markPx ?? "", ctx?.oraclePx ?? "", b.toFixed(2), ctx?.funding ?? "", net.toFixed(2), book.halfSpreadBps.toFixed(2)].join(","));
      if (Number.isFinite(b)) (bySym[p.symbol] ??= []).push({ ts, weekend: wk, basisBps: b, netEdgeBps: net });
      console.log(`${new Date(ts).toISOString()} ${p.symbol.padEnd(5)} token=${tokenPx.toFixed(3)} perp=${book.mid.toFixed(3)} basis=${b.toFixed(1)}bps net=${net.toFixed(1)}bps`);
    } catch (e) { console.error(`${p.symbol}:`, (e as Error).message); }
  }
  if (i < samples - 1) await sleep(interval);
}

const report: Record<string, unknown> = {};
for (const [sym, xs] of Object.entries(bySym)) {
  const wk = summarize(xs.filter((x) => x.weekend)), wd = summarize(xs.filter((x) => !x.weekend)), all = summarize(xs);
  report[sym] = { all, weekend: wk, weekday: wd, verdict: verdict(all) };
  console.log(`\n${sym}: ${verdict(all)}  profitable=${(all.shareProfitable * 100).toFixed(0)}%  meanNet=${all.meanNet.toFixed(1)}bps  p90Net=${all.p90Net.toFixed(1)}bps  (n=${all.n})`);
}
mkdirSync(join(ROOT, "out"), { recursive: true });
const stamp = Date.now();
writeFileSync(join(ROOT, "out", `gap-${stamp}.csv`), rows.join("\n"));
writeFileSync(join(ROOT, "out", `gap-${stamp}.json`), JSON.stringify(report, null, 2));
console.log(`\nWrote out/gap-${stamp}.{csv,json}`);
