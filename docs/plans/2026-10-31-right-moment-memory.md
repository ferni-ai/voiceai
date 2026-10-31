# The right memory at the right moment

Date: 2026-10-31 · Status: design, decisions A1 to A5 made by the lead; open questions at the end carry defaults · Code at `origin/main` `1427f545a`

Design findings from the drafting pass (marked **accepted by lead** where they appear below): the two flags A4 needs are not cohort-capable (5.6); the card goes under `agents/multi-agent` (5.2); the person-model guard export is flagged to the person-model owner (5.4.3 and 5.4.5); edits to files at or over the 500-line limit are net zero (section 3).

Evidence: a recall trace and a set of design inputs (file and line references and flag defaults, verified at `1427f545a`) are kept in internal research notes. Every fact from them that matters is restated here.

Builds on, and must not duplicate: [`2026-10-27-memory-call-sheet.md`](2026-10-27-memory-call-sheet.md), [`2026-10-27-recall-ledger.md`](2026-10-27-recall-ledger.md), [`2026-10-29-memory-v2-retro-and-architecture.md`](2026-10-29-memory-v2-retro-and-architecture.md).

## 1. Intent and why

A friend who has known you for months walks in already knowing where you live, who matters to you, what happened this week and what is coming up. They do not recite it. They use one thing at the right moment.

Ferni does not do this today, and the 10-29 audit says why.

The table below uses a **fictional eval user, Riley Test**, who lives in the fictional town of Maplewood. Riley's people (a sister Priya, a friend Marcus, a grandma, Rose), the calls, the dates and **every number in the table are illustrative**, chosen to show the failure shape. The mechanisms, code paths and flag names are real.

| Symptom (illustrative eval user Riley Test) | Cause |
|---|---|
| Alex cannot say Riley lives in Maplewood | No canonical home fact exists. "Where do I live?" retrieves `Ferni: location = lives in Wyoming` (Ferni's own persona canon, saved as a fact about Riley's world) and `Speaker: currently in Lakeview` (a weekend trip). In this example, dozens of the newest 300 fact rows are about personas. |
| Alex does not know about the call to Grandma Rose | The outcome has no durable live reader. `buildPendingCallResultsContext` shows it once, on turn 0, and marks it delivered. A handoff persona is never on turn 0. `callStatus` exists (`CALL_STATUS_RECALL`, on in prod) but is reactive: in this example, about one memory-tool call in several hundred turns. |
| Nothing is said unprompted | Dates ride the first recall note after the caller speaks, never the hello. The one-time lookahead is 1 day, so "Grandma Rose's procedure is Thursday" is first raised on Wednesday. `DATES_THAT_MATTER` (the writer) is off, so nothing is stored anyway. |
| Per-turn retrieval finds nothing | `TURN_MEMORY` logs `candidates=0 injected=0` on every turn. The RRF score tops out at `0.6/61 = 0.0098` against a gate of `0.3`, so the gate cannot be met (`src/memory/retrieval/turn-memory-scale.ts:1-30`). The fix flag `TURN_MEMORY_RRF_SCALE` is not cohort-capable, so it was tried on all of prod on 10-30 and reverted. |
| A handoff persona sounds like it knows more than it does | `DIRECTOR_PERSONA_AWARE` is off, so `teammateRelationship` returns undefined and Alex is told the whole team's conversation history (in this example, hundreds of conversations) as his own. |
| The always-on "last time" line is blank | `lastCallerSummary` was overwritten with `''` on any call with no key points. `KEEP_LAST_SUMMARY` fixes it and has been on in prod since 10-30. |

The product answer is two things, deliberately small:

1. **A caller card**: a short, always-present block in every persona's prompt (home, people, recent calls, coming up), so no persona needs a lucky word match or a tool call to know who it is talking to.
2. **One timely thing in the hello**: at most one proactive thread per call, and a date inside three days is a candidate for it.

Plus the hygiene and flag work that makes both trustworthy: stop saving persona lines as the caller's facts, and make per-turn retrieval reachable for the owner first.

## 2. Goals, non-goals, anti-goals

### Goals
- G1. Every persona, including one that arrives by handoff, knows from its first reply: where the caller lives, up to 5 people in their life, the last 3 calls Ferni made for them in 14 days (who, how it went, when), and up to 3 dates in the next 14 days. No tool call needed.
- G2. The hello raises at most one timely thing, and a date within 3 days can be it. A date is never asked twice in one call.
- G3. Persona self-statements ("Ferni lives in Wyoming") stop entering the caller's `dynamic_facts`, and the existing persona rows stop surfacing.
- G4. "Home" and "where I am right now" are different keys, so supersession keeps the newest home.
- G5. Per-turn retrieval can be turned on for the owner alone and actually returns candidates.
- G6. Everything is behind cohort-capable, off-by-default flags and goes on for the owner first.

### Non-goals (this plan)
- No new memory store, and no new writer for people, dates or calls. The card reads what exists.
- No `PersonModel` (call sheet) read path. That is lane M6, owned by the person-model owner. See 4.3 for how the card and M6 meet.
- No flip of `ACTIVITY_LEDGER`, `MEMORY_FACTS`, a planned dual-write flag, or `PERSONA_BRIEFING_*`. Those have no producers or readers yet, or wait on `#3044`.
- Phase 2 (one timeline, promises in both directions) is design only, section 11.
- No change to what the caller can ask for or to any consent flow.

### Anti-goals (things this must never become)
- A dossier. The model never recites the card, never says "I remember that...", never lists what it knows.
- A second proactive channel. If the hello raised something, nothing else proactive happens this call from memory.
- A health, grief or money question, or the topic word. Those dates are said as presence ("thinking of your grandma, with Thursday coming up"), never "how did the procedure go?", and the caller leads.
- The callee's words, ever. Calls appear as who, outcome word and when.
- Location from an IP address as "where they live". `CALLER_CITY_CONTEXT` stays labelled "their device is in X".
- A third copy of any privacy guard. Reuse the person-model render guards (4.3).

## 3. Constraints

From `AGENTS.md`, applied here:
- Flag-off PRs of 400 reviewable lines or fewer; one concern per PR; fixtures fictional (names made up, numbers 555-01xx); both flag states tested; each new test seen to fail with the behaviour broken, said in the PR.
- Clean architecture per context; callers import a context's `index.ts`; `pnpm quality:arch` and `pnpm quality:knip` gate. A PR that adds an unused export fails knip, so every PR below lands with its first reader. No types-only PRs.
- Files over 500 lines may not grow. In this plan: `agent-setup.ts` is 2,363 lines, `deep-extraction-worker.ts` 817, `on-behalf-call-orchestrator.ts` 902. Each edit there must be net zero or negative (move the block out, call the new module). *(Accepted by lead.)* `greeting-direction.ts` is 477 and `memory-recall-hook.ts` is 498, so new logic goes in new modules and the edit is a few lines; if a file would cross 500, move something out in the same PR.
- Voice text rules: a direction that tells the model what to say needs a written example in commas and full stops. No em dashes, ellipses or stage directions. No AI-disclosure prompt changes.
- Classifiers on user text match whole words.
- Cohort flags are written into `process.env` at call start, and are only safe while one call runs per process (`AGENT_MAX_JOBS_PER_WORKER` unset or 1, as prod is). After-call work that runs when the next caller has started must read flags with `envForCaller` (`cohort-flags.ts`). Cohorts are live in prod (`RECALL_VECTOR_INDEX` is on for a small cohort).
- Memory (`src/memory`) is L3 and may not import `services` or `intelligence`. The card needs calls (`services/outreach`, L4) and dates (`intelligence/world-model`, L3 understanding), so it lives in L4 under `src/agents/multi-agent/`. *(Accepted by lead.)*
- Deploys: take the prod claim before any prod `lk agent` change; deploy only commits on `origin/main`; never update secrets on dev with a room open.

