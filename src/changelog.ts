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

export const CURRENT_VERSION = "0.8.8";

export const CHANGELOG: VersionEntry[] = [
  {
    version: "0.8.8",
    date: "2026-05-04",
    changes: [
      {
        type: "feature",
        text: "Credits recipient search now matches node names. Typing a node name finds the reward address that owns it, with a Matched: <name> chip in the Sources cell so you can see why the row appeared. Whole row is clickable and opens the wallet view, where the full per-node reward breakdown lives.",
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
