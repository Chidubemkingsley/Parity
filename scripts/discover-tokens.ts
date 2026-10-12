/** Find Robinhood Chain Stock Token contracts via Blockscout search:  tsx discover-tokens.ts TSLA NVDA AAPL */
import { BLOCKSCOUT } from "./lib/env.ts";

const tickers = process.argv.slice(2);
if (!tickers.length) { console.error("usage: tsx discover-tokens.ts TICKER [TICKER...]"); process.exit(1); }

for (const t of tickers) {
  const r = await fetch(`${BLOCKSCOUT}/api/v2/search?q=${encodeURIComponent(t)}`);
  if (!r.ok) { console.error(t, "HTTP", r.status); continue; }
  const j = (await r.json()) as { items?: { type: string; name?: string; symbol?: string; address_hash?: string; address?: string }[] };
  const hits = (j.items ?? []).filter((x) => x.type === "token");
  console.log(`\n== ${t} ==`);
  for (const h of hits.slice(0, 8)) console.log(`${(h.symbol ?? "").padEnd(10)} ${(h.name ?? "").padEnd(34)} ${h.address_hash ?? h.address}`);
  if (!hits.length) console.log("(no token hits)");
}
console.log("\nCopy the right addresses into config/pairs.json (stockToken). Check the contract + issuer on the explorer first.");
