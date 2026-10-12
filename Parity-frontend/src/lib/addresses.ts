export const chainIds = {
  arbitrumOne: 42161,
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
 * Deployment details are intentionally unset: the contracts have not been
 * deployed and external token/pool addresses are marked unverified. Do not
 * populate this map until addresses and deployment blocks are confirmed.
 */
export const addressesByChainId: Record<number, ChainAddresses> = {
  [chainIds.arbitrumOne]: unconfiguredChain(),
  [chainIds.hyperEvm]: unconfiguredChain(),
  [chainIds.hyperEvmTestnet]: unconfiguredChain(),
  [chainIds.robinhoodChain]: unconfiguredChain(),
  [chainIds.robinhoodTestnet]: unconfiguredChain(),
};

export function isContractConfigured(
  deployment: ContractDeployment,
): deployment is ContractDeployment & { address: ContractAddress } {
  return deployment.address !== null && deployment.deployBlock !== null;
}
