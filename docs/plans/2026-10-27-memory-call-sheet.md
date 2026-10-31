# Ferni memory: one store per kind, one call sheet, a few lookups

Status: approved direction (Seth, 2026-10-27). Code at origin/main `e61974b38`.
Builds on two designs; it doesn't replace them:
- the recall ledger, [`2026-10-27-recall-ledger.md`](2026-10-27-recall-ledger.md), which records what Ferni did and promised;
- the person-model design, `voiceai-evidence/person-model-design-2026-10-18.md`. PRs 1 (#1894) and 2 (#1898) of it are merged.

## The problem, in one line

Ferni stores the same kind of memory in many places, delivers it as hundreds of fragments, and
has no one brief of who this person is and what's open. So it forgets, contradicts itself, and
denies things it did.

## What we measured

| Signal | Value | Source |
|---|---|---|
| Held-out recall of what Ferni did (119 questions) | **0 / 119** on main; 3 invented calls | lane 6 eval, #2969 |
| Same questions, reader given the stored records | 0.878 | #2969 reference arm |
| People stored in | 8 places | person-model design 1d |
| Open items stored in | 10+ places | same |
| Contact stores telephony reads | 4 | #2949 / #2970 |
| Context-builder files pushing per-turn fragments | 278 | `src/intelligence/context-builders` |
| Reads at call start | about 56–100, 17 of them sequential | person-model design 2 |
| Stores written but never read / read but never written | 11 / about 12 | person-model design 1b, 1c |

## What the state of the art does (2026)

1. **Memory is split by kind**, each kind with its own shape and lifecycle:
   - a small core profile, always in context;
   - episodes, time-stamped and quotable;
   - semantic facts, with supersession instead of overwrite;
   - procedural and action records.
   (MemGPT/Letta core blocks; MIRIX; ChatGPT saved memories plus chat history.)
2. **Facts are bi-temporal.** Each fact records when it was true (`validFrom`/`validTo`) and when
   it was learned or retired. "Where did I work before?" and "is Dad still at that number?" are
   both answerable (Zep/Graphiti; APEX-MEM, ACL 2026, 86.2% LongMemEval).
3. **The write path is where quality is won.** Every new fact is reconciled against what's stored,
   as ADD / UPDATE (supersede) / NOOP / DELETE, not appended (Mem0). Consolidation runs offline,
   between conversations ("sleep-time").
4. **The read path is a short brief plus lookups on demand.** The brief is small and high-signal at
   session start, and the model fetches detail through tools when it needs it. Long, noisy
   context degrades answers.
5. **It is measured on five abilities:** extraction, multi-session reasoning, temporal reasoning,
   knowledge updates and abstention (LongMemEval). Our lane 6 eval uses the same buckets.

## The design: a film set

| Role | What it is | Ferni today | This plan |
|---|---|---|---|
| **Call sheet** | Read once before the scene: who they are, what changed, what's open, what Ferni owes, what to leave alone | missing (person model built, never read) | the person model, rendered, one read at call start |
| **Director's notes** | Per-reply hints on subtext and energy | `director-notes.ts` (`DIRECTOR_NOTES`) | unchanged; gets the call sheet as input |
| **Script supervisor** | Continuity: what's been said and done | `told-this-call.ts`; the ledger lands with lanes 1–2 | activity ledger + told-this-call, queried by tools |
| **Props department** | Detail fetched when a scene needs it | 278 builders push detail every turn | 4 lookup tools, pulled on demand |

### 1. One canonical store per kind of memory

Each kind gets exactly one store of record. Every other place holding the same meaning becomes
either a derived view or retired. Normalising is the precondition for everything else: a brief
built from eight disagreeing people stores can't be right.

| Kind | Canonical store | Absorbs (dual-write, then retire) | Shape notes |
|---|---|---|---|
| **People** (and their contact details) | `entity_store/{uid}/entities` (type `person`), the unified store its own CLAUDE.md already set out to be | `dynamic_entities` people, `relationship_network`, `relational_nodes`, `relationship_nodes`, `contact_relationships`, `user_contacts`, root `familyMembers`, `human_memory.importantPeople` | one id per person; `relation` only when stated; aliases; `contact.phone` only (never a second phone field); `sensitive` |
| **Facts** (semantic) | `facts` on the person or owner: `bogle_users/{uid}/facts/{id}` | `dynamic_facts`, `world_facts`, root `goals`/`primaryConcerns`/`lifeEvents`, `human_memory/profile` | bi-temporal: `subjectId`, `attribute`, `value`, `validFrom`, `validTo`, `learnedAt`, `retiredAt`, `supersededBy`, `sourceEpisodeId`, `confidence`, `sensitive`, `forgottenAt` |
| **Episodes** | `summaries/{sessionId}` (+ `conversations/*/turns` for quotes) | `voice_sessions`, `conversation_summaries`, `conversations.summary`, root `lastCallerSummary`/`conversationSummaries` | one summary per call, keyed by session id; `callerProvenance`; `disputed` |
| **Actions and open items** | activity ledger, `bogle_users/{uid}/activity/{id}` (#2958/#2959) | `on_behalf_calls` (link), `deferred_calls`, `commitments` ×3 schemas, `ferni_commitments`, `open_loops`, `follow_through`, `follow_up_actions`, `summaries.followUpItems`, `voice_sessions.unfinishedTopics`, root `pendingFollowUps`/`promisedFollowUps`/`openThreads` | the ledger's states and kinds; transport stores stay as the transport's own records, `links`-ed |
| **Mood** | derived only (call sheet `mood` section) | `emotional_arcs` ×2, `temporal_snapshots`, `wellbeing_snapshots`, `energy_readings`, root `currentMood` | no new store; numbers in code, never a label about the person |
| **Relationship with Ferni** | `relationships/{personaId}` | `trust`, `trust_profiles`, `deep_understanding` (opaque) | stage, trust, inside jokes (absorbs the inside-jokes copies) |
| **Forget and privacy** | `memory_state/forgotten` + `forgottenAt` on every record | — | every reader and the call sheet honour it; one `forgetGeneration` counter |

Ferni's own life (`persona_told`, life ledger) stays separate and is never mixed into the
person's memory.

### 2. One memory writer (reconcile, don't append)

`src/memory/writer/` is the only module allowed to write the canonical stores. Every extractor
(deep extraction, after-call summary, live tools, onboarding) proposes changes to it, and it
decides:

- **ADD**: a new person or fact.
- **UPDATE**: the same subject and attribute with a new value. The old fact gets `validTo`/`retiredAt` and `supersededBy`, and is kept and labelled `[no longer true]`. This extends `fact-supersession.ts`.
- **MERGE**: the same person under two names ("Dad" / "Doug" when the owner tied them in one request). Same rule as #2970's resolver: never merge on a shared number alone.
- **NOOP**: already known. It bumps `lastConfirmedAt`.
- **FORGET**: the owner asked. It sets `forgottenAt` and bumps `forgetGeneration`.

Reconciliation is code first: exact subject and attribute, normalised names, the
`contact-pick-v2` relation map. A cheap LLM is used only for ambiguous matches, and its decision
is logged as an id and an op, never the text. Everything is idempotent per (source, sourceId).

### 3. Consolidation: the nightly call sheet build

This is the person-model design's compute section, unchanged except for its inputs:
- It reads the **canonical** stores, falling back to the legacy member while dual-write is
  partial and recording which one in `prov.sources`.
- `unfinished` and `ferniOwes` read the **activity ledger**, not `ferni_commitments`.
- `changed` diffs against `prev` and adds superseded facts ("Dad's number changed",
  "moved to St. Pete").

When it runs:
- nightly on the pondering clock;
- after every call (code-only sections);
- after a forget, which invalidates.

### 4. The read path: the call sheet plus four lookups

**Call sheet** (person-model design §5, unchanged): one `get` at `initializeSession`, awaited for
at most 150 ms before composing "## Who You're Talking To". It renders to about a page
(≤ 3,000 characters), in this order:

1. **Open now:** ledger items that are asked, in progress, deferred or waiting on a yes, plus results not told yet.
2. **What changed since last time.**
3. **People:** up to 8, relation, last mentioned, open thread; sensitive ones only as "let them lead".
4. **What Ferni promised.**
5. **Rhythms and mood direction:** tone cues only.
6. **Leave alone:** forgotten topics are never rendered; sensitive ones are framed as "let them lead".

It ends with the existing rule: use naturally, never announce what you know.

**Lookups**: four read-only tools, replacing per-turn pushes:

| Tool | Answers | Reads | Replaces |
|---|---|---|---|
| `recallPeople` | who is X, how do I reach them, what's going on with them | entity store + facts about them | `RECALL_PEOPLE` roster push, 4 people graphs |
| `recallFacts(subject, attribute?, asOf?)` | what's true now, or was true then | facts (bi-temporal) | `dynamic-memory-context`, `world_facts` in-call push |
| `recallEpisodes(query, when?)` | what did I say about X, when did we talk about Y | summaries + turns (semantic + BM25 + time filter) | `recallFromMemory`, `recallPreviousConversation`, episode push |
| `recallActivity` | did you call / text / email X, what's still open | activity ledger | `callStatus` (#2965) folds in here; `pending-call-results` push |

Each tool:
- is owner-only and fails closed, as in #2965;
- returns at most about 600 characters;
- frames quotes as reported speech;
- marks superseded facts.

They are always in the lean tool set, as must-keep tools, so they're there on turn 1.

**Retiring the push builders.** Each per-turn builder whose content the call sheet or a lookup
now covers is turned off behind its own flag, **one at a time and measured**: recall eval and
latency, before and after. A builder stays if removing it costs recall. The safety, crisis,
humanization and conversational builders are out of scope; they aren't memory.

## Proof (what "done" means)

| Gate | Measure | Bar |
|---|---|---|
| Recall | lane 6 held-out eval (#2969), all five buckets | `recalled` ≥ 0.8 (reference reader: 0.878); invented calls = 0 |
| Knowledge updates | eval "update" bucket + superseded-fact cases | ≥ 10/11, and never states a retired fact as current |
| Abstention | eval abstention bucket | ≥ 19/21; no sweeping "I haven't done anything" |
| Paired memory bench | `scripts/memory-eval/longmem.ts --memory <frozen>`, arm `sheet` vs `off` | sign test p < 0.05 up; restraint and false-premise not down |
| Secondary | LongMemEval slice (only after a converter plays its sessions in as calls) | reported, not gated |
| Privacy | fixture: forgotten topic, disputed summary, grief thread, health fact, a third party's number | rendered sheet and every tool output: 0 forgotten, sensitive only as "let them lead", no 7-digit runs, no "@"; judge pass over 20 cohort renders = 0 unprompted sensitive |
| Latency | `markCallStage('person_model_ready')`, greeting time, reads per call start | greeting no slower; call-start reads down ≥ 30% |
| Firing | `person_model {hit|miss|stale|timeout}` log line | hit ≥ 90% of cohort calls |
| Normalisation | per kind: writers grep to one module; dead stores have 0 readers and 0 writers | grep evidence in each retirement PR |

## Lanes

Every PR:
- is ≤ ~400 reviewable lines;
- has its flag off by default and is rolled out owner-first;
- uses fictional names and 555-01xx numbers in its fixtures;
- has an independent verifier PASS on its exact head before it's armed.

Lane names are prefixed M (memory) to keep them apart from the recall ledger's lanes 0–8.

| Lane | PR(s) | Depends on | Contract |
|---|---|---|---|
| **M1 Call sheet render** | person-model PR 2: `render.ts` (≤ 3,000 chars, section order above, sensitive and forget handling, no-digits / no-@ guard) | #1894, #1898 | privacy fixture passes; mutation removing the sensitive rule goes red |
| **M2 Call sheet store + job** | person-model PR 3: `person-model-store.ts` (read, idempotent txn, rotate `prev`), `/api/jobs/person-model` (dry run), scheduler yaml, `PERSON_MODEL` flag, deploy-env line | M1 | dry run on dev returns built/skipped with reasons; a rerun writes 0 |
| **M3 Ledger into the sheet** | `unfinished` and `ferniOwes` read the activity ledger; untold results go into "open now" | M1, recall-ledger lanes 1 (#2958/#2959) and 2 | an untold call result appears on the next call's sheet, then is marked told only when spoken (lane 5 rule) |
| **M4 LLM pass** | person-model PR 4: `person_model` task (Sonnet, Gemini fallback, JSON schema, cost log); wording for mood note, people threads and `changed` | M2 | schema-invalid output falls back to code-only sections; cost logged |
| **M5 Freshness** | person-model PR 5: after-call refresh + forget bumps `forgetGeneration` | M2 | forget honoured on the very next call (test) |
| **M6 Read path** | person-model PR 6: one get at session init, `PERSON_MODEL_READ`, replace the stale profile lines, hit/miss/latency log | M1, M2 | fallback byte-identical to today when missing/stale/slow |
| **M7 Lookups** | `recallActivity` (absorbs `callStatus`), `recallPeople`, `recallFacts(asOf)`, `recallEpisodes(when)`; must-keep, owner-only | M8 for facts; ledger for activity | each tool's held-out bucket ≥ reference reader − 0.05; non-owner gets nothing |
| **M8 Bi-temporal facts** | `facts` store + types + writer ops ADD/UPDATE/NOOP/FORGET; dual-write from `dynamic_facts` and `world_facts` extractors | — | supersession keeps the old fact labelled; `asOf` query right on the eval "update" bucket |
| **M9 People canonical** | the memory writer's people ops on `entity_store`; dual-write from the 7 other people writers; one `relation` map | #2970's resolver | after a mixed-source seed, exactly one entity per person; grep shows every people writer goes through the writer |
| **M10 Open items canonical** | the remaining open-item writers (`commitments` ×3, `open_loops`, `follow_up_actions`, …) write the ledger (recall-ledger lane 2 widened) | ledger lanes 1–2 | grep: a live caller writes the ledger on each path |
| **M11 Retire push builders** | one PR per builder group, each behind its own flag, measured | M6, M7 | recall eval not down; greeting latency not up; reads per call down |
| **M12 Retire dead stores** | stop reads of empty stores (person-model PR 0); after dual-write has soaked, stop legacy writes | M8–M10 | 0 readers and 0 writers by grep; erasure and export lists updated |
| **M13 Backfill** | rebuild canonical stores from legacy for the last 90 days (recall-ledger lane 7 widened) | M8–M10 | eval on a backfilled copy ≥ fresh-seed eval |

**Order:**
1. M1, M8 and M9 now, in parallel; they touch different files.
2. Then M2, M5 and M6.
3. Then M3 and M7, once the ledger has merged.
4. Then M4.
5. M10–M13 last.

Recall-ledger lanes 3–5 and 8 continue as planned; lane 5 ("ledger-first recall") is delivered
by M3 + M7.

## Rollout

All flags start off. Each layer is turned on on dev first, then for the owner cohort in prod,
and only on Seth's word for prod:
1. the build: `PERSON_MODEL`, for a week, measured but not read;
2. the read: `PERSON_MODEL_READ`, plus the lookups;
3. retirements.

Each turn-on is a separate prod change with a rollback line.

## Risks

- **Two writers during dual-write:** the canonical store is the source of truth from day one; legacy writes are mirrors, and conflicts resolve to canonical.
- **A brief that's wrong is worse than none:** freshness and provenance per section, fallback to today's path, and the `changed` section only from code diffs.
- **Privacy regressions in a denser brief:** the privacy fixture and judge are blocking gates, and the forget generation check runs on every read.
- **Latency:** the single read is capped at 150 ms, and the old path is the fallback.
- **Scope:** this is many PRs. Each one is independently useful and flag-gated, so stopping halfway still leaves Ferni better than today.
