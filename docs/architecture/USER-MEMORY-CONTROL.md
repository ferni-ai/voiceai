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
