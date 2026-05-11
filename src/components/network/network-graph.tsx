"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { quadtree, type Quadtree } from "d3-quadtree";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag as d3drag } from "d3-drag";
import { select } from "d3-selection";
import "d3-transition";
import { Badge } from "@aleph-front/ds/badge";
import type {
  Graph,
  GraphLayer,
  GraphNode,
} from "@/lib/network-graph-model";
import { networkMercator } from "@/lib/world-map-projection";
import { NetworkNode, RADIUS } from "./network-node";
import { NetworkEdge } from "./network-edge";

function labelVariant(
  kind: GraphNode["kind"],
  status: string,
  inactive: boolean,
): "default" | "success" | "error" | "info" {
  if (kind === "country") return "info";
  if (inactive) return "info";
  if (status === "unreachable") return "error";
  if (kind === "ccn") return "default";
  return "success";
}

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & { type: GraphLayer };

type Props = {
  graph: Graph;
  selectedId: string | null;
  highlightedIds: Set<string>;
  refitKey: string;
  onNodeClick: (node: GraphNode) => void;
};

const SIM_DECAY = 0.05;
const HIT_RADIUS = 12;
const MIN_FIT_ZOOM = 0.3;
const LABEL_ZOOM_THRESHOLD = 1.5;

// Adaptive node sizing: at low zoom, scale nodes up so they read on screen;
// at high zoom, ease them down so dense clusters don't get crowded. Quantized
// to 0.1 steps so micro-zoom doesn't thrash 500+ memoized node renders.
function nodeScaleForZoom(k: number): number {
  let raw: number;
  if (k < 0.6) raw = 1 + (0.6 - k) * 1.5;
  else if (k > 1.5) raw = Math.max(0.7, 1 - (k - 1.5) * 0.3);
  else raw = 1;
  return Math.round(raw * 10) / 10;
}

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
  const fit = Math.min(size.w / (dx * 2), size.h / (dy * 2), 2);
  const k = Math.max(fit, MIN_FIT_ZOOM);
  // World coords are centered around (0, 0) and the SVG viewBox is symmetric
  // ([-w/2, -h/2, w, h]) so screen-center is user-coord (0, 0). The transform
  // just needs to put the bbox center at user-coord origin: translate by
  // -bboxCenter * k. preserveAspectRatio handles the rest.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: -cx * k, y: -cy * k, k };
}

