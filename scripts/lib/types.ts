export interface PairCfg {
  symbol: string; hlCoin: string; stockToken: string; stockDecimals: number;
  pool: string; poolFeeBps: number; maxNotionalUsd: number; minNetEdgeBps: number;
}
export interface PairsFile {
  hlDex: string;
  quoteToken: { symbol: string; address: string; decimals: number };
  pairs: PairCfg[];
}
