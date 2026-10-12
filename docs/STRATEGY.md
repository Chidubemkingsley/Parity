# Strategy

## The trade
Buy the Stock Token on Robinhood Chain; short the same notional of the HIP-3 equity perp on Hyperliquid. Price exposure cancels (delta-neutral). Profit = basis convergence + funding − costs.

## Why an edge might exist (hypothesis — measure it)
- Robinhood Stock Tokens trade 24/7 in **thin, fragmented** pools, so price can drift from fair value.
- HIP-3 equity perps (TradeXYZ `xyz:` markets) also trade 24/7 and set a **weekend price** when the underlying market is shut.
- Two thin venues + no external anchor on weekends → gaps. After-hours is the most likely window.

## Formula
```
basis_bps    = (perpMid − tokenPx) / tokenPx × 1e4         (>0 → buy token / short perp)
cost_bps     = 2 × (poolFee + slippage + HLtaker + HLhalfSpread) + gas/notional
net_edge_bps = basis + fundingCarry − cost
```
Defaults: pool fee 30 bps, HL taker 9 bps (**verify**), half-spread measured live. At those numbers a round trip costs ~82 bps, so the basis must beat roughly 0.8% to profit. Many weekday gaps won't. **That is the point of `measure-gap`.**

## Only one direction
Negative basis (token rich) would need shorting the token, which we can't. It is logged, not traded.

## Decision rule
`measure-gap.ts` outputs GO if ≥25% of samples clear costs and the p90 net edge is positive; PIVOT otherwise; INSUFFICIENT_DATA under 30 samples. If PIVOT, do not claim profit — pitch the infrastructure and the measured findings.

## Sizing
`min(pair cap, 2% of pool depth proxy, 25% of HL book depth)`. The pool-depth proxy is crude (`liquidity/1e6`); replace with tick-range math before real size.

## Exit
Close when basis ≤ 10 bps or after `MAX_HOLD_MIN` (default 720 min), whichever first.
