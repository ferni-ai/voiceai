# Firestore Implementation Audit

> Gaps, wiring issues, missing indexes, and what’s blocking "Better Than Human."

**Last updated:** February 2026

---

## 1. Index Gaps (Collection Group / Compound Queries)

### 1.1 Memory jobs – transcript/summary cleanup

**Location:** `src/tasks/scheduled/memory-jobs.ts`

| Query | Collection group | Fields | In firestore.indexes.json? |
|-------|------------------|--------|----------------------------|
| Old conversations | `conversations` | `startedAt` < cutoff | **Yes** – fieldOverride (startedAt ASC, COLLECTION_GROUP) |
| Old group sessions | `group_sessions` | `startedAt` < cutoff | **Yes** – fieldOverride (startedAt ASC, COLLECTION_GROUP) |
| Old conversation summaries | `conversation_summaries` | `createdAt` < cutoff | **Yes** – fieldOverride (createdAt ASC, COLLECTION_GROUP) |

**Status:** Done. Indexes added in `firestore.indexes.json` (fieldOverrides) and deployed. TranscriptCleanupJob also uses `runFirestoreQuery()` so on FAILED_PRECONDITION it logs and skips that batch instead of failing the job.

---

### 1.2 Realtime memory – unsummarized conversations

**Location:** `src/services/memory/realtime-memory.ts`

- Query: `collectionGroup('conversations').where('endedAt', '!=', null).where('summarized', '==', false)`.
- We have: `(summarized, endedAt)` COLLECTION_GROUP.
- **Status:** Covered. `!= null` with `summarized == false` can use that composite.

---

### 1.3 Calendar / workflows / outreach (already indexed)

- `workflows`: (status, trigger.type) – **present**.
- `callback_queue`: (status, scheduledFor) – **present**.
- `commitments`: (status, dueDate) and (status, createdAt) – **present**.
- `conversations`: (summarized, endedAt) – **present**.
- `outreach_feedback`: (templateId, createdAt) – **present**.
- `dynamic_entities/facts/relationships`: (syncedToSpanner, extractedAt) – **present**.

---

### 1.4 Collection group queries that may need indexes (not in indexes file)

| Location | Collection group | Query pattern | Likely need |
|----------|------------------|---------------|-------------|
| `calendar-trigger-worker.ts` | `calendar_providers` | connected == true | Single-field or composite |
| `calendar-trigger-worker.ts` | `workflows` | status == active, trigger.type == calendar | **Have** (workflows composite) |
| `proactive-family-checkin.ts` | CHECKIN_CALLS | id == callId | Single-field equality |
| `proactive-family-checkin.ts` | CHECKIN_SCHEDULES | isActive == true, nextScheduledCall <= now | Composite |
| `conversational-calls.ts` | `scheduled_calls` | id == callId, twilioSid == sid | Single-field / composite |
| `proactive-scheduler.ts` | `scheduled_outreach` | status == pending | Single-field |
| `superhuman-call-scheduler.ts` | `recurring_call_schedules` | enabled == true, nextCallDate <= now | Composite |
| `automation/insight-action-bridge.ts` | `action_executions` | createdAt >= cutoff | Single-field (range) |
| `cameo-analytics.ts` | `history` | personaId == X, orderBy timestamp desc | Composite (personaId, timestamp) |
| `calendar/webhooks/google-webhook.ts` | `google_watch_channels` | expiration < cutoff; id == channelId | Two indexes |
| `calendar/webhooks/outlook-webhook.ts` | `outlook_subscriptions` | expirationDateTime < cutoff; subscriptionId / id | Two indexes |
| `voice-profile-store.ts` | VOICE_PROFILE_SUBCOLLECTION | limit(limit) only | May not need index |
| `data-hygiene/ttl-cleanup.ts` | config.collection | config.ttlField < now | Depends on config; may need per-collection indexes |

**Recommendation:** When a job or feature fails with FAILED_PRECONDITION, add the index (composite in `firestore.indexes.json` or single-field in Console). Document each in this section.

---

## 2. Wiring Issues

### 2.1 Collection name consistency

- **User root collection:** `bogle_users` is used consistently across the codebase (agents, memory, services, tools, API).
- **No alternate roots found** (e.g. no mix of `users` and `bogle_users`). No wiring fix needed for collection name.

### 2.2 getFirestoreDb() null handling

- **Pattern:** Most call sites use `const db = getFirestoreDb(); if (!db) return ...;` (or equivalent) before using `db`. Grep shows many files with this check.
- **Risk:** Any new Firestore usage that skips the `if (!db)` check will throw when Firestore is unavailable (e.g. missing creds, emulator down).
- **Recommendation:** In code review, require a null check (or shared helper that returns null/empty) for every `getFirestoreDb()` use. Consider a small wrapper that returns a “no-op” db interface when Firestore is null to avoid repeated checks.

### 2.3 Scheduled-actions: two code paths

- **Persist:** `bogle_users/{userId}/scheduled_actions/{actionId}` (document set).
- **Load:** `collectionGroup('scheduled_actions').where('status', '==', 'pending')`.
- **Index:** Single-field for `scheduled_actions` + `status` (COLLECTION_GROUP) is in `fieldOverrides`. Deploy succeeded.
- **Wiring:** Paths are consistent; no change needed.

---

## 3. FAILED_PRECONDITION Handling

### 3.1 Where we handle it (graceful degradation)

