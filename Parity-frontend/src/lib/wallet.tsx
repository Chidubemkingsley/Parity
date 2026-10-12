import type { ReactNode } from 'react';
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect } from 'wagmi';
import { arbitrumSepolia } from 'viem/chains';
import { injected } from 'wagmi/connectors';
import { hyperEvmTestnet, robinhoodTestnet } from './chain';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia, hyperEvmTestnet, robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(env.VITE_ARB_SEPOLIA_RPC ?? 'https://sepolia-rollup.arbitrum.io/rpc'),
    [hyperEvmTestnet.id]: http(env.VITE_HYPEREVM_TESTNET_RPC ?? 'https://rpc.hyperliquid-testnet.xyz/evm'),
    [robinhoodTestnet.id]: http(env.VITE_RH_TESTNET_RPC ?? 'https://rpc.testnet.chain.robinhood.com'),
  },
});

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected && address) {
    return (
      <span className="wallet-state wallet-connected" title={`${address} · ${chain?.name ?? 'unknown chain'} — click to disconnect`}>
        <span className="wallet-outline" />
        <span className="mono">{shortAddr(address)}</span>
        <button
          className="wallet-disconnect"
          aria-label="Disconnect wallet"
          data-testid="button-disconnect-wallet"
          onClick={() => disconnect()}
        >
          ×
        </button>
      </span>
    );
  }
  const ready = connectors.find((c) => c.id === 'injected') ?? connectors[0];
  return (
    <span>
      <button
        className="wallet-state wallet-connect"
        data-testid="button-connect-wallet"
        disabled={!ready || isPending}
        title={ready ? `Connect via ${ready.name}` : 'No browser wallet found — install MetaMask, Rabby, or Brave Wallet'}
        onClick={() => ready && connect({ connector: ready })}
      >
        <span className="wallet-outline" /> {isPending ? 'CONNECTING…' : ready ? 'CONNECT WALLET' : 'NO WALLET FOUND'}
      </button>
      {error && <span className="sr-only">{error.message}</span>}
    </span>
  );
}
