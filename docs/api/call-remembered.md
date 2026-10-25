# GET /api/memories/from-call (the "I'll remember" card)

What Ferni kept from the call that just ended: up to three items, for the app's
end-of-call card. Read-only, never cached.

## Did a route already exist?

No. The web card (`apps/web/src/ui/after-call/after-call-data.ts`) fetches the whole
`GET /api/cognitive/memories` list and filters by `learnedAt` in the browser. That list
carries no ids usable by the recall-level forget/correct routes and no light-topic
filter, so the iPhone card would have had to do both itself. This route does it on the
server, on the same facts recall reads.

## Request

`GET /api/memories/from-call?since=<call start>` with `Authorization: Bearer <Firebase ID token>`
(anonymous Firebase users are fine).

- `since`: the call start as 13-digit epoch milliseconds or a full ISO time
  (`2026-10-18T19:30:00Z`). Missing or anything else is 400. Older than 6 hours is
  clamped to 6 hours ago; a call can't be longer.
- The person is the token's uid only. `?userId=`, `x-user-id`, `x-firebase-uid` and an
  admin flag are ignored. A service API key is 401.
- **404 unless `MEMORY_VIEW=on`**, like `/api/memories/remembered`, because the card's
  buttons are that route's.

## Response (200)

```json
{ "items": [ { "id": "3f9a...", "subject": "you", "detail": "dog name: Biscuit", "learnedAt": "2026-10-18T19:41:02.000Z" } ] }
```

Newest first, at most 3, possibly empty (the app then shows nothing, no filler).

- **Forget:** `DELETE /api/memories/remembered/:id`.
- **Not quite:** `PATCH /api/memories/remembered/:id` with `{ "value": "..." }`.
  Both take the `id` returned here; a forgotten or corrected item is gone from the
  next call and from this list.

## What is included

The facts recall reads (`memory/recall/memory-control.ts` `listRemembered`: not
forgotten, not unsure, not about a forgotten topic, each fact once), then:

- `learnedAt` at or after `since` (and not in the future beyond 5 minutes of clock
  skew). A fact seen again refreshes its date, so "learned" means "touched by this call".
- Not an earlier fact (replaced by a newer one) and not one the person typed in the app.
- **Light topics only** (`src/api/home/light-topic.ts`, the same filter as Home: the union of
  `isSensitiveThread`, `isSensitiveTopic` and a short legal/safety list).
- The same thing twice shows once.
- **Nothing at all after a crisis signal in the last 14 days** (`hadRecentCrisis`).

A read that fails is a 500, not an empty list.

## Known gaps

- **Caller provenance is UNCONFIRMED at the fact level.** The "zero items whose source is
  a persona line" guardrail is enforced on call summaries (`callerProvenance`), not on
  `dynamic_facts`. The extractor is fed per-turn transcripts by `fast-capture`; I did not
  verify that they exclude Ferni's own lines. Read ~20 cards against Seth's account
  before the panel sees them.
- Items are `subject` + `detail` ("dog name: Biscuit"), not the person's verbatim words.
  The app composes the sentence.
- The "next thing you said you'd do" is not here: use `GET /api/commitments?status=active`.
- Facts are extracted shortly after each turn, so an item from the last seconds of the
  call may appear on a re-fetch a few seconds later. Fetch once the call has ended.
