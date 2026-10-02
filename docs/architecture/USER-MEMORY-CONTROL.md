# User Memory Control

What users can see, change and delete about what Ferni remembers. Memories are
kept until the user deletes them.

> The fact/people/conversation API (`/api/memory/me`, export, delete-all) is
> documented by the memory-control service owner. This file currently holds
> the **Dates & reminders** section; merge the two when both land.

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
| `bogle_users/{uid}/memory_tombstones/{id}`            | Written on delete (`kind: 'aspiration'`), so inferred capture can't add it back.                                                                          |

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
onConversationSummarized(userId, conversationId, summary, turns)      // capture pipeline hook
getAspirationsForSession(userId)                                       // session-start block
getHabitPatterns(userId)                                               // for insights
exportAspirations(userId)                                              // memory export
deleteAspirationsFor(userId, conversationId)                           // conversation delete cascade
deleteAllAspirations(userId)                                           // "delete all my memory"
```

### HTTP API

Verified caller only (`requestUserId(req)`); another user's id is 404, no
identity is 401.

| Method | Path                                       | Body                                                                                                                                                                 | Response                                  |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| GET    | `/api/memory/me/aspirations`               | –                                                                                                                                                                    | `{ aspirations: AspirationView[], timeZone }` |
| POST   | `/api/memory/me/aspirations`               | `{ level, title, why?, parentId?, targetDate?, category?, milestones?: [{ title }], schedule?: { frequency, days?, timesPerDay?, reminderTime? }, glidepathLevel?, loop?, stackAnchor? }` | `201 { aspiration }`                       |
| PATCH  | `/api/memory/me/aspirations/:id`           | any of the above plus `status`, `progress`, `milestones: [{ id?, title, done? }]` (`null` clears optional fields)                                                    | `{ aspiration }`                           |
| DELETE | `/api/memory/me/aspirations/:id`           | –                                                                                                                                                                    | `{ deleted: true }`                        |
| POST   | `/api/memory/me/aspirations/:id/check-ins` | `{ status: 'done' \| 'missed', date?: 'YYYY-MM-DD', note? }`                                                                                                        | `{ aspiration }`                           |

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

| Say                                                    | What happens                                     |
| ------------------------------------------------------ | ------------------------------------------------ |
| "Someday I want to live by the sea"                    | dream captured (explicit)                        |
| "My goal is to run a half marathon by June"            | goal captured / `addGoal` (deadline scheduled)   |
| "I'm trying to meditate every morning"                 | daily habit captured / `createHabit`             |
| "I did my run today" / "I skipped my run"              | check-in on the matching habit / `logHabitCompletion` |
| "I'm letting go of that dream"                         | status `let-go` (only when it's clear which one) |
| "What are my goals?" / "How are my habits going?"      | `getGoals` / `getHabits`                         |
