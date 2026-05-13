export type ChangeType = "feature" | "ui" | "fix" | "infra" | "refactor";

export type ChangeEntry = {
  type: ChangeType;
  text: string;
};

export type VersionEntry = {
  version: string;
  date: string;
  changes: ChangeEntry[];
};

export const CURRENT_VERSION = "0.22.0";

export const CHANGELOG: VersionEntry[] = [
  {
    version: "0.22.0",
    date: "2026-05-13",
    changes: [
      {
        type: "feature",
        text: "Earnings tab gets a **Reward address breakdown** Card between the chart and the per-VM / linked-CRN table on both CRN and CCN node detail views. Horizontal stacked bar splits the reward address's window earnings into four buckets — this node / other same-kind nodes / cross-kind ops / staking — so operators using one reward address across many nodes can see this node's contribution in portfolio context. Bidirectional hover: hovering a segment or a legend row dims the rest. When the reward address only earned from this node in the window, a one-liner caption replaces the bar. `View full wallet →` deep links to `/wallet?address=`. No new API calls — built on the existing `summary.recipients`. Switching range (24h → 7d → 30d) now shows scoped skeletons — page chrome stays put while KPI numbers, chart area, breakdown values, and per-VM rows swap to inline placeholders during the refetch.",
      },
    ],
  },
  {
    version: "0.21.0",
    date: "2026-05-13",
    changes: [
      {
        type: "feature",
        text: "The Earnings tab chart now supports hover — move the cursor over the chart to see a bucket-anchored crosshair and a tooltip card with the bucket time, ALEPH value, and secondary count (VMs for CRN, linked CRNs for CCN). Time format adapts to bucket granularity: `MMM D · HH:MM` for the 24h range (hourly buckets), `MMM D` for 7d / 30d (daily buckets).",
      },
      {
        type: "feature",
        text: "Network graph CRN/CCN detail panels and the `/nodes` side panel now show a static **Earnings · 24h** sparkline: a mini dual-line chart with ALEPH earned + VM count (CRN) or linked-CRN count (CCN) over the last 24h, plus a caption like `12.40 ALEPH · 3.2 VMs avg`. The `/nodes` side panel drops its truncated VMs list block in exchange — the spark covers the same VM-count signal, and the full VM list is still reachable via `View full details →`.",
      },
      {
        type: "ui",
        text: "Earnings tab VM breakdown: the `+ N more` row is now a click target — expand it to see every VM that earned in the window, collapse with `Show less`.",
      },
    ],
  },
  {
    version: "0.20.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Node detail view has a new **Earnings tab** for both CRNs and CCNs at `/nodes?view=<hash>&tab=earnings`. Pick a trailing window (24h / 7d / 30d) and see ALEPH accrued plus the delta vs the previous same-length window, a dual-line chart overlaying ALEPH against VM count (CRN) or linked-CRN count (CCN), and a per-VM breakdown (CRN) or linked-CRN status list (CCN). Numbers come from the existing `aleph_credit_expense` feed using the protocol's distribution split — no new API calls. The chart's diagnostic angle (earnings dropped → VM count dropped) is the operator's primary failure mode.",
      },
      {
        type: "feature",
        text: "CCNs are finally viewable at `/nodes?view=<ccn-hash>`. The scheduler API only knows about CRNs, so CCN hashes used to land on \"Node not found\" — including the \"View full details →\" link from the network graph's CCN panel. CCNs now route to a dedicated detail view backed by the corechannel aggregate: hash, score, owner, reward, total staked, attached CRNs list, stakers table, plus the new Earnings tab.",
      },
    ],
  },
  {
    version: "0.19.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "VMs page: new **Owner address** filter in the advanced filter panel. Paste a 0x-prefixed wallet address to see only that owner's VMs — the query goes server-side (`?owners=`) so the payload shrinks from thousands to tens. Debounced 500ms, validated mid-typing without an inline error, persists via `?owner=`, and the active-filter dot on the toolbar lights up when set.",
      },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Scheduler WebSocket cache invalidation: a single app-wide WebSocket subscribes to the scheduler's new event stream and invalidates the affected React Query caches per event, so every existing page — Overview, Nodes, VMs, Issues — refreshes in near-real-time as VMs are scheduled, migrated, or fail to schedule. Polling stays as a fallback, so disconnected periods don't lose correctness. The Network Health page gains a new \"WebSocket stream\" row that surfaces connection state, event count, and last-event relative time.",
      },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Migrating VMs are now first-class: a new **Migrating** tab on `/vms` (now 4 visible status pills instead of 3), an amber warning pill across all surfaces, an Owner row sourced directly from the scheduler on VM detail, and a Migration section showing target node + time started.",
      },
      {
        type: "feature",
        text: "Network graph: migrations now render as **amber arrows** from source to target CRN, always-on (not gated by a layer toggle). The CRN detail panel shows a Migrations row with inbound/outbound counts.",
      },
      {
        type: "feature",
        text: "Issues page: when the scheduler's reported `scheduling_status` diverges from our derived `status`, Schedule vs Reality shows both side-by-side so the discrepancy has concrete grounding.",
      },
    ],
  },
  {
    version: "0.16.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Network graph CRN highlights: CRNs with score below 0.8 or that the scheduler reports as **unreachable** now wear the same amber warning ring used for understaked CCNs. The detail panel surfaces the cause — \"Unreachable — scheduler health check is failing.\" or \"Low score (X.XX) — below the 0.8 threshold.\" — with the StatusDot and Status Badge flipping to amber to match. One visual vocabulary across CCN and CRN alert states.",
      },
    ],
  },
  {
    version: "0.15.0",
    date: "2026-05-12",
    changes: [
      {
        type: "fix",
        text: "Network graph activation thresholds: a CCN now needs **500,000 ALEPH total staked** to activate (was incorrectly described as 700,000), and the owner address must hold **200,000 ALEPH on-chain** before others can stake on the node (a precondition that wasn't enforced before). Dimming is now driven from the actual stake numbers — not the API's `status` string — so the visual self-corrects when stake moves in either direction.",
      },
      {
        type: "feature",
        text: "Owner-balance lookups for CCN owners: a new `getOwnerBalances()` API + `useOwnerBalances` hook fetches each CCN owner's on-chain ALEPH balance (summed across chains) from api2.aleph.im. Powers the new 200k owner gate without requiring owners to be in their own `stakers` map (which they almost never are).",
      },
      {
        type: "ui",
        text: "Understaked CCNs now use a **warning ring** — kind color body at full opacity wrapped in an amber dotted ring — instead of the previous dim+grey-ring treatment that hid the alert state. Pending nodes are unchanged (grey body + grey pending ring). Detail panels surface the cause inline: \"Not yet active — activation needs 500,000 ALEPH total staked\" or \"Owner must hold 200,000 ALEPH before others can stake on this node\".",
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2026-05-11",
    changes: [
      {
        type: "feature",
        text: "Network graph: CCN/CRN nodes now show three distinct states. **Operational** (default) — full color. **Pending** (registered but no attached CRNs / no parent CCN) — grey with a dotted outer ring, force-clustered into a satellite group off to the side so they don't compete with the operational topology. **Understaked** (CCN with attached CRNs but under the 700,000 ALEPH activation threshold) — kind color (purple) with a dotted outer ring, stays in place to preserve its structural connections. Detail panels surface the state inline: \"Registered but not yet adopted by a CCN\" / \"Registered but has no attached CRNs yet\" / \"Not yet active — activation needs 700,000 ALEPH staked\".",
      },
      {
        type: "feature",
        text: "CRN detail panel now shows a Score row (formatted as percentage), matching the existing CCN score row.",
      },
      {
        type: "fix",
        text: "Linked CRNs now show a green StatusDot in the detail panel header and a green-outlined Status badge — they used to fall through to a yellow \"degraded\" / amber \"warning\" state because the status mapping only knew about CCN's \"active\" status.",
      },
      {
        type: "ui",
        text: "CCN score in the detail panel is now formatted as a percentage (e.g. \"92.5%\"), matching the new CRN score row.",
      },
      {
        type: "ui",
        text: "Network graph defaults: only the structural (CCN↔CRN) layer is on by default now. The staker layer used to be on too, but its cliques created too much first-paint noise — one toggle away when you want it.",
      },
      {
        type: "ui",
        text: "Network graph CRN labels now require a higher zoom level to appear (3× instead of 1.5×) so focusing a country with the geo layer on no longer drowns the cluster in overlapping CRN names. CCN and country labels keep their lower thresholds.",
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-05-11",
    changes: [
      {
        type: "feature",
        text: "Network graph search: pressing Enter on a node hash or name now zooms in on the matching node and its 1-hop neighborhood — no more squinting at the dot that just got selected. Country searches still focus the country's subgraph; address searches use their own fit path.",
      },
      {
        type: "feature",
        text: "Network graph address search: a 0x address now opens a dedicated panel (right side) listing the copyable wallet, link count, and a Staking section showing every CCN the address stakes on with per-position and total ALEPH. The spotlight dims everything outside the wallet's footprint — nodes where the address is the staker, owner, or reward target stay full opacity, the rest fade. Pulse rings still mark the matches.",
      },
      {
        type: "feature",
        text: "Network graph CCN/CRN cards: new Location row with flag emoji and country name (e.g. 🇫🇷 France) — visible regardless of whether the Geo layer is on, since country attribution is now independent of the layer toggle.",
      },
      {
        type: "ui",
        text: "Network graph search field: same width (280px) as the detail cards so the column reads as one stack, and the info-icon button shrunk to a 28×28 target tight against the input (was a chunky pill-shaped lozenge with extra padding).",
      },
      {
        type: "ui",
        text: "Network graph panels: closing the node detail panel (× button) now also clears the search input — previously you had to clear the field separately.",
      },
      {
        type: "fix",
        text: "Network graph country nodes rendered as flat black circles because the cyan CSS token's OKLCH chroma was out of sRGB gamut at hue 200° and got silently dropped by Lightning CSS. Lowered chroma to a safe value; country nodes now render in their intended cyan-teal.",
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-05-11",
    changes: [
      {
        type: "feature",
        text: "Network graph: new optional 'Geo' layer (off by default) groups located CCN/CRN around a per-country hub node. Country becomes a top-tier node — click for a flag + CCN/CRN/owner counts in the detail panel, focus to drill into the country's subgraph, or search by name (\"France\") or ISO code (\"FR\"). Country labels stay visible at every zoom level. Layout is force-driven — countries are placed by cluster mass, not real-world coordinates, so heavy clusters spread out and small ones nestle between.",
      },
      {
        type: "ui",
        text: "Geo layer: country↔node connections render as thin country-tinted dashed tethers so each country reads as an explicit hub-and-spoke hub. Selecting a country brightens its tethers; selecting one of its located nodes recolors that one tether to the node's kind color.",
      },
      {
        type: "ui",
        text: "Network graph search: new info icon left of the search input that lists the four supported query types (node hash, node name, 0x address, country) and notes country search requires the Geo layer.",
      },
      {
        type: "fix",
        text: "Network graph focus chain: the pill back-button (‹) no longer rewinds out of /network when you arrived from a parent route. The focus chain is now encoded in the URL (?focus=A,B,C) instead of relying on browser history, so back always stays on the page.",
      },
    ],
  },
  {
    version: "0.11.2",
    date: "2026-05-09",
    changes: [
      {
        type: "ui",
        text: "Network graph: redesigned the node detail panel — smaller floating card on the right (280px) that doesn't block the map or overlap the toolbar. CCN nodes now show meaningful content (score, attached CRNs, stakers, total staked, owner, reward) instead of an empty card. CRN cards are trimmed to the graph-relevant facts (parent CCN, VM count, CPU/Memory bars, owner) with a 'View full details →' link to the full /nodes report. Stakers and reward addresses get a neat address card with a 'Connected to N CCNs' summary.",
      },
      {
        type: "ui",
        text: "Focus on a node from inside the panel now keeps the panel open instead of closing it — clicking a CRN's parent-CCN link rebinds the panel to the parent in one motion. A compact 'Focused: <name> ×' pill inside the panel (or in the toolbar when the panel is closed) shows where you are; the leading caret steps back one focus layer, the × clears focus entirely.",
      },
      {
        type: "ui",
        text: "Stakers layer is now on by default so the stake graph reads on first paint without hunting for the toggle.",
      },
      {
        type: "fix",
        text: "Initial map load and reset-view no longer flash anchored to the left before sliding to the center — the SVG viewBox now centers the world origin natively, and the simulation no longer relies on an alpha-independent center force that shoved nodes on the first tick.",
      },
      {
        type: "infra",
        text: "Network entry temporarily hidden from the sidebar pending review; the page is still reachable directly at /network.",
      },
    ],
  },
  {
    version: "0.11.1",
    date: "2026-05-09",
    changes: [
      {
        type: "ui",
        text: "Network graph visibility pass: nodes are bigger and zoom-adaptive — they boost up to ~1.9× when you're zoomed out so dots stay readable on the dark background, and ease back down when you zoom into dense clusters. Structural edges are brighter (60% opacity) and the same-owner overlay now matches their neutral gray instead of fighting them with a saturated blue, so the dashed pattern reads as annotation rather than competing topology.",
      },
      {
        type: "ui",
        text: "Structural CCN→CRN edges now end in an arrowhead so direction reads at a glance. The arrow inherits whatever color the line has — neutral by default, the kind color when an incident edge is selected — and lands just outside the CRN border instead of being hidden under the node body.",
      },
      {
        type: "feature",
        text: "Selecting a node now spotlights its 1-hop neighborhood: the selected node and its direct neighbors stay at full strength, and everything else (nodes, edges, and labels) dims to 18% opacity so the focused subgraph reads as a clean spotlight while peripheral context stays visible.",
      },
      {
        type: "fix",
        text: "Reset-view (and the first map load) no longer expands outward from a tight spiral over several seconds before re-centering. The simulation now pre-converges synchronously before the first paint, so the camera fits the spread layout in one transition. The settle indicator is correspondingly tighter (500ms instead of 2.2s).",
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-05-08",
    changes: [
      {
        type: "feature",
        text: "New /network page renders the Aleph network as a force-directed graph — CCNs and their child CRNs, with optional same-owner, stake, and reward-cluster overlays. Long-press a node to drag it (the node stays in your hand instead of teleporting to the cursor); short-click to open its detail panel. Selected node's connecting edges are recolored to its kind color (CCNs purple, CRNs green) so neighbors are easy to spot. Address deep-link via ?address=0x… highlights every node owned by that wallet. Focus on a node to see its ego subgraph; layer toggles, focus, search, and selection all persist via URL params so any view is shareable.",
      },
      {
        type: "ui",
        text: "Network map fills the entire content area edge-to-edge — the page header, layer toggles, search, and focus banner overlay on top of the graph instead of stacking above it. Edges no longer bleed through nodes (each node renders an opaque background underlay before its translucent fill). Dotted/dashed edges are thinner with rounded caps so reward-cluster links read as round dots rather than tiny rectangles. CCN outer ring tightened so it sits closer to the node circle. Cursor stays as the default arrow everywhere — no hand variants on hover or drag.",
      },
      {
        type: "fix",
        text: "Background data refetches no longer reset the viewport — the auto-fit only fires when you change layers, focus, or address (the URL-driven things), not when polling lands new data. Drag now works on first map load, every time: drag attachment is delegated to the parent group via d3-drag's container + subject pattern, so it doesn't depend on whether individual node elements were in the DOM at the moment the effect ran. Post-drag settling cools down to rest in ~0.4s instead of 2–3s of wobble.",
      },
      {
        type: "ui",
        text: "Network graph polish pass: selected nodes show a translucent halo in their own color (no more pulsing purple ring on green CRNs); CCN/CRN names render as DS Badge chips with kind-mapped variants (CCN purple, CRN green, unreachable red, inactive grey) so kind reads at a glance. Same-owner / staker / reward overlay cliques no longer crush together (force-link strength reverted to d3's degree-aware default). Initial fit and reset-view show the full network with breathing room instead of zooming in tight.",
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-05-06",
    changes: [
      {
        type: "feature",
        text: "Overview hero now shows a world map of every Aleph Cloud node, sampled and clustered by country so the geographic story reads at a glance. Each green dot represents real nodes from the network — small countries (Russia, Italy, Canada, Sweden) always get at least one dot; heavy clusters like France and the US get proportionally more. Geolocation runs at build time: the build resolves CCN multiaddrs and CRN hostnames to country codes via ip3country and bakes them into a JSON snapshot, so the page stays a fast static export with no per-visitor lookups. If the upstream is unreachable or shrinks unexpectedly, the build keeps the previous snapshot — production never ships an empty map.",
      },
      {
        type: "ui",
        text: "Overview hero restructured into a 2-column layout (stacks below lg): a 2×2 stat grid (Nodes Total/Healthy + VMs Total/Dispatched) on the left, the world map on the right. Dropped Unreachable, Removed, Missing, and Unschedulable from the hero — the operational long-tail is one click away on /nodes and /vms via the per-status pills, and dropping it gave the geographic story room to breathe. Card chrome (dot-pattern background + soft inner vignette) is theme-aware, so the worldmap reads naturally in both light and dark mode.",
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-05-04",
    changes: [
      {
        type: "fix",
        text: "Credits page now defaults to the 24h range, matching the Wallet page's Credit Rewards (24h) section. Searching the recipient table by node name and clicking through to the wallet view used to show two unrelated numbers — one over 7 days, one over 24 hours. They now agree by default. Users who want 7d/30d still pick it from the Tabs; the URL persists the choice via ?range=. Bonus: the credits query is ~7x smaller on first load, and the sidebar prefetch now shares its cache entry with the wallet page.",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-05-04",
    changes: [
      {
        type: "feature",
        text: "VMs page now shows only active VMs by default — dispatched, duplicated, misplaced, missing, and unschedulable. The All-tab count drops from ~7,900 to the active baseline (matching the Overview Total VMs headline) so the operational signal isn't drowned out by long-tail noise (unscheduled, orphaned, unknown VMs). Toggle via the new \"Show inactive VMs\" checkbox in the FilterPanel — Payment & Allocation column. Clicking a specific status pill (e.g. Unknown from the overflow dropdown) bypasses the filter and shows that status's full count. Shareable via the ?showInactive=true URL parameter.",
      },
      {
        type: "ui",
        text: "VMs page status tabs now show only All, Dispatched, and Scheduled — the remaining 7 statuses live in the `⋯` overflow dropdown, in priority order (Duplicated, Misplaced, Missing, Orphaned, Unschedulable, Unscheduled, Unknown). Reduces visual noise without hiding access to any status.",
      },
    ],
  },
  {
    version: "0.8.8",
    date: "2026-05-04",
    changes: [
      {
        type: "feature",
        text: "Credits recipient search now matches node names. Typing a node name finds reward addresses that own a matching node, with a Matched: <full-name> chip in the Sources cell for each match — full names, no truncation, so you can scan rows and pick the right one without clicking through. Whole row is clickable and opens the wallet view, where the full per-node reward breakdown lives. The search query persists in the URL as ?q=, so navigating back from the wallet view restores your filter.",
      },
    ],
  },
  {
    version: "0.8.7",
    date: "2026-05-04",
    changes: [
      {
        type: "fix",
        text: "Overview Total VMs card now counts only currently-active VMs (dispatched + duplicated + misplaced + missing + unschedulable) instead of every VM the scheduler has ever seen. The headline number now matches the sum of the visible status cards, and the subtitle reflects the active-status meaning. The full all-time list remains reachable via the All tab on /vms.",
      },
    ],
  },
  {
    version: "0.8.6",
    date: "2026-05-03",
    changes: [
      {
        type: "fix",
        text: "Overview stat cards: on narrow viewports the Unreachable and Removed node cards no longer fall under the Virtual Machines header — Nodes and VMs now render as two independent grids that stack on mobile and sit side-by-side on desktop.",
      },
    ],
  },
  {
    version: "0.8.5",
    date: "2026-05-03",
    changes: [
      {
        type: "ui",
        text: "Credit recipient table now leads with Address and replaces the Roles column with a Sources column showing per-address chips like CRN: 2, CCN: 1, Staker — drawn from the corechannel registry per reward address. The Node column (which only ever showed one of an operator's nodes) is gone; click the address to see the full per-node breakdown on the wallet view.",
      },
    ],
  },
  {
    version: "0.8.4",
    date: "2026-05-02",
    changes: [
      {
        type: "fix",
        text: "Sorting Nodes/VMs/Issues/Credits tables by VMs, Memory, vCPUs, etc. now applies to the full filtered dataset — clicking a column header reorders rows across all pages instead of only the visible 25.",
      },
      {
        type: "ui",
        text: "VMs filter Memory range now reads in GB instead of MB (\"0 GB–256 GB\" rather than \"0 MB–262144 MB\").",
      },
    ],
  },
  {
    version: "0.8.3",
    date: "2026-05-01",
    changes: [
      {
        type: "fix",
        text: "Range slider extents (vCPUs, memory, VM count) now derive from the loaded fleet — nodes and VMs above the previous 128 vCPU / 512 GB / 32 vCPU / 65536 MB caps are no longer hidden when the slider is used.",
      },
    ],
  },
  {
    version: "0.8.2",
    date: "2026-05-01",
    changes: [
      {
        type: "fix",
        text: "Credits-page refresh crash: only persist queries with status='success' (skip in-flight pending queries whose dehydrated state included a serialized promise that rehydrated as an empty object), drop node-state from the persisted whitelist (Maps don't survive JSON), defensive Array.isArray guard in sparkline. Version bump also busts existing bad cache entries.",
      },
    ],
  },
  {
    version: "0.8.1",
    date: "2026-05-01",
    changes: [
      {
        type: "fix",
        text: "Credits page perceived load time: persisted cache (24h), prefetch on sidebar hover, keep previous range while switching, greyed flow-diagram placeholder while data loads",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-03-20",
    changes: [
      {
        type: "feature",
        text: "Cumulative revenue sparkline in the Total Revenue card on the credits page",
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-03-20",
    changes: [
      {
        type: "ui",
        text: "Three-tier typography: Source Code Pro for technical data, staggered card entrance on overview",
      },
      {
        type: "feature",
        text: "Network Health page: status badge, glassmorphism stat cards, side-by-side endpoint sections",
      },
      {
        type: "ui",
        text: "Page titles added to Nodes, VMs, and Network Health pages",
      },
      {
        type: "ui",
        text: "Credits page: powered-by Aleph Cloud watermark below flow diagram",
      },
      {
        type: "ui",
        text: "Favicon and SEO images updated to DS Aleph Cloud logo mark",
      },
      {
        type: "feature",
        text: "Sortable Last Updated column on VMs table",
      },
      {
        type: "ui",
        text: "Overview activity cards (Top Nodes, Latest VMs) link to detail view instead of list page",
      },
      {
        type: "fix",
        text: "VM type filter: microvm → micro_vm to match API wire format",
      },
      {
        type: "fix",
        text: "Latest VMs card: limit api2 lookups to 100 candidates, show dash when no creation time",
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-03-19",
    changes: [
      {
        type: "feature",
        text: "Expanded VM statuses: dispatched, duplicated, misplaced join the existing set for precise observation-based tracking",
      },
      {
        type: "ui",
        text: "VM filter tabs priority-ordered (operational statuses first), default changed from Scheduled to All",
      },
      {
        type: "ui",
        text: "Overview page: Dispatched hero card replaces Orphaned, showing healthy VM baseline",
      },
      {
        type: "feature",
        text: "Issues page tracks 5 discrepancy types (added duplicated and misplaced) with Node perspective columns and filters",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-03-18",
    changes: [
      {
        type: "feature",
        text: "Credits page with flow diagram, recipient table, and distribution breakdown",
      },
      {
        type: "feature",
        text: "Wallet view with owned nodes, VMs, credit rewards, activity timeline, and permissions",
      },
      {
        type: "feature",
        text: "Issues page for scheduling discrepancy investigation (VM and Node perspectives)",
      },
      {
        type: "feature",
        text: "API status page with Scheduler and Aleph API health checks, response latency, auto-refresh",
      },
      {
        type: "refactor",
        text: "Issues demoted to sidebar overflow menu to reduce noise for regular users",
      },
      {
        type: "ui",
        text: "Credit flow diagram polish: pre-populated particles, single origin points, removed arrowheads",
      },
      {
        type: "ui",
        text: "Light/dark mode theming fixes, filter panel UX improvements",
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-03-13",
    changes: [
      {
        type: "feature",
        text: "Client-side table pagination with page-size dropdown (25/50/100)",
      },
      {
        type: "feature",
        text: "Clickable overview stat cards linking to filtered list pages",
      },
      {
        type: "feature",
        text: "Animated donut rings with status icons on stat cards",
      },
      {
        type: "ui",
        text: "Status filter tabs switched to DS Tabs underline variant with overflow collapse",
      },
      {
        type: "ui",
        text: "Badge, CopyableText, and status tooltip consistency pass",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-03-09",
    changes: [
      {
        type: "feature",
        text: "GPU info on nodes and VMs (badges, filters, detail views)",
      },
      {
        type: "feature",
        text: "CPU info on nodes (vendor filter, architecture column, detail sections)",
      },
      {
        type: "feature",
        text: "Confidential computing indicators (ShieldCheck icon, filters)",
      },
      {
        type: "feature",
        text: "Advanced filters on list pages: search, checkboxes, range sliders, collapsible panel",
      },
      {
        type: "infra",
        text: "Automated IPFS deployment via GitHub Actions with delegated billing",
      },
      {
        type: "infra",
        text: "Paginated API v1 support with parallel page fetching",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-05",
    changes: [
      {
        type: "feature",
        text: "Dedicated detail views for nodes and VMs via ?view= search params",
      },
      {
        type: "feature",
        text: "Top Nodes and Latest VMs cards on overview page",
      },
      {
        type: "feature",
        text: "Overview page redesign with glassmorphism stat cards, noise texture, accent glow",
      },
      {
        type: "ui",
        text: "Recessed content panel, sticky detail panels, glass card styling",
      },
      {
        type: "infra",
        text: "Real API integration replacing mock data layer",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-03-01",
    changes: [
      {
        type: "feature",
        text: "Initial dashboard with nodes and VMs tables, overview stats, dark theme",
      },
      {
        type: "feature",
        text: "App shell with sidebar navigation, responsive mobile drawer",
      },
      {
        type: "feature",
        text: "Cross-page navigation via URL search params",
      },
      {
        type: "infra",
        text: "Static export for IPFS hosting with trailingSlash",
      },
    ],
  },
];
