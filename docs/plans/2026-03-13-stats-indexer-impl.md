# Stats Indexer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python service that polls the scheduler API every 5 minutes, captures stats snapshots, computes multi-resolution rollups, and publishes them as Aleph POST messages.

**Architecture:** A single async loop polls `/api/v1/stats` + `/api/v1/nodes` + `/api/v1/vms`, builds a 13-field snapshot, stores it in an in-memory ring buffer (backed by SQLite), computes hourly/daily/weekly/monthly rollups at period boundaries, and publishes each snapshot/rollup as an Aleph POST message on a tier-specific channel. The service runs in a Docker container on an Aleph Cloud VM.

**Tech Stack:** Python 3.13, uv, aiohttp, aleph-sdk-python, SQLite (stdlib), pytest, ruff

**Design spec:** `docs/plans/2026-03-13-stats-indexer-design.md` (read it for full context)

**Repo:** This is a new repo (`scheduler-indexer`), NOT a subdirectory of the dashboard.

---

## File Structure

```
scheduler-indexer/
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   └── scheduler_indexer/
│       ├── __init__.py
│       ├── main.py           # Entry point, async main loop
│       ├── config.py         # Env var loading, constants
│       ├── snapshot.py       # Snapshot TypedDict + NUMERIC_FIELDS
│       ├── collector.py      # Polls scheduler API, returns Snapshot
│       ├── buffer.py         # Ring buffer (deque) + SQLite persistence
│       ├── rollup.py         # Boundary detection + average computation
│       └── publisher.py      # Writes POST messages to Aleph network
└── tests/
    ├── conftest.py           # Shared fixtures
    ├── test_snapshot.py
    ├── test_collector.py
    ├── test_buffer.py
    ├── test_rollup.py
    └── test_publisher.py
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `src/scheduler_indexer/__init__.py`
- Create: `src/scheduler_indexer/config.py`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the repo and pyproject.toml**

```bash
mkdir scheduler-indexer && cd scheduler-indexer
git init
```

```toml
# pyproject.toml
[project]
name = "scheduler-indexer"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "aiohttp>=3.11,<4",
    "aleph-sdk-python>=2.3,<3",
]

[project.optional-dependencies]
dev = [
    "pytest>=8,<9",
    "pytest-asyncio>=0.25,<1",
    "aioresponses>=0.7,<1",
    "ruff>=0.11,<1",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/scheduler_indexer"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
target-version = "py313"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "UP", "B", "SIM", "RUF"]
```

- [ ] **Step 2: Create __init__.py and config.py**

```python
# src/scheduler_indexer/__init__.py
```

```python
# src/scheduler_indexer/config.py
import os

SCHEDULER_API_URL = os.environ.get(
    "SCHEDULER_API_URL", "https://rust-scheduler.aleph.im"
)
ALEPH_PRIVATE_KEY = os.environ.get("ALEPH_PRIVATE_KEY", "")
ALEPH_SENDER_ADDRESS = os.environ.get("ALEPH_SENDER_ADDRESS", "")
ALEPH_API_URL = os.environ.get("ALEPH_API_URL", "https://api2.aleph.im")
DB_PATH = os.environ.get("DB_PATH", "data/stats.db")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "300"))

MAX_PAGE_SIZE = 200

# Ring buffer max lengths per tier
TIER_MAXLEN = {
    "raw": 288,      # 24h of 5-min snapshots
    "hourly": 168,   # 7 days
    "daily": 365,    # 1 year
    "weekly": 520,   # 10 years
    "monthly": 0,    # unbounded (0 = no trim)
}

TIER_CHANNELS = {
    "raw": "scheduler-stats-5m",
    "hourly": "scheduler-stats-1h",
    "daily": "scheduler-stats-1d",
    "weekly": "scheduler-stats-1w",
    "monthly": "scheduler-stats-1m",
}

POST_TYPE = "scheduler-stats"
```

- [ ] **Step 3: Install dependencies and verify**

```bash
cd scheduler-indexer
uv sync --all-extras
uv run ruff check src/
```

Expected: no errors, clean install.

- [ ] **Step 4: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
        with:
          persist-credentials: false
      - uses: astral-sh/setup-uv@0c5e2b8115b80b4c7c5ddf6ffdd634974642d182  # v5.4.1
        with:
          version: "latest"
      - run: uv sync --all-extras
      - run: uv run ruff check src/ tests/
      - run: uv run pytest -q
```

- [ ] **Step 5: Create .gitignore**

```gitignore
# .gitignore
__pycache__/
*.pyc
.venv/
data/
*.db
.ruff_cache/
dist/
*.egg-info/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: project scaffolding with uv, ruff, pytest"
```

---

## Task 2: Snapshot schema

