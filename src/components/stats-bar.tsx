"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type StatProps = {
  label: string;
  value: number | undefined;
  total: number | undefined;
  subtitle: string;
  isLoading: boolean;
  color?: string | undefined;
  tint?: string | undefined;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
};

function DonutRing({
  value,
  total,
  color,
  icon,
}: {
  value: number;
  total: number;
  color: string;
  icon?: React.ReactNode;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const offset = animated ? 100 - pct : 100;

  return (
    <div className="relative flex size-10 items-center justify-center">
      <svg
        viewBox="0 0 36 36"
        className="absolute inset-0 size-full"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-white/[0.08]"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray="100"
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="donut-arc"
        />
      </svg>
      {icon ? (
        <span style={{ color }} className="relative z-10">
          {icon}
        </span>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  total,
  subtitle,
  isLoading,
  color,
  tint,
  icon,
}: Omit<StatProps, "href">) {
  const showRing = color && !isLoading && value !== undefined && total;

  return (
    <div
      className="stat-card flex h-full flex-col border border-foreground/[0.06] bg-foreground/[0.03] p-6"
      style={{
        "--stat-tint": tint ?? "transparent",
      } as React.CSSProperties}
    >
      {showRing ? (
        <div className="absolute right-5 top-5">
          <DonutRing
            value={value}
            total={total}
            color={color}
            icon={icon}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {color ? (
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-11 w-24" />
      ) : (
        <p
          className="mt-3 font-heading text-4xl font-extrabold tabular-nums tracking-tight"
          {...(color ? { style: { color } } : {})}
        >
          {(value ?? 0).toLocaleString()}
        </p>
      )}
      <p className="mt-auto pt-2 text-xs leading-relaxed text-muted-foreground/60">
        {subtitle}
      </p>
    </div>
  );
}

function Stat(props: StatProps & { index?: number }) {
  const { href, className, index = 0, ...cardProps } = props;

  const entranceStyle: React.CSSProperties = {
    animationName: "card-entrance",
    animationDuration: "400ms",
    animationTimingFunction: "var(--ease-spring)",
    animationFillMode: "both",
    animationDelay: `${index * 60}ms`,
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <Link
              href={href}
              className={`card-entrance block ${className ?? ""}`}
              style={entranceStyle}
            >
              <StatCard {...cardProps} />
            </Link>
          ) : (
            <div
              className={`card-entrance ${className ?? ""}`}
              style={entranceStyle}
            >
              <StatCard {...cardProps} />
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          {props.subtitle}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const iconCheck = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z" />
  </svg>
);

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();

  const hasDispatched = (stats?.dispatchedVMs ?? 0) > 0;

  return (
    <div className="flex h-full flex-col gap-2">
      <SectionLabel>Nodes</SectionLabel>
      <div className="grid flex-1 grid-cols-2 gap-4">
        <Stat
          label="Total"
          value={stats?.totalNodes}
          total={undefined}
          subtitle="Compute nodes registered with the scheduler"
          isLoading={isLoading}
          href="/nodes"
          index={0}
        />
        <Stat
          label="Healthy"
          value={stats?.healthyNodes}
          total={stats?.totalNodes}
          subtitle="Nodes that passed their last health check"
          isLoading={isLoading}
          color="var(--color-success-500)"
          tint="var(--color-success-500)"
          icon={iconCheck}
          href="/nodes?status=healthy"
          index={1}
        />
      </div>
      <SectionLabel className="mt-2">Virtual Machines</SectionLabel>
      <div className="grid flex-1 grid-cols-2 gap-4">
        <Stat
          label="Total"
          value={stats?.totalVMs}
          total={undefined}
          subtitle="VMs currently active across the network"
          isLoading={isLoading}
          href="/vms"
          index={2}
        />
        <Stat
          label="Dispatched"
          value={stats?.dispatchedVMs}
          total={stats?.totalVMs}
          subtitle="VMs running on their correct assigned node"
          isLoading={isLoading}
          icon={iconCheck}
          href="/vms?status=dispatched"
          index={3}
          {...(hasDispatched
            ? {
                color: "var(--color-success-500)",
                tint: "var(--color-success-500)",
              }
            : {})}
        />
      </div>
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 ${
        className ?? ""
      }`}
    >
      {children}
    </p>
  );
}
