"use client";

import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aleph-front/ds/tooltip";
import { useNodeLocations } from "@/hooks/use-node-locations";
import { hashToSeed, mulberry32 } from "@/lib/world-map-projection";

const VIEW_W = 1080;
const VIEW_H = 540;

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
  const dots = useNodeLocations(VIEW_W, VIEW_H);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-success-500)" }}
          />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">
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
          className="select-none object-contain opacity-70"
          priority
        />
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
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
                r={3}
                fill="var(--color-success-500)"
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

      <a
        href="https://commons.wikimedia.org/wiki/File:BlankMap-Equirectangular.svg"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 left-5 text-[10px] uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/60"
      >
        World Map · Wikimedia Commons
      </a>
    </div>
  );
}