**Files:**
- Create: `src/scheduler_indexer/snapshot.py`
- Create: `tests/test_snapshot.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_snapshot.py
from scheduler_indexer.snapshot import NUMERIC_FIELDS, Snapshot, make_snapshot


def test_make_snapshot_has_all_fields():
    s = make_snapshot(
        tier="raw",
        timestamp="2026-03-13T14:05:00Z",
        total_nodes=543,
        healthy_nodes=489,
        unreachable_nodes=46,
        unknown_nodes=0,
        removed_nodes=8,
        total_vms=462,
        scheduled_vms=441,
        orphaned_vms=12,
        missing_vms=6,
        unschedulable_vms=3,
        total_vcpus_allocated=1820,
        total_vcpus_capacity=4200,
        affected_nodes=15,
    )
    assert s["tier"] == "raw"
    assert s["totalNodes"] == 543
    assert s["affectedNodes"] == 15


def test_numeric_fields_count():
    assert len(NUMERIC_FIELDS) == 13


def test_make_snapshot_returns_correct_type():
    s = make_snapshot(tier="hourly", timestamp="2026-01-01T00:00:00Z")
    assert isinstance(s, dict)
    assert s["tier"] == "hourly"
    # Defaults to 0 for all numeric fields
    for field in NUMERIC_FIELDS:
        assert s[field] == 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_snapshot.py -v
```

Expected: `ModuleNotFoundError: No module named 'scheduler_indexer.snapshot'`

- [ ] **Step 3: Write the implementation**

```python
# src/scheduler_indexer/snapshot.py
from typing import TypedDict


class Snapshot(TypedDict):
    tier: str
    timestamp: str
    totalNodes: int
    healthyNodes: int
    unreachableNodes: int
    unknownNodes: int
    removedNodes: int
    totalVMs: int
    scheduledVMs: int
    orphanedVMs: int
    missingVMs: int
    unschedulableVMs: int
    totalVcpusAllocated: int
    totalVcpusCapacity: int
    affectedNodes: int


NUMERIC_FIELDS: list[str] = [
    "totalNodes",
    "healthyNodes",
    "unreachableNodes",
    "unknownNodes",
    "removedNodes",
    "totalVMs",
    "scheduledVMs",
    "orphanedVMs",
    "missingVMs",
    "unschedulableVMs",
    "totalVcpusAllocated",
    "totalVcpusCapacity",
    "affectedNodes",
]


def make_snapshot(
    *,
    tier: str,
    timestamp: str,
    total_nodes: int = 0,
    healthy_nodes: int = 0,
    unreachable_nodes: int = 0,
    unknown_nodes: int = 0,
    removed_nodes: int = 0,
    total_vms: int = 0,
    scheduled_vms: int = 0,
    orphaned_vms: int = 0,
    missing_vms: int = 0,
    unschedulable_vms: int = 0,
    total_vcpus_allocated: int = 0,
    total_vcpus_capacity: int = 0,
    affected_nodes: int = 0,
) -> Snapshot:
    return Snapshot(
        tier=tier,
        timestamp=timestamp,
        totalNodes=total_nodes,
        healthyNodes=healthy_nodes,
        unreachableNodes=unreachable_nodes,
        unknownNodes=unknown_nodes,
        removedNodes=removed_nodes,
        totalVMs=total_vms,
        scheduledVMs=scheduled_vms,
        orphanedVMs=orphaned_vms,
        missingVMs=missing_vms,
        unschedulableVMs=unschedulable_vms,
        totalVcpusAllocated=total_vcpus_allocated,
        totalVcpusCapacity=total_vcpus_capacity,
        affectedNodes=affected_nodes,
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest tests/test_snapshot.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler_indexer/snapshot.py tests/test_snapshot.py
git commit -m "feat: add snapshot schema and factory function"
```

---

## Task 3: Collector

**Files:**
- Create: `src/scheduler_indexer/collector.py`
- Create: `tests/test_collector.py`
- Create: `tests/conftest.py`

The collector replicates the dashboard's `getOverviewStats()` logic (see `scheduler-dashboard/src/api/client.ts:262-292`). It fetches `/api/v1/stats`, `/api/v1/nodes`, `/api/v1/vms` in parallel, paginates using `fetchAllPages` equivalent, counts by status, and computes `affectedNodes`.

- [ ] **Step 1: Create conftest with shared fixtures**

```python
# tests/conftest.py
import pytest
import aiohttp


@pytest.fixture
async def session():
    async with aiohttp.ClientSession() as s:
        yield s
```

- [ ] **Step 2: Write the failing test**

