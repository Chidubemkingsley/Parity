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
export const arbClient = createPublicClient({ chain: arbitrumSepolia, transport: http(arbSepoliaRpc) });
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

const DEPOSIT_EVENT = parseAbi(['event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)'])[0];
const WITHDRAW_EVENT = parseAbi(['event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)'])[0];

export type CostBasis = { deposits: bigint; withdrawals: bigint; net: bigint; txs: number } | null;

export type ActivityRow = {
  blockNumber: bigint; timestamp: number; kind: 'deposit' | 'withdraw';
  assets: bigint; shares: bigint; txHash: `0x${string}`;
};

/** Full per-wallet activity + totals, scanned from vault logs. No indexer needed. */
export function useActivity(wallet: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ['activity', 'arb-sepolia', wallet ?? 'disconnected'],
    refetchInterval: 120000,
    retry: 1,
    enabled: !!wallet,
    queryFn: async (): Promise<{ rows: ActivityRow[]; decimals: number } | null> => {
      const dep = addressesByChainId[chainIds.arbitrumSepolia]?.vault;
      if (!dep || !isContractConfigured(dep) || !wallet) return null;
      const v = dep.address;
      const latest = await arbClient.getBlockNumber();
      const from = dep.deployBlock ?? latest;
      const rows: ActivityRow[] = [];
      const STEP = 100000n;
      for (let s = from; s <= latest; s += STEP) {
        const e = s + STEP - 1n > latest ? latest : s + STEP - 1n;
        const [ds, ws] = await Promise.all([
          arbClient.getLogs({ address: v, event: DEPOSIT_EVENT, args: { owner: wallet }, fromBlock: s, toBlock: e }),
          arbClient.getLogs({ address: v, event: WITHDRAW_EVENT, args: { owner: wallet }, fromBlock: s, toBlock: e }),
        ]);
        for (const l of ds) {
          const a = l.args as unknown as { assets: bigint; shares: bigint };
          rows.push({ blockNumber: l.blockNumber, timestamp: 0, kind: 'deposit', assets: a.assets, shares: a.shares, txHash: l.transactionHash });
        }
        for (const l of ws) {
          const a = l.args as unknown as { assets: bigint; shares: bigint };
          rows.push({ blockNumber: l.blockNumber, timestamp: 0, kind: 'withdraw', assets: a.assets, shares: a.shares, txHash: l.transactionHash });
        }
      }
      const blocks = [...new Set(rows.map((r) => r.blockNumber))];
      const stamps = await Promise.all(blocks.map(async (b) => [b, await arbClient.getBlock({ blockNumber: b })] as const));
      const tmap = new Map(stamps.map(([b, blk]) => [b, Number(blk.timestamp)]));
      for (const r of rows) r.timestamp = tmap.get(r.blockNumber) ?? 0;
      rows.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      const dec = (await arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'decimals' })) as unknown as bigint;
      return { rows, decimals: Number(dec) };
    },
  });
}

/** Cost basis = lifetime USDC in − lifetime USDC out, derived from scanned activity. */
export function useCostBasis(wallet: `0x${string}` | undefined) {
  const a = useActivity(wallet);
  let basis: CostBasis | undefined;
  if (a.data === undefined) basis = undefined;
  else if (a.data === null) basis = null;
  else {
    const deposits = a.data.rows.filter((r) => r.kind === 'deposit').reduce((x, r) => x + r.assets, 0n);
    const withdrawals = a.data.rows.filter((r) => r.kind === 'withdraw').reduce((x, r) => x + r.assets, 0n);
    basis = { deposits, withdrawals, net: deposits - withdrawals, txs: a.data.rows.length };
  }
  return { ...a, data: basis };
}

export function usdcAddr(): `0x${string}` | null {
  return (addressesByChainId[chainIds.arbitrumSepolia]?.usdc?.address ?? null) as `0x${string}` | null;
}

