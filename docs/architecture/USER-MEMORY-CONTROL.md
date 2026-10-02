# User Memory Control

What users can see, change and delete about what Ferni remembers. Memories are
kept until the user deletes them.

> The fact/people/conversation API (`/api/memory/me`, export, delete-all) is
> documented by the memory-control service owner. This file holds the
> **Dates & reminders** and **Preferences** sections.

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

---

## Preferences

"Let Ferni remember my preferences too" — and actually behave accordingly.

### Model

One Firestore document per preference at `bogle_users/{uid}/preferences/{prefId}`.
`prefId = pref_<sha256(domain|key)[:24]>`, so re-learning the same thing updates
one document instead of adding another. (The old `preferences/settings` document
written by the previous `setPreference` tool is folded in once, on first read.)

| Field                                    | Meaning                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain`, `key`, `value`                 | What it is. Single settings use a fixed key (`responseLength`); list items carry the item in the key (`avoidTopic:my dad`, `dish:sushi`).  |
| `sentiment`                              | `like` / `dislike` for likes, media and food tastes.                                                                                       |
| `details`                                | Structured extras for `interests`, `media` and `food` (below).                                                                             |
| `source`                                 | `explicit` (the user said it outright) or `inferred` (learned from behaviour, facts, summaries, listening history).                        |
| `confidence`                             | 0–1; repeated evidence combines (`1-(1-a)(1-b)`).                                                                                          |
| `userEdited`                             | `true` for deliberate settings: Preferences page, account settings, meal-planning dietary settings, and the voice command ("call me Sam"). |
| `sourceConversationIds`, `sourceFactIds` | Provenance (conversations and B's `dynamic_facts`).                                                                                        |
| `createdAt`, `updatedAt`, `editedAt`     | ISO strings.                                                                                                                               |

Domains:

| Domain         | Keys                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | ------------- | ---------- | ------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- | ------- | -------- | ------------------------------------- |
| `conversation` | `responseLength` (short/medium/long), `tone`, `directness` (gentle/balanced/direct), `pace`, `humor` (none/light/lots), `followUpQuestions` (fewer/normal/more), `preferredName`, `pronouns`, `language` |
| `boundaries`   | `avoidTopic:<topic>`, `sensitivity:<topic>`, `doNotContact` (e.g. `21:00-08:00`, user's local time)                                                                                                      |
| `coaching`     | `accountabilityStyle` (gentle/balanced/firm), `motivationStyle`, `fourTendency`                                                                                                                          |
| `interests`    | `interest:<name>` with details `{ kind, level (curious→serious), relatedPeople, specifics, lastMentionedAt }`                                                                                            |
| `media`        | `artist                                                                                                                                                                                                  | genre                                                                                             | song:<name>`(music) and`show | movie         | book       | podcast | game                                                                      | team:<name>`with details`{ status, progress, opinion, contexts (moods/activities), memories, relatedPeople, origin }` |
| `food`         | needs: `allergy                                                                                                                                                                                          | intolerance:<item>`(details.severity),`diet:<pattern>`, `medical:<restriction>`; tastes: `cuisine | dish                         | comfort       | ingredient | drink   | restaurant:<name>`, `spiceTolerance`; cooking: `cookingSkill`, `signature | recipe                                                                                                                | equipment | routine | cooksFor | goal:<name>` (recipe details.outcome) |
| `likes`        | `activity                                                                                                                                                                                                | brand                                                                                             | place                        | other:<name>` |
| `practical`    | `units`, `temperatureUnit`, `distanceUnit`, `timeFormat`, `timezone`, `voiceSpeed`, `custom:<key>`. Reminder settings belong to Important Dates (not duplicated here).                                   |

### Precedence, evidence and tombstones

- **User edits > explicit > inferred.** A lower-ranked writer never changes the
  value, source or confidence of a higher-ranked one. When it agrees, it may only
  add provenance (and, for interests/media, bump `lastMentionedAt`).
- **Evidence threshold.** An inferred preference changes behaviour only when
  `confidence ≥ 0.85` or it was seen in **2+ conversations**. Explicit and
  user-edited preferences apply at once. Boundaries apply from `confidence ≥ 0.6`
  (caution). **Allergies and intolerances are honoured at any confidence.**
- **Tombstones.** Deleting a preference (page, API, "forget that I like jazz")
  writes `bogle_users/{uid}/memory_tombstones/{prefId}` with
  `{ createdAt, reason, kind: 'preference', domain, key }`. Automated capture
  skips tombstoned ids; a deliberate user setting clears the tombstone.
- **Music.** Explicit statements beat listening history; listening history
  (Spotify library sync, `origin: 'listening_history'`) beats nothing.

### Capture

- **Voice (explicit):** `setPreference` / `getPreferences` (existing tool names,
  now backed by this store; Gemini JSON path wired in all four files).
  `setPreference { type, value, action?: set|forget, detail?, status?, category?, statement? }`.
- **Live turns:** `transcript-handler.ts` calls `recordUserTurnPreferences`
  (explicit statements + the existing music and lifestyle extractors).
- **Session end:** `onConversationSummarized(userId, conversationId, summary, turns)`
  — user turns (explicit), summary (inferred, 0.6) and that conversation's
  preference-category facts from `dynamic_facts` (read-only).
- **Listening history:** `importListeningHistory(userId, { artists, genres })`,
  called after a Spotify library sync.
- **Other tools:** meal-planning `trackDietaryPreferences` → `recordDietarySettings`;
  `PUT /api/account/profile` → `syncAccountPreferences` (verbosity, topicsToAvoid).

### How Ferni uses it

- **Session start** (`agent-setup.ts`): a persona-agnostic
  "How They Like to Be Talked To" block (name, boundaries, food needs, style,
  coaching, interests, current shows, music, food, likes) within a 700-char budget,
  loaded in parallel with the prompts and bounded at 400 ms.
- **Proactive gates (hard constraints):** `isTopicAllowedProactively(userId, topic)`
  (fails closed), `getProactiveBoundaries(userId)`, `isContactAllowedAt(userId, date, tz?)`.
  Wired into proactive memory surfacing.
- **Food safety:** `getDietaryConstraints(userId)` filters meal-store recipe
  suggestions, is added to restaurant reservation requests, and adds an allergy
  reminder to restaurant search results. Medically advised restrictions are
  only used when the health category is enabled (`setHealthConsentCheck`).
- **DJ:** open-ended requests ("play something", "music for working") resolve via
  `resolveMusicQueryForUser` (mood associations > stated favourites > listening
  history; never a dislike).
- **Openers:** `getInterests(userId)`, `getMediaProfile(userId).inProgress`,
  `getFoodProfile(userId).followUps` — always gated by `isTopicAllowedProactively`.
- **Existing readers:** account view and the stored user profile's
  `preferences.verbosity` / `topicsToAvoid` mirror the profile.

### API

All routes use `requestUserId(req)` (verified uid or anonymous device id); ids are
looked up inside the caller's own subcollection, so another user's id is a 404.

| Method | Path                                            | Body                                           | Response                                                  |
| ------ | ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/memory/me/preferences[?domain=interests]` | –                                              | `{ preferences: (Preference & { active })[], updatedAt }` |
| POST   | `/api/memory/me/preferences`                    | `{ domain, key, value, sentiment?, details? }` | `201 { preference }` (user-edited)                        |
| PATCH  | `/api/memory/me/preferences/:id`                | `{ value?, sentiment?, details? }`             | `{ preference }`                                          |
| DELETE | `/api/memory/me/preferences/:id`                | –                                              | `{ deleted: true }` (tombstoned)                          |

Interests, media and food use the same routes (`domain=interests|media|food`).
Errors: 400 invalid body/details, 401 no identity, 404 not found / not yours, 405 method.

### Export and cascade hooks

- `exportPreferences(userId)` → `{ preferences, exportedAt }` (include in the export).
- `deletePreferencesFor(userId, conversationId)` — removes the conversation from
  provenance; a non-user-edited preference left with no evidence is deleted and
  tombstoned (`conversation_deleted`). Listening-history entries carry no
  conversation provenance and are unaffected.
- `deletePreferencesDerivedFromFact(userId, factId)` — same rule for fact provenance.
- `deleteAllPreferences(userId)` — wipes the profile (account-level delete-all).
