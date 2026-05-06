import { describe, expect, it } from "vitest";
import {
  hashToSeed,
  mulberry32,
  project,
  scatter,
} from "@/lib/world-map-projection";

describe("project", () => {
  it("places (0, 0) at the center of the SVG", () => {
    const { x, y } = project(0, 0, 600, 300);
    expect(x).toBeCloseTo(300, 5);
    expect(y).toBeCloseTo(150, 5);
  });

  it("places (90, -180) at the top-left corner", () => {
    const { x, y } = project(90, -180, 600, 300);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  it("places (-90, 180) at the bottom-right corner", () => {
    const { x, y } = project(-90, 180, 600, 300);
    expect(x).toBeCloseTo(600, 5);
    expect(y).toBeCloseTo(300, 5);
  });

  it("places NYC (40.7, -74) in the upper-left quadrant", () => {
    const { x, y } = project(40.7, -74, 600, 300);
    expect(x).toBeGreaterThan(150);
    expect(x).toBeLessThan(200);
    expect(y).toBeGreaterThan(70);
    expect(y).toBeLessThan(110);
  });
});

describe("hashToSeed", () => {
  it("returns the same seed for the same hash", () => {
    expect(hashToSeed("abc123")).toBe(hashToSeed("abc123"));
  });

  it("returns different seeds for different hashes", () => {
    expect(hashToSeed("abc123")).not.toBe(hashToSeed("def456"));
  });

  it("returns a non-negative 32-bit integer", () => {
    const seed = hashToSeed(
      "6c7578899ac475fbdc05c6a4711331c7590aa6b719f0c169941b99a10faf1136",
    );
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(Number.isInteger(seed)).toBe(true);
  });
});

describe("mulberry32", () => {
  it("produces deterministic sequences for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("scatter", () => {
  it("returns the same offset for the same hash", () => {
    const a = scatter("hash-A");
    const b = scatter("hash-A");
    expect(a).toEqual(b);
  });

  it("returns different offsets for different hashes", () => {
    const a = scatter("hash-A");
    const b = scatter("hash-B");
    expect(a).not.toEqual(b);
  });

  it("stays within the configured radius (~1.5 degrees)", () => {
    for (const h of ["a", "b", "cdef123", "long-hash-xyz"]) {
      const { dLat, dLng } = scatter(h);
      const r = Math.hypot(dLat, dLng);
      expect(r).toBeLessThanOrEqual(1.5 + 1e-9);
    }
  });
});
