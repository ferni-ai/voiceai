# Cross-process account erasure for the persistence layer

Status: **decided, 2026-10-23: option C with the second sweep inline.** Not built yet. It waits on #2572, which rewrites `persistence/index.ts` (capped at 500 lines). The Firestore TTL policy on `erased_users.expiresAt` is Seth's call.

## The problem

Account erasure (`deleteAllData` → `eraseUserRecord`) runs in the API process. Voice sessions run in other processes (voice workers). Every `PersistenceStore` (37 in `src/`) keeps a per-process cache and writes it back on a timer, every 1 to 30 seconds, plus at session end and from held MINOR_CARE parts.

If a user deletes their account while a session is live on a worker, that worker's next sync can write their data back after the sweep. Then the account is "deleted", but documents survive.

#2632 closes this within one process for outreach only. It adds an in-process tombstone, and it waits out writes in flight before deleting. It says the gap between processes remains.

## What a fix must hold (from four security reviews)

1. **Across processes:** a worker holding a user's data from before the erasure never writes it after.
2. **Load during the sweep:** data a worker loads while the sweep runs is never written back.
3. **No wall clocks across hosts.** The API host and a worker can disagree by seconds. A `since < erasedAt` comparison fails open.
4. **No gap between check and write.** An erasure that lands after a store checks and before it writes must still stop the write.
5. **Tombstones can't be reversed.** A plain SHA-256 of a phone-derived uid can be brute-forced.
6. **Reused ids.** Data first held after the erasure (a later session, or a reused phone-derived id) writes as usual. That must hold across processes and after a restart.
7. **Linked phone profiles** that `eraseUserRecord` erases get the same treatment as the account uid.

## Building blocks every option shares

- **Tombstone doc:** `erased_users/{key}` = `{ state: 'erasing' | 'done', expiresAt }`.
  - `key` is an HMAC-SHA256 of the uid, with `IDENTIFIER_HASH_SECRET`. That's the existing secret in `platform/privacy-crypto.ts`; export its HMAC helper rather than add a secret. It throws in production when the secret is missing, as `getHashSecret` does there.
  - `expiresAt` is now + 30 days, longer than any session or worker cache lifetime.
  - **Seth's call:** a Firestore TTL policy on `erased_users.expiresAt`. Without it, the docs never expire.
- **The tombstone's version:** Firestore's `updateTime` on the tombstone, a server timestamp. No host clock is compared with another host's.
- **What a store records when it starts holding a user** (on load, or on its first `set`): the tombstone's `updateTime` it saw, or "none".
  - Before a write, the store reads the tombstone again. If it changed (it now exists, or its `updateTime` moved), the store drops the user's data and doesn't write it.
  - A later session loads afresh and records the current tombstone version. Its writes go through, which handles reused ids (6) with no clock.
- **`load` reads the tombstone too.** While it says `erasing`, `load` doesn't cache what it read, and it answers null. That covers (2).
- **`store.erase(uid)`:**
  - drops the user's cache and pending writes;
  - waits for a sync or save already in flight (`flushing` plus a per-user map of writes in flight);
  - then deletes through `delete`, which also waits out held writes.
