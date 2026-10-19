# App Store privacy questionnaire answers

These answers match `apps/ios-native/App/PrivacyInfo.xcprivacy` and the consent
screen. If either changes, update this file in the same change.

## Summary

| Data type | Collected | Linked to the person | Tracking | Purpose |
|---|---|---|---|---|
| Audio data (the call) | Yes | Yes | No | App functionality |
| User ID (the account id) | Yes | Yes | No | App functionality |
| Other user content (transcripts, memories, reports) | Yes | Yes | No | App functionality |
| Name, email address (only with Sign in with Apple) | Yes | Yes | No | App functionality |
| Crash data | Yes | No | No | App functionality |

Tracking: none (`NSPrivacyTracking` is false, with no tracking domains).

Not collected:
- health and fitness (HealthKit left with the old app);
- location;
- contacts;
- usage data or analytics (the app has none);
- device ID;
- purchases (Ferni is free for now);
- browsing.

## Category by category

**Contact info.** Name and email address, only if the person uses Sign in with
Apple (Apple may relay a private email). Linked. App functionality.

**Audio data.** The person's voice during a call. It streams to the services
that hear, think and speak (below) for that call. Linked. App functionality.

**User content.** Other user content: call transcripts and the notes Ferni keeps
("What Ferni remembers"), which the person can see, correct and delete, plus
any report they send about a reply. Linked. App functionality.

**Identifiers.** User ID: the Firebase account id, anonymous at first, then
the same account after Sign in with Apple. Linked. App functionality. No
device ID and no advertising id.

**Diagnostics.** Crash data only, through Sentry, and only in builds that carry
a crash-reporting DSN. It includes no user id, no screenshots, no view
hierarchy, no session replay and no performance traces, and breadcrumbs keep
only their kind (never text or URLs). Not linked. App functionality.

**Usage data, health, location, contacts, purchases, browsing, search, other
data.** None.

## Processors (for the privacy policy and the review notes)

The consent screen names the first four before the first call.

| Processor | What it receives | Why |
|---|---|---|
| Google (Gemini) | the call's audio and text | hearing and answering |
| Anthropic (Claude) | the conversation's text | answering |
| Cartesia (speech) | the text Ferni speaks | Ferni's voice |
| LiveKit (the call itself) | the call's audio, in transit | the real-time call |
| Google Firebase | the account id, Apple sign-in token | sign-in |
| Sentry | crash reports (no personal data) | crash reporting |

## Privacy label preview

- **Data used to track you:** none.
- **Data linked to you:**
  - contact info (name, email; only with Sign in with Apple);
  - audio;
  - user content;
  - identifiers (user ID).
- **Data not linked to you:** diagnostics (crash data).

## The privacy policy must cover

- What's collected (the table above), and that voice goes to the processors
  for the call.
- That Ferni keeps notes from conversations, which the person can see, correct
  and delete, and that deleting the account erases them and the account
  (Settings, then Delete account, which also revokes Sign in with Apple).
- No selling of personal data, no advertising, no tracking.
- Contact: the support address in App Store Connect.

## App Store Connect

App Privacy, then Get started: answer per the summary table. For each collected
type: linked as above, tracking no, purpose app functionality.
