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
| Sensitive-memory consent                | `memoryConsent` field on `bogle_users/{uid}` (see "Sensitive memory consent")                                                                                                    |
| Health memory / mood timeline           | `health_memory/{healthId}`, `mood_timeline/{conversationId}` (only with Health consent)                                                                                          |
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

`PATCH` ignores unknown fields, including the `userId` the web client adds.
The user is always the verified caller.

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

1. Write tombstones for the doc ID and the deterministic IDs from
   `memory/dynamic/fact-identity.ts`: `factIdFor({ subject, predicate })`, and
   `factIdForExtracted(...)` for key/value facts (the ID `fact-store` checks).
   Extraction then can't learn the fact again from old conversations.
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
them (`entityName`). Those facts are tombstoned as above, and the person is
tombstoned at `entityIdFor(name, 'person')`, which extraction checks before
re-adding an entity. Graph rows go too.

### Delete a conversation

The conversation is identified by its doc ID plus any `sessionId` /
`conversationId` on the doc (the voice session ID can differ from the doc ID).

1. Delete every turn.
2. Delete the threads tied to it (thread ID or `sessionId` / `conversationId`
   field) with their messages. Also delete messages in other threads that
   carry those IDs.
3. Delete its summaries (`summaries` and `conversation_summaries`, matched by
   doc ID, `sessionId` or `conversationId`) and their embeddings.
4. Delete `extraction_history` entries for it (they hold transcript snippets),
   and queued `extraction_jobs` whose `job.sessionId` / `job.conversationId`
   is this conversation, so a pending job can't re-learn deleted facts.
