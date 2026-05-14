import type { ProductApp } from "@aleph-front/ds/product-strip";

export const APPS: ProductApp[] = [
  { id: "cloud",    label: "Cloud",    href: "https://app.aleph.cloud" },
  { id: "network",  label: "Network",  href: "https://network.aleph.cloud" },
  { id: "explorer", label: "Explorer", href: "https://explorer.aleph.cloud" },
  { id: "swap",     label: "Swap",     href: "https://swap.aleph.cloud" },
];

export const ACTIVE_APP_ID = "network";
