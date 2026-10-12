# Architecture

```
 Depositors (USDC)                    Arbitrum One
      │  ERC-4626                    ┌──────────────────────────────┐
      ▼                              │ ParityVault  (pBASIS shares) │
 ┌──────────────┐  recordRoundTrip   │  idle USDC + attested NAV    │
 │ Keeper (bot) │───────────────────▶│  PairRegistry (enabled pairs)│
 └──────┬───────┘  reportDeployed    └──────────────┬───────────────┘
        │          sendToExecutor/returnCapital     │ USDC
        │                                           ▼
        │                                  Executor wallet (hot)
        ├── Robinhood Chain: swap USDG ⇄ Stock Token (Uniswap V3)
        └── Hyperliquid:     short/close HIP-3 "xyz:" perp
              (a) SDK + API wallet (default)   (b) HyperEVM HyperCoreHedger → CoreWriter
```

## On-chain components
- **ParityVault** — ERC-4626 over USDC, 3-decimal share offset (inflation-attack hardening). `totalAssets = idle + deployed`. Roles: KEEPER, GUARDIAN (pause only), admin (params, unpause, executor, fee recipient). Withdrawals are limited to idle liquidity and stay open while paused.
- **PairRegistry** — Ownable2Step allowlist of pairs: stock token, HL asset id, szDecimals, `maxNotional`, `minEdgeBps`, enabled flag.
- **HyperCoreHedger** (HyperEVM) — keeper-gated orders through CoreWriter with per-asset notional caps, optional mark-price slippage band, reduce-only closes, USD class-transfer cap. CoreWriter is **async and non-atomic**; the contract only emits intent.
- **HyperCore library** — action encoders (limit order = action 1, USD class transfer = 7, cancel by cloid = 11) and `markPx` reader.

## Trust model (be upfront with judges)
Deployed capital lives off-chain across two venues, so NAV is **keeper-attested**, not proven. Guardrails bound the damage:

| Guardrail | Default |
|---|---|
| Max NAV move per report | 5% of total assets |
| Min report interval | 60 s |
| Stale NAV (blocks deposits) | 24 h |
| Max deployable | 90% of total assets |
| Deposit cap | 10,000 USDC |
| Performance fee (HWM) | 10% (max 30%) |
| Pause | guardian; unpause admin-only |

Every report carries an `evidence` hash of the off-chain snapshot, and every round trip emits Robinhood Chain tx + Hyperliquid refs so anyone can audit it against the explorers.

## Known simplifications
- Capital is pre-positioned on both venues by the keeper; the vault does not bridge atomically.
- `recordRoundTrip.pnl` is informational; NAV changes only via `reportDeployed`.
- Fee mint happens only at reports.