```python
# tests/test_collector.py
import json

from aioresponses import aioresponses

from scheduler_indexer.collector import poll


def _paginated(items: list[dict], page: int = 1) -> dict:
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": 200,
            "total_items": len(items),
            "total_pages": 1,
        },
    }


MOCK_STATS = {
    "total_vms": 5,
    "total_nodes": 4,
    "healthy_nodes": 3,
    "total_vcpus_allocated": 100,
    "total_vcpus_capacity": 200,
}

MOCK_NODES = [
    {"node_hash": "n1", "status": "Healthy", "vm_count": 2, "observed_nodes": []},
    {"node_hash": "n2", "status": "Healthy", "vm_count": 1, "observed_nodes": []},
    {"node_hash": "n3", "status": "Unreachable", "vm_count": 0, "observed_nodes": []},
    {"node_hash": "n4", "status": "removed", "vm_count": 0, "observed_nodes": []},
]

MOCK_VMS = [
    {"vm_hash": "v1", "status": "scheduled", "allocated_node": "n1", "observed_nodes": ["n1"]},
    {"vm_hash": "v2", "status": "scheduled", "allocated_node": "n1", "observed_nodes": ["n1"]},
    {"vm_hash": "v3", "status": "orphaned", "allocated_node": "n2", "observed_nodes": ["n3"]},
    {"vm_hash": "v4", "status": "missing", "allocated_node": "n2", "observed_nodes": []},
    {"vm_hash": "v5", "status": "unschedulable", "allocated_node": None, "observed_nodes": []},
]

BASE = "https://rust-scheduler.aleph.im"


async def test_poll_returns_correct_snapshot():
    with aioresponses() as m:
        m.get(f"{BASE}/api/v1/stats", payload=MOCK_STATS)
        m.get(
            f"{BASE}/api/v1/nodes?page=1&page_size=200",
            payload=_paginated(MOCK_NODES),
        )
        m.get(
            f"{BASE}/api/v1/vms?page=1&page_size=200",
            payload=_paginated(MOCK_VMS),
        )

        snapshot = await poll(BASE)

    assert snapshot["tier"] == "raw"
    assert snapshot["totalNodes"] == 4
    assert snapshot["healthyNodes"] == 3
    assert snapshot["unreachableNodes"] == 1
    assert snapshot["unknownNodes"] == 0
    assert snapshot["removedNodes"] == 1
    assert snapshot["totalVMs"] == 5
    assert snapshot["scheduledVMs"] == 2
    assert snapshot["orphanedVMs"] == 1
    assert snapshot["missingVMs"] == 1
    assert snapshot["unschedulableVMs"] == 1
    assert snapshot["totalVcpusAllocated"] == 100
    assert snapshot["totalVcpusCapacity"] == 200
    # affectedNodes: orphaned v3 observed on n3, missing v4 allocated to n2 → {n3, n2} = 2
    assert snapshot["affectedNodes"] == 2


async def test_poll_multi_page():
    """Collector fetches all pages when total_pages > 1."""
    page1_nodes = MOCK_NODES[:2]
    page2_nodes = MOCK_NODES[2:]
    with aioresponses() as m:
        m.get(f"{BASE}/api/v1/stats", payload=MOCK_STATS)
        m.get(
            f"{BASE}/api/v1/nodes?page=1&page_size=200",
            payload={
                "items": page1_nodes,
                "pagination": {
                    "page": 1,
                    "page_size": 200,
                    "total_items": 4,
                    "total_pages": 2,
                },
            },
        )
        m.get(
            f"{BASE}/api/v1/nodes?page=2&page_size=200",
            payload={
                "items": page2_nodes,
                "pagination": {
                    "page": 2,
                    "page_size": 200,
                    "total_items": 4,
                    "total_pages": 2,
                },
            },
        )
        m.get(
            f"{BASE}/api/v1/vms?page=1&page_size=200",
            payload=_paginated(MOCK_VMS),
        )

        snapshot = await poll(BASE)

    assert snapshot["totalNodes"] == 4
    assert snapshot["unreachableNodes"] == 1
    assert snapshot["removedNodes"] == 1
```

- [ ] **Step 3: Run test to verify it fails**

```bash
uv run pytest tests/test_collector.py -v
```

Expected: `ModuleNotFoundError: No module named 'scheduler_indexer.collector'`

- [ ] **Step 4: Write the implementation**

