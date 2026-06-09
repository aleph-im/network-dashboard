// --- Rewards time-series API (credit.aleph.im) ---

export type RewardSource = "credit_revenue" | "holder_tier" | "wage_subsidy";

export type BySource = Record<RewardSource, number>;

/** Per-role split from `detail=2` `full`. credit_revenue & holder_tier use the
 *  execution_* / storage_* keys; wage_subsidy uses crn/ccn/staker. */
export type CreditRoleFull = {
  execution_crn: number;
  execution_ccn: number;
  execution_staker: number;
  storage_ccn: number;
  storage_staker: number;
};
export type WageRoleFull = { crn: number; ccn: number; staker: number };

export type RewardsFull = {
  credit_revenue: CreditRoleFull;
  holder_tier: CreditRoleFull;
  wage_subsidy: WageRoleFull;
};

/** The `total` block for a single address over a window. */
export type AddressRewards = {
  address: string;
  totalAleph: number;
  bySource: BySource;
  full: RewardsFull;
};

// --- FOUNDATION distribution messages (api2) ---

export type DistributionTargetStatus = "pending" | "confirmed" | "failed";

/** Last on-chain payout for one address, joined from `rewards` + `targets`. */
export type AddressLastPaid = {
  aleph: number;
  /** Cycle end (payout) time, seconds since epoch. */
  timeSec: number;
  txHash: string | null;
  status: DistributionTargetStatus;
};

/** The latest distribution cycle. */
export type DistributionCycle = {
  startSec: number;
  endSec: number;
  /** address (lowercased) → paid ALEPH for the cycle. */
  rewards: Map<string, number>;
  /** address (lowercased) → { txHash, status }. */
  onChain: Map<string, { txHash: string | null; status: DistributionTargetStatus }>;
};

// --- Owner view app type ---

export type OwnerNodeReward = {
  hash: string;
  name: string;
  role: "crn" | "ccn";
  totalAleph: number;
  bySource: BySource;
};

export type OwnerRewards = {
  address: string;
  cycleStartSec: number;
  cycleEndSec: number | null; // null until first distribution is known
  totalAleph: number;
  bySource: BySource;
  byNode: OwnerNodeReward[];
  stakingAleph: number;
  /** ALEPH from authoritative role totals that mapped to no currently-owned
   *  node (e.g. a deregistered node, or a node missing from the corechannel
   *  snapshot). Kept so the breakdown always reconciles with totalAleph. */
  unattributedAleph: number;
  lastPaid: AddressLastPaid | null;
};
