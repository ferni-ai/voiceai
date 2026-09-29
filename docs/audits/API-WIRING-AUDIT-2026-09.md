# API Wiring Audit (September 2026)

> Four parallel audits: the web app vs backend routes; backend stubs, mocks and unmounted routes;
> third-party integrations; and the native, desktop and CLI clients. Each finding was
> verified by reading the code; nothing was tested against live production. "Fixed"
> means fixed on branch `claude/voiceai-ui-bugs-mjcocr` (PR #107).

## P0: security (fixed)

| Finding | Fix |
| --- | --- |
| Any client could act as any user. About 27 route files trust `x-firebase-uid`, `x-user-id` or `?userId=` sent by the client. | `src/api/identity-guard.ts` runs before every route. `x-firebase-uid` is set by the server from a verified Firebase token or API key. An unverified identity is honoured only for anonymous `device:` IDs. |
| GDPR export and delete trusted `body.userId`, so anyone's data could be exported or deleted. | Acts on the caller's own identity only; returns 403 on mismatch. |
| `POST /api/outbound-call/initiate` placed real Twilio calls to any number with no auth (toll fraud). | Admin only. |
| The Stripe `/api/monetization/webhook` trusted unsigned payloads, so payments could be forged. | `constructEvent` runs on the raw body; returns 503 if no secret is set. |
| Marketplace admin accepted any `x-admin-id` header. | Requires a verified admin. |
| `GET /api/insights/:userId` returned any user's insights. | Owner only. |
| `POST /api/landing/generate-content` spent LLM budget with no auth. | Requires a Cloud Scheduler OIDC token or an admin. |
| Earlier in this PR: `PUT /api/landing/flags` open to anyone; landing TTS/LLM endpoints open to anyone; admin API accepting a key hardcoded in the repo; analytics running without consent. | Fixed. |

## P0: security (open; needs your call or a larger change)

| Finding | Where | Recommendation |
| --- | --- | --- |
| Admin API key is baked into the public web bundle. | `cloudbuild-ui.yaml` → `VITE_ADMIN_API_KEY` | Move admin auth to Firebase custom claims, then rotate the key. |
| `/api/twin/profile` uses the raw Bearer string as the user ID. | `src/servers/api/routes/twin-profile.ts:99` | Verify the Firebase token. |
| Concierge webhooks accept unsigned requests. | `src/api/concierge-routes.ts:53,235` | Validate Twilio and SendGrid signatures. |
| Inbound-call webhook skips the signature check when the header is missing. | `src/api/voice-auth/inbound-call-routes.ts:107-123` | Reject when the header is missing. |
| GCE `:8080` `/api/memory/cleanup` and `/api/diagnostics/session` have no auth. | `src/agents/shared/health-server.ts:243` | Require a token or bind internally. |
| `/api/auth/migrate` accepts `firebaseUid` from the body when no token is sent. | `src/api/migration-routes.ts` | Require a token. |
| **Anonymous identity model** | whole app | Anonymous users are identified by a client-generated `device:` ID. Moving to Firebase anonymous auth would make every identity verifiable. |

## P1: production config (integrations inactive in prod)

The UI Cloud Run deploy passes only about 20 secrets with `--set-secrets`, and that flag *replaces* every existing secret on the service. As a result, these integrations have no credentials in production:

| Integration | Missing |
| --- | --- |
| Stripe subscriptions | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (routes return 503) |
| Gift Forward (Stripe) | `STRIPE_MONETIZATION_WEBHOOK_SECRET` (or the shared one), `VITE_STRIPE_PUBLISHABLE_KEY` |
| Spotify | client ID and secret on UI Cloud Run, `SPOTIFY_REDIRECT_URI` (defaults to localhost) |
| Google Calendar | `GOOGLE_CALENDAR_REDIRECT_URI` (defaults to localhost:3002) |
| Outlook | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` |
| Wearables | `OURA_*`, `WHOOP_*`, `FITBIT_*`, `GARMIN_*`, `EIGHT_SLEEP_*` |
| Push | `VAPID_*`, `FCM_*` |
| Inbound phone on Cloud Run | `SIP_TRUNK_ID`, `SIP_INBOUND_TRUNK_ID` |
| Maps directions | `GOOGLE_MAPS_API_KEY` |

**Fix:** add these to both UI deploy paths: `apps/cli/src/commands/deploy/deploy.ts:682` and `.github/workflows/deploy-production.yml:465`. Also remove the dead `ALLOW_LEGACY_X_USER_ID_AUTH` flag. The full list of 499 env vars read in code but absent from every deploy config came from the integrations audit (a scratch file, not committed).

## P1: product flows that don't work end to end

| Flow | Problem | Fix |
| --- | --- | --- |
| Spotify voice control | The voice tool uses one global token, not the user's OAuth tokens. The web app calls `/api/spotify/{play,pause,skip,volume}`, which doesn't exist. | Per-user tokens; add the playback routes. |
| Google Calendar in voice | The OAuth callback writes encrypted tokens to `bogle_users/{uid}/google_calendar_tokens`, but the tools read `google_calendar_tokens/{uid}`. | One token store. |
| Gmail | Reuses the calendar token, but only calendar scopes are requested. | Add Gmail scopes and unify the store. |
| Wearables | The web app calls `/api/wearable/*`, which returns `Math.random()`. The real OAuth lives at `/wearables/*`. No voice tool reads the data. | Point the UI at `/wearables`, remove the stub, add a health tool. |
| Banking and biometrics | The web app calls `/api/banking/*` and `/api/biometrics/*`; the real routes are `/api/v1/integrations/{banking,biometrics}/*` under different names. | Update the client paths. |
| Concierge | Phone, SMS and email sends are commented out; `simulateCall` returns fake successes that users see. | Implement, or return `simulated: true` with `success: false`. |
| Group calls | `/api/group/call/add` returns a simulated "dialing". Twilio callbacks get a 401 from the engagement routes. | Implement, or return 501. |
| Family approvals | `familyRouter` is never mounted. | Mount it under `/api/family`. |
| Payment complete | `GET /api/monetization/:type/verify` doesn't exist, so users see an "undefined" error page. | Add the route. |
| Contacts | No `DELETE /api/contacts/:id`. `import/google/start`, `gift-suggestions` and `conversation-starters` are missing. | Add the handlers. |
| Activity stream | EventSource `/api/actions/stream` doesn't exist. | Add SSE, or poll. |
| Insights hub | `/api/engagement/profile` doesn't exist, so the stories tab always shows sample data. | Add the route, or remove the tab. |
| Experiments | `/api/landing/experiments/track/batch` drops events, and the `hero-*` flags aren't registered. | Persist events and register the flags. |

**Fixed:**
- Sanctuary practice chat: the route file is now mounted.
- Ecobee link polling.
- Gift history path and shape.
- Calendar providers status.

## P1: native, desktop and CLI clients

| Client | Problem | Fix |
| --- | --- | --- |
| macOS, Android (and iOS when signed out) | `/token` is called without Firebase auth, so every voice session gets a 401. | Sign in anonymously before requesting a token. |
| Electron | Relative `/api` calls resolve to `file://`, so every API call fails in production builds. | Inject an absolute API base. |
| iOS | `verify-ios`, `/api/ambient/sync` and `/api/health/sync` don't exist. | Use `/api/apple/verify` (`receiptData`), `/api/ambient-mode/sync` and `/api/apple-health/sync` (plus auth). |
| Widget SDK | `embed.js` reads `window.FerniWidget`, but pages set `window.FERNI_CONFIG`. `apiBase` defaults to the host site. | Read both, and default to the script's own origin. |
| CLI | `/api/auth/refresh` is missing, so sessions die after an hour. `experiments`, `rollout`, `family`, `scheduled`, `memory insights` and `chat tools` hit missing routes. `logs`, `restart`, `rollback` and `traffic` target the deleted Cloud Run agent. | Implement refresh via `securetoken`; repoint or remove the commands. |

**Fixed:**
- Voice agent health defaults (GCE); uptime checks now use port 8080 over plain HTTP.
- Scheduler and brand job hosts (wrong project number).
- Developers-portal stale host.
- CLI contact search parameter.

## P2: dead code and duplicates to delete

- Never mounted:
  - `src/api/custom-agent-routes.ts`, `landing-intelligence-routes.ts`, `optimization-api.ts`
  - `api/routes/landing-ai.ts`
  - `outbound-call-routes.ts`
  - Uber, Lyft and Instacart webhooks
- Unreachable because the engagement routes own these prefixes first: the `index.ts:1153-1238` blocks for rituals, sky-check, commitments, conversations, group, growth, video, wearable and memories.
- Duplicate `/api/memory/health`, `/api/marketplace/reviews` and `/api/cognitive*` handlers.
- Web client files that nothing imports:
  - `b2b-admin`
  - `calendar-provider-settings`
  - `calendar-providers.service`
  - `onboarding-progress`
  - `health-dashboard`
  - `marketplace-billing`

## Silent no-ops (should fail loudly)

- `communication-service.ts` returns "[DEV MODE] Would send…" when no key is set, and callers treat that as sent.
- `brand-jobs.ts` reports success when Firestore is null.
- Crash reports and GDPR export downloads live in memory on multi-instance Cloud Run, so they're lost between instances.
- Several settings screens show success toasts without checking `apiPost(...).ok`: Oura, Eight Sleep, Apple Health.
