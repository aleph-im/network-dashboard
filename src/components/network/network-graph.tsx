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
import { drag as d3drag } from "d3-drag";
import { select } from "d3-selection";
import "d3-transition";
import type {
  Graph,
  GraphLayer,
  GraphNode,
} from "@/lib/network-graph-model";
import { NetworkNode, RADIUS } from "./network-node";
import { NetworkEdge } from "./network-edge";

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & { type: GraphLayer };

export type HoverPos = { clientX: number; clientY: number };

type Props = {
  graph: Graph;
  selectedId: string | null;
  highlightedIds: Set<string>;
  onNodeHover: (node: GraphNode | null, pos: HoverPos | null) => void;
  onNodeClick: (node: GraphNode) => void;
};

const SIM_DECAY = 0.05;
const HIT_RADIUS = 12;
const MIN_FIT_ZOOM = 0.6;
const LABEL_ZOOM_THRESHOLD = 1.5;

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
  const fit = Math.min(size.w / (dx * 1.4), size.h / (dy * 1.4), 4);
  const k = Math.max(fit, MIN_FIT_ZOOM);
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
  const dragInProgressRef = useRef(false);
  const userMovedRef = useRef(false);
  const [, setTickKey] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

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
    userMovedRef.current = false;
  }, [graph, highlightedIds]);

  const refitRef = useRef<() => void>(() => {});
  refitRef.current = () => {
    if (userMovedRef.current) return;
    if (!svgRef.current || !zoomRef.current || simNodes.length === 0) return;
    const t = fitTransform(simNodes, highlightedIds, size);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    const sel = select(svgRef.current);
    const transform = zoomIdentity.translate(t.x, t.y).scale(t.k);
    if (reduced) {
      sel.call(zoomRef.current.transform, transform);
    } else {
      sel.transition().duration(450).call(zoomRef.current.transform, transform);
    }
  };

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
      })
      .on("end", () => refitRef.current());

    simRef.current = sim;
    return () => {
      sim.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // Center force is updated separately on size change without restarting
    // the simulation, so that clicking a node (which resizes the viewport
    // when the detail panel opens) doesn't shift the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simNodes, simLinks]);

  useEffect(() => {
    if (!simRef.current) return;
    simRef.current.force("center", forceCenter(size.w / 2, size.h / 2));
  }, [size.w, size.h]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .extent((): [[number, number], [number, number]] => {
        const svg = svgRef.current;
        if (!svg) return [[0, 0], [800, 600]];
        return [[0, 0], [svg.clientWidth, svg.clientHeight]];
      })
      .filter((event: Event) => {
        if (event.type === "wheel") return true;
        const target = event.target as Element | null;
        if (target?.closest("g[data-id]")) return false;
        const me = event as unknown as { button?: number };
        return !me.button;
      })
      .on("zoom", (event) => {
        if (gRef.current) {
          gRef.current.setAttribute("transform", event.transform.toString());
        }
        if (event.sourceEvent != null) {
          userMovedRef.current = true;
        }
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });
    zoomRef.current = z;
    select(svgRef.current).call(z);
    const svg = svgRef.current;
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  useEffect(() => {
    if (!gRef.current || !simRef.current) return;
    const sim = simRef.current;
    const lookup = new Map<string, SimNode>();
    for (const n of simNodes) lookup.set(n.id, n);

    const dragBehavior = d3drag<SVGGElement, unknown>()
      .on("start", function (event) {
        const id = this.dataset["id"];
        if (!id) return;
        const d = lookup.get(id);
        if (!d) return;
        dragInProgressRef.current = true;
        userMovedRef.current = true;
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x ?? 0;
        d.fy = d.y ?? 0;
      })
      .on("drag", function (event) {
        const id = this.dataset["id"];
        if (!id) return;
        const d = lookup.get(id);
        if (!d) return;
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", function (event) {
        dragInProgressRef.current = false;
        if (!event.active) sim.alphaTarget(0);
      });

    select(gRef.current)
      .selectAll<SVGGElement, unknown>("g[data-id]")
      .call(dragBehavior);
  }, [simNodes]);

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
    if (dragInProgressRef.current) return;
    const local = localPoint(e);
    if (!local || !quadtreeRef.current) return;
    const found = quadtreeRef.current.find(local.x, local.y, HIT_RADIUS);
    onNodeHover(
      found ?? null,
      found ? { clientX: e.clientX, clientY: e.clientY } : null,
    );
  }, [localPoint, onNodeHover]);

  const onClickSvg = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if (dragInProgressRef.current) return;
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
      onNodeHover(null, null);
    }
  }, [graph, selectedId, onNodeClick, onNodeHover]);

  useEffect(() => {
    const id = requestAnimationFrame(() => refitRef.current());
    return () => cancelAnimationFrame(id);
  }, [graph, highlightedIds, simNodes]);

  const transformRef = useRef(transform);
  transformRef.current = transform;

  useEffect(() => {
    if (!selectedId || !zoomRef.current || !svgRef.current) return;
    const pos = positionsRef.current.get(selectedId);
    if (!pos) return;
    const svg = svgRef.current;
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const t = transformRef.current;
    const sx = pos.x * t.k + t.x;
    const sy = pos.y * t.k + t.y;
    const margin = 80;
    const onScreen =
      sx > margin && sx < w - margin && sy > margin && sy < h - margin;
    if (onScreen) return;

    const targetK = Math.max(t.k, 1.2);
    const next = zoomIdentity
      .translate(w / 2 - pos.x * targetK, h / 2 - pos.y * targetK)
      .scale(targetK);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    const sel = select(svg);
    if (reduced) {
      sel.call(zoomRef.current.transform, next);
    } else {
      sel.transition().duration(450).call(zoomRef.current.transform, next);
    }
  }, [selectedId]);

  const showLabels = transform.k >= LABEL_ZOOM_THRESHOLD;

  return (
    <div className="relative size-full">
      <svg
        ref={svgRef}
        className="size-full text-muted-foreground outline-none"
        tabIndex={0}
        aria-label="Network graph"
        onMouseMove={onMove}
        onMouseLeave={() => onNodeHover(null, null)}
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
                id={n.id}
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

      {showLabels && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {graph.nodes.map((n) => {
            if (n.kind === "staker" || n.kind === "reward") return null;
            const p = positionsRef.current.get(n.id);
            if (!p) return null;
            const sx = p.x * transform.k + transform.x;
            const sy = p.y * transform.k + transform.y;
            const gap = RADIUS[n.kind] * transform.k + 4;
            return (
              <span
                key={`label-${n.id}`}
                className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-muted-foreground/80"
                style={{ left: `${sx}px`, top: `${sy + gap}px` }}
              >
                {n.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