```python
# src/scheduler_indexer/collector.py
import asyncio
import logging
from datetime import UTC, datetime

import aiohttp

from scheduler_indexer.config import MAX_PAGE_SIZE
from scheduler_indexer.snapshot import Snapshot, make_snapshot

logger = logging.getLogger(__name__)


async def _fetch_json(session: aiohttp.ClientSession, url: str) -> dict:
    async with session.get(url) as resp:
        resp.raise_for_status()
        return await resp.json()


async def _fetch_all_pages(
    session: aiohttp.ClientSession, base_url: str, path: str
) -> list[dict]:
    url = f"{base_url}{path}?page=1&page_size={MAX_PAGE_SIZE}"
    first = await _fetch_json(session, url)
    total_pages = first["pagination"]["total_pages"]
    if total_pages <= 1:
        return first["items"]

    tasks = [
        _fetch_json(session, f"{base_url}{path}?page={p}&page_size={MAX_PAGE_SIZE}")
        for p in range(2, total_pages + 1)
    ]
    remaining = await asyncio.gather(*tasks)
    items = list(first["items"])
    for page in remaining:
        items.extend(page["items"])
    return items


def _count_affected_nodes(vms: list[dict]) -> int:
    node_hashes: set[str] = set()
    for vm in vms:
        status = vm.get("status", "")
        if status == "orphaned":
            for n in vm.get("observed_nodes", []):
                node_hashes.add(n)
        elif status == "missing":
            allocated = vm.get("allocated_node")
            if allocated:
                node_hashes.add(allocated)
    return len(node_hashes)


_NODE_STATUS_MAP = {
    "Healthy": "healthy",
    "Unreachable": "unreachable",
    "Unknown": "unknown",
    "removed": "removed",
}


def _count_by(items: list[dict], key: str, value: str) -> int:
    return sum(1 for item in items if item.get(key) == value)


async def poll(scheduler_url: str) -> Snapshot:
    async with aiohttp.ClientSession() as session:
        stats_task = _fetch_json(session, f"{scheduler_url}/api/v1/stats")
        nodes_task = _fetch_all_pages(session, scheduler_url, "/api/v1/nodes")
        vms_task = _fetch_all_pages(session, scheduler_url, "/api/v1/vms")

        stats, nodes, vms = await asyncio.gather(stats_task, nodes_task, vms_task)

    # Map API node statuses to lowercase
    for node in nodes:
        node["_status"] = _NODE_STATUS_MAP.get(node.get("status", ""), "unknown")

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    return make_snapshot(
        tier="raw",
        timestamp=now,
        total_nodes=len(nodes),
        healthy_nodes=stats["healthy_nodes"],
        unreachable_nodes=sum(1 for n in nodes if n["_status"] == "unreachable"),
        unknown_nodes=sum(1 for n in nodes if n["_status"] == "unknown"),
        removed_nodes=sum(1 for n in nodes if n["_status"] == "removed"),
        total_vms=len(vms),
        scheduled_vms=_count_by(vms, "status", "scheduled"),
        orphaned_vms=_count_by(vms, "status", "orphaned"),
        missing_vms=_count_by(vms, "status", "missing"),
        unschedulable_vms=_count_by(vms, "status", "unschedulable"),
        total_vcpus_allocated=stats["total_vcpus_allocated"],
        total_vcpus_capacity=stats["total_vcpus_capacity"],
        affected_nodes=_count_affected_nodes(vms),
    )
```

- [ ] **Step 5: Run test to verify it passes**

```bash
uv run pytest tests/test_collector.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/scheduler_indexer/collector.py tests/conftest.py tests/test_collector.py
git commit -m "feat: add collector — polls scheduler API and builds snapshot"
```

---

## Task 4: Buffer (ring buffer + SQLite)

**Files:**
- Create: `src/scheduler_indexer/buffer.py`
- Create: `tests/test_buffer.py`

The buffer holds snapshots in memory (deques) and mirrors them to SQLite for crash recovery. On startup it loads from SQLite. On `append()` it inserts into SQLite and trims old rows.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_buffer.py
import json
import sqlite3

from scheduler_indexer.buffer import Buffer
from scheduler_indexer.snapshot import make_snapshot


def _raw_snapshot(ts: str, total_nodes: int = 100) -> dict:
    return make_snapshot(tier="raw", timestamp=ts, total_nodes=total_nodes)


class TestBuffer:
    def test_append_and_last_n(self, tmp_path):
        buf = Buffer(db_path=str(tmp_path / "test.db"))
        for i in range(5):
            buf.append("raw", _raw_snapshot(f"2026-01-01T00:0{i}:00Z", total_nodes=i))

        result = buf.last_n("raw", 3)
        assert len(result) == 3
        assert result[0]["totalNodes"] == 2
        assert result[2]["totalNodes"] == 4

    def test_maxlen_trims_deque(self, tmp_path):
        buf = Buffer(db_path=str(tmp_path / "test.db"))
        # raw maxlen is 288 — append 290 items
        for i in range(290):
            buf.append("raw", _raw_snapshot(f"t{i}", total_nodes=i))

        result = buf.last_n("raw", 290)
        assert len(result) == 288
        # Oldest should be i=2 (0 and 1 were trimmed)
        assert result[0]["totalNodes"] == 2

    def test_sqlite_persistence(self, tmp_path):
        db = str(tmp_path / "test.db")
        buf1 = Buffer(db_path=db)
        buf1.append("raw", _raw_snapshot("t1", total_nodes=10))
        buf1.append("hourly", _raw_snapshot("t2", total_nodes=20))

        # Create a new buffer from the same DB — should reload
        buf2 = Buffer(db_path=db)
        assert len(buf2.last_n("raw", 10)) == 1
        assert buf2.last_n("raw", 1)[0]["totalNodes"] == 10
        assert len(buf2.last_n("hourly", 10)) == 1

    def test_sqlite_trims_old_rows(self, tmp_path):
        buf = Buffer(db_path=str(tmp_path / "test.db"))
        for i in range(290):
            buf.append("raw", _raw_snapshot(f"t{i}"))

        conn = sqlite3.connect(str(tmp_path / "test.db"))
        count = conn.execute(
            "SELECT COUNT(*) FROM snapshots WHERE tier = 'raw'"
        ).fetchone()[0]
        conn.close()
        assert count == 288

    def test_last_n_empty_tier(self, tmp_path):
        buf = Buffer(db_path=str(tmp_path / "test.db"))
        assert buf.last_n("raw", 10) == []

    def test_mark_published_and_get_unpublished(self, tmp_path):
        buf = Buffer(db_path=str(tmp_path / "test.db"))
        buf.append("raw", _raw_snapshot("t1"), published=False)
        buf.append("raw", _raw_snapshot("t2"), published=True)

        unpublished = buf.get_unpublished(limit=10)
        assert len(unpublished) == 1
        assert unpublished[0][1]["timestamp"] == "t1"

        # Mark it published
        buf.mark_published(unpublished[0][0])
        assert buf.get_unpublished(limit=10) == []

    def test_rollup_state_persistence(self, tmp_path):
        db = str(tmp_path / "test.db")
        buf1 = Buffer(db_path=db)
        buf1.set_last_rollup("hourly", "2026-01-01T01:00:00Z")
        assert buf1.get_last_rollup("hourly") == "2026-01-01T01:00:00Z"

        buf2 = Buffer(db_path=db)
        assert buf2.get_last_rollup("hourly") == "2026-01-01T01:00:00Z"
        assert buf2.get_last_rollup("daily") is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_buffer.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

