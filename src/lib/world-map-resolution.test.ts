import { describe, expect, it } from "vitest";
import {
  parseHostname,
  parseIpv4FromMultiaddr,
} from "@/lib/world-map-resolution";

describe("parseIpv4FromMultiaddr", () => {
  it("extracts IPv4 from /ip4/.../tcp/... multiaddr", () => {
    expect(
      parseIpv4FromMultiaddr(
        "/ip4/46.255.204.193/tcp/4025/p2p/Qmb5b2ZwJm9pVWrppf3D3iMF1bXbjZhbJTwGvKEBMZNxa2",
      ),
    ).toBe("46.255.204.193");
  });

  it("returns null for /dns4/... multiaddr", () => {
    expect(parseIpv4FromMultiaddr("/dns4/example.com/tcp/443")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseIpv4FromMultiaddr("")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseIpv4FromMultiaddr("not-a-multiaddr")).toBeNull();
  });

  it("returns null for /ip6/... multiaddr", () => {
    expect(parseIpv4FromMultiaddr("/ip6/::1/tcp/4025")).toBeNull();
  });
});

describe("parseHostname", () => {
  it("extracts hostname from a full HTTPS URL", () => {
    expect(parseHostname("https://a-node-719754-y.tokenchain.network")).toBe(
      "a-node-719754-y.tokenchain.network",
    );
  });

  it("extracts hostname from an HTTPS URL with a path", () => {
    expect(parseHostname("https://example.com/path?q=1")).toBe("example.com");
  });

  it("returns null for empty string", () => {
    expect(parseHostname("")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseHostname("not a url")).toBeNull();
  });
});
