"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { DualLineChart } from "@/components/dual-line-chart";
import { useNodeEarnings } from "@/hooks/use-node-earnings";

type Props = {
  hash: string;
  height?: number;
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

export function NodeEarningsSpark({ hash, height = 56 }: Props) {
  const { data, isLoading } = useNodeEarnings(hash, "24h");

  if (isLoading) {
    return (
      <Skeleton className="w-full rounded-md" style={{ height }} />
    );
  }
  if (!data) return null;

  const hasEarnings = data.buckets.some((b) => b.aleph > 0);
  if (!hasEarnings) {
    return (
      <p
        className="text-xs italic text-muted-foreground"
        style={{ minHeight: height }}
      >
        No earnings · last 24h
      </p>
    );
  }

  const secondaryLabel = data.role === "crn" ? "VMs avg" : "CRNs linked";
  const secondaryValue =
    data.role === "crn"
      ? avg(data.buckets.map((b) => b.secondaryCount)).toFixed(1)
      : String(data.buckets.at(-1)?.secondaryCount ?? 0);

  return (
    <div className="space-y-1">
      <DualLineChart buckets={data.buckets} width={240} height={height} />
      <p className="font-mono text-xs">
        {data.totalAleph.toFixed(2)} ALEPH
        <span className="text-muted-foreground">
          {" "}
          · {secondaryValue} {secondaryLabel}
        </span>
      </p>
    </div>
  );
}
