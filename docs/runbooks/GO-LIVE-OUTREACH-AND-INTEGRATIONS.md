# Go-live: outreach, voice sign-in and integrations

The code paths are fixed and tested on branch `claude/voiceai-ui-bugs-mjcocr` (PR #107).
Production still needs the switches below. Each one is a one-time setup. Nothing here can
be done from the repository alone.

## 1. Secrets (UI API service `john-bogle-ui`)

```bash
pnpm secrets:check          # lists every catalog secret missing from Secret Manager
printf %s "$VALUE" | gcloud secrets create <secret-name> --data-file=- --project johnb-2025
ferni deploy ui             # mounts every catalog secret that exists
```

The catalog is `infra/secrets/ui-service.json`. Deploys mount whatever exists and report
the rest, so a missing secret never fails a deploy. Priority order:

| For | Secrets |
| --- | --- |
| Calls and texts | `twilio-account-sid`, `twilio-auth-token`, `twilio-phone-number`, **`sip-trunk-id`** |
| Payments | `stripe-secret-key`, `stripe-webhook-secret` (or `stripe-monetization-webhook-secret`), `stripe-price-*` |
| Music | `spotify-client-id`, `spotify-client-secret` |
| Calendar/mail | `microsoft-client-id`, `microsoft-client-secret` (Google Calendar is already set) |
| Wearables | `oura-*`, `whoop-*`, `fitbit-*`, `garmin-*`, `eight-sleep-*` (client id and secret) |
| Push | `vapid-public-key`, `vapid-private-key`, `vapid-subject`, `fcm-*` |
| Concierge email replies | `sendgrid-webhook-key` (SendGrid signed-event public key; without it production rejects the webhook) |

OAuth redirect URIs default to `https://app.ferni.ai/...` (from `PUBLIC_URL`). Register
these with each provider:

- `/spotify/callback`
- `/auth/google/callback`
- `/auth/microsoft/callback`
- `/wearables/<provider>/callback`

The GCE voice agent now plays music and reads calendars from **each user's own linked
account**. It needs the same `OAUTH_ENCRYPTION_KEY` as the UI service, plus
`SPOTIFY_CLIENT_ID`/`SECRET` and `GOOGLE_CALENDAR_CLIENT_ID`/`SECRET`, so it can decrypt and
refresh those tokens. Users who linked Google before this change must relink to grant the
Gmail read scope.

The GCE voice agent's `/api/memory/cleanup` and `/api/diagnostics/session*` now answer only
loopback callers or `Authorization: Bearer $HEALTH_ADMIN_TOKEN`. Set `HEALTH_ADMIN_TOKEN` on the
GCE container if you call them remotely (e.g. `pnpm ops:diagnose`).

## 2. Two-way calls ("Ferni, call my mom")

Calls are two-way only when a LiveKit **outbound** SIP trunk exists. Without one they fall
back to a spoken message, and the API reports `mode: "message_only"`.

1. Check the trunk: `lk sip outbound list --config livekit.prod.toml`. It needs Twilio
   Elastic SIP credentials and a number. If there's none, run `scripts/setup-livekit-sip.ts`.
2. Put its id in `sip-trunk-id` (and the domain in `sip-domain`).
3. Deploy the voice agent: `ferni deploy gce`. The GitHub `deploy-gce.yml` now passes
   `SIP_TRUNK_ID` too, and warns if it's missing.
4. Make sure **only** GCE registers as `voice-agent` on the production LiveKit project. A
   LiveKit Cloud agent (`livekit.prod-cloud.toml`) or a Cloud Run service with the same
   name would compete for calls.

Test with a number you own: `ferni calls` (or say "call <contact>" in a voice session).
The contact must be saved with a phone number.

## 3. Texts and replies

- In the Twilio console, set the number's **Messaging webhook** to
  `https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound` (POST).
- Signatures are verified against the public URL, so `TWILIO_AUTH_TOKEN` must be the
  number's account token.
- When a contact Ferni texted writes back, Ferni replies in persona:
  - Limits: 20 replies a day per contact.
  - Crisis language gets a response pointing to 988/911 and is flagged for the user.
  - Every message is saved to `bogle_users/{uid}/contact_messages`.

## 4. Family check-ins

- Schedules live in `bogle_users/{uid}/family_checkin_schedules`. The voice tool
  `scheduleFamilyCheckin` creates them.
- Manual trigger: `ferni family checkin mom`. Status: `ferni family status`.
- The scheduled job (`/api/jobs/family-checkin-calls`, Cloud Scheduler with OIDC) is paused.
  Resume it after a manual test call.

## 5. Voice sign-in (iOS, Android, macOS, Electron)

- Firebase Console → Authentication → Sign-in method: **Anonymous must be enabled**.
- If the Firebase API keys are app-restricted, allow the Android package
  `com.ferni.voice.android` and the macOS/iOS bundle IDs.
- The REST clients send `X-Android-Package` or `X-Ios-Bundle-Identifier`.
- Electron now loads `https://app.ferni.ai` (offline fallback: the bundled build).

## 6. Prove it

```bash
API_BASE=https://app.ferni.ai pnpm smoke:api   # 19 read-only/refused probes
```

Run it only **after** this branch is deployed. Against the old code some probes, like the
GDPR delete with a foreign `userId`, would actually go through. Against the fixed code every
probe is read-only or refused.
