"""Upload a directory to IPFS via Aleph Cloud with delegated billing.

Uses the SDK directly because the CLI doesn't expose the `address`
parameter needed for delegation (signing with one wallet, billing
another).

After pinning the content, writes `websites` and `domains` aggregate
messages so that a custom domain (set up once) always resolves to the
latest deployment.

Usage:
    python scripts/deploy-ipfs.py out/

Environment variables:
    ALEPH_PRIVATE_KEY   - hex private key of the CI wallet (signer)
    ALEPH_OWNER_ADDRESS - address of the wallet that pays (delegator)
    ALEPH_WEBSITE_NAME  - identifier in the websites aggregate
    ALEPH_DOMAIN        - (optional) FQDN to attach, e.g. scheduler.aleph.cloud
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import base58
from aleph.sdk import AlephHttpClient, AuthenticatedAlephHttpClient
from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.conf import settings
from aleph.sdk.types import StorageEnum

CHANNEL = "ALEPH-CLOUDSOLUTIONS"
WEBSITES_KEY = "websites"
DOMAINS_KEY = "domains"


async def upload_directory_to_ipfs(directory: Path) -> str:
    """Upload directory to IPFS gateway, return CIDv0."""
    params = {"recursive": "true", "wrap-with-directory": "true"}

    url = (
        urlparse(settings.IPFS_GATEWAY)
        ._replace(path="/api/v0/add")
        .geturl()
    )

    form = aiohttp.FormData()
    file_handles = []
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            relative = str(path.relative_to(directory))
            fh = open(path, "rb")  # noqa: SIM115
            file_handles.append(fh)
            form.add_field("file", fh, filename=relative)

    # IPFS gateway can take longer than aiohttp's default 5-minute total
    # timeout to respond, especially as the build grows. Cap at 20 minutes.
    timeout = aiohttp.ClientTimeout(total=1200)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            response = await session.post(url, params=params, data=form)
            response.raise_for_status()
            text = await response.text()
    finally:
        for fh in file_handles:
            fh.close()

    cid = None
    for line in text.strip().splitlines():
        entry = json.loads(line)
        cid = entry.get("Hash")

    if not cid:
        print("ERROR: No CID found in IPFS gateway response")
        sys.exit(1)

    return cid


async def pin_on_aleph(
    cid: str,
    private_key: str,
    owner_address: str,
) -> str:
    """Pin CID on Aleph network. Returns the STORE message item_hash."""
    account = ETHAccount(private_key=bytes.fromhex(private_key))
    async with AuthenticatedAlephHttpClient(
        account=account,
        api_server=settings.API_HOST,
    ) as client:
        result, status = await client.create_store(
            file_hash=cid,
            storage_engine=StorageEnum.ipfs,
            channel=CHANNEL,
            address=owner_address,
        )
        print(result.model_dump_json(indent=4))
        return result.item_hash


async def fetch_existing_website(
    owner_address: str,
    website_name: str,
) -> dict | None:
    """Fetch the current website entry from the aggregate, if any."""
    async with AlephHttpClient(api_server=settings.API_HOST) as client:
        try:
            agg = await client.fetch_aggregate(owner_address, WEBSITES_KEY)
            return agg.get(website_name)
        except Exception:
            return None


async def write_website_aggregate(
    private_key: str,
    owner_address: str,
    website_name: str,
    volume_id: str,
    existing: dict | None,
) -> None:
    """Write/update the websites aggregate with the new volume_id."""
    now = time.time()

    if existing:
        version = existing.get("version", 0) + 1
        old_history = existing.get("history", {})
        old_volume = existing.get("volume_id")
        old_version = str(existing.get("version", 0))
        history = {old_version: old_volume, **old_history}
        # Keep last 10 versions
        history = dict(list(history.items())[:10])
        created_at = existing.get("created_at", now)
        metadata = existing.get("metadata", {"name": website_name})
        payment = existing.get("payment")
        ens = existing.get("ens")
    else:
        version = 1
        history = {}
        created_at = now
        metadata = {"name": website_name}
        payment = None
        ens = None

    entry: dict = {
        "metadata": metadata,
        "version": version,
        "volume_id": volume_id,
        "history": history,
        "created_at": created_at,
        "updated_at": now,
    }
    if payment is not None:
        entry["payment"] = payment
    if ens is not None:
        entry["ens"] = ens

    content = {website_name: entry}

    account = ETHAccount(private_key=bytes.fromhex(private_key))
    async with AuthenticatedAlephHttpClient(
        account=account,
        api_server=settings.API_HOST,
    ) as client:
        await client.create_aggregate(
            key=WEBSITES_KEY,
            content=content,
            address=owner_address,
            channel=CHANNEL,
        )
    print(f"Updated websites aggregate: {website_name} v{version}")


async def write_domain_aggregate(
    private_key: str,
    owner_address: str,
    domain: str,
    volume_id: str,
) -> None:
    """Write/update the domains aggregate to point at the new volume."""
    content = {
        domain: {
            "type": "ipfs",
            "programType": "ipfs",
            "message_id": volume_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "options": {"catch_all_path": "/404.html"},
        },
    }

    account = ETHAccount(private_key=bytes.fromhex(private_key))
    async with AuthenticatedAlephHttpClient(
        account=account,
        api_server=settings.API_HOST,
    ) as client:
        await client.create_aggregate(
            key=DOMAINS_KEY,
            content=content,
            address=owner_address,
            channel=CHANNEL,
        )
    print(f"Updated domains aggregate: {domain} -> {volume_id}")


def cidv0_to_v1(cidv0: str) -> str:
    """Convert CIDv0 (Qm...) to CIDv1 base32 for subdomain gateway."""
    multihash = base58.b58decode(cidv0)
    cidv1_bytes = bytes([0x01, 0x70]) + multihash
    b32 = base64.b32encode(cidv1_bytes).decode().lower().rstrip("=")
    return f"b{b32}"


async def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <directory>")
        sys.exit(1)

    directory = Path(sys.argv[1])
    if not directory.is_dir():
        print(f"ERROR: {directory} is not a directory")
        sys.exit(1)

    private_key = os.environ.get("ALEPH_PRIVATE_KEY", "")
    owner_address = os.environ.get("ALEPH_OWNER_ADDRESS", "")
    website_name = os.environ.get("ALEPH_WEBSITE_NAME", "")
    domain = os.environ.get("ALEPH_DOMAIN", "")

    if not private_key:
        print("ERROR: ALEPH_PRIVATE_KEY env var is required")
        sys.exit(1)
    if not owner_address:
        print("ERROR: ALEPH_OWNER_ADDRESS env var is required")
        sys.exit(1)
    if not website_name:
        print("ERROR: ALEPH_WEBSITE_NAME env var is required")
        sys.exit(1)

    # Strip 0x prefix if present
    if private_key.startswith("0x"):
        private_key = private_key[2:]

    # 1. Upload to IPFS
    print(f"Uploading {directory} to IPFS...")
    cid_v0 = await upload_directory_to_ipfs(directory)
    print(f"CID (v0): {cid_v0}")

    # 2. Pin on Aleph
    print("Pinning on Aleph network...")
    volume_id = await pin_on_aleph(cid_v0, private_key, owner_address)

    # 3. Update websites aggregate
    print("Updating websites aggregate...")
    existing = await fetch_existing_website(owner_address, website_name)
    await write_website_aggregate(
        private_key, owner_address, website_name, volume_id, existing,
    )

    # 4. Update domains aggregate (if configured)
    if domain:
        print(f"Updating domains aggregate for {domain}...")
        await write_domain_aggregate(
            private_key, owner_address, domain, volume_id,
        )

    cid_v1 = cidv0_to_v1(cid_v0)
    gateway_url = f"https://{cid_v1}.ipfs.aleph.sh/"

    print(f"\nCID (v1): {cid_v1}")
    print(f"Gateway:  {gateway_url}")
    if domain:
        print(f"Domain:   https://{domain}/")

    # Write outputs for GitHub Actions
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"cid_v0={cid_v0}\n")
            f.write(f"cid_v1={cid_v1}\n")


if __name__ == "__main__":
    asyncio.run(main())
