# Limited Use disclosure

## The statement

Text used in PR #730:

> Ferni's use and transfer of information received from Google APIs will adhere to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.

Google's FAQ gives a shorter form: "{App's} use of information received from Google APIs will adhere to Google API
Services User Data Policy, including the Limited Use requirements"
([support.google.com/cloud/answer/13463817](https://support.google.com/cloud/answer/13463817)). Ours also covers
"transfer", which makes it a superset of the FAQ wording. Google accepts "a public web-accessible disclosure (such as
an in-product disclosure on the application homepage, or public FAQ)".

## Where the privacy policy lives

| | |
|---|---|
| Source | `apps/website/ferni-website/src/privacy.njk` (Eleventy, layout `layouts/legal-premium.njk`) |
| Live URL | `https://ferni.ai/privacy/` (checked 2026-10-10: HTTP 200, "Last Updated December 31, 2025", no Google-data section) |
| Linked from homepage | Footer `partials/footer-premium.njk:60` and `partials/home/privacy.njk:55` |
| Publish | `ferni deploy landing`. UNCONFIRMED whether merging to main publishes it: `deploy-firebase.yml`'s landing steps point at `promo/ferni-website`, which no longer exists |

## The change (PR #730, auto-merge OFF until Seth reviews)

- Adds a **Google User Data** section after "AI & Machine Learning":
  - the Limited Use statement
  - what Calendar and Gmail "send email as me" access, and why
  - use: no ads, no sale, no AI training, no human reading except on request, for security or by law; transfer only
    to provide the feature
  - storage, retention and deletion, and the `myaccount.google.com/permissions` link
- Adds a "Google Calendar and Gmail" bullet under *Information from Third Parties*, a TOC entry, and a new Last Updated
  date.

Policy commitments the section makes, each of which must stay true in code:

| Commitment | Holds because |
|---|---|
| The Gmail permission can't read the inbox | Only `gmail.send` is requested (`GMAIL_SEND_SCOPES`) |
| Tokens are stored encrypted | `encryptData` (AES-256-GCM) in `gmail-send-as-user.ts` and `google-calendar-token-store.ts` |
| No email content is logged | Logs carry only a user-id prefix, status and Gmail message ID (`gmail-send-as-user.ts`) |
| Turning it off deletes our copy | `disconnectGmailSend` |
| Account deletion revokes Gmail at Google | `forgetGmailSendGrant` in `deleteAllData` (#727) |
| Google data is never used to train models | Policy only, no code. The conversation opt-in must exclude it. **Seth confirms** |
| No human reads it except … | Policy only. **Seth confirms** |

Deliberately **not** claimed: that Calendar is revoked at Google on account deletion. It isn't today; only the tokens
are deleted.

## Ready diff

The PR diff is the source of truth: `gh pr diff 730`. Core block:

```html
<div class="callout callout--important">
  <strong>Limited Use.</strong>
  <p>Ferni's use and transfer of information received from Google APIs will adhere to the
  <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
  including the Limited Use requirements.</p>
</div>
```
