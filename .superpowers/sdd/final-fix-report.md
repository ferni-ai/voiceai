# Final Fix Report — Whole-Branch Review Findings

## Fix 1: delivery-adapter live path (Critical, prod safety)

**File:** `apps/async/src/outreach/delivery-adapter.ts`

**Problem:** The non-dry-run `shouldDeliver` path wrote status `delivered` without
performing any real channel send. If `DRY_RUN` were unset in prod, this would
silently mark users as contacted when no message was ever sent.

**Fix:**
- Added `'processing'` to `DeliveryIntentResult['status']` union.
- Live (`!dryRun && shouldDeliver`) path now writes `status: 'processing'` +
  `deliveryIntent` + `deliveryNote: 'intent-recorded-awaiting-channel-send'`,
  and returns `{ status: 'processing', dryRun: false, ... }` instead of
  `delivered`. `delivered` is now only ever written by the dry-run branch.
- `processor.ts`'s `success: fulfillment.status !== 'failed'` already treated
  non-`failed` statuses as success for batch counts, so `processing` counts
  as a successful (non-failed) trigger without further changes.
- Added a test asserting the live path returns/writes `processing` and never
  `delivered`.

## Fix 2: getHumanSignals shard fan-out

**File:** `src/intelligence/context-builders/memory/dynamic-memory-context.ts`

**Problem:** `getHumanSignals` always issued `getPersistedHumanSignals` (10
shard doc reads) even when `human_memory/profile` was already non-empty —
redundant reads on every turn once the mirror is populated.

**Fix:**
- Compute `profileHasContent` once from `fromSubcollection`.
- Skip `getPersistedHumanSignals` entirely when `profileHasContent` is true
  (shards are already mirrored into `profile` on write by
  `persistHumanSignals`).
- Still fetch shards (`await getPersistedHumanSignals(userId)`) when the
  profile is empty/missing, so STM-only shard writes remain visible until the
  mirror runs.
- `mergeHumanSignalSources` merge-helper behavior is unchanged (all shard
  fields default to `[]` via `mergeArrays`'s defaults, matching existing
  round-trip test coverage for the empty-shards case).

## Verification

| Command | Result |
|---|---|
| `pnpm vitest run src/outreach/__tests__/delivery-adapter.test.ts` (cwd `apps/async`) | ✅ 3 passed |
| `pnpm vitest run src/memory/__tests__/human-signal-roundtrip.test.ts` | ✅ 2 passed |
| `node scripts/ops/assert-human-signal-roundtrip.mjs` | ✅ `{"ok":true}` |
| `node scripts/ops/assert-outreach-delivery-intent.mjs` | ✅ `{"ok":true}` |
| `pnpm typecheck` (root) | ✅ clean |
| `npx tsc --noEmit` (`apps/async`) | ✅ clean |
| Lints on touched files | ✅ none |

Commit: see `git log -1` on this branch after this report was appended.
