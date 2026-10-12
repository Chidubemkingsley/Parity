# Submission draft

**Name:** Parity
**Tracks:** Arbitrum, Robinhood Chain, Hyperliquid
**Tagline:** The weekend basis vault for tokenized stocks.

## Problem
Tokenized stocks trade 24/7 but fair-value discovery doesn't. Robinhood Stock Tokens sit in thin pools; Hyperliquid HIP-3 equity perps set their own weekend prices. Nobody systematically harvests the gap, and nobody publishes the real numbers.

## Solution
An ERC-4626 vault on Arbitrum funding a delta-neutral long-token / short-perp basis trade across Robinhood Chain and Hyperliquid, with a measurement tool that says GO or PIVOT from live data, guard-railed attested NAV, a pair registry, an on-chain journal of every round trip, and an optional HyperEVM CoreWriter hedger.

## What works today
- Vault, registry, hedger: compiled, 22 tests passing (incl. fuzz)
- Strategy math + risk checks: unit-tested
- Scripts: token discovery, pool discovery, gap measurement, dry-run keeper

## What is not proven
- The edge: depends on `measure-gap` results
- Live execution paths: written offline, to be verified (see VERIFY_ME)
- NAV is keeper-attested, not trustless

## Why it fits
Arbitrum: the vault + settlement. Robinhood Chain: the tokenized-stock leg. Hyperliquid: the HIP-3 hedge and CoreWriter path.

## Links
Repo: TODO · Demo video: TODO · Deployed addresses: TODO
