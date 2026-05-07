"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { quadtree, type Quadtree } from "d3-quadtree";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import "d3-transition";
import type {
  Graph,
  GraphLayer,
  GraphNode,
} from "@/lib/network-graph-model";
import { NetworkNode } from "./network-node";
import { NetworkEdge } from "./network-edge";

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & { type: GraphLayer };

type Props = {
  graph: Graph;
  selectedId: string | null;
  highlightedIds: Set<string>;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeClick: (node: GraphNode) => void;
};

const SIM_DECAY = 0.05;
const HIT_RADIUS = 12;

function fitTransform(
  nodes: SimNode[],
  ids: Set<string> | null,
  size: { w: number; h: number },
): { x: number; y: number; k: number } {
  const pool = ids && ids.size > 0
    ? nodes.filter((n) => ids.has(n.id))
    : nodes;
  if (pool.length === 0) return { x: 0, y: 0, k: 1 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of pool) {
    if (n.x == null || n.y == null) continue;
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, k: 1 };
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const k = Math.min(size.w / (dx * 1.4), size.h / (dy * 1.4), 4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k };
}

export function NetworkGraph({
  graph, selectedId, highlightedIds, onNodeHover, onNodeClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const quadtreeRef = useRef<Quadtree<SimNode> | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const rafRef = useRef<number>(0);
  const [, setTickKey] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  const simNodes = useMemo<SimNode[]>(() => {
    return graph.nodes.map((n) => {
      const prev = positionsRef.current.get(n.id);
      return {
        ...n,
        ...(prev ? { x: prev.x, y: prev.y } : {}),
      };
    });
  }, [graph]);

  const simLinks = useMemo<SimLink[]>(
    () => graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    })),
    [graph],
  );

  useEffect(() => {
    const sim = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(60)
        .strength(0.5))
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .alphaDecay(SIM_DECAY)
      .on("tick", () => {
        for (const n of simNodes) {
          if (n.x != null && n.y != null) {
            positionsRef.current.set(n.id, { x: n.x, y: n.y });
          }
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            quadtreeRef.current = quadtree<SimNode>()
              .x((d) => d.x ?? 0)
              .y((d) => d.y ?? 0)
              .addAll(simNodes);
            setTickKey((k) => k + 1);
            rafRef.current = 0;
          });
        }
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [simNodes, simLinks, size.w, size.h]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        if (gRef.current) {
          gRef.current.setAttribute("transform", event.transform.toString());
        }
      });
    zoomRef.current = z;
    select(svgRef.current).call(z);
    const svg = svgRef.current;
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const localPoint = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || !gRef.current) return null;
      const ctm = gRef.current.getScreenCTM();
      if (!ctm) return null;
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(ctm.inverse());
    },
    [],
  );

  const onMove = useCallback((e: MouseEvent<SVGSVGElement>) => {
    const local = localPoint(e);
    if (!local || !quadtreeRef.current) return;
    const found = quadtreeRef.current.find(local.x, local.y, HIT_RADIUS);
    onNodeHover(found ?? null);
  }, [localPoint, onNodeHover]);

  const onClickSvg = useCallback((e: MouseEvent<SVGSVGElement>) => {
    const local = localPoint(e);
    if (!local || !quadtreeRef.current) return;
    const found = quadtreeRef.current.find(local.x, local.y, HIT_RADIUS);
    if (found) onNodeClick(found);
  }, [localPoint, onNodeClick]);

  const onKeyDown = useCallback((e: KeyboardEvent<SVGSVGElement>) => {
    if (graph.nodes.length === 0) return;
    const sorted = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const currentIdx = selectedId
      ? sorted.findIndex((n) => n.id === selectedId)
      : -1;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = sorted[(currentIdx + 1 + sorted.length) % sorted.length]!;
      onNodeClick(next);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = sorted[(currentIdx - 1 + sorted.length) % sorted.length]!;
      onNodeClick(next);
    } else if (e.key === "Escape") {
      onNodeHover(null);
    }
  }, [graph, selectedId, onNodeClick, onNodeHover]);

  useEffect(() => {
    if (!svgRef.current || !zoomRef.current || simNodes.length === 0) return;
    const svg = svgRef.current;
    const z = zoomRef.current;
    const id = requestAnimationFrame(() => {
      const t = fitTransform(simNodes, highlightedIds, size);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches;
      const sel = select(svg);
      const transform = zoomIdentity.translate(t.x, t.y).scale(t.k);
      if (reduced) {
        sel.call(z.transform, transform);
      } else {
        sel.transition().duration(450).call(z.transform, transform);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [graph, highlightedIds, size, simNodes]);

  return (
    <svg
      ref={svgRef}
      className="size-full text-muted-foreground outline-none"
      tabIndex={0}
      aria-label="Network graph"
      onMouseMove={onMove}
      onMouseLeave={() => onNodeHover(null)}
      onClick={onClickSvg}
      onKeyDown={onKeyDown}
    >
      <g ref={gRef}>
        {graph.edges.map((e) => {
          const a = positionsRef.current.get(e.source);
          const b = positionsRef.current.get(e.target);
          if (!a || !b) return null;
          return (
            <NetworkEdge
              key={`${e.source}-${e.target}-${e.type}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              type={e.type}
              faded={false}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = positionsRef.current.get(n.id);
          if (!p) return null;
          return (
            <NetworkNode
              key={n.id}
              x={p.x} y={p.y}
              kind={n.kind}
              status={n.status}
              selected={n.id === selectedId}
              highlighted={highlightedIds.has(n.id)}
              inactive={n.inactive}
            />
          );
        })}
      </g>
    </svg>
  );
}
