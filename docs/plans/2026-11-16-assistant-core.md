# The assistant core: tasks, reminders, calendar, goals, routines, threads

Status: accepted 2026-11-16 (Seth: "Go with your defaults and start P0"). P0 in progress.

## Why

Seth, 2026-11-16: "When can we focus on threads, tasks, todos, calendar, events,
milestones, projects, errands, workflows etc and all the things we need great
coaches and assistants to do and manage?"

A coach who forgets what you asked them to hold is not a coach. Two read-only audits of
`325ab27b1f` (every claim has a file and line in the audit notes) found that most of the
pieces exist, but almost none of them close the loop from "Ferni, remember this" to "it
came back to me at the right moment, and I can see it in the app".

## What is there today

| Capability           | Stored                                                          | By voice                                                                                                                | In the app                              | Comes back on its own                                                                                 | Verdict                                                                 |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Tasks / todos        | embedded in the profile doc (`productivityData.tasks`), no port | add, complete, list. Edit, reschedule and delete are written but not registered; `addTask` claims an update it can't do | nothing                                 | 8am text brief only, per-person flag                                                                  | partial                                                                 |
| Reminders            | `bogle_users/{uid}/reminders` (3 writers)                       | set, list, cancel (+3 overlapping "later" tools)                                                                        | read-only inside the calendar view      | `deliver-reminders` every minute, but SMS and push default off, so most land only in the in-app inbox | partial                                                                 |
| Calendar             | Google, Apple, Outlook (flag off); Ferni's own list             | 21 tools; reads work                                                                                                    | today/week view, settings; no add-event | 15-min pre-meeting push, 7am brief                                                                    | partial: writes to the real calendar off (`CALENDAR_WRITE_TO_PROVIDER`) |
| Appointments         | in-memory `Map` (lost on restart)                               | `manageAppointment`, concierge tools                                                                                    | none                                    | only after a business call comes back through Twilio                                                  | stub                                                                    |
| Goals / milestones   | `profile.lifeData`                                              | create only; progress, milestone, reflect, countdown are unreachable                                                    | none                                    | none (outreach code has no callers)                                                                   | partial                                                                 |
| Projects             | in-memory `Map`                                                 | 5 tools, no persona picks them                                                                                          | none                                    | none                                                                                                  | stub                                                                    |
| Routines / workflows | `users/{uid}/life_automation/workflows`                         | two tool domains over one store                                                                                         | "What I Do For You"                     | phrase and calendar triggers yes; time-of-day never runs (#2778)                                      | partial                                                                 |
| Errands              | `bogle_users/{uid}/errands` + outbox, behind `ERRANDS`          | none; nothing creates one                                                                                               | `/api/on-it`, flag off, no UI           | none                                                                                                  | stub                                                                    |
| Commitments          | `bogle_users/{uid}/commitments` (2 writers)                     | 3 duplicate tool sets, 11 tools                                                                                         | Hub "On Your Mind", after-call, iOS     | check-ins behind `COACH_FOLLOW_THROUGH` (off)                                                         | partial, closest to whole                                               |
| Threads / open loops | 7 overlapping stores                                            | no tool                                                                                                                 | Hub "Open Threads"                      | greeting thread-starter; follow-through behind off flags                                              | partial                                                                 |
| Important dates      | 5 stores                                                        | birthday tools save to process memory                                                                                   | contact dates screen                    | nothing fires                                                                                         | near stub                                                               |

Two shapes repeat everywhere:

1. **Built, then left off.** Delivery to the phone, real calendar writes, follow-through
   and the promises panel are all written and tested, and all default off.
2. **More than one way to do each thing.** Three commitment tool sets, four "remind me
   later" paths, two routine domains, five date stores, seven thread stores. AGENTS.md
   says "one way to do each thing"; `apps/cli/src/commands/quality/decisions.ts` has no
   owner row for tasks, reminders, commitments, routines or threads, so nothing stops a
   ninth.

## The shape we build toward

One rule for the user: **anything Ferni agrees to hold is in one list, comes back at the
right moment, and can be seen and closed in the app.**

- **One owner per kind**, named in `decisions.ts` (provisional until #3958): tasks
  (`productivity/tasks#createTask`), reminders (`scheduling/reminder-scheduler#createReminder`),
  commitments (`superhuman/commitment-keeper#saveCommitment`), calendar events
  (`calendar/unified-calendar-store#createEvent`), goals (`life-planning/goal-management#createGoal`),
  routines (`stores/workflow-store#createWorkflow`). Duplicates become thin callers of the
  owner, then get deleted.
- **One scheduler.** Everything time-based becomes a row the Cloud Scheduler jobs already
  deliver (`reminders`, `scheduled_actions`), never an in-process timer.
- **One "Today" surface** in the Hub: due tasks, today's reminders, open commitments and
  today's events, each closable with a tap that closes it at its source.
- **The follow-through ledger** (`docs/plans/2026-10-12-follow-through.md`) stays the
  record of what Ferni promised; this plan feeds it, it doesn't replace it.

## Phases (each PR ≤ ~400 lines, new behaviour behind an off flag)

**P0. Measure and fence (first, small).**

- An `assistant-core` voice-eval scenario set, scored on two things per ask: the store
  changed as asked (read the eval user's records on `ferni-dev` after the call), and what
  Ferni said about it is true (no "done" without the write, no Google claim with the flag
  off). Baseline it on dev before any change. `scripts/voice-eval/` is sealed from
  builders, so its holder builds the set from the spec below; builders only run it.
- Owner rows in `decisions.ts` for the six kinds above, so `pnpm quality:decisions`
  fails a new duplicate. (Landed with this plan.) The fingerprints are broad on purpose
  and will catch some look-alikes: a job-queue `createTask`, a finance `saveGoal`, a
  `createXEvent` in a file that mentions calendar. Narrow a row when one of those blocks
  real work, rather than renaming the code to dodge it.

The eval spec. One call per line; "then" is what must be true after the call.

| #   | The caller says                                           | Then                                                                                            |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | "Add pick up the dry cleaning to my list."                | one open task with that title                                                                   |
| 2   | "What's on my list?" (after 1)                            | Ferni names the dry cleaning; no invented tasks                                                 |
| 3   | "I picked up the dry cleaning, cross it off."             | that task is completed                                                                          |
| 4   | "Move the dry cleaning to Friday."                        | task due Friday, or Ferni says plainly he can't move it yet                                     |
| 5   | "Delete the dry cleaning one."                            | task gone, or an honest "I can't delete yet"                                                    |
| 6   | "Remind me at 5 to call my sister."                       | one reminder at 17:00 caller time, nothing at a time never said                                 |
| 7   | "What reminders do I have?"                               | Ferni lists the 5pm one and only real ones                                                      |
| 8   | "Cancel that reminder."                                   | reminder cancelled                                                                              |
| 9   | "Put a dentist appointment on Thursday at 2."             | one event Thursday 14:00; Ferni says where it was saved (Ferni's calendar unless writes are on) |
| 10  | "What's on my calendar tomorrow?" (no calendar connected) | "not connected", never "nothing"                                                                |
| 11  | "I want to run a 10k by March."                           | one goal with a March target                                                                    |
| 12  | "I ran 5k today, that's progress on my 10k."              | goal progress recorded, or an honest "I noted it" with no false progress claim                  |
| 13  | "Every weekday at 7, remind me to stretch."               | a recurring reminder or routine that the scheduler will deliver                                 |
| 14  | "I'll send that email to my landlord tomorrow."           | one commitment captured, due tomorrow                                                           |

Baseline expectation from the audits: 4, 5, 12 and 13 fail today, and 9 lands only in
Ferni's own calendar.

**P1. Tasks that work.**

- One `updateTask` tool (rename, due date, priority, delete) replacing the four
  unregistered ones; fix `addTask`'s description. Delete the dead copies with grep proof.
- Tasks move to `bogle_users/{uid}/tasks` behind a port, read old and new during rollout.
- A task with a due time writes a reminder row, so it comes back.
- `GET /api/tasks` and the Hub "Today" list (read, then tap to complete).

**P2. Reminders that reach you.** Mostly a rollout, not a build: `REMINDER_TIME_FROM_CALLER`,
`REMINDER_IN_APP_PUSH`, then `ASSISTANT_ACTIONS_REAL` / `REMINDER_SMS_DEFAULT` for verified
numbers; dev, eval, cohort, prod. Fold `scheduleProactiveReminder` and Alex's legacy set
into `setReminder`. A reminders list in "Today".

**P3. The calendar is really yours.** Roll out `CALENDAR_WRITE_TO_PROVIDER`; persist
`manageAppointment` as calendar events (no more in-memory Map); add an add-event sheet to
the calendar view; a reminder before each appointment Ferni booked.

**P4. Goals, milestones, projects.** One `manageGoal` with real actions (progress,
milestone, reflect, list); a project becomes a goal with a task checklist, not a third
store; delete the in-memory projects domain. A "What we're working on" card, and a
check-in on a stalled goal through the follow-through ledger.

**P5. Routines that run.** Time-of-day routines become `scheduled_actions` rows the
existing every-minute job delivers (#2778); merge the `routines` and `workflows` tool
domains into one.

**P6. Threads, dates, errands.** Join, don't fork: threads and the "one follow-up" go
through the right-moment program (#3672, `2026-11-07-right-moment-program.md`). Dates:
roll out `DATES_THAT_MATTER`, write birthday tools to `world_facts`, and a birthday becomes
a reminder row. Errands get a creator only after P1 to P3 land.

## Decisions (Seth, 2026-11-16: the defaults)

1. **Who does this on a call?** Ferni handles every assistant ask himself in any call
   (it's what people ask him), with Alex for deeper planning sessions
   (`ALEX_CHIEF_OF_STAFF`).
2. **How a reminder reaches you.** App push, and a text only to a verified number the
   person has said yes to.
3. **Writing to the real calendar.** Once connected, Ferni writes the event and says
   "added to your Google calendar"; he doesn't ask before each write.

## Not in this plan

Proactive check-in policy (quiet hours, cohorts, crisis holds) stays with
`2026-11-07-right-moment-program.md`. Persona tool caps (`PERSONA_TOOLSETS`) are a
separate decision.
