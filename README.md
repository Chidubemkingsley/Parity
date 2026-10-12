# Parity — Weekend Basis Vault

**One line:** a delta-neutral vault that buys a **Robinhood Chain Stock Token** and shorts the matching **Hyperliquid HIP-3 equity perp**, harvesting the price gap between two venues that price the same stock differently — most of all when US markets are closed.

Built for Colosseum's Crypto World's Fair (Arbitrum · Robinhood Chain · Hyperliquid tracks). **Testnet only. Contracts unaudited. Strategy unproven.**

> **Honest status (Oct 12, 2026).** Contracts compile and pass 22 Foundry tests, deploy cleanly to three testnets, and the keeper runs dry-run + a live spot round trip on Robinhood testnet. The strategy math has 10 unit tests. Weekday measurements on five real pairs came back **net-negative after costs** — the edge is unproven until `measure-gap` says GO, most plausibly on a weekend. Live Hyperliquid short leg is pending testnet Core funding (41 USDC stuck in a stalled testnet bridge backend). Read `docs/VERIFY_ME.md` before you put a cent anywhere near mainnet.

---

## Table of contents

1. [The trade](#the-trade)
2. [Repository layout](#repository-layout)
3. [Quick start](#quick-start)
4. [Testnet deployments](#testnet-deployments)
5. [Measuring the edge](#measuring-the-edge)
6. [Running the keeper](#running-the-keeper)
7. [Frontend](#frontend)
8. [Contracts](#contracts)
9. [What is verified vs open](#what-is-verified-vs-open)
10. [Known limitations](#known-limitations)
11. [Roadmap](#roadmap)
12. [Docs index](#docs-index)

---

## The trade

Two venues price the same stock 24/7 with no common anchor:

- **Robinhood Stock Tokens** (TSLA, NVDA, …) trade in thin Uniswap pools on Robinhood Chain. Mainnet TSLA/USDG 0.3% holds ~$1.5M — tradable, but thin enough to drift when the underlying market is shut.
- **Hyperliquid HIP-3 equity perps** (TradeXYZ `xyz:` markets) run their own 24/7 order books with funding.

Parity buys the token, shorts the same notional of the perp (delta-neutral), and profits from convergence plus funding minus costs:

```
basis_bps    = (perpMid − tokenPx) / tokenPx × 1e4        (>0 → buy token / short perp)
cost_bps     = 2 × (poolFee + slippage + HLtaker + HLhalfSpread) + gas/notional
net_edge_bps = basis + fundingCarry − cost
```

At typical numbers a round trip costs ~82 bps, so the basis must beat roughly 0.8% to profit. **Only one direction is traded** — negative basis (token rich) would need shorting the token, which isn't possible; it's logged, not traded. Exits fire at ≤10 bps convergence or after `MAX_HOLD_MIN` (default 720 min).

---

## Repository layout

```
contracts/          Foundry project — ParityVault (ERC-4626), PairRegistry,
                    HyperCoreHedger, HyperCore lib, tests, deploy scripts,
                    testnet mocks + V4 router
scripts/            TypeScript — measure-gap, discover-tokens, find-pools,
                    keeper, strategy math + tests, V4 testnet support
Parity-frontend/    Standalone Vite+React app — landing page, market monitor,
                    vault/registry reads, wallet connect (testnet)
docs/               ARCHITECTURE, STRATEGY, RISKS, RUNBOOK, DEMO_SCRIPT,
                    SUBMISSION, VERIFY_ME, TESTNET (deployed record)
setup.sh            Installs OpenZeppelin, forge-std, script deps
```

No shared backend exists; the frontend talks to public RPCs and the Hyperliquid public API directly.

---

## Quick start

Prerequisites: [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`), Node 22+, git.

```bash
./setup.sh                                  # OZ + forge-std + npm deps
cd contracts && forge build && forge test   # 22 tests (incl. 512-run fuzz)
cd ../scripts && npm test && npm run typecheck   # 10 strategy tests, clean tsc
cd ../Parity-frontend && npm install && npm run build  # standalone web app
```

Copy env templates before any live command (both are gitignored and stay local —
create `contracts/.env` and `scripts/.env` / `scripts/.env.testnet` with):

```bash
# contracts/.env:
#   ARB_RPC / HYPEREVM_RPC / RH_TESTNET_RPC, PRIVATE_KEY,
#   ASSET, ADMIN, KEEPER, GUARDIAN, EXECUTOR, FEE_RECIPIENT
# scripts/.env(.testnet):
#   RPCs, UNIV3_FACTORY, KEEPER_PK, HL_API_PK,
#   HL_ACCOUNT, HL_DEX_INDEX, HL_ASSET_ID
```

---

## Testnet deployments

Deployer/keeper: `0x90356CF97B3BF1749A604d3F89b3DF3602A459E3` (all roles, testnet only). Full record with tx hashes: `docs/TESTNET.md`.

| Contract | Chain | Address |
|---|---|---|
| ParityVault | Arbitrum Sepolia (421614) | `0xb0e660108571b4b191a14b0efdf8ea98d76fb5cc` |
| PairRegistry | Arbitrum Sepolia | `0xb0ff214f3575098966c1dbf66bd39dca9ddc0130` |
| Vault asset | Arbitrum Sepolia | Circle testnet USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| HyperCoreHedger | HyperEVM testnet (998) | `0xeeccd2bb5c0605f3eacdc4da221d9bdeda580d2f` |
| mUSDG / mTSLA | Robinhood testnet (46630) | `0xac0a…084e41e0` / `0xd441…fca5cf` |
| TestnetV4Router | Robinhood testnet | `0xdc26a92c69df6fd4aa0d2f64fdec549bc655b7f6` |
| mTSLA/mUSDG V4 pool | Robinhood testnet | poolId `0x10e156…90ef1a6` (fee 3000, ±15% around $378.97, ~$4k seeded) |

Frontend ABIs (`Parity-frontend/src/lib/abis.ts`) are generated from the compiled artifacts — **all 100 function selectors verified present in the live deployed bytecode**. Addresses live in `Parity-frontend/src/lib/addresses.ts`.

### Redeploying

```bash
cd contracts && source .env
forge script script/DeployArbitrum.s.sol --rpc-url $ARB_RPC --broadcast --private-key $PRIVATE_KEY
forge script script/DeployHyperEVM.s.sol --rpc-url $HYPEREVM_RPC --broadcast --private-key $PRIVATE_KEY
# then: registry.upsertPair(...) + hedger.configureAsset(...) as admin
```

Testnet mock market (Robinhood testnet only — mainnet has real tokens/V3 pools):

```bash
forge script script/DeployTestnetMocks.s.sol --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
# compute SQRT_PRICE_X96/TICK_LOWER/TICK_UPPER/LIQUIDITY/AMT0MAX/AMT1MAX, then:
PM=... MUSDG=... MTSLA=... ROUTER=... SQRT_PRICE_X96=... TICK_LOWER=... TICK_UPPER=... \
LIQUIDITY=... AMT0MAX=... AMT1MAX=... \
forge script script/InitTestnetPool.s.sol --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
```

---

## Measuring the edge

```bash
cd scripts
# 1) find tokens + pools, fill config/pairs.json (mainnet done; file committed)
npx tsx discover-tokens.ts TSLA NVDA
UNIV3_FACTORY=0x1f7d7550b1b028f7571e69a784071f0205fd2efa npx tsx find-pools.ts
# 2) measure the real gap — run over a weekend AND a weekday:
npx tsx measure-gap.ts --samples 120 --interval 30
# testnet plumbing pair:
source .env.testnet && npx tsx measure-gap.ts --samples 10 --interval 30
```

Verdict logic: **GO** if ≥25% of samples clear costs and p90 net edge is positive; **PIVOT** otherwise; **INSUFFICIENT_DATA** under 30 samples. If PIVOT, the honest pitch is the infrastructure plus measured findings — never a profit claim.

**Weekday snapshot (Oct 12, markets open)** — token vs xyz-perp, net of everything:

| Pair | Token | Perp | Basis (bps) | Net (bps) |
|---|---|---|---|---|
| TSLA | 382.413 | 382.840 | +11.2 | −67.6 |
| NVDA | 229.445 | 228.645 | −34.9 | −114.0 |
| AAPL | 336.961 | 337.515 | +16.5 | −64.4 |
| AMZN | 262.512 | 261.885 | −23.9 | −102.5 |
| COIN | 181.387 | 181.340 | −2.6 | −32.0 |

Weekday gaps don't clear ~82 bps costs — exactly what the thesis predicts. The edge, if it exists, lives on weekends. Full samples: `scripts/out/`.

---

## Running the keeper

```bash
cd scripts
npx tsx keeper.ts --pair TSLA            # DRY-RUN: reads prices, prints plan, spends nothing
# testnet plumbing pair (reads V4 pool + HL testnet):
source .env.testnet && npx tsx keeper.ts --pair mTSLA
```

Live (`--live`) sends real transactions — spot buy + perp short, monitoring, unwind, optional vault journaling. **Do not run live** until `docs/VERIFY_ME.md` is cleared, and then only at tiny size (≤$50). On testnet the full loop additionally needs a funded HL testnet account + approved API wallet (`HL_API_PK`, `HL_ACCOUNT`, `HL_DEX_INDEX`, `HL_ASSET_ID`).

Proven on testnet (real txs, Robinhood testnet): $5 mUSDG→mTSLA→mUSDG round trip cost exactly 2× the 0.3% pool fee (60 bps), no dust left. The short leg is pending testnet Core funding.

---

## Frontend

```bash
cd Parity-frontend && npm install && npm run typecheck && npm run build
PORT=5173 npm run dev     # or npm run serve for the production build
```

Standalone Vite+React (no monorepo needed). Landing page with live metrics, market monitor (Hyperliquid public API), vault/registry reads from testnet contracts, wallet connect (injected browser wallets, testnet chains preconfigured). Deposit/withdraw writes stay disabled by design. See `Parity-frontend/src/lib/addresses.ts` (verified deployments) and `src/lib/abis.ts` (generated ABIs).

---

## Contracts

- **ParityVault** (`contracts/src/ParityVault.sol`) — ERC-4626 USDC vault: deposit cap, guardian pause (blocks entries/deployment, never exits), keeper-attested NAV with freshness/change bounds and evidence hashes, high-water-mark performance fee, `sendToExecutor` / `recordRoundTrip` / `reportDeployed` / `returnCapital` capital flow with idle/deployed split.
- **PairRegistry** (`contracts/src/PairRegistry.sol`) — owner-managed pair configs (stock token, HL asset id, caps, min edge, enabled flag).
- **HyperCoreHedger** (`contracts/src/HyperCoreHedger.sol` + `libraries/HyperCore.sol`) — HyperEVM contract driving shorts through the HyperCore CoreWriter precompile, with notional caps, slippage bands, and per-asset mark-price checks. Deployed on testnet; **never driven live**.
- **Testnet support** (`contracts/src/testnet/`) — `MockToken` (open-mint ERC20) and `TestnetV4Router` (unlock-based V4 add-liquidity + exact-input swaps, built against the testnet PoolManager's reversed BalanceDelta layout — amount0 is the *upper* 128 bits).

---

## What is verified vs open

Verified live (see `docs/VERIFY_ME.md` for the full ledger): xyz HIP-3 dex + book shapes on mainnet and testnet, all five mainnet stock-token contracts and V3 pools, Uniswap V3 factory/router + V4 PoolManager (verified source; no `getSlot0` — price via `extsload`, `_pools` at slot 6), Circle testnet USDC, both HyperEVM chain ids, EVM→Core deposit selector, all deployed bytecode vs ABIs.

Still open: CoreWriter encoding/action ids, mark-price precompile for HIP-3, HIP-3 asset-id formula and fees, SDK price/size formatting, mainnet router flavour, NAV trust model, audit (none), weekend edge data.

---

## Known limitations

- Pool-depth sizing proxy is crude (`liquidity/1e6`); replace with tick-range math before real size.
- V3 keeper exit uses `amountOutMinimum = 0` (V4 testnet router enforces minOut).
- Vault `pnl` journals as 0 — compute from fills before showing numbers.
- Keeper has no persistence; a crash mid-trade leaves open legs.
- Robinhood/Blockscout APIs sit behind Cloudflare and rate-limit aggressively; scripts retry, space calls, and degrade per-pair instead of dying.
- Frontend has no wallet-write flows and no event indexing; position cost basis is not inferred.

---

## Roadmap

1. **Weekend measurement** — run the sampler over a real weekend; if p90 stays negative, the thesis is wrong and we'll say so.
2. **Full live loop on testnet** — pending Core funding: consolidate to xyz margin, agent wallet, dust-size loop with unwind + vault journal.
3. **Trust-minimized NAV** — proofs of positions instead of keeper attestation.
4. **Mainnet hardening** — audit, multisig roles, funding-aware sizing, more pairs. Real capital only after all of the above.

---

## Docs index

Start with `docs/STRATEGY.md` (why the edge should exist), then `docs/ARCHITECTURE.md` (on-chain vs off-chain, trust model), `docs/VERIFY_ME.md` (everything written from memory that must be checked), `docs/TESTNET.md` (deployed record with tx hashes), `docs/RUNBOOK.md` (operator commands), `docs/DEMO_SCRIPT.md` (3-minute demo), `docs/SUBMISSION.md` (pitch). Repo: https://github.com/Chidubemkingsley/Parity