```python
# src/scheduler_indexer/buffer.py
import json
import sqlite3
from collections import deque
from pathlib import Path

from scheduler_indexer.config import TIER_MAXLEN
from scheduler_indexer.snapshot import Snapshot

_SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    data JSON NOT NULL,
    published BOOLEAN NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tier_ts ON snapshots(tier, timestamp);
CREATE INDEX IF NOT EXISTS idx_unpublished ON snapshots(published) WHERE published = 0;

CREATE TABLE IF NOT EXISTS rollup_state (
    tier TEXT PRIMARY KEY,
    last_timestamp TEXT NOT NULL
);
"""


class Buffer:
    def __init__(self, db_path: str) -> None:
        self._deques: dict[str, deque[Snapshot]] = {}
        for tier, maxlen in TIER_MAXLEN.items():
            ml = maxlen if maxlen > 0 else None
            self._deques[tier] = deque(maxlen=ml)

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.executescript(_SCHEMA)
        self._load_from_db()

    def _load_from_db(self) -> None:
        for tier, dq in self._deques.items():
            maxlen = TIER_MAXLEN[tier]
            query = "SELECT data FROM snapshots WHERE tier = ? ORDER BY id ASC"
            if maxlen > 0:
                query += f" LIMIT {maxlen}"
                # Get the last N rows by subquery
                rows = self._conn.execute(
                    "SELECT data FROM ("
                    "  SELECT data, id FROM snapshots WHERE tier = ? ORDER BY id DESC LIMIT ?"
                    ") ORDER BY id ASC",
                    (tier, maxlen),
                ).fetchall()
            else:
                rows = self._conn.execute(query, (tier,)).fetchall()
            for (data_json,) in rows:
                dq.append(json.loads(data_json))

    def append(self, tier: str, snapshot: Snapshot, *, published: bool = True) -> int:
        """Append a snapshot. Returns the SQLite row id for later mark_published()."""
        if tier not in self._deques:
            msg = f"Unknown tier: {tier}"
            raise ValueError(msg)

        self._deques[tier].append(snapshot)

        cursor = self._conn.execute(
            "INSERT INTO snapshots (tier, timestamp, data, published) VALUES (?, ?, ?, ?)",
            (tier, snapshot["timestamp"], json.dumps(snapshot), published),
        )
        row_id = cursor.lastrowid

        maxlen = TIER_MAXLEN[tier]
        if maxlen > 0:
            self._conn.execute(
                "DELETE FROM snapshots WHERE tier = ? AND id NOT IN "
                "(SELECT id FROM snapshots WHERE tier = ? ORDER BY id DESC LIMIT ?)",
                (tier, tier, maxlen),
            )

        self._conn.commit()
        return row_id

    def last_n(self, tier: str, n: int) -> list[Snapshot]:
        dq = self._deques.get(tier)
        if not dq:
            return []
        items = list(dq)
        return items[-n:] if n < len(items) else items

    def get_unpublished(self, limit: int = 10) -> list[tuple[int, Snapshot]]:
        rows = self._conn.execute(
            "SELECT id, data FROM snapshots WHERE published = 0 ORDER BY id ASC LIMIT ?",
            (limit,),
        ).fetchall()
        return [(row_id, json.loads(data)) for row_id, data in rows]

    def mark_published(self, row_id: int) -> None:
        self._conn.execute("UPDATE snapshots SET published = 1 WHERE id = ?", (row_id,))
        self._conn.commit()

    def set_last_rollup(self, tier: str, timestamp: str) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO rollup_state (tier, last_timestamp) VALUES (?, ?)",
            (tier, timestamp),
        )
        self._conn.commit()

    def get_last_rollup(self, tier: str) -> str | None:
        row = self._conn.execute(
            "SELECT last_timestamp FROM rollup_state WHERE tier = ?", (tier,)
        ).fetchone()
        return row[0] if row else None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest tests/test_buffer.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler_indexer/buffer.py tests/test_buffer.py
git commit -m "feat: add buffer — ring buffer with SQLite persistence"
```