5. Provenance on `dynamic_facts`, `dynamic_entities` and `dynamic_relationships`
   (`sourceConversationIds`, migrated facts' `legacySessionIds`, legacy `sessionId`):
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
of the user's vectors and graph rows are removed. The same memory
subcollections are also wiped under any anonymous identity linked by identity
merge (`linked_identities`) that still redirects (`mergedInto`) to this account,
for example after an unfinished merge. The links themselves are kept.

### Account erasure (`deleteUserAccountData`)

Firestore does not cascade deletes. The old code deleted only the profile doc
and still said "all associated data have been deleted". Now:

0. Registered memory domains run their `deleteAll`. Then every anonymous
   identity in `linked_identities` whose `bogle_users/{anonId}` still redirects
   here (`mergedInto == uid`) is deleted recursively, with its vectors. Stale
   links that point elsewhere are never touched.
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

## Memory domains (registry)

Other memory areas plug into every memory-control operation by registering a
domain (`services/memory-control/domains.ts`):

```ts
registerMemoryDomain({
  name: 'goals',                                   // key in exports and reports
  exportFn: (uid) => ...,                          // JSON-safe data for the export
  deleteForConversation: (uid, convId) => count,   // conversation-delete cascade
  deleteAll: (uid) => count,                       // delete-all and account erasure
  deleteForFacts: (uid, factIds) => count,         // optional: facts deleted or corrected
  find: (uid, query) => [{ id, label, score }],    // optional: voice forget search
  forget: (uid, id) => true,                       // optional: delete one found item
});
```

| Operation                                 | What domains get                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DELETE /api/memory/me/conversations/:id` | `deleteForConversation` once per conversation ID (doc ID and session ID). The response gains `deleted.domains: { [name]: count \| 'failed' }`.                                       |
| `DELETE /api/memory/me`                   | `deleteAll`. The response gains `domains`.                                                                                                                                           |
| Account erasure                           | `deleteAll` runs first. A failing domain makes the report `complete: false`.                                                                                                         |
| Export                                    | `exportFn` output goes under `domains.<name>` in JSON, and into one CSV section per domain (one JSON item per row). The `/api/export` "Memories" category spreads it in.             |
| Fact delete / edit / person delete        | `deleteForFacts` with the affected fact IDs, so anything inferred from a wrong or deleted fact goes too.                                                                             |
| Voice forget                              | `find` matches are offered with the others; a confirmed match calls `forget`. Undo does not restore domain items. When only domain items were deleted, the reply doesn't offer undo. |

Hooks are isolated. A domain that throws (or returns a failed Result) is
reported as `'failed'`, and the other domains still run.

Built in: **importantDates** (`services/important-dates`):
`exportImportantDates`, `deleteImportantDatesFor`, `deleteAllImportantDates`,
`findImportantDates` + `deleteImportantDate(…, 'voice_forget')`. The dates
routes (`/api/memory/me/dates…`, `/api/memory/me/reminder-settings`) are served
by their own handler. The memory-control router never claims them.

Also built in:

- **personalInsights** (`services/personal-insights`): exports people/pet
  profiles and life threads; conversation delete and delete-all remove derived
  profiles, threads and predictions; `deleteForFacts` recomputes once.
- **preferences** (`services/user-preferences`): export, conversation and fact
  provenance removal, delete-all, and voice forget ("forget that I hate cilantro").
- **aspirations** (`services/aspirations`): dreams, goals and habits — export,
  conversation cascade (provenance and check-ins), delete-all, and voice forget
  ("forget my goal to run a marathon").
- **health** (`services/health-memory`): health items + mood timeline + the
  consent record in the export; conversation delete removes both (by doc ID or
  session ID); fact deletes remove items inferred from them; delete-all; voice
  forget ("forget that I have asthma").
- **work** and **places** (`services/work-and-places`): export (one section
  each), conversation and fact provenance removal, delete-all, voice forget
  ("forget my Lisbon trip", "forget that I work at Acme"). See
  [Work & places](#work--places).
- **lifeStory** and **beliefs** (`services/life-story`): life story, values
  and (with consent) beliefs: export, conversation and fact provenance
  removal, delete-all, voice forget. See
  [Life story, values & beliefs](#life-story-values--beliefs).

`GET /api/memory/me` people keep their `dynamic_entities` IDs (what delete
uses) and gain `kind` (`person`/`pet`), `memorial`, and profile notes from
personal insights, matched by name.

These domains also learn from every summarized conversation:
`services/memory/conversation-summarized-hooks.ts` runs after the session-end
summary and after the catch-up job summarizes a dropped call.

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

"Show me what you remember" opens the page through the `openPanel` voice tool
(`ui-navigation`, view `memories`).

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

## Dates & reminders

Ferni keeps important dates (birthdays, anniversaries, events, deadlines) in
one canonical store and reminds the user before them.

### Storage

| Path                                                                   | What                                                                                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bogle_users/{uid}/important_dates/{id}`                               | One date. `id = date_` + hash of the normalised `key` (`birthday:sam`, `anniversary:self`, `deadline:tax return`), so re-learning a date updates it. |
| `bogle_users/{uid}/reminder_settings/default`                          | Channels, quiet hours, time zone, send time.                                                                                                         |
| `bogle_users/{uid}/important_date_deliveries/{dateId}_{year}_{offset}` | One per reminder: claim + outcome (`surfaced`, `delivered`, `failed`, `no_channel`), channel, attempts.                                              |
| `bogle_users/{uid}/memory_tombstones/{dateId}`                         | Written when a date is deleted, so detection can't add it back.                                                                                      |

Date fields: `title`, `date` (`YYYY-MM-DD`, or `--MM-DD` for a yearly date with
no known year), `recurring`, `kind` (`birthday` / `anniversary` / `event` /
`deadline` / `other`), `source` (`user` / `detected`), `sourceConversationIds`,
`confidence`, `reminders { enabled, offsets, custom }`, optional `channels`,
`nextReminderAt`.

Rules:

- **The user's word wins.** A detected update never changes a `source: 'user'`
  date's fields; it only adds conversation ids. Any edit from the page or by
  voice makes the date the user's.
- **Deleted stays deleted.** Deleting writes a tombstone; detection skips
  tombstoned ids. The user adding the same date again clears the tombstone.
- **Conversation deletes cascade.** `deleteImportantDatesFor(uid, convId)`
  removes that conversation from every date; a detected date left with no
  conversation is deleted and tombstoned. User dates stay.
- **Yearly dates** repeat on the same month/day; Feb 29 falls on Feb 28 in
  non-leap years. "Today" is the user's local day in their time zone.

Older date stores (`special_dates`, `milestone_detector/profile.trackedDates`,
`human_signals/important_dates`) are copied in once per user on first read and
are no longer written by the voice tools.

### Service API (`src/services/important-dates/`)

```ts
upsertImportantDate(userId, { key, title, date, recurring, personId?, kind, source,
                              sourceConversationIds, confidence }) // → Result<UpsertOutcome>
listImportantDates(userId)
getUpcomingDates(userId, withinDays)
deleteImportantDate(userId, id)
deleteImportantDatesFor(userId, conversationId) // cascade hook for conversation delete
deleteAllImportantDates(userId)                 // part of "delete all my memory"
exportImportantDates(userId)                    // for the memory export
getRemindersForSession(userId)                  // session-start context
importantDateKey({ kind, person?, title? })     // conventional keys for detection
```

### HTTP API

All routes use the verified caller (`requestUserId(req)`); a date id that isn't
the caller's is 404. No identity is 401.

| Method | Path                               | Body                                                                                                                                 | Response                 |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| GET    | `/api/memory/me/dates`             | –                                                                                                                                    | `{ dates: DateView[] }`  |
| POST   | `/api/memory/me/dates`             | `{ title, date, kind?, recurring?, person?, reminderOffsets?, remindersEnabled?, channels? }`                                        | `201 { date: DateView }` |
| PATCH  | `/api/memory/me/dates/:id`         | any of `{ title, date, kind, recurring, reminderOffsets, remindersEnabled, channels }` (`channels: null` clears a per-date override) | `{ date: DateView }`     |
| DELETE | `/api/memory/me/dates/:id`         | –                                                                                                                                    | `{ deleted: true }`      |
| GET    | `/api/memory/me/reminder-settings` | –                                                                                                                                    | `{ settings, timeZone }` |
| PUT    | `/api/memory/me/reminder-settings` | any of `{ channels: { conversation?, push?, sms?, email? }, quietHours: { start?, end? }, timeZone, sendTime }`                      | `{ settings, timeZone }` |

`DateView = { id, title, date, recurring, kind, source, personId?, remindersEnabled,
reminderOffsets, channels | null, nextOccurrence, daysUntil, nextReminderAt, updatedAt }`.

Validation: `date` is `YYYY-MM-DD` or `--MM-DD` (a one-off date needs a year);
`reminderOffsets` are up to 10 whole days from 0 to 365; times are `HH:MM`;
`timeZone` is an IANA name. `kind` defaults to `other`; `recurring` defaults to
true for birthdays and anniversaries. Changing settings re-plans every date.

### Reminders

Default lead times: birthdays and anniversaries 7 days, 1 day and on the day;
deadlines and events 1 day; other dates on the day (memorial days: on the day,
gently). Users can change them per date ("remind me a week before").

A reminder fires once per date, lead time and year. A date added late fires its
closest reminder once instead of a burst.

Channels, in order of preference, each only if the user allows it:

1. **In conversation** (on by default) — near dates and reminders due today go
   into the session-start context so the persona brings them up in their own
   voice. Surfacing a reminder there marks it handled, so it isn't also pushed.
2. **Push** (on by default; only reaches devices where notification permission
   was granted).
3. **Text** and **email** — off until the user turns them on; need a valid
   number/address; at most 3 per day.
4. **In-app message** as a last fallback when conversation reminders are on.

Nothing is sent when the user switched proactive outreach off, during quiet
hours (default 21:00–08:00 local), during do-not-contact times from user
preferences, or for topics the user asked not to be raised.

The job `POST /api/jobs/deliver-date-reminders` (Cloud Scheduler, every 15
minutes, OIDC-authenticated like other `/api/jobs/*` routes; `?dryRun=true`
reports without sending) reads dates whose `nextReminderAt` has passed
(collection-group index in `firestore.indexes.json`), claims each reminder in a
transaction, delivers with fallback and records the outcome.

### Voice

| Say                                                                  | Tool                                                |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| "Remember my anniversary is June 12"                                 | `rememberSpecialDate`                               |
| "Remind me about Sam's birthday a week before"                       | `rememberSpecialDate` (no date: updates lead times) |
| "What's coming up?"                                                  | `listSpecialDates`                                  |
| "Stop reminding me about the tax deadline" / "Forget Sam's birthday" | `stopDateReminders` (`forget: true` deletes)        |

## Aspirations, goals and habits

Ferni remembers the whole spectrum from a someday dream to a daily habit in
one model: **dream → goal → habit**, linked upward (a habit can serve a goal,
a goal can serve a dream). Items are kept until the user deletes them.

### Storage

| Path                                                  | What                                                                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bogle_users/{uid}/aspirations/{id}`                  | One dream, goal or habit. `id = asp_` + hash of `level` + normalised title ("someday I want to live by the sea" and "live by the sea" are the same dream). |
| `bogle_users/{uid}/aspirations_meta/legacy_migration` | Marker: older stores were copied in (never re-run).                                                                                                        |
| `bogle_users/{uid}/memory_tombstones/{id}`            | Written on delete (`kind: 'aspiration'`), so inferred capture can't add it back.                                                                           |

Fields: `level` (`dream` / `goal` / `habit`), `title`, `why`, `status`
(`active` / `paused` / `achieved` / `let-go` / `dormant`), `parentId`,
`category`, `milestones[] { id, title, done, doneAt?, targetDate? }`,
`targetDate` (`YYYY-MM-DD`), `progress` (0–100), `notes[]`, `source`
(`explicit` / `inferred`), `confidence`, `evidenceCount`,
`sourceConversationIds`, `userEdited`, `editedAt`, `legacyIds`,
`deadlineDateId`, `createdAt`, `updatedAt`, `lastMentionedAt`,
`statusChangedAt`, `lastResurfacedAt`. Habits add `habit { schedule {
frequency: daily | weekdays | weekends | weekly | custom, days?, timesPerDay,
reminderTime? }, glidepathLevel (1–5), loop { cue, routine, reward },
stackAnchor, streak, longestStreak, checkIns[] { date, status: done | missed,
note?, recordedAt, conversationId? }, nextNudgeAt }`.

Rules:

- **The user's word wins.** Items created or edited on the page are
  `userEdited`; capture then only adds conversation ids.
- **Inferred needs evidence.** Items read from conversation summaries are
  `inferred` and only treated as commitments (session context, deadlines,
  voice lists) once heard in two conversations at confidence ≥ 0.7, or once at
  ≥ 0.9. First-person statements ("my goal is…") are `explicit`.
- **Deleted stays deleted.** Deleting tombstones the id; children lose their
  link but are kept. Saying it again explicitly (or re-adding it on the page)
  clears the tombstone.
- **Conversation deletes cascade.** `deleteAspirationsFor(uid, convId)` drops
  the conversation from provenance and removes check-ins recorded in it; an
  item left with no provenance that the user never edited is deleted and
  tombstoned.
- **Check-ins are per local day** in the user's time zone (the reminder
  settings / profile zone). One per day; a later one replaces it. Streaks
  count consecutive scheduled days with `done` (today not done yet doesn't
  break a streak; a scheduled day that's missed or has no check-in does);
  weekly habits count consecutive weeks (Mon–Sun) with a `done`.

Older stores copied in once per user on first read, then left read-only:
`dreams/*` (Dream Keeper), `goals/*` (JSON-route addGoal), `commitments/*`
of type `goal`, `habits/*` + `habits/{id}/logs` + `habit_completions`
(JSON-route habits), profile `productivityData.habits / habitLogs /
enhancedHabits`, profile `lifeData.goals` (life-planning goals) and profile
`goals` (financial goals, category `financial`). The CLI `ferni goals`
(`users/{uid}/goals`, the operator's own CEO goals) is a separate product and
is not migrated.

All existing tools read and write this store: dream-tracking (`recordDream`,
`checkDreams`, `findDormantDreams` via the Dream Keeper view), dreams
(`captureDream`, `bucketList`, `honorUnfulfilled` → let-go), habits
(`createHabit`, `logHabitCompletion`, `getHabits`, habit coaching — through the
ProductivityStore bridge), goals (`addGoal`, `getGoals`, `updateGoal`,
`manageGoal`), and goal-type commitments.

### Service API (`src/services/aspirations/`)

```ts
upsertAspiration(userId, { level, title, why?, status?, parentId?, targetDate?, progress?,
                           milestones?, habit?, source, confidence, sourceConversationIds? })
listAspirations(userId, { level? })
createUserAspiration(userId, input) / editAspiration(userId, id, patch) / deleteAspiration(userId, id)
recordCheckIn(userId, id, { status: 'done' | 'missed', date?, note? })
captureFromUtterance(userId, text, { conversationId?, personaId? })   // live, per user turn
onConversationSummarized(userId, conversationId, summary, turns)      // run by conversation-summarized-hooks
getAspirationsForSession(userId)                                       // session-start block
getHabitPatterns(userId)                                               // for insights
exportAspirations(userId)                                              // memory export
deleteAspirationsFor(userId, conversationId)                           // conversation delete cascade
deleteAllAspirations(userId)                                           // "delete all my memory"
```

### HTTP API

Verified caller only (`requestUserId(req)`); another user's id is 404, no
identity is 401.

| Method | Path                                       | Body                                                                                                                                                                                      | Response                                      |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| GET    | `/api/memory/me/aspirations`               | –                                                                                                                                                                                         | `{ aspirations: AspirationView[], timeZone }` |
| POST   | `/api/memory/me/aspirations`               | `{ level, title, why?, parentId?, targetDate?, category?, milestones?: [{ title }], schedule?: { frequency, days?, timesPerDay?, reminderTime? }, glidepathLevel?, loop?, stackAnchor? }` | `201 { aspiration }`                          |
| PATCH  | `/api/memory/me/aspirations/:id`           | any of the above plus `status`, `progress`, `milestones: [{ id?, title, done? }]` (`null` clears optional fields)                                                                         | `{ aspiration }`                              |
| DELETE | `/api/memory/me/aspirations/:id`           | –                                                                                                                                                                                         | `{ deleted: true }`                           |
| POST   | `/api/memory/me/aspirations/:id/check-ins` | `{ status: 'done' \| 'missed', date?: 'YYYY-MM-DD', note? }`                                                                                                                              | `{ aspiration }`                              |

`AspirationView` mirrors the stored fields plus `confirmed` (inferred items
not yet treated as commitments show `false`) and, for habits, `dueToday` and
the last 14 check-ins. A parent must sit higher on the spectrum (habit → goal
→ dream). Check-ins can't be for a future day or more than 60 days back.

### In conversation and reminders

- Session start adds a compact **Goals & habits** block (≤ 700 chars):
  habits due today (streaks at risk first), active goals with progress and
  target dates, and — at most every 14 days, and not the same dream within 30
  — one dream that's gone quiet, to ask gently whether it still matters.
  Items whose topic the user asked not to be raised proactively are left out.
- A confirmed active goal with a target date becomes a `deadline` important
  date (reminded like any date; renamed, achieved, let-go or deleted goals
  remove it).
- Habits with a `reminderTime` get `nextNudgeAt` from the habit-reminder rule
  (`src/services/important-dates/habit-reminder-rule.ts`: next local day the
  habit is still due, at the reminder time, moved out of quiet hours). Due
  habits are surfaced in conversation; push delivery of habit nudges is not
  wired to the reminder job yet.

### Voice

| Say                                               | What happens                                          |
| ------------------------------------------------- | ----------------------------------------------------- |
| "Someday I want to live by the sea"               | dream captured (explicit)                             |
| "My goal is to run a half marathon by June"       | goal captured / `addGoal` (deadline scheduled)        |
| "I'm trying to meditate every morning"            | daily habit captured / `createHabit`                  |
| "I did my run today" / "I skipped my run"         | check-in on the matching habit / `logHabitCompletion` |
| "I'm letting go of that dream"                    | status `let-go` (only when it's clear which one)      |
| "What are my goals?" / "How are my habits going?" | `getGoals` / `getHabits`                              |

## Preferences

"Let Ferni remember my preferences too" — and actually behave accordingly.

### Model

One Firestore document per preference at `bogle_users/{uid}/preferences/{prefId}`.
`prefId = pref_<sha256(domain|key)[:24]>`, so re-learning the same thing updates
one document instead of adding another. (The old `preferences/settings` document
written by the previous `setPreference` tool is folded in once, on first read.)

| Field                                    | Meaning                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain`, `key`, `value`                 | What it is. Single settings use a fixed key (`responseLength`); list items carry the item in the key (`avoidTopic:my dad`, `dish:sushi`).  |
| `sentiment`                              | `like` / `dislike` for likes, media and food tastes.                                                                                       |
| `details`                                | Structured extras for `interests`, `media` and `food` (below).                                                                             |
| `source`                                 | `explicit` (the user said it outright) or `inferred` (learned from behaviour, facts, summaries, listening history).                        |
| `confidence`                             | 0–1; repeated evidence combines (`1-(1-a)(1-b)`).                                                                                          |
| `userEdited`                             | `true` for deliberate settings: Preferences page, account settings, meal-planning dietary settings, and the voice command ("call me Sam"). |
| `sourceConversationIds`, `sourceFactIds` | Provenance (conversations and B's `dynamic_facts`).                                                                                        |
| `createdAt`, `updatedAt`, `editedAt`     | ISO strings.                                                                                                                               |

Domains:

| Domain         | Keys                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | ------------- | ---------- | ------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- | ------- | -------- | ------------------------------------- |
| `conversation` | `responseLength` (short/medium/long), `tone`, `directness` (gentle/balanced/direct), `pace`, `humor` (none/light/lots), `followUpQuestions` (fewer/normal/more), `preferredName`, `pronouns`, `language` |
| `boundaries`   | `avoidTopic:<topic>`, `sensitivity:<topic>`, `doNotContact` (e.g. `21:00-08:00`, user's local time)                                                                                                      |
| `coaching`     | `accountabilityStyle` (gentle/balanced/firm), `motivationStyle`, `fourTendency`                                                                                                                          |
| `interests`    | `interest:<name>` with details `{ kind, level (curious→serious), relatedPeople, specifics, lastMentionedAt }`                                                                                            |
| `media`        | `artist                                                                                                                                                                                                  | genre                                                                                             | song:<name>`(music) and`show | movie         | book       | podcast | game                                                                      | team:<name>`with details`{ status, progress, opinion, contexts (moods/activities), memories, relatedPeople, origin }` |
| `food`         | needs: `allergy                                                                                                                                                                                          | intolerance:<item>`(details.severity),`diet:<pattern>`, `medical:<restriction>`; tastes: `cuisine | dish                         | comfort       | ingredient | drink   | restaurant:<name>`, `spiceTolerance`; cooking: `cookingSkill`, `signature | recipe                                                                                                                | equipment | routine | cooksFor | goal:<name>` (recipe details.outcome) |
| `likes`        | `activity                                                                                                                                                                                                | brand                                                                                             | place                        | other:<name>` |
| `practical`    | `units`, `temperatureUnit`, `distanceUnit`, `timeFormat`, `timezone`, `voiceSpeed`, `custom:<key>`. Reminder settings belong to Important Dates (not duplicated here).                                   |

### Precedence, evidence and tombstones

- **User edits > explicit > inferred.** A lower-ranked writer never changes the
  value, source or confidence of a higher-ranked one. When it agrees, it may only
  add provenance (and, for interests/media, bump `lastMentionedAt`).
- **Evidence threshold.** An inferred preference changes behaviour only when
  `confidence ≥ 0.85` or it was seen in **2+ conversations**. Explicit and
  user-edited preferences apply at once. Boundaries apply from `confidence ≥ 0.6`
  (caution). **Allergies and intolerances are honoured at any confidence.**
- **Tombstones.** Deleting a preference (page, API, "forget that I like jazz")
  writes `bogle_users/{uid}/memory_tombstones/{prefId}` with
  `{ createdAt, reason, kind: 'preference', domain, key }`. Automated capture
  skips tombstoned ids; a deliberate user setting clears the tombstone.
- **Music.** Explicit statements beat listening history; listening history
  (Spotify library sync, `origin: 'listening_history'`) beats nothing.

### Capture

- **Voice (explicit):** `setPreference` / `getPreferences` (existing tool names,
  now backed by this store; Gemini JSON path wired in all four files).
  `setPreference { type, value, action?: set|forget, detail?, status?, category?, statement? }`.
- **Live turns:** `transcript-handler.ts` calls `recordUserTurnPreferences`
  (explicit statements + the existing music and lifestyle extractors).
- **Session end:** `onConversationSummarized(userId, conversationId, summary, turns)`
  — user turns (explicit), summary (inferred, 0.6) and that conversation's
  preference-category facts from `dynamic_facts` (read-only).
- **Listening history:** `importListeningHistory(userId, { artists, genres })`,
  called after a Spotify library sync.
- **Other tools:** meal-planning `trackDietaryPreferences` → `recordDietarySettings`;
  `PUT /api/account/profile` → `syncAccountPreferences` (verbosity, topicsToAvoid).

### How Ferni uses it

- **Session start** (`agent-setup.ts`): a persona-agnostic
  "How They Like to Be Talked To" block (name, boundaries, food needs, style,
  coaching, interests, current shows, music, food, likes) within a 700-char budget,
  loaded in parallel with the prompts and bounded at 400 ms.
- **Proactive gates (hard constraints):** `isTopicAllowedProactively(userId, topic)`
  (fails closed), `getProactiveBoundaries(userId)`, `isContactAllowedAt(userId, date, tz?)`.
  Wired into proactive memory surfacing.
- **Food safety:** `getDietaryConstraints(userId)` filters meal-store recipe
  suggestions, is added to restaurant reservation requests, and adds an allergy
  reminder to restaurant search results. Medically advised restrictions are
  only used when the health category is enabled (`setHealthConsentCheck`).
- **DJ:** open-ended requests ("play something", "music for working") resolve via
  `resolveMusicQueryForUser` (mood associations > stated favourites > listening
  history; never a dislike).
- **Openers:** `getInterests(userId)`, `getMediaProfile(userId).inProgress`,
  `getFoodProfile(userId).followUps` — always gated by `isTopicAllowedProactively`.
- **Existing readers:** account view and the stored user profile's
  `preferences.verbosity` / `topicsToAvoid` mirror the profile.

### API

All routes use `requestUserId(req)` (verified uid or anonymous device id); ids are
looked up inside the caller's own subcollection, so another user's id is a 404.

| Method | Path                                            | Body                                           | Response                                                  |
| ------ | ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/memory/me/preferences[?domain=interests]` | –                                              | `{ preferences: (Preference & { active })[], updatedAt }` |
| POST   | `/api/memory/me/preferences`                    | `{ domain, key, value, sentiment?, details? }` | `201 { preference }` (user-edited)                        |
| PATCH  | `/api/memory/me/preferences/:id`                | `{ value?, sentiment?, details? }`             | `{ preference }`                                          |
| DELETE | `/api/memory/me/preferences/:id`                | –                                              | `{ deleted: true }` (tombstoned)                          |

Interests, media and food use the same routes (`domain=interests|media|food`).
Errors: 400 invalid body/details, 401 no identity, 404 not found / not yours, 405 method.

### Export and cascade hooks

- `exportPreferences(userId)` → `{ preferences, exportedAt }` (include in the export).
- `deletePreferencesFor(userId, conversationId)` — removes the conversation from
  provenance; a non-user-edited preference left with no evidence is deleted and
  tombstoned (`conversation_deleted`). Listening-history entries carry no
  conversation provenance and are unaffected.
- `deletePreferencesDerivedFromFact(userId, factId)` — same rule for fact provenance.
- `deleteAllPreferences(userId)` — wipes the profile (account-level delete-all).

## Sensitive memory consent

Health, money and beliefs are only remembered after the user says yes. GDPR
treats health and religious or philosophical beliefs as special categories
(Art. 9) that need explicit consent; money is treated the same way because it
is just as personal.

### Model

One record on the user document, `bogle_users/{uid}.memoryConsent`:

```ts
{
  version: 1,                    // CONSENT_VERSION; bump if the wording needs a fresh answer
  answeredAt: string | null,     // the upfront question was answered (yes, no, or a switch)
  categories: {
    health:   { enabled, updatedAt, source: 'page' | 'voice' | 'onboarding' | null },
    finances: { ... },
    beliefs:  { ... },
  },
  updatedAt: string | null,
}
```

- **Default off.** No record, an unanswered record, or a malformed one reads as
  all off.
- **Fails closed.** If consent can't be read, `isCategoryEnabled` returns false.
- **One upfront question**, in plain language: "Some things are more personal:
  your health, your money, and what you believe. I only remember those if you
  say yes, and you can switch each one off anytime." Yes turns all three on; no
  records the answer with all three off. Then each category has its own switch.
- **Off means off at once.** Switching off is written immediately and capture
  checks consent on every write (5 s read cache; the process that made the
  change updates its cache and drops in-memory buffers at once).
- **Deleting is offered, never forced.** Switching off reports how much is
  stored for that category ("I still have 5 things from before. Want me to
  delete those too?"); deletion runs only when the user confirms.
- **Safety exception: allergies and food intolerances.** They are kept and
  honoured whatever the Health switch says, so Ferni never suggests something
  unsafe. The memory page shows this note and lists what is kept. Medically
  advised food restrictions (`medical:*` preferences) are health data and follow
  the switch.
- **Explicit requests still work.** Asking Ferni to log a symptom with Health
  off answers "not saved: health memory is off" instead of pretending.

### Service API (`src/services/memory-consent/`)

```ts
isCategoryEnabled(userId, 'health' | 'finances' | 'beliefs')   // gate every write; never throws
getConsent(userId, { fresh? })                                  // Result<MemoryConsent, ConsentError>
setCategoryConsent(userId, category, enabled, source)           // Result<MemoryConsent, ConsentError>
answerUpfrontConsent(userId, agree, source)                     // the one upfront question
updateConsent(userId, { categories, source, answered? })        // several switches at once
onConsentChange((userId, category, enabled) => void)            // drop buffers when switched off
registerCategoryStore({ category, name, count, deleteAll })     // what "delete them too" removes
summarizeCategoryData(userId, category) / deleteCategoryData(userId, category)
sensitiveCategoriesOf(text) / categoryForFactType(factType)     // classify free text before storing
handleConsentVoice(userId, { category, enabled?, deleteExisting? })
```

Built-in category stores (`builtin-category-stores.ts`): for every category,
extracted facts labelled with it or matching the classifier (deleted through
memory control, so tombstones and cascades apply); for health, also health
memory, the mood timeline and medical food restrictions. Money and beliefs add
their own stores to that file.

### Where it is enforced

| Path                                                      | Gate                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Deep extraction (`memory/dynamic/sensitive-fact-gate.ts`) | Drops facts typed `health` / `finance` / `belief` or whose text matches a switched-off category, and sensitive concept entities. |
| Health memory, mood timeline                              | Every write checks Health.                                                                                                       |
| Preference profile (`user-preferences/food.ts`)           | `isHealthCategoryEnabled` asks the consent service; allergies exempt.                                                            |
| Session-start prompt                                      | Health block only with Health on; otherwise, while unanswered, one line letting the persona ask once.                            |

### Voice

`setMemoryConsent { category: health | finances | beliefs | all, enabled?, deleteExisting? }`
("stop remembering my health stuff", "yes, you can remember that", "delete
those too"). Wired for native function calling (memory domain) and the Gemini
JSON path (prompt table, sanitizer pattern, `memory-consent-executor`,
`REGISTERED_TOOLS`).

### HTTP API

| Method | Path                                    | Body                                                                      | Response                                                               |
| ------ | --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/memory/me/consent`                | –                                                                         | `{ consent, stored: { health, finances, beliefs }, safetyExceptions }` |
| PUT    | `/api/memory/me/consent`                | `{ agreeAll? }` and/or `{ categories: { health?, finances?, beliefs? } }` | same as GET                                                            |
| DELETE | `/api/memory/me/consent/:category/data` | –                                                                         | `{ deleted, byStore }`                                                 |

## Health & mood

Only with Health consent. `services/health-memory/`.

### Health items

`bogle_users/{uid}/health_memory/{healthId}`; `healthId = health_` + hash of
kind + subject (+ day for moments), so hearing the same thing again updates it.

| Field                                                                       | Meaning                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`                                                                      | `condition`, `medication`, `injury`, `appointment` (ongoing: one per subject); `symptom`, `sleep`, `exercise`, `energy` (moments: one per subject per day) |
| `subject`, `text`                                                           | "asthma" / "Has asthma"; "metformin" / "Takes metformin 500mg"                                                                                             |
| `status`, `when`, `day`                                                     | `current` / `past` / `upcoming`; appointment time as said; the day a moment is about                                                                       |
| `confidence`, `source`                                                      | `explicit` (the user's words), `inferred` (health-labelled facts), `tool` (logSymptom / logExercise), `user`                                               |
| `sourceConversationIds`, `sourceFactIds`                                    | Provenance                                                                                                                                                 |
| `mentions`, `firstMentionedAt`, `lastMentionedAt`, `userEdited`, `editedAt` |                                                                                                                                                            |

Learning: `onConversationSummarized` (in `conversation-summarized-hooks.ts`)
reads the user's turns with a high-precision first-person detector
(`detect.ts`: "I was diagnosed with…", "I take X 500mg", "I slept four hours";
not "my mom has diabetes" or "I don't have asthma") and that conversation's
`dynamic_facts` labelled `health` about the user. Extraction can now label facts
`health` / `finance` / `belief` (`fact-store.ts` maps them to those categories).
The user's edits win; deletes tombstone (`memory_tombstones/{healthId}`,
`kind: 'health'`). Apple Health / Oura / Eight Sleep data stays in the device
integrations the user connected separately; it is not copied here.

### Mood timeline

Emotion detection already drives live attunement (`emotion-event-dispatcher`).
Each reading is also handed to `recordMoodSample`, which buffers it in memory.
Mood counts as health data: the buffer is written to
`bogle_users/{uid}/mood_timeline/{conversationId}` (at most once a minute and
when the conversation is summarized) only while Health is on, and is dropped as
soon as Health goes off. Live attunement never depends on consent.

A timeline holds up to 60 samples (`at`, `mood`, `valence` −1…1, `intensity`),
`dominantMood`, `averageValence`, `arc` (`lifting` / `steady` / `heavier` /
`mixed`) and the conversation's IDs. `buildMoodInsight` compares the last week
with the three before and returns a gentle line ("They've seemed lighter this
week") or nothing when there isn't enough to say. No clinical words, no
diagnoses. Deleting a timeline tombstones it (`mood_{conversationId}`).

### Prompt block

`loadHealthMoodBlock(userId)` (agent-setup, parallel with the preference block,
400 ms bound, 600-char budget): upcoming appointments, up to 4 ongoing things,
up to 3 notes from the last week, and the mood line, ending with "Never
diagnose or give medical advice."

### HTTP API

| Method | Path                        | Body                        | Response                                                                   |
| ------ | --------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/memory/me/health`     | –                           | `{ enabled, items, safety: { allergies, intolerances, note }, updatedAt }` |
| PATCH  | `/api/memory/me/health/:id` | `{ text?, status?, when? }` | `{ item }` (`userEdited: true`)                                            |
| DELETE | `/api/memory/me/health/:id` | –                           | `{ deleted: true }` (tombstoned)                                           |
| GET    | `/api/memory/me/mood`       | –                           | `{ enabled, timeline, insight }`                                           |
| DELETE | `/api/memory/me/mood/:id`   | –                           | `{ deleted: true }` (by timeline ID or any conversation ID it carries)     |

The memory page has a **Sensitive** tab: the consent question and switches,
the allergy note, health notes (correct / forget) and the mood timeline.

## Work & places

Ferni keeps the story of the user's work and career and the places in their
life, including history ("you used to be at Acme", "before Denver you lived
in Berlin").

### Storage

| Path                                       | What                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bogle_users/{uid}/work_memory/{id}`       | `job` (current/past, role, team, earlier roles), `project`, `win`, `stress`, `goal`, `event` (interview, review, presentation, deadline), `application` |
| `bogle_users/{uid}/place_memory/{id}`      | `home` (current/past = places lived), `trip` (planned/done, companions), `favorite`, `meaningful` ("where you got engaged"), `bucket_list`              |
| `bogle_users/{uid}/memory_tombstones/{id}` | `{ reason, kind: 'work' \| 'place', key }`, written on delete                                                                                           |

`id = work_|place_` + hash of the area and a normalised key (`job:acme`,
`home:denver`, `trip:lisbon:2026`), so re-learning updates one document.
Every item carries `sourceConversationIds`, `sourceFactIds` (when derived from
a fact), `source` (`stated` = the user's words, `inferred` = summary/fact,
`user` = page/tool), `userEdited`, dates as `YYYY-MM` or `YYYY-MM-DD`.

Rules:

- **History, not overwrite.** News of a new current job (or home) moves the
  previous current one to `past` with an end month. A second job ("I also
  work at...") does not. A role known before the employer is folded into the
  job once the employer is known. A promotion keeps the old role in
  `previousRoles`.
- **The user's word wins.** Capture never changes a user-edited item (it only
  adds provenance) and never moves a user-edited current job to the past.
  `stated` beats `inferred`; inferred input only fills gaps.
- **Deleted stays deleted.** Deletes tombstone the id; capture skips it. The
  user adding it again on the page clears the tombstone.
- **Consent.** If a memory-consent service (`services/memory-consent`) exists
  and the user turned the `work` or `places` category off, capture stores
  nothing there (a failing check counts as off).

### Capture

- Per user turn: `recordUserTurnWorkAndPlaces` (voice transcript handler,
  next to the preference capture). Conservative patterns: proper names must be
  capitalised; errands ("going to Target") are not trips; negations are skipped.
- After each summarized conversation (`conversation-summarized-hooks.ts`):
  user turns, the summary (third person, `inferred`), the conversation's
  `dynamic_facts` about the user with work/place keys (extraction is asked for
  `employer`, `job_title`, `team`, `previous_employer`, `lives_in`, `hometown`,
  `lived_in`, `trip_planned`, `trip_taken`, `favorite_*`, `bucket_list`,
  `engaged_in`, `married_in`, `met_in`; those facts get the `work` / `places`
  categories on the page) and `dynamic_entities` places whose attributes say
  how the user relates to them (their entity id is stored as `entityId`).
- Tools: `planTrip` records a planned trip (and `getSavedTrips` lists
  remembered trips across sessions); `trackJobApplication` records applications.

### How Ferni uses it

- **Session start:** a "Their Work & Places" block (650 chars max,
  `loadWorkAndPlacesBlock`, 400 ms timeout) in `agent-setup.ts`: what's coming
  up (trips, interviews), what just happened ("just back from Rome - ask how it
  went"), active projects, recent stress and wins, current job (with "used to
  be at"), home, places that matter, dream destinations. The persona brings one
  up when it fits and never lists them.
- **Reminders and prediction:** a planned trip or work event pinned to a day
  becomes an important date (`kind: 'event'`/`'deadline'`, `subtype: 'trip'` /
  `'career'`), so it is reminded like any date and shows up in personal
  insights' upcoming dates and topic prediction. Deleting the item deletes the
  date; a changed day replaces it. Month-only trips ("in March") are not reminded.
- **People:** colleagues are not duplicated. The work view lists people from
  the people model with `group: 'work'`, and trip companions are linked to
  people by name (`withPeople[].personId`).

### API

All routes use `requestUserId(req)`; ids are looked up in the caller's own
subcollection, so another user's id is a 404. No identity: 401.

| Method | Path                              | Body                                                                                                                    | Response                                                          |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/memory/me/work`             | –                                                                                                                       | `{ items, colleagues: { id, name, relationship? }[], updatedAt }` |
| GET    | `/api/memory/me/places`           | –                                                                                                                       | `{ items, updatedAt }`                                            |
| POST   | `/api/memory/me/work\|places`     | `{ kind, title, status?, employer?, role?, team?, place?, category?, meaning?, startDate?, endDate?, notes? }`          | `201 { item }` (the user's; never ends the current job)           |
| PATCH  | `/api/memory/me/work\|places/:id` | any of `{ title, status, employer, role, team, place, meaning, startDate, endDate, notes }` (`null` clears dates/notes) | `{ item }` (`userEdited: true`)                                   |
| DELETE | `/api/memory/me/work\|places/:id` | –                                                                                                                       | `{ deleted: true }` (tombstoned, reminder removed)                |

Items come back with their status as of today (a planned trip whose dates
passed reads `done`). Errors: 400 invalid body / kind for the area / date,
401, 404, 405, 503 storage.

The memory page has a **Work & places** tab (`apps/web/src/ui/memory-control/work-places-tab.ts`).

### Export and cascades

Registered as two memory domains, `work` and `places`: export
(`{ items, exportedAt }` each), conversation delete (drop the conversation;
an automated item left with no conversation or fact is deleted and
tombstoned, user items stay), fact delete/correction (same rule for
`sourceFactIds`), delete-all and account erasure, voice forget.

## Life story, values & beliefs

Ferni keeps the user's story (where they grew up, the family they grew up
in, school years, stories they've told, formative moments, turning points,
life chapters, recurring themes, how they make decisions), what matters most
to them, and, only with consent, their faith and beliefs.
`services/life-story/`.

### Storage

| Path                                       | What                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `bogle_users/{uid}/life_story/{id}`        | `origin`, `family`, `school`, `story`, `moment`, `turning_point`, `chapter` (with `period`), `theme`, `decision`            |
| `bogle_users/{uid}/values/{id}`            | Values: the Values Alignment store (`UserValue` shape), now with `label`, `source`, `userEdited` and provenance             |
| `bogle_users/{uid}/beliefs_memory/{id}`    | `faith`, `practice`, `belief` (philosophical/spiritual), `questioning`. **Only with Beliefs consent**                       |
| `bogle_users/{uid}/memory_tombstones/{id}` | `{ reason, kind: 'story' \| 'value' \| 'belief', key }`; plus `story_forgotten_wordings` (forgotten stories, by wording)    |
| `life_chapters/{id}`, `meta/identity`      | Legacy Life Narrative stores: chapters now carry `sourceConversationIds`; exported, cascaded when they carry the id, erased |

`id = story_|belief_` + hash of a normalised key (`origin:ohio`,
`story:brother build treehouse`); values use `value_` + hash of the label
(older values with random ids are matched by category). Every item carries
`sourceConversationIds`, `sourceFactIds`, `source` (`stated` / `inferred` /
`user`), `userEdited`, `mentions`. Story items also have `period` ("age 9",
"college", "2012-2016"), `date` (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`), `people`
(`{ name, personId? }`, linked to personal insights' people model), `place`
(`{ name, placeId? }`, linked to the work & places item, which keeps the
place itself) and `dateId`.

Rules:

- **One story, many tellings.** A story retold in other words ("building a
  treehouse with my brother" / "the treehouse my brother and I built") is
  matched loosely (shared content words) and becomes one entry with both
  conversations in its sources, so Ferni can say "you told me about the
  treehouse" and never asks the same question twice.
- **The user's word wins**, **deleted stays deleted** (a forgotten story is
  also blocked when retold in new words), **history is kept**, as for work &
  places.
- **Values are not gated; beliefs are.** "Family matters most to me" is a
  value. "I go to mass on Sundays", "I'm Buddhist", "I've been questioning my
  faith" are beliefs: the shared classifier (`memory-consent/classifier.ts`,
  extended for practice, traditions, afterlife/karma, conversion) decides, and
  anything it calls `beliefs` is never stored as a value. Beliefs are written
  only while `isCategoryEnabled(uid, 'beliefs')`; a story or value whose words
  touch a switched-off sensitive category (a childhood story about church, a
  diagnosis at 12) is held back too.
- **Off means off.** Switching Beliefs off drops the in-memory per-session
  buffer (`onConsentChange`) and the Sensitive tab offers deleting what's
  stored (category store `beliefsMemory`).
- **Dates.** A story pinned to a specific day ("the day I got sober,
  2015-03-14") becomes a recurring important date (`kind: 'other'`,
  `subtype: 'life_story'`); deleting the story deletes the date.

### Capture

- Per user turn: `recordUserTurnLifeStory` (voice transcript handler, next to
  the preference and work/places capture). High-precision first-person
  patterns (`detect.ts`); negations and other people's stories are skipped.
- After each summarized conversation (`conversation-summarized-hooks.ts`):
  user turns, the summary (third person, `inferred`), and the conversation's
  `dynamic_facts` about the user with story keys (`grew_up_in`,
  `family_of_origin`, `school`, `childhood_memory`, `told_story`,
  `formative_moment`, `turning_point`, `life_chapter`, `life_theme`,
  `decision_style` → category `story`), `core_value` (→ `values`) and belief
  facts (`religion`, `spiritual_practice`, `belief`, `faith_questioning`, always
  factType `belief`, so the extraction gate drops them while Beliefs is off).
- Live value detection (Values Alignment, `recordValueMention`) writes the
  same documents with deterministic ids, conversation provenance, tombstone
  check and no faith; Life Narrative chapters record the session id.

### How Ferni uses it

- **Session start:** "Their Story & Values" (`loadLifeStoryBlock`, 700 chars,
  400 ms) in `agent-setup.ts`: roots, stories they've told (most retold
  first), turning points and chapters, recurring themes, values and how they
  decide, and, only with Beliefs consent, faith with "Honour this; never raise
  faith first, never judge or preach." Anything matching the user's avoided
  topics or sensitivities (`user-preferences/boundaries.ts`) is left out; if
  boundaries can't be read the block is held back.
- **Nayan:** the wisdom briefing's life narrative uses their real chapters,
  turning points, themes and values over inferred ones.

### API

| Method | Path                         | Body                                                                      | Response                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| GET    | `/api/memory/me/story`       | –                                                                         | `{ items, values, updatedAt }`              |
| POST   | `/api/memory/me/story`       | `{ kind, title, detail?, period?, date? }` (`kind: 'value'` adds a value) | `201 { item }`                              |
| PATCH  | `/api/memory/me/story/:id`   | any of `{ title, detail, period, date }` (`null` clears)                  | `{ item }` (`userEdited: true`)             |
| DELETE | `/api/memory/me/story/:id`   | –                                                                         | `{ deleted: true }` (tombstoned, date gone) |
| GET    | `/api/memory/me/beliefs`     | –                                                                         | `{ enabled, items, updatedAt }`             |
| POST   | `/api/memory/me/beliefs`     | `{ kind, title, detail? }`                                                | `201 { item }`; `409` while Beliefs is off  |
| PATCH  | `/api/memory/me/beliefs/:id` | any of `{ title, detail }`                                                | `{ item }`                                  |
| DELETE | `/api/memory/me/beliefs/:id` | –                                                                         | `{ deleted: true }` (tombstoned)            |

`/story` ids are `story_…` or `value_…`; `/beliefs` ids are `belief_…`.
Identity from `requestUserId(req)`; another user's id is a 404.

The memory page has a **Your story** tab (`life-story-tab.ts`: where you come
from, stories you've told me, turning points & chapters, themes, what matters
to you and how you decide; add, correct, forget) and a **Faith & beliefs**
section in the Sensitive tab, shown only while Beliefs is on
(`beliefs-section.ts`: correct, forget).

### Export and cascades

Two memory domains: `lifeStory` (story + values + legacy chapters/identity)
and `beliefs`. Export (`{ story, values, lifeChapters, identity }` /
`{ items }`), conversation delete (provenance removed; automated items left
with none are deleted and tombstoned; user items stay), fact
delete/correction (one pass over story, values and beliefs), delete-all and
account erasure, voice forget ("forget the treehouse story", "forget that I'm
Catholic").

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
