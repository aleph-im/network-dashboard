const SCATTER_RADIUS_DEG = 1.5;

export type Point = { x: number; y: number };
export type Offset = { dLat: number; dLng: number };

export function project(
  lat: number,
  lng: number,
  width: number,
  height: number,
): Point {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export function hashToSeed(hash: string): number {
  let h = 2166136261;
  for (let i = 0; i < hash.length; i++) {
    h ^= hash.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scatter(hash: string): Offset {
  const rand = mulberry32(hashToSeed(hash));
  const angle = rand() * 2 * Math.PI;
  const radius = Math.sqrt(rand()) * SCATTER_RADIUS_DEG;
  return {
    dLat: Math.sin(angle) * radius,
    dLng: Math.cos(angle) * radius,
  };
}
