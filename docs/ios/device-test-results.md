# iPhone device test results

Results of `device-test-checklist.md`, newest first. "Not run" means not
proven on hardware: the simulator never runs LiveCommunicationKit, so a
simulator pass says nothing about those steps.

## 2026-10-20: Seth's iPhone 16 Pro Max, build 2026102000.54 (`fe0c39522`)

**Owner-observed, critic C2 (sign in to the account you already have): PASS.**
Seth signed in with Google on the phone, and a call afterwards greeted him by
name, so the app was on his real Ferni account, not a new anonymous one. This
is Seth's report, relayed by the coordinator; no trace was captured.

| Check | Result |
|---|---|
| Google sign-in to an existing account | Pass, owner-observed |
| The next call knows who he is (greeted by name) | Pass, owner-observed |
| Phone-number sign-in | Blocked: Firebase 17062, the API key's restriction. Waiting on Seth's choice of fix (A or B) |

## 2026-10-19: Seth's iPhone 16 Pro Max (00008140-001631841190801C)

Builds: 9ad88b3bd (Seth's install, signed Debug, API https://app.ferni.ai),
then 43953065f with temporary stderr traces (installed by the iOS lane over
devicectl; traces were never committed).

Seth reported "the Talk to Ferni button doesn't work" on 9ad88b3bd.

**Cause (fixed in 43953065f):** the Talk button was a plain-styled button
whose label was framed to the glass capsule. A plain button hit-tests only
what it draws, so only the words took a tap; the rest of the capsule wobbled
(interactive Liquid Glass) and did nothing. End, Mute and More had hit areas
of 4–16 pt for the same reason. Reproduced through the real button in
XCUITest on the 6.9" simulator (`TalkButtonTests`, red then green).
**Owner-observed on the device with 43953065f: the button works.**

**Owner-observed, critic C1 basic path: PASS.** Seth tapped Talk, the call
started, Ferni answered and he could hear her: LiveCommunicationKit start,
the system's audio session and two-way LiveKit audio worked on hardware.
This is Seth's report, relayed by the coordinator; no trace was captured
for that call (the console capture had ended when the phone left
devicectl), so there are no logs or timings behind it.

What the device showed (trace build, before the phone left devicectl):

| Check | Result |
|---|---|
| Install and launch, signed Debug | Pass |
| Firebase configures at launch | Pass (`firebaseReady=true`) |
| LiveCommunicationKit at launch | `conversationManagerDidReset` fires once at launch; harmless (no call active, the `.end` request is ignored) |
| A tap reaching `talk()` | Not observed in ~30 min of capture on 9ad88b3bd (consistent with the bug above, or with no tap: unconfirmed) |
| Talk starts a call on 43953065f | Pass, owner-observed |
| Anonymous sign-in, consent, token, LiveKit connect | Pass, owner-observed (the call connected); no trace |

Checklist steps:

| # | Step | Result |
|---|---|---|
| 1 | Tap Talk, say a sentence; Lock Screen and Dynamic Island | Talk and two-way audio: PASS, owner-observed. Lock Screen and Dynamic Island (Live Activity): NOT RUN |
| 2 | Body moves with Ferni's voice | NOT RUN |
| 3 | Siri mid-call, then talk | NOT RUN |
| 4 | Incoming phone call declined, then talk | NOT RUN |
| 5 | Locked phone, a minute of talk (audio mode only, critic M8) | NOT RUN |
| 6 | Family table handoff | NOT RUN |
| 7 | End from the Lock Screen | NOT RUN |
| 8 | Two minutes on Home, three in a call: fps and heat | NOT RUN |
| — | The Watch round trip | NOT RUN |
| 9 | AirPods, locked phone, "Hey Siri, talk to Ferni" | NOT RUN |
| 10 | AirPods stem mute and unmute | NOT RUN |
| 11 | AirPods route changes mid-call | NOT RUN |
| 12 | Get help now quick action, cold and running | NOT RUN |

Still unproven on hardware: interruptions (Siri, a phone call), the call
with the phone locked, ending from the Lock Screen, the Live Activity and
Dynamic Island, the Metal avatar's frame rate and heat, and the Watch round
trip. The coordinator is scheduling these with Seth.

Next run: phone unlocked and visible to the Mac (same Wi-Fi or a cable).
Install a trace build (the iOS lane applies its trace patch locally; it is
not in the repository), launch with
`xcrun devicectl device process launch --console --terminate-existing --device <udid> com.sethdford.ferni`,
and have Seth go through steps 1–8. The trace prints each step from the tap
to the LiveKit connect (talk → consent → sign-in → LCK start → microphone →
token → connect → microphone on), so a stall names its step.
