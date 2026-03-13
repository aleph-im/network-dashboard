# Stats Indexer — Design Spec

A Python service that polls the Aleph Cloud scheduler API every 5 minutes, captures stats snapshots, computes multi-resolution rollups (hourly, daily, weekly, monthly), and publishes them as Aleph POST messages for the dashboard to consume.

---

## Architecture

```
┌─────────────┐    poll /stats     ┌──────────────────┐
│  Scheduler   │◄──── every 5m ────│  Stats Indexer    │
│  API         │                   │  (Aleph Cloud VM) │
└─────────────┘                   │                    │
                                   │  ring buffer (mem) │
                                   │  SQLite (fallback) │
                                   │                    │
                                   └────────┬───────────┘
                                            │ POST messages
                                            ▼
                                   ┌──────────────────┐
                                   │  Aleph Network    │
                                   │  (api2.aleph.im)  │
                                   └──────────────────┘
```

The indexer writes to Aleph. It never reads its own data back from api2. Rollup computation uses the local in-memory buffer (backed by SQLite for crash recovery).

---

## Data Model

### Snapshot Schema

Every POST message payload uses the same structure across all tiers:

```json
{
  "tier": "raw",
  "timestamp": "2026-03-13T14:05:00Z",
  "totalNodes": 543,
  "healthyNodes": 489,
  "unreachableNodes": 46,
  "unknownNodes": 0,
  "removedNodes": 8,
  "totalVMs": 462,
  "scheduledVMs": 441,
  "orphanedVMs": 12,
  "missingVMs": 6,
  "unschedulableVMs": 3,
  "totalVcpusAllocated": 1820,
  "totalVcpusCapacity": 4200,
  "affectedNodes": 15
}
```

For rollup tiers, `tier` becomes `"hourly"`, `"daily"`, `"weekly"`, or `"monthly"`. Numeric fields are the mean of the source tier's values over that period. `timestamp` is the period start (e.g. `2026-03-13T14:00:00Z` for the 14:00-15:00 hourly rollup).

### Aleph POST Channels

One channel per tier:

| Channel | Written | Content |
|---------|---------|---------|
| `scheduler-stats-5m` | Every 5 min | Raw snapshot |
| `scheduler-stats-1h` | On the hour | Average of 12 raw snapshots |
| `scheduler-stats-1d` | At midnight UTC | Average of 24 hourly rollups |
| `scheduler-stats-1w` | Sunday midnight UTC | Average of 7 daily rollups |
| `scheduler-stats-1m` | 1st of month UTC | Average of previous month's daily rollups |

All messages use `post_type: "scheduler-stats"`. The channel differentiates the tier.

### Storage Estimates (No Pruning)

~1 KB per POST message. Raw tier dominates.

| Timeframe | Total Messages | Total Storage |
|-----------|---------------|---------------|
| 1 year | ~114K | ~112 MB |
| 3 years | ~343K | ~336 MB |
| 5 years | ~571K | ~560 MB |

---

## Project Structure

```
scheduler-indexer/
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── src/
│   └── scheduler_indexer/
│       ├── __init__.py
│       ├── main.py         # Entry point, async loop
│       ├── collector.py    # Polls scheduler API, returns snapshot dict
│       ├── buffer.py       # In-memory ring buffer + SQLite persistence
│       ├── rollup.py       # Tier boundary detection + average computation
│       └── publisher.py    # Writes POST messages to Aleph network
└── scripts/
    └── deploy.sh           # Deploy to Aleph Cloud VM
```

Separate repo (`scheduler-indexer`), not a subdirectory of the dashboard. Different language, deploy lifecycle, and versioning.

---

## Service Design

### Main Loop (`main.py`)

```python
async def main():
    buffer = Buffer(db_path="data/stats.db")
    publisher = Publisher(private_key, sender_address)

    while True:
        snapshot = await collector.poll()
        buffer.append("raw", snapshot)
        await publisher.post("scheduler-stats-5m", snapshot)

        if on_hour_boundary():
            hourly = rollup.average(buffer.last_n("raw", 12))
            buffer.append("hourly", hourly)
            await publisher.post("scheduler-stats-1h", hourly)

        if on_day_boundary():
            daily = rollup.average(buffer.last_n("hourly", 24))
            buffer.append("daily", daily)
            await publisher.post("scheduler-stats-1d", daily)

        if on_week_boundary():
            weekly = rollup.average(buffer.last_n("daily", 7))
            buffer.append("weekly", weekly)
            await publisher.post("scheduler-stats-1w", weekly)

        if on_month_boundary():
            monthly = rollup.average(
                buffer.last_n("daily", days_in_prev_month)
            )
            buffer.append("monthly", monthly)
            await publisher.post("scheduler-stats-1m", monthly)

        await asyncio.sleep(300)
```

### Collector (`collector.py`)

Replicates the dashboard's `getOverviewStats` logic in Python:

1. Fetch `/api/v1/stats`, `/api/v1/nodes?page_size=200`, `/api/v1/vms?page_size=200` in parallel (using `aiohttp`)
2. Paginate nodes and VMs using `fetchAllPages` equivalent (fetch page 1, learn `total_pages`, fetch rest in parallel)
3. Count nodes by status, VMs by status
4. Compute `affectedNodes`: collect `allocated_node` from VMs with status `orphaned` or `missing`, plus `observed_nodes` from VMs with status `orphaned` (the nodes where the VM was unexpectedly seen). Take the unique set of non-null node hashes. This matches the dashboard's `getOverviewStats()` logic in `client.ts`.
5. Return the 13-field snapshot dict

