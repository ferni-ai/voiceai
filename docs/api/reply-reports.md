# Reporting a reply: `POST /api/reports`

People can report something Ferni said without leaving the app. Google Play's
AI-generated content policy and Apple's App Review guideline 1.2 both ask for
this. The web app, the Android app (a TWA of the web app) and the native
iPhone app all call this one endpoint. Code: `src/api/reply-reports/`.

## Request

```
POST /api/reports
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

Any verified Firebase user may report, anonymous accounts included. With no
token, or an invalid one, the answer is `401`.

| Field        | Type                                                 | Required                    | Notes                                                                                                            |
| ------------ | ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sessionId`  | string, 1–200                                        | yes                         | The call the reply is from: the LiveKit room name, or a stored conversation id (`conv_…`) when the app has one.  |
| `turnId`     | string, 1–200                                        | one of `turnId`/`messageAt` | A stored turn id, when the app has one (it only does when it read the turn from the server).                     |
| `messageAt`  | number (epoch ms) or ISO 8601 string                 | one of `turnId`/`messageAt` | When the reply was shown or finished speaking, on the device clock.                                              |
| `reason`     | `"harmful"`, `"wrong"`, `"inappropriate"`, `"other"` | yes                         | Anything else is `400`.                                                                                          |
| `note`       | string, up to 500 characters                         | no                          | The person's own words. Over 500 is `400`; enforce the limit in the UI.                                          |
| `textHint`   | string, up to 400 characters                         | no                          | The reply's words as shown on screen. Only used to tell apart replies close in time. **Never stored or logged.** |
| `appVersion` | string, up to 40                                     | no                          | The app's version, e.g. `CFBundleShortVersionString (CFBundleVersion)` on iOS.                                   |
| `platform`   | `"web"`, `"android"`, `"ios"`                        | no                          |                                                                                                                  |

Example from the iPhone app, reporting a reply shown in live captions:

```json
{
  "sessionId": "voice-1760799600000",
  "messageAt": 1760799626000,
  "textHint": "the words shown in the caption",
  "reason": "wrong",
  "note": "Optional, what was wrong with it",
  "appVersion": "2.0 (41)",
  "platform": "ios"
}
```

## Response

| Status | Body                                                       | Meaning                                                                                             |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `201`  | `{ "ok": true, "reportId": "…", "matched": true }`         | Stored. `matched: false` means the reply wasn't found in the transcript; the report is kept anyway. |
| `400`  | `{ "error": "Invalid request body: …" }`                   | Bad reason, note too long, or neither `turnId` nor `messageAt`.                                     |
| `401`  | `{ "error": "…" }`                                         | No valid Firebase token. Refresh the token and retry once.                                          |
| `429`  | `{ "error": "…", "retryAfter": 42 }` or `{ "error": "…" }` | Over 5 reports a minute, or 20 a day (UTC), per person.                                             |
| `503`  | `{ "error": "…" }`                                         | Storage unavailable. Keep the report and retry later.                                               |

Show the person the same thank-you for every `201`, matched or not: "Thanks, a
person will look at this." On `429`, say they've sent a lot of reports today.

## What the server stores

One document per report in `reply_reports` (admins read; no client reads or
writes, see `firestore.rules`). The reply text is **copied from the server's own
transcript** (`bogle_users/{uid}/conversations/{id}/turns`), never taken from the
request, so a report can't put words in Ferni's mouth, and only the caller's own
calls are searched.

How the reply is found:

1. The call: the conversation named by `sessionId` if it is one of the caller's,
   else the caller's latest calls started before `messageAt`.
2. The reply: the assistant turn with `turnId`; or the assistant turn whose
   stored time is within 2 minutes before to 1 minute after `messageAt`,
   preferring one that contains at least 60% of the `textHint` words, then the
   nearest in time.
3. The person's turn just before that reply is stored with it.

Stored fields: `uid`, `isAnonymous`, `reason`, `note`, `sessionId`,
`requestedTurnId`, `messageAt`, `matched`, `matchedBy` (`turn_id`,
`text_and_time` or `time`), `conversationId`, `turnId`, `replyText`,
`userTurnText`, `replyAt`, `personaId`, `appVersion`, `platform`,
`serverVersion`, `status: "open"`, `createdAt`. Logs carry the report id, reason
and match result only, never text. Reports are exported with, and erased by,
account deletion (`src/services/platform/user-stores.ts`).

## Daily summary

`POST /api/jobs/reply-reports-summary` (Cloud Scheduler, scheduler auth) counts
the last 24 hours by reason and raises the `reply-reports:daily` ops alert, which
the "Ferni ops alert" policy emails to the operator. Counts only.

The Cloud Scheduler job that calls it is not created yet (it needs the
operator's OK). Once approved, run this against the production API, with the
same service account as the other `/api/jobs/*` jobs:

```bash
gcloud scheduler jobs create http reply-reports-summary --project=johnb-2025 \
  --location=us-central1 --schedule="0 8 * * *" --time-zone="America/Los_Angeles" \
  --uri="https://app.ferni.ai/api/jobs/reply-reports-summary" --http-method=POST \
  --oidc-service-account-email=<the scheduler service account>
```
