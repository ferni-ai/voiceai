# User Memory Control

> People decide what Ferni remembers. They can see it, correct it, take any of
> it back, export all of it, and erase their account completely.

One service, `src/services/memory-control/`, sits behind three ways in:

| Way in                                               | Code                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The "what Ferni remembers" web page                  | `src/api/memory-control-routes.ts` (`/api/memory/me...`)                                              |
| Voice: "forget that", "forget our last conversation" | `forgetMemory` tool → `services/memory-control/voice-forget.ts`                                       |
| Account erasure (GDPR)                               | `DELETE /api/gdpr/account`, `DELETE /api/account`, `DELETE /api/export/all` → `deleteUserAccountData` |

## Where memory lives

All under `bogle_users/{uid}` in Firestore, plus two derived stores.

| Data                                    | Location                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversations + transcript              | `conversations/{convId}` + `conversations/{convId}/turns` (role `user` / `assistant`, `text`, legacy `content`)                                                                  |
| Summaries                               | `summaries/{id}` (linked by `sessionId`), copies in the profile's `conversationSummaries`                                                                                        |
| Extracted facts                         | `dynamic_facts/{factId}` (provenance `sourceConversationIds`, legacy `sessionId`)                                                                                                |
| Things the user asked Ferni to remember | `extracted_facts/{id}` (`fact`), shown with the ID prefix `explicit_`                                                                                                            |
| People / entities / relationships       | `dynamic_entities` (type `person`), `dynamic_relationships`                                                                                                                      |
| Deletion tombstones                     | `memory_tombstones/{factId}` `{ createdAt, reason: 'user_deleted' \| 'voice_forget' }`                                                                                           |
| Embeddings                              | Top-level `vectors` collection (`FirestoreVectorStore`), keyed `conversation_<summaryId>`, `conversation_fact_<factDocId>`, `fact_<uid>_<ts>`; every entry has `metadata.userId` |
| Graph (L3, off by default)              | Spanner `facts` / `entities` / `relationships` / ... rows with `user_id`; IDs `fact_<uid>_<docId>`, `entity_<uid>_<docId>`                                                       |

## API

Every route uses the verified caller from `requestUserId(req)` (the Firebase
UID, or an anonymous `device:` identity). No route takes a user ID. Every
lookup is scoped to `bogle_users/{caller}`, so another person's IDs are `404`.
No identity: `401`.

| Method | Path                               | Body / query                            | Response                                                   |
| ------ | ---------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/memory/me`                   |                                         | `{ facts: Fact[], people: Person[], updatedAt }`           |
| PATCH  | `/api/memory/me/facts/:id`         | `{ text (1-500), category? }`           | `Fact` (`userEdited: true`)                                |
| DELETE | `/api/memory/me/facts/:id`         |                                         | `{ deleted: true }`                                        |
| DELETE | `/api/memory/me/people/:id`        |                                         | `{ deleted: true }`                                        |
| GET    | `/api/memory/me/conversations`     | `?cursor=&limit=` (default 20, max 100) | `{ conversations: ConversationSummary[], nextCursor? }`    |
| GET    | `/api/memory/me/conversations/:id` |                                         | `{ conversation, turns: { role, text, timestamp }[] }`     |
| DELETE | `/api/memory/me/conversations/:id` |                                         | `{ deleted: { turns, facts, embeddings } }`                |
| GET    | `/api/memory/me/export`            | `?format=json\|csv`                     | attachment                                                 |
| DELETE | `/api/memory/me`                   | `{ confirm: 'DELETE' }`                 | `{ deleted: true, collections, embeddings, graphRecords }` |

```ts
Fact = { id, text, category, confidence, sourceConversationIds, userEdited, updatedAt }
Person = { id, name, relationship?, notes?, updatedAt }
ConversationSummary = { id, startedAt, endedAt?, personaId?, summary?, turnCount }
```

Errors: `400` validation (bad body, malformed ID or cursor, unknown cursor),
`401`, `404`, `405`, `429`, `503` (storage unavailable), `500`. Body: `{ error }`.

Rate limits per user: reads 120/min, edits 60/min, deletes 30/min, export
10/hour, delete-all 3/hour.

Notes for the page:

- `people` is grouped by name (extraction can write one doc per mention).
  Its `id` is the newest doc; deleting it removes every doc for that name.
- Facts with IDs starting `explicit_` are things the user asked Ferni to
  remember. They always come back with `userEdited: true`.
- CSV export is one file with sections. Each section is a `# name` line, then
  a header row, then rows: `facts`, `people`, `conversations`, `turns`
  (`conversationId,index,role,timestamp,text`), `summaries` (the summary as JSON).
  JSON export has the same data: `{ exportedAt, userId, facts, people,
conversations: [{ conversation, turns, summaries }], summaries }`. Embedding
  vectors are left out of exports.

