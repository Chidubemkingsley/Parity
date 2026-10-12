import { useQuery } from '@tanstack/react-query';
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Chain,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { addressesByChainId, chainIds, isContractConfigured } from './addresses';
import { PairRegistryAbi, ParityVaultAbi } from './abis';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const hyperEvmTestnet = {
  id: chainIds.hyperEvmTestnet,
  name: 'HyperEVM Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [env.VITE_HYPEREVM_TESTNET_RPC ?? 'https://rpc.hyperliquid-testnet.xyz/evm'] } },
} as const satisfies Chain;

const robinhoodTestnet = {
  id: chainIds.robinhoodTestnet,
  name: 'Robinhood Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [env.VITE_RH_TESTNET_RPC ?? 'https://rpc.testnet.chain.robinhood.com'] } },
} as const satisfies Chain;

const arbSepoliaRpc = env.VITE_ARB_SEPOLIA_RPC ?? 'https://sepolia-rollup.arbitrum.io/rpc';
const arbClient = createPublicClient({ chain: arbitrumSepolia, transport: http(arbSepoliaRpc) });
const rhClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });

export type VaultState = {
  totalAssets: bigint; totalSupply: bigint; decimals: number; paused: boolean;
  depositCap: bigint; idle: bigint; deployed: bigint; sharePrice: number;
  roundTrips: bigint; cumNotional: bigint; cumPnl: bigint;
};

function vaultAddr(): Address | null {
  const d = addressesByChainId[chainIds.arbitrumSepolia]?.vault;
  return d && isContractConfigured(d) ? d.address : null;
}

export function useVaultState() {
  return useQuery({
    queryKey: ['vault-state', 'arb-sepolia'],
    refetchInterval: 30000,
    retry: 1,
    queryFn: async (): Promise<VaultState | null> => {
      const v = vaultAddr();
      if (!v) return null;
      const r = (fn: string, args: unknown[] = []) =>
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: fn, args } as never) as Promise<never>;
      const [totalAssets, totalSupply, decimals, paused, depositCap, idle, deployed, roundTrips, cumNotional, cumPnl] =
        (await Promise.all([
          r('totalAssets'), r('totalSupply'), r('decimals'), r('paused'), r('depositCap'),
          r('idle'), r('deployed'), r('roundTripCount'), r('cumulativeNotional'), r('cumulativePnl'),
        ])) as unknown as [bigint, bigint, bigint, boolean, bigint, bigint, bigint, bigint, bigint, bigint];
      const dec = Number(decimals);
      const supply = Number(totalSupply) / 10 ** dec;
      return {
        totalAssets, totalSupply, decimals: dec, paused, depositCap, idle, deployed,
        sharePrice: supply > 0 ? Number(totalAssets) / 10 ** dec / supply : NaN,
        roundTrips, cumNotional, cumPnl,
      };
    },
  });
}

export type RegistryPair = {
  id: string; symbol: string; stockToken: string; hlAsset: number;
  enabled: boolean; maxNotional: bigint; minEdgeBps: number;
};

export function useRegistryPairs() {
  return useQuery({
    queryKey: ['registry-pairs', 'arb-sepolia'],
    refetchInterval: 30000,
    retry: 1,
    queryFn: async (): Promise<RegistryPair[] | null> => {
      const d = addressesByChainId[chainIds.arbitrumSepolia]?.registry;
      if (!d || !isContractConfigured(d)) return null;
      const reg = d.address;
      const ids = (await arbClient.readContract({
        address: reg, abi: PairRegistryAbi, functionName: 'pairIds',
      })) as unknown as `0x${string}`[];
      const out: RegistryPair[] = [];
      for (const id of ids) {
        const p = (await arbClient.readContract({
          address: reg, abi: PairRegistryAbi, functionName: 'pairOf', args: [id],
        })) as unknown as { symbol: string; stockToken: string; hlAsset: number; maxNotional: bigint; minEdgeBps: number; enabled: boolean };
        out.push({ id, symbol: p.symbol, stockToken: p.stockToken, hlAsset: Number(p.hlAsset), enabled: p.enabled, maxNotional: p.maxNotional, minEdgeBps: Number(p.minEdgeBps) });
      }
      return out;
    },
  });
}

const pmAbi = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']);

function toHex32(x: bigint): `0x${string}` {
  return `0x${x.toString(16).padStart(64, '0')}`;
}
const PM_TESTNET = '0x8366a39CC670B4001A1121B8F6A443A643e40951' as const;
const POOLS_SLOT = 6n;
// mTSLA/mUSDG V4 pool (fee 3000, spacing 60, no hook) — mirrors scripts/config/pairs.testnet.json
const V4_KEY = {
  currency0: '0xac0a7216290fa7445782f80628bf727b084e41e0',
  currency1: '0xd4417bc34cd728a581b0e1dd03839c6e56fca5cf',
  fee: 3000, tickSpacing: 60, hooks: '0x0000000000000000000000000000000000000000',
} as const;

function v4PoolId(): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [V4_KEY.currency0, V4_KEY.currency1, V4_KEY.fee, V4_KEY.tickSpacing, V4_KEY.hooks],
    ),
  );
}

/** mTSLA price in mUSDG from the testnet V4 pool Slot0 (extsload). */
export function useTestnetTokenPrice() {
  return useQuery({
    queryKey: ['v4-token-price', 'rh-testnet'],
    refetchInterval: 30000,
    retry: 1,
    queryFn: async (): Promise<number | null> => {
      const id = v4PoolId();
      const base = BigInt(
        keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [id, POOLS_SLOT])),
      );
      const word = BigInt(
        await rhClient.readContract({
          address: PM_TESTNET, abi: pmAbi, functionName: 'extsload',
          args: [toHex32(base)],
        }),
      );
      const sqrt = word & ((1n << 160n) - 1n);
      if (sqrt === 0n) return null;
      const ratio = Number(sqrt) / 2 ** 96;
      return 10 ** (18 - 6) / (ratio * ratio);
    },
  });
}

export { hyperEvmTestnet, robinhoodTestnet };
