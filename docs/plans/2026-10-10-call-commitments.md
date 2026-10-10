# Call commitments: promises from a call become timed follow-ups

2026-10-10. Status: design. Part 1 (the goodbye that closes the loop, `WRAP_UP`)
is built; this doc covers part 2, which waits on #690/#693/#694.

## What a great friend does

At the end of a call a good friend says "So you're calling the landlord
tomorrow, and I'll check in Thursday", and then on Thursday they actually
check in. Ferni does neither today. Part 1 handles the sentence. Part 2 is
about Thursday: the call's commitments, both ways, become timed follow-ups,
and a promise Ferni made is either kept or dropped honestly. It is never
silently forgotten.

## What exists (checked 2026-10-10 on origin/main 004768062 and the open PRs)

| Piece | Where | State |
|---|---|---|
| After-call task registry, fire-and-forget, per-task timeout | #694 `services/session/after-call-tasks.ts`, `agents/after-call-register.ts` | open |
| One after-call extraction pass → `WorldObservation[]` (`attribute: 'commitment' \| 'event'`, `eventDate` resolved in the caller's timezone) | #693 `intelligence/world-model/extraction/after-call-extraction.ts`, stacked on #690 | open, not yet registered as a task |
| Caller commitments captured live by regex → `bogle_users/{uid}/commitments`; next-call check-in note + one push per due commitment | #680 `COACH_FOLLOW_THROUGH` | open |
| Scheduled outreach to the user (`scheduleFollowUp`, `scheduleOutreach`) | `services/outreach/proactive-scheduler.ts` | on main |
| Reminders (`createReminder`, sms/call/in_app) | `services/scheduling/reminder-scheduler.ts` | on main; delivery to phone-only users is being fixed by the assistant-honesty work |
| In-call reading of what was decided, with `who: 'caller' \| 'ferni'` | part 1, `agents/personas/wrap-up.ts` | this PR, `WRAP_UP=on` |

## Gaps the design has to close

1. **Ferni's own promises have no source.** #693's prompt says "Never what
   Ferni said about itself" and "Ferni is never a subject". So "I'll check in
   Thursday" is never extracted, and that is the promise that matters most
   for honesty.
2. **After-call tasks run concurrently.** A consumer registered next to
   `world-extraction` cannot read that extraction's output, because nothing
   orders the two tasks.
3. **Caller commitments are already followed up by #680** (next-call opener
   plus a push). A second timed follow-up for the same commitment would nag.

## Design

### Source: the one extraction pass, extended by one field (no new LLM pass)

Add an optional `by?: 'caller' | 'ferni'` to `WorldObservation` (default
`caller`) and one line to #693's prompt: *"commitment also covers what FERNI
promised to do for the caller (check in, call back, remind them, look
something up): attribute commitment, subject self, by "ferni", with eventDate
when he gave a day."* Ferni's life stories stay out, because only promises to
the caller count. This keeps a single after-call LLM pass. If #693's owner
would rather not take it, the fallback is part 1's in-call reading (the
`who: 'ferni'` items), handed to the after-call context by sessionId. That
fallback is partial (it needs `WRAP_UP=on` and plan-cue turns), so it is not
the source of record.

### Ordering: a consumer of the extraction, not a sibling task

The `world-extraction` task publishes its result through a tiny hook in the
extraction module, `onWorldObservations(listener)`. Listeners run after the
facts are written, inside the same task's timeout budget. The commitments
consumer registers as a listener from its own register file, imported by
`agents/after-call-register.ts`. The registry stays unordered. Only this
consumer depends on that one producer.

### What gets scheduled

| Observation | Action |
|---|---|
| Ferni promise with a day ("I'll check in Thursday") | Schedule one check-in on that day through the existing user-outreach path, in the caller's timezone during their calling window. The message names what it's about ("how'd the landlord call go?"). |
| Ferni promise, no day ("I'll check in on that") | Check-in in 2 days at their usual time. |
| Caller commitment or event with eventDate, and no Ferni promise | No timed outreach. #680 brings it up on the next call or as its one push. We only make sure the commitment record carries the resolved `dueDate`, so #680's scan matches it. |
| Caller explicitly asked ("check on me Friday?") | Treated as a Ferni promise. |

The delivery channel is whatever the existing path picks for the user (app
push, SMS or call). The assistant-honesty work makes reminders and callbacks
reach phone-only users. This consumer calls that API and does not send
anything itself.

