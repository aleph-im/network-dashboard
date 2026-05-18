import type { ProductApp } from "@aleph-front/ds/product-strip";

export const APPS: ProductApp[] = [
  { id: "cloud",    label: "Cloud",    href: "https://app.aleph.cloud",      external: true },
  { id: "network",  label: "Network",  href: "https://network.aleph.cloud" },
  { id: "explorer", label: "Explorer", href: "https://explorer.aleph.cloud", external: true },
  { id: "swap",     label: "Swap",     href: "https://swap.aleph.cloud",     external: true },
];

export const ACTIVE_APP_ID = "network";
