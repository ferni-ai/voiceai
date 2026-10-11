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
`src/agents/voice-agent-entry/sip-caller.ts` (agent, shadow log only).

## Blocker found while building this (fix first)

Twilio already posts to the webhook, and **every request since 2026-10-07 got
403** (Cloud Run logs, `john-bogle-ui`, UA `TwilioProxy/1.1`: 16 calls + 16
status callbacks, 0 accepted). Likely cause (UNCONFIRMED): the number's voice
URL is `https://app.ferni.ai/api/voice/inbound` (as `PHONE-IDENTITY-SETUP.md`
says), Firebase Hosting rewrites it to Cloud Run with Host
`john-bogle-ui-…run.app` (confirmed: a POST to `app.ferni.ai/api/voice/inbound/status`
is logged by Cloud Run as `john-bogle-ui-bmopaivmsq-uc.a.run.app/...`), and
`isSignedByTwilio` rebuilds the signed URL from the Host header, so the
signature never matches. The number's configured URL itself is unverified. Either point the number at the
run.app URL directly or make the signature check use the public host. Until
then this webhook can't mint anything.

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
3. **Agent secret**: add `PHONE_ATTEST_SECRET` (same value) and
   `PHONE_VERIFY=shadow` to the agent's LiveKit Cloud secrets. Without
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
3. Agent logs for that call have one `SIP_CALLER` line with
   `attestationSource: "signed"`, `signedStatus: "signed"`, `attestation: "A"`,
   and only a masked number (`**67`). It must not contain the token or the full
   number.
4. Negative check: dial the trunk directly (bypassing the webhook) with a
   forged `X-Twilio-VerStat` — the line shows `attestationSource: "header"` and
   `signedStatus: "unsigned"`.

## Rollback

Remove `LIVEKIT_SIP_HOST` (or the secret) from the UI service: the webhook
returns today's TwiML. The agent only logs, so nothing else changes.
