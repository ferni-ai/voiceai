# Forget by marker

Status: **design, not built.** Docs only. Owner: memory. 2026-10-24, on main `79d2f283d`.

"Forget that" is honoured today by matching the topic's words at read time, reader by reader. Every
audit since #2515 has found another reader that doesn't match, or a copy the matcher can't
recognise. This plan makes forgetting structural: `forgetTopic` writes a marker on everything it
can find, every derived copy points at its source, readers check the marker first, and one
conformance test calls every registered reader after a real `forgetTopic`. The next leak should
fail that test instead of waiting for an audit.

## 1. The problem

| Finding                                                                                                                                                                                                                          | Root cause                                                                                                                                   | Prevented by                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| #2719 / #2727: `recentContext` said forgotten session topics and insights back, and its `memories` fallback returned forgotten lines                                                                                             | `forgetTopic` never touches `conversations` or `memories`; the reader had no filter                                                          | (a) mark primaries, (f) reader registry                                  |
| #2727 verifier: the topics read had no timeout; a hung read hung the tool                                                                                                                                                        | Each reader picks its own read and bound                                                                                                     | (d) one bounded read                                                     |
| #2720.1: graph sync reads `collectionGroup('unified_memories')` with no filter                                                                                                                                                   | Copies carry no source, so no marker can reach them                                                                                          | (b) source on copies, (e) write-path guard                               |
| #2720.2: maintenance consolidation re-saves forgotten text as a new `memories` doc and vector doc                                                                                                                                | A write path re-creates content without asking whether its sources are forgotten                                                             | (e) write-path guard                                                     |
| #2720.3: `memory_<uid>_<id>` vector docs have no `sourceCollection` / `sourceDocId`, so a paraphrase passes `withoutForgotten`                                                                                                   | Text match is the only defence for sourceless copies                                                                                         | (b) source on copies                                                     |
| #2747: matcher misses verb forms ("get laid off" vs "was laid off"), a lone capitalized noun, short names ("Jo"/"Jos"), relation+name topics ("my sister Jen" vs "Jen's wedding")                                                | Every reader re-runs a lexical matcher on whatever text it holds; each miss leaks in every reader                                            | (a)+(c): the matcher runs once, at forget time, and copies inherit by id |
| #2748: web history routes show forgotten `topicsDiscussed` / `highlights`                                                                                                                                                        | Same as #2719, in a reader nobody listed                                                                                                     | (a), (f)                                                                 |
| #2755: the topics read is cached 15 s and only invalidated by a forget in the same process                                                                                                                                       | Cross-process freshness depends on a TTL                                                                                                     | (c) marker readers need no topics; (d) generation for the text backstop  |
| #2623: the last-known topics fallback has no age bound                                                                                                                                                                           | Same                                                                                                                                         | (d)                                                                      |
| FORGET_EVERY_READER series #2561 (merged), #2614, #2623, #2633, #2644, #2647, #2691 (open): seven PRs filter 30+ prompt readers at read time, behind an off flag. Each review round found more readers and more outbound senders | Coverage is a list in a PR body and a flag comment, not something a test enforces. On main only `remembered-facts.ts` calls `forgottenCheck` | (f) registry + coverage scan; the series becomes the (c) text backstop   |
| Inventory (this doc): `profile.lastCallerSummary` reaches the system prompt (`agent-setup.ts:430`) and greeting (`greeting-direction.ts:243`) with no filter on main                                                             | A derived field copied out of a summary, with no pointer back                                                                                | (b), (e)                                                                 |
| Inventory: forgetting one fact by id (`memory-control.ts:177`) records no topic, so sourceless vector copies of it survive                                                                                                       | Copies are only found by text, and there is no text to match                                                                                 | (b)                                                                      |

The FORGET_EVERY_READER work is not wasted: it is the read-time text check, and it stays as
defence in depth. What changes is that it stops being the only thing between a forgotten topic
and the prompt.

## 2. Today's architecture

### What `forgetTopic` writes (`src/memory/recall/forget.ts`)

1. `storedTopic(topic)` reduces the request to its words; nothing to forget returns `nothing`.
2. Reads every doc in `bogle_users/{uid}/dynamic_facts` and `extracted_facts`, matches with
   `isForgotten(factText(...))`, and refuses topics covering >30% (and >5) of live facts.
