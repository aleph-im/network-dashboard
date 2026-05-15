const TITLES: Record<string, string> = {
  "/": "Overview",
  "/nodes": "Nodes",
  "/vms": "VMs",
  "/credits": "Credit Expenses",
  "/network": "Network Graph",
  "/status": "Network Health",
  "/issues": "Issues",
  "/wallet": "Wallet",
  "/changelog": "Changelog",
};

export function routeTitle(pathname: string): string {
  if (!pathname) return "Overview";
  const exact = TITLES[pathname];
  if (exact) return exact;
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (!segment) return "Overview";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}
