# Google OAuth verification: Gmail for "send email as me"

Goal: Ferni can send email from the user's own Gmail (Phase A), and later read it (Phase B).
Prepared 2026-10-10. Nothing has been submitted to Google and no console setting has changed.

| Phase | Scope | Google class | What Google requires |
|---|---|---|---|
| **A** | `gmail.send` (+ `openid`, `email`) | Sensitive | OAuth app verification (brand + scope review) |
| **B** | `gmail.readonly` | Restricted | Verification **plus** a CASA security assessment by an authorized lab, every 12 months, because our server stores the data |

Source for the classes: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) ("If you
store restricted scope data on servers (or transmit), then you must go through a security assessment.").

Files here:

- [scope-justification.md](scope-justification.md): the text for the scope-justification field
- [limited-use-disclosure.md](limited-use-disclosure.md): the privacy-policy change (PR #730, held for Seth)
- [demo-video-script.md](demo-video-script.md): the required YouTube video, shot by shot
- [casa-tier2-prep.md](casa-tier2-prep.md): Phase B security assessment prep (separate PR)

## Where our OAuth lives (from the code)

| Thing | Fact | Evidence |
|---|---|---|
| GCP project | `johnb-2025` | `.firebaserc`; `scripts/setup-google-oauth.sh` (`PROJECT_ID`); `app.ferni.ai/__/firebase/init.json` → `projectId: johnb-2025` |
| Connect-account OAuth client | Env `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET`, from Secret Manager `google-calendar-client-id` / `google-calendar-client-secret` in `johnb-2025` | `apps/cli/src/commands/deploy/deploy.ts:330`, `scripts/setup-google-oauth.sh` |
| Redirect URI | `https://app.ferni.ai/auth/google/callback` | `src/servers/api/routes/google-calendar.ts:25-26` |
| User sign-in | Firebase Auth, Google provider, scopes `email profile`, authDomain `johnb-2025.firebaseapp.com`; One Tap uses `VITE_GOOGLE_CLIENT_ID` | `apps/web/src/services/firebase-auth.service.ts:274-276`, `google-one-tap.service.ts:171` |
| Calendar consent (live) | `calendar`, `calendar.events` | `src/servers/api/routes/google-calendar.ts:27-30` |
| Gmail send consent (#727, flag off) | `openid email gmail.send`, its own grant, same client, same redirect | `src/services/identity/gmail-send-as-user.ts`, `src/servers/api/routes/gmail-send.ts` |

The consent screen, branding and verification belong to the **project**, so one submission covers sign-in,
calendar and gmail.send together.

### Gmail scopes elsewhere in the repo (none of them is requested live)

- `src/services/identity/google-calendar-oauth.ts:44` lists `gmail.readonly` in `generateAuthUrl()`. Its only callers
  are tests (`src/tests/e2e/run-e2e.ts:199`, `src/tests/integration/appointment-e2e.test.ts:257`). The live connect
  uses `routes/google-calendar.ts`, which asks for calendar scopes only.
- `src/services/integrations/oauth-manager.ts:41-43` and `integration-hub.ts:40-42` list `gmail.readonly`, `gmail.send`
  and `gmail.modify`. `getAuthorizationUrl` is reached only from the uber/lyft/instacart clients, never for `gmail`.
  UNCONFIRMED: this is a grep of callers, not a runtime trace.
- Consequence: `src/services/gmail/gmail-service.ts` (inbox triage, drafts, send) reuses the **calendar** token, which
  has no Gmail scope, so those tools should fail with 403 today. UNCONFIRMED in prod; inferred from the scopes.
  Its `sendEmail` also calls `users.getProfile`, which `gmail.send` alone can't do
  ([getProfile scopes](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)).

Before submitting, delete those three dead scope lists so the code matches the justification we give Google.

## Phase A: sensitive-scope verification (`gmail.send`)

Requirements are from [sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
and [verification requirements](https://support.google.com/cloud/answer/13464321).

| Requirement | Today | Missing / to do |
|---|---|---|
| Publishing status "In production" (verification refuses Testing apps) | CHECK IN CONSOLE | Publish to production before submitting |
| Verified domains (Search Console, owner/editor of the project) | CHECK IN CONSOLE (`ferni.ai`, `app.ferni.ai`) | Verify each authorized domain |
| Public homepage on our domain, describes the app, links the privacy policy, not just a login page | `https://ferni.ai/` (200), footer links `/privacy/` (`partials/footer-premium.njk:60`) | Use `https://ferni.ai/`, not `app.ferni.ai` (a login page) |
| Privacy policy on the same domain, says how Google user data is accessed, used, stored and shared | `https://ferni.ai/privacy/` (200), but no Google-data section and no Limited Use statement | **PR #730** (held for Seth), then publish |
| Limited Use disclosure | Missing | In PR #730 |
| App name and logo match the brand; support email; developer contacts | CHECK IN CONSOLE | Logo triggers brand review |
| Scope justification, including why a narrower scope won't do | Drafted | [scope-justification.md](scope-justification.md) |
| Demo video: unlisted YouTube, English, consent screen with app name, **client ID visible in the address bar**, each scope shown in use | Not recorded | [demo-video-script.md](demo-video-script.md); needs #727 + the send PR + a UI toggle on dev |
| Only the scopes we use are requested | Live: calendar; gmail.send behind a flag | Remove the dead Gmail scope lists (above) |
| Feature works end to end | Connect: #727 (flag off). Send: follow-up PR. UI toggle: not built | Build the toggle, then flip `GMAIL_SEND_AS_USER=on` on dev only |
| Calendar scopes' own verification status | CHECK IN CONSOLE | If calendar was never verified, add it to the same submission |

### While unverified

- Testing status allows up to 100 test users, whose authorizations expire **7 days** after consent.
- An unverified production app shows "Google hasn't verified this app" and is capped at **100 new users for the
  project's lifetime**.
- Google allows 100 refresh tokens per Google Account per client ID.

Source: [support.google.com/cloud/answer/15549945](https://support.google.com/cloud/answer/15549945),
[OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2). Keep the flag off in prod until
verification passes.

## Phase B: restricted scope (`gmail.readonly`) and CASA

Needs Seth's approval for the lab cost. Requirements are from
[restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
and [security assessment](https://support.google.com/cloud/answer/13465431).

- Everything in Phase A, plus a justification for why `gmail.send` + `gmail.metadata` (also Restricted) won't do.
- **CASA** (Cloud Application Security Assessment) under the App Defense Alliance. It is "based 100% on the OWASP ASVS".
  Google assigns the assurance level (AL1/AL2; older docs say Tier 2/3), not us.
- It is done by an authorized lab. The [ADA list](https://www.appdefensealliance.org/certification/authorized-labs)
  shows Bishop Fox, DEKRA, Eydle, Leviathan, NCC Group, NetSentries, NowSecure, Prescient Security, TAC Security and
  ValueMentor; which of them do CASA is UNCONFIRMED.
- Renewal: re-assess "at least every 12 months after your assessor's Letter of Assessment (LOA) approval date", and
  restricted-scope apps re-verify yearly.
- Cost is UNCONFIRMED (vendor claim, TAC Security): about $540–$855 for their lowest tier, $3,600–$4,500 for higher
  tiers or bundles.
- There is no official exemption that applies to us: the exemptions are personal use, internal Workspace apps and
  similar.

Prep and likely gaps: [casa-tier2-prep.md](casa-tier2-prep.md).

## Timeline (honest estimate)

| Step | Duration | Source |
|---|---|---|
| Land #727, the send PR and a UI toggle; Seth reviews and publishes #730 | ~1 week of our time | Estimate |
| Console work (domains, branding, production status) and recording the video on dev | 1–2 days | Estimate |
| Brand verification | "2-3 business days" | [Google FAQ](https://support.google.com/cloud/answer/13463817) |
| Sensitive scope review | "10 business days" (FAQ) vs "typically takes 3-5 business days" (dev page); plan for 10 | FAQ and [dev page](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification). Google: "estimates are not guaranteed" |
| Fix-and-resubmit rounds if the reviewer asks for changes | +1–2 weeks | UNCONFIRMED (common report, not Google) |
| **Phase A total** | **~3–5 weeks from today** | Estimate |
| Restricted scope review (Phase B) | "6 weeks" | [Google FAQ](https://support.google.com/cloud/answer/13463817) |
| CASA lab assessment | "1-3 weeks" / "two to six weeks" | UNCONFIRMED (vendor claims) |
| Remediating CASA findings | 2–6 weeks, depending on the gaps in casa-tier2-prep.md | Estimate |
| **Phase B total** | **~2.5–4 months after we start**, then yearly | Estimate |

## CHECK IN CONSOLE (for the lead; project `johnb-2025`)

1. **Google Auth Platform → Audience**: is the publishing status Testing or In production? How many users or test
   users are there?
2. **Branding**: app name (must read "Ferni"), logo, support email, homepage `https://ferni.ai/`, privacy
   `https://ferni.ai/privacy/`, terms `https://ferni.ai/terms/`, authorized domains (`ferni.ai`, and whether
   `johnb-2025.firebaseapp.com` is listed for Firebase sign-in).
3. **Verification Center**: has the brand or calendar ever been verified? Are there open issues?
4. **Data Access**: which scopes are declared? Confirm `calendar` and `calendar.events` show as Sensitive. `gmail.send`
   has to be added there before submission.
5. **Clients**: which client is `google-calendar-client-id`? Is it in `johnb-2025`, and what is its type (Web)? Does
   its authorized redirect URIs include `https://app.ferni.ai/auth/google/callback`? #727 reuses it, so no new URI is
   needed. Which client is `VITE_GOOGLE_CLIENT_ID` (One Tap)?
6. **APIs & Services → Library**: is the Gmail API enabled in `johnb-2025`?
7. **Search Console**: are `ferni.ai` and `app.ferni.ai` verified by a project Owner or Editor account?
8. **IAM**: who are the project Owners/Editors? Google sends all review mail to them, so make sure Seth is one.
9. **LiveKit agent secrets** (not GCP console, but same check): do the prod and dev agents have
   `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET` and `OAUTH_ENCRYPTION_KEY`? The send path refreshes the token inside the agent
   process.
