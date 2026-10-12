/** Resolve Uniswap V3 pools for each stock token vs the quote token. env: UNIV3_FACTORY (Robinhood Chain), quote in pairs.json */
import { rhClient, factoryAbi, poolAbi } from "./lib/rh.ts";
import { loadPairs } from "./lib/env.ts";

const factory = process.env.UNIV3_FACTORY as `0x${string}` | undefined;
if (!factory) { console.error("Set UNIV3_FACTORY to the Uniswap V3 factory address on Robinhood Chain (look it up in Uniswap's deployments docs)."); process.exit(1); }
const cfg = loadPairs();
if (!cfg.quoteToken.address) { console.error("Fill quoteToken.address (USDG) in config/pairs.json"); process.exit(1); }

for (const p of cfg.pairs) {
  if (!p.stockToken) { console.log(`${p.symbol}: no stockToken set`); continue; }
  for (const fee of [100, 500, 3000, 10000]) {
    const pool = await rhClient.readContract({ address: factory, abi: factoryAbi, functionName: "getPool", args: [p.stockToken as `0x${string}`, cfg.quoteToken.address as `0x${string}`, fee] });
    if (/^0x0+$/.test(pool)) continue;
    const liq = await rhClient.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" });
    console.log(`${p.symbol} fee=${fee} pool=${pool} liquidity=${liq}`);
  }
}
