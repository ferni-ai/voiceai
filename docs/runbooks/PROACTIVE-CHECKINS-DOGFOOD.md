# Proactive check-ins: dogfood plan (Seth)

Ferni reaches out on her own: a note in the app, a text, or a call, when she
has a real reason. Built in #803 (channel policy + log), #833 (Gemini text +
"less" / "not now" / "stop" replies), #841 (more reasons + settings API),
#848 (the call), #854 (the agent refuses unsigned proactive calls).
Everything is off unless `PROACTIVE_CHANNELS=on` and the user's uid is in
`PROACTIVE_CHANNELS_USERS`.

## What Seth will get

| When | How |
|---|---|
| Ferni said "I'll check in about X" and they haven't talked since | the next day, a text |
| Ferni said "I'll call you about X" | a call (at most one a day), else a text |
| "Let me know how the interview goes" | the evening after, a text |
| A reminder he set didn't reach him | the same day, a text owning up to it |
| Something he said he'd do comes due (`COACH_FOLLOW_THROUGH=on`) | a text: "Last time you said ... How did it go?" |
| The daily check-in (no specific reason) | a note in the app only, never a text or call |

The words are written by Gemini from the reason and nothing else. If that
fails, a prepared line goes out. The same words never go out twice in a row.

## His settings (gentle)

- Texts and calls on; frequency `gentle`: at most 3 check-ins a day, at most
  2 texts, at most 1 call.
- Quiet hours 21:00 to 08:00, always, in his own time zone:
  `outreachPreferences.timezone`, else `contactInfo.timezone`, so either must
  be `America/New_York` and the other unset or the same. A window he sets
  can add quiet time, never remove it. Calls only 9:00 to 20:30.
- Back-off: after two texts with no conversation since, notes in the app
  until he talks to Ferni again. After a missed or declined call, no calls
  for three days.

Set them signed in as Seth (Firebase ID token):

```bash
curl -X POST https://app.ferni.ai/api/outreach/preferences \
  -H "Authorization: Bearer $FERNI_ID_TOKEN" -H 'Content-Type: application/json' \
  -d '{"preferences":{"enabled":true,"allowedChannels":["sms","call"],
       "proactiveFrequency":"gentle"}}'
```

## Verify his phone first (#675)

Texts and calls go only to the number on his Firebase account, never a
profile number. In the app: Settings → Contact info → enter the number →
Verify → type the code that arrives by text. The confirm puts the number on
his Firebase account. Check it in the Firebase console (Authentication → his
user → Phone). Without it, everything stays in the app.

## Saying "less" or "stop"

Text back to any proactive text:

- **less**: one step down (normal → gentle → light; light = one a day, no calls).
- **not now** (or "later", "busy"): nothing for 12 hours; counts as declined.
- **stop**: proactive check-ins off. This also unsubscribes the number from
  all Ferni texts at Twilio. Reply **START** to undo the Twilio part, then
  set `proactiveFrequency` back with the curl above.

Any other reply counts as an answer, so texts don't back off.

Or use the same curl with `"proactiveFrequency":"light"` or `"off"`.

## Turning it on (lead)

1. #803, #833, #841, #848, #854 and #631 are on main. For calls,
   `PROACTIVE_REASON_OPENER=on` must be set on the voice agent, so Ferni waits
   for him to pick up and says why she called, and the server and the agent
   must share `DISPATCH_SIGNING_SECRET` (#1706): without it the agent refuses
   the check-in context, so Ferni doesn't know why she called.
2. On the UI service, `deploy-production.yml` (the only web deploy path since
   #1835) sets `PROACTIVE_CHANNELS=on` and mounts `PROACTIVE_CHANNELS_USERS`
   from the Secret Manager secret `proactive-channels-users` (project
   johnb-2025; comma-separated Firebase uids). This repo is public, so uids
   never go in the workflow. `--set-env-vars` replaces every variable on each
   deploy, so flags belong in that line, not a one-off `gcloud` change. To add or remove someone, add a secret version;
   the next deploy picks it up. Optionally `COACH_FOLLOW_THROUGH=on`.
3. Texts: the sending number (`twilio-phone-number`) must have an approved
   A2P 10DLC campaign, or be a verified toll-free number. Otherwise carriers
   drop the text (Twilio error 30034) after Twilio accepted it, and the log
   still says `sent`.
4. Dry run first: `POST /api/jobs/deliver-scheduled-actions?dryRun=true`
   (scheduler auth). The `proactive.users` field says what would go out, on
   which channel, and why, and nothing is sent. It shows nothing until the
   deploy with `PROACTIVE_CHANNELS=on` is live.

## Watching it

Every check-in is logged in `bogle_users/{uid}/proactive_outreach_log`:
channel, trigger kind, reason, why that channel, the text and who wrote it
(`textSource`: llm / template / fallback), outcome (sent, replied, declined,
answered, no_answer, busy, failed), and `fallbackFrom` when a text or call
didn't go through.

## Rollback

Unset `PROACTIVE_CHANNELS` (or add a `proactive-channels-users` version
without his uid and redeploy). The daily run goes back to its old path, and
nothing proactive is sent.
