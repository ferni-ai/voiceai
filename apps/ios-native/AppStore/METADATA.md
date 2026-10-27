# Ferni 1.0: App Store Connect metadata

Paste these into App Store Connect. Every claim matches what 1.0 does (the
staged iOS tip, `d630689b59`); if the app changes, change this file in the same
PR. Feature-by-feature detail for the reviewer: `docs/ios/app-review.md`.
Privacy answers in full: `PRIVACY-QUESTIONNAIRE.md`.

Rules for this copy:
- Ferni is a friend you talk to, not care. No therapy, treatment, diagnosis or
  "mental health" claims (1.4.1).
- No "AI" in labels or marketing. The one plain "Ferni isn't a person" line
  stays: it's the honest disclosure, not a pitch.
- Nothing 1.0 doesn't have (2.3.1), and nothing a server flag can switch off
  (2.5.19). No HealthKit, no HomeKit, no wrist check-ins, no demo login.

## App information

| Field | Value |
|---|---|
| Name | Ferni |
| Subtitle (30) | Someone in your corner |
| Primary category | Lifestyle |
| Secondary category | Health & Fitness |
| Copyright | © 2026 Ferni AI, Inc. (the legal name in ferni.ai/terms) |
| Support URL | https://ferni.ai/help/ (not /support: it redirects to /give/) |
| Marketing URL | https://ferni.ai |
| Privacy Policy URL | https://ferni.ai/privacy (the consent screen and Settings link here) |

TODO(seth): category is your call. Lifestyle draws less 1.4.1 scrutiny than
Health & Fitness as the primary; Tolan competes in Health & Fitness.

## Description (4,000)

```
Ferni is someone in your corner. Tap Talk and you're in a real conversation, out loud, the way you'd call a friend. No typing, no menus, no sign-up.

TALK IT THROUGH
Say what's on your mind, and Ferni talks it through with you. Live captions show what you both say, and you can turn them off.

A TEAM THAT GETS TO KNOW YOU
As you and Ferni get to know each other, teammates join you:
• Maya, for building habits and breaking bad ones
• Alex, for hard conversations and relationships
• Jordan, for goals, plans and life's big moments
• Peter, for patterns, research and finding answers
• Nayan, for mindfulness and the bigger questions
Choose who answers next, or ask Ferni to bring someone in.

REMEMBERS WHAT MATTERS, ON YOUR TERMS
Ferni keeps notes from your talks, so you never start over. See everything Ferni remembers, forget anything with a tap, and lock it with Face ID or Touch ID if you like.

YOUR NEXT STEP
When you say you'll do something, Ferni writes it down in your words. Add it to your calendar, or share it to the app you keep your to-dos in.

WHEREVER YOU ARE
• "Hey Siri, talk to Ferni", the Action button, or the Talk control in Control Center and on the Lock Screen
• Your call on the Lock Screen and in the Dynamic Island
• Apple Watch: start a call on your iPhone from your wrist, then mute or end it there
• iPad: a sidebar, with captions beside Ferni in landscape
• From 10 pm to 5 am, Ferni can go dark with you

GOOD TO KNOW
Ferni isn't a person. Ferni is software, built with artificial intelligence, that listens, remembers what matters to you, and talks with you. Real people built it and stand behind it. Ferni is a friend, not a therapist, and not a substitute for professional care or emergency help. In a crisis in the US, call or text 988. More at ferni.ai/what-ferni-is

YOUR PRIVACY
Before your first call, Ferni names the companies that help it hear, think and speak. We never sell your data, show you ads or track you. Withdraw your agreement, or delete your account and everything Ferni remembers, in Settings at any time.

FREE RIGHT NOW
Ferni is free. No plan to pick, no trial clock.
```

## Promotional text (170, changes without review)

```
Ferni is free right now. Tap Talk, say hi, and you're in a conversation. No sign-up, no typing, just talking.
```

## Keywords (100, no spaces after commas)

```
friend,talk,voice,companion,habits,goals,coach,mindfulness,motivation,listen,conversation,calm,chat
```

## What's New (1.0.0)

App Store Connect doesn't show this field for a first release. If it asks:

```
Hi, I'm Ferni. Tap Talk and say hello.
```

## Age rating

Answer by what a conversation can reach, not by what it usually is (2.3.6):
Ferni talks about whatever the person brings, and the server's crisis
detection exists because hard topics come up
(`src/services/safety/crisis-detection.ts`).

