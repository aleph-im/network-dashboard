import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import countries from "world-countries";

type Centroid = { lat: number; lng: number; name: string };

const out: Record<string, Centroid> = {};
for (const c of countries) {
  if (!c.cca2 || !Array.isArray(c.latlng) || c.latlng.length !== 2) continue;
  const [lat, lng] = c.latlng;
  if (typeof lat !== "number" || typeof lng !== "number") continue;
  out[c.cca2] = { lat, lng, name: c.name.common };
}

const path = "src/data/country-centroids.json";
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} country centroids to ${path}`);
