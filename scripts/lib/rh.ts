import { createPublicClient, http, parseAbi, type Address } from "viem";
import { RH_RPC, RH_CHAIN_ID } from "./env.js";

export const rhChain = {
  id: RH_CHAIN_ID, name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RH_RPC] } },
} as const;

export const rhClient = createPublicClient({ chain: rhChain, transport: http(RH_RPC) });

export const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
]);
export const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
export const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)", "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

/** token1-per-token0 price (human units) from a Uniswap V3 sqrtPriceX96. */
export function sqrtPriceToPrice(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  const q = Number(sqrtPriceX96) / 2 ** 96;
  return q * q * 10 ** (dec0 - dec1);
}

export interface PoolQuote { priceUsd: number; liquidity: bigint; tick: number }
/** USD price of the stock token in a pool paired with the USD stablecoin (USDG). */
export async function stockPriceUsd(pool: Address, stockToken: Address, stockDec: number, quoteDec: number): Promise<PoolQuote> {
  const [slot, t0, liq] = await Promise.all([
    rhClient.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }),
    rhClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    rhClient.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
  ]);
  const stockIs0 = t0.toLowerCase() === stockToken.toLowerCase();
  const p01 = stockIs0 ? sqrtPriceToPrice(slot[0], stockDec, quoteDec) : sqrtPriceToPrice(slot[0], quoteDec, stockDec);
  return { priceUsd: stockIs0 ? p01 : 1 / p01, liquidity: liq, tick: slot[1] };
}