## Cascade rules

### Delete a fact

1. Write tombstones for the doc ID and the deterministic key ID
   (`factIdFor({ subject, predicate })` from `memory/dynamic/fact-identity.ts`),
   so extraction can't learn the fact again from old conversations.
2. Delete the doc.
3. Remove its embedding (`conversation_fact_<id>`).
4. Remove its graph rows (only when Spanner is enabled).

Explicit facts (`explicit_…`): delete the `extracted_facts` doc and its vector,
which is matched by user + `source: 'user_memory'` + identical text.

### Edit a fact

Sets `text`, optional `category`, `userEdited: true`, `editedAt`, `updatedAt`
and `syncedToSpanner: false`, so the L2→L3 sync pushes the corrected fact again.
The embedding is re-indexed with the new text if one exists, and stale graph
rows are removed. Extraction must not change `text` / `category` /
`confidence` of a `userEdited` fact. It may only add to `sourceConversationIds`.

### Delete a person

Removes every `dynamic_entities` person doc with that name, the
`dynamic_relationships` that name them (`source`/`target`), and the facts about
them (`entityName`). Those facts are tombstoned as above. Graph rows go too.

### Delete a conversation

The conversation is identified by its doc ID plus any `sessionId` /
`conversationId` on the doc (the voice session ID can differ from the doc ID).

1. Delete every turn.
2. Delete the threads tied to it (thread ID or `sessionId` / `conversationId`
   field) with their messages. Also delete messages in other threads that
   carry those IDs.
3. Delete its summaries (`summaries` and `conversation_summaries`, matched by
   doc ID, `sessionId` or `conversationId`) and their embeddings.
4. Delete `extraction_history` entries for it (they hold transcript snippets).
5. Provenance on `dynamic_facts`, `dynamic_entities` and `dynamic_relationships`
   (`sourceConversationIds` array, legacy `sessionId`):
   - Remove the conversation's IDs from the record.
   - If no source is left and the user never edited the fact: delete it,
     tombstone it and remove its embedding. Entities and relationships with no
     source left are deleted, without a tombstone.
   - User-edited facts and explicit facts are kept, even with empty provenance.
6. Drop its entries from the profile's embedded `conversationSummaries`. If the
   newest entry went, clear `lastConversationSummary`.
7. Delete the conversation doc.

The response counts turns deleted, facts deleted and embeddings removed.

### Delete all memories (`DELETE /api/memory/me`)

Every memory subcollection is deleted and counted: conversations + turns,
threads + messages, summaries, dynamic facts / entities / relationships,
promoted entities, extraction history, explicit facts, memories and
tombstones. After each counted pass, Firestore `recursiveDelete` clears any
orphaned subcollections. The profile keeps its basics (name, preferences,
subscription, settings), but the memory lists in it (`conversationSummaries`,
`keyMoments`, `familyMembers`, ...) are emptied and `memoryResetAt` is set. All
of the user's vectors and graph rows are removed.

### Account erasure (`deleteUserAccountData`)

Firestore does not cascade deletes. The old code deleted only the profile doc
and still said "all associated data have been deleted". Now:

1. `recursiveDelete` on `bogle_users/{uid}` and `users/{uid}` (every nested
   subcollection, including orphaned ones). Then a check that nothing remains.