---

## Task 5: Rollup (averaging + boundary detection)

**Files:**
- Create: `src/scheduler_indexer/rollup.py`
- Create: `tests/test_rollup.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_rollup.py
from datetime import datetime, UTC

from scheduler_indexer.rollup import average, should_rollup
from scheduler_indexer.snapshot import make_snapshot


def _snap(total_nodes: int, healthy_nodes: int = 0) -> dict:
    return make_snapshot(
        tier="raw",
        timestamp="t",
        total_nodes=total_nodes,
        healthy_nodes=healthy_nodes,
    )


class TestAverage:
    def test_average_single(self):
        result = average([_snap(100, 50)], tier="hourly", timestamp="2026-01-01T01:00:00Z")
        assert result["totalNodes"] == 100
        assert result["healthyNodes"] == 50
        assert result["tier"] == "hourly"
        assert result["timestamp"] == "2026-01-01T01:00:00Z"

    def test_average_multiple(self):
        snaps = [_snap(100, 40), _snap(200, 60), _snap(300, 80)]
        result = average(snaps, tier="daily", timestamp="2026-01-01T00:00:00Z")
        assert result["totalNodes"] == 200
        assert result["healthyNodes"] == 60

    def test_average_rounds_to_int(self):
        snaps = [_snap(10), _snap(11)]
        result = average(snaps, tier="hourly", timestamp="t")
        # (10 + 11) / 2 = 10.5 → round to 10 or 11
        assert result["totalNodes"] in (10, 11)

    def test_average_empty_raises(self):
        import pytest

        with pytest.raises(ValueError, match="empty"):
            average([], tier="hourly", timestamp="t")


class TestShouldRollup:
    def test_hourly_at_minute_zero(self):
        now = datetime(2026, 1, 1, 14, 0, 0, tzinfo=UTC)
        assert should_rollup("hourly", now, last_rollup=None) is True

    def test_hourly_not_at_minute_zero(self):
        now = datetime(2026, 1, 1, 14, 5, 0, tzinfo=UTC)
        assert should_rollup("hourly", now, last_rollup=None) is False

    def test_hourly_already_rolled(self):
        now = datetime(2026, 1, 1, 14, 0, 0, tzinfo=UTC)
        assert should_rollup("hourly", now, last_rollup="2026-01-01T14:00:00Z") is False

    def test_hourly_previous_hour_rolled(self):
        now = datetime(2026, 1, 1, 14, 0, 0, tzinfo=UTC)
        assert should_rollup("hourly", now, last_rollup="2026-01-01T13:00:00Z") is True

    def test_daily_at_midnight(self):
        now = datetime(2026, 1, 2, 0, 0, 0, tzinfo=UTC)
        assert should_rollup("daily", now, last_rollup=None) is True

    def test_daily_not_at_midnight(self):
        now = datetime(2026, 1, 1, 14, 0, 0, tzinfo=UTC)
        assert should_rollup("daily", now, last_rollup=None) is False

    def test_weekly_on_sunday_midnight(self):
        # 2026-01-04 is a Sunday
        now = datetime(2026, 1, 4, 0, 0, 0, tzinfo=UTC)
        assert now.weekday() == 6  # Sunday
        assert should_rollup("weekly", now, last_rollup=None) is True

    def test_weekly_not_sunday(self):
        now = datetime(2026, 1, 5, 0, 0, 0, tzinfo=UTC)  # Monday
        assert should_rollup("weekly", now, last_rollup=None) is False

    def test_monthly_on_first(self):
        now = datetime(2026, 2, 1, 0, 0, 0, tzinfo=UTC)
        assert should_rollup("monthly", now, last_rollup=None) is True

    def test_monthly_not_first(self):
        now = datetime(2026, 1, 15, 0, 0, 0, tzinfo=UTC)
        assert should_rollup("monthly", now, last_rollup=None) is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_rollup.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

```python
# src/scheduler_indexer/rollup.py
from datetime import UTC, datetime

from scheduler_indexer.snapshot import NUMERIC_FIELDS, Snapshot


def average(snapshots: list[Snapshot], *, tier: str, timestamp: str) -> Snapshot:
    if not snapshots:
        msg = "Cannot average empty snapshot list"
        raise ValueError(msg)

    n = len(snapshots)
    result: dict = {"tier": tier, "timestamp": timestamp}
    for field in NUMERIC_FIELDS:
        total = sum(s[field] for s in snapshots)
        result[field] = round(total / n)
    return result  # type: ignore[return-value]


def _period_key(tier: str, dt: datetime) -> str:
    if tier == "hourly":
        return dt.strftime("%Y-%m-%dT%H:00:00Z")
    if tier == "daily":
        return dt.strftime("%Y-%m-%dT00:00:00Z")
    if tier == "weekly":
        return dt.strftime("%Y-%m-%dT00:00:00Z")
    if tier == "monthly":
        return dt.strftime("%Y-%m-01T00:00:00Z")
    return ""


