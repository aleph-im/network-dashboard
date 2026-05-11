import centroidsJson from "@/data/country-centroids.json";
import type { NodeState } from "@/api/credit-types";

type Centroid = { lat: number; lng: number; name: string };
const CENTROIDS = centroidsJson as Record<string, Centroid>;

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return CENTROIDS[code]?.name ?? code;
}

export type StakingPosition = {
  ccnHash: string;
  ccnName: string;
  amount: number;
};

export function getStakingPositions(
  state: NodeState | undefined,
  address: string,
): StakingPosition[] {
  if (!state) return [];
  const lower = address.toLowerCase();
  const out: StakingPosition[] = [];
  for (const ccn of state.ccns.values()) {
    for (const [stakerAddr, amount] of Object.entries(ccn.stakers)) {
      if (stakerAddr.toLowerCase() === lower) {
        out.push({ ccnHash: ccn.hash, ccnName: ccn.name, amount });
      }
    }
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

export function totalStaked(positions: StakingPosition[]): number {
  return positions.reduce((sum, p) => sum + p.amount, 0);
}
