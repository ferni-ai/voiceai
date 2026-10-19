# Ferni for iPhone and iPad: App Review packet

For whoever prepares the App Store submission. It lists every feature in the
binary, where a reviewer finds it, and what the review notes need to say.
Store metadata (`apps/ios-native/AppStore/METADATA.md`) is maintained separately.

## No server flags (guideline 2.5.19)

Everything below is in the binary and reachable by the reviewer. Nothing is
switched on or off by a server flag. The only build-time exclusion is
**notes from Ferni** (push notifications). That code is compiled out
(`FERNI_PUSH` is unset), and the APNs entitlement is not in the build, so
the feature is absent, not dormant.

Open item for the lead (critic H4): tap-to-interrupt sends `user_interrupt`,
and the voice agent acts on it only when `TAP_INTERRUPT` is on in production.
Either turn it on before submission or remove the gesture. Otherwise the
app shows a control whose effect depends on a server flag.

The minimum-build screen (`MinimumBuild`) shows only when the server names
this build as too old. That route doesn't exist yet, so it never shows. It
gates no feature.

## Signing in: no demo account needed

The app signs in anonymously on first launch, so a reviewer can talk to Ferni
without an account. Sign in with Apple (Settings, then Account) links the same
account; the reviewer can use their own Apple ID. Delete account works for
either kind. No credentials go in the repository or the review notes.

The teammates (Maya, Peter, Alex, Jordan, Nayan) join as the relationship
grows, so a new account sees them dimmed. To review a handoff, ask Ferni in a
call to bring someone in. If the reviewer needs a teammate already unlocked,
the demo plan is an anonymous review account prepared on the server with the
team unlocked. The steps to sign into it go in App Store Connect's review
notes as a one-time link, never in this repository.

## Every feature, and where to find it

| Feature | Where | Notes |
|---|---|---|
| Coming back | Home, after time away | After 20 minutes away the last call's goodbye clears; after 8 hours Ferni wakes as the app opens. The greeting and the room's light follow the clock. With `GET /api/home` (server route in review), Home asks about one light thread from last time ("How's the interview on Thursday going?") and may show a note from Ferni with Talk about this; without it, the time-of-day greeting. No server flag hides UI. |
| Touch Ferni | Home, tap Ferni at rest | He dents where touched, glances at the finger and lights up, with one soft tap in the hand. After a quiet 20 s at rest a firefly may wander by, once. Not in a call (there, a tap while Ferni speaks interrupts). Reduce Motion: a glance and a blink only. |
| Talk to Ferni (a voice call) | Home, the Talk button | The first time, the consent screen comes first. It names the processors (Google, Anthropic, Cartesia, LiveKit). |
| Microphone permission | First call | "Ferni listens only while you're talking together, so you can talk out loud." Denied: Home explains and offers Open Settings. |
| The call on the system | During a call | LiveCommunicationKit shows the call on the Lock Screen and in the system call UI. AirPods mute and the Lock Screen's end button work. |
| Live Activity and Dynamic Island | During a call | Who's talking, call time and an End button. |
| Live captions | During a call | What you and Ferni say. Turn them off under More, then Captions. |
| Report a reply (1.2) | Long-press a caption, or More, then Report | Sends the reply and a reason. Needs PR #2038 on the server. |
| Mute, End, More | Call controls | More: captions, report the last reply, Call 988. |
| Help now | More (in a call), Settings, then Help | Call or text 988. |
| Teammates | Home, the team row (iPad: sidebar, then Team) | Choose who answers next. Locked teammates say why. |
| The family table | During a call, when Ferni brings in a teammate | The teammate peeks in, they greet and swap, and the room light changes. |
| "I'll remember" | Home, after a call | Up to three things Ferni kept, each with Forget. |
| What Ferni remembers | Settings, then What Ferni remembers (iPad: sidebar) | View and forget memories. |
| Account and Sign in with Apple | Settings, then Account | Links the anonymous account to an Apple ID. |
| Delete account (5.1.1(v)) | Settings, then Delete account | Deletes the account and its data on the server, and revokes Sign in with Apple. The revoke needs PR #2004. |
| Withdraw consent | Settings, then Privacy | Ferni asks again before the next call. |
| Siri, Shortcuts, Action button | "Talk to Ferni", "Call Ferni", "Talk to Maya on Ferni" | App Intents. Talk always goes through consent; End is the Live Activity's button. |
| Control Center and Lock Screen control | Controls gallery, "Talk to Ferni" | |
| iPad | Sidebar (Talk, Team, What Ferni remembers, Settings) | In a landscape call, captions sit beside Ferni. Keyboard: Command-Return talks, Command-Period ends, Command-M mutes. |
| Languages | English | 1.0 ships in English only (most of the catalog was still English placeholders). The app declares `en` and builds no other language; the String Catalog stays in the repository for real translations later. |
| Accessibility | Throughout | Dynamic Type, VoiceOver labels and actions (including Interrupt while Ferni speaks), Reduce Motion (Ferni moves at 35% and skips the big moments). |
| Crash reports | Not visible | Sentry, only in builds that carry a DSN. No user, screenshots, view hierarchy or replay. |

## Privacy label

`apps/ios-native/App/PrivacyInfo.xcprivacy` and
`apps/ios-native/AppStore/PRIVACY-QUESTIONNAIRE.md` must match:

| Data | Linked | Purpose |
|---|---|---|
| Audio (the call) | Yes | App functionality |
| User ID (the account id) | Yes | App functionality |
| Other user content (transcripts, memories, reports) | Yes | App functionality |
| Name, email (Sign in with Apple, if used) | Yes | App functionality |
| Crash data | No | App functionality |

No tracking and no tracking domains. Required-reason APIs: UserDefaults
(CA92.1). The SDKs (Firebase, LiveKit, Sentry) ship their own manifests.

## Before submitting

- [ ] PR #2038 (reports) and PR #2004 (Apple revoke) merged and deployed.
- [ ] H4 decided: `TAP_INTERRUPT` on in production, or the gesture removed.
- [ ] A device run of `docs/ios/device-test-checklist.md` on an iPhone and an iPad.
- [x] The accessibility audit lane (XCUITest `performAccessibilityAudit`, default size and AX5): gating in CI on iPhone 17 Pro Max (0 findings); reported on iPad Pro 13" (see the note below).

### Accessibility audit: known iPad findings

`scripts/ui-audit.sh` runs the audit in CI. The iPhone is clean and gates the
build. The iPad step reports without gating; as of 2026-10-19 it has 19:

- **16 "Contrast failed" with no element**, exactly 2 per Home or call launch.
  They disappear when the Metal avatar is replaced by its static portrait (a
  diagnostic build), so they come from the avatar's canvas, which draws no
  text. The audit gives no element or frame to measure. Accepted as known.
- **3 in Settings:** two "Potentially inaccessible text" with no element, and
  the "can't reach your account" message at AX5, which only appears in a
  UI-test build (no account there). Open.

Every other finding was fixed, or accepted per element with the measured
contrast or a screenshot (`AccessibilityAuditTests.accepted`).
- [ ] Screenshots from the UI-test lane: 6.9" (iPhone 17 Pro Max), 6.3" (iPhone 17), iPad 13".
- [ ] The China storefront excluded in App Store Connect (owner decision for 1.0).
