import { describe, expect, it } from "vitest";
import {
  equirectangular,
  hashToSeed,
  mercator,
  mulberry32,
  networkMercator,
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

describe("equirectangular", () => {
  it("returns a projection that matches project()", () => {
    const proj = equirectangular(600, 300);
    const p1 = proj(40.7, -74);
    const p2 = project(40.7, -74, 600, 300);
    expect(p1).toEqual(p2);
  });
});

describe("mercator", () => {
  // Empirically calibrated to the Vemaps wrld-15.svg (Europe/Africa-centered)
  const VEMAPS = {
    centerX: 400.8,
    equatorY: 395.7,
    R: 117.27,
    lngOffset: 11,
  };

  it("places the equator at equatorY for any longitude", () => {
    const proj = mercator(VEMAPS);
    expect(proj(0, 11).y).toBeCloseTo(395.7, 1);
    expect(proj(0, 100).y).toBeCloseTo(395.7, 1);
  });

  it("places lng=lngOffset at centerX for any latitude", () => {
    const proj = mercator(VEMAPS);
    expect(proj(0, 11).x).toBeCloseTo(400.8, 1);
    expect(proj(50, 11).x).toBeCloseTo(400.8, 1);
  });

  it("places Greenland tip (lat 83.7, lng -33) near SVG (310, 56)", () => {
    const proj = mercator(VEMAPS);
    const { x, y } = proj(83.7, -33);
    expect(Math.abs(x - 310)).toBeLessThan(10);
    expect(Math.abs(y - 56)).toBeLessThan(10);
  });

  it("places Cape York Australia (lat -10.7, lng 142.5) near SVG (669, 417)", () => {
    const proj = mercator(VEMAPS);
    const { x, y } = proj(-10.7, 142.5);
    expect(Math.abs(x - 669)).toBeLessThan(10);
    expect(Math.abs(y - 417)).toBeLessThan(10);
  });

  it("clamps extreme latitudes to avoid Infinity at the poles", () => {
    const proj = mercator(VEMAPS);
    expect(Number.isFinite(proj(90, 0).y)).toBe(true);
    expect(Number.isFinite(proj(-90, 0).y)).toBe(true);
  });

  it("is monotonically increasing in y as lat decreases", () => {
    const proj = mercator(VEMAPS);
    expect(proj(60, 0).y).toBeLessThan(proj(50, 0).y);
    expect(proj(50, 0).y).toBeLessThan(proj(0, 0).y);
    expect(proj(0, 0).y).toBeLessThan(proj(-50, 0).y);
  });
});

describe("networkMercator", () => {
  it("projects (0, 0) to origin", () => {
    const { x, y } = networkMercator(0, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  it("projects positive latitudes to negative y (north is up)", () => {
    const { y } = networkMercator(45, 0);
    expect(y).toBeLessThan(0);
  });

  it("projects positive longitudes to positive x (east is right)", () => {
    const { x } = networkMercator(0, 90);
    expect(x).toBeGreaterThan(0);
  });

  it("is symmetric around the equator/prime meridian", () => {
    const a = networkMercator(30, 60);
    const b = networkMercator(-30, -60);
    expect(a.x).toBeCloseTo(-b.x, 5);
    expect(a.y).toBeCloseTo(-b.y, 5);
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

  it("stays within the configured ellipse (~2° lat, ~3.2° lng)", () => {
    for (const h of ["a", "b", "cdef123", "long-hash-xyz"]) {
      const { dLat, dLng } = scatter(h);
      const ellipseR = (dLat / 2) ** 2 + (dLng / (2 * 1.6)) ** 2;
      expect(ellipseR).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
