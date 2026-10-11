# Scope justification (paste into the Verification Center)

Google asks, for each sensitive or restricted scope, how it is used and "why a narrower scope isn't sufficient"
([sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)).
Each block below is written to be pasted as-is. Keep the claims in sync with the code paths cited under it.

## `https://www.googleapis.com/auth/gmail.send` (Sensitive, Phase A)

**Paste:**

> Ferni is a voice companion. During a phone or app conversation, the user can ask Ferni to email someone for them,
> for example "email Sam that I'm running ten minutes late." When the user has turned on "Send email as me" in
> Ferni's settings, Ferni sends that one email from the user's own Gmail address with gmail.send, so the recipient
> sees it come from the user and can reply to them directly. Ferni requests gmail.send only when the user turns that
> setting on, as a separate step from sign-in and from connecting Google Calendar.
>
> Narrower options don't fit. gmail.send is the narrowest Gmail scope that can send mail, and it cannot read the
> mailbox. gmail.compose would also let us read and manage drafts, which we don't need. Sending from Ferni's own
> address (what we do when the setting is off) doesn't meet the user's request: the email would not come from them,
> and replies would not reach them.
>
> We never read the user's mail with this scope. We store the OAuth tokens encrypted, keep no copy of the email's
> content, and delete the tokens when the user turns the setting off or deletes their account. Account deletion also
> revokes the grant at Google.

**Data flow (for our records and reviewer questions):**

| Step | What happens | Code |
|---|---|---|
| Consent | The user turns the setting on. `POST /auth/oauth/start {provider:'gmail_send'}` leads to the Google consent screen, which asks for `openid email gmail.send` | `src/servers/api/routes/gmail-send.ts`, `routes/oauth-start.ts` |
| Grant check | Stored only if Google returned `gmail.send` (users can untick it) | `completeGmailSendConnect` in `src/services/identity/gmail-send-as-user.ts` |
| Storage | Access and refresh tokens plus the user's address, AES-256-GCM encrypted, at `bogle_users/{uid}/gmail_send_tokens/data` (Firestore, `johnb-2025`) | `gmail-send-as-user.ts`, `src/utils/token-encryption.ts` |
| Use | reachOut's email leg sends one `users.messages.send` with the recipient, subject and body the user asked for | Follow-up PR: `src/services/outreach/delivery/outreach-email.ts` |
| What we keep | No email content. Logs hold an 8-character user-id prefix and Gmail's message ID. The contact's interaction history records "Email: \<purpose\>" (the user's own words, not Gmail data) | `gmail-send-as-user.ts` logs; `recordInteraction` in reachOut |
| Retention | Tokens are kept until the user disconnects or deletes the account. A token Google reports as revoked is deleted on next use | `disconnectGmailSend`, `usableAccess` |
| Deletion | The account-delete sweep revokes at `oauth2.googleapis.com/revoke`, then deletes the tokens before the user record is erased | `forgetGmailSendGrant`, called from `src/services/platform/data-export.ts` `deleteAllData` |
| AI providers | No Gmail data is sent to any model. The email text comes from the conversation | n/a |

## `openid`, `email` (non-sensitive, asked with gmail.send)

**Paste (if asked):**

> Requested together with gmail.send only to learn which Gmail address mail will be sent from. We show it to the user
> ("Sending as sam@gmail.com") and use it as the From header. gmail.send cannot call users.getProfile.

## `https://www.googleapis.com/auth/calendar`, `calendar.events` (already requested; include if the calendar has not been verified)

**Paste:**

> Users can connect Google Calendar so Ferni can tell them what's coming up, schedule events they ask for, and remind
> them. calendar.events covers reading and writing events. calendar is needed to list the user's calendars and to set
> up push notifications (watch channels) so Ferni learns about changes without polling. Tokens are stored encrypted
> and deleted when the user disconnects or deletes their account.

CHECK before pasting: do we really need full `calendar`, or would `calendar.events` + `calendar.calendarlist.readonly`
cover the listing and watch features? A narrower set makes review easier. Code: `src/servers/api/routes/google-calendar.ts:27`,
`src/services/calendar/webhooks/google-webhook.ts`.

## `https://www.googleapis.com/auth/gmail.readonly` (Restricted, Phase B, draft only)

**Paste (draft; needs the feature built first):**

> With the user's permission, Ferni reads recent messages in their inbox so it can tell them, by voice, what needs
> their attention and remind them about replies they owe. gmail.metadata (headers only) can't do this, because
> knowing what an email asks requires its content. gmail.readonly can't modify or send. Message content is processed
> in memory to produce a short spoken summary and is not stored. Only the message IDs and the derived reminders are
> kept, and they are deleted with the account.

Before submitting Phase B, make the code match this text: today's `gmail-service.ts` has draft, send and update
functions that need `gmail.compose`, which we would **not** be requesting.
