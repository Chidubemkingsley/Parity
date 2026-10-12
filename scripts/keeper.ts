/**
 * Parity keeper. DRY-RUN by default: reads prices, computes edge, prints the plan. `--live` sends transactions.
 *   tsx keeper.ts --pair TSLA            # dry run, one evaluation loop
 *   tsx keeper.ts --pair TSLA --live     # real swap + real HL short (needs env below)
 *
 * LIVE env: KEEPER_PK (Robinhood Chain wallet holding quote token + stock token approvals),
 *   HL_API_PK (Hyperliquid API/agent wallet), HL_ACCOUNT (HL main account address),
 *   RH_ROUTER (Uniswap SwapRouter address on Robinhood Chain), ROUTER_KIND=02|01,
 *   ARB_RPC + VAULT (optional, to journal the round trip via recordRoundTrip)
 *
 * WARNING: the live path was NOT exercised in the sandbox this was written in (network allowlist blocked
 * both venues). Run it on tiny size first. See docs/RUNBOOK.md and docs/VERIFY_ME.md.
 */
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { arg, flag, loadPairs, sleep, RH_RPC } from "./lib/env.ts";
import { l2, metaAndCtxs, hip3AssetId } from "./lib/hl.ts";
import { rhClient, rhChain, stockPriceUsd, erc20Abi } from "./lib/rh.ts";
import { basisBps, netEdgeBps, fundingCarryBps, sizeNotionalUsd } from "./strategy.ts";
import { preTradeChecks, type RiskLimits } from "./risk.ts";

const live = flag("live");
const cfg = loadPairs();
const symbol = arg("pair", "TSLA")!;
const pair = cfg.pairs.find((p) => p.symbol === symbol);
if (!pair) throw new Error(`unknown pair ${symbol}`);
if (!pair.pool || !pair.stockToken || !cfg.quoteToken.address) throw new Error("fill stockToken, pool, quoteToken in config/pairs.json (discover-tokens / find-pools)");

const limits: RiskLimits = { maxNotionalUsd: pair.maxNotionalUsd, maxBasisBps: 500, maxOpenPairs: 2, minHlDepthMult: 3 };
const HL_TAKER_BPS = Number(process.env.HL_TAKER_BPS ?? 9);
const EXIT_BASIS_BPS = Number(process.env.EXIT_BASIS_BPS ?? 10);
const MAX_HOLD_MIN = Number(process.env.MAX_HOLD_MIN ?? 720);
const POLL_SEC = Number(process.env.POLL_SEC ?? 20);
const SLIP_BPS = 50;

const routerAbi02 = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"]);
const routerAbi01 = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"]);
const vaultAbi = parseAbi(["function recordRoundTrip((bytes32 pairId,uint128 notional,int128 pnl,int32 entryEdgeBps,bytes32 rhTx,bytes32 hlRef,uint64 openedAt,uint64 closedAt) rt)"]);

async function snapshot() {
  const [q, book, ctxs] = await Promise.all([
    stockPriceUsd(pair!.pool as Address, pair!.stockToken as Address, pair!.stockDecimals, cfg.quoteToken.decimals),
    l2(pair!.hlCoin), metaAndCtxs(cfg.hlDex),
  ]);
  const ctx = ctxs.find((c) => c.coin === pair!.hlCoin);
  if (!ctx) throw new Error(`${pair!.hlCoin} not in ${cfg.hlDex} meta`);
  const b = basisBps(q.priceUsd, book.mid);
  const poolDepthUsd = Number(q.liquidity) / 1e6; // crude proxy; refine with tick math for real sizing
  return { q, book, ctx, b, poolDepthUsd };
}

async function swap(pk: Hex, tokenIn: Address, tokenOut: Address, amountIn: bigint, minOut: bigint): Promise<Hex> {
  const router = process.env.RH_ROUTER as Address; if (!router) throw new Error("RH_ROUTER not set");
  const acct = privateKeyToAccount(pk);
  const wc = createWalletClient({ account: acct, chain: rhChain, transport: http(RH_RPC) });
  const allowance = await rhClient.readContract({ address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [acct.address, router] });
  if (allowance < amountIn) {
    const h = await wc.writeContract({ address: tokenIn, abi: erc20Abi, functionName: "approve", args: [router, amountIn] });
    await rhClient.waitForTransactionReceipt({ hash: h });
  }
  const fee = pair!.poolFeeBps * 100;
  const hash = process.env.ROUTER_KIND === "01"
    ? await wc.writeContract({ address: router, abi: routerAbi01, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee, recipient: acct.address, deadline: BigInt(Math.floor(Date.now() / 1000) + 120), amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] })
    : await wc.writeContract({ address: router, abi: routerAbi02, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee, recipient: acct.address, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] });
  const rc = await rhClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`swap reverted ${hash}`);
  return hash;
}

function roundDown(x: number, dec: number) { const m = 10 ** dec; return Math.floor(x * m) / m; }

async function hlOrder(isBuy: boolean, reduceOnly: boolean, px: number, sz: number, assetId: number) {
  const ex = new ExchangeClient({ transport: new HttpTransport(), wallet: privateKeyToAccount(process.env.HL_API_PK as Hex) });
  // Marketable IOC limit order. Price/size formatting rules are strict on HL (5 sig figs, szDecimals) - VERIFY on testnet.
  return ex.order({ orders: [{ a: assetId, b: isBuy, p: px.toPrecision(5), s: String(sz), r: reduceOnly, t: { limit: { tif: "Ioc" } } }], grouping: "na" });
}

