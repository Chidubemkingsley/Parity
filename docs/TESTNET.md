# Testnet record (Oct 12, 2026)

Deployer/keeper: `0x90356CF97B3BF1749A604d3F89b3DF3602A459E3` (all roles).

## Arbitrum Sepolia (421614)
- `ParityVault` `0xb0e660108571b4b191a14b0efdf8ea98d76fb5cc` — tx `0x186f5cf31e96ba9a346ffa4b13f737e28a442261ed1a4ce9e1b3e6c40e33873e`
- `PairRegistry` `0xb0ff214f3575098966c1dbf66bd39dca9ddc0130` — tx `0xf716afd9b9dfc11e61b0a32b2f5a3542c3a688b51d9a23d904e1155246a3956c`
- Asset: Circle testnet USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (verified on-chain: 6 dec)
- Explorer: https://sepolia.arbiscan.io/

## HyperEVM testnet (998)
- `HyperCoreHedger` `0xeeccd2bb5c0605f3eacdc4da221d9bdeda580d2f` — tx `0xb563391075a281bcc3bdc404985c4e56724248ef074d4fab1f6b2d80f3301bef`
- CoreWriter path: NOT yet exercised live (needs funded HL testnet account).

## Robinhood testnet (46630) — mock V4 market
- `mUSDG` `0xac0a7216290fa7445782f80628bf727b084e41e0` (6 dec) · `mTSLA` `0xd4417bc34cd728a581b0e1dd03839c6e56fca5cf` (18 dec)
- `TestnetV4Router` `0xdc26a92c69df6fd4aa0d2f64fdec549bc655b7f6`
- Pool: V4, fee 3000 / spacing 60, no hook. poolId `0x10e156b2ddad42a942f85970c1a05e0c5d03011062a848598e50d21e090ef1a6`
- Seeded ±15% around HL-testnet xyz:TSLA mid ($378.97): ~2000 mUSDG + ~5.18 mTSLA (~$4k).
- Chain facts learned: PoolManager `0x8366…40951` (verified source, NO `getSlot0` — price via `extsload`, `_pools` at slot 6); reversed BalanceDelta (amount0 = upper 128 bits); UniversalRouter present but unused (own router instead).
- Explorer: https://explorer.testnet.chain.robinhood.com/

## Live spot-leg proof (Robinhood testnet, real txs)
- BUY 5 mUSDG → 0.01315178 mTSLA: `0xd112e0068b0caad2101311b139dbcc6709ce7330f0d32bac46e86b27a94ffc93`
- SELL 0.01315178 mTSLA → 4.970047 mUSDG: `0xd7ae4a6372374c0a6ce6d2875fbe570554be9335e8704686121c3abacde7916d`
- Round-trip cost 0.03 mUSDG ≈ 60bps = exactly 2× 0.3% fee. No dust left.

## Hyperliquid testnet
- `xyz` dex EXISTS with `xyz:TSLA` etc. (mid ~378.97 at pool seeding).
- Funding: 40 USDC faucet-claimed on HyperEVM → deposited via official CoreDepositWallet (`deposit`, correct selectors, successful txs) — **Core credit stuck: $0 after 40+ min** (41 USDC total incl. 1-USDC probe). Testnet backend issue, under watch.
- Short leg + full keeper loop: pending Core credit, then agent wallet + live run.

## Mainnet measurements (Oct 12, weekday, markets open)
- 5 pairs, token vs xyz-perp: bases +19.5…−35.8bps; net edge −28…−114bps (costs ~82bps dominate). Verdict: INSUFFICIENT_DATA/PIVOT — edge unproven on weekdays, as the thesis predicts. Reports in `scripts/out/`.