## 4. Decisions already made (not reopened here)

**A1. Stop the persona leak.**
- Filter persona self-statements at `sanitizeExtractionResult` using `junkReason`.
- Skip persona-subject facts in `loadRecallSnapshot`.
- Make `home` and `current location` explicit keys in the extraction prompt.

**A2. `CALLER_CARD` cohort flag.**
- A card is built once per call and rendered into the `## Who You're Talking To` block for every persona, including after a handoff, under a 400 ms budget.
- Content: home place; up to 5 people; the last 3 on-behalf calls in 14 days with status and when, never the callee's words; up to 3 dates in the next 14 days.
- Reuse the person-model render privacy guards.
- Coordinate with the person-model owner (lanes M2, M6, M7, M8b). A thin sibling module is the default unless the person-model owner agrees to add `place` and `recentCalls` to `PersonModel`.

**A3. One timely thing in the hello.**
- Add a `dateFor` candidate in the greeting race with the one-thread arbiter.
- `ONCE_AHEAD_DAYS` 1 to 3. Call-news `MAX_AGE_HOURS` 48 to 168.
- Use the opener claim so the date is never asked twice.
- Health dates are said as presence, not a question: let them lead.
- At most one proactive thing per call.

**A4. Owner-cohort flag flips (no code, except making two flags cohort-capable, see 6.4):** `DATES_THAT_MATTER`, `DIRECTOR_PERSONA_AWARE`, `CALL_NEWS_OPENER`, and `CALL_REPORT_REACHES_YOU` after re-checking `#3080`. **`CALL_REPORT_REACHES_YOU` waits:** it is not cohort-capable until the crisis-lane PR fixes its result-capture reads (`unified-result-capture.ts:505,581`, see the A5-1 note in 5.6), so its owner flip waits on that PR.

**A5. Per-turn retrieval.** Add `TURN_MEMORY_RRF_SCALE` and `TURN_MEMORY_RERANK` to `COHORT_FLAGS` with the pinned test list. Root cause it fixes: without RRF scaling the gate is unreachable. Enable for the owner first. The 10-30 prod no-response incident was investigated and ruled out as caused by RRF (the STT returned no words).

**Phase 2, design only:** the one timeline (activity ledger as the single writer), and promises in both directions. Section 11.

## Builder-check rulings (lead, 2026-10-31)

The builder checks came back; these rulings override anything earlier in this document and are applied in the sections they touch.

1. **Sensitive hello wording.** Never say the topic word. If a relation or person can be extracted from the label (lexicon: mom, dad, mother, father, sister, brother, wife, husband, partner, son, daughter, grandma, grandpa, friend, plus a name), say "thinking of your <person>, with <day> coming up". Otherwise say "thinking of you, with <day> coming up". **Sensitivity = `isSensitiveThread` OR a health lexicon** (surgery, procedure, appointment, biopsy, scan, chemo, therapy, hospital, test results, and the like). **When unsure, treat it as sensitive.** (5.5)
2. **The card omits Coming up until `DATES_IN_HELLO` is on.** The two flags are coupled. (5.4.2, section 6)
3. **`dateFor` is side-effect free.** The pick is split from the mark: only the winner calls `markFactRaised` and `claimOpenerFollowUp`. (5.5)
4. **At handoff, re-read forgotten topics asynchronously**, in parallel with persona setup and inside the 400 ms budget. On timeout, drop People and Coming up (fail safe) and log a count. (5.4.1, O11)
5. **No card for a minor** (`MINOR_CARE`). The owner's card is never rendered on an outbound `onbehalf:` session, to the callee. (5.4.1, section 8, O9)
6. **`isPersonaSubject` hides a fact only when its subject is a persona name AND there is no stored relationship.** A counter is logged. The tradeoff is accepted: better to miss a fact than to attribute persona canon to the user. (5.3)
7. **Bars:** the first PR measures the baselines on dev, and the targets are adjusted after that measurement. (9.3, section 11)
8. **Only A2-1 waits on the person-model owner.** The other PRs proceed. (5.4.5, section 11)

## 5. Architecture

### 5.1 What is in a prompt today (so the insertion points are exact)

Layer 1 is the system prompt, rebuilt per persona (a handoff runs it again for the incoming persona). Layer 2 is a recall note added per caller transcript.

- Layer 1, `setupPersonaAgent`, `src/agents/multi-agent/agent-setup.ts`: date and time (`:358-369`), device city (`:368`), then `## Who You're Talking To` (`:494`) built from `userProfile`: name, conversation count, relationship stage, `lastCallerSummary`, last mood, up to 2 life events, top goal and concern. Nothing about place, people, calls or dates. `profile.lifeEvents/goals/primaryConcerns` have no live writer.
- Layer 2, `createMemoryRecall`, `src/agents/multi-agent/memory-recall-hook.ts`, created per persona (`agent-setup.ts:1600`, members only): a snapshot of the newest 300 `dynamic_facts` plus summaries and threads, loaded asynchronously. `noteFor(transcript)` returns null until the snapshot has loaded, so after a handoff the first reply can carry no note. Limits: 4 facts a turn, 2 per entity, about 150 tokens. `RECALL_RULE` says at most one memory, and never health, pregnancy, money or relationships unless the caller raises them. Each persona builds its own instance, so each handoff re-offers first-note items.
- The hello is directed in `directedGreeting` (`src/agents/multi-agent/greeting-direction.ts`), which races candidates (`checkInFor`, `winFor`, `ponderFor`, `loadWelcomeBack`, `anniversaryFor`, `firstMeeting`, letter, `callNewsFor`) in one `Promise.all` and then picks one thread: why they called, then call news, letter, win, check-in, pondered ask; welcome-back and anniversary alongside.

Layer 1 is the right home for the card: it is awaited, rebuilt per persona, and does not wait for the recall snapshot.

### 5.2 Context placement

```
src/memory/                      L3 memory   - persona-subject rule (entity-hygiene.ts), recall snapshot filter,
                                               extraction prompt keys. Pure rule + existing adapters.
src/agents/multi-agent/caller-card/    L4        - the card (new folder, section 5.4)
src/agents/multi-agent/greeting-date.ts L4       - dateFor candidate (new, sibling of call-news-opener.ts)
src/intelligence/world-model/dates/    L3 understanding - date rules (lookahead, wording), unchanged home
src/services/platform/cohort-flags.ts  L4        - cohort-capable list
src/config/flags/*.ts                  flag specs (pnpm flags:new)
```

