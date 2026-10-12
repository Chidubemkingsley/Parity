# 3-minute demo

**0:00 — Hook.** "US stocks sleep on weekends. Robinhood Stock Tokens and Hyperliquid equity perps don't — and they disagree. Parity gets paid for that disagreement."

**0:25 — Live gap.** Run `measure-gap` (pre-recorded run is fine if live is flaky). Show a table of token price vs perp price vs basis vs net-of-cost edge, per ticker.

**1:00 — Honest verdict.** Show the GO/PIVOT output. Say the weekday numbers out loud, including the bad ones. Judges trust a team that shows the cost stack.

**1:30 — The vault.** Arbitrum explorer: ParityVault, deposit, `sendToExecutor`, `reportDeployed` with evidence hash. Explain the guardrails in one breath.

**2:00 — One real round trip.** Tiny size: Robinhood Chain swap tx, Hyperliquid short, unwind, `RoundTripRecorded` event linking both. Say "this is plumbing proof, not a profit claim."

**2:40 — Roadmap.** Trust-minimised NAV (proof of positions), more pairs, funding-aware sizing, HyperEVM hedger as the on-chain control path.

**2:55 — Ask.** One line: the stack that makes 24/7 tokenized stocks arbitrageable.

Fallback if the live leg fails: show the dry-run keeper output plus the recorded measure-gap data. Never fake a fill.
