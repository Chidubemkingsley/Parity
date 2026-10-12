# VERIFY ME — assumptions written from memory, never run

## Verified live on Oct 12, 2026 (see docs/TESTNET.md)
- [x] `metaAndAssetCtxs` accepts `{dex:"xyz"}` and returns the shape `lib/hl.ts` expects (mainnet AND testnet)
- [x] `xyz` HIP-3 dex exists with `xyz:TSLA/NVDA/AAPL/AMZN/COIN` (mainnet AND testnet); l2Book `xyz:TSLA` works
- [x] Robinhood mainnet chain id 4663, RPC live; testnet 46630, RPC live
- [x] Stock Token addresses (TSLA/NVDA/AAPL/AMZN) + USDG verified on-chain (name/symbol/decimals + V3 pools with liquidity)
- [x] Uniswap V3 factory `0x1f7d…2EfA` + SwapRouter02 `0xCaf6…5cb2` (official Uniswap docs); V4 PoolManager `0x8366…40951` verified source on testnet
- [x] Circle testnet USDC on Arbitrum Sepolia `0x75fa…AA4d` (6 dec, on-chain)
- [x] HyperEVM chain id 999 / testnet 998 (both simulated + broadcast on testnet)
- [x] EVM→Core USDC path = Circle CoreDepositWallet `0x0b80…5c206`, `deposit(uint256,uint32)` (selector verified); **BUT testnet crediting stuck — 41 USDC deposited, $0 credited after 40+ min**

## Still open
- [ ] CoreWriter address `0x3333…3333` and `sendRawAction(bytes)` (never exercised — hedger deployed on testnet, not yet driven)
- [ ] Encoding: 1-byte version `0x01` + 3-byte action id + `abi.encode(args)`
- [ ] Action ids: 1 limit order, 7 USD class transfer, 11 cancel by cloid
- [ ] Limit order arg order/types: `(uint32 asset,bool isBuy,uint64 limitPx,uint64 sz,bool reduceOnly,uint8 tif,uint128 cloid)`; tif 1=ALO 2=GTC 3=IOC; px/sz scaled 1e8
- [ ] `usdClassTransfer` amount scaling (assumed 1e6)
- [ ] markPx precompile `0x…0806`; raw = px × 10^(6−szDecimals); whether it works for HIP-3 markets (that's why `useMarkCheck` is per asset)
- [ ] HIP-3 asset id = `100000 + dexIndex×10000 + index` (set `HL_ASSET_ID` explicitly)
- [ ] HIP-3 fees (assumed 0.03% maker / 0.09% taker)
- [ ] SDK order price/size formatting (5 significant figures, szDecimals); `@nktkas/hyperliquid` 0.33.x API (testnet supported via `isTestnet`)
- [ ] Router flavour mainnet (`ROUTER_KIND` 02 vs 01) for live V3 swaps — dry-run only so far
- [ ] Blockscout `/api/v2/search` response shape (still Cloudflare-blocked; bypassed via GeckoTerminal + on-chain reads)

## Code known to be rough
- Pool depth proxy in keeper sizing is crude
- Exit swap uses `amountOutMinimum = 0` (V3 path; V4 testnet router enforces minOut)
- `pnl` journaled as 0; compute from fills before showing numbers
- Keeper has no persistence; a crash mid-trade leaves open legs
