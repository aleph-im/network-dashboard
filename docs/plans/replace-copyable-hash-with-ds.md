# Plan: Replace local CopyableHash with DS CopyableText

Replace the local `src/components/copyable-hash.tsx` with `CopyableText` from `@aleph-front/ds@0.3.0`.

## Context

The DS now ships a `CopyableText` component (`@aleph-front/ds/copyable-text`) that does everything our local `CopyableHash` does, plus:
- Middle-ellipsis truncation (`abc123...f4b7` instead of `abc123...`)
- Clip-path circle reveal animation (instead of CSS keyframe icon swap)
- Phosphor Icons (`Copy`, `Check`, `ArrowUpRight`) instead of inline SVGs
- CVA size variants (`sm`, `md`)
- Tooltip showing full text on hover
- `motion-reduce` support
- Proper cleanup with `useRef` timer

### DS CopyableText API

```tsx
import { CopyableText } from "@aleph-front/ds/copyable-text";

<CopyableText
  text="ff063e62ca3f7e27ed475fa0daa1e768931f4b76..."
  startChars={6}     // default: 6
  endChars={4}       // default: 4
  href="https://..."  // optional — shows ArrowUpRight link icon
  size="md"           // "sm" | "md"
  className="..."     // extra classes on the root <span>
/>
```

**Key prop mapping from CopyableHash → CopyableText:**
- `hash` → `text`
- `chars` → `startChars` (+ `endChars` for middle truncation)
- `explorerUrl` → `href`
- `className` → `className` (same)

## Tasks

### Task 1: Replace CopyableHash in node-table.tsx

**File:** `src/components/node-table.tsx`

- Change import from `@/components/copyable-hash` → `@aleph-front/ds/copyable-text`
- Replace `<CopyableHash hash={r.hash} />` with `<CopyableText text={r.hash} startChars={10} endChars={4} size="sm" />`
- Remove the `CopyableHash` import

### Task 2: Replace CopyableHash in vm-table.tsx

**File:** `src/components/vm-table.tsx`

Three usages:

1. **VM Hash column** (line ~125):
   ```tsx
   // Before
   <CopyableHash hash={r.hash} className={...} {...explorerUrl spread} />
   // After
   <CopyableText text={r.hash} startChars={10} endChars={4} size="sm"
     className={isDiscrepancy(r) ? "text-warning-400" : ""}
     {...(msgInfo?.get(r.hash)?.explorerUrl ? { href: msgInfo.get(r.hash)!.explorerUrl } : {})}
   />
   ```

2. **Node hash column** (line ~161):
   ```tsx
   // Before
   <CopyableHash hash={r.allocatedNode} className="text-xs text-muted-foreground" />
   // After
   <CopyableText text={r.allocatedNode} startChars={8} endChars={4} size="sm"
     className="text-muted-foreground" />
   ```

- Change import from `@/components/copyable-hash` → `@aleph-front/ds/copyable-text`

### Task 3: Replace CopyableHash in vm-detail-panel.tsx

**File:** `src/components/vm-detail-panel.tsx`

- Replace `<CopyableHash hash={vm.hash} chars={20} {...explorerUrl spread} />` with:
  ```tsx
  <CopyableText text={vm.hash} startChars={16} endChars={6} size="sm"
    {...(messageInfo?.get(vm.hash)?.explorerUrl ? { href: messageInfo.get(vm.hash)!.explorerUrl } : {})}
  />
  ```
- Change import from `@/components/copyable-hash` → `@aleph-front/ds/copyable-text`

### Task 4: Replace CopyableHash in node-detail-panel.tsx

**File:** `src/components/node-detail-panel.tsx`

- Replace `<CopyableHash hash={node.hash} chars={20} />` with:
  ```tsx
  <CopyableText text={node.hash} startChars={16} endChars={6} size="sm" />
  ```
- Change import from `@/components/copyable-hash` → `@aleph-front/ds/copyable-text`

### Task 5: Delete local component and CSS keyframe

- Delete `src/components/copyable-hash.tsx`
- Remove the `animate-icon-in` keyframe and `@utility` from `src/app/globals.css` (the `/* ── Micro-animations ──` section)
- Verify `truncateHash` in `src/lib/format.ts` is still used elsewhere; if not, remove it too

### Task 6: Verify

- Run `pnpm check` — all must pass
- Visually verify: hash columns in node/VM tables, detail panels, copy + link icons work
- Confirm middle-ellipsis shows correctly (e.g. `ff063e...f4b76`)
- Confirm circle-reveal animation fires on copy click

### Task 7: Update docs

- [ ] ARCHITECTURE.md — note CopyableText DS import, remove mention of local copyable-hash
- [ ] DECISIONS.md — log decision to replace local component with DS equivalent
- [ ] BACKLOG.md — no changes needed (item was on DS backlog, already completed)
- [ ] CLAUDE.md — no feature change
