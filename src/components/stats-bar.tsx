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

/* Phosphor-style inline SVG icons (bold weight, 16px) */
const iconCheck = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z" />
  </svg>
);
const iconWifiSlash = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M56.88,31.93A12,12,0,1,0,39.12,48.07l17,18.72A177.4,177.4,0,0,0,21.08,96.28a12,12,0,0,0,17.84,16.08,153.24,153.24,0,0,1,30.88-25.8l22.7,24.97a117.3,117.3,0,0,0-32.42,22.35,12,12,0,0,0,16.84,17.12,93.2,93.2,0,0,1,31.2-19.43l25.46,28A57.07,57.07,0,0,0,100.5,175a12,12,0,0,0,16.56,17.37A33,33,0,0,1,128,188a33.16,33.16,0,0,1,16,4.11l55.12,60.6a12,12,0,0,0,17.76-16.14ZM128,212a16,16,0,1,0,16,16A16,16,0,0,0,128,212Zm109-115.72a12,12,0,0,1-17,.64,153.4,153.4,0,0,0-90.61-40.75,12,12,0,0,1,2.22-23.89A177.43,177.43,0,0,1,237,79.92,12,12,0,0,1,237,96.28Zm-40.08,37.6a12,12,0,0,1-16.84,1.71,93.3,93.3,0,0,0-41.77-20.47,12,12,0,0,1,4.74-23.52,117.3,117.3,0,0,1,52.16,25.44A12,12,0,0,1,196.92,133.88Z" />
  </svg>
);
const iconTrash = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M216,48H180V36A28,28,0,0,0,152,8H104A28,28,0,0,0,76,36V48H40a12,12,0,0,0,0,24h4l11.56,140.4A20,20,0,0,0,75.48,230H180.52a20,20,0,0,0,19.92-17.6L212,72h4a12,12,0,0,0,0-24ZM100,36a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4V48H100ZM176.68,206H79.32L68.12,72H187.88ZM116,104v64a12,12,0,0,1-24,0V104a12,12,0,0,1,24,0Zm48,0v64a12,12,0,0,1-24,0V104a12,12,0,0,1,24,0Z" />
  </svg>
);
const iconWarning = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M240.26,186.1,152.81,34.23a28.74,28.74,0,0,0-49.62,0L15.74,186.1a27.45,27.45,0,0,0,0,27.71A28.31,28.31,0,0,0,40.55,228h174.9a28.31,28.31,0,0,0,24.81-14.19A27.45,27.45,0,0,0,240.26,186.1Zm-20.8,15.7a4.46,4.46,0,0,1-4,2.2H40.55a4.46,4.46,0,0,1-4-2.2,3.56,3.56,0,0,1,0-3.73L124,46.2a4.77,4.77,0,0,1,8,0l87.44,151.87A3.56,3.56,0,0,1,219.46,201.8ZM116,136V104a12,12,0,0,1,24,0v32a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,176Z" />
  </svg>
);
const iconProhibit = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="size-4" fill="currentColor">
    <path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,24a83.61,83.61,0,0,1,57.49,22.85L68.85,185.49A84,84,0,0,1,128,44Zm0,168a83.61,83.61,0,0,1-57.49-22.85L187.15,70.51A84,84,0,0,1,128,212Z" />
  </svg>
);

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();

  const hasUnreachable = (stats?.unreachableNodes ?? 0) > 0;
  const hasRemoved = (stats?.removedNodes ?? 0) > 0;
  const hasDispatched = (stats?.dispatchedVMs ?? 0) > 0;
  const hasMissing = (stats?.missingVMs ?? 0) > 0;
  const hasUnschedulable = (stats?.unschedulableVMs ?? 0) > 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Section labels */}
      <p className="col-span-2 mb-[-8px] text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
        Nodes
      </p>
      <p className="col-span-2 mb-[-8px] text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 max-lg:hidden lg:pl-4">
        Virtual Machines
      </p>

      {/* Nodes (cols 1-2) */}
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

      {/* VMs (cols 3-4) — first row */}
      <p className="col-span-2 mb-[-8px] text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 lg:hidden">
        Virtual Machines
      </p>
      <Stat
        label="Total"
        value={stats?.totalVMs}
        total={undefined}
        subtitle="Virtual machines currently scheduled across the network"
        isLoading={isLoading}
        href="/vms"
        className="lg:pl-4"
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

      {/* Nodes (cols 1-2) — second row */}
      <Stat
        label="Unreachable"
        value={stats?.unreachableNodes}
        total={stats?.totalNodes}
        subtitle="Nodes that failed their last health check"
        isLoading={isLoading}
        icon={iconWifiSlash}
        href="/nodes?status=unreachable"
        index={4}
        {...(hasUnreachable
          ? {
              color: "var(--color-error-400)",
              tint: "var(--color-error-400)",
            }
          : {})}
      />
      <Stat
        label="Removed"
        value={stats?.removedNodes}
        total={stats?.totalNodes}
        subtitle="Nodes that have been deregistered from the scheduler"
        isLoading={isLoading}
        icon={iconTrash}
        href="/nodes?status=removed"
        index={5}
        {...(hasRemoved
          ? {
              color: "var(--color-muted-foreground)",
              tint: "var(--color-muted-foreground)",
            }
          : {})}
      />

      {/* VMs (cols 3-4) — second row */}
      <Stat
        label="Missing"
        value={stats?.missingVMs}
        total={stats?.totalVMs}
        subtitle="VMs expected to be running but not found on any node"
        isLoading={isLoading}
        icon={iconWarning}
        href="/vms?status=missing"
        className="lg:pl-4"
        index={6}
        {...(hasMissing
          ? {
              color: "var(--color-error-400)",
              tint: "var(--color-error-400)",
            }
          : {})}
      />
      <Stat
        label="Unschedulable"
        value={stats?.unschedulableVMs}
        total={stats?.totalVMs}
        subtitle="VMs that cannot be placed due to resource constraints"
        isLoading={isLoading}
        icon={iconProhibit}
        href="/vms?status=unschedulable"
        index={7}
        {...(hasUnschedulable
          ? {
              color: "var(--color-warning-400)",
              tint: "var(--color-warning-400)",
            }
          : {})}
      />

    </div>
  );
}
