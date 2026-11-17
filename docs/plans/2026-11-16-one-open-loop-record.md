# One open-loop record: nothing stale on any channel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything Ferni or a teammate raises with a person, on a call, text, push or email, comes from one record of what is open. Everything the person says about it, on any channel, updates that record, so nothing stale is ever sent.

**Architecture:** The follow-through ledger (`bogle_users/{uid}/follow_through`, `src/services/follow-through/`) becomes the only thing senders read and write. Tasks join it as a source. Closes travel both ways between a follow-up and its source item. Every reply channel feeds one "heard" path. Every sender asks one pure gate, `mayRaise`, and records what it said. Alex's morning brief becomes a view of the ledger, and its side record `item_mentions` is deleted.

**Tech Stack:** TypeScript, Firestore, Vitest; LiveKit after-call tasks; Twilio inbound SMS.

**Spec:** This document, building on `docs/plans/2026-10-12-follow-through.md` ("one record of what's open, one way to deliver it"). Seth, 2026-11-16: "never stale texts or emails … all communication, be it emails, texts or calls, to have perfect memory and context."

## Why (measured 2026-11-16)

- **What prod shows.** Since the freshness gate shipped (#3790, 2026-11-13), Alex's brief has texted one open task every morning: Nov 13, 14, 15 and 16 each logged `sent=1 open=1 dropped={}`. The gate has never dropped an item.
- **Why it drops nothing.** All three of its rules are dead for tasks:
  - The task's `updatedAt` only changes if the model calls `completeTask` on the right task.
  - Tasks are not in the ledger, so the 48 h rule never applies (`freshness.ts:11`).
  - `item_mentions` has a reader and no writer (`stores/item-mentions.ts:9`).
- **The root cause is a second path.** The brief (#1868) reads raw stores, beside the ledger built to replace them. Nine senders each run their own "already raised?" rule:
  - `freshness.ts staleBy`
  - `opener-pick.ts raisedByOpener`
  - `commitment-follow-up.ts askableOnCall` and `dueForPush`
  - `proactive_outreach_log`
  - `FOLLOW_UP_GAP_MS`
  - `guarded-text` gaps

  The rules disagree with each other.

- **Gaps in what the ledger records.**
  - `SurfacedVia` is `opener | in-call | text` only (`follow-up.ts:22`).
  - Nothing writes `in-call`.
  - `asks[].answeredAt` has no production writer: `ask()` and `answer()` are dormant.
  - The brief writes no `surfaced` entry after it sends.
- **Replies are lost.**
  - Text replies to the brief are matched and stored (`checkin-replies.ts:185`) and never read.
  - The brief's item refs are discarded after sending (`brief-job.ts:263`).
  - Mail sent from admin@ferni.ai is send-only (`gmail.send` scope).
- **Tasks live in two places.**
  - `productivityData.tasks`: the live voice tool and the brief use it.
  - `bogle_users/{uid}/tasks`: `productivity-executor.ts:288` completes tasks here, and the brief never reads it.

## Where each store fits

| Role       | Stores                                                                                                                                                     | Joins the ledger as                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Open loops | reminders, commitments, call-summary threads (already imported); **tasks (new)**; `open_loops`, `action_items`, `pending_actions`, `errands` (later phase) | One follow-up per source item, id `followUpId({store, ref})`; one topic merges via `sources[]`        |
| Timing     | calendar events, `life_events`                                                                                                                             | `eventAt` / `dueAt` on a follow-up (arbiter G6); never a follow-up on its own                         |
| Check-ins  | goals, milestones, habits                                                                                                                                  | Out of scope here. They produce check-ins through their own lanes, which adopt `mayRaise` in phase 5. |
| Delivery   | morning brief, reminder delivery, commitment push, proactive triggers, in-call check-ins, `scheduled_outreach`, email                                      | Ask `mayRaise`, then record `surface {via}`                                                           |

## Global Constraints

- One PR per task. Each is ≤ ~400 reviewable lines, new behaviour sits behind its own off-by-default flag (`pnpm flags:new NAME --default off --owner follow-through --kind experiment --issue '#3961'`), and the PR says `Closes #<its task issue>`. Umbrella: #3961.
- L3 (`services/follow-through/`) stays pure: no IO, no flags, no clock. Firestore lives in `services/stores/` adapters. Flags are read in L4 callers through `envForCaller(userId)` + `flagOn`.
- No words are ever logged; log counts and gate ids only. The after-call judge returns indexes, never text.
- Whole-word matching for any classifier on user text (`closeFromReply` already does this).
- Writes go only for the account's verified owner (`ownerOnTheLine` / `sessionIsVerifiedOwner`). Calls Ferni placed and `anon:`, `onbehalf:` and `voice-eval-` ids are skipped.
- Holds fail closed: crisis, minor-care, STOP, an unreadable forget list → nothing is raised, nothing is closed.
- Fixtures are fictional (555-01xx numbers, made-up names). Every new test is seen to fail against main before it passes.
- Files over 500 lines may not grow (`productivity-store.ts` is 1219: add new modules beside it).

## Decisions (defaults stand unless Seth changes them)

| #   | Decision                                                                                | Default                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | How many brief listings with no answer before Alex asks "still want this on your list?" | 3                                                                                                                                                                                  |
| D2  | Brief cadence for one open item                                                         | At most once per 48 h (the ledger's `ASK_SPACING_MS`); due-today reminders always list                                                                                             |
| D3  | Old `bogle_users/{uid}/tasks` collection                                                | Becomes read-only; `productivity-executor` add/complete route to `productivity-store`. A one-off script copies open rows into `productivityData.tasks` (dry run unless `--apply`). |
| D4  | Email replies to admin@ferni.ai                                                         | Out of scope until Seth chooses: read the Workspace mailbox (`gmail.readonly`) or set Reply-To to a routed address. Briefs are texts today.                                        |

## Review Focus

1. **"I haven't done it yet" said on a call about a listed task.** The item must stay open and wait 48 h, not close. Task 3 tests it.
2. **One text reply to a brief listing two items.** "done" must close only when the brief listed exactly one item, or when the reply names an item by number ("2 is done"). Otherwise the reply records "heard" on all listed items and closes none. Task 5 tests it.
3. **A task completed in the web app between the brief's read and its send.** It must not be texted; the `current` re-read at send time stays. Task 4 tests it.
4. **A crisis text arriving as a reply to the brief.** No close and no "heard" record; the crisis screen owns it. Task 5 tests it.
5. **A person who said "forget it" about a topic.** The item is released and is never raised by any sender, including after a fresh import of its source. Task 1 tests that import never reopens a released row (the existing behaviour, pinned for tasks).

---

## Phase 1: tasks join the record

### Task 1: Import tasks as follow-ups (`FOLLOW_THROUGH_TASKS`)

**Files:**

- Modify: `src/services/follow-through/follow-up.ts:20` (`FollowUpKind` adds `'task'`), `src/services/follow-through/askable.ts` (`'task'` is askable)
- Modify: `src/services/stores/follow-through-store.ts:39` (`KINDS`), `src/services/stores/follow-through-brain-fields.ts` (parser accepts `'task'`)
- Modify: `src/services/stores/follow-through-sources.ts` (new `openTasks` reader, behind the flag via a `withTasks` option)
- Modify: `src/agents/follow-through-import.ts:73` (pass `withTasks: flagOn('FOLLOW_THROUGH_TASKS', env)`)
- Create: `src/config/flags/FOLLOW_THROUGH_TASKS.ts`
- Test: `src/services/stores/__tests__/follow-through-sources-tasks.test.ts`

**Interfaces:**

- Produces: a `SourceItem` with `{ kind: 'task', text: title, dueAt: dueDate ?? null, repeat: null, source: { store: 'tasks', ref: String(id) } }`. The ref equals the brief's `BriefRef` for tasks (`default-deps.ts:133`).

- [ ] **Step 1: Write the failing tests**
  - `imports pending and in_progress tasks, one follow-up each`: user doc with tasks `{id:'t1',status:'pending'}`, `{id:'t2',status:'completed'}` → items `[{source:{store:'tasks',ref:'t1'}, kind:'task'}]`.
  - `flag off imports no tasks`: same doc, `withTasks:false` → no item with `store==='tasks'`.
  - `a released task follow-up is not reopened by import`: store holds `followUpId({store:'tasks',ref:'t1'})` with status `released` → after `importFollowUps`, status is still `released`.
- [ ] **Step 2: Run them; expect FAIL** (`'task'` is not a kind). `pnpm vitest run src/services/stores/__tests__/follow-through-sources-tasks.test.ts`
- [ ] **Step 3: Implement** `openTasks(userDoc): SourceItem[]`, copying `pendingReminders`. Use `TaskData` from `productivity-store.ts:70`.
- [ ] **Step 4: Run them; expect PASS**, then `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(follow-through): tasks join the follow-up record behind a flag`

### Task 2: Closes travel both ways between a task and its follow-up

**Files:**

- Create: `src/services/follow-through/close-source.ts` (port `SourceCloser`, pure dispatch by `source.store`)
- Create: `src/services/stores/source-closer.ts` (adapter: task → `status:'completed', completedAt, updatedAt`; reminder `done` → `status:'completed'`, `release` → `cancelReminder`; commitment → existing done/dismiss write)
- Modify: `src/tools/domains/productivity/tasks.ts:378` (`completeTask` also calls `closeFromSource(store, uid, {store:'tasks', ref:id}, 'done', now)`)
- Modify: `src/agents/shared/tool-executors/productivity-executor.ts:268-306` (route `completeTask`/`addTask` to `productivity-store`, decision D3)
- Create: `scripts/devdb/copy-legacy-tasks.ts` (dry run unless `--apply`)
- Test: `src/services/follow-through/__tests__/close-source.test.ts`, `src/services/stores/__tests__/source-closer.test.ts`

**Interfaces:**

- Produces: `interface SourceCloser { close(userId: string, source: {store: string; ref: string}, how: 'done' | 'release', now: Date): Promise<boolean> }`, plus `firestoreSourceCloser(): SourceCloser | null`.
- Consumes: `closeFromSource` (`follow-through/close-from-source.ts`).

- [ ] **Step 1: Write the failing tests**
  - `completing a task closes its follow-up as done`: open follow-up for `tasks:t1`, then call the voice `completeTask` → follow-up status `done`.
  - `closing a task follow-up completes the task`: `SourceCloser.close(uid, {store:'tasks',ref:'t1'}, 'done')` → `productivityData.tasks[t1].status === 'completed'` and `updatedAt` changed.
  - `release on a reminder cancels it; done completes it`.
  - `unknown store closes nothing and returns false`.
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement** the port, the adapter and the two call sites. Before deleting the executor's old write path, paste `git grep -n "collection('tasks')"` (with the sealed exclusions) proving no other writer remains.
- [ ] **Step 4: Run them; expect PASS**, then `pnpm typecheck` and `pnpm quality:knip`.
- [ ] **Step 5: Commit** `fix(tasks): one task store, and a task and its follow-up close together`

## Phase 2: hear it on every channel

### Task 3: After-call judge records what the person said about open loops (`AFTER_CALL_HEARD`)

**Files:**

- Modify: `src/services/follow-through/follow-up.ts` (`SurfacedVia` adds `'brief' | 'push' | 'email'`; `FollowUpEvent` adds `{ type: 'heard'; via: 'in-call' | 'text' }`, which appends to `surfaced` without changing status), `src/services/stores/follow-through-store.ts:110` and `follow-through-brain-fields.ts:37` (parsers accept the new values)
- Create: `src/intelligence/world-model/extraction/follow-up-hearing.ts` (prompt, parse, judge)
- Create: `src/intelligence/world-model/extraction/follow-up-hearing-register.ts` (`registerAfterCallTask('follow-up-hearing', …, {timeoutMs: 30_000})`), imported from `src/agents/after-call-register.ts`
- Create: `src/config/flags/AFTER_CALL_HEARD.ts`
- Test: `src/intelligence/world-model/extraction/__tests__/follow-up-hearing.test.ts`

**Interfaces:**

- Produces: `type Heard = { index: number; verdict: 'done' | 'replan' | 'release' | 'mentioned' }`, `parseHeard(raw: string, count: number): Heard[] | null`, and `judgeHearing(turns, openFollowUps, llm, fallback): Promise<Heard[]>`.
- Applying a verdict: `done` / `release` → `apply` + `SourceCloser.close`. `replan` → `apply({type:'replan', dueAt: now + ASK_SPACING_MS})`. `mentioned` → `apply({type:'heard', via:'in-call'})`.
- Consumes: `callLLM`/`geminiLlm`, `transcriptOf`, `callMomentFor` and the `<transcript>` guard, the same as `commitment-judge.ts:34-145`; `forgottenTopicsOrNull`.

- [ ] **Step 1: Write the failing tests**
  - `parseHeard rejects an index outside the list` (`{"heard":[{"index":7,"verdict":"done"}]}` with count 3 → `[]`).
  - `parseHeard returns null with no JSON object`.
  - `"I haven't done it yet" yields replan, never done` (fake llm returns `replan` for index 0 → follow-up still open, `dueAt` moved ≥ 48 h).
  - `a done verdict closes the follow-up and completes the task` (fake closer records the call).
  - `no write for a non-owner call or an unreadable forget list`.
  - `flag off: the task is registered and returns without a model call`.
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement.** The prompt lists open follow-ups as numbered lines (owner's own, not closed, ≤ 20, forgotten topics removed) and asks for JSON with indexes only. Screen verdicts against the caller's own turns, as `screenJudged` does.
- [ ] **Step 4: Run them; expect PASS**, then `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(follow-through): after a call, what the person said about open loops updates them`

### Task 4: The morning brief reads the record (`MORNING_BRIEF_FROM_LEDGER`)

Two PRs to stay under 400 lines:

- **4a:** export the arbiter predicates and add `mayRaise`. Pure, no flag; the `may-raise` tests.
- **4b:** everything else below; the `brief-from-ledger` tests.

**Files:**

- Create: `src/services/outreach/morning-brief/ledger-day.ts` (`readLedgerDay`: open follow-ups → `DayItems`, refs kept)
- Create: `src/services/follow-through/may-raise.ts` (pure `mayRaise`)
- Modify: `src/services/follow-through/arbiter.ts` (export the G1–G8 checks as named predicates; `pickThread` calls them, with no behaviour change, and its tests stay green)
- Modify: `src/services/outreach/morning-brief/compose.ts` (items are numbered when more than one is open; the keep-ask line "Still want X on your list?")
- Modify: `src/services/outreach/morning-brief/default-deps.ts` (flag picks `readLedgerDay` over `readDay` for reminders, tasks and commitments; calendar unchanged; runs `importFollowUps` first, which is idempotent, so tasks made since the last call count)
- Modify: `src/services/outreach/morning-brief/brief-job.ts:263` (after a send, `surface {via:'brief'}` for each listed follow-up; the refs go on the `feature_checkins` doc as `items: [{store, ref}]` through `sendGuardedText`'s new optional `items`)
- Modify: `src/services/outreach/guarded-text.ts` (optional `items` persisted on the record)
- Create: `src/config/flags/MORNING_BRIEF_FROM_LEDGER.ts`
- Test: `src/services/follow-through/__tests__/may-raise.test.ts`, `src/services/outreach/morning-brief/__tests__/brief-from-ledger.test.ts`

**Interfaces:**

- Produces: `mayRaise(f: FollowUp, via: SurfacedVia, now: Date, opts: { forgotten: (text: string) => boolean; held: boolean }): { ok: true } | { ok: false; gate: GateId | 'keep-asked' }`. It reuses the arbiter's G1–G8 predicates, exported by this task. It does not reuse the call-cadence gates G9–G11, which belong to calls.
- Produces: `KEEP_ASK_AFTER = 3` (D1). When `f.surfaced.filter(s => s.via === 'brief').length >= 3` and there is no answer since, the brief lists that item once as "Still want X on your list?" and then stops listing it until it is heard.

- [ ] **Step 1: Write the failing tests**
  - `an item raised or heard in the last 48 h on any channel is not listed`: `surfaced:[{via:'in-call', at: now-1h}]` → `mayRaise` gives `{ok:false, gate:'asked-48h'}`.
  - `the same open task is listed at most every other morning`: two runs 24 h apart → the second run lists 0 open items.
  - `after three unanswered listings, the brief asks to keep it, once`.
  - `a task completed between read and send is not texted` (the `current` re-read stays).
  - `a due-today reminder lists even if it was listed yesterday` (D2).
  - `flag off: readDay is used and nothing is written to the ledger`.
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement.** `freshness.ts` keeps rule (a) (source re-read). Rules (b) and (c) are replaced by `mayRaise` when the flag is on.
- [ ] **Step 4: Run them; expect PASS**, then `pnpm typecheck`. Dry-run on dev with Seth's cohort and paste the run line.
- [ ] **Step 5: Commit** `fix(morning-brief): alex's brief is a view of the follow-up record`

### Task 5: A text reply updates what it answers (`TEXT_REPLY_HEARD`)

Coordinate with open PR #3722 (`SMS_REPLY`, `twilio-webhooks.ts`) before starting; land after it or rebase onto it.

**Files:**

- Create: `src/services/follow-through/hear-reply.ts` (pure: listed items + reply → verdicts)
- Modify: `src/api/outreach-webhook-routes.ts:129` (`recordSignedInbound`: after `recordCheckinReply`, when the matched record has `items`, call the L4 use-case; skipped for crisis texts)
- Create: `src/services/outreach/reply-heard.ts` (L4: flag, owner, store, `SourceCloser`)
- Create: `src/config/flags/TEXT_REPLY_HEARD.ts`
- Test: `src/services/follow-through/__tests__/hear-reply.test.ts`, `src/services/outreach/__tests__/reply-heard.test.ts`

**Interfaces:**

- Produces: `hearReply(items: readonly {store: string; ref: string}[], reply: string): Array<{ source: {store: string; ref: string}; verdict: 'done' | 'replan' | 'release' | 'heard' }>`. It uses `closeFromReply`, plus `"\b([1-9])\b … done"` numbering (the brief numbers items when it lists more than one).

- [ ] **Step 1: Write the failing tests**
  - `"done" closes the only listed item`.
  - `"done" with two listed items closes neither and records heard on both`.
  - `"2 is done" closes the second item only`.
  - `"no, keep it" answers the keep-ask: stays open, listing count resets`.
  - `a crisis-screened text records nothing`.
  - `a reply after 72 h matches nothing` (the `REPLY_WINDOW_MS` from `checkin-replies.ts:24`).
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement.** Apply verdicts as in Task 3, with `via:'text'`.
- [ ] **Step 4: Run them; expect PASS**, then `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(outreach): a reply to alex's brief updates the todo it answers`

## Phase 3: one gate for every sender

### Task 6..9: Each sender asks `mayRaise` and records what it said

One PR per sender, each behind `RAISE_GATE_<SENDER>` (off). Each PR's test pins: `an item heard on a call 1 h ago is not raised` and `a send writes surface {via}`.

| Task | Sender                                                                                           | via                 | Replaces                                           |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------- |
| 6    | `scheduling/reminder-delivery-job.ts`, `outreach/reminder-texts.ts`                              | text / push / email | its own spacing                                    |
| 7    | `api/scheduled-jobs/commitment-push.ts`                                                          | push                | `dueForPush`, `followUpCount`                      |
| 8    | `proactive-channels/more-triggers.ts` (`commitmentTriggers`, `reminderTriggers`)                 | text                | the `proactive_outreach_log` dedupe for todo items |
| 9    | `superhuman/commitment-follow-up.ts:255-280` in-call check-in; `follow-through-opener.ts` dedupe | in-call / opener    | `askableOnCall`, `raisedByOpener`                  |

Each PR deletes the rule it replaces once its flag has been on in prod for a week (a follow-up PR, grep proof).

## Phase 4: cleanup and the rest of the stores

- **Task 10.** Delete `stores/item-mentions.ts`, freshness rules (b) and (c), and `MORNING_BRIEF_FROM_LEDGER` once it has been on in prod for a week.
- **Task 11.** Import `open_loops`, `action_items`, `pending_actions` and `errands` as follow-up sources, one PR each, using the Task 1 pattern. Merge them into existing follow-ups by `topicKey`.
- **Task 12.** Check that the expiry sweep runs (`sweepExpired`: undated after 14 days, dated 2 days past due). Wire it if not.
- **Task 13 (D4).** Email replies, once Seth decides.

## Rollout

Dev first, with Seth's cohort, in task order. Each flag goes on in prod only after a week on dev with the brief's run line showing `dropped`/`gate` counts. The success measure: over 7 mornings, no item is listed after Seth said it was done on any channel, and no item is listed on consecutive mornings unless it is due that day.
