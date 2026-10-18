# GET /api/home

The iPhone app's Home Screen line and note. Read-only.

## Auth

`Authorization: Bearer <Firebase ID token>`. Anonymous Firebase users are fine. The
person is the token's uid and nothing else: `?userId=`, `x-user-id`, `x-firebase-uid`
and an admin flag are ignored. A service API key is refused (401), as is no token.

## Request

| Param | Where | Meaning |
|---|---|---|
| `tz` | query, optional | IANA zone (`America/New_York`) for the time of day. Missing or unknown gives the neutral `Hi.` |

## Response (200)

```json
{
  "greeting": { "kind": "followUp", "text": "the interview on Thursday", "topicId": "9f2c..." },
  "note": { "id": "6e0d15668ef07049", "text": "your sister moving to Denver", "createdAt": "2026-10-13T03:00:00Z" }
}
```

- `greeting.kind`
  - `followUp`: the follow-up the call opener would pick, in the person's own words (the
    app frames it). `topicId` is an opaque id of that follow-up.
  - `firstVisit`: the person has never had a call. Text `Hi, I'm Ferni.`
  - `timeOfDay`: `Good morning.` / `Good afternoon.` / `Good evening.` / `You're up late.`
    No name; the app keeps the name on the device.
- `note` is present only when there is a latest unraised, grounded pondered item. Never
  the generic "thinking about you" fallback. `id` is a stable opaque id (also what
  `from=note:<id>` carries, see from-note.md); `createdAt` is when the pondering pass ran.

No cache: responses are `no-store`.

## What decides the follow-up

The selection is shared with the voice agent, not copied:
`services/follow-through/opener-pick.ts` (`loadOpenerPick`), called by both the opener
(`agents/multi-agent/follow-through-opener.ts`) and Home. Same store, same rules: the
person's own things only, due or waiting for a call, not already raised by an opener,
nothing under a topic they asked Ferni to forget, and nothing at all when the forgotten
list cannot be read.

Home never marks anything surfaced; the opener does that when Ferni actually asks.

## Light topics only

The Home Screen is semi-public, so both the follow-up and the note must pass
`isLightTopic` (`src/api/home/light-topic.ts`). It takes the **union** of the two
classifiers in the repo, because neither covers the other:

- `isSensitiveThread` (`welcome-back.ts`): grief, health, money, relationships, job loss.
- `isSensitiveTopic` (`coach-media/result-text.ts`): fitness, sleep, diet, weight, injury,
  pain, plus health and money terms. This is the stricter one for body topics.
- A short legal and safety list (lawyer, custody, immigration, arrest, abuse, rehab, ...).

Stricter wins. A heavy pick becomes the time-of-day greeting; Home does **not** swap in
a lighter follow-up, so it never shows something other than what the opener would raise.
Ferni can still ask in the call, where the opener's own rule applies.

## Fallbacks

| Case | Result |
|---|---|
| `FOLLOW_THROUGH_OPENER` not `on`, no store, nothing qualifies, heavy pick, store error | `timeOfDay` |
| Never had a call and no follow-up | `firstVisit` |
| History unreadable | `timeOfDay` (not a first visit) |
| `PONDERING` not `on`, nothing unraised, heavy, pass time unknown, read error | no `note` |

Each half fails alone; the endpoint answers 500 only if the response itself cannot be
built. Logs carry no follow-up or note text.