3. `addTopic`: appends the words to `memory_state/forgotten.topics` and the request to `asked`.
4. `noteForgotten` + `bumpForgetGeneration`: an in-process set and counter (lost on restart,
   invisible to other processes).
5. `closeForgottenFollowUps`: releases open follow-ups about it.
6. `markForgotten`: sets `forgottenAt` on matched facts; on `dynamic_facts` also
   `syncedToSpanner: false` and deletes `embedding`; `removeIndexCopies` deletes
   `conversation_fact_<id>` and `fact_fact_<uid>_<id>` vector docs.

It never deletes (a model-reported confirmation must be recoverable). `dispute.ts` already marks
call summaries item by item (`disputedItems`), which `withoutForgotten` and recall honour. That is
the precedent this plan follows for summaries.

### Inventory

Built by grep at `79d2f283d`: three read-only sweeps (memories/unified/graph,
conversations/summaries/transcripts, vectors/facts/entities), with key claims re-checked by hand.
"Marked" means `forgetTopic` writes a marker on it. "Filter" is what the reader applies today.

| Store                                                                  | Main writers                                                                                                                                                                                               | Marked?                          | Source pointer?                                                                                              | Readers that reach a person or model, and their filter                                                                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dynamic_facts`                                                        | deep extraction, remembered facts, sweep                                                                                                                                                                   | yes                              | primary                                                                                                      | recall snapshot (marker + text), person model, indexer, memory control UI (marker). `supersession-store.ts:18` feeds forgotten facts to the supersession LLM prompt with no check (no user-visible output)          |
| `extracted_facts`                                                      | `rememberAboutUser`                                                                                                                                                                                        | yes                              | primary                                                                                                      | `recallFromMemory` (marker + guard)                                                                                                                                                                                 |
| `memories`                                                             | `saveMemory` (tools `rememberAboutUser`, `rememberImportantFact`, `predictUserNeed`), `saveMemoryDirect` (post-call raw transcript "deep signals", `cleanup-handler.ts:1017`), quickCapture, consolidation | **no**                           | **no** (`saveMemory` drops `source`)                                                                         | `recentContext` fallback (text, fail closed, #2727); vector copy via `recallFromMemory` (text only)                                                                                                                 |
| `unified_memories`                                                     | `UnifiedStore.store` / `consolidate`                                                                                                                                                                       | no                               | no                                                                                                           | `UnifiedStore.recall` → `memory-intelligence/core.ts:143` → turn context: **no filter found**. No live caller of `store` was found, so the collection may be empty in prod                                          |
| `summaries` (+ legacy `conversation_summaries`)                        | `saveSummary` at call end                                                                                                                                                                                  | no (`disputedItems` only)        | no                                                                                                           | recall snapshot follow-ups (text), `createSummaryRecall` / `rememberable` (text; off flags), pondering (text), follow-through (text); `year-in-review-routes.ts:175`, `better-than-human-memory.ts:174` (web, none) |
| profile `lastCallerSummary` / `lastConversationSummary`                | `session-manager.ts:1524-1541`, `realtime-memory.ts:452`, `last-summary.ts`                                                                                                                                | no                               | **no**                                                                                                       | system prompt, greeting, awareness block, `getRelationshipSummary`, conversation recap: **none** (`profileForPrompt` has no caller on main)                                                                         |
| `conversations` sessions (`topicsDiscussed`, `insights`, `highlights`) | `recordSession` (client body), `realtime-memory.ts`                                                                                                                                                        | no                               | no                                                                                                           | `recentContext` (text, #2727); `GET /api/conversations` and `conversation-threads.ts:202-240` (web, **none**, #2748); `conversation_threads` persisted copy                                                         |
| transcripts (`conversations/*/turns`)                                  | `persistTurn`                                                                                                                                                                                              | no                               | n/a                                                                                                          | episode quotes (text, off flags); `getLastConversationContext` → `profile.lastConversationSummary` and → deep signals (none); `resume-after-drop.ts` (none, off flags)                                              |
| `vectors`                                                              | see §3(b) list                                                                                                                                                                                             | copies deleted for facts only    | resolvable for `conversation_fact_`, `fact_fact_`, `conversation_summary_`, and `rememberAboutUser` metadata | `FirestoreVectorStore.search` / `searchByEmbedding` always run `withoutForgotten` (`core.ts:446,582`): text, plus marker when `sourcePath` resolves                                                                 |
| Spanner graph                                                          | `insertSyncedFact`, `syncMemoryImmediately`                                                                                                                                                                | facts: copy removed by next sync | facts by id                                                                                                  | **inert**: `spanner-adapter.ts:137` `ready = false`, `process-runtime.ts:60` sync `enabled: false`. Latent: `syncMemoryImmediately` ids (`fact_<uid>_<memoryId>_<topic>`) are never reached by `forgetTopic`        |
| `entity_store` / `dynamic_entities`                                    | extraction, dual-write                                                                                                                                                                                     | no                               | no                                                                                                           | hybrid search entity leg (`hybrid-search.ts:269-337`, none); names for the matcher (`life-ledger.ts:338`, internal)                                                                                                 |
| `commitments`                                                          | after-call commitments                                                                                                                                                                                     | no                               | no                                                                                                           | `commitmentsShown` (text, fail closed, no flag) in the store, push, morning brief, trajectory and others                                                                                                            |
| outbound senders                                                       | outreach, reminders, held texts, family check-ins…                                                                                                                                                         | n/a                              | n/a                                                                                                          | listed in #2647 / #2691: nine filtered (text), ten not                                                                                                                                                              |

Also on main: `FORGET_EVERY_READER`'s header lists readers (profile, handoff, `UnifiedStore.recall`,
the entity leg) whose wiring is in the open #2614–#2691 stack, so on main the flag gates almost
nothing (`forgottenCheck`'s only production caller is `remembered-facts.ts:140`).

**UNCONFIRMED — did not exhaustively verify:**

- Whether `unified_memories` holds any prod docs (legacy data); no live writer was found.
- Whether the memory-intelligence turn injection that calls `UnifiedStore.recall` is gated by a flag.
- Whether `summaries` doc ids always equal `summary.id`, i.e. whether every `conversation_<id>`
  vector copy resolves to its summary in `sourcePath`.
- Readers of `commitments` with no forget reference in the file (`commitment-keeper.ts`,
  `trust-systems/commitment-follow-through.ts`, `superhuman-jobs.ts:77,275`,
  `proactive-channels/triggers.ts:151`, `api/routes/commitments.ts`,
  `tools/domains/productivity/commitments.ts`): their downstream filter and destination.
- Whether the in-memory `VectorStore` (no forget filter) is ever the active store in prod
  (`semantic-rag.ts:44`); likely dev only.
- Whether anything reads Spanner entity copies back into prompts.
- Live producers of `voice_conversations`, `summarization-worker` summaries, dispatch
  `metadata.lastSessionSummary`, and `users/{uid}/conversations` (a second path some engines read).
- Whether the legacy `recallFromMemory` in `tools.ts:155` (alex/peter/jordan agents) is live.
- `user-records-export.ts` and `data-export.ts` return forgotten items; presumably intended (§7).

## 3. Proposal

### (a) Mark at forget time

`forgetTopic` gets a topic id and marks every **primary** it can find, not just facts:

- The topic record moves from a bare string to an entry: `memory_state/forgotten.entries[]` =
  `{ id, words, asked, at }`, with `topics` kept in step for old readers. The same transaction
  increments `memory_state/forgotten.generation`.
- Every marked doc gets `forgottenAt` and `forgetTopicIds: arrayUnion(id)`. A forget by id
  (`memory-control.ts`) writes `forgetTopicIds: ['id:<docId>']`, so it is marked the same way.
- Primaries and how each is matched:
  - `dynamic_facts`, `extracted_facts`, `memories`, `unified_memories`, `commitments`,
    `entity_store` people/pets whose name is the topic: whole doc.
  - `summaries`: per key point, as `forgottenItems` (the `disputedItems` shape). Readers drop the
    items, or the whole summary when they can't split it (as `withoutForgotten` does for disputes).
  - `conversations` sessions: `forgottenItems` over `topicsDiscussed`, `insights`, `highlights`.
- Matching is by **source id first** where a link exists: copies by `derivedFrom` (b), and a
  marked fact's session where the fact records one (remembered facts carry `sessionId`;
  deep-extraction facts link to a session only via `extraction_history`, UNCONFIRMED per fact).
  Text match (the one shared matcher, with #2747's fixes) is the backstop for primaries with no
  link, which today is most of them.
- The share guard (`too-broad`) stays on facts only, as today.
- `forgetTopic` stays bounded: it reads at most the last N summaries and sessions (default 200,
  §7), and its result reports per-store counts.

The matcher still decides what a primary is "about". What changes is that it runs **once**, at
forget time, on the stored text, and its verdict is durable and countable. A reader no longer has
to re-derive it from whatever wording its copy happens to have.

### (b) Every derived doc carries its source

A copy records `derivedFrom: [{ collection, docId, item? }]` (one or more). `sourcePath` reads it
before the id patterns and `metadata.sourceCollection/sourceDocId`. Writers to change:

| Copy                                                    | Writer                                               | Today                               |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| `memory_<uid>_<id>` vector doc                          | `saveMemory` (`lifecycle-integration.ts:146`)        | `memoryId` only                     |
| `entity-` / `fact-` / `rel-<uid>-…-<ts>` vector docs    | deep extraction (`extraction-vector-docs.ts:94-192`) | none; ids carry a timestamp         |
| `conversation_insight_<id>`                             | `user-memory-indexer.ts:267`                         | none                                |
| `anchor_` / `session_summary_<id>`                      | `memory-continuity.ts:321,425`                       | none                                |
| `<storeType>_<entityType>_<id>`, `habit_`, `task_` …    | `store-hooks.ts:214`, `data-layer/index.ts:515`      | `entityId`, no collection           |
| `<uid>:<memoryId>`                                      | unified-store `VectorAdapter`                        | none                                |
| consolidated `memories` doc and its vector              | `saveConsolidatedMemory`                             | `sourceMemoryIds` on a side doc     |
| profile `lastCallerSummary` / `lastConversationSummary` | `session-manager.ts`, `last-summary.ts`              | none; becomes `{ text, summaryId }` |
| `conversation_threads`                                  | `conversation-threads.ts:288`                        | none                                |
| graph facts from `syncMemoryImmediately`                | `firestore-spanner-sync.ts:510`                      | none (inert today)                  |

A copy is hidden when **any** source is marked (or, with `item`, that item). Copies that are pure
indexes (vector, graph) are deleted at forget time when found by source, as fact copies already
are; the rest are filtered.

### (c) Readers filter by marker first

One helper, `forgetVerdict(doc, ctx)`, in `src/memory/recall/forget-marker.ts`:

1. Own marker: `forgottenAt` / `forgottenItems` → hide (or strip items).
2. Source marker: any `derivedFrom` source marked → hide. Sources are read with `getAll`, 300 ms
   bound, fail closed (the `withoutForgotten` rule).
3. Text backstop: the shared matcher over the forgotten topics (d), plus `forgottenInProcess`.

A marker reader needs no topics read, so it has **no cross-process window** for anything marked:
the marker is in the doc it already read. Only the backstop depends on (d).

### (d) One forgotten-topics read

`forget-topics-source.ts` becomes the only way to read topics (vector store and `recentContext`
caches fold into it):

- Cached per user with the stored `generation`. A reader may use the cache for 2 s (was 15 s);
  after that it re-reads the one doc (300 ms bound).
- Last-known topics are usable only if read within 60 s **and** the generation hasn't moved
  (#2623's bound, kept). Otherwise fail closed.
- A forget in this process bumps the local generation at once, as today.
- Cost: one small doc read per user per 2 s per process while readers run; the readers that
  matter run once per turn, so in practice about one read per turn.

This subsumes #2623 (age bound) and #2755 (the 15 s window becomes 2 s for the text backstop and
zero for marked docs).

### (e) Write paths skip marked sources

A shared `mayWriteDerived(sources, text, ctx)` runs before any write that re-creates content:

- Consolidation (`runLifecycleMaintenance`, `memory-consolidator.ts`): drop marked sources from
  the input; never copy a marked memory's sentence.
- `saveMemoryDirect` deep signals (`cleanup-handler.ts:1017`) and `saveSummary` at call end:
  check the text backstop; if a topic forgotten during the call matches, write the doc with the
  item already marked (so a later reader, and the backfill, see it), not unmarked.
- Summary indexing, the profile last-summary fields, `conversation_threads`: copy only unmarked
  items, and carry `derivedFrom`.
- Graph sync: `syncMemoryImmediately` refuses marked sources, as `syncableFact` already does for
  facts.

## 4. Cross-reader conformance test

### The registry

`src/memory/recall/forget-readers.ts` exports `FORGET_READERS: readonly ForgetReader[]`:

```ts
type StoreName =
  | 'dynamic_facts'
  | 'extracted_facts'
  | 'memories'
  | 'unified_memories'
  | 'summaries'
  | 'profile_last_summary'
  | 'conversations'
  | 'transcripts'
  | 'vectors'
  | 'entities'
  | 'commitments';
interface ForgetReader {
  id: string; // 'recentContext.history'
  file: string; // 'src/tools/domains/simple-utilities/essentials-tools.ts'
  stores: StoreName[];
  reaches: 'prompt' | 'tool' | 'web' | 'outbound' | 'internal';
  /** Calls the real reader against the fake db; returns every string it would emit. */
  read: (ctx: ConformanceCtx) => Promise<string[]>;
  knownGap?: string; // issue link; the ratchet below
}
```

Two tests keep it honest:

1. **Coverage scan** (`forget-readers-coverage.test.ts`): greps `src/` (non-test) for store
   access signatures (`collection('memories')`, `'summaries'`, `'unified_memories'`,
   `topicsDiscussed`, `lastCallerSummary`, `getUnifiedStore()`, `.search(` on the vector store,
   `getHistory(`…). Every matching file must be some reader's `file`, or be listed in
   `NOT_A_READER` with a one-line reason (writer, count only, export). A new reader with no
   entry fails here. `StoreName` is a union, so a new store is a type change reviewers see.
2. **Conformance** (`forget-conformance.test.ts`), one `it` per registered reader:
   - Seed one fixture into every store: the fact "Dana and I are getting divorced" as a fact, a
     memory, a summary key point, a session topic and insight, a transcript turn, a profile
     last summary, a commitment, vector copies with `derivedFrom`, **plus a paraphrased copy**
     ("the split with Dana") that only its source can reveal.
   - Seed near-misses that must survive: "I marked the calendar" (with "Mark" forgotten in a
     second case), "the court date for the lease".
   - Precondition: each reader emits the fact before the forget (otherwise the test is vacuous).
   - Call the **real** `forgetTopic(uid, 'the divorce')` over the fake db.
   - Assert: no reader's output matches the fact or the paraphrase; every near-miss is still
     emitted.
   - Variants: topics unreadable (every reader fails closed or still hides by marker); forget in
     module instance A, read in instance B (`vi.resetModules`) within 1 s.
   - `knownGap` readers are expected to leak; the test fails if one **stops** leaking (so the
     entry gets removed) or if the list grows. The ratchet only shrinks.

### How it runs

Plain vitest, no network, in the existing unit run. The db is `createMergeFakeFirestore`
(`src/tests/helpers/merge-fake-firestore.ts`: subcollections, `collectionGroup`, `update`,
`FieldValue.delete`), extended with `getAll`, `batch().update` and `arrayUnion`, which
`firestoreForgetStore` and `withoutForgotten` need. Vector search uses a fake behind
`FirestoreVectorStore`'s db seam (as `forget-filter-wiring.test.ts` does) with the real
`withoutForgotten`, not a mock of it. Fixture patterns to copy: `remembered-facts.test.ts`
(hoisted path-keyed docs and `getFirestoreDb` mock), `recent-context-forget.test.ts` (real
`forgetTopic` + real tool), `spanner-sync-forget.test.ts` (fake vector store).

## 5. Migration, rollout, metrics

**Backfill** (`scripts/backfill-forget-markers.ts`, shaped like `backfill-forgotten-resync.ts`:
dry run prints counts only, `--apply` asks for the project id, no content or user ids logged):

1. For each user with `memory_state/forgotten`, convert `topics` to `entries` with ids.
2. Re-run (a)'s marking over every primary for every recorded topic.
3. Add `derivedFrom` to copies whose source is derivable from the id or metadata
   (`memory_<uid>_<id>` → `memories/<id>`, `metadata.entityId` + store type). Copies that can't
   be resolved (deep extraction `…-<ts>` docs) are deleted and re-indexed from their source, or
   left to the text backstop if the source is gone (§7).
4. Idempotent; resumable by user cursor; dev first, then prod after the reader flag is on in dev.

**Rollout.** Marker and `derivedFrom` writes are additive and invisible to today's readers, so
they ship **unflagged**. Reader changes that hide more go behind `FORGET_BY_MARKER` (off): dev,
then a cohort (Seth's and internal accounts), then everyone after a week with no false-hide
reports. Write-path guards (e) ship unflagged: they only refuse to copy marked content.

**Metrics** (logs + `recordMetric`, no content):

- `forget_fail_closed{reader}` and `forget_backstop_hide{reader}`: a backstop hide of an
  unmarked doc means marking missed it; the target is near zero after backfill.
- `forget_marker_coverage`: in the backfill dry run and a weekly job, copies whose source is
  marked but that are themselves still searchable, over all such copies. Target 0.
- `forget_marks{store}` per `forgetTopic` call, and `forget_write_skips{writer}`.
- Topics read latency and fallback count (`forgetReadStats`), now one source.

## 6. Phased PR plan

Each phase is independently mergeable, ≤400 reviewable lines, with its acceptance test red first.

| #   | PR                                                                                                                                       | Acceptance test                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0  | Registry + coverage scan + conformance harness; today's readers registered, leaks recorded as `knownGap`. No behaviour change            | Coverage scan fails when a fixture file reading `memories` is added unregistered; conformance passes with the gap list, and fails if a gap entry is removed while it leaks |
| P1  | Topic entries with ids + `generation`; one bounded read (2 s / 60 s / fail closed); vector store and `recentContext` caches fold into it | Two-instance test: forget in A, read in B 1 s later hides; last-known older than 60 s fails closed (#2623 repro); 15 s case from #2755 now hides                           |
| P2  | `forgetVerdict` + marking `memories`, `commitments`, `unified_memories`; forget by id writes a marker                                    | Conformance gaps for those stores close; `recentContext` fallback hides by marker with topics unreadable                                                                   |
| P3  | Mark `summaries` and `conversations` per item (`forgottenItems`); web routes (#2748) and `recentContext` read markers                    | #2748 closed by the conformance rows `web.conversations`, `web.threads`; near-miss topics still listed                                                                     |
| P4  | `derivedFrom` on vector writers (§3b table) and `sourcePath` reading it                                                                  | Paraphrase row: "the split with Dana" vector copy hidden after forgetting "the divorce"; forget by id hides its deep-extraction copy                                       |
| P5  | Profile last-summary as `{ text, summaryId }` + threads with `derivedFrom`; prompt/greeting readers check it (behind `FORGET_BY_MARKER`) | Conformance rows `prompt.lastCallerSummary`, `greeting.lastCallerSummary` pass with the flag on, leak (knownGap) off                                                       |
| P6  | Write-path guards: consolidation, deep signals, call-end summary, graph sync                                                             | Consolidating a marked memory writes no new doc; a forget mid-call then call end writes the summary item already marked                                                    |
| P7  | Backfill script (dry run + apply)                                                                                                        | Script test over the fake db: counts, idempotent second run, no content in output                                                                                          |
| P8  | Flag flip dev → cohort → all; remove `knownGap` entries as they close                                                                    | Conformance gap list empty for `prompt`, `tool`, `outbound` readers                                                                                                        |

The open FORGET_EVERY_READER stack keeps going as the text backstop. Its readers register in P0
like any other; P1 replaces the parts of #2623 that bound the fallback.

## 7. Open questions for Seth

1. **Delete or mark copies?** Recommended: mark primaries (forget stays reversible), delete pure
   index copies (vector, graph) found by source, as facts already do.
2. **Should the caller's own web history hide forgotten topics (#2748)?** Recommended: yes, so
   "forget" means the same thing everywhere they look.
3. **Data export.** Recommended: export includes forgotten items, labelled forgotten. Forget is
   not erasure; account deletion is.
4. **How far back does `forgetTopic` mark summaries and sessions?** Recommended: last 200 of
   each per forget, then the backfill/weekly job finishes older ones.
5. **Paraphrase matching at forget time** (embeddings or a model call over the caller's
   primaries)? Recommended: not in v1. Source markers already cover paraphrases in copies;
   measure `forget_backstop_hide` and primary misses first.
6. **Dead stores** (`unified_memories` writers, Spanner graph, `voice_conversations`)?
   Recommended: register them with `reaches: 'internal'` now, delete the code in separate PRs
   rather than mark it.
7. **Unresolvable legacy vector copies** (deep extraction ids with timestamps). Recommended:
   delete and re-index from source during the backfill; if the source is gone, delete.
8. **Marker writes unflagged?** Recommended: yes (additive, nothing reads them until P2+); reader
   changes flagged.