### 5.3 A1: stop the persona leak (about 200 lines over two PRs)

Write side. `sanitizeExtractionResult` (`src/memory/dynamic/extraction-vector-docs.ts:232-277`) checks only shape and credentials. Both fact writers, `deep-extraction-worker.ts` and `fact-sweep.ts` (`FACT_SWEEP`), go through `buildExtractionFirestoreWritePayloads` and then this function, so it is the single chokepoint.

- Add `isPersonaSubject(name, relationship?)` to `src/memory/entity-hygiene.ts`, exported through `src/memory/index.ts`. It wraps `junkReason({ name, type: 'person', relationship }) === 'persona'` and returns true only when no relationship is supplied (ruling 6), so no caller compares reason strings, and there is one definition of "a persona".
- In `sanitizeExtractionResult`, drop a fact whose `entityName` is a persona subject, and drop the matching entity row. Count drops by reason in the existing dropped-counter log (ids and counts only).
- **The rule (ruling 6): a fact is hidden only when its subject is a persona name AND there is no stored relationship.** A persona name is what `junkReason` calls `persona` (a Ferni word, or a bare teammate name). A "stored relationship" is, on write, an entity row in the same extraction result whose `attributes.relationship` ties the name to the speaker, and on read, the relationship stored on the row. So "Alex, my brother" is kept and "Ferni lives in Wyoming" is not. Edge cases resolve toward hiding: if the relationship cannot be established, the fact is hidden. **Accepted tradeoff:** it is better to miss a fact (a friend who shares a teammate's first name and was extracted without a relationship) than to attribute persona canon to the user. A counter is logged for every hide (`PERSONA_FACT_DROPPED` on write, `PERSONA_FACT_HIDDEN` on read, with `reason`), so the cost of the tradeoff is visible.
- Gate: the existing `ENTITY_HYGIENE` (on in prod) via `entityHygieneOn`. No new flag: this is a bug fix inside the rule that flag already names, and its kill switch exists. Dropped data is persona canon, which lives in the life ledger (`src/agents/personas/life-ledger.ts`), not in the caller's facts.

Read side. `loadRecallSnapshot` (`src/memory/recall/session-recall.ts`, about `:365-395`) filters confidence and forgotten rows. Add the same `isPersonaSubject` skip, using the stored `entityName` (and the stored relationship if the row has one). This makes existing persona rows stop surfacing without a data migration. No deletion in this plan (open question O3).

Prompt keys. `FACT_EXTRACTION_PROMPT` (`deep-extraction-worker.ts:115`) gets two lines:
- where the speaker lives: key `home`, entity `User`, value a place name (city or neighbourhood, never a street address);
- where the speaker is right now: key `current location`.
`FACT_SUPERSESSION` (on) then supersedes by key, so the newest `home` wins and `current location` no longer displaces it. The worker is 817 lines and may not grow: move the prompt constants (`:100-160`) into a new `deep-extraction-prompts.ts` as a pure move (moves do not count toward the 400) and make the two-line edit there. Gate the prompt change with `CALLER_CARD` read through `envForCaller` (after-call work), so `home` rows only start appearing for the cohort that benefits.

### 5.4 A2: the caller card (about 900 lines over four PRs)

```
src/agents/multi-agent/caller-card/
  index.ts          public API: getCallerCard(), renderCallerCard(), types
  types.ts          CallerCard and its sections (data shapes, section 7)
  ports.ts          HomeReader, PeopleReader, RecentCallsReader, UpcomingDatesReader, ForgottenTopicsReader
  place.ts          pure: home precedence and sanitising
  select.ts         pure: pick up to 5 people, 3 calls, 3 dates
  render.ts         pure: card -> prompt lines, privacy guards applied here, in code
  load.ts           use case: build once per session, per-section timeout, single flight, cache
  wiring.ts         composes the production readers (existing exported readers; no new Firestore code except 5.4.2)
  CLAUDE.md         short, updated by every PR that changes the card
```

#### 5.4.1 Build once per call, render per persona
- `getCallerCard(sessionId, userId)` returns a promise cached by `sessionId` (single flight). The first persona's setup starts it; a handoff persona's setup gets the same promise, so a handoff costs no extra reads and Alex sees exactly what Ferni saw.
- Budget: 400 ms for the whole build (the same shape as `inTime` in `greeting-direction.ts`). Sections load in parallel with their own timeouts; a section that misses is omitted, never partial or stale. If nothing arrives in time the block is simply absent and the log says `budget_hit`.
- The cache holds **structured sections**, and `renderCallerCard(card, { now, forgottenTopics })` runs at every persona setup. Cache entries are dropped at session end.
- **Forgotten topics are re-read at every handoff (ruling 4).** A forget that happens mid-call must hold for the incoming persona. At a handoff the setup starts an asynchronous read of `memory_state/forgotten` in parallel with the rest of persona setup, inside the same 400 ms budget, and renders when it lands. If it has not landed in time, the render **drops People and Coming up** (the sections that can name a forgotten person or event) and renders Home and Recent calls only, and logs a count (`CALLER_CARD forgotten_timeout`). Fail safe: no guess about what was forgotten.
- Members only. `isMemberIdentity(userId)` and not `isUnverifiedUserId`; an `onbehalf:`, `anon:`, `phone:` or `device:` id gets no card. Unknown callers get none.
- **No card for a minor (ruling 5).** An account under `MINOR_CARE` gets no card, using the same minor-care predicate the outbound dial uses (`minor-care-shared-hold.ts`, `first-dial-opt-out.ts`; the builder greps for the exported check, UNCONFIRMED name). **Never on an outbound `onbehalf:` session:** that session talks to the callee, and the owner's card must not reach it. A test builds a session with an `onbehalf:` id and asserts no card text in its prompt.

#### 5.4.2 Sections and sources (precedence in code, in `place.ts` and `select.ts`)

| Section | Source, in order | Limit | Notes |
|---|---|---|---|
| Home | `preferences.homeLocation` (`src/tools/domains/information/preferences/storage.ts:331,354`, already read with a 400 ms timeout by `weather-location.ts:69`); then `profile.location` when `source` is `browser-gps` or `manual` (`src/types/user-profile.ts:661`); then the newest non-superseded `dynamic_facts` row `User|home`; else omitted | one place | City or area only: a value containing a digit or matching `hasContactData` is rejected (no street addresses, no ZIP). The device city stays "their device is in X" and never feeds Home. The `User|home` read is one narrow query next to the existing `dynamic_facts` accessor in `recall-firestore-store.ts` (new sibling file if that file would cross 500 lines). |
| People | root `familyMembers` plus the `RECALL_PEOPLE` roster builder (`src/memory/recall/people.ts`, today only run at the first note after the caller speaks, `world.whoIsWho`) | 5 | Name and a relation the caller stated clearly; never guessed. Ordered by recent mention. A sensitive person renders as "they may bring up X; let them lead". |
| Recent calls | `firestoreCallRecords` and `recallLine` from `src/services/outreach/call-recall.ts` and `call-status.ts` (30 days of `on_behalf_calls` plus `deferred_calls`, whatever `delivered` says) | 3 within 14 days | Who, a closed status word, when. Never the callee's words, never the purpose text. |
| Coming up | world-fact events (`dateFor` rules in `dates/recall.ts`) and due follow-throughs inside 14 days, the same definition as the call sheet's `unfinished.upcomingDates` | 3 | **Loaded and rendered only while `DATES_IN_HELLO` is on (ruling 2).** Without it the card would list dates the hello never raises and the recall note still would. Sensitive items render as "something may be on their mind around Thursday; let them lead", never the topic (same `sensitiveDate` rule as the hello). |

#### 5.4.3 Rendering and privacy guards (in code, not in the prompt)

`renderPersonModel` (`src/intelligence/person-model/render.ts`) already enforces the rules this card needs, but its helpers are file-private and only `hasContactData` is exported from `person-model/index.ts`. The card must not copy them. PR A2-1 makes one additive change *(accepted by lead; the lead flags it to the person-model owner before A2-1)*: export the line-level guard (markup stripping `oneLine`, plus a `lineIsSafe(text, { forgottenTopics })` that combines `isForgotten`, `isSensitiveThread` and `hasContactData`) from `src/intelligence/person-model/index.ts`, and the card imports it. `render.ts` itself changes only to use the exported function in place of its private copy.

Guards the card applies, each with an adversarial test:
- forgotten topics (`memory_state/forgotten`, as recall does) drop the line;
- sensitive (grief, health, money) never renders as an item;
- a line with a run of 7 or more digits, or an `@`, is stripped (full-width digits, en-dashes, "at" and "dot" variants were the review findings on `#2975`; test them here too);
- markup, emoji and a leading `#` are stripped;
- the whole card is capped at 1,200 characters; the lowest-priority section drops whole, never mid-line (order: Coming up, Recent calls, People, Home).

Rendered shape (inside `## Who You're Talking To`, after the existing name and stage lines). The example is the fictional eval user Riley Test; names, places and days are made up:

```
What you know about them (private; never read it out):
- Home: Maplewood.
- People: Priya (sister), Marcus (friend). Their grandma Rose: they may bring up how she is; let them lead.
- Calls you made for them: Grandma Rose, Tuesday, she picked up. The vet, yesterday, no answer.
- Coming up: Thursday, something may be on their mind; let them lead.
Use this like a friend would. Do not raise any of it unless they do or your hello already did.
```

The last line is the single-proactive-thing rule for the model; the code-side enforcement is the opener claim (5.5).

#### 5.4.4 Wiring into `agent-setup.ts`
Net line count must not rise. The existing "Who You're Talking To" assembly (around `:494`) moves into `caller-card/` as a function that takes the profile and the rendered card and returns the block, and `agent-setup.ts` calls it. The card promise is started at the first `setupPersonaAgent` of the session and awaited with the 400 ms budget; flag off returns the old block byte for byte (tested).

#### 5.4.5 Working with the person-model owner (gates PR A2-1 only; ruling 8)
The person-model owner holds lanes M2 (call-sheet store and job, `PERSON_MODEL` off), M6 (read path) and M7/M8b. `PersonModel` has no `place` or `recentCalls` section (`types.ts:92-111`) and its renderer has no caller yet. M6 will inject a call sheet into the same prompt.

Default, stated plainly: **the card is a thin sibling module (above) unless the person-model owner agrees to add `place` and `recentCalls` sections to `PersonModel` (`types.ts`, `build.ts`, `render.ts`).** The lead sends them this before A2-1: what the card needs, the port shapes in 5.4 (`PeopleReader`, `UpcomingDatesReader`), and the question. Either answer works:
- If they agree to add the sections, the card shrinks to injection, the cache and the 400 ms budget, and its loaders become M6's.
- If not, the card ships as above. When M6 lands, there is one rule: while `PERSON_MODEL` is on and M6 supplies People and Coming up, the card omits those two sections (the card's `PeopleReader` and `UpcomingDatesReader` get M6 adapters), so the prompt never carries two people lists. That rule is a test in the M6 PR, owned by whoever lands second.
- The card never edits `person-model/` beyond the one additive export in A2-1, which the lead tells the person-model owner about in advance.

### 5.5 A3: one timely thing in the hello (about 300 lines over two PRs)

New module `src/agents/multi-agent/greeting-date.ts`, a sibling of `call-news-opener.ts`, exporting `dateFor({ userId, sessionId, zone })`. It returns `{ direction, careful, factId, commit }` or undefined. `greeting-direction.ts` (477 lines) gains only the race entry and a few arbiter lines.

- **Candidate**: the one best due date from `dueDate` (`src/intelligence/world-model/dates/recall.ts`), i.e. a one-time event from up to 10 days past to `ONCE_AHEAD_DAYS` (now 3) ahead, or a yearly event within 7 days; quiet for `QUIET_DAYS` (20) after it was raised. `ONCE_AHEAD_DAYS` becomes a function of the flag (3 with `DATES_IN_HELLO` on, 1 off) so existing behaviour is exactly preserved when off.
- **In the race**: one more entry in the `Promise.all` at `greeting-direction.ts:347`, wrapped in `inTime` (400 ms).
- **In the arbiter**: it joins `first` (the group of "one thread decides the call"): why they called, then call news, then letter, then **date**, then win, check-in, pondered ask. A date that wins suppresses win, check-in, pondered ask and welcome-back for this call (they wait for a later call, as a letter does today). A sensitive date sets `tender` and suppresses the anniversary party, the way call news with `careful` does. Unknown callers and a caller who gave their own reason for calling never get a date.
- **Wording**: two directions, each with a written example in commas and full stops.
  - Ordinary date: "There is something on their calendar soon: you may say hello, then mention it once and let them take it where they want, naming it in their words (\"Hey Riley. Priya's visit is Saturday, isn't it. Looking forward to it?\"). Not a report."
  - Sensitive date: presence, no question, never the topic word (ruling 1). The person comes from the label when the relation lexicon finds one (the ruling 1 lexicon, followed by a name where there is one): \"Hey Riley. Thinking of your grandma, with Thursday coming up.\" With no person in the label: \"Hey Riley. Thinking of you, with Thursday coming up.\" The line never ends in a question, and the caller leads.
  - **What counts as sensitive** (`sensitiveDate(label)`, pure, in `dates/`): `isSensitiveThread(label)` OR a health lexicon (surgery, procedure, appointment, biopsy, scan, chemo, therapy, hospital, test results, and the like; whole-word matching). When unsure (an unclassifiable label, an empty label, a lexicon edge), treat it as sensitive. A false "sensitive" costs a plainer hello; a false "ordinary" asks a question about someone's surgery.
  `formatDueDate` in `dates/recall.ts` today tells the model to ask "warmly, briefly" with no sensitivity check beyond forgotten and avoid threads; the sensitive branch above replaces that for sensitive items in both the hello and the recall note.
- **Pick, then mark (ruling 3).** `dateFor` is side-effect free: it returns the candidate and a `commit()` closure, and writes nothing. Only the arbiter's winner calls `commit()`, which does `markFactRaised` and `claimOpenerFollowUp`. A date that loses the arbiter to call news, a letter or the caller's own reason is neither marked raised nor claimed, so it can still be offered on a later call. Today's `callNewsFor` and `winFor` mark inside the race (`void markWinSurfaced` fires on `win` before the later suppression checks); the new candidate must not copy that. Test: every losing pairing leaves the fact unraised and the claim empty.
- **Never twice**: when the hello takes the date, the winner's `commit()` calls `markFactRaised` (so `dueDate` will not return it for `QUIET_DAYS`) and `claimOpenerFollowUp(userId, 'greeting-date')` (`src/memory/recall/opener-claim.ts`; extend `OpenerAsker` with that value). The recall hook already calls `takeOpenerClaim` once, with the call's first note. Extend it so that any greeting claim suppresses, in that first note: the open-thread line, the week line **and the date note** (`memory-recall-hook.ts:398`, today gated only on `followUpsOffered || checkIn`).
- **At most one proactive thing per call**: with `DATES_IN_HELLO` on, the recall note's own date line is suppressed always, not only after a claim, so the hello is the only channel that raises a date. If another thread won the hello, the date waits for a later call (it can still be in the window; a passed one-time event is dropped after 10 days). This costs an occasional missed date and buys the rule "one thing". The card's Coming up lines carry the private-notes rule from 5.4.3, so the model does not raise them either.
- `memory-recall-hook.ts` is 498 lines: the suppression is a couple of lines; if the file would reach 500, move `noteWith`'s date and thread blocks into the existing recall module first, in the same PR.
- **Call news window**: `MAX_AGE_HOURS` in `call-news-opener.ts:55` goes from 48 to 168 so a call from last week can lead the hello. Only affects callers with `CALL_NEWS_OPENER` on.
- **A3-1 note (2026-10-31), as built:** "unclassifiable" means the label names no ordinary event noun (a visit, a party, an interview and the like), whatever its length, so "Rose, 10am at St. Mary's" is sensitive. The candidate also covers today and a date just passed (the recall note no longer raises dates with the flag on), with directions in the same shape as the "soon" one; a sensitive one is "thinking of <who> today" or "this week". The date waits on a same-day return, as a win and a check-in do, and needs a verified member (no `phone:`, `device:` or `anon:` id). The winner commits only when the director's own line is spoken. `formatDueDate`'s sensitive wording is gated on `DATES_IN_HELLO` so flag off stays byte-identical; with the flag on the recall note carries no date line, so that wording is a backstop only.
- **Flag**: `DATES_IN_HELLO` (new, off by default, cohort-capable, owner `memory`, needs `DATES_THAT_MATTER` and `WORLD_MODEL_TEMPORAL` on; add to `COHORT_FLAG_NEEDS`). It controls the candidate, the 3-day lookahead and the recall-note suppression. `DATES_THAT_MATTER` stays the writer flag from A4.

### 5.6 A4 and A5: flags (about 120 lines, one PR)

`CALL_NEWS_OPENER` and `CALL_REPORT_REACHES_YOU` are not in `COHORT_FLAGS` today (the design inputs listed A4 as "no code"; this is the one code step it needs). `DATES_THAT_MATTER` and `DIRECTOR_PERSONA_AWARE` already are. *(Accepted by lead: the change is folded into the A5 PR.)* One PR, "make the memory flags cohort-capable":
- Add `CALL_NEWS_OPENER`, `CALL_REPORT_REACHES_YOU`, `TURN_MEMORY_RRF_SCALE`, `TURN_MEMORY_RERANK`, `CALLER_CARD` and `DATES_IN_HELLO` to `COHORT_FLAGS` in `src/services/platform/cohort-flags.ts`, and to the pinned list in `src/services/platform/__tests__/cohort-flags-list.test.ts`. Add the needs in `COHORT_FLAG_NEEDS` (`TURN_MEMORY_RERANK` needs `TURN_MEMORY_RRF_SCALE`; `DATES_IN_HELLO` needs `DATES_THAT_MATTER` and `WORLD_MODEL_TEMPORAL`, as in section 6).
- For each flag, check every read site reads `process.env` at call time and not once at module load (`docs/runbooks/cohort-rollout.md`). Known sites: `turn-memory-retrieval.ts:302,320`, `turn-memory-rerank.ts:92`, `hybrid-search-timeout-stats.ts:74`. A flag read into a module constant would silently not apply for a cohort. Each site gets a test that sets the env after import and sees the effect.
- `TURN_MEMORY_RERANK` does nothing unless `TURN_MEMORY_RERANK_TIMEOUT_MS > 0` (`turn-memory-rerank.ts:78`). That is an env value, not a flag, so it cannot be cohort-set: it is set agent-wide, inert while the flag is off. Default to turn RERANK on only after the latency receipts (section 10) show headroom.
- `CALL_NEWS_OPENER` is owner-only by design (the owner, alone on their own line). `CALL_REPORT_REACHES_YOU` (`#3080`, merged `c1023e93bb`) took five or more verify rounds on its crisis interaction: before arming it for anyone, re-read the independent verifier's PASS comment on the head that merged and confirm the crisis behaviour it names, in the PR that flips it.
- **A5-1 note (2026-10-31):** `CALL_REPORT_REACHES_YOU` is NOT made cohort-capable in A5-1. Its result-capture reads (`unified-result-capture.ts:505,581`) run outside the call; a separate crisis-lane PR reads the person's flag with a timeout and, on failure or timeout, notes it ui-only and never marks it delivered.

## 6. Flags

All off by default. All cohort-capable after the 5.6 PR, except `CALL_REPORT_REACHES_YOU` (row below). Resolution order, per the runbook: the owner's cohort, then `friends-and-family`, then `beta-waitlist-2026-10`, then the agent default last.

| Flag | New? | Controls | Needs | Read where |
|---|---|---|---|---|
| `CALLER_CARD` | new | the card in every persona's prompt; the `home` and `current location` extraction keys. Its Coming up section also needs `DATES_IN_HELLO` (ruling 2). | none (Coming up: `DATES_IN_HELLO`, checked in code) | call start (`agent-setup.ts`); after-call extraction via `envForCaller` |
| `DATES_IN_HELLO` | new | the `dateFor` candidate, 3-day lookahead, recall-note date suppression | `DATES_THAT_MATTER`, `WORLD_MODEL_TEMPORAL` | greeting build; recall hook |
| `DATES_THAT_MATTER` | existing, cohort-capable | the world-fact dates writer (`dates/after-call.ts`) | none | after-call (`envForCaller`) |
| `DIRECTOR_PERSONA_AWARE` | existing, cohort-capable | stops a handoff persona being told the team's history as its own | none | `teammate-relationship.ts:59` |
| `CALL_NEWS_OPENER` | existing, made cohort-capable | call news leads the hello | none | greeting build |
| `CALL_REPORT_REACHES_YOU` | existing, NOT cohort-capable yet (its result-capture reads run outside the call; separate crisis-lane PR) | "While they were away" block on the first 3 caller turns | none | turn context (`call-report.ts:75`) |
| `TURN_MEMORY_RRF_SCALE` | existing, made cohort-capable | RRF score rescale so the gate is reachable | none | per turn (`turn-memory-retrieval.ts`) |
| `TURN_MEMORY_RERANK` | existing, made cohort-capable | model rerank of candidates | `TURN_MEMORY_RRF_SCALE`, `TURN_MEMORY_RERANK_TIMEOUT_MS > 0` | per turn |
| `ENTITY_HYGIENE` | existing (on in prod) | the persona-subject filter on write and read | none | extraction; recall snapshot |

Removal: when a flag's rollout is done (on for everyone, soak passed), the PR that turns it on in prod defaults deletes the flag file and the `COHORT_FLAGS` entry. A flag is not left on forever.

## 7. Data shapes

No new Firestore collection. The card is in memory for the length of the call.

```ts
// src/agents/multi-agent/caller-card/types.ts
export interface CallerCard {
  v: 1;
  userId: string;                 // never logged
  builtAt: string;                // ISO
  forgetGeneration: number;       // the live counter at build; re-render, not re-read, when it moves
  home: Section<{ place: string; source: 'preferences' | 'profile' | 'fact' }> | null;
  people: Section<CardPerson[]> | null;       // <= 5
  recentCalls: Section<CardCall[]> | null;    // <= 3, within 14 days
  comingUp: Section<CardDate[]> | null;       // <= 3, next 14 days
  budgetHit: boolean;
}
interface Section<T> { value: T; loadedMs: number }   // same role as person-model's Section<T> ({ value, prov }); M6 maps between them
export interface CardPerson { name: string; relation: string | null; lastMentioned: string | null; sensitive: boolean }
export interface CardCall {
  who: string;                    // contact's name as the owner knows them
  status: 'answered' | 'voicemail' | 'no_answer' | 'declined' | 'scheduled' | 'failed';   // closed enum, mapped from call-status.ts
  at: string;                     // ISO
}
export interface CardDate { on: string /* YYYY-MM-DD, caller's zone */; label: string; sensitive: boolean; factId: string }
```

Extraction keys (existing `dynamic_facts` shape, no schema change): `entityName: "User"`, `key: "home"` or `"current location"`, `value`: a place name. `home` supersedes `home` (by `FACT_SUPERSESSION`); `current location` never supersedes `home`.

`ExtractedFact` after the filter never has a persona subject (tested on the output of `sanitizeExtractionResult`).

Log shape (ids and counts only): `{ event: 'CALLER_CARD built', ms, budgetHit, sections: { home, people, recentCalls, comingUp }, source: 'preferences'|'profile'|'fact'|null }`; `{ event: 'GREETING_DATE', outcome: 'raised'|'lost_to_<thread>'|'none', sensitive }`; `{ event: 'PERSONA_FACT_DROPPED', reason, count }`.

## 8. Privacy and safety rules

Enforced in code with tests, not left to the prompt:
1. Members only. No card for `onbehalf:`, `anon:`, `phone:`, `device:` ids, unknown callers or minors (`MINOR_CARE`). The on-behalf session never sees the owner's card (the ledger design keeps it blind to owner data).
2. The callee's words never appear. Calls are who, a status word from a closed enum, and when. Not the purpose text, not the outcome text (most third-person crisis phrasings slipped the lexical screens in the `#3084` verify, so we do not rely on screening free text here).
3. Contact data never appears: no run of 7 or more digits, no `@`, no street address in Home (any digit rejects the value).
4. Forgotten topics drop lines, at every render (a forget mid-call holds across a handoff).
5. Sensitive content (health, grief, money) is "let them lead" in the card and presence-not-question in the hello ("thinking of your <person>, with <day> coming up"). A sensitive date never carries the topic word, and an unclassifiable date is treated as sensitive.
6. One proactive thing per call, enforced by the opener claim plus the recall-note suppression, not by asking the model nicely.
7. Home comes from stated or precise sources only. IP city is never "where they live". If the sources disagree, the precedence in 5.4.2 decides and the card shows one place.
8. Crisis: the card is background context and does not change crisis handling. A crisis read on the call still wins the hello (it sits in "why they called"/risk gating before this candidate). The date candidate yields to crisis risk the same way call news does.
9. Logs: ids and counts. No names, places, dates or fact text.
10. Right-to-erase and export: no new store. The card reads stores that are already in `ERASED_STORES` and the export; the in-memory cache dies with the call.

Verification note for builders (from the 10-29 retro): privacy guards fail on adversarial inputs the builder never wrote. The independent verifier writes its own held-out cases for guards 2 to 5 (full-width digits, en-dashes, "at/dot" forms, a sensitive word in a person's relation field, a persona name used as a caller's friend).

## 9. Testing and evals

### 9.1 Unit and integration (per PR)
- Every behaviour has a test that fails when the behaviour is missing; no `>= 0` or `true` asserts. State in each PR which line was broken to see it fail.
- Both flag states: flag off returns today's output byte for byte (prompt block, greeting direction, recall note).
- A1: persona-subject fact dropped on write; caller friend named like a teammate kept when the result has a relationship row; read side skips the persona rows from the section 1 example; prompt keys present; `fact-sweep` path covered; `ENTITY_HYGIENE=off` leaves everything as before.
- A2: precedence order of Home (each source alone, and each beating the next); digits rejected; single flight (two persona setups, one build, via a counting fake port); budget (a port that never resolves leaves the other sections and sets `budgetHit`); handoff reuses the card; a forget between two setups removes the line; render guards with adversarial inputs; character cap drops whole sections in priority order; `onbehalf:` id gets nothing; a `MINOR_CARE` account gets nothing; a forgotten-topics read that misses the budget drops People and Coming up and logs a count; Coming up is absent with `DATES_IN_HELLO` off.
- A3: arbiter table-test over every pair of threads (date vs news, letter, win, check-in, pondered ask, welcome-back, anniversary, why-they-called); sensitive date: direction contains no question and no topic word, names the person only when the relation lexicon finds one, and an unclassifiable label is treated as sensitive; `dateFor` leaves no trace when it loses (fact not raised, claim empty); the date is raised once across hello plus first recall note (an integration test drives both); lookahead 2 days out is raised with the flag on and silent with it off.
- A5: each cohort-capable flag is read at call time (set env after module import, observe effect).

### 9.2 Live evals on dev (skill `voice-eval`, `scripts/voice-eval/`, `scripts/memory-eval/`)
Seed the fictional eval user Riley Test (made-up names, 555-01xx numbers) through the eval user tooling (`scripts/voice-eval/eval-users.ts`, `EVAL_SEED`), with: a `home` fact (Maplewood), 4 people (Priya, Marcus, Grandma Rose, and one more made-up name), 3 on-behalf call records, one date at +2 days (ordinary, "Priya's visit") and one at +2 days (health, "Grandma Rose's procedure").

New scenarios under `scripts/voice-eval/scenarios/` (final names by the builder):
- `card-handoff`: Ferni to Alex, then to Maya. Caller asks "where do I live?", "did you call my grandma?", "who's Priya?". Pass: every persona answers all three correctly with no tool call.
- `hello-date-ordinary` and `hello-date-sensitive`: the hello raises it once; the sensitive one is presence with no question mark and no topic word; the first recall note does not raise it again; the model does not raise the other card dates.
- `persona-fact-leak`: caller says "Ferni lives in Wyoming, right?" and similar. Pass: zero `dynamic_facts` rows with a persona subject afterwards (query Firestore `ferni-dev`).
- `recall-held-out`: 20 questions about the seeded life, written by someone other than the builder, run for three personas. Reuse the lane 6 held-out recall harness (`#2969`; main scored zero on "what did Ferni do").

Run each scenario at least twice; one call is an anecdote. Read the transcripts as well as the scores. Include the handoff grounding check (`handoff-grounding.mjs`): a handoff persona must not claim a reason the caller never gave.

### 9.3 Measures

**Baselines first (ruling 7).** The bars below are provisional. The first PR to land (A5-1, section 11) measures the baselines on dev with today's `main`: card-covered recall on the held-out set, hello-date behaviour, `candidates=0` rate, persona rows per owner call, first-token latency p50, and `TURN_MEMORY` bench numbers. It records them in its description and in a table appended to this document. The targets in the right-hand column are then adjusted against those numbers in a follow-up edit to this document before any rollout step uses them.

| Measure | How | Bar (defaults, set before the run) |
|---|---|---|
| Card recall on the held-out set | `recall-held-out`, three personas | at least 0.85 on card-covered questions; baseline main is 0 on call questions |
| Date asked twice in a call | `GREETING_DATE` plus the recall-note log, per call | 0 in all dev runs and all owner prod calls |
| Sensitive date said as a question | transcript check on `hello-date-sensitive`, n at least 10 | 0 |
| Persona-subject fact rows | Firestore count after the leak scenario; weekly count of new rows for the owner | 0 new |
| Card build time | `CALLER_CARD built` `ms`, p50 and p95 | p95 at most 400 ms (the budget); `budgetHit` under 5% of calls |
| First-token latency | `TURN_RECEIPT` (Cloud Logging), cohort on vs off, same hour | no worse than +50 ms p50 |
| `TURN_MEMORY` reachability | `candidates=0 injected=0` lines per owner session; paired bench `scripts/memory-eval/turn-memory-bench.ts` | `candidates>0` on turns that name a stored entity; recall@4 up at least 10 points; p95 turn latency up by no more than 150 ms |
| Hello feels natural | the call reviewer's notes on owner calls, plus one listen by the owner per week | no "it sounded like a report" notes |

**Baselines (measured 2026-10-31)** on `main` at `33eddf41b`, by the A5-1 PR. No calls were placed. A row that says "not measured" gives the reason; no number in it is a guess.

| Measure | Baseline | How |
|---|---|---|
| `TURN_MEMORY` bench, flag off (as prod today) | 0 memories sent on 72 labelled turns: recall 0%, hit 0% | `scripts/memory-eval/turn-memory-bench.ts`, fictional `recall-cases.json` (3 callers, 72 turns, 27 about nothing), `text-embedding-005` |
| `TURN_MEMORY` bench, `TURN_MEMORY_RRF_SCALE` on | 44 sent: precision 95%, recall 72%, hit 76%, false recall 4% | same run, the cap the flag applies (3 per turn) |
| `TURN_MEMORY` recall@4 | not measured: the bench scores recall at the production cap (above), not at 4 | |
| `TURN_MEMORY` p95 turn latency | not measured: the bench runs retrieval over precomputed vectors, so it times nothing | |
| `candidates=0` rate per owner-cohort session | not measured: needs dev Cloud Logging, and this run's gcloud config was not on the dev project | |
| Persona rows per owner call | not measured: same reason | |
| First-token latency p50 (`TURN_RECEIPT`) | not measured: same reason, and no dev calls were placed | |
| Card recall on the held-out set (three personas) | not measured: needs dev calls through the `#2969` harness | |
| Hello-date behaviour | not measured: needs dev calls | |

### 9.4 Prod measurement
Owner cohort only at first. For each owner call: `Cohort flags applied` shows the flags; `CALLER_CARD built`, `GREETING_DATE` and `PERSONA_FACT_DROPPED` lines appear; the always-on call reviewer reads the call. A weekly query counts: cards built, `budgetHit`, dates raised, dates lost to another thread, persona rows dropped. The owner listens to the first few calls and the lead records what they heard in the PR that widens the audience.

## 10. Rollout order

Dev first, then the owner's account, then wider. Each step needs the previous step's bars met and the soak noted.

1. **Land code flag-off** (PR order in section 11). Deploy `main` to dev with `COHORT_FLAGS=on`. Nothing changes for anyone.
2. **Dev.** Create an owner cohort on `ferni-dev`; set `CALLER_CARD`, `DATES_THAT_MATTER`, `DATES_IN_HELLO`, `DIRECTOR_PERSONA_AWARE`, `CALL_NEWS_OPENER`, `TURN_MEMORY_RRF_SCALE` on for the eval users. Run section 9.2. Fix until the bars hold. No one in a room while updating secrets.
3. **Seed the owner's home once** (open question O2: default is a one-off admin write of `preferences.homeLocation` using an existing one-off admin script, after the owner confirms the text, because the card must not wait for them to say it in a call).
4. **The owner's account in prod.** Prod claim, deploy a commit already on `main` and already run on dev, then the owner's cohort: `CALLER_CARD`, `DATES_THAT_MATTER`, `DIRECTOR_PERSONA_AWARE`, `CALL_NEWS_OPENER`, `TURN_MEMORY_RRF_SCALE`. Then, as separate steps a day apart: `DATES_IN_HELLO`; `CALL_REPORT_REACHES_YOU` (after re-reading the `#3080` PASS, and only once the crisis-lane PR has made it cohort-capable; A5-1 did not); `TURN_MEMORY_RERANK` last (latency receipts first, set `TURN_MEMORY_RERANK_TIMEOUT_MS` agent-wide before). Watch 3 days of owner calls each.
5. **Friends and family.** Same flags, one at a time, with a week of the call reviewer's notes between. Ask the members how it felt.
6. **Beta, then default.** Per the runbook ladder; compare with and without the flag (hang-ups, call length, complaints); then set the agent default and `unset-flag` in the cohorts, then delete the flag.

Rollback is `set-flag <cohort> FLAG off` or `disable <cohort>`; the next call is back to today's behaviour. The A1 filter is not a rollback case: it only stops saving persona lines.

## 11. PR breakdown (each 400 reviewable lines or fewer, each with its first reader, flag-off)

Order matters only where noted. Estimates are reviewable lines, tests excluded.

| PR | Title | Content | Est. | Needs |
|---|---|---|---|---|
| A1-1 | `fix(memory): stop saving persona self-statements as the caller's facts` | `isPersonaSubject` in `entity-hygiene.ts` + index export; filter in `sanitizeExtractionResult` with the relationship carve-out; counters | ~90 | none |
| A1-2 | `fix(memory): recall skips persona facts and keeps home apart from where they are` | read-side skip in `loadRecallSnapshot`; move prompt constants to `deep-extraction-prompts.ts` (pure move) and add `home` / `current location` keys, gated by `CALLER_CARD` via `envForCaller` | ~110 | A5-1 (flag exists) |
| A5-1 | `feat(flags): memory flags can go on for one person` | section 5.6: `COHORT_FLAGS` + pinned list + needs + read-site tests; flag specs for `CALLER_CARD` and `DATES_IN_HELLO` (`pnpm flags:new`). **First PR to land: also measures the section 9.3 baselines on dev (ruling 7).** | ~120 | none |
| A2-1 | `feat(memory): caller card with home place for every persona` | the folder skeleton, `load.ts` single flight + cache + budget + async forgotten re-read, `render.ts`, additive guard export from person-model, no card for minors or `onbehalf:` sessions, injection in `agent-setup.ts` (net zero), Home section only | ~400 | A5-1; **waits on the person-model owner's answer** |
| A2-2 | `feat(memory): caller card people` | People section: `PeopleReader` wiring over `familyMembers` + `RECALL_PEOPLE` builder, selection, render | ~250 | A2-1 |
| A2-3 | `feat(memory): caller card recent calls` | Recent calls section over `call-recall.ts` / `call-status.ts`; closed status enum | ~220 | A2-1 |
| A2-4 | `feat(memory): caller card coming up` | Coming up section over world-fact events and due follow-throughs; shared `sensitiveDate` rule; loaded only with `DATES_IN_HELLO` | ~250 | A2-1 code |
| A3-1 | `feat(greeting): a date within three days can be the hello's one thread` | `greeting-date.ts` (pick without side effects, winner commits), race entry, arbiter, `OpenerAsker` value, recall-note suppression, `ONCE_AHEAD_DAYS` as a function of `DATES_IN_HELLO`, `sensitiveDate` and the presence wording | ~350 | A5-1 |
| A3-2 | `feat(greeting): call news can lead the hello after a week` | `MAX_AGE_HOURS` 48 to 168 (+ test) | ~10 | none |
| E-1 | `test(voice-eval): card, date and persona-leak scenarios` | the section 9.2 scenarios and seed | ~300 | A2-1 and A3-1 |
| Ops | flag flips | no code; per section 10, each under a prod claim | none | all above on dev |

**Only A2-1 waits on the person-model owner (ruling 8).** A1, A3 and A5 proceed now; A2-2 to A2-4 follow A2-1 as code and need no further answer from them.

A3-2 is small enough to fold into A3-1 if the total stays under 400. If A2-1 trends over 400, move the additive guard export and its test into its own 60-line PR first.

### Phase 2 (design only, not built here): one timeline, promises in both directions

Why: today "what is open" lives in ten stores (retro: commitments in three schemas, follow-through rows, open loops, summary follow-ups, world-fact dates, deferred calls, errands, reminders). The card and the hello each read a different slice, so they can disagree, and no one owns "did we say we would".

Design (consistent with `2026-10-27-recall-ledger.md`):
- The activity ledger (`bogle_users/{uid}/activity/{id}`, written only by `recordActivity` with compare-and-set on `revision`) is the single writer of "things that happened or are owed". Add two kinds to its `kind` union: `date` (an upcoming or recent event: `on`, `label`, `sensitive`, `source`) and `promise` with `owner: 'ferni' | 'user'`.
- Promises in both directions: `owner: 'ferni'` is what Ferni said it would do (call back, find out, remind); `owner: 'user'` is what the person told Ferni they would do (the commitments the check-in already asks about). The hello's check-in and the card read one list with `owner`, so "you said you'd call your sister" and "I said I'd find that out" use the same machinery, the same forgotten-topic and sensitivity guards, and the same opener claim.
- Producers write through `recordActivity`: the dates writer (`dates/after-call.ts`), follow-through rows, the three commitment schemas, deferred calls and on-behalf calls (already planned in the ledger doc). Readers swap in behind the card's ports (`UpcomingDatesReader`, `RecentCallsReader`, plus a new `OpenPromisesReader`) with no change to `render.ts`; that is why the card has ports now.
- Migration: dual-read behind a flag until the ledger set equals the legacy set for the owner for a week; then delete the legacy readers with grep proof in the same PR. Exit criteria: the card and the hello arbiter read only the ledger; `callStatus` reads the ledger; `buildPendingCallResultsContext`'s delivered-flag path is deleted.
- Precondition: the ledger has zero producers and zero readers outside its own file today (`ACTIVITY_LEDGER` is off, no `activity` subcollection exists). Do not flip it until the first producer lands with its reader (recall-ledger lane 2). Phase 2 is planned after A2-1 to A3-1 have run on the owner for two weeks.
- Owner: the person-model owner (memory lanes) with this plan's author as reader of the card ports. Open: whether `OpenPromisesReader` ships in the card before the ledger (default: no, it waits).

## 12. Open questions, each with a default

| # | Question | Default |
|---|---|---|
| O1 | Does the person-model owner add `place` and `recentCalls` to `PersonModel`? | No. Thin sibling module; revisit at M6. The lead asks before A2-1. |
| O2 | How does the owner's home get set the first time? | One-off admin write of `preferences.homeLocation` using an existing one-off admin script, after the owner confirms the exact text. If a user-facing tool for it exists, use that instead (UNCONFIRMED whether one does; the builder greps before choosing). |
| O3 | Delete the existing persona fact rows? | No. The read-side skip hides them. Delete in a later one-off with the owner's say-so. |
| O4 | New flag for the A1 filter, or `ENTITY_HYGIENE`? | `ENTITY_HYGIENE` (on in prod). It is a bug fix under the rule that flag names. |
| O5 | If the hello's thread goes to something else, may the date ride later in the call? | No. One proactive thing per call; the date waits for a later call. |
| O6 | Should purpose text appear on a recent call line? | No. Who, status, when only. |
| O12 | What is "sensitive" for a date? | `isSensitiveThread` OR the health lexicon; when unsure, sensitive (ruling 1). |
| O13 | A friend who shares a teammate's name but has no stored relationship | Hidden, with a counter (ruling 6). Accepted: better to miss a fact than attribute persona canon to the user. |
| O7 | Should People include people the caller mentioned once? | Only people with a stated relation or at least 2 mentions in 90 days (the person-model `Person` rule); default 5 max. |
| O8 | `TURN_MEMORY_RERANK` timeout value | 800 ms agent-wide when turned on, after latency receipts; the flag stays off until then. |
| O9 | Do minors get the card? | No (ruling 5). `MINOR_CARE` accounts get no card. |
| O10 | Widen lookahead beyond 3 days for yearly events? | No. Yearly stays 7 days. |
| O11 | Where `memory_state/forgotten` comes from for the card | Built once with the card, then re-read asynchronously at every handoff in parallel with persona setup, inside the 400 ms budget (ruling 4). On timeout, drop People and Coming up and log a count. |

## 13. Definition of done

- Each PR merged through the queue, with an independent verifier's PASS on the exact head, and the numbers in the PR.
- On dev from `main`: section 9.2 scenarios pass at the bars in 9.3.
- On the owner's account in prod: three owner calls with a handoff each show the right home, people, calls and dates from the first reply, one timely thing in the hello, no repeated date, no persona fact rows.
- The `CLAUDE.md` in `caller-card/` describes what the folder does as merged.
- Flags that finished their rollout are deleted.
