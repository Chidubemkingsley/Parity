# VERIFY ME — assumptions written from memory, never run

None of these could be tested: the build sandbox blocked outbound access to Hyperliquid and Robinhood Chain.

## Hyperliquid
- [ ] CoreWriter address `0x3333…3333` and `sendRawAction(bytes)`
- [ ] Encoding: 1-byte version `0x01` + 3-byte action id + `abi.encode(args)`
- [ ] Action ids: 1 limit order, 7 USD class transfer, 11 cancel by cloid
- [ ] Limit order arg order/types: `(uint32 asset,bool isBuy,uint64 limitPx,uint64 sz,bool reduceOnly,uint8 tif,uint128 cloid)`; tif 1=ALO 2=GTC 3=IOC; px/sz scaled 1e8
- [ ] `usdClassTransfer` amount scaling (assumed 1e6)
- [ ] markPx precompile `0x…0806`; raw = px × 10^(6−szDecimals); whether it works for HIP-3 markets (that's why `useMarkCheck` is per asset)
- [ ] HIP-3 asset id = `100000 + dexIndex×10000 + index` (set `HL_ASSET_ID` explicitly)
- [ ] `metaAndAssetCtxs` accepts `{dex:"xyz"}` and returns the shape `lib/hl.ts` expects
- [ ] l2Book coin name `xyz:TSLA`
- [ ] HIP-3 fees (assumed 0.03% maker / 0.09% taker)
- [ ] SDK order price/size formatting (5 significant figures, szDecimals); `@nktkas/hyperliquid` 0.33.x API
- [ ] HyperEVM chain id 999 / testnet 998

## Robinhood Chain
- [ ] Chain id 4663 (testnet 46630), RPC `rpc.mainnet.chain.robinhood.com`
- [ ] Stock Token addresses, decimals, pool existence
- [ ] Uniswap V3 factory/router addresses (unknown to me; `UNIV3_FACTORY`, `RH_ROUTER`)
- [ ] Router flavour (`ROUTER_KIND` 02 vs 01)
- [ ] Settlement token USDG address/decimals
- [ ] Blockscout `/api/v2/search` response shape

## Arbitrum
- [ ] Native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`

## Code known to be rough
- Pool depth proxy in keeper sizing is crude
- Exit swap uses `amountOutMinimum = 0`
- `pnl` journaled as 0; compute from fills before showing numbers
- Keeper has no persistence; a crash mid-trade leaves open legs
