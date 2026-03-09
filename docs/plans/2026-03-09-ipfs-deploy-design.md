# Design: Manual IPFS Deploy via GitHub Actions

## Overview

A `workflow_dispatch`-triggered GitHub Actions workflow that builds the static site, uploads the `out/` directory to IPFS via `aleph file upload`, and prints the Aleph gateway URL in the job summary.

## Workflow

```
checkout → pnpm install → pnpm build → pip install aleph-client → aleph file upload out/ → parse CID → job summary
```

### Steps

1. **Checkout** repo
2. **Setup Node 22** + `pnpm install`
3. **Build** — `pnpm build` produces `out/`
4. **Install aleph-client** — `pip install aleph-client`
5. **Upload** `out/` directory:
   ```bash
   aleph file upload out/ \
     --storage-engine ipfs \
     --private-key "$ALEPH_PRIVATE_KEY" \
     --channel ALEPH-CLOUDSOLUTIONS
   ```
6. **Parse CID** from JSON output — `content.item_hash` is the IPFS CIDv0 (`Qm...`)
7. **Convert CIDv0→CIDv1** base32 for subdomain gateway format (4-line Python snippet using `base58` from aleph-client deps)
8. **Job summary** — write gateway URL: `https://<cidv1>.ipfs.aleph.sh/`

### Auth

- CI wallet private key stored as GitHub Actions secret `ALEPH_PRIVATE_KEY`
- Passed via `--private-key` flag (no key file on disk, no config needed)
- Delegation from the main wallet (`0xB136a85c95a0ea573793AB9739c7dF8682B87fCa`) handled outside this workflow

### CLI output format

`aleph file upload` returns JSON. The IPFS CID is at `content.item_hash`. The outer `item_hash` is the Aleph message hash (different thing).

```json
{
  "item_hash": "bc3dfb3f...",
  "content": {
    "item_hash": "QmeomffUNfmQy76CQGy9NdmqEnnHU9soCexBnGU3ezPHVH"
  }
}
```

### What it doesn't do

- No auto-trigger on push to main (manual `workflow_dispatch` only)
- No domain attachment (no custom domain yet)
- No rollback mechanism (previous uploads remain accessible by their CID)

## Setup instructions

### GitHub Actions secret

1. Go to the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `ALEPH_PRIVATE_KEY`
4. Value: the CI wallet's private key (hex string)
5. Click **Add secret**

The secret is masked in logs and never exposed in workflow output.

## File

`.github/workflows/deploy.yml`
