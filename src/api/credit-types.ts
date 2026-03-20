// --- Wire types (matching api2.aleph.im JSON) ---

export type ApiCreditEntry = {
  address: string;
  amount: number;
  price: number; // compute rate, NOT aleph cost
  ref: string;
  time: number;
  node_id?: string;
  execution_id?: string;
  size?: number;
  upload_time?: number;
};

export type ApiCreditExpense = {
  amount: number;
  count: number;
  credit_price_aleph: number;
  credit_price_usdc: number;
  credits: ApiCreditEntry[];
  start_date: number;
  end_date: number;
};

export type ApiCorechannelNode = {
  hash: string;
  name: string;
  owner: string;
  score: number;
  reward: string;
  status: string;
  stakers: Record<string, number>;
  total_staked: number;
  resource_nodes: string[];
};

export type ApiResourceNode = {
  hash: string;
  name: string;
  owner: string;
  score: number;
  reward: string;
  status: string;
  parent: string | null;
};

// --- App types ---

export type ExpenseType = "storage" | "execution";

export type CreditEntry = {
  address: string;
  amount: number;
  alephCost: number;
  ref: string;
  timeSec: number;
  nodeId: string | null;
  executionId: string | null;
};

export type CreditExpense = {
  hash: string;
  time: number;
  type: ExpenseType;
  totalAleph: number;
  creditCount: number;
  creditPriceAleph: number;
  credits: CreditEntry[];
};

export type CCNInfo = {
  hash: string;
  name: string;
  owner: string;
  reward: string;
  score: number;
  status: string;
  stakers: Record<string, number>;
  totalStaked: number;
};

export type CRNInfo = {
  hash: string;
  name: string;
  owner: string;
  reward: string;
  score: number;
  status: string;
};

export type NodeState = {
  ccns: Map<string, CCNInfo>;
  crns: Map<string, CRNInfo>;
};

export type ExpenseDistribution = {
  expense: CreditExpense;
  crnRewards: Map<string, number>;
  ccnRewards: Map<string, number>;
  stakerRewards: Map<string, number>;
  devFund: number;
};

export type RecipientRole = "crn" | "ccn" | "staker";

export type RecipientTotal = {
  address: string;
  roles: RecipientRole[];
  totalAleph: number;
  crnAleph: number;
  ccnAleph: number;
  stakerAleph: number;
  nodeHash: string | null;
  nodeName: string | null;
};

export type DistributionSummary = {
  totalAleph: number;
  storageAleph: number;
  executionAleph: number;
  devFundAleph: number;
  distributedAleph: number;
  expenseCount: number;
  recipients: RecipientTotal[];
  expenses: ExpenseDistribution[];
  // Per-VM and per-node aggregates for table integration
  perVm: Map<string, number>;
  perNode: Map<string, number>;
  // Network activity counts
  uniquePayers: number;
  uniqueVms: number;
  uniqueCrns: number;
  creditPriceAleph: number;
};

export type WalletNodeReward = {
  nodeHash: string;
  nodeName: string;
  role: "crn" | "ccn";
  aleph: number;
};

export type WalletRewards = {
  nodes: WalletNodeReward[];
  stakerAleph: number;
  totalAleph: number;
};
