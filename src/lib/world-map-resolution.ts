const IPV4_FROM_MULTIADDR = /^\/ip4\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\//;

export function parseIpv4FromMultiaddr(multiaddr: string): string | null {
  if (!multiaddr) return null;
  const match = IPV4_FROM_MULTIADDR.exec(multiaddr);
  return match ? (match[1] ?? null) : null;
}

export function parseHostname(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
