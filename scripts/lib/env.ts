import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PairsFile } from "./types.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HL_INFO = process.env.HL_INFO_URL ?? "https://api.hyperliquid.xyz/info";
export const RH_RPC = process.env.RH_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
export const RH_CHAIN_ID = Number(process.env.RH_CHAIN_ID ?? 4663);
export const BLOCKSCOUT = process.env.RH_BLOCKSCOUT ?? "https://robinhoodchain.blockscout.com";

export function loadPairs(): PairsFile {
  return JSON.parse(readFileSync(join(ROOT, "config", "pairs.json"), "utf8")) as PairsFile;
}
export function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
export const flag = (name: string) => process.argv.includes(`--${name}`);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
