export type NavIconName =
  | "grid"
  | "server"
  | "cpu"
  | "coins"
  | "network"
  | "signal"
  | "warning";

export type NavItemConfig = {
  label: string;
  href: string;
  icon: NavIconName;
};

export type NavSectionConfig = {
  id: string;
  title: string;
  items: NavItemConfig[];
};

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    items: [{ label: "Overview", href: "/", icon: "grid" }],
  },
  {
    id: "resources",
    title: "Resources",
    items: [
      { label: "Nodes",   href: "/nodes",   icon: "server" },
      { label: "VMs",     href: "/vms",     icon: "cpu" },
      { label: "Credits", href: "/credits", icon: "coins" },
    ],
  },
  {
    id: "network",
    title: "Network",
    items: [
      { label: "Graph",  href: "/network", icon: "network" },
      { label: "Health", href: "/status",  icon: "signal" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    items: [{ label: "Issues", href: "/issues", icon: "warning" }],
  },
];