- **`eraseFromStores(db, uids)`** runs `store.erase` on every store in this process, plus the erase hooks (`onErase`, for module maps like outreach's). `eraseUserRecord` calls it with `[uid, ...linkedUserIds]` (7).

## The one real decision: closing the gap between check and write (4)

### A. A transaction per user write

Read the tombstone and write the user's doc in one Firestore transaction. The write commits only if the tombstone is still what the store recorded.

- **Correctness:** complete. Firestore enforces it; there's no gap and no timing assumption.
- **Cost:**
  - Every user doc write becomes a transaction: one tombstone read plus the write, and two round trips (begin/read, then commit). Today one batch commit carries up to 450 docs.
  - Reads: one per user doc written. No cache can be shared, because the read must sit inside the transaction.
  - Latency: each sync goes from one round trip to one per dirty user, run in parallel.
  - Server SDK transactions take read locks, so erasure's tombstone write waits on every transaction in flight for that user. That's fine, since there's one user per tombstone.
- **Rough estimate, UNMEASURED:** about 2 user-doc writes per second per active user, across ~10 dirty stores with intervals of 2 to 10 s. At 100 concurrent users that's about 200 extra reads per second, ~17M per day, roughly $10 a day at $0.06 per 100k reads. The real write rate needs Cloud Monitoring `firestore.googleapis.com/document/write_count` for prod, which I didn't read.
- **Size:** about 150 lines in `index.ts`. The batch path and its per-doc fallback become one transaction helper. `index.ts` needs a second extraction to stay under 500.

### B. A precondition on the user's own doc

Write with `update(..., { lastUpdateTime })` when the doc existed at hold time, or `create()` when it didn't. The sweep's delete makes an `update` fail.

- **Gaps:**
  - Data for a doc that didn't exist at hold time is still written by `create()` after the sweep. That's exactly a live session's new data, so the tombstone check is still needed.
  - Another process's legitimate write changes `updateTime` and fails the precondition. That needs reload-and-merge (`load-before-save` from #2608).
  - One failing doc fails the whole batch, so the per-doc fallback runs more often.
- **Verdict:** doesn't meet (4) alone. Not recommended.

### C. Check before writing, then re-sweep after a bound (recommended)

- **Writers:** check the tombstone before every write, against the version recorded at hold. The read is cached for 2 s and shared by the process's stores.
- **Erasure:** writes the tombstone (`erasing`), sweeps, then waits a bound **W**. W covers a write that passed its check just before the tombstone landed and is still in flight: the check cache (2 s), plus a write's real latency (p99 to measure, likely under 1 s), plus margin. Then it sweeps again, verifies nothing is left, and marks the tombstone `done`.
  - The bound is a duration on one host, so no clocks are compared.
  - The longest sync interval (30 s) doesn't add to W. A sync that starts after the check cache expires re-reads the tombstone and drops the data.
- **Correctness:** complete as long as W exceeds the check cache plus write latency. A write slower than W (a hung client) is the residual risk, so the second sweep's verify step reports leftovers instead of passing silently.
- **Cost:**
  - Tombstone reads: at most one per user per 2 s per process. At 100 users that's about 50 reads per second, ~4.3M per day, roughly $2.60 a day.
  - Erasure takes W longer, about 10 s with W = 2 s + p99 write latency + margin.
  - The sync path keeps its batches.
- **Size:** about 250 lines.
  - `erased-users.ts` (HMAC key, cached check, tombstone writes): ~100.
  - `index.ts` hooks: ~40, plus moving the Firestore connection out to stay under 500.
  - `eraseUserRecord`: second sweep and `done`: ~20.
  - Outreach: replace its own waiting with `store.erase` and `onErase`: about -20.
  - Tests are excluded from that count.
- **Sub-decision inside C:** run the second sweep inline (the delete request takes W longer, about 10 s), or queue it (`bq-erasure.ts` already queues later erasure work). Default: inline. The request already does many round trips, and inline keeps "deleted" meaning deleted when the call returns.

**Recommendation: C.** It meets every requirement with no clocks, keeps the sync batched, and costs about a quarter of A's reads. Revisit A if the measured write rate is low enough that its cost doesn't matter.

## The prototype, and why it isn't shipping

Local branch `fix/store-erase-cross-process` @ 6ccd9a7f5, on top of #2572. It was never pushed and has no PR. It built most of the shared blocks:

- `store.erase` and its waits for writes in flight;
- `eraseFromStores` with linked uids;
- the 2 s shared check cache;
- the `index.ts` move.

It's 7 cross-process tests plus `eraseUserRecord` tests, and 9 of 11 mutations go red. The reviews found four flaws in it:

- it compared clocks (`erasedAt >= since`);
- it checked before the batch with no bound (the gap in 4);
- it keyed tombstones with plain SHA-256;
- a load during the sweep passed the check.

Two mutations survived: the save-one-user check, and the in-process hold reset, which was masked by a same-millisecond clock compare. Both point to the same flaws. The building blocks carry over to C.

## Tests for whichever option is built (each red first)

- **Clock skew:** two simulated processes whose `Date.now()` differs by ±60 s. The worker's pre-erasure data is still dropped, and a later session's data is still written.
- **An erasure landing between the check and the write:** a gated write with the tombstone written while it's held. For A, the commit fails. For C, the second sweep removes the late write and reports it.
- **A load during the sweep:** the worker loads while the tombstone says `erasing`, then flushes after `done`. The doc stays gone.
- **Reused id:** after `done`, a new process loads and writes. It lands.
- **Tombstone key:** it's not `sha256(uid)`. It changes with the secret, and it throws in production without the secret.
- **Linked phone profile:** tombstoned and erased from the stores like the uid.
- **Writes in flight** (sync, save one user, held part): `store.erase` waits them out.
