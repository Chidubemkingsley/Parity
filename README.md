# Parity — Weekend Basis Vault

**One line:** a delta-neutral vault that buys a **Robinhood Chain Stock Token** and shorts the matching **Hyperliquid HIP-3 equity perp**, earning the price gap between two venues that price the same stock differently — most of all when US markets are closed.

Built for Colosseum's Crypto World's Fair (Arbitrum · Robinhood Chain · Hyperliquid tracks). Deadline: **11:59pm PT, Oct 12, 2026** (= 07:59 Tue Oct 13 Lagos).

> **Honest status.** Contracts compile and pass 22 Foundry tests. The strategy math has 10 unit tests. The **live network paths** (Hyperliquid API/SDK order flow, Robinhood Chain swap, HyperCore CoreWriter encoding, precompile addresses) were written without network access and have **never been run**. Read `docs/VERIFY_ME.md` before you put a cent in. The edge itself is **unproven until `measure-gap` says GO**.

## Layout
```
contracts/   Foundry project (ParityVault, PairRegistry, HyperCoreHedger, HyperCore lib, tests, deploy scripts)
scripts/     TypeScript: measure-gap, discover-tokens, find-pools, keeper, strategy math + tests
docs/        ARCHITECTURE, STRATEGY, RISKS, RUNBOOK, DEMO_SCRIPT, SUBMISSION, VERIFY_ME
setup.sh     installs OpenZeppelin, forge-std, script deps
```
No frontend is included (by request).

## Quick start
```bash
./setup.sh
cd contracts && forge test            # 22 tests
cd ../scripts && npm test && npm run typecheck
# 1) find tokens + pools, fill config/pairs.json
npx tsx discover-tokens.ts TSLA NVDA
UNIV3_FACTORY=0x... npx tsx find-pools.ts
# 2) measure the real gap (run over a weekend AND a weekday)
npx tsx measure-gap.ts --samples 120 --interval 30
# 3) dry-run the keeper (default), live only on tiny size
npx tsx keeper.ts --pair TSLA
```

## Where to start reading
1. `docs/STRATEGY.md` — why the edge should exist and how it's measured
2. `docs/ARCHITECTURE.md` — what's on-chain vs off-chain, and the trust model
3. `docs/VERIFY_ME.md` — everything I wrote from memory that you must check
4. `docs/SUBMISSION.md` / `docs/DEMO_SCRIPT.md` — pitch + 3-minute demo