def should_rollup(tier: str, now: datetime, *, last_rollup: str | None) -> bool:
    if tier == "hourly":
        if now.minute != 0:
            return False
    elif tier == "daily":
        if now.hour != 0 or now.minute != 0:
            return False
    elif tier == "weekly":
        if now.weekday() != 6 or now.hour != 0 or now.minute != 0:
            return False
    elif tier == "monthly":
        if now.day != 1 or now.hour != 0 or now.minute != 0:
            return False
    else:
        return False

    current_key = _period_key(tier, now)
    if last_rollup and last_rollup >= current_key:
        return False

    return True


def rollup_timestamp(tier: str, now: datetime) -> str:
    return _period_key(tier, now)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest tests/test_rollup.py -v
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler_indexer/rollup.py tests/test_rollup.py
git commit -m "feat: add rollup — boundary detection and snapshot averaging"
```

---

## Task 6: Publisher (Aleph POST messages)

**Files:**
- Create: `src/scheduler_indexer/publisher.py`
- Create: `tests/test_publisher.py`

Uses `aleph-sdk-python` v2.x to create POST messages via `AuthenticatedAlephHttpClient`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_publisher.py
from unittest.mock import AsyncMock, patch, MagicMock

from scheduler_indexer.publisher import Publisher
from scheduler_indexer.snapshot import make_snapshot


def _snap() -> dict:
    return make_snapshot(tier="raw", timestamp="2026-01-01T00:00:00Z", total_nodes=100)


class TestPublisher:
    async def test_post_calls_sdk(self):
        mock_client = AsyncMock()
        mock_client.create_post = AsyncMock(
            return_value=(MagicMock(item_hash="abc"), "processed")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch(
            "scheduler_indexer.publisher.AuthenticatedAlephHttpClient",
            return_value=mock_client,
        ):
            pub = Publisher(private_key="0x" + "aa" * 32, sender_address="0xSENDER")
            result = await pub.post("scheduler-stats-5m", _snap())

        assert result is True
        mock_client.create_post.assert_called_once()
        call_kwargs = mock_client.create_post.call_args[1]
        assert call_kwargs["post_type"] == "scheduler-stats"
        assert call_kwargs["channel"] == "scheduler-stats-5m"

    async def test_post_returns_false_on_failure(self):
        mock_client = AsyncMock()
        mock_client.create_post = AsyncMock(side_effect=Exception("network error"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch(
            "scheduler_indexer.publisher.AuthenticatedAlephHttpClient",
            return_value=mock_client,
        ):
            pub = Publisher(private_key="0x" + "aa" * 32, sender_address="0xSENDER")
            result = await pub.post("scheduler-stats-5m", _snap())

        assert result is False

    async def test_post_retries_once(self):
        call_count = 0

        async def flaky_create_post(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("transient")
            return (MagicMock(item_hash="abc"), "processed")

        mock_client = AsyncMock()
        mock_client.create_post = AsyncMock(side_effect=flaky_create_post)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch(
            "scheduler_indexer.publisher.AuthenticatedAlephHttpClient",
            return_value=mock_client,
        ):
            pub = Publisher(private_key="0x" + "aa" * 32, sender_address="0xSENDER")
            result = await pub.post("scheduler-stats-5m", _snap())

        assert result is True
        assert call_count == 2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_publisher.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

```python
# src/scheduler_indexer/publisher.py
import logging

from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.client import AuthenticatedAlephHttpClient

from scheduler_indexer.config import POST_TYPE
from scheduler_indexer.snapshot import Snapshot

logger = logging.getLogger(__name__)


class Publisher:
    def __init__(self, private_key: str, sender_address: str) -> None:
        key_hex = private_key.removeprefix("0x")
        self._account = ETHAccount(bytes.fromhex(key_hex))
        self._sender = sender_address

    async def post(self, channel: str, snapshot: Snapshot) -> bool:
        for attempt in range(2):
            try:
                async with AuthenticatedAlephHttpClient(self._account) as client:
                    await client.create_post(
                        post_content=snapshot,
                        post_type=POST_TYPE,
                        channel=channel,
                    )
                return True
            except Exception:
                if attempt == 0:
                    logger.warning("POST to %s failed, retrying...", channel)
                else:
                    logger.error("POST to %s failed after retry", channel, exc_info=True)
        return False
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest tests/test_publisher.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler_indexer/publisher.py tests/test_publisher.py
git commit -m "feat: add publisher — Aleph POST message writer with retry"
```

---

## Task 7: Main loop

**Files:**
- Create: `src/scheduler_indexer/main.py`

The main loop ties everything together: poll → buffer → rollup → publish → backfill → sleep.

- [ ] **Step 1: Write the implementation**

```python
# src/scheduler_indexer/main.py
import asyncio
import logging
from datetime import UTC, datetime, timedelta