### Honesty: reuse the promise keeper (#275), don't build a second ledger

*Corrected 2026-10-10 after the first draft.* `services/superhuman/semantic-intelligence/promise-keeper.ts`
already does this for promises Ferni makes through a tool:

- `recordCheckInPromise(userId, { topic, dueBy })` stores an open promise in
  `ferni_commitments`.
- It is **kept** when Ferni asks about it in a conversation (follow-through.ts),
  or when its reminder goes out.
- It is **missed** when the every-minute deliver-reminders job's
  `sweepOverduePromises` finds it past due. Ferni then owns a missed promise
  once, in her next conversation (`getMissesToOwn`).

The gap is only that a promise *spoken* without a tool call ("I'll check in
Thursday") is never recorded. So the consumer calls `recordCheckInPromise` for
each Ferni promise, with `dueBy` resolved from its day. Where a timed check-in
can go out, it also creates the outreach, and the reminder settles the promise
as kept. There is no new collection: keep, miss and own already work, and
Trust's "I follow through" counts them.

### Flag

`CALL_COMMITMENTS=on` (default off), independent of `WRAP_UP` and
`AFTER_CALL_EXTRACTION` (which it requires; with extraction off it does
nothing and logs that once).

## Part 3: the recap text (`RECAP_TEXT`, built)

After a call that settled something, one SMS in Ferni's voice:

```
From our call:
You'll call the landlord tomorrow (555-0134).
```

It goes only to the verified phone on the user's Firebase account (#675), and
only when `bogle_users/{uid}/preferences/recap_text` has `optIn: true`.

- **Source.** Part 1's in-call reading, kept by sessionId past the agent's
  cleanup and taken once by the after-call task. There is no new model pass,
  and the wording is a template, so nobody is quoted.
- **When it skips.** No text after hard news, a crisis turn (the crisis gate
  marks the reading heavy), or a call where nothing was decided.
- **Quiet hours.** From 9pm to 8am local the text is queued as a pending
  reminder for 8am, and the reminder delivery job sends it through the same
  Twilio path. By then "tomorrow" reads "today", and that night's plans are
  dropped.
- **Ferni's own promises are left out** ("I'll check in Thursday"). They go
  back in once part 2 records them through the promise keeper, because a
  written promise that nothing keeps is a false one.

## Build order (each ≤400 lines, behind the flag)

1. #690/#693/#694 merge (other owners). Ask #693's owner for the `by` field
   and prompt line, or land it as a follow-up on their branch.
2. `onWorldObservations` hook in the extraction module, plus the
   `world-extraction` registration if #693 hasn't added it.
3. Consumer: Ferni promises → `recordCheckInPromise` + scheduled check-in through
   the existing path; dueDate written onto caller commitments for #680.
4. Next-call note for dropped promises (recall hook, next to #680's
   check-in note).

## Tests (through the real paths)

- The consumer gets observations for a call with "I'll check in Thursday" and
  creates exactly one outreach dated Thursday in the caller's timezone.
  Running it again creates none.
- A caller-only commitment creates no outreach and sets `dueDate`.
- Scheduling fails or there is no channel → the record is `dropped` with a
  reason, and the next call's recall note carries the honest line.
- Mutation checks on the dedupe key, the "caller-only → no outreach" rule
  and the drop path.

## Dev test plan (the lead runs it)

1. Dev, `WRAP_UP=on`, `TURN_UNDERSTANDING=shadow` (optional). Call: talk
   about a landlord problem, say "okay I'll call him tomorrow", let Ferni
   offer a check-in, then "alright I gotta go, bye". Expect `WRAP_UP_DECIDED`
   with items ≥1 before the goodbye, `WRAP_UP_NOTE` on the goodbye turn, and
   a goodbye with one closing sentence and no list. Control call: small talk
   then "bye" gives no `WRAP_UP_NOTE`. Hard-news call ("my dad's in the
   hospital… I'll drive up tomorrow… bye") gives no note.
2. Latency: compare the goodbye turn's reply gap (`perf/reply-gap-log`
   metric) with `WRAP_UP` on and off. The note adds no awaited work, so the
   gap should be within noise.
3. Part 2, once built: the same call with `CALL_COMMITMENTS=on` and
   `AFTER_CALL_EXTRACTION=on` gives an open `ferni_commitments` check-in with status
   `scheduled` and an outreach dated Thursday. Do not let it deliver to a
   real phone; use a test user.