const erc20ReadAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export const erc20WriteAbi = parseAbi([
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

export type DepositData = {
  usdc: `0x${string}`; maxDeposit: bigint; previewShares: bigint | null;
  usdcBalance: bigint; allowance: bigint; usdcDecimals: number; vaultDec: number;
  navStale: boolean; paused: boolean;
};

export function useDepositData(wallet: `0x${string}` | undefined, amountStr: string) {
  return useQuery({
    queryKey: ['deposit-data', 'arb-sepolia', wallet ?? 'disconnected', amountStr],
    refetchInterval: 15000,
    retry: 1,
    enabled: !!wallet,
    queryFn: async (): Promise<DepositData | null> => {
      const v = vaultAddr();
      const u = usdcAddr();
      if (!v || !u || !wallet) return null;
      const amt = amountStr.trim() === '' ? 0n : BigInt(Math.floor(Number(amountStr) * 1e6));
      const [maxDeposit, usdcBalance, allowance, usdcDec, vaultDec, navStale, paused] = (await Promise.all([
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'maxDeposit', args: [wallet] }),
        arbClient.readContract({ address: u, abi: erc20ReadAbi, functionName: 'balanceOf', args: [wallet] }),
        arbClient.readContract({ address: u, abi: erc20ReadAbi, functionName: 'allowance', args: [wallet, v] }),
        arbClient.readContract({ address: u, abi: erc20ReadAbi, functionName: 'decimals' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'decimals' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'navIsStale' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'paused' }),
      ])) as unknown as [bigint, bigint, bigint, number, bigint, boolean, boolean];
      let previewShares: bigint | null = null;
      if (amt > 0n) {
        try {
          previewShares = (await arbClient.readContract({
            address: v, abi: ParityVaultAbi, functionName: 'previewDeposit', args: [amt],
          })) as unknown as bigint;
        } catch { previewShares = null; }
      }
      return { usdc: u, maxDeposit, previewShares, usdcBalance: usdcBalance, allowance, usdcDecimals: Number(usdcDec), vaultDec: Number(vaultDec), navStale, paused };
    },
  });
}

export type WithdrawData = {
  maxAssets: bigint; previewShares: bigint | null; shareBalance: bigint; shareDecimals: number;
};

export function useWithdrawData(wallet: `0x${string}` | undefined, amountStr: string) {
  return useQuery({
    queryKey: ['withdraw-data', 'arb-sepolia', wallet ?? 'disconnected', amountStr],
    refetchInterval: 15000,
    retry: 1,
    enabled: !!wallet,
    queryFn: async (): Promise<WithdrawData | null> => {
      const v = vaultAddr();
      if (!v || !wallet) return null;
      const amt = amountStr.trim() === '' ? 0n : BigInt(Math.floor(Number(amountStr) * 1e6));
      const [maxAssets, shareBalance, shareDec] = (await Promise.all([
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'maxWithdraw', args: [wallet] }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'balanceOf', args: [wallet] }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'decimals' }),
      ])) as unknown as [bigint, bigint, bigint];
      let previewShares: bigint | null = null;
      if (amt > 0n) {
        try {
          previewShares = (await arbClient.readContract({
            address: v, abi: ParityVaultAbi, functionName: 'previewWithdraw', args: [amt],
          })) as unknown as bigint;
        } catch { previewShares = null; }
      }
      return { maxAssets, previewShares, shareBalance, shareDecimals: Number(shareDec) };
    },
  });
}

export type PositionState = { shares: bigint; decimals: number; valueUsd: number | null };

const NAV_EVENT = parseAbi(['event DeployedReported(uint256 oldDeployed, uint256 newDeployed, bytes32 evidence, uint256 totalAssets)'])[0];

export type NavReport = {
  oldDeployed: bigint; newDeployed: bigint; evidence: `0x${string}`; totalAssets: bigint;
  txHash: `0x${string}`; timestamp: number; blockNumber: bigint;
};

/** NAV report timeline: latest attestation + full event history scanned from the vault. */
export function useNavReports() {
  return useQuery({
    queryKey: ['nav-reports', 'arb-sepolia'],
    refetchInterval: 60000,
    retry: 1,
    queryFn: async (): Promise<{ rows: NavReport[]; lastReportTs: bigint; lastEvidence: `0x${string}` } | null> => {
      const dep = addressesByChainId[chainIds.arbitrumSepolia]?.vault;
      if (!dep || !isContractConfigured(dep)) return null;
      const v = dep.address;
      const [lastReportTs, lastEvidence, latest] = (await Promise.all([
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'lastReportTs' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'lastEvidence' }),
        arbClient.getBlockNumber(),
      ])) as unknown as [bigint, `0x${string}`, bigint];
      const from = dep.deployBlock ?? latest;
      const rows: NavReport[] = [];
      const STEP = 100000n;
      for (let s = from; s <= latest; s += STEP) {
        const e = s + STEP - 1n > latest ? latest : s + STEP - 1n;
        const logs = await arbClient.getLogs({ address: v, event: NAV_EVENT, fromBlock: s, toBlock: e });
        for (const l of logs) {
          const a = l.args as unknown as { oldDeployed: bigint; newDeployed: bigint; evidence: `0x${string}`; totalAssets: bigint };
          rows.push({
            oldDeployed: a.oldDeployed, newDeployed: a.newDeployed, evidence: a.evidence, totalAssets: a.totalAssets,
            txHash: l.transactionHash, timestamp: 0, blockNumber: l.blockNumber,
          });
        }
      }
      const tmap = new Map<bigint, number>();
      await Promise.all([...new Set(rows.map((r) => r.blockNumber))].map(async (b) => {
        tmap.set(b, Number((await arbClient.getBlock({ blockNumber: b })).timestamp));
      }));
      for (const r of rows) r.timestamp = tmap.get(r.blockNumber) ?? 0;
      rows.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      return { rows, lastReportTs, lastEvidence };
    },
  });
}

