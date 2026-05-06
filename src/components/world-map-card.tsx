"use client";

import Image from "next/image";
import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aleph-front/ds/tooltip";
import { useNodeLocations } from "@/hooks/use-node-locations";
import {
  hashToSeed,
  mercator,
  mulberry32,
} from "@/lib/world-map-projection";

const VIEW_X = 100;
const VIEW_Y = 140;
const VIEW_W = 600;
const VIEW_H = 333;

const VEMAPS_MERCATOR = {
  centerX: 400.8,
  equatorY: 395.7,
  R: 117.27,
  lngOffset: 11,
};

function ExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function WorldMapCard() {
  const project = useMemo(() => mercator(VEMAPS_MERCATOR), []);
  const dots = useNodeLocations(project);

  return (
    <div
      className="relative flex aspect-[9/5] h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03]"
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--map-dot-color) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-success-500)" }}
          />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Aleph Cloud Nodes
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <button
                  type="button"
                  disabled
                  aria-label="Expand world map (coming soon)"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ExpandIcon />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">Coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="relative flex-1">
        <Image
          src="/world-map.svg"
          alt=""
          fill
          unoptimized
          className="select-none object-cover opacity-20 dark:opacity-100"
          priority
        />
        <svg
          viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {dots.map((dot) => {
            const rand = mulberry32(hashToSeed(dot.hash));
            const delay = rand() * 5;
            const duration = 4 + rand() * 2;
            return (
              <circle
                key={dot.hash}
                cx={dot.x}
                cy={dot.y}
                r={2}
                fill="var(--color-success-500)"
                fillOpacity={0.7}
                className="node-dot"
                style={{
                  animation: `node-dot-flicker ${duration.toFixed(
                    2,
                  )}s ease-in-out ${delay.toFixed(2)}s infinite`,
                }}
              />
            );
          })}
        </svg>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: "inset 0 0 120px 0 var(--map-vignette)" }}
      />

      <a
        href="https://www.vemaps.com/"
        target="_blank"
        rel="noopener"
        className="absolute bottom-3 left-5 z-10 text-[6px] uppercase tracking-wider text-muted-foreground/20 hover:text-muted-foreground/40"
      >
        Map by Vemaps.com
      </a>
    </div>
  );
}
