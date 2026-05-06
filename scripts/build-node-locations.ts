import { promises as dns } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import ip3country from "ip3country";
import {
  parseHostname,
  parseIpv4FromMultiaddr,
} from "../src/lib/world-map-resolution.ts";

ip3country.init();

const CORECHANNEL_SENDER = "0xa1B3bb7d2332383D96b7796B908fB7f7F3c2Be10";
const URL_API =
  `https://api2.aleph.im/api/v0/aggregates/${CORECHANNEL_SENDER}.json?keys=corechannel`;
const OUT = "src/data/node-locations.json";
const ABORT_FRACTION = 0.5;

type RawNode = {
  hash?: string;
  multiaddress?: string | null;
  address?: string | null;
  inactive_since?: number | null;
};

type LocationEntry = { country: string };

async function resolveIpv4(hostname: string): Promise<string | null> {
  try {
    const ips = await dns.resolve4(hostname);
    return ips[0] ?? null;
  } catch {
    return null;
  }
}

function lookupCountry(ip: string): string | null {
  try {
    const code = ip3country.lookupStr(ip);
    return code && code.length === 2 ? code : null;
  } catch {
    return null;
  }
}

async function ccnEntry(node: RawNode): Promise<[string, LocationEntry] | null> {
  if (!node.hash || node.inactive_since != null || !node.multiaddress) return null;
  const ip = parseIpv4FromMultiaddr(node.multiaddress);
  if (!ip) return null;
  const country = lookupCountry(ip);
  if (!country) return null;
  return [node.hash, { country }];
}

async function crnEntry(node: RawNode): Promise<[string, LocationEntry] | null> {
  if (!node.hash || node.inactive_since != null || !node.address) return null;
  const hostname = parseHostname(node.address);
  if (!hostname) return null;
  const ip = await resolveIpv4(hostname);
  if (!ip) return null;
  const country = lookupCountry(ip);
  if (!country) return null;
  return [node.hash, { country }];
}

function loadPrevious(): Record<string, LocationEntry> {
  if (!existsSync(OUT)) return {};
  try {
    return JSON.parse(readFileSync(OUT, "utf-8")) as Record<
      string,
      LocationEntry
    >;
  } catch {
    return {};
  }
}

async function main() {
  let resp: Response;
  try {
    resp = await fetch(URL_API);
  } catch (e) {
    console.warn("api2 unreachable, keeping existing JSON:", e);
    return;
  }
  if (!resp.ok) {
    console.warn(`api2 returned ${resp.status}, keeping existing JSON`);
    return;
  }
  const payload = (await resp.json()) as {
    data?: { corechannel?: { nodes?: RawNode[]; resource_nodes?: RawNode[] } };
  };
  const channel = payload.data?.corechannel ?? {};
  const ccnNodes = channel.nodes ?? [];
  const crnNodes = channel.resource_nodes ?? [];

  const ccnPairs = await Promise.all(ccnNodes.map(ccnEntry));
  const crnPairs = await Promise.all(crnNodes.map(crnEntry));

  const out: Record<string, LocationEntry> = {};
  for (const pair of [...ccnPairs, ...crnPairs]) {
    if (pair) out[pair[0]] = pair[1];
  }

  const prev = loadPrevious();
  const prevCount = Object.keys(prev).length;
  const newCount = Object.keys(out).length;
  if (prevCount > 0 && newCount < prevCount * ABORT_FRACTION) {
    console.warn(
      `Refusing to overwrite: new dataset (${newCount}) is < ${
        ABORT_FRACTION * 100
      }% of previous (${prevCount}). Keeping existing JSON.`,
    );
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote ${newCount} node locations to ${OUT} ` +
      `(CCN attempted: ${ccnNodes.length}, CRN attempted: ${crnNodes.length})`,
  );
}

main().catch((err) => {
  console.error("build-node-locations failed:", err);
  process.exit(1);
});
