import { describe, expect, it } from "vitest";
import { computeNodeDots } from "@/hooks/use-node-locations";

const centroids = {
  US: { lat: 38, lng: -97, name: "United States" },
  DE: { lat: 51, lng: 9, name: "Germany" },
};

const locations = {
  hash_us_a: { country: "US" },
  hash_de_a: { country: "DE" },
  hash_unknown_country: { country: "ZZ" },
  hash_inactive_in_snapshot: { country: "US" },
};

describe("computeNodeDots", () => {
  it("returns one dot per hash that exists in both live data and snapshot", () => {
    const dots = computeNodeDots({
      ccns: [
        { hash: "hash_us_a", inactiveSince: null },
        { hash: "hash_de_a", inactiveSince: null },
      ],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(2);
    expect(dots.map((d) => d.country).sort()).toEqual(["DE", "US"]);
  });

  it("drops nodes with no snapshot entry", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_no_snapshot", inactiveSince: null }],
      crns: [{ hash: "hash_us_a", inactiveSince: null }],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(1);
    expect(dots[0]?.hash).toBe("hash_us_a");
  });

  it("drops inactive nodes (inactiveSince != null)", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_us_a", inactiveSince: 19401322 }],
      crns: [{ hash: "hash_de_a", inactiveSince: null }],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(1);
    expect(dots[0]?.hash).toBe("hash_de_a");
  });

  it("drops nodes whose snapshot country is not in the centroid table", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_unknown_country", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    expect(dots).toHaveLength(0);
  });

  it("places the dot near the country centroid", () => {
    const dots = computeNodeDots({
      ccns: [{ hash: "hash_us_a", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    });
    const dot = dots[0];
    expect(dot).toBeDefined();
    if (!dot) return;
    const us = centroids.US;
    const expected = {
      x: ((us.lng + 180) / 360) * 600,
      y: ((90 - us.lat) / 180) * 300,
    };
    expect(Math.abs(dot.x - expected.x)).toBeLessThan(10);
    expect(Math.abs(dot.y - expected.y)).toBeLessThan(10);
  });

  it("returns deterministic positions across calls", () => {
    const args = {
      ccns: [{ hash: "hash_us_a", inactiveSince: null }],
      crns: [],
      locations,
      centroids,
      width: 600,
      height: 300,
    };
    const a = computeNodeDots(args);
    const b = computeNodeDots(args);
    expect(a).toEqual(b);
  });
});
