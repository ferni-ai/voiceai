# Dev UI host (`ferni-ui-dev`)

A second copy of the web server (`docker/Dockerfile.ui`) on dev data, so per-user OAuth connects (Google, Spotify, Oura) can finish before prod. Deploy: run the **Deploy UI Dev Host** workflow (`.github/workflows/deploy-ui-dev.yml`, manual, main only). It never touches `john-bogle-ui`.

URL: `https://ferni-ui-dev-1031920444452.us-central1.run.app`

## What differs from prod

- Data: `FIRESTORE_DATABASE=ferni-dev`, `FIRESTORE_DB_PIN=refuse`. The service account `ferni-ui-dev@` holds `roles/datastore.user` only on a condition (`resource.name == "projects/johnb-2025/databases/ferni-dev"`), so it cannot read or write the prod `(default)` database. It has no Firebase Auth admin, BigQuery or Vertex role.
- Calls: the dev LiveKit project (`LIVEKIT_URL`, `livekit-dev-*` secrets) and `AGENT_NAME=voice-agent-dev`.
- `NODE_ENV=staging` (the data guard accepts only `production` and `staging`), `DEPLOY_ENV=dev`.
- Left out: Twilio, APNS, Sentry, Redis, and the jobs that send (`FOLLOW_THROUGH_JOB`, `MORNING_BRIEF`, `PONDERING`, `PROACTIVE_CHANNELS`).
- Min instances 0, max 2.

## Secrets (own Secret Manager objects, `ferni-ui-dev-*`)

`LOG_HASH_SECRET` (the token sealing key, and the key of the hashes in logs) is a fresh random dev-only value, created once with `openssl rand -hex 32`; dev logs therefore hash differently from prod, on purpose. The dev agent must be given the same value (a separate change) before it can open tokens this server seals. `DATA_ENCRYPTION_KEY` and `IDENTIFIER_HASH_SECRET` are copies of prod's, because ferni-dev holds prod-encrypted fields. `GOOGLE_CALENDAR_CLIENT_ID/SECRET` and `SPOTIFY_CLIENT_ID/SECRET` are copies of prod's OAuth apps until a dev app replaces them (add a new version to the same secret). Oura has no secret yet (`oura-client-id/secret` have no version).

## Register in the provider consoles

| Provider | Redirect URI |
|---|---|
| Google (Calendar and Gmail send share it) | `https://ferni-ui-dev-1031920444452.us-central1.run.app/auth/google/callback` |
| Spotify | `https://ferni-ui-dev-1031920444452.us-central1.run.app/spotify/callback` |
| Oura | `https://ferni-ui-dev-1031920444452.us-central1.run.app/wearables/oura/callback` |

Also add the host `ferni-ui-dev-1031920444452.us-central1.run.app` to Firebase Authentication, Settings, Authorized domains, or web sign-in fails with `auth/unauthorized-domain`.

## Check after a deploy

- `GET /health` is 200; `GET /health/firestore` reports `"databaseId":"ferni-dev"`.
- `POST /auth/oauth/start` (signed in) then the returned `/auth/google/login?state=...` redirects to Google with the dev `redirect_uri`.