2. Every vector with `metadata.userId == uid`, paged until none are left.
3. Spanner rows for the user (when enabled).
4. User-keyed Cloud Storage prefixes: `outreach-voice/{uid}/`,
   `voice-messages/{uid}/` (`GCS_BUCKET_NAME`, `VOICE_MESSAGE_BUCKET`) and
   `visual-memories/{uid}/` (`FIREBASE_STORAGE_BUCKET`).
5. A report: `{ complete, existed, firestore, embeddings, graphRecords, storage, errors }`.

The routes (`api/account-deletion-response.ts`) say everything was deleted
only when `complete` is true. Otherwise they return `500` with
`success: false` and the `incomplete` parts (no internal error text). User
IDs that are empty or contain `/` are refused. `FirestoreStore.deleteProfile`
stays top-level only, because profile merging relies on that, so never use it
for erasure.

## Voice forget

`forgetMemory({ query?, scope?, confirm?, undo? })`. The legacy names
`whatToForget` and `confirmDeletion` still work. The tool is the same in
native function calling and in the Gemini JSON executor.

1. **Find.** `findMemories(query)` does lexical matching over facts (including
   explicit ones), people (by name) and recent conversation summaries.
   "forget our last conversation" (or `scope: 'last_conversation'`) picks the
   newest finished conversation and never the call in progress.
2. **Confirm.** Without `confirm`, the tool replies "I found Sarah (sister).
   Want me to forget it?" and holds the matches for 2 minutes.
3. **Delete.** With `confirm: true`, the held matches (or a fresh search) are
   deleted through the service with `reason: 'voice_forget'`: people first,
   then conversations (full cascade), then facts.
4. **Undo.** For 30 seconds, `undo: true` puts everything back.

The design is the simplest safe one: delete at once, then undo by restoring
before-images. Each document the deletion touches, tombstones included, is
recorded in an in-memory `UndoJournal`, along with the vectors removed. Undo
writes those documents back and deletes the new tombstones. Nothing about the
deletion is pending in storage. If the process dies inside the window, the
deletion stands, which is the privacy-safe way to fail. Graph rows are not
restored by undo. The L2→L3 sync can push them again.

Replies are short and warm (see `VOICE_COPY`), for example "Done, it's
forgotten. Changed your mind? Say undo in the next 30 seconds."

## Retention policy

**Memories are kept until the user deletes them.**

- `TranscriptCleanupJob` (`tasks/scheduled/transcript-cleanup-job.ts`) is off
  by default. Each category runs only when its env var is set to a positive
  number of days: `TRANSCRIPT_RETENTION_DAYS` (1:1 conversations + turns),
  `SUMMARY_RETENTION_DAYS` (`summaries` + their embeddings),
  `GROUP_TRANSCRIPT_RETENTION_DAYS` (group sessions). Cutoffs are queried both
  as Timestamps and as ISO strings, because Firestore never compares across
  types. Only `bogle_users/{uid}/…` documents are touched. The Cloud Scheduler
  entry in `infra/cloud-scheduler-jobs.yaml` is marked paused.
- `MemoryDecayJob` never deletes or archives. It writes `recallWeight`
  (0.05–1) and `recallWeightUpdatedAt` on `dynamic_facts`,
  `dynamic_entities` and `promoted_entities`. Recall ranks by
  `confidence × (0.5 + 0.5 × recallWeight)` (see
  `intelligence/context-builders/memory/dynamic-memory-context.ts`), so a
  faded memory ranks lower but can still be recalled.

## Known limits

- Thread messages are linked to a conversation only by thread ID or a
  `sessionId` / `conversationId` field. Threads that carry neither (for
  example SMS outreach) are left alone.
- Extraction jobs still queued for a conversation that was just deleted can
  write new facts after the delete. Tombstones only block facts that existed
  before.
- Vector IDs are global. Removal checks `metadata.userId` so another user's
  entry with the same ID is never touched. Deterministic fact IDs that don't
  include the user ID could still collide in the vector store's
  `conversation_fact_<factId>` IDs. The indexer should include the user ID.
