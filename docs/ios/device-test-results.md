# iPhone device test results

Results of `device-test-checklist.md`, newest first. "Not run" means not
proven on hardware: the simulator never runs LiveCommunicationKit, so a
simulator pass says nothing about those steps.

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
XCUITest on the 6.9" simulator (`TalkButtonTests`, red then green). Not yet
confirmed by Seth on the device.

What the device showed (trace build, before the phone left devicectl):

| Check | Result |
|---|---|
| Install and launch, signed Debug | Pass |
| Firebase configures at launch | Pass (`firebaseReady=true`) |
| LiveCommunicationKit at launch | `conversationManagerDidReset` fires once at launch; harmless (no call active, the `.end` request is ignored) |
| A tap reaching `talk()` | Not observed in ~30 min of capture (consistent with the bug above, or with no tap: unconfirmed) |
| Anonymous sign-in, consent, token | Not run |

Checklist steps:

| # | Step | Result |
|---|---|---|
| 1 | Tap Talk, say a sentence; Lock Screen and Dynamic Island | Not run |
| 2 | Body moves with Ferni's voice | Not run |
| 3 | Siri mid-call, then talk | Not run |
| 4 | Incoming phone call declined, then talk | Not run |
| 5 | Locked phone, a minute of talk (audio mode only, critic M8) | Not run |
| 6 | Family table handoff | Not run |
| 7 | End from the Lock Screen | Not run |
| 8 | Two minutes on Home, three in a call: fps and heat | Not run |

Still unproven on hardware: critic C1 (the call's audio under
LiveCommunicationKit: start, `didActivate`, the LiveKit engine), the Metal
avatar's frame rate and heat, and the Watch round trip.

Next run: phone unlocked and visible to the Mac (same Wi-Fi or a cable).
Install a trace build (the iOS lane applies its trace patch locally; it is
not in the repository), launch with
`xcrun devicectl device process launch --console --terminate-existing --device <udid> com.sethdford.ferni`,
and have Seth go through steps 1–8. The trace prints each step from the tap
to the LiveKit connect (talk → consent → sign-in → LCK start → microphone →
token → connect → microphone on), so a stall names its step.
