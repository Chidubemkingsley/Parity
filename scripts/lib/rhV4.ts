import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodeAbiParameters, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RH_RPC, RH_CHAIN_ID } from "./env.js";
import { erc20Abi } from "./rh.js";

export const PM_TESTNET = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;

export const rhTestnetChain = {
  id: RH_CHAIN_ID, name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RH_RPC] } },
} as const;

export const rhTestnetClient = createPublicClient({ chain: rhTestnetChain, transport: http(RH_RPC) });

const pmAbi = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);
const routerAbi = parseAbi([
  "function swapExactInput(((address,address,uint24,int24,address),bool,uint256,uint256,uint256,address)) returns (uint256)",
]);

export interface V4Key { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }

/** Build a sorted PoolKey from quote/stock addresses + v4 cfg. */
export function buildV4Key(quote: string, stock: string, v4: { fee: number; tickSpacing: number; hooks: string }): V4Key {
  const [c0, c1] = quote.toLowerCase() < stock.toLowerCase() ? [quote, stock] : [stock, quote];
  return { currency0: c0 as Address, currency1: c1 as Address, fee: v4.fee, tickSpacing: v4.tickSpacing, hooks: v4.hooks as Address };
}

/** poolId = keccak256(abi.encode(key)) — matches PoolId.toId on-chain (verified via extsload). */
export function v4PoolId(k: V4Key): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );
}

/** Read Slot0 via extsload. poolsSlot=6 on Robinhood testnet (calibrated on-chain). */
export async function v4Slot0(pm: Address, poolId: Hex, poolsSlot = 6n): Promise<{ sqrtPriceX96: bigint; tick: number }> {
  const loc = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, poolsSlot]));
  const word = BigInt(await rhTestnetClient.readContract({ address: pm, abi: pmAbi, functionName: "extsload", args: [loc] }));
  const sqrt = word & ((1n << 160n) - 1n);
  let tick = Number((word >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  return { sqrtPriceX96: sqrt, tick };
}

export interface V4Quote { priceUsd: number; liquidity: bigint; tick: number }

/** USD price of the stock token (currency1) in quote token (currency0) units. */
export async function v4PriceUsd(pm: Address, key: V4Key, dec0: number, dec1: number): Promise<V4Quote> {
  const id = v4PoolId(key);
  const base = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n])));
  const toWord = (x: bigint) => ("0x" + x.toString(16).padStart(64, "0")) as Hex;
  const [w0, w3] = await Promise.all([
    rhTestnetClient.readContract({ address: pm, abi: pmAbi, functionName: "extsload", args: [toWord(base)] }),
    rhTestnetClient.readContract({ address: pm, abi: pmAbi, functionName: "extsload", args: [toWord(base + 3n)] }),
  ]);
  const word = BigInt(w0);
  const sqrt = word & ((1n << 160n) - 1n);
  let tick = Number((word >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  const ratio = Number(sqrt) / 2 ** 96; // sqrt(raw1/raw0)
  const priceUsd = 10 ** (dec1 - dec0) / (ratio * ratio);
  return { priceUsd, liquidity: BigInt(w3) & ((1n << 128n) - 1n), tick };
}

/** Exact-input swap through the testnet V4 router. tokenIn must be currency0 or currency1. */
export async function v4SwapExactIn(
  pk: Hex, router: Address, key: V4Key, tokenIn: Address, amountIn: bigint, minOut: bigint,
): Promise<Hex> {
  const acct = privateKeyToAccount(pk);
  const wc = createWalletClient({ account: acct, chain: rhTestnetChain, transport: http(RH_RPC) });
  const allowance = await rhTestnetClient.readContract({
    address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [acct.address, router],
  });
  if (allowance < amountIn) {
    const h = await wc.writeContract({ address: tokenIn, abi: erc20Abi, functionName: "approve", args: [router, amountIn] });
    await rhTestnetClient.waitForTransactionReceipt({ hash: h });
  }
  const zeroForOne = tokenIn.toLowerCase() === key.currency0.toLowerCase();
  const hash = await wc.writeContract({
    address: router, abi: routerAbi, functionName: "swapExactInput",
    args: [[[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks], zeroForOne, amountIn, minOut, BigInt(Math.floor(Date.now() / 1000) + 300), acct.address]],
  });
  const rc = await rhTestnetClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`v4 swap reverted ${hash}`);
  return hash;
}
