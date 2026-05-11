const SCATTER_RADIUS_DEG = 2;
const SCATTER_LNG_STRETCH = 1.6;
const MERCATOR_LAT_LIMIT = 85;

export type Point = { x: number; y: number };
export type Offset = { dLat: number; dLng: number };
export type Projection = (lat: number, lng: number) => Point;

export type MercatorParams = {
  centerX: number;
  equatorY: number;
  R: number;
  lngOffset: number;
};

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

export function equirectangular(width: number, height: number): Projection {
  return (lat, lng) => project(lat, lng, width, height);
}

export function mercator(params: MercatorParams): Projection {
  return (lat, lng) => {
    const clampedLat = Math.max(
      -MERCATOR_LAT_LIMIT,
      Math.min(MERCATOR_LAT_LIMIT, lat),
    );
    const latRad = (clampedLat * Math.PI) / 180;
    const lngRad = ((lng - params.lngOffset) * Math.PI) / 180;
    const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return {
      x: params.centerX + params.R * lngRad,
      y: params.equatorY - params.R * mercY,
    };
  };
}

const NETWORK_MERCATOR: MercatorParams = {
  centerX: 0,
  equatorY: 0,
  R: 320,
  lngOffset: 0,
};

export const networkMercator: Projection = mercator(NETWORK_MERCATOR);

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
    dLng: Math.cos(angle) * radius * SCATTER_LNG_STRETCH,
  };
}
