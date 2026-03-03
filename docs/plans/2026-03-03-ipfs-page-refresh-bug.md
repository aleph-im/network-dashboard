# IPFS Page Refresh Bug Investigation

**Date:** 2026-03-03
**Status:** Investigated — Fix Identified
**Affected pages:** `/nodes`, `/vms`

## Summary

Refreshing the browser on the `/nodes` or `/vms` pages shows the IPFS gateway's default directory listing instead of the app. Navigating to those pages via the sidebar works fine; the bug only reproduces on a hard reload.

---

## Reproduction Steps

1. Open the app at `https://bafybeiabtkpic3uaovlvczjby3srirqke2sotuwfiv4tqae4cbhu4slalm.ipfs.aleph.sh/`
2. Click **Nodes** or **VMs** in the sidebar — page loads correctly
3. Press **F5** (or Cmd+R) to reload
4. The browser now shows an IPFS directory listing: `Index of /ipfs/<CID>/nodes/`

---

## Root Cause

The bug is caused by a **mismatch between Next.js's static export file layout and the IPFS gateway's directory resolution behaviour**.

### What the build produces

Next.js is configured with `output: "export"` and **no `trailingSlash`** option (defaults to `false`). This causes the static export to emit:

```
out/
  index.html          ← root page ✅
    nodes.html          ← nodes page ✅
      vms.html            ← vms page ✅
        nodes/              ← RSC data directory (Next.js App Router payload files)
            __next._full.txt
                __next._head.txt
                    __next._index.txt
                        __next._tree.txt
                            __next.nodes.__PAGE__.txt
                                __next.nodes.txt
                                  vms/                ← RSC data directory
                                      __next._full.txt
                                          ...
                                            _next/static/       ← JS/CSS assets
                                            ```

                                            The HTML files for sub-routes are at `nodes.html` and `vms.html` — **not** `nodes/index.html` and `vms/index.html`.

                                            ### What the IPFS gateway does

                                            When the browser requests `/nodes` on reload, the IPFS gateway:

                                            1. Sees that a directory named `nodes/` exists in the CID
                                            2. Issues a **301 redirect** from `/nodes` → `/nodes/`
                                            3. Tries to serve `/nodes/index.html` inside that directory
                                            4. Finds **no `index.html`** there — only the RSC `.txt` files
                                            5. Falls back to rendering its own **directory listing** for `/nodes/`

                                            ### Confirmed via devtools

                                            File existence check results (HTTP GET, following redirects):

                                            | Path | Status |
                                            |---|---|
                                            | `/index.html` | 200 ✅ |
                                            | `/nodes.html` | 200 ✅ |
                                            | `/vms.html` | 200 ✅ |
                                            | `/nodes/index.html` | **404 ❌** |
                                            | `/vms/index.html` | **404 ❌** |

                                            Redirect chain confirmed: `GET /nodes` → **301** → `/nodes/` → **200** (IPFS directory listing, not the app).

                                            ### Why the sidebar navigation works

                                            Clicking the sidebar uses **Next.js App Router client-side navigation** (`history.pushState`). The browser never makes a server request for `/nodes` — it just updates the URL and renders the route in-memory. On reload however, the full HTTP request hits the IPFS gateway and the mismatch is exposed.

                                            ### Current `next.config.ts`

                                            ```ts
                                            const config: NextConfig = {
                                              output: "export",
                                                images: { unoptimized: true },
                                                  transpilePackages: ["@aleph-front/ds"],
                                                    turbopack: { root: "." },
                                                    };
                                                    ```

                                                    `trailingSlash` is absent, so it defaults to `false` → routes exported as `[route].html`.

                                                    ---

                                                    ## Fix Options

                                                    ### Option 1 — Add `trailingSlash: true` (Recommended)

                                                    ```ts
                                                    const config: NextConfig = {
                                                      output: "export",
                                                        trailingSlash: true,   // ← add this
                                                          images: { unoptimized: true },
                                                            transpilePackages: ["@aleph-front/ds"],
                                                              turbopack: { root: "." },
                                                              };
                                                              ```

                                                              **Effect:** Next.js will export `nodes/index.html` and `vms/index.html` instead of `nodes.html` and `vms.html`. The IPFS gateway will then correctly find `index.html` inside the `/nodes/` and `/vms/` directories on reload.

                                                              **Trade-offs:** All internal `<Link>` hrefs and `router.push()` calls will automatically use trailing slashes — Next.js handles this transparently. No other code changes needed.

                                                              **This is the simplest, most standard fix for IPFS-hosted Next.js SPAs.**

                                                              ### Option 2 — Switch to hash-based routing

                                                              Rewrite the app to use hash URLs (`/#/nodes`, `/#/vms`). Since the fragment (`#...`) is never sent to the server, the IPFS gateway always serves `index.html` from the root and the browser handles routing.

                                                              **Trade-offs:** Requires replacing all `next/link` and `next/navigation` usage with a hash router. Significant refactor. Query params (e.g. `?status=degraded`) would need to move to hash params. Not recommended.

                                                              ### Option 3 — `_redirects` file (gateway-dependent)

                                                              Some IPFS pinning services (e.g. Fleek, Cloudflare Pages) support a `_redirects` file:

                                                              ```
                                                              /nodes    /nodes.html   200
                                                              /vms      /vms.html     200
                                                              ```

                                                              **Trade-offs:** Not supported by all IPFS gateways. `aleph.sh` gateway does not support this. Not portable.

                                                              ---

                                                              ## Recommended Action

                                                              **Apply Option 1.** One-line change to `next.config.ts`. Rebuild and redeploy.

                                                              See backlog entry: `2026-03-03 — IPFS page refresh: add trailingSlash`.

                                                              ---

                                                              ## Technical Context

                                                              - **Framework:** Next.js 16.1.6, App Router, Turbopack
                                                              - **Output mode:** `output: "export"` (static HTML, no server)
                                                              - **Hosting:** IPFS via `aleph.sh` gateway (`*.ipfs.aleph.sh`)
                                                              - **CID investigated:** `bafybeiabtkpic3uaovlvczjby3srirqke2sotuwfiv4tqae4cbhu4slalm`
                                                              - **Affected routes:** `/nodes`, `/vms` (any route that has a matching RSC data subdirectory)
                                                              - **Root route unaffected:** `/` works because `index.html` exists at the root of the CID