export function NetworkGraph({
  graph, selectedId, highlightedIds, refitKey, onNodeClick,
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
  const longPressTimerRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const userMovedRef = useRef(false);
  const justWarmedUpRef = useRef(false);
  const [, setTickKey] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Synchronous initial measurement before paint, so the first render uses
  // real container dimensions and not the placeholder useState default.
  // ResizeObserver below handles subsequent size changes.
  useLayoutEffect(() => {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setSize({ w: r.width, h: r.height });
    }
  }, []);

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
    const initialAngle = Math.PI * (3 - Math.sqrt(5));
    const wasEmpty = positionsRef.current.size === 0;
    const seeded: SimNode[] = graph.nodes.map((n, i) => {
      let p = positionsRef.current.get(n.id);
      if (n.kind === "country" && n.geo) {
        const projected = networkMercator(n.geo.lat, n.geo.lng);
        p = projected;
        positionsRef.current.set(n.id, p);
        return { ...n, x: p.x, y: p.y, fx: p.x, fy: p.y };
      }
      if (!p) {
        const radius = 10 * Math.sqrt(0.5 + i);
        const angle = i * initialAngle;
        p = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
        positionsRef.current.set(n.id, p);
      }
      return { ...n, x: p.x, y: p.y };
    });

    // Pre-warm: on a fresh mount (first load or reset-view) the spiral seed
    // is tight, so the live simulation would visibly expand it over many
    // ticks before the camera re-fits — felt like a multi-second swoop.
    // Run a throwaway simulation synchronously here so positions are already
    // converged on the first paint; the camera then fits the final layout in
    // one transition, instead of fitting the spiral and re-fitting on end.
    if (wasEmpty && seeded.length > 0) {
      const warmupLinks: SimLink[] = graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      }));
      const warmupGeo = warmupLinks.filter((l) => l.type === "geo");
      const warmupOther = warmupLinks.filter((l) => l.type !== "geo");
      const warmup = forceSimulation<SimNode>(seeded)
        .force("link", forceLink<SimNode, SimLink>(warmupOther)
          .id((d) => d.id)
          .distance(60))
        .force("geo", forceLink<SimNode, SimLink>(warmupGeo)
          .id((d) => d.id)
          .distance(40)
          .strength(0.6))
        .force("charge", forceManyBody().strength(-180))
        .alphaDecay(SIM_DECAY)
        .stop();
      warmup.tick(300);
      for (const n of seeded) {
        if (n.x != null && n.y != null) {
          positionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      }
      justWarmedUpRef.current = true;
    } else {
      justWarmedUpRef.current = false;
    }

    return seeded;
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
  }, [refitKey]);

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
    const geoLinks = simLinks.filter((l) => l.type === "geo");
    const otherLinks = simLinks.filter((l) => l.type !== "geo");
    const sim = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(otherLinks)
        .id((d) => d.id)
        .distance(60))
      .force("geo", forceLink<SimNode, SimLink>(geoLinks)
        .id((d) => d.id)
        .distance(40)
        .strength(0.6))
      .force("charge", forceManyBody().strength(-180))
      // Weak anchor toward world origin (= screen center via symmetric
      // viewBox). forceCenter is alpha-independent and would visibly shove
      // nodes by (w/2, h/2) on the first tick after warmup; forceX/forceY
      // scale with alpha so they're a no-op when the warmed-up sim starts
      // at alpha(0), and a gentle pull at alpha(1) for fresh layouts.
      .force("x", forceX<SimNode>(0).strength(0.02))
      .force("y", forceY<SimNode>(0).strength(0.02))
      .alpha(justWarmedUpRef.current ? 0 : 1)
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
  }, [simNodes, simLinks]);

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
      .container(() => gRef.current as SVGGElement)
      .subject((event) => {
        const target = event.sourceEvent.target as Element | null;
        const elem = target?.closest("g[data-id]") as SVGGElement | null;
        const id = elem?.dataset["id"];
        return id ? lookup.get(id) ?? null : null;
      })
      .on("start", function (event) {
        const d = event.subject as SimNode | null;
        if (!d) return;
        lastDragPointRef.current = { x: event.x, y: event.y };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          dragInProgressRef.current = true;
          userMovedRef.current = true;
          if (!event.active) sim.alphaTarget(0.05).restart();
          const last = lastDragPointRef.current;
          dragOffsetRef.current = last
            ? { x: (d.x ?? 0) - last.x, y: (d.y ?? 0) - last.y }
            : { x: 0, y: 0 };
          d.fx = d.x ?? 0;
          d.fy = d.y ?? 0;
        }, 200);
      })
      .on("drag", function (event) {
        lastDragPointRef.current = { x: event.x, y: event.y };
        if (!dragInProgressRef.current) return;
        const d = event.subject as SimNode | null;
        if (!d) return;
        const offset = dragOffsetRef.current ?? { x: 0, y: 0 };
        d.fx = event.x + offset.x;
        d.fy = event.y + offset.y;
      })
      .on("end", function (event) {
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (dragInProgressRef.current) {
          if (!event.active) {
            sim.alphaTarget(0).alphaDecay(0.15);
            sim.on("end.dragCooldown", () => {
              sim.alphaDecay(SIM_DECAY);
              sim.on("end.dragCooldown", null);
            });
          }
          dragOffsetRef.current = null;
          window.setTimeout(() => {
            dragInProgressRef.current = false;
          }, 0);
        }
        lastDragPointRef.current = null;
      });

    select(gRef.current).call(dragBehavior);
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
    }
  }, [graph, selectedId, onNodeClick]);

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
    // Symmetric viewBox: user-coord origin is at the screen center, so screen
    // pixel = w/2 + (worldX * k + tx). The translate that puts a node at
    // screen center is therefore (-worldX * k, -worldY * k).
    const sx = w / 2 + pos.x * t.k + t.x;
    const sy = h / 2 + pos.y * t.k + t.y;
    const margin = 80;
    const onScreen =
      sx > margin && sx < w - margin && sy > margin && sy < h - margin;
    if (onScreen) return;

    const targetK = Math.max(t.k, 1.2);
    const next = zoomIdentity
      .translate(-pos.x * targetK, -pos.y * targetK)
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
  const nodeScale = useMemo(
    () => nodeScaleForZoom(transform.k),
    [transform.k],
  );
  const nodeKindMap = useMemo(() => {
    const m = new Map<string, GraphNode["kind"]>();
    for (const n of graph.nodes) m.set(n.id, n.kind);
    return m;
  }, [graph]);
  const relevantIds = useMemo<Set<string> | null>(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of graph.edges) {
      if (e.source === selectedId) set.add(e.target);
      else if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, graph]);
  const arrowSize = 10 * nodeScale;

  const selectedKind = selectedId
    ? graph.nodes.find((n) => n.id === selectedId)?.kind
    : null;
  const incidentColor = selectedKind === "ccn"
    ? "var(--color-primary-500)"
    : selectedKind === "crn"
      ? "var(--color-success-500)"
      : selectedKind === "staker"
        ? "var(--color-warning-500)"
        : null;

  return (
    <div className="relative size-full">
      <svg
        ref={svgRef}
        className="size-full text-muted-foreground outline-none"
        viewBox={`${-size.w / 2} ${-size.h / 2} ${size.w} ${size.h}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        aria-label="Network graph"
        onClick={onClickSvg}
        onKeyDown={onKeyDown}
      >
        <defs>
          <marker
            id="arrow-end"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill="context-stroke"
              fillOpacity="0.7"
            />
          </marker>
        </defs>
        <g ref={gRef}>
          {graph.edges.map((e) => {
            if (e.type === "geo") return null;
            const a = positionsRef.current.get(e.source);
            const b = positionsRef.current.get(e.target);
            if (!a || !b) return null;
            const isIncident = selectedId != null
              && (e.source === selectedId || e.target === selectedId);
            const targetIsCrn = nodeKindMap.get(e.target) === "crn";
            const withArrow = e.type === "structural" && targetIsCrn;
            let x2 = b.x;
            let y2 = b.y;
            if (withArrow) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const L = Math.sqrt(dx * dx + dy * dy);
              if (L > 0) {
                const backoff = RADIUS.crn * nodeScale + 1.5;
                const t = Math.min(1, backoff / L);
                x2 = b.x - dx * t;
                y2 = b.y - dy * t;
              }
            }
            return (
              <NetworkEdge
                key={`${e.source}-${e.target}-${e.type}`}
                x1={a.x} y1={a.y} x2={x2} y2={y2}
                type={e.type}
                faded={selectedId != null && !isIncident}
                withArrow={withArrow}
                {...(isIncident && incidentColor
                  ? { highlightColor: incidentColor }
                  : {})}
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
                dimmed={relevantIds != null && !relevantIds.has(n.id)}
                sizeScale={nodeScale}
              />
            );
          })}
        </g>
      </svg>

      {(showLabels || graph.nodes.some((n) => n.kind === "country")) && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {graph.nodes.map((n) => {
            if (n.kind === "staker" || n.kind === "reward") return null;
            if (n.kind !== "country" && !showLabels) return null;
            const p = positionsRef.current.get(n.id);
            if (!p) return null;
            // Symmetric viewBox: world (0,0) maps to screen center, so we add
            // size/2 to convert from world to absolute container coords.
            const sx = size.w / 2 + p.x * transform.k + transform.x;
            const sy = size.h / 2 + p.y * transform.k + transform.y;
            const gap = RADIUS[n.kind] * nodeScale * transform.k + 8;
            const labelDimmed =
              relevantIds != null && !relevantIds.has(n.id);
            return (
              <Badge
                key={`label-${n.id}`}
                variant={labelVariant(n.kind, n.status, n.inactive)}
                fill="outline"
                size="sm"
                className="absolute -translate-x-1/2"
                style={{
                  left: `${sx}px`,
                  top: `${sy + gap}px`,
                  opacity: labelDimmed ? 0.18 : 1,
                }}
              >
                {n.label}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
