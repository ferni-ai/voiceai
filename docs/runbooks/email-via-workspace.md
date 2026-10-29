# App email through the ferni.ai Google Workspace

> **2026-10-27 (#2947): the Workspace is the only email transport.** Ferni doesn't
> use SendGrid (Seth). `EMAIL_PROVIDER`, the SendGrid adapter and the SendGrid
> secrets are gone from the code and the deploy, so the provider switch and the
> rollback below no longer apply. The setup steps still do.

App email (waitlist approval, newsletter welcome, admin notices, reminders by
email, maintenance-job email, alerts) used to go out through SendGrid. Every
SendGrid send now fails with 401, so app email moves to the ferni.ai Workspace:
the Gmail API sends it from a ferni.ai mailbox. Tracking issue: #1848.

## How it works

- Code: `src/services/email-transport/`. `getEmailSender()` returns the
  SendGrid adapter unless `EMAIL_PROVIDER=gmail`.
- The Gmail adapter calls `users.messages.send` as one Workspace mailbox,
  with the `gmail.send` scope and nothing else.
- **No JSON key exists.** The runtime service account (`john-bogle-ui@` on
  Cloud Run) calls IAM Credentials `signJwt` to sign a JWT as the mailer
  service account. The JWT has `iss`=mailer, `sub`=mailbox,
  `scope`=gmail.send and `aud`=`https://oauth2.googleapis.com/token`. Google's
  token endpoint swaps the JWT for a one-hour token. Two grants make this work:
  - Token Creator on the mailer, which lets the runtime sign as it.
  - Workspace domain-wide delegation, which lets the mailer act as the
    mailbox for gmail.send.
- Limits: Workspace allows about 2,000 messages per user per day. The adapter
  stops at `EMAIL_DAILY_LIMIT` (default 1800) per instance per UTC day.
  - Short 429s and 5xx: it backs off and retries.
  - Gmail's "Retry after <time>" for the mail-sending limit: it holds every send
    until that time.

| Env var | Default | Meaning |
|---|---|---|
| `EMAIL_PROVIDER` | `sendgrid` | `gmail` switches to the Workspace |
| `EMAIL_FROM` | `admin@ferni.ai` | From address: the mailbox, or a send-as alias of it. Read only through `configuredEmailFrom` (`src/config/house-facts.ts`); with `HOUSE_FACTS=on` it is also the email sender Ferni names when asked, so set it on the voice agent too. |
| `EMAIL_FROM_NAME` | `Ferni` | From display name |
| `EMAIL_MAILBOX` | `EMAIL_FROM` | The Workspace **user** to impersonate (JWT `sub`). Set it when `EMAIL_FROM` is an alias. |
| `EMAIL_MAILER_SA` | `ferni-mailer@johnb-2025.iam.gserviceaccount.com` | The delegated service account |
| `EMAIL_DAILY_LIMIT` | `1800` | Sends per UTC day per instance |

## State on 2026-10-18 (checked, not assumed)

| Thing | State |
|---|---|
| `gmail.googleapis.com`, `iamcredentials.googleapis.com` on johnb-2025 | already enabled |
| `ferni-mailer@johnb-2025` | created 2026-10-18, no user-managed keys; Token Creator granted to `john-bogle-ui@`; Workspace delegation for gmail.send only |
| Cloud Run `john-bogle-ui` runtime SA | `john-bogle-ui@johnb-2025.iam.gserviceaccount.com` |
| MX `ferni.ai` | Google (`aspmx.l.google.com` + alts): Workspace receives mail |
| SPF `ferni.ai` | `v=spf1 include:_spf.google.com include:sendgrid.net ~all` (Google added 2026-10-18) |
| DKIM `google._domainkey.ferni.ai` | 2048-bit key published 2026-10-18; Admin console shows DKIM signing on |
| DMARC `_dmarc.ferni.ai` | `v=DMARC1; p=none;` (monitor only, no reports) |
| SendGrid DKIM `s1._domainkey` | CNAME to sendgrid.net (remove after cutover) |
| DNS host | `ns-cloud-d*.googledomains.com` (Google Domains, now Squarespace). Not in johnb-2025 Cloud DNS. |
| Does `hello@ferni.ai` exist as a user or an alias? | **No.** The Workspace users are `admin@` and two personal accounts, so app email sends as `admin@ferni.ai`. |

Look up records with a public resolver; the local one returned nothing:
`dig @8.8.8.8 TXT ferni.ai +short`.

## One-time setup

**All of (a) to (e) and the DNS changes were done on 2026-10-18** (the
lead, with Seth's OK). The steps stay here for a rebuild or another project.

### Claude can do these with gcloud (project johnb-2025)

**(a) Create the mailer service account and enable the APIs.** Both APIs are
already on, so the `enable` call is a no-op.

```bash
gcloud services enable gmail.googleapis.com iamcredentials.googleapis.com --project=johnb-2025
gcloud iam service-accounts create ferni-mailer --project=johnb-2025 \
  --display-name="Ferni app mailer (Workspace DWD, gmail.send only)"
# The numeric client ID that step (c) needs:
gcloud iam service-accounts describe ferni-mailer@johnb-2025.iam.gserviceaccount.com \
  --project=johnb-2025 --format='value(oauth2ClientId)'
```

Never create a key for it. This must stay empty:
`gcloud iam service-accounts keys list --iam-account=ferni-mailer@johnb-2025.iam.gserviceaccount.com --managed-by=user`.

**(b) Let the web server sign as the mailer.**

```bash
gcloud iam service-accounts add-iam-policy-binding ferni-mailer@johnb-2025.iam.gserviceaccount.com \
  --project=johnb-2025 \
  --member=serviceAccount:john-bogle-ui@johnb-2025.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator
```

The grant is on the mailer only, not on the project. Other runtimes that send
mail need the same grant for whatever identity their ADC resolves to. That
includes the LiveKit voice agent's tool paths (email tools, voice messages),
which authenticate with the agent's own Google credentials. Until they have it,
leave `EMAIL_PROVIDER` unset there, so they stay on SendGrid.

### Seth does these (Claude in Chrome can, only with Seth's OK)

**(c) Domain-wide delegation, gmail.send only.**

1. Go to admin.google.com, then Security, Access and data control, API controls.
2. Under Domain-wide delegation, choose Manage domain wide delegation, then Add new.
3. Fill in the form:
   - Client ID: the number from step (a).
   - OAuth scopes: `https://www.googleapis.com/auth/gmail.send`, and nothing else.
4. Choose Authorize.

It usually takes effect in minutes and can take up to 24 hours. Before it
does, sends fail with `token exchange failed: 401 ... unauthorized_client`.

**(d) Choose the mailbox.** In admin.google.com, go to Directory, Users.
On 2026-10-18 there was no `hello@ferni.ai`, so app email sends as
`admin@ferni.ai` (`EMAIL_FROM=admin@ferni.ai`; `EMAIL_MAILBOX` defaults to it).

To send as `hello@` later, add it as an alias: open `admin@ferni.ai` in
Directory, go to User information, then Alternate email addresses, and add
`hello`. Then, in that user's Gmail, go to Settings, Accounts, "Send mail as"
and add `hello@ferni.ai` (Gmail rewrites From to the primary address
otherwise). Set `EMAIL_MAILBOX=admin@ferni.ai` and `EMAIL_FROM=hello@ferni.ai`.

A Google Group can't be the mailbox, because delegation only impersonates
users.

**DNS, at the ferni.ai DNS host:**

1. **SPF.** Replace the one TXT record with
   `v=spf1 include:_spf.google.com include:sendgrid.net ~all`. Once SendGrid is
   gone, change it to `v=spf1 include:_spf.google.com ~all`. Keep exactly one
   SPF record.
2. **DKIM.** In admin.google.com, go to Apps, Google Workspace, Gmail,
   Authenticate email. Pick ferni.ai and Generate new record (2048 bit,
   selector `google`). Publish that TXT at `google._domainkey.ferni.ai`, then
   choose Start authentication. Without DKIM, Gmail and Yahoo put
   bulk-looking mail in spam, and DMARC can't pass on alignment.
3. **DMARC.** `p=none` is fine to start. Add `rua=mailto:dmarc@ferni.ai` (or
   any inbox) to see reports. Move to `p=quarantine` once SPF and DKIM pass.

### Switch on

**(e) Set the provider. Done in the deploy workflow.** The production
workflow's `--set-env-vars` replaces the service's env on every deploy, so the
email vars live there; a value set by hand on Cloud Run is gone after the next
main push. The CLI's `deploy.ts` `ui` target runs this same workflow (#1835),
so the one edit covers both deploy paths:

```
::EMAIL_PROVIDER=${{ vars.EMAIL_PROVIDER || 'gmail' }}
::EMAIL_FROM=${{ vars.EMAIL_FROM || 'admin@ferni.ai' }}
```

`EMAIL_MAILBOX` is unset, so it defaults to `EMAIL_FROM`. `WELCOME_NUDGE` is
not set and stays off.

**Verify.** Trigger one transactional email to an inbox Seth owns, for example
approving a test waitlist entry. In Gmail's "Show original", check:

- SPF: pass.
- DKIM: pass with `d=ferni.ai`.
- DMARC: pass.

The server log line is `email-gmail`. Failures name the step: `signJwt failed`
means (b) is missing, and `unauthorized_client` means (c) is missing.

**Verified 2026-10-18** (Seth approved the test sends): one send to
`admin@ferni.ai` and one to an outside Gmail inbox, both through this adapter.
The outside copy landed in the inbox with `dkim=pass header.i=@ferni.ai
header.s=google`, `spf=pass smtp.mailfrom=admin@ferni.ai` and `dmarc=pass
(p=NONE) header.from=ferni.ai`.

**Rollback.** Run `gh variable set EMAIL_PROVIDER --body sendgrid`, then
`gh workflow run deploy-production.yml --ref main -f service=ui-server`.
Nothing else changes (and SendGrid only helps once its account is paid).

## Later: replies to the sender

Replies to `admin@` land in the Workspace inbox, and nothing reads them yet.
There are two ways to get them to Ferni. Either way needs a second, separate
delegation decision: a read scope (`gmail.readonly`, or `gmail.modify` to label
mail as processed) for the mailer.

1. **Polling (start here).** A Cloud Scheduler job every 5 minutes runs
   `users.messages.list` (`in:inbox is:unread newer_than:2d`), then
   `messages.get` for each hit, matches it, routes it, and labels it
   `ferni/processed`. There's no new infrastructure, the latency is the poll
   interval, and the quota cost is negligible at this volume.
2. **Push.** `users.watch` on the mailbox sends to a Pub/Sub topic
   (`gmail-api-push@system.gserviceaccount.com` needs Publisher on it). A push
   subscription calls an authenticated Cloud Run endpoint, which runs
   `users.history.list(startHistoryId)` and then fetches the messages. A watch
   lapses after 7 days, so a daily job renews it. Use this when replies need to
   arrive in seconds.

**Matching replies to people:**

- Send with a plus-addressed Reply-To, for example `hello+r_<token>@ferni.ai`.
  It still delivers to the same mailbox. The token maps to the user and the
  outreach.
- Keep each sent message's `Message-ID` so `In-Reply-To` can thread a reply.
- The existing reply handler (`handleEmailReplyWebhook` in
  `src/api/concierge-routes.ts`) is a candidate place to route them.

Treat reply text as untrusted input: it reaches a model.