from scheduler_indexer.buffer import Buffer
from scheduler_indexer.collector import poll
from scheduler_indexer.config import (
    ALEPH_PRIVATE_KEY,
    ALEPH_SENDER_ADDRESS,
    DB_PATH,
    POLL_INTERVAL,
    SCHEDULER_API_URL,
    TIER_CHANNELS,
)
from scheduler_indexer.publisher import Publisher
from scheduler_indexer.rollup import average, rollup_timestamp, should_rollup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

ROLLUP_TIERS = [
    ("hourly", "raw", 12),
    ("daily", "hourly", 24),
    ("weekly", "daily", 7),
]


async def _backfill(publisher: Publisher, buffer: Buffer) -> None:
    unpublished = buffer.get_unpublished(limit=10)
    for row_id, snapshot in unpublished:
        tier = snapshot.get("tier", "raw")
        channel = TIER_CHANNELS.get(tier, TIER_CHANNELS["raw"])
        ok = await publisher.post(channel, snapshot)
        if ok:
            buffer.mark_published(row_id)
            logger.info("Backfilled snapshot %d (%s)", row_id, tier)
        else:
            break  # Stop on first failure


def _days_in_prev_month(now: datetime) -> int:
    first_of_current = now.replace(day=1)
    last_of_prev = first_of_current - timedelta(days=1)
    return last_of_prev.day


async def main() -> None:
    logger.info("Starting stats indexer")
    logger.info("Scheduler API: %s", SCHEDULER_API_URL)
    logger.info("Poll interval: %ds", POLL_INTERVAL)

    buffer = Buffer(db_path=DB_PATH)
    publisher = Publisher(ALEPH_PRIVATE_KEY, ALEPH_SENDER_ADDRESS)

    while True:
        try:
            snapshot = await poll(SCHEDULER_API_URL)
            # Append as unpublished first, then publish and mark on success.
            # append() returns the row id so we mark the correct row.
            row_id = buffer.append("raw", snapshot, published=False)
            logger.info(
                "Polled: %d nodes, %d VMs",
                snapshot["totalNodes"],
                snapshot["totalVMs"],
            )

            channel = TIER_CHANNELS["raw"]
            ok = await publisher.post(channel, snapshot)
            if ok:
                buffer.mark_published(row_id)
        except Exception:
            logger.error("Poll cycle failed", exc_info=True)
            await asyncio.sleep(POLL_INTERVAL)
            continue

        now = datetime.now(UTC)

        # Rollups: hourly, daily, weekly
        for tier, source_tier, count in ROLLUP_TIERS:
            last = buffer.get_last_rollup(tier)
            if should_rollup(tier, now, last_rollup=last):
                source_data = buffer.last_n(source_tier, count)
                if source_data:
                    ts = rollup_timestamp(tier, now)
                    rollup_snap = average(source_data, tier=tier, timestamp=ts)
                    rid = buffer.append(tier, rollup_snap, published=False)
                    ok = await publisher.post(TIER_CHANNELS[tier], rollup_snap)
                    if ok:
                        buffer.mark_published(rid)
                    buffer.set_last_rollup(tier, ts)
                    logger.info("Computed %s rollup at %s", tier, ts)

        # Monthly rollup (variable day count)
        last_monthly = buffer.get_last_rollup("monthly")
        if should_rollup("monthly", now, last_rollup=last_monthly):
            days = _days_in_prev_month(now)
            source_data = buffer.last_n("daily", days)
            if source_data:
                ts = rollup_timestamp("monthly", now)
                rollup_snap = average(source_data, tier="monthly", timestamp=ts)
                rid = buffer.append("monthly", rollup_snap, published=False)
                ok = await publisher.post(TIER_CHANNELS["monthly"], rollup_snap)
                if ok:
                    buffer.mark_published(rid)
                buffer.set_last_rollup("monthly", ts)
                logger.info("Computed monthly rollup at %s", ts)

        # Backfill unpublished snapshots
        try:
            await _backfill(publisher, buffer)
        except Exception:
            logger.error("Backfill failed", exc_info=True)

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Smoke test**

```bash
uv run python -c "from scheduler_indexer.main import main; print('import OK')"
```

Expected: `import OK`

- [ ] **Step 3: Commit**

```bash
git add src/scheduler_indexer/main.py
git commit -m "feat: add main loop — poll, rollup, publish, backfill"
```

---

## Task 8: Docker + deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# Dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ src/
CMD ["uv", "run", "python", "-m", "scheduler_indexer.main"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
# docker-compose.yml
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

- [ ] **Step 3: Verify Docker build**

```bash
docker build -t scheduler-indexer .
```

Expected: successful build.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "chore: add Docker setup for deployment"
```

---

## Task 9: Final checks + lint

- [ ] **Step 1: Run full test suite**

```bash
uv run pytest -q
```

Expected: all tests pass.

- [ ] **Step 2: Run linter**

```bash
uv run ruff check src/ tests/
```

Expected: no errors. Fix any issues.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint fixes"
```