| Location | Behavior |
|----------|----------|
| `scheduled-actions.ts` | Catches error, logs warning with index hint, returns 0 (in-memory only). |
| `ceo/unified-data/user-data.ts` | Index still building → return empty (journal, wins). |
| `ceo/unified-data/business-data.ts` | Index still building → return empty (incidents, tech debt). |
| `ceo/focus.ts` | Index still building → return null / empty. |
| `ceo/weekly-review.ts` | Index still building → log and continue. |
| `superhuman/commitment-keeper.ts` | FAILED_PRECONDITION + index → debug log, treat as temporary. |

### 3.2 Where we don’t (risk of throw or unhandled rejection)

- **Memory jobs** (`memory-jobs.ts`): TranscriptCleanupJob now uses `runFirestoreQuery()` (see Section 3.3); on FAILED_PRECONDITION the job skips that batch and continues.
- **Realtime memory** (`realtime-memory.ts`): Has try/catch; returns [] on error (no FAILED_PRECONDITION-specific message).
- **Other collection group call sites** (calendar-trigger-worker, proactive-scheduler, conversational-calls, family checkin, outreach, etc.): Many do not explicitly catch FAILED_PRECONDITION. Use `runFirestoreQuery()` from `src/utils/firestore-query.ts` when adding or refactoring these.

### 3.3 Central helper: runFirestoreQuery

**Location:** `src/utils/firestore-query.ts`

- `runFirestoreQuery(query, { context?: string })`: runs `query.get()`, catches FAILED_PRECONDITION (code 9 or message containing "index"), logs a single warning with optional context, and returns an empty snapshot so callers can degrade instead of throwing.
- Use for any collection group or compound query on a critical path where “index missing or building” should not fail the whole operation.

**Recommendation:** For every collection group or compound query used by a “better than human” or critical path:

1. Ensure the required index exists (see Section 1).
2. Optionally catch FAILED_PRECONDITION, log a clear “index missing or building” message, and return empty/default so the feature degrades instead of crashing.

---

## 4. What’s Preventing “Better Than Human”

### 4.1 Superhuman services that depend on Firestore

All superhuman (and many other) features assume Firestore is available and indexed. When it isn’t:

- **Commitment Keeper:** Commitments not loaded → no “I remember you said…”.
- **Predictive Coaching, Life Narrative, Values Alignment, etc.:** Context builders return empty → prompts lack the “better than human” memory and patterns.
- **Relationship Network, Dream Keeper, Milestones, Seasonal Awareness:** Same – empty context when db is null or queries fail.

So “what’s preventing better than human” in Firestore land is:

1. **Missing indexes** – Any collection group or compound query without an index can fail at runtime (FAILED_PRECONDITION). That directly blocks the feature that uses that query (e.g. transcript cleanup, or a specific superhuman loader).
2. **No index → no graceful path** – Where we don’t catch FAILED_PRECONDITION, one missing index can break a whole job or API instead of degrading that one query.
3. **Firestore unavailable** – When `getFirestoreDb()` returns null (e.g. env, creds, or project), every caller that checks `if (!db)` degrades (empty/off); any caller that doesn’t check can throw and break the process.

### 4.2 Prioritized fixes for “better than human”

1. **Add missing indexes** for:
   - ~~`conversations` (startedAt) for TranscriptCleanupJob~~ **Done** (fieldOverride deployed).
   - ~~`group_sessions` (startedAt)~~ **Done** (fieldOverride deployed).
   - ~~`conversation_summaries` (createdAt)~~ **Done** (fieldOverride deployed).
   - Any other collection group query that has actually failed in production or staging with FAILED_PRECONDITION.
2. **Harden critical jobs** – Done in `memory-jobs.ts`: TranscriptCleanupJob uses `runFirestoreQuery()`; on FAILED_PRECONDITION the job skips that batch. Other scheduled jobs can adopt the same helper.
3. **Central helper** – Done: `runFirestoreQuery(query, { context?: string })` in `src/utils/firestore-query.ts` catches FAILED_PRECONDITION, logs with context, and returns empty snapshot.

---

## 5. Summary Table

| Category | Status | Action |
|----------|--------|--------|
| Index: scheduled_actions (status) | Done | fieldOverride deployed. |
| Index: conversations (startedAt) for cleanup | Done | fieldOverride deployed. |
| Index: group_sessions (startedAt) | Done | fieldOverride deployed. |
| Index: conversation_summaries (createdAt) | Done | fieldOverride deployed. |
| Index: Other collection groups (calendar, family, outreach, etc.) | As-needed | Add when FAILED_PRECONDITION is seen. |
| getFirestoreDb() null checks | Mostly done | Enforce in review; consider shared wrapper. |
| FAILED_PRECONDITION handling in jobs | Done | memory-jobs uses runFirestoreQuery(); other jobs can adopt. |
| Central helper runFirestoreQuery | Done | src/utils/firestore-query.ts. |
| Collection name (bogle_users) | Consistent | No change. |

---

## 6. References

- Firestore index reference: [Firebase Firestore Index Definition](https://firebase.google.com/docs/reference/firestore/indexes)
- Single-field / fieldOverrides: `firestore.indexes.json` → `fieldOverrides`.
- Superhuman services and Firestore: `src/services/superhuman/CLAUDE.md`, `src/services/superhuman/README.md`.
- Scheduled jobs: `src/tasks/scheduled/CLAUDE.md`, `src/api/scheduled-jobs.routes.ts`.
