"use client";

import Link from "next/link";
import {
  getStakingPositions,
  totalStaked,
  type StakingPosition,
} from "@/lib/network-address-info";
import type { NodeState } from "@/api/credit-types";

const ALEPH_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type Props = {
  address: string;
  nodeState: NodeState | undefined;
};

export function NetworkStakingSection({ address, nodeState }: Props) {
  const positions = getStakingPositions(nodeState, address);
  if (positions.length === 0) return null;
  const total = totalStaked(positions);

  return (
    <div className="space-y-2 border-t border-edge pt-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Staking
        </h4>
        <span className="font-mono text-sm">
          {ALEPH_FMT.format(total)} ALEPH
        </span>
      </div>
      <ul className="space-y-1.5">
        {positions.map((p) => (
          <StakingRow key={p.ccnHash} position={p} />
        ))}
      </ul>
    </div>
  );
}

function StakingRow({ position }: { position: StakingPosition }) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-xs">
      <Link
        href={`/network?selected=${position.ccnHash}`}
        className="min-w-0 truncate text-primary-300 hover:underline"
      >
        {position.ccnName}
      </Link>
      <span className="font-mono text-muted-foreground">
        {ALEPH_FMT.format(position.amount)}
      </span>
    </li>
  );
}
