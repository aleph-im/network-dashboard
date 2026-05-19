import { describe, expect, it } from "vitest";
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import type { CCNInfo, CRNInfo, NodeState } from "@/api/credit-types";
import { aggregateCountries, aggregateRewards } from "./network-mobile-aggregates";

function ccnNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "ccn1",
    kind: "ccn",
    label: "CCN One",
    status: "active",
    owner: "0xowner1",
    reward: "0xreward1",
    inactive: false,
    ...overrides,
  };
}

function crnNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "crn1",
    kind: "crn",
    label: "CRN One",
    status: "linked",
    owner: "0xowner1",
    reward: "0xreward1",
    inactive: false,
    ...overrides,
  };
}

function ccnInfo(overrides: Partial<CCNInfo> = {}): CCNInfo {
  return {
    hash: "ccn1",
    name: "CCN One",
    owner: "0xowner1",
    reward: "0xreward1",
    score: 0.9,
    status: "active",
    stakers: {},
    totalStaked: 500_000,
    inactiveSince: null,
    resourceNodes: [],
    ...overrides,
  };
}

function crnInfo(overrides: Partial<CRNInfo> = {}): CRNInfo {
  return {
    hash: "crn1",
    name: "CRN One",
    owner: "0xowner1",
    reward: "0xreward1",
    score: 0.9,
    status: "linked",
    inactiveSince: null,
    parent: "ccn1",
    ...overrides,
  };
}

describe("aggregateCountries", () => {
  it("returns an empty array for an empty graph", () => {
    const graph: Graph = { nodes: [], edges: [] };
    expect(aggregateCountries(graph)).toEqual([]);
  });

  it("groups one CCN and one CRN with the same country", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "FR" }),
        crnNode({ id: "crn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      iso: "FR",
      name: "France",
      total: 2,
      ccns: 1,
      crns: 1,
    });
  });

  it("skips nodes without country attribution", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "FR" }),
        ccnNode({ id: "ccn2" }), // no country
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result).toHaveLength(1);
    expect(result[0]?.total).toBe(1);
  });

  it("ignores non-CCN/non-CRN nodes even if they have a country field", () => {
    const graph: Graph = {
      nodes: [
        { id: "country:FR", kind: "country", label: "France", status: "", owner: null, reward: null, inactive: false },
        ccnNode({ id: "ccn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result[0]?.total).toBe(1);
  });

  it("sorts by total desc, name asc tiebreaker", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "DE" }),
        ccnNode({ id: "ccn2", country: "FR" }),
        crnNode({ id: "crn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result.map((r) => r.iso)).toEqual(["FR", "DE"]);
  });
});

describe("aggregateRewards", () => {
  function buildNodeState(ccns: CCNInfo[], crns: CRNInfo[]): NodeState {
    return {
      ccns: new Map(ccns.map((c) => [c.hash, c])),
      crns: new Map(crns.map((c) => [c.hash, c])),
    };
  }

  it("returns an empty array when nodeState is undefined", () => {
    const graph: Graph = { nodes: [ccnNode()], edges: [] };
    expect(aggregateRewards(graph, undefined)).toEqual([]);
  });

  it("groups one CCN + one CRN sharing a reward address", () => {
    const state = buildNodeState(
      [ccnInfo({ reward: "0xAAA" })],
      [crnInfo({ reward: "0xAAA" })],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        crnNode({ id: "crn1", reward: "0xAAA" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      address: "0xaaa",
      total: 2,
      ccns: 1,
      crns: 1,
    });
  });

  it("lowercases reward addresses for grouping", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xAAA" }),
        ccnInfo({ hash: "ccn2", reward: "0xaaa" }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: "0xaaa" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
    expect(result[0]?.address).toBe("0xaaa");
    expect(result[0]?.total).toBe(2);
  });

  it("skips nodes with null reward", () => {
    const state = buildNodeState([ccnInfo({ reward: "0xAAA" })], []);
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: null }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
  });

  it("uses totalStaked as a tiebreaker when totals match", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xLOW", totalStaked: 100_000 }),
        ccnInfo({ hash: "ccn2", reward: "0xHIGH", totalStaked: 900_000 }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xLOW" }),
        ccnNode({ id: "ccn2", reward: "0xHIGH" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result.map((r) => r.address)).toEqual(["0xhigh", "0xlow"]);
  });

  it("sums totalStaked across multiple CCNs with the same reward", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xAAA", totalStaked: 100_000 }),
        ccnInfo({ hash: "ccn2", reward: "0xAAA", totalStaked: 200_000 }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: "0xAAA" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result[0]?.totalStaked).toBe(300_000);
  });
});
