# Personal Insights: people, threads, anticipation

> Remember the people (and pets) in someone's life, the threads they keep coming back to,
> and what they are likely to bring up today, then let every persona use it gently,
> in their own voice.

Module: `src/services/personal-insights/` (Level 60). Live wiring:
`src/agents/multi-agent/personal-insights-context.ts`. Kill switch: `PERSONAL_INSIGHTS=off`
(LLM-written insights only: `PERSONAL_INSIGHTS_LLM=off`, rules-only openers remain).

## Why a new module (and what it reuses)

The superhuman services (`relationship-network`, `predictive-coaching`, `life-narrative`, …) were
designed for this, but in production (Gemini Live, multi-agent) they mostly run only under
`TURN_INTELLIGENCE=on`, keep state in collections without provenance (`relationship_network`,
`conflict_history`), and are fed by live turn heuristics rather than the extracted memory. The
product rule is that everything derived must disappear when its sources are deleted, so this
module derives from the stored memory only and carries `sourceConversationIds` everywhere.

It reuses rather than duplicates:

| Reused                                                                                                            | For                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `memory/recall/session-recall.ts` (`mentions`, `contentWords`)                                                    | Mention matching, same as per-turn recall                                         |
| `services/superhuman/connection-opportunities.ts` (extracted from `relationship-network.ts`, behaviour unchanged) | Keep-in-touch nudges for friends                                                  |
| `services/superhuman/conflict-resolution-memory.ts` (`analyzeConflictPattern`) + new `conflict-signals.ts`        | Recurring tensions and what helped, from conversation and from `conflict_history` |
| `services/safety/crisis-detection.ts`                                                                             | Crisis material never reaches the LLM; openers are withheld (`safetyHold`)        |
| `services/llm-utils.ts` (`callLLM`)                                                                               | Same provider as summarization (Vertex/Gemini, OpenAI fallback)                   |

## Data flow

```
dynamic_facts / dynamic_entities / dynamic_relationships / summaries / conversations / conflict_history
        │  (read-only; tombstoned fact ids skipped)
        ▼
 people-resolution ─► people-model (+ person-details, relationship-dynamics, date-detection)
        │                     │
        │                     └─► important dates ─► important-dates store (Agent G) via upsertImportantDate
        ▼
 topic-threads ─► prediction (calibrated by prediction_outcomes) ─► insight-generator (LLM, grounded)
        │
        ▼  boundaries filter (Agent H: isTopicAllowedProactively) — hard constraint
 people_profiles / life_threads / personal_insights/current / prediction_outcomes
        │
        ├─► session start: "What's On Their Mind" block (≤900 chars, ≤300 ms wait)
        └─► per turn: person note when the user mentions someone
```