| Question | Answer | Why |
|---|---|---|
| Parental controls | No | The app has none |
| Age assurance | No | No age check; Declared Age Range isn't integrated (TODO(seth): counsel, for TX, UT, LA) |
| Unrestricted web access | No | No browser; links open fixed pages (privacy, terms, 988, findahelpline.com) |
| User-generated content | No | Nothing a person says is shown to anyone else; reports go only to the Ferni team |
| Messaging and chat | No | Apple means people talking to each other; in the app, a person talks only with Ferni's team |
| Advertising | No | None |
| Social media (since Sept 2026) | No | No feed, no profiles, no sharing between people |
| Profanity or crude humor | Infrequent | Open conversation; Ferni can echo a person's own words |
| Horror or fear themes | Infrequent | Only if someone asks for it |
| Alcohol, tobacco or drug use or references | Infrequent | People talk about drinking, smoking and quitting; Maya helps break habits |
| Mature or suggestive themes | Infrequent | Grief, trauma, abuse and breakups come up when the person raises them |
| Medical or treatment information | Infrequent | No diagnosis or treatment (ferni.ai/terms; Help: "a friend, not a therapist"), but medication, sleep or an emergency can come up, and Ferni points to 988 |
| Health or wellness topics | Yes | Habits, mindfulness, sleep, stress |
| Sexual content or nudity | Infrequent | Voice only, no images; relationships and assault disclosures can come up |
| Graphic sexual content and nudity | None | |
| Cartoon or fantasy violence | None | |
| Realistic violence | Infrequent | People describe things that happened to them |
| Prolonged graphic or sadistic violence | None | |
| Guns or other weapons | Infrequent | Only as conversation |
| Simulated gambling, contests, loot boxes | None | |
| An AI assistant or chatbot question, if shown | Yes | Every voice in the app is generated; no human operators |

**Calculated rating: 13+.** Infrequent medical or treatment information, drug
references, sexual content and realistic violence each map to 13+. Answering
mature themes or medical information "Frequent" makes it 16+.

**But the listing must show 18+ while the Terms stay as they are.** The Terms
require users to "Be at least 18 years old" (`apps/website/ferni-website/src/terms.njk:82`),
the consent screen links them, and Apple says an app whose EULA sets a higher
minimum age must override its rating up to meet it. The privacy policy says 16
(`privacy.njk:510`), so the two disagree as well. TODO(seth), one of:
- keep 18 in the Terms and override to 18+ (since 2026-02-24, Apple blocks 18+
  downloads in Australia, Brazil and Singapore without adult confirmation);
- or set one minimum age in the Terms and the privacy policy (16 gives 16+),
  then take the calculated rating or that age, whichever is higher.

## App Review information

- Sign-in required: **No.** Leave the demo account fields empty.
- Contact: TODO(seth) name, phone and email.
- Attachment: a screen recording from a clean install on an iPad, launch to
  Ferni's first spoken reply (TODO(seth): record it on the review build).

Notes for review (paste; confirm the bracketed items on the final build):

```
No account is needed. Ferni signs in anonymously on first launch.

Hearing Ferni in about 30 seconds (iPad or iPhone):
1. Launch Ferni and tap "Talk to Ferni".
2. The "Before we talk" screen names the companies that receive your voice and conversation: Google (Gemini), Anthropic (Claude), Cartesia (speech) and LiveKit (the call itself). Tap "I agree, let's talk".
3. Allow the microphone. The prompt says: "Ferni listens only while you're talking together, so you can talk out loud."
4. Say: "Hi Ferni, what can you do?" Ferni answers aloud within a few seconds. Captions show what you both say.

Ferni is a voice companion. Every voice in the app is generated by AI; there are no human operators. Ferni is a friend, not a therapist, and gives no medical diagnosis or treatment. Help says so.

If something goes wrong:
- Microphone denied: Home explains why Ferni needs it and offers Open Settings.
- Network or service unreachable: a message appears within about 20 seconds and Talk becomes Retry. Ferni never waits silently.

Where things are: on iPhone, the account button at the top of Home opens Settings; on iPad, use the sidebar.
- Withdraw consent: Settings > Privacy > Withdraw. It ends any live call; Ferni asks again before the next call.
- Delete account: Settings > Delete account (the last row). It works for anonymous accounts too, deletes the account and everything Ferni remembers on our servers, and revokes Sign in with Apple.
- Memory: Settings > What Ferni remembers. Each item can be forgotten.
- Report a reply: long-press any caption of Ferni's and choose "Report this reply", or during a call tap More > "Report something Ferni said".

Safety: the 988 Suicide & Crisis Lifeline (call or text) is in Settings > Help, in the call's More sheet, and in the Home Screen quick action "Get help now", which works even when Ferni can't connect. Help also links to findahelpline.com for outside the US.

Optional sign-in: Sign in with Apple (offered first) and Google, in Settings > Account, so memory follows you across devices. After signing out of a real account, Talk asks you to sign in again, so one person's memory isn't reused by someone else on the same device.

Background audio (UIBackgroundModes: audio): a conversation is a live call. Locked or in the background, Ferni keeps talking and listening; the call shows on the Lock Screen and in a Live Activity with an End button. [Confirm on the iPad run; recording attached.]

iPad: a sidebar layout, all orientations, Split View and resizable windows. In landscape, captions sit beside Ferni. Keyboard: Command-Return talks, Command-Period ends, Command-M mutes.

Optional surfaces: "Talk to Ferni" in Siri, Shortcuts, the Action button and the Control Center or Lock Screen control start the same conversation, through the same consent screen. Apple Watch: the Watch app is a remote for a call on the iPhone (tap Talk on the watch, then mute or end). Widgets: the small one shows Ferni; the medium one has Talk. After a good call, Ferni may ask once whether it may check in with a note; notifications are never needed to use the app.

Server-controlled settings: during review, and after release, these stay as described and add nothing you haven't seen: [TAP_INTERRUPT = on (hold Ferni while he talks, or VoiceOver's "Interrupt Ferni", stops him)].
```

