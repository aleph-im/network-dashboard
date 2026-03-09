"""Upload a directory to IPFS via Aleph Cloud with delegated billing.

Uses the SDK directly because the CLI doesn't expose the `address`
parameter needed for delegation (signing with one wallet, billing
another).

Usage:
    python scripts/deploy-ipfs.py out/

Environment variables:
    ALEPH_PRIVATE_KEY   - hex private key of the CI wallet (signer)
    ALEPH_OWNER_ADDRESS - address of the wallet that pays (delegator)
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import base58
from aleph.sdk import AuthenticatedAlephHttpClient
from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.conf import settings
from aleph.sdk.types import StorageEnum


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

    try:
        async with aiohttp.ClientSession() as session:
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
    channel: str = "ALEPH-CLOUDSOLUTIONS",
) -> None:
    """Pin CID on Aleph network using delegated address for billing."""
    account = ETHAccount(private_key=bytes.fromhex(private_key))
    async with AuthenticatedAlephHttpClient(
        account=account,
        api_server=settings.API_HOST,
    ) as client:
        result, status = await client.create_store(
            file_hash=cid,
            storage_engine=StorageEnum.ipfs,
            channel=channel,
            address=owner_address,
        )
        print(result.model_dump_json(indent=4))


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
    if not private_key:
        print("ERROR: ALEPH_PRIVATE_KEY env var is required")
        sys.exit(1)
    if not owner_address:
        print("ERROR: ALEPH_OWNER_ADDRESS env var is required")
        sys.exit(1)

    # Strip 0x prefix if present
    if private_key.startswith("0x"):
        private_key = private_key[2:]

    print(f"Uploading {directory} to IPFS...")
    cid_v0 = await upload_directory_to_ipfs(directory)
    print(f"CID (v0): {cid_v0}")

    print("Pinning on Aleph network...")
    await pin_on_aleph(cid_v0, private_key, owner_address)

    cid_v1 = cidv0_to_v1(cid_v0)
    gateway_url = f"https://{cid_v1}.ipfs.aleph.sh/"

    print(f"\nCID (v1): {cid_v1}")
    print(f"Gateway:  {gateway_url}")

    # Write outputs for GitHub Actions
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"cid_v0={cid_v0}\n")
            f.write(f"cid_v1={cid_v1}\n")


if __name__ == "__main__":
    asyncio.run(main())