const RTR_EVENT = parseAbi(['event RoundTripRecorded(uint256 indexed id, bytes32 indexed pairId, uint128 notional, int128 pnl, int32 entryEdgeBps, bytes32 rhTx, bytes32 hlRef, uint64 openedAt, uint64 closedAt)'])[0];

export type RoundTrip = {
  id: bigint; pairId: `0x${string}`; notional: bigint; pnl: bigint; entryEdgeBps: number;
  rhTx: `0x${string}`; hlRef: `0x${string}`; openedAt: number; closedAt: number;
  txHash: `0x${string}`; timestamp: number; blockNumber: bigint;
};

export type RoundTripState = {
  count: bigint; cumNotional: bigint; cumPnl: bigint; rows: RoundTrip[];
};

/** Round-trip journal: tallies + full event rows scanned from the vault. */
export function useRoundTrips() {
  return useQuery({
    queryKey: ['round-trips', 'arb-sepolia'],
    refetchInterval: 60000,
    retry: 1,
    queryFn: async (): Promise<RoundTripState | null> => {
      const dep = addressesByChainId[chainIds.arbitrumSepolia]?.vault;
      if (!dep || !isContractConfigured(dep)) return null;
      const v = dep.address;
      const [count, cumNotional, cumPnl, latest] = (await Promise.all([
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'roundTripCount' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'cumulativeNotional' }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'cumulativePnl' }),
        arbClient.getBlockNumber(),
      ])) as unknown as [bigint, bigint, bigint, bigint];
      const from = dep.deployBlock ?? latest;
      const rows: RoundTrip[] = [];
      const STEP = 100000n;
      for (let s = from; s <= latest; s += STEP) {
        const e = s + STEP - 1n > latest ? latest : s + STEP - 1n;
        const logs = await arbClient.getLogs({ address: v, event: RTR_EVENT, fromBlock: s, toBlock: e });
        for (const l of logs) {
          const a = l.args as unknown as {
            id: bigint; pairId: `0x${string}`; notional: bigint; pnl: bigint; entryEdgeBps: number;
            rhTx: `0x${string}`; hlRef: `0x${string}`; openedAt: bigint; closedAt: bigint;
          };
          rows.push({
            id: a.id, pairId: a.pairId, notional: a.notional, pnl: a.pnl, entryEdgeBps: Number(a.entryEdgeBps),
            rhTx: a.rhTx, hlRef: a.hlRef, openedAt: Number(a.openedAt), closedAt: Number(a.closedAt),
            txHash: l.transactionHash, timestamp: 0, blockNumber: l.blockNumber,
          });
        }
      }
      const tmap = new Map<bigint, number>();
      await Promise.all([...new Set(rows.map((r) => r.blockNumber))].map(async (b) => {
        tmap.set(b, Number((await arbClient.getBlock({ blockNumber: b })).timestamp));
      }));
      for (const r of rows) r.timestamp = tmap.get(r.blockNumber) ?? 0;
      rows.sort((a, b) => (a.id > b.id ? -1 : 1));
      return { count, cumNotional, cumPnl, rows };
    },
  });
}

export function usePosition(wallet: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ['position', 'arb-sepolia', wallet ?? 'disconnected'],
    refetchInterval: 30000,
    retry: 1,
    enabled: !!wallet,
    queryFn: async (): Promise<PositionState | null> => {
      const v = vaultAddr();
      if (!v || !wallet) return null;
      const [shares, dec] = (await Promise.all([
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'balanceOf', args: [wallet] }),
        arbClient.readContract({ address: v, abi: ParityVaultAbi, functionName: 'decimals' }),
      ])) as unknown as [bigint, bigint];
      const decimals = Number(dec);
      const assets = (await arbClient.readContract({
        address: v, abi: ParityVaultAbi, functionName: 'convertToAssets', args: [shares],
      })) as unknown as bigint;
      return { shares, decimals, valueUsd: Number(assets) / 1e6 };
    },
  });
}
