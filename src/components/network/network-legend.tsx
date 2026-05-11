"use client";

import { useSearchParams } from "next/navigation";
import { parseLayers } from "@/hooks/use-network-graph";

export function NetworkLegend() {
  const layers = parseLayers(useSearchParams().get("layers"));
  return (
    <div className="absolute bottom-4 left-4 rounded-md border border-foreground/[0.06] bg-surface/80 p-3 text-[11px] shadow-sm backdrop-blur-sm">
      <div className="mb-2 font-medium text-foreground">Legend</div>
      <ul className="space-y-1.5 text-muted-foreground">
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <circle
              cx="11" cy="7" r="6"
              fill="var(--color-primary-500)" fillOpacity={0.18}
              stroke="var(--color-primary-500)" strokeWidth={2}
            />
            <circle
              cx="11" cy="7" r="9" fill="none"
              stroke="var(--color-primary-500)" strokeOpacity={0.3}
            />
          </svg>
          CCN (active)
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <circle
              cx="11" cy="7" r="4"
              fill="var(--color-success-500)" fillOpacity={0.18}
              stroke="var(--color-success-500)" strokeWidth={2}
            />
          </svg>
          CRN (active)
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line
              x1="2" y1="7" x2="20" y2="7"
              stroke="currentColor" strokeOpacity={0.6}
            />
          </svg>
          Structural link
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line
              x1="2" y1="7" x2="20" y2="7"
              stroke="currentColor" strokeOpacity={0.2}
              strokeWidth={0.5}
              strokeDasharray="1.5 1" strokeLinecap="round"
            />
          </svg>
          Same owner
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line
              x1="2" y1="7" x2="20" y2="7"
              stroke="var(--color-warning-500)" strokeOpacity={0.4}
            />
          </svg>
          Stake link
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line
              x1="2" y1="7" x2="20" y2="7"
              stroke="var(--network-edge-reward)" strokeOpacity={0.4}
              strokeWidth={0.5}
              strokeDasharray="0 0.4" strokeLinecap="round"
            />
          </svg>
          Reward cluster
        </li>
        {layers.has("geo") && (
          <li className="flex items-center gap-2">
            <svg width="22" height="14" viewBox="0 0 22 14">
              <circle
                cx="11" cy="7" r="6"
                fill="var(--network-country)" fillOpacity={0.18}
                stroke="var(--network-country)" strokeWidth={2}
              />
              <circle
                cx="11" cy="7" r="9" fill="none"
                stroke="var(--network-country)" strokeOpacity={0.3}
              />
            </svg>
            Country
          </li>
        )}
      </ul>
    </div>
  );
}
