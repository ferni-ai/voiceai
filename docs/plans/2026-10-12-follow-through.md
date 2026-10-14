# Follow-through: one record of what's open, one way to deliver it

Status: approved direction (Seth, 2026-10-12: texts for delivery, yes to Google Calendar). Owner: follow-through lane.

## Why

A friend remembers what you said you'd do, brings it up once at the right moment, and lets it go when it's done. Ferni has the pieces but not the loop. From the assistant audit (`voiceai-evidence/assistant-audit-2026-10-11/report.md`) and the code map of origin/main 7bd5cc4e4:

- **Many stores, no delivery.**
  - Reminders, recurring and location reminders, medications, three birthday stores, user commitments, Ferni's own promises, `open_loops`, call-summary `followUpItems` and pondered follow-ups each keep their own record.
  - Only `bogle_users/{uid}/reminders` ever fires, and it lands in the web app's inbox.
  - Recurring reminders, doses and dates never fire. `scheduleMilestone` and `saveSpecialDate` have 0 callers.
- **Several threads at once, and some of them stale.**
  - The greeting can raise a commitment check-in.
  - The first recall note then adds up to two more commitments and three "open threads from last time".
  - `loadCallCheckIns` marks a commitment followed up when it _loads_, not when Ferni asks.
- **Live memory baseline (2026-10-12).** Ferni brought up the relevant past thread unprompted in 0 of 3 cases, and opened 2 of 3 calls generically.

## The model

A **follow-up** is one thing Ferni should follow through on for a person. It lives in the `growth` context (L3), `src/services/follow-through/`, in one store, `bogle_users/{uid}/follow_through/{id}`. The name avoids `OpenLoop`: `open-loops.ts` and the `open_loops` collection already exist and become a source.

| Field           | Meaning                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `kind`          | `reminder`, `commitment` (caller's own), `promise` (Ferni's), `thread` (summary follow-up), `date`, `dose` |
| `text`          | What to bring up, in the caller's words where we have them                                                 |
| `dueAt`, `zone` | UTC instant and the caller's IANA zone; `dueAt` null means "next good moment"                              |
| `repeat`        | null, or `{ every: 'day' \| 'week' \| 'year', at: 'HH:mm' }` in `zone`                                     |
| `source`        | `{ store, ref }`, so imports are idempotent and the old record can be closed too                           |
| `status`        | `open` → `surfaced` → `done` \| `released` \| `expired`; replanning moves `dueAt` and returns it to `open` |
| `surfaced`      | When and how: `opener`, `in-call` or `text`                                                                |

**Rules:**

- A repeating follow-up goes back to `open` with its next `dueAt` when it closes as `done`.
- `expired` is set by a sweep, for undated threads after 14 days and dated ones 2 days past due.
- `released` means the caller let it go ("forget it"), and nothing re-raises it.

**Ports and pure parts (L3):**

- `FollowUpStore`: `open`, `due`, `changedBetween`, `markSurfaced`, `resolve`, `release`, `defer`, `sweepExpired`.
- `RightMomentPolicy` (`right-moment.ts`): given a follow-up and now, it returns `text-now`, `next-call`, `wait` or `expire`. It uses the shared `wallTimeIn` and `zonedWallTimeToUtc` in `src/utils/time-zone.ts` (L2, from the timezone lane's #1182). `grounded-checkin.ts` keeps its own copy until #1081/#1170 merge, then switches.
- `closeFromReply`: a whole-word classifier for `done`, `replan` or `release`.

Firestore lives in an L1 adapter (`src/services/stores/follow-through-store.ts`). L3 never reads flags; the L4 caller passes the decision in.

## Moments

- **Opener.** One thread per call, chosen by an arbiter built on #1000's `opener-claim`.
  - Candidates: a due follow-up, a win (`bogle_users/{uid}/wins`, from the coach lane), a check-in, a pondered item, a welcome-back thread.
  - A win outranks anything not due within the hour.
  - `markSurfaced` runs only when the greeting actually spoke it.
  - Wired to the existing, unread `OPENER_FOLLOW_UP` flag; no new flag.
- **In call.** The caller's next reply to a raised follow-up runs `closeFromReply`.
- **Text.** One delivery job. For due follow-ups whose policy says `text-now`, it sends at most one text per person per run.
  - It goes through the guarded sender extracted from #993: verified phones, STOP/START, 20 h cap, HMAC phone hashes.
  - Each send is written to `feature_checkins` with `kind: 'follow-up'`, so replies route to it.

## Gates

- **Per person:** Firestore cohort flags `FOLLOW_THROUGH_TEXTS` and `OPENER_FOLLOW_UP` (friends-and-family first).
  - The job reads them with `resolveCallerFlags` and never sets process env.
  - Env on `john-bogle-ui` is replaced on every deploy, so hand-set UI env cannot be a gate.
- **Job kill switch:** `FOLLOW_THROUGH_JOB`, set in `deploy-production.yml`'s env list, default off.
- **No dev scheduler exists.** Delivery is proven with `?dryRun=true` and with a cohort of one (Seth) before mom and Mindy.

## PRs (each ≤400 reviewable lines, off by default)

| #   | PR                                                                                                                                 | Needs                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | This plan, plus domain core: types, state machine, `RightMomentPolicy`, `closeFromReply` (pure, L3), layer map entry               | none                                      |
| 2   | Store adapter (L1) and Firestore indexes                                                                                           | 1                                         |
| 3   | Import from sources after each call: commitments, pending reminders, summary `followUpItems` (`FOLLOW_THROUGH_IMPORT`)             | 2                                         |
| 4   | Opener arbiter on `OPENER_FOLLOW_UP`; raise once, mark when spoken; fixes the mark-on-load bug                                     | 2, #1000                                  |
| 5   | Close from the caller's reply, in call                                                                                             | 4                                         |
| 6   | Extract `sendGuardedText` from #993, no behaviour change                                                                           | #993                                      |
| 7   | Delivery job, scheduler entry, kill switch                                                                                         | 2, 6, timezone helper                     |
| 8   | One path per person: skip the old reminder SMS and commitment push for `FOLLOW_THROUGH_TEXTS` users; reminder SMS honours opt-outs | 7                                         |
| 9   | Push Ferni-created calendar events to Google (`google-push.ts`, `CALENDAR_PUSH_GOOGLE`); delete the uncalled `sync-engine.ts`      | timezone fix in `smart-calendar-tools.ts` |
| 10  | Sources for doses and dates (one `important_dates` reader); deliver or delete recurring/location reminders                         | 7                                         |
| 11  | Weekly reflection pilot on top of follow-ups; delete `reflection-sunday.ts`                                                        | 4, 7                                      |

**Shared with other lanes:**

- Times come from the timezone lane's `formatStoredLocalTime(utcIso, zone)`.
- Wins come from the coach lane.
- #1000 (pondering opener) and #993 (check-in sender) land first.
- `reminders.ts` is not touched until the timezone and readback PRs merge.

## How we'll know

- **Unit level:** each PR's tests fail when its behaviour is missing.
- **Live memory harness:** unprompted and opener improve from 0/3 and 1/3 (baseline `memlive-base10120526`). Supersession is the memory lane's.
- **Assistant scenarios:** "remind me tomorrow at noon" texts at noon local, once. A medication "every morning" repeats. Ferni raises one thread per call and never one already closed. Each is run one call at a time, twice.
