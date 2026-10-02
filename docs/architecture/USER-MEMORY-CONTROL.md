# User Memory Control

How people see, correct and delete what Ferni remembers about them. Memories
are kept until the user deletes them.

> The memory control API (facts, people, conversations, export, delete-all) is
> documented by its owner in this file as well; this document's **Preferences**
> section covers the preference profile, which sits alongside it.

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
