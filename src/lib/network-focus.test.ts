import { describe, expect, it } from "vitest";
import { egoSubgraph } from "./network-focus";
import type { Graph } from "./network-graph-model";

const sample: Graph = {
  nodes: [
    {
      id: "c1", kind: "ccn", label: "c1", status: "active",
      owner: "0xA", reward: "0xR", inactive: false,
    },
    {
      id: "r1", kind: "crn", label: "r1", status: "active",
      owner: "0xA", reward: "0xR", inactive: false,
    },
    {
      id: "r2", kind: "crn", label: "r2", status: "active",
      owner: "0xB", reward: "0xR", inactive: false,
    },
    {
      id: "r3", kind: "crn", label: "r3", status: "active",
      owner: "0xC", reward: "0xX", inactive: false,
    },
  ],
  edges: [
    { source: "c1", target: "r1", type: "structural" },
    { source: "c1", target: "r2", type: "structural" },
    { source: "r2", target: "r3", type: "owner" },
  ],
};

describe("egoSubgraph", () => {
  it("returns the focus node + its 1-hop neighbors only", () => {
    const result = egoSubgraph(sample, "c1");
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["c1", "r1", "r2"]);
  });

  it("returns only edges where both endpoints are in the ego set", () => {
    const result = egoSubgraph(sample, "c1");
    expect(result.edges).toHaveLength(2);
    expect(result.edges.every((e) =>
      ["c1", "r1", "r2"].includes(e.source) &&
      ["c1", "r1", "r2"].includes(e.target),
    )).toBe(true);
  });

  it("returns just the node when it has no neighbors", () => {
    const isolated: Graph = {
      nodes: [{
        id: "x", kind: "ccn", label: "x", status: "active",
        owner: null, reward: null, inactive: false,
      }],
      edges: [],
    };
    expect(egoSubgraph(isolated, "x").nodes).toHaveLength(1);
  });

  it("returns empty when the focus id is not in the graph", () => {
    expect(egoSubgraph(sample, "missing").nodes).toHaveLength(0);
  });
});