Everything is recomputed from the current memory on each refresh (a user's memory is small), so
deletions and tombstones drop out on the next pass.

### Storage (all under `bogle_users/{uid}/`, all derived, all with `sourceConversationIds`)

| Collection            | Doc                | Contents                                                                                                                                                                                                                     |
| --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `people_profiles`     | `{personId}`       | `PersonProfile`: name, aliases, relationship, `kind: 'person' \| 'pet'`, `memorial`, key facts, important dates, open threads, mention history, sentiment trend, `pet`, `connection`, `relationshipDetails`, `sourceFactIds` |
| `life_threads`        | `{threadId}`       | `LifeThread`: label, first/last mention, conversations, trajectory, cadence, unresolved items, commitments, people, sensitivity                                                                                              |
| `personal_insights`   | `current`          | `InsightBundle`: predictions, insights, openers, nudges, upcoming dates, top people, `safetyHold`                                                                                                                            |
| `prediction_outcomes` | `{conversationId}` | Hits/misses of the predictions made before that conversation, Brier score                                                                                                                                                    |

## What it understands

**People and family.** Aliases merge ("Mom", "my mother", "Linda") from entity attributes,
user→person relationships and facts ("mom | name = Linda", "user | sister = Kate"). Roles a user
has one of (mother, father, partner, best friend, boss) merge a bare mention with the named
person; shared roles (sister, friend) merge only when exactly one named person holds the role.

**Pets.** `kind: 'pet'` with species, breed, age, personality, health/vet notes and meds,
routines, owner and stories. "the dog", "my pup" and "Biscuit" merge the same way. Gotcha days
are recurring `anniversary` dates; vet appointments are `event`s.

**Memorials.** Anyone (person or pet) who has died gets `memorial: true`: no open threads, no
predictions, no reminders sent to the dates store, "how is X?" openers are rejected, and notes say
to speak of them warmly, in the past tense.

**Friends.** `connection`: how they know them, closeness, shared history and inside references,
the friend's own life events, the last time the user mentioned connecting, and intentions ("I
should call Jess"). Nudges (check in on news, reconnect with a close friend gone quiet) come from
the Relationship Network rules.

**Relationships.** `relationshipDetails`: partner status and its history (dating → engaged →
married, breakups, divorce, estrangement, reconciliation), how they met, what the partner
appreciates, date ideas, shared plans, recurring tensions and what helped (conflict pattern
analysis), repair attempts, what the user wants to do better, support given/received, and health
(sentiment trend). Anniversaries and date nights go to the dates store. A former partner or an
estranged relative is never raised proactively (their dates are not sent for reminders); they
still get context when the user brings them up.

**Life threads.** Summary topics clustered ("Marathon training" = "training for the marathon"),
counted per conversation (also via key points of catch-up summaries), with trajectory
(new/rising/steady/fading), cadence, unresolved follow-ups and commitments.

## Prediction (transparent, calibrated)

Each candidate (thread, person with something open, upcoming date, fresh follow-up) gets
component scores in [0,1]: recency `exp(-days/14)`, frequency `min(1, n/5)`, cadence (due by its
rhythm), time pattern (weekday / time of day), unresolved, upcoming (`1 - days/8`), combined
with fixed per-kind weights. Calibration per kind: `factor = (hits+1)/(Σconfidence+1)` clipped to
[0.5, 1.5] over the last 50 scored conversations. After a conversation, the predictions made
before it are scored (hit = its summary or the user's words mention the topic) and stored.

## Insights and openers (grounded)

The LLM sees numbered evidence (E1…En) and must return strict JSON with cited ids. Rejected:
unknown ids, names or numbers not in the cited evidence, "you said / you told me" phrasing,
counting how often a sensitive topic came up, and present-tense check-ins about someone who has
died. When the LLM is off or everything is rejected, openers are built from the evidence.
Sensitive categories (health, grief, money, relationships) are marked "gently"; crisis material
sets `safetyHold`: openers and nudges are withheld and the existing safety handling stays in
charge.

## Live path (production: Gemini Live, multi-agent)

- **Session start** (`agent-setup.ts`): `startSessionInsightsLoad(userId)` runs in parallel with
  prompt loading; `sessionInsightsSection()` waits at most 300 ms and appends the block to the
  model-level instructions. A missing or day-old bundle is refreshed in the background.
  The block is persona-agnostic: the active persona's display name is passed in
  (`getPersonaDisplayName(persona.id)`), so handoffs get the same context in a new voice.
- **Per turn**: `installPersonRecall()` listens to `user_input_transcribed` and adds the
  mentioned person's profile with the same synchronous `updateChatCtx` path as memory recall
  (once per person per call). People blocked by the user's boundaries are left out.

## Integration points

| For                                      | Call                                                                                                                                                                                                                                                                                                                 | Notes                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (session end / catch-up summarization) | `onConversationSummarized(userId, conversationId, summary?, turns?)`                                                                                                                                                                                                                                                 | Fire-and-forget after a summary is saved. Scores predictions, then recomputes. Not yet called from `end-session.ts` (A owns it); the daily job and the stale-bundle refresh cover it meanwhile. |
| B (per-turn recall)                      | `getPersonContext(userId, mention)`                                                                                                                                                                                                                                                                                  | Already wired separately via `installPersonRecall` in `agent-setup.ts`; B's hook can call it instead if preferred.                                                                              |
| C (memory control cascade)               | `deleteDerivedFor(userId, conversationId)` after deleting a conversation's sources; `deleteAllDerived(userId)` in `deleteAllMemories`; `deleteDerivedForFact(userId, factId)` after a fact delete; `deletePersonProfile(userId, personId)` for `DELETE /people/:id` (tombstones the person, returns `sourceFactIds`) | Add `people_profiles`, `life_threads`, `personal_insights`, `prediction_outcomes` to the recursive account wipe.                                                                                |
| C (`GET /api/memory/me`)                 | `getPeopleForApi(userId)` → `{ id, name, kind, memorial?, relationship?, notes?, updatedAt }`                                                                                                                                                                                                                        | `notes` joins key facts and open threads. Pets are included with `kind: 'pet'`.                                                                                                                 |
| G (important dates)                      | `upsertImportantDate` / `getUpcomingDates` via `integrations.ts`                                                                                                                                                                                                                                                     | Resolved at runtime from `src/services/important-dates/index.js`; `registerImportantDatesPort()` overrides. Without it, dates stay in profiles and upcoming dates are computed locally.         |
| H (boundaries)                           | `isTopicAllowedProactively` via `integrations.ts`                                                                                                                                                                                                                                                                    | Resolved from `src/services/user-preferences/index.js`; `registerBoundariesPort()` overrides; defaults to allow-all when absent. Fails closed per item on error.                                |
| Scheduler                                | `POST /api/jobs/personal-insights-refresh` (`PersonalInsightsRefreshJob`)                                                                                                                                                                                                                                            | Listed in `infra/cloud-scheduler-memory.yaml` and `ferni ops memory:deploy-scheduler`; not deployed.                                                                                            |

## Cost and latency

- Session start: one doc read (cached 2 min), ≤300 ms wait, never blocks the first response.
- Per turn: in-memory matching only.
- Refresh: ~6 small collection reads, one LLM call (≈700 output tokens), a handful of writes;
  run after conversations and daily for users active in the last 14 days.

## Tests

`src/services/personal-insights/__tests__/` (mocked Firestore and LLM): alias merge, family
relationships, important dates (birthdays, relative dates, gotcha days, anniversaries, date
nights), topic threads, prediction scoring and calibration, grounding rejections, safety hold,
deletion hooks (memory store and Firestore double), session block budget, persona-agnosticism,
pets and memorials, friendships and nudges, relationship status changes and conflict context,
the scheduled job.
