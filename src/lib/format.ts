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