Internal, never pasted (check on submission day, and snapshot the flags):
- `WAITLIST_GATE` stays **off** in prod through review. With it on, `/token`
  refuses anonymous accounts and the reviewer gets "Sign in to join the list".
- `TAP_INTERRUPT` on, or the hold gesture removed (#2868). `IOS_PUSH` on for
  the review account, or the check-in ask leads to no note.
- Prod never routes a call to a provider the consent screen doesn't name. The
  privacy policy lists OpenAI as a backup model; the consent screen doesn't.
- #2004 (Apple revoke), #2038 (reports), #2226 (anonymous merge) **deployed**.
- The in-call "Get help now (988)" crisis row never shows in a release build
  (`ferni.call.crisisMode` has no release writer), so the notes don't promise it.
- Upload the review build with this repo's `ExportOptions-TestFlight.plist`
  (`testFlightInternalTestingOnly` false). A build uploaded internal-only can't
  be submitted.

## App Privacy (nutrition label)

Matches `App/PrivacyInfo.xcprivacy`. Tracking: none, no tracking domains.

| Data | Linked | Purpose | Where it comes from |
|---|---|---|---|
| Audio data | Yes | App functionality | The call's voice, to the processors the consent screen names |
| Other user content | Yes | App functionality | Transcripts, what Ferni remembers, reports |
| User ID | Yes | App functionality | The Firebase account id, anonymous at first |
| Name, email address | Yes | App functionality | Only if the person signs in with Apple or Google |
| Crash data | No | App functionality | Sentry, only in builds that carry a DSN |

Not collected: health and fitness, location, contacts, purchases, financial
info, browsing, search history, advertising data.

TODO(seth):
- Crash data counts only if the release build has `SENTRY_DSN`
  (`Config/Sentry.local.xcconfig`, uncommitted). "Not linked" holds once
  `beforeSend` also drops exception values, message, extra and contexts
  (#2868 item 11).
- Device ID: the push token is registered to the account
  (`PushStore.swift`, `POST /api/push/devices`) once someone allows notes.
  Decide whether to declare it.
- Usage data: ferni.ai/privacy says the server keeps usage analytics (counts
  and timings under a scrambled ID, 400 days, not erased on deletion). If iOS
  calls feed it, declare Product Interaction.

## Screenshots

- iPhone 6.9" and iPad 13": `scripts/store-screenshots.sh`.
- **Apple Watch: required.** The iOS build embeds `FerniWatch.app`
  (`project.yml:67`), so App Store Connect asks for Watch screenshots, and the
  script shoots only iPhone and iPad. Add a Watch lane (the remote at rest,
  "On your iPhone, whenever you're ready.", and in a call with mute and end),
  or drop the watch target from 1.0.
- Show the app in use (2.3.3). Captions on screenshots follow the copy rules
  above, and stay fit for 4+ whatever the rating (2.3.8).

## Accessibility labels

Declare from the table in `docs/ios/app-review.md`, and Sufficient Contrast
only once the iOS CI accessibility audit is green again.
