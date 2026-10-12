export const chainIds = {
  arbitrumOne: 42161,
  arbitrumSepolia: 421614,
  hyperEvm: 999,
  hyperEvmTestnet: 998,
  robinhoodChain: 4663,
  robinhoodTestnet: 46630,
} as const;

export type ContractAddress = `0x${string}`;

export type ContractDeployment = {
  address: ContractAddress | null;
  deployBlock: bigint | null;
};

export type ChainAddresses = {
  vault: ContractDeployment;
  registry: ContractDeployment;
  hedger: ContractDeployment;
  usdc: ContractDeployment;
  stockTokens: Record<string, ContractDeployment>;
  pools: Record<string, ContractDeployment>;
};

const unconfiguredContract = (): ContractDeployment => ({
  address: null,
  deployBlock: null,
});

const unconfiguredChain = (): ChainAddresses => ({
  vault: unconfiguredContract(),
  registry: unconfiguredContract(),
  hedger: unconfiguredContract(),
  usdc: unconfiguredContract(),
  stockTokens: {},
  pools: {},
});

/**
 * Verified testnet deployments (Oct 12, 2026; deployer 0x90356CF97B3BF1749A604d3F89b3DF3602A459E3).
 * Source of truth: contracts/broadcast/*.json run files + docs/TESTNET.md.
 * Mainnet chains stay null: nothing is deployed on mainnet.
 */
const arbitrumSepolia: ChainAddresses = {
  vault: { address: '0xb0e660108571b4b191a14b0efdf8ea98d76fb5cc', deployBlock: 318415762n },
  registry: { address: '0xb0ff214f3575098966c1dbf66bd39dca9ddc0130', deployBlock: 318415754n },
  hedger: unconfiguredContract(),
  usdc: { address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', deployBlock: null },
  stockTokens: {},
  pools: {},
};

const hyperEvmTestnet: ChainAddresses = {
  vault: unconfiguredContract(),
  registry: unconfiguredContract(),
  hedger: { address: '0xeeccd2bb5c0605f3eacdc4da221d9bdeda580d2f', deployBlock: 66713058n },
  usdc: unconfiguredContract(),
  stockTokens: {},
  pools: {},
};

const robinhoodTestnet: ChainAddresses = {
  vault: unconfiguredContract(),
  registry: unconfiguredContract(),
  hedger: unconfiguredContract(),
  usdc: { address: '0xac0a7216290fa7445782f80628bf727b084e41e0', deployBlock: 133636319n },
  stockTokens: {
    mTSLA: { address: '0xd4417bc34cd728a581b0e1dd03839c6e56fca5cf', deployBlock: 133636317n },
  },
  pools: {
    // V4 pool id (bytes32), NOT a contract address. PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951.
    'mTSLA/mUSDG-3000': { address: '0x10e156b2ddad42a942f85970c1a05e0c5d03011062a848598e50d21e090ef1a6', deployBlock: 133637080n },
  },
};

export const testnetRouter: ContractDeployment = {
  address: '0xdc26a92c69df6fd4aa0d2f64fdec549bc655b7f6',
  deployBlock: 133636319n,
};

/**
 * Mainnet token/pool addresses verified live (Oct 12, 2026) live in
 * scripts/config/pairs.json + docs/TESTNET.md — NOT duplicated here, because
 * this map tracks deployments (address + deploy block), and mainnet has none.
 */
export const addressesByChainId: Record<number, ChainAddresses> = {
  [chainIds.arbitrumOne]: unconfiguredChain(),
  [chainIds.arbitrumSepolia]: arbitrumSepolia,
  [chainIds.hyperEvm]: unconfiguredChain(),
  [chainIds.hyperEvmTestnet]: hyperEvmTestnet,
  [chainIds.robinhoodChain]: unconfiguredChain(),
  [chainIds.robinhoodTestnet]: robinhoodTestnet,
};

export function isContractConfigured(
  deployment: ContractDeployment,
): deployment is ContractDeployment & { address: ContractAddress } {
  return deployment.address !== null && deployment.deployBlock !== null;
}
