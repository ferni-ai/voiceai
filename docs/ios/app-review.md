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

## Paid plans: unreachable, and what's left in the binary

Ferni is free for now (2026-10-10). `PaidPlans.isOffered` is a constant
`false`, so the app never prices, sells or restores a plan, and nothing
leads to the StoreKit code (`SubscriptionService`, `PlanPurchaseModel`),
which stays in the source so paid plans can come back. The constant is a
`let`, not a build-time `#if`: the code is compiled, then stripped where the
linker can.

Measured on an unsigned Release archive (build 2026101918.59, 2026-10-19):

| Looked for in `Ferni.app/Ferni` | Found |
|---|---|
| The four product IDs (`com.ferni.subscription.*`) | none |
| Purchase copy ("Restore purchases", "Your plan", "per month") | none |
| A `.storekit` configuration in the bundle | none |
| The class names `SubscriptionService`, `PlanPurchaseModel` | yes, as Objective-C runtime names (`_TtC8FerniKit19SubscriptionService`). Swift classes are listed in `__objc_classlist`, which the linker never strips |
| StoreKit | linked (`otool -L`), for one type: `StoreKit.Product` |

So no purchase path, product or price ships, but a static scan will see
StoreKit linked and those two class names. Linking StoreKit isn't a
guideline issue on its own, and nothing a reviewer can reach depends on it.
If even that should go, wrap `FerniKit/Store/` in `#if PAID_PLANS`.

## Signing in: no demo account needed (unless the waitlist gate is on)

The app signs in anonymously on first launch, so a reviewer can talk to Ferni
without an account.

