import { describe, expect, it } from "vitest";
import type { CCNInfo, CRNInfo, NodeState } from "@/api/credit-types";
import { buildGraph, type GraphLayer } from "./network-graph-model";

function makeState(overrides?: {
  ccns?: CCNInfo[];
  crns?: CRNInfo[];
}): NodeState {
  const ccns = new Map<string, CCNInfo>();
  const crns = new Map<string, CRNInfo>();
  for (const c of overrides?.ccns ?? []) ccns.set(c.hash, c);
  for (const r of overrides?.crns ?? []) crns.set(r.hash, r);
  return { ccns, crns };
}

function ccn(hash: string, partial?: Partial<CCNInfo>): CCNInfo {
  return {
    hash,
    name: `ccn-${hash}`,
    owner: "0xowner",
    reward: "0xreward",
    score: 0.9,
    status: "active",
    stakers: {},
    totalStaked: 0,
    inactiveSince: null,
    resourceNodes: [],
    ...partial,
  };
}

function crn(hash: string, partial?: Partial<CRNInfo>): CRNInfo {
  return {
    hash,
    name: `crn-${hash}`,
    owner: "0xowner",
    reward: "0xreward",
    score: 0.9,
    status: "active",
    inactiveSince: null,
    parent: null,
    ...partial,
  };
}

describe("buildGraph", () => {
  it("emits CCN + CRN nodes with structural edges by default", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1", "r2"] })],
      crns: [crn("r1", { parent: "c1" }), crn("r2", { parent: "c1" })],
    });

    const layers: Set<GraphLayer> = new Set(["structural"]);
    const graph = buildGraph(state, layers);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["c1", "r1", "r2"]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.every((e) => e.type === "structural")).toBe(true);
  });
});

describe("buildGraph layers", () => {
  it("draws owner edges between nodes sharing an owner address", () => {
    const state = makeState({
      ccns: [ccn("c1", { owner: "0xA" })],
      crns: [
        crn("r1", { owner: "0xA" }),
        crn("r2", { owner: "0xA" }),
        crn("r3", { owner: "0xB" }),
      ],
    });

    const graph = buildGraph(state, new Set(["owner"]));
    const ownerEdges = graph.edges.filter((e) => e.type === "owner");

    expect(ownerEdges).toHaveLength(3);
    expect(ownerEdges.every((e) =>
      ["c1", "r1", "r2"].includes(e.source) &&
      ["c1", "r1", "r2"].includes(e.target),
    )).toBe(true);
  });

  it("emits staker dot nodes + edges only when staker layer is on", () => {
    const state = makeState({
      ccns: [ccn("c1", { stakers: { "0xS1": 100, "0xS2": 200 } })],
    });

    const without = buildGraph(state, new Set(["structural"]));
    expect(without.nodes.find((n) => n.kind === "staker")).toBeUndefined();

    const withLayer = buildGraph(state, new Set(["structural", "staker"]));
    const stakerNodes = withLayer.nodes.filter((n) => n.kind === "staker");
    const stakerEdges = withLayer.edges.filter((e) => e.type === "staker");
    expect(stakerNodes.map((n) => n.id).sort()).toEqual(["0xS1", "0xS2"]);
    expect(stakerEdges).toHaveLength(2);
  });

  it("emits reward-address cluster edges when reward layer is on", () => {
    const state = makeState({
      ccns: [ccn("c1", { reward: "0xR" })],
      crns: [
        crn("r1", { reward: "0xR" }),
        crn("r2", { reward: "0xR" }),
      ],
    });

    const graph = buildGraph(state, new Set(["reward"]));
    const rewardEdges = graph.edges.filter((e) => e.type === "reward");
    expect(rewardEdges).toHaveLength(3);
  });

  it("returns no edges when no layers are active", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1" })],
    });
    expect(buildGraph(state, new Set()).edges).toHaveLength(0);
  });
});
