# Phone attestation: signed caller identity for phone calls

Step 2 of "phone identity: verify, then remember". Code ships dark: nothing
changes until the configuration below is applied. **Every step here is
needs-owner-approval** — it touches secrets, Twilio, LiveKit trunks, or the
production deploy workflow.

## Why

Prod LiveKit inbound trunks (`ST_A7ZU7ySup2Ba` tollfree, `ST_RFxXPyZJ77Vg` john)
have no `allowedAddresses` and no auth, so anyone can send an INVITE carrying a
forged `X-Twilio-VerStat: TN-Validation-Passed-A`. The Twilio voice webhook
(`POST /api/voice/inbound`) only runs on requests Twilio signed, and Twilio
gives it `StirVerstat`. So the webhook mints a 60 s HMAC token binding
`{callSid, from, to, verstat, exp}` and dials the trunk with it in
`X-Ferni-Attest`. The agent trusts the attestation only when the token
verifies (timing-safe), hasn't expired (≤ 120 s), and `sip.phoneNumber` equals
the token's `from`.

Code: `src/services/identity/phone-attestation.ts` (mint/verify),
`src/api/voice-auth/inbound-call-routes.ts` (webhook),
`src/agents/voice-agent-entry/sip-caller.ts` (agent, read by caller recognition).

## Blocker found while building this (fixed, #2679)

Every Twilio request since 2026-10-07 got **403** (Cloud Run logs,
`john-bogle-ui`, UA `TwilioProxy/1.1`: 16 calls + 16 status callbacks, 0
accepted). Cause: Firebase Hosting rewrites `https://app.ferni.ai/...` to Cloud
Run with Host `john-bogle-ui-…run.app`, and `isSignedByTwilio` rebuilt the
signed URL from that Host header, so the signature never matched. It now checks
the signature against our configured public origins (`APP_URL`, default
`https://app.ferni.ai`, and `WEBHOOK_BASE_URL`, default `https://api.ferni.ai`)
plus the path and query, never a request header. Until the steps below land, a signed
inbound call gets the "not set up to receive calls" TwiML (no
`SIP_INBOUND_TRUNK_ID` or attestation config on the UI service). The number's
configured URL is still unverified: it must be on one of those origins.

## Steps (each needs-owner-approval)

1. **Create the secret** (one value, shared by both services):
   `openssl rand -base64 48 | gcloud secrets create phone-attest-secret --data-file=- --project johnb-2025`
   and grant `roles/secretmanager.secretAccessor` on it to
   `john-bogle-ui@johnb-2025.iam.gserviceaccount.com`.
2. **UI service env** (`john-bogle-ui`): `deploy-production.yml` replaces env on
   every deploy, so a manual `gcloud run services update` would be wiped. Add
   `PHONE_ATTEST_SECRET=phone-attest-secret:latest` to `--set-secrets` and
   `LIVEKIT_SIP_HOST=<prod project>.sip.livekit.cloud` to `--set-env-vars` in a
   PR (after step 1 — a missing secret fails the deploy). Use the SIP URI host
   shown in LiveKit Cloud → Telephony → SIP; it is not the `LIVEKIT_URL` host.
   `LIVEKIT_SIP_HOST` must be a bare `host[:port]`; anything else disables
   attestation (logged).
3. **Agent secret**: add `PHONE_ATTEST_SECRET` (same value) to the agent's
   LiveKit Cloud secrets. (The `PHONE_VERIFY=shadow` log was removed on
   2026-10-31.) Without
   `--overwrite` `lk agent update-secrets` only adds keys; pass one `--secrets`
   per key (a comma-joined value sets ONE key). Do dev (`CA_siTDMHEba4Fg`)
   first, then prod (`CA_GeFvEpsNXLSF`).
4. **LiveKit trunk header mapping** on the trunk(s) whose number Twilio dials:
   `headers_to_attributes: {"X-Ferni-Attest": "ferni.attest"}` (Console →
   Telephony → Inbound trunk → edit JSON, or `lk sip inbound update`). Keep the
   existing VerStat mapping if one is added for step 1. The tollfree trunk has
   media encryption `DISABLE`; if the TLS dial fails with 488, set it to
   `ALLOW` (UNCONFIRMED whether Twilio offers SRTP with `transport=tls`).
5. **Twilio number**: set "A call comes in" to Webhook, POST, URL of the
   webhook (see the blocker above), status callback `…/api/voice/inbound/status`.
   If the number currently routes to an Elastic SIP Trunk, this moves it to the
   webhook; the webhook then dials `sip:<To>@<LIVEKIT_SIP_HOST>;transport=tls`,
   so the same LiveKit trunk + dispatch rule (`SDR_4far7SLKiLQh`) still matches
   on the called number.

## Verify with one call

1. Call the number from a phone with known STIR/SHAKEN A attestation (a major
   US carrier mobile).
2. Twilio debugger: the webhook returned 200 and TwiML with
   `X-Ferni-Attest=` in the `<Sip>` URI.
3. Agent logs for that call have a `CALLER_ATTESTATION` line with
   `signedStatus: "signed"`. It must not contain the token or the full number.
4. Negative check: dial the trunk directly (bypassing the webhook) with a
   forged `X-Twilio-VerStat` — the line shows `signedStatus: "unsigned"`.

## Rollback

Remove `LIVEKIT_SIP_HOST` (or the secret) from the UI service: the webhook
returns today's TwiML. The agent only logs, so nothing else changes.