**With the server's `WAITLIST_GATE` on, an admitted demo account is
required.** The gate never admits an anonymous account (the server's
`isAdmitted` refuses it and `/api/waitlist/me` answers `not_joined`), so a
reviewer's Talk would end on "Sign in to join the list" instead of a call.
Prepare an admitted review account on the server and put the steps to sign
into it in App Store Connect's review notes as a one-time link, never in this
repository. With the gate off (the default) none of this applies. Sign in with Apple (Settings, then Account) links the same
account; the reviewer can use their own Apple ID. Delete account works for
either kind. The sign-in sheet offers Apple, then Google; phone-number
sign-in shows only when the server's app config (`GET /api/app-config/ios`,
`phoneSignIn: true`) turns it on, so a Release build without that field
doesn't offer it (it fails on hardware until the Firebase key restriction is
changed). No credentials go in the repository or the review notes.

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
| Touch Ferni | Home, tap Ferni at rest | He dents where touched, glances at the finger and lights up, with one soft tap in the hand (and, with Sounds on, a soft boop: a system sound; whether the silent switch mutes it is on the device checklist). Four quick taps and he spins. Hold a finger on him and he notices it ("huh?"), leans in and watches it, his eyes crossing when it's close. Back on Home after a few seconds away, a double take. After a quiet 20 s at rest a firefly may wander by, land on his head and get sneezed away, once. Not in a call (there, a tap while Ferni speaks interrupts). Reduce Motion: a glance and a blink only, and no sounds. |
| Talk to Ferni (a voice call) | Home, the Talk button | The first time, the consent screen comes first. It names the processors (Google, Anthropic, Cartesia, LiveKit). With the server's `WAITLIST_GATE` on, an account not admitted yet sees its place in line instead of a call, and an anonymous or not-joined one is asked to sign in to join the list (no email promise: there's no email to write to). The review account must be admitted (the gate is off by default; see Signing in). |
| Microphone permission | First call | "Ferni listens only while you're talking together, so you can talk out loud." Denied: Home explains and offers Open Settings. |
| The call on the system | During a call | LiveCommunicationKit shows the call on the Lock Screen and in the system call UI. AirPods mute and the Lock Screen's end button work. |
| Live Activity and Dynamic Island | During a call | Who's talking, call time and an End button. |
| Live captions | During a call | What you and Ferni say. Turn them off under More, then Captions. |
| Report a reply (1.2) | Long-press a caption, or More, then Report | Sends the reply and a reason. Needs PR #2038 on the server. |
| Mute, End, More | Call controls | More: captions, report the last reply, Call 988. |
| Help now | More (in a call), Settings, then Help, or long-press the app icon: Get help now | Call or text 988; outside the US, findahelpline.com. The quick action is static, so it works even when Ferni can't connect. |
| Teammates | Home, the team row (iPad: sidebar, then Team) | Choose who answers next. Locked teammates say why. |
| The family table | During a call, when Ferni brings in a teammate | The teammate peeks in, they greet and swap, and the room light changes. |
| "I'll remember" | Home, after a call | Up to three things Ferni kept, each with Forget. |
| Your next step | Home, after a call where you said you'd do something | The step in your words with its time. Add to Calendar opens the system's event sheet (EventKitUI; no calendar permission is asked, and the app can't read the calendar). Share opens the share sheet for Reminders, Things, Todoist or anything else. Needs the review account to have said something it will do. |
| What Ferni remembers | Settings, then What Ferni remembers (iPad: sidebar) | View and forget memories. |
| Account and Sign in with Apple | Settings, then Account | Links the anonymous account to an Apple ID. |
| Delete account (5.1.1(v)) | Settings, then Delete account | Deletes the account and its data on the server, and revokes Sign in with Apple. The revoke needs PR #2004. |
| Withdraw consent | Settings, then Privacy | Ferni asks again before the next call. |
| Teammates in Spotlight | Spotlight: type a teammate's name or what they help with ("money", "habits") | Only teammates the person has met are indexed (a new account: Ferni). Opening one goes through Talk, so consent comes first. Shortcuts offers the same teammates. Memories, people and follow-ups are never indexed. |
| Siri, Shortcuts, Action button | "Talk to Ferni", "Call Ferni", "Talk to Maya on Ferni" | App Intents. Talk always goes through consent; asked from another device (a shared screen's Siri, a HomePod, a watch), the iPhone's owner unlocks it first. Nothing is said or shown back. End is the Live Activity's button. |
| Control Center and Lock Screen control | Controls gallery, "Talk to Ferni" | |
| iPad | Sidebar (Talk, Team, What Ferni remembers, Settings) | In a landscape call, captions sit beside Ferni. Keyboard: Command-Return talks, Command-Period ends, Command-M mutes. |
| The web's Apple Health link | `ferniapp://healthkit/authorize` (from Ferni on the web, on an iPhone) | Opens Ferni with "Health sharing isn't in the iPhone app yet." The app has no HealthKit; no link starts a call or changes anything. |
| Languages | English | 1.0 ships in English only (most of the catalog was still English placeholders). The app declares `en` and builds no other language; the String Catalog stays in the repository for real translations later. |
| Accessibility | Throughout | Dynamic Type, VoiceOver labels and actions (including Interrupt while Ferni speaks), Reduce Motion (Ferni moves at 35% and skips the big moments). |
| Crash reports | Not visible | Sentry, only in builds that carry a DSN. No user, screenshots, view hierarchy or replay. |

## Shared screens: Apple HomeView and CarPlay

Apple HomeView (a household's shared screen, shipping 2026-11-13) and CarPlay
show small widgets from a connected iPhone. Whoever is looking or tapping may
not be the phone's owner, so:

- **The small widget is Ferni, peeking, and nothing else.** No Talk button,
  no text, no names, notes, last call or anything from the account. The
  widget extension can't read the app's data at all: it links only
  FerniDesign and has no shared app group (`SharedScreensTests`). A tap opens
  Ferni on the iPhone; it never starts a call.
- **Talk from a shared screen:** there's no Talk on a shared screen. The
  medium widget, which keeps Talk, only shows on an iPhone or iPad's own Home
  Screen and Today View. Siri there ("Talk to Ferni", "Talk to Maya on
  Ferni") runs the same App Intents as on the phone, which require local
  device authentication: the system asks to unlock the iPhone before a call
  starts as its owner, then consent comes first as always.
- **CarPlay:** the small widget has no interaction that needs an unlocked
  iPhone, so it isn't disfavored for CarPlay (agreement 6.4.1). The medium
  widget doesn't show there.
- **Rendering modes:** the widget peeks in full colour, and in tinted and
  clear modes draws a plain body with the eyes as the accented layer
  (`FerniPeekTests`). In StandBy, CarPlay and HomeView's Modular face the
  background is removed and it's scaled up.

What's verified from Apple's own pages, and what isn't:

| Claim | Status | Source |
|---|---|---|
| HomeView shows system small widgets from a connected iPhone or iPad, with the iPhone's appearance (light, dark, clear, tinted); on the Modular face, background removed and scaled up | Verified | HIG, Widgets (change log: 2026-10-13, "Added guidance for Apple HomeView") |
| iPhone system small: Home Screen, Today View, StandBy, CarPlay and HomeView; system medium: Home Screen and Today View only | Verified | HIG, Widgets, the supported-contexts table |
| iOS widgets may be made available on CarPlay and HomeView; disfavor with `disfavoredLocations` a widget not suitable for CarPlay, e.g. one that needs the iPhone unlocked | Verified | Developer Program License Agreement 6.4.1 |
| Apps with a CarPlay entitlement in categories Apple names may be offered on HomeView while running on a paired iPhone | Verified | DPLA 6.4.2 |
| `requiresLocalDeviceAuthentication` asks to unlock the device running the intent "even if the request originated from an already authenticated Apple Watch or remote device" | Verified | App Intents documentation |
| The SDK has no HomeView API: `WidgetLocation` has `.carPlay` (iOS 26) but no HomeView location, and nothing in WidgetKit, App Intents or CarPlay names HomeView | Verified | iPhoneOS 27.1 SDK interfaces (Xcode 27.1) |
| Disfavoring `.carPlay` also keeps a widget off HomeView | Inferred, not stated | The agreement pairs them; the API has only `.carPlay` |
| HomeView's Siri runs an iPhone app's App Intents, and where a foreground intent opens | Inferred | No Apple page describes it; no HomeView simulator |
| Ferni as a CarPlay voice-conversation app on HomeView | UNCONFIRMED | Needs Apple to grant a CarPlay entitlement in an eligible category (6.4.2) and HomeView to ship; Ferni has no CarPlay entitlement today |

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

## App Store accessibility labels

What to declare in App Store Connect (Accessibility, iPhone and iPad), and
what backs each claim. Declare only the "yes" rows until the device rows are
checked.

| Feature | Declare | Evidence |
|---|---|---|
| Larger Text | Yes | Every screen audited at AX5 on three devices; call controls stay pinned and reachable (CallControlsAtLargeTextTests). |
| Dark Interface | Yes | Follows the phone's dark mode, and Night Ink from 10 pm (NightInkUITests); the night audits run in it. |
| Sufficient Contrast | Yes | The contrast audit is clean on every screen; the few accepted findings were measured from pixels (AccessibilityAuditTests.accepted). |
| Reduced Motion | Yes | Expression animations, bursts and stage moves don't play; feelings are held still (ExpressionAnimationTests, testReduceMotionAndTransparency, testConfusedStillReadsUnderReduceMotion). |
| Captions | Yes | Every call has live captions of both sides, named per speaker, with "Maya joined" at a handoff. |
| VoiceOver | After the device run | Every control is labelled (audit), the call's trouble is announced; complete a call, sign-in and Settings with VoiceOver on a device first. |
| Voice Control | After the device run | Labels match the visible names; try "Tap Talk" and the call controls on a device first. |
| Differentiate Without Color Alone | After review | Teammates have a name with their colour everywhere; check the call states. |
| Audio Descriptions | No | No video. |

## Before submitting

- [ ] PR #2038 (reports) and PR #2004 (Apple revoke) merged and deployed.
- [ ] H4 decided: `TAP_INTERRUPT` on in production, or the gesture removed.
- [ ] `POST /api/identity/merge-anonymous` live in production with IDENTITY_MERGE_ANON on, before any external TestFlight or App Store build. Signing in to an account someone already has merges this phone's anonymous calls into it; without the route the app signs them in and quietly leaves those calls behind ("Earlier calls on this phone stay separate").
- [ ] A device run of `docs/ios/device-test-checklist.md` on an iPhone and an iPad.
- [x] The accessibility audit lane (XCUITest `performAccessibilityAudit`, default size and AX5): gating in CI on iPhone 17 Pro Max, iPad Pro 13" and iPhone SE (3rd generation), 0 findings on all three (2026-10-21).
- [ ] App Store accessibility labels entered in App Store Connect, from the table below.

### Accessibility audit: known iPad findings

`scripts/ui-audit.sh` runs the audit in CI and gates the build on all three
lanes (Home in all four RoomLight bands, both text sizes, and Home after a
call). History of the iPad findings, re-run on 2026-10-20:

- **Fixed: the sidebar.** Over the system's glass sidebar the audit failed
  the contrast of every sidebar row (their pixels measure 19.7:1), naming
  them in some runs and not in others. The unnamed ones were the "no
  element, 2 per launch" findings on Home and in a call, earlier put down to
  the avatar's canvas: with the sidebar hidden, Home, the call and Settings
  had none. The sidebar now has Ferni's room colour, and Home, the call,
  Settings and the Reduce Motion and Transparency audits have no contrast
  findings left. The four per-row acceptances were removed, so the audit
  guards it.
- **Fixed: Settings.** As a sheet it had sheet artifacts (Home's text
  behind it, a row clipped at its edge); as the sidebar's page (90b244273)
  those are gone, and the two sidebar rows above were all that was left.
  Settings now passes on iPad at both sizes.
- **Fixed: Consent.** As a form sheet it had two findings. The "potentially
  inaccessible text" with no element (standard and AX5) was the sidebar,
  drawn beside the sheet but hidden from VoiceOver while it's modal: with
  the sidebar hidden, it went away. The AX5 contrast finding was the body:
  its words measure 7.0:1 (#5c544a on #faf8f5), but at AX5 the paragraph
  runs past the sheet's bottom edge onto the dimmed room. On iPad consent
  now covers the whole screen (the iPhone keeps its sheet over the room),
  and Consent passes on iPad at both sizes; as a sheet again, both findings
  come back. Full screen, its words and buttons stay together in the middle
  (the buttons had waited 728 pt below the Terms link in portrait); large
  text scrolls, the buttons with it.
- **Fixed: Home at 20h, "Whenever you're ready, I'm here."** on iPad. Its
  pixels measure 6.4:1 (#5c544a on #f2eee7), but the audit failed the
  regular weight in the evening band only. At medium weight (same colours)
  iPad Home passes in all four bands at both sizes; back at regular, the
  line fails again.
- **Fixed: AvatarTouchTests.testTheSpaceBesideFerniIsNotFerni on iPad.** Not
  an avatar bug: Ferni's touch circle is honored exactly (shrunk to 50 pt it
  reached 75 pt, not 85), but a touch counts when its area overlaps the
  circle, and fingertips reach 28-35 pt past it on the iPad simulator (under
  24 pt on iPhone). The test's 24 pt was an iPhone fingertip; it now taps
  36 pt past the circle on iPad, reading the circle from Ferni's frame and
  holding it to 0.35 of the largest slot, so a wider circle fails it on
  both. To confirm on a device.

Every other finding was fixed, or accepted per element with the measured
contrast or a screenshot (`AccessibilityAuditTests.accepted`).
- [ ] Screenshots from the UI-test lane: 6.9" (iPhone 17 Pro Max), 6.3" (iPhone 17), iPad 13".
- [ ] The China storefront excluded in App Store Connect (owner decision for 1.0).
