# Runbook

## 0. Setup
`./setup.sh`, then fill `.env` values (never commit keys).

## 1. Discovery
```bash
cd scripts
npx tsx discover-tokens.ts TSLA NVDA AAPL AMZN COIN   # copy stockToken addresses into config/pairs.json
UNIV3_FACTORY=0x... npx tsx find-pools.ts              # copy pool + fee into config/pairs.json
```
Set `quoteToken.address` (USDG) first. Confirm token contracts on the explorer.

## 2. Measure
```bash
npx tsx measure-gap.ts --samples 120 --interval 30
```
Look at `out/gap-*.json`. If verdict is PIVOT for all pairs, stop and tell the truth in the pitch.

## 3. Deploy (testnet first)
```bash
cd contracts
ASSET=0x... ADMIN=0x... KEEPER=0x... GUARDIAN=0x... EXECUTOR=0x... FEE_RECIPIENT=0x... \
  forge script script/DeployArbitrum.s.sol --rpc-url $ARB_RPC --broadcast
ADMIN=0x... KEEPER=0x... forge script script/DeployHyperEVM.s.sol --rpc-url $HYPEREVM_RPC --broadcast
```
Then as admin: `registry.upsertPair(...)` for each pair and `hedger.configureAsset(...)`.

## 4. Keeper
Dry run: `npx tsx keeper.ts --pair TSLA`. Live only after VERIFY_ME is cleared, with ≤ $50 notional:
`KEEPER_PK=… HL_API_PK=… HL_ACCOUNT=… RH_ROUTER=… HL_ASSET_ID=… npx tsx keeper.ts --pair TSLA --live`

## 5. Emergency
Guardian: `vault.pause()`. Keeper: close HL short (reduce-only) and swap token back, then `returnCapital`.