### Buffer (`buffer.py`)

**In-memory:** Dict of `{tier: deque(maxlen=...)}`:
- `raw`: maxlen 288 (24h of 5-min snapshots)
- `hourly`: maxlen 168 (7 days)
- `daily`: maxlen 365 (1 year)
- `weekly`: maxlen 520 (10 years)
- `monthly`: unbounded

**SQLite:** Mirrors the deques on every `append()`. Single table:

```sql
CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    data JSON NOT NULL,
    published BOOLEAN NOT NULL DEFAULT 0
);
CREATE INDEX idx_tier_ts ON snapshots(tier, timestamp);
CREATE INDEX idx_unpublished ON snapshots(published) WHERE published = 0;
```

On startup, loads from SQLite to repopulate ring buffers. On `append()`, inserts to SQLite and trims rows beyond the maxlen for that tier.

### Rollup (`rollup.py`)

**`average(snapshots: list[dict]) -> dict`**: Takes a list of snapshot dicts, returns a new dict with the mean of each numeric field. `tier` and `timestamp` are set by the caller.

**Boundary detection:**
- `on_hour_boundary()`: current minute == 0 and buffer has >= 1 raw snapshot from the previous hour
- `on_day_boundary()`: current hour == 0 UTC and buffer has >= 1 hourly snapshot from the previous day
- `on_week_boundary()`: current weekday == Sunday (6) and `on_day_boundary()`
- `on_month_boundary()`: current day == 1 and `on_day_boundary()`

Each tier tracks its last rollup timestamp. A rollup only fires if the current boundary period is strictly later than the last rollup. This prevents duplicate rollups from clock drift or loop timing variation. Last-rollup timestamps are persisted in SQLite (a separate `rollup_state` table) so they survive restarts.

Partial periods are averaged from whatever data exists (e.g. if only 10 of 12 raw snapshots exist for an hour due to downtime, average those 10).

### Publisher (`publisher.py`)

Uses `aleph-sdk-python` to create POST messages:
- `channel`: the tier channel name
- `post_type`: `"scheduler-stats"`
- `content`: the snapshot dict
- Signs with the indexer's dedicated wallet

### Error Handling

- **Scheduler API unreachable:** Log warning, skip that cycle. No gap-filling. Rollup averages from whatever snapshots exist.
- **Aleph POST fails:** Retry once. If still failing, mark the snapshot as unpublished in SQLite (`published = false`) and continue. Rollups don't depend on successful publishing.
- **Backfill on recovery:** After each successful poll cycle, attempt to publish up to 10 unpublished snapshots (oldest first). This ensures api2 eventually has the complete dataset after outages. Backfilled messages arrive at api2 out of chronological order, but the dashboard sorts by `content.timestamp` so ordering is correct.
- **Startup recovery:** Load SQLite into ring buffers. If SQLite is empty or missing, start fresh (no historical context, first rollups will be partial).

---

## Docker

### Dockerfile

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ src/
CMD ["uv", "run", "python", "-m", "scheduler_indexer.main"]
```

### docker-compose.yml

```yaml
services:
  indexer:
    build: .
    restart: unless-stopped
    volumes:
      - stats-data:/app/data
    environment:
      - SCHEDULER_API_URL=https://rust-scheduler.aleph.im
      - ALEPH_PRIVATE_KEY=${ALEPH_PRIVATE_KEY}
      - ALEPH_SENDER_ADDRESS=${ALEPH_SENDER_ADDRESS}
volumes:
  stats-data:
```

SQLite lives on a Docker volume, survives container rebuilds.

---

## Deployment

- **Platform:** Aleph Cloud VM, smallest tier (1 vCPU, 256 MB RAM)
- **Image registry:** GitHub Container Registry
- **Wallet:** Dedicated indexer wallet, separate from the deploy wallet. Needs ALEPH balance for POST message fees (or delegated billing).
- **Secrets:** `ALEPH_PRIVATE_KEY` as GitHub Actions secret (CI) and VM environment variable (runtime)
- **CI/CD:** GitHub Actions builds and pushes Docker image on merge to main. Deployment to Aleph Cloud VM is manual (`workflow_dispatch`).

---

## Resource Requirements

| Resource | Requirement | Notes |
|----------|-------------|-------|
| CPU | 1 vCPU (lowest tier) | ~50ms of work every 5 min |
| RAM | 128-256 MB | Ring buffers + Python runtime |
| Disk | Negligible | SQLite grows ~50 MB over years |
| Network | Minimal | 3 GET + 1 POST every 5 min |

---

## Configuration

Environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCHEDULER_API_URL` | No | `https://rust-scheduler.aleph.im` | Scheduler API base URL |
| `ALEPH_PRIVATE_KEY` | Yes | — | Indexer wallet private key |
| `ALEPH_SENDER_ADDRESS` | Yes | — | Indexer wallet address |
| `ALEPH_API_URL` | No | `https://api2.aleph.im` | Aleph network API (for posting) |
| `DB_PATH` | No | `data/stats.db` | SQLite database path |
| `POLL_INTERVAL` | No | `300` | Seconds between polls |