async function main() {
  const s0 = await snapshot();
  const carry = fundingCarryBps(s0.ctx.funding, MAX_HOLD_MIN / 60);
  const size = sizeNotionalUsd({ capUsd: pair!.maxNotionalUsd, poolDepthUsd: s0.poolDepthUsd, hlDepthUsd: Math.min(s0.book.bidDepthUsd, s0.book.askDepthUsd) });
  const net = netEdgeBps(s0.b, { poolFeeBps: pair!.poolFeeBps, hlTakerBps: HL_TAKER_BPS, hlHalfSpreadBps: s0.book.halfSpreadBps, gasUsd: 0.05, notionalUsd: size }, carry);
  const oracleDev = ((s0.ctx.markPx - s0.ctx.oraclePx) / s0.ctx.oraclePx) * 1e4;
  const blockers = preTradeChecks({ notionalUsd: size, basisBps: s0.b, netEdgeBps: net, minNetEdgeBps: pair!.minNetEdgeBps, hlDepthUsd: s0.book.bidDepthUsd, openPairs: 0, tokenPxAgeSec: 0, hlOracleDevBps: oracleDev }, limits);

  console.log(JSON.stringify({ mode: live ? "LIVE" : "DRY-RUN", pair: symbol, tokenPx: s0.q.priceUsd, perpMid: s0.book.mid, basisBps: +s0.b.toFixed(2), carryBps: +carry.toFixed(2), netEdgeBps: +net.toFixed(2), sizeUsd: +size.toFixed(2), blockers }, null, 2));
  if (blockers.length) { console.log("No trade."); return; }
  if (!live) { console.log(`DRY-RUN: would buy ~$${size.toFixed(0)} ${symbol} token on Robinhood Chain and short the same notional of ${pair!.hlCoin}.`); return; }

  const rhPk = process.env.KEEPER_PK as Hex; if (!rhPk || !process.env.HL_API_PK) throw new Error("KEEPER_PK and HL_API_PK required for --live");
  const quote = cfg.quoteToken.address as Address, stock = pair!.stockToken as Address;
  const keeperAddr = privateKeyToAccount(rhPk).address;
  const openedAt = Math.floor(Date.now() / 1000);

  // 1) buy token
  const amtIn = parseUnits(size.toFixed(cfg.quoteToken.decimals), cfg.quoteToken.decimals);
  const expectTok = size / s0.q.priceUsd;
  const minOut = parseUnits((expectTok * (1 - SLIP_BPS / 1e4)).toFixed(pair!.stockDecimals > 8 ? 8 : pair!.stockDecimals), pair!.stockDecimals);
  const balBefore = await rhClient.readContract({ address: stock, abi: erc20Abi, functionName: "balanceOf", args: [keeperAddr] });
  const rhOpen = await swap(rhPk, quote, stock, amtIn, minOut);
  const balAfter = await rhClient.readContract({ address: stock, abi: erc20Abi, functionName: "balanceOf", args: [keeperAddr] });
  const got = balAfter - balBefore;
  const tokensHeld = Number(formatUnits(got, pair!.stockDecimals));
  console.log("bought", tokensHeld, "tx", rhOpen);

  // 2) short the same quantity on HL (assetId: set via HL_ASSET_ID env after checking meta, formula is from memory)
  const assetId = Number(process.env.HL_ASSET_ID ?? hip3AssetId(Number(process.env.HL_DEX_INDEX ?? 0), s0.ctx.assetIndex));
  const sz = roundDown(tokensHeld, s0.ctx.szDecimals);
  const entryHl = s0.book.bestBid * (1 - SLIP_BPS / 1e4);
  const shortRes = await hlOrder(false, false, entryHl, sz, assetId);
  console.log("HL short", JSON.stringify(shortRes));

  // 3) wait for convergence / timeout, then unwind
  const deadline = Date.now() + MAX_HOLD_MIN * 60_000;
  let exitReason = "timeout";
  while (Date.now() < deadline) {
    await sleep(POLL_SEC * 1000);
    const s = await snapshot();
    if (s.b <= EXIT_BASIS_BPS) { exitReason = "converged"; break; }
  }
  const sEnd = await snapshot();
  const rhClose = await swap(rhPk, stock, quote, got, 0n); // minOut=0 on exit: unwinding matters more; tighten with a quote in production
  const closeRes = await hlOrder(true, true, sEnd.book.bestAsk * (1 + SLIP_BPS / 1e4), sz, assetId);
  console.log("closed:", exitReason, rhClose, JSON.stringify(closeRes));

  // 4) journal on the vault (optional)
  if (process.env.ARB_RPC && process.env.VAULT) {
    const acct = privateKeyToAccount(rhPk);
    const wc = createWalletClient({ account: acct, chain: arbitrum, transport: http(process.env.ARB_RPC) });
    const pub = createPublicClient({ chain: arbitrum, transport: http(process.env.ARB_RPC) });
    const pnlUsd = 0; // compute from balances/fills in production; left explicit so nobody mistakes it for a measured number
    const h = await wc.writeContract({ address: process.env.VAULT as Address, abi: vaultAbi, functionName: "recordRoundTrip", args: [{ pairId: keccak256(toHex(symbol)), notional: parseUnits(size.toFixed(6), 6), pnl: BigInt(pnlUsd), entryEdgeBps: Math.round(s0.b), rhTx: rhOpen, hlRef: keccak256(toHex(JSON.stringify(shortRes))), openedAt: BigInt(openedAt), closedAt: BigInt(Math.floor(Date.now() / 1000)) }] });
    await pub.waitForTransactionReceipt({ hash: h });
    console.log("journaled on vault", h);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
