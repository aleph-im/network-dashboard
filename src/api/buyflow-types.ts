// Shape of the signed `buyflow` aggregate published by the buy-flow pipeline
// (aleph-buyflow-dashboard) under the deploy wallet. It mirrors the credit
// *purchase* (revenue) side: money in → swap to ALEPH → distribution/burn.
// This is the buy-side counterpart to the spend-side `/credits` page, which
// reads `aleph_credit_expense` messages.
//
// Source: https://api2.aleph.im/api/v0/aggregates/<BUYFLOW_ADDRESS>.json?keys=buyflow
// Schema is versioned; `schemaVersion` is currently 1.

/** A single completed credit purchase, newest first in `credits.latest`. */
export type BuyflowPurchase = {
  /** USD value paid (net of bonus credits). */
  usd: number;
  /** Source chain, e.g. "ethereum". */
  chain: string;
  txHash: string;
  /** Credits granted (1,000,000 credits = $1 face value). */
  credits: number;
  /** Payment currency, e.g. "ALEPH" or "USDC". */
  currency: string;
  provider: string;
  /** Purchase time in epoch milliseconds. */
  createdAt: number;
};

/** Per-currency rollup of purchases. */
export type BuyflowCurrencyTotals = {
  usd: number;
  purchases: number;
};

export type BuyflowCredits = {
  totalUsd: number;
  totalCredits: number;
  completedPurchases: number;
  /** Epoch milliseconds. */
  firstPurchaseAt: number;
  /** Epoch milliseconds. */
  lastPurchaseAt: number;
  byCurrency: Record<string, BuyflowCurrencyTotals>;
  latest: BuyflowPurchase[];
};

/** A recent on-chain payment-processor event. */
export type BuyflowChainEvent = {
  token: string;
  sender: string;
  txHash: string;
  amountIn: number;
  isStable: boolean;
  marketBuy: boolean;
  /** Epoch milliseconds. */
  timestamp: number;
  alephBurned: number;
  blockNumber: number;
  tokenSymbol: string;
  swapAmountIn: number;
  toDevelopers: number;
  alephReceived: number;
  alephToDistribution: number;
};

export type BuyflowChain = {
  alephBurned: number;
  alephDistributed: number;
  alephMarketBought: number;
  burnActivated: boolean;
  deployBlock: number;
  processingRuns: number;
  events: BuyflowChainEvent[];
};

export type BuyflowMonth = {
  /** "YYYY-MM". */
  month: string;
  usd: number;
  credits: number;
  purchases: number;
  alephBought?: number;
  alephBurned?: number;
  alephDistributed?: number;
};

export type BuyflowData = {
  schemaVersion: number;
  contract: string;
  credits: BuyflowCredits;
  chain: BuyflowChain;
  monthly: BuyflowMonth[];
};
