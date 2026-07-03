export function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function relativeTimeFromUnix(unixSeconds: number): string {
  const now = Date.now();
  const then = unixSeconds * 1000;
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars) return hash;
  return `${hash.slice(0, chars)}...`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CPU_VENDOR_LABELS: Record<string, string> = {
  AuthenticAMD: "AMD",
  GenuineIntel: "Intel",
};

export function formatCpuLabel(
  vendor: string | null,
  architecture: string | null,
): string {
  const v = vendor ? (CPU_VENDOR_LABELS[vendor] ?? vendor) : null;
  if (v && architecture) return `${v} ${architecture}`;
  if (v) return v;
  if (architecture) return architecture;
  return "Unknown";
}

export function formatAleph(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  if (value === 0) return "0";
  return value.toExponential(2);
}

export function explorerWalletUrl(address: string): string {
  return `https://explorer.aleph.cloud/address/ETH/${address}`;
}

export function etherscanTxUrl(txHash: string): string {
  return `https://etherscan.io/tx/${txHash}`;
}

/**
 * Format a USD amount. Whole-dollar figures drop the cents; sub-dollar
 * figures keep two decimals so small purchases stay legible.
 */
export function formatUsd(value: number): string {
  const fractionDigits = value !== 0 && Math.abs(value) < 1 ? 2 : 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatGpuLabel(
  gpus: { model: string; deviceName: string }[],
): string {
  if (gpus.length === 0) return "";
  const groups = new Map<string, number>();
  for (const gpu of gpus) {
    const label = gpu.model || gpu.deviceName;
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()]
    .map(([label, count]) =>
      count > 1 ? `${count}x ${label}` : label,
    )
    .join(", ");
}
