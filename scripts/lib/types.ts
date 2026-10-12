export interface PairCfg {
  symbol: string; hlCoin: string; stockToken: string; stockDecimals: number;
  pool: string; poolFeeBps: number; maxNotionalUsd: number; minNetEdgeBps: number;
  poolKind?: "v3" | "v4";
  v4?: { pm: string; router: string; fee: number; tickSpacing: number; hooks: string };
}
export interface PairsFile {
  hlDex: string;
  quoteToken: { symbol: string; address: string; decimals: number };
  pairs: PairCfg[];
}
