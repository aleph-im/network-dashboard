# API IPv6 Fallback

**Date:** 2026-03-13
**Status:** Parked — needs server-side config before dashboard code changes are useful
**Branch:** `fix/api-ipv6-fallback` (code changes ready, not merged)

## Problem

The scheduler API VM (`rust-scheduler.aleph.im`) has lost IPv4 connectivity due to networking issues on the host node. The VM is only reachable via IPv6 at `2a05:6e02:1067:f510:be24:11ff:fe39:a187`. The domain currently only has an A record (IPv4), so DNS resolution fails for users whose ISP/network doesn't have a working IPv4 route to the server.

## What we found

| Test | Result |
|------|--------|
| Ping IPv6 | Works (12ms) |
| `https://[ipv6]/health` | 400 — Caddy doesn't recognize raw IP as a valid host |
| `http://[ipv6]:80/health` | 404 — hits the old Python/aiohttp v0 API |
| `curl --resolve rust-scheduler.aleph.im:443:[ipv6] https://rust-scheduler.aleph.im/health` | 200 — works when SNI/Host header matches the domain |

The server works fine over IPv6. The issue is routing: Caddy uses the `Host` header to decide which backend to proxy to, and a raw IPv6 address doesn't match the `rust-scheduler.aleph.im` site block.

## Options for ops

### Option A: Add AAAA DNS record (recommended)

Add an AAAA record for `rust-scheduler.aleph.im` pointing to `2a05:6e02:1067:f510:be24:11ff:fe39:a187`.

- Zero code changes needed — existing domain + TLS cert work over IPv6
- Browsers with IPv6 connectivity will automatically prefer it when IPv4 is unreachable (Happy Eyeballs algorithm)
- No dashboard changes required, can discard the `fix/api-ipv6-fallback` branch

### Option B: Configure Caddy to accept IPv6 address directly

Add the IPv6 address as a site block in Caddy config so `https://[2a05:6e02:...]/` routes to the scheduler backend.

```
https://[2a05:6e02:1067:f510:be24:11ff:fe39:a187] {
    # TLS: either internal (self-signed) or use an IP-compatible cert
    tls internal
    reverse_proxy localhost:<scheduler-port>
}
```

- Requires dashboard code changes (the `fix/api-ipv6-fallback` branch)
- Self-signed cert (`tls internal`) will show browser warnings unless users accept it
- Caddy can auto-provision certs for IPs via ACME `tls-alpn-01` challenge if the CA supports it, but Let's Encrypt does not issue IP certs

### Option C: Both

Add AAAA record (fixes it for everyone) and keep the code fallback as a safety net. The dashboard tries the domain first; if it fails (network error), it retries against the IPv6 URL.

## Dashboard code changes (branch: fix/api-ipv6-fallback)

Ready to merge once the server-side config is in place:

- `src/api/client.ts` — added `fetchWithFallback()` that retries on network errors using `NEXT_PUBLIC_API_URL_FALLBACK`
- `src/app/status/page.tsx` — removed duplicate `getBaseUrl()`, uses shared fallback logic
- `.env.local` — added `NEXT_PUBLIC_API_URL_FALLBACK=https://[2a05:6e02:1067:f510:be24:11ff:fe39:a187]`

## Next steps

1. Ops decides which option (A, B, or C)
2. If Option A only: discard the branch, no code changes needed
3. If Option B or C: merge `fix/api-ipv6-fallback` after server config is done and we verify `https://[ipv6]/health` returns 200
