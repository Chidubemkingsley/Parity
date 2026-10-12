import { test } from "node:test";
import assert from "node:assert/strict";
import { basisBps, roundTripCostBps, netEdgeBps, sizeNotionalUsd, summarize, verdict, isWeekendUtc, fundingCarryBps } from "../strategy.ts";
import { sqrtPriceToPrice } from "../lib/rh.ts";
import { preTradeChecks } from "../risk.ts";

const costs = { poolFeeBps: 30, hlTakerBps: 9, hlHalfSpreadBps: 2, notionalUsd: 1000, gasUsd: 0 };

test("basis sign and size", () => {
  assert.equal(Math.round(basisBps(100, 101)), 100);
  assert.ok(basisBps(101, 100) < 0);
});
test("round trip cost", () => assert.equal(roundTripCostBps(costs), (30 + 9 + 2) * 2));
test("gas folds into cost", () => assert.equal(roundTripCostBps({ ...costs, gasUsd: 1 }), 82 + 10));
test("net edge", () => assert.equal(netEdgeBps(100, costs), 18));
test("funding carry", () => assert.ok(Math.abs(fundingCarryBps(0.0000125, 24) - 3) < 1e-9));
test("sizing is the min of limits", () => {
  assert.equal(sizeNotionalUsd({ capUsd: 500, poolDepthUsd: 1e6, hlDepthUsd: 1e6 }), 500);
  assert.equal(sizeNotionalUsd({ capUsd: 500, poolDepthUsd: 10_000, hlDepthUsd: 1e6 }), 200);
  assert.equal(sizeNotionalUsd({ capUsd: 500, poolDepthUsd: 1e6, hlDepthUsd: 400 }), 100);
});
test("weekend detection (UTC)", () => {
  assert.equal(isWeekendUtc(Date.UTC(2026, 9, 11, 12)), true);  // Sun
  assert.equal(isWeekendUtc(Date.UTC(2026, 9, 13, 12)), false); // Tue
});
test("verdict", () => {
  const mk = (net: number) => Array.from({ length: 40 }, (_, i) => ({ ts: i, weekend: true, basisBps: net + 82, netEdgeBps: net }));
  assert.equal(verdict(summarize(mk(10))), "GO");
  assert.equal(verdict(summarize(mk(-10))), "PIVOT");
  assert.equal(verdict(summarize(mk(10).slice(0, 5))), "INSUFFICIENT_DATA");
});
test("sqrtPrice -> price", () => {
  // price token1/token0 = 4 with equal decimals -> sqrt = 2 * 2^96
  assert.ok(Math.abs(sqrtPriceToPrice(2n * 2n ** 96n, 18, 18) - 4) < 1e-9);
  // 18 vs 6 decimals scaling
  assert.ok(Math.abs(sqrtPriceToPrice(2n ** 96n, 18, 6) - 1e12) < 1);
});
test("risk checks", () => {
  const ok = { notionalUsd: 100, basisBps: 80, netEdgeBps: 30, minNetEdgeBps: 20, hlDepthUsd: 1000, openPairs: 0, tokenPxAgeSec: 1, hlOracleDevBps: 5 };
  const lim = { maxNotionalUsd: 500, maxBasisBps: 500, maxOpenPairs: 2, minHlDepthMult: 3 };
  assert.deepEqual(preTradeChecks(ok, lim), []);
  assert.ok(preTradeChecks({ ...ok, basisBps: 900 }, lim).length > 0);
  assert.ok(preTradeChecks({ ...ok, hlDepthUsd: 100 }, lim).length > 0);
});
