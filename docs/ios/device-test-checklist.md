# iPhone device run sheet

One sitting on Seth's iPhone 16 Pro Max (00008140-001631841190801C), about
40 minutes, top to bottom. Each step says what to do and what "pass" looks
like. If a step doesn't pass, write down the step number and what you saw;
nothing else needs fixing on the spot. Some steps need a certain time of day:
they're marked, and can be done later or skipped.

It covers the things a simulator can't show: a real call and its audio, the
call's in-between states (calling, reconnecting, on hold, failed), the Lock
Screen and the Dynamic Island, the widget, signing in, Night Ink, and how warm
the phone gets. Results go in `device-test-results.md`, newest first. Repeat on
an iPad when one is paired (the January rejection device was an iPad Air).

## Before

1. Build and install the Debug build (Apple Development, team XT8W26YE9U):
   `xcodebuild build -project apps/ios-native/Ferni.xcodeproj -scheme Ferni -configuration Debug -destination id=<udid> -allowProvisioningUpdates`,
   then `xcrun devicectl device install app --device <udid> <Ferni.app>`.
   (Builds .66 and .67 are already built in the scratchpad; .67 is the tip.)
2. Note the start time, for the logs at the end.
3. On the phone: Settings, Display & Brightness, Light. Sounds on. Not in Low
   Power Mode. Wi-Fi on.

## 1. Home

| # | Do | Pass |
|---|----|------|
| 1 | Open Ferni | Ferni is big in the middle of the room, his hello under him on a paper card, Talk at the bottom. Nothing is half empty or cut off. |
| 2 | Tap Ferni once; then hold a finger on him for a second | A soft boop the first time; a small "huh?" while you hold. |
| 3 | Flip the silent switch on and tap him again (wait 2 s) | No sound. If he still makes sounds with the switch on, note it (they're system sounds and the docs don't say). |
| 4 | Tap beside Ferni, in the empty room next to him | Nothing happens: only Ferni himself takes a touch. |
| 5 | Tap the heart-and-notes button, top left | "What Ferni remembers" opens. If he knows about people in your life, they come first under their own names ("Your sister"), then the rest by week. Done closes it. |
| 6 | Tap the person button, top right, then scroll Settings | Settings opens. There's a "Dark from 10 pm" switch, on. |

## 2. Signing in

| # | Do | Pass |
|---|----|------|
| 7 | In Settings, sign out if signed in. Back on Home, tap Sign in, then Sign in with Apple, and finish | The sheet closes; Settings shows your Apple account. Your earlier calls are still there (What Ferni remembers isn't empty). |
| 8 | Sign out, then sign in with Google | Same: signed in, and Ferni greets you by name on the next call. |
| 9 | (Only after the Firebase key change, option A, is done.) Sign out; tap Sign in and use your phone number | The phone number section shows in this Debug build. A code arrives by text and signs you in. Before the key change it fails with error 17062; that's expected, note it and move on. |

## 3. A call

| # | Do | Pass |
|---|----|------|
| 10 | Tap Talk | "Calling Ferni…" for a moment, then he arrives and says hello. With the waitlist gate off, there's no "You're on the list" screen: the call just starts. |
| 11 | Say a sentence; let him talk for 30 s | He hears you and answers. His body moves with his voice (glow, lids, small nods), with no stutter. Captions show both sides. |
| 12 | Tap Mute while he's waiting for you | The call says "You're muted". Ferni looks down and to the side, away from you, and stays there. Tap Mute again: he looks back at you. |
| 13 | Go to the Lock Screen (lock the phone) | The call is there: Ferni's face, what he's doing ("Ferni's listening"), the running time, Mute and End. Mute there: it says "You're muted", and the call is muted when you go back. Unmute. |
| 14 | Unlock and go to the Home Screen (leave the app) | The Dynamic Island shows Ferni's face and a waveform; press it to see Mute and End. Muted, the waveform becomes a crossed-out mic. Go back to the app. |
| 15 | Lock the phone and keep talking for a minute | The audio carries on both ways. (This shows the app needs only background audio, not VoIP. If it stops, note it before anyone adds VoIP back.) |
| 16 | Ask Ferni to bring in Maya (if she's unlocked) | They greet each other and swap places: Maya in the middle, Ferni in the corner. In the captions, a quiet "Maya joined" line, then her words under her name. |
| 17 | Mid-call: "Hey Siri, what time is it?", then talk again | The call comes back on its own, or shows "On hold" with Resume. It never shows "listening" over a dead mic. |
| 18 | Have someone call the iPhone; decline; talk again | Same as 17. |
| 19 | Turn on Airplane Mode for 5 s, then off | "Reconnecting…" appears, then the call carries on by itself. |
| 20 | With AirPods in: press the stem to mute, then again | Muted: "You're muted" and Ferni hears nothing; pressed again, the call comes back. |
| 21 | Take one AirPod out, then put both away | The call keeps going on whatever is left, both ways, never silent. |
| 22 | End the call from the Lock Screen | The call ends, Ferni's goodbye plays. The Lock Screen shows a wave and "Talk soon." with no timer and no buttons, and goes away after a few seconds. |

## 4. After the call

| # | Do | Pass |
|---|----|------|
| 23 | Look at Home after the call | The "I'll remember" card rises up out of where the captions were and settles gently (no bounce). Your words in it are dark, not grey. |
| 24 | Tap ••• on a line, then Not quite; change a word; Save | The keyboard comes up by itself, the field and Save stay above it, and the line updates. |
| 25 | Wait 20 minutes, or come back later, and open the app | The goodbye is gone; Ferni greets you fresh. |

## 5. When it goes wrong

| # | Do | Pass |
|---|----|------|
| 26 | Turn on Airplane Mode and tap Talk | "Couldn't reach Ferni. Check your connection and try again." on a paper card. No endless spinner, no error codes. Turn Airplane Mode off. |
| 27 | Tap Talk, and hang up while it says "Calling Ferni…" | The call just stops and Home says goodbye ("Talk soon."). No error message: hanging up isn't a failure. |
| 28 | Long-press the Ferni icon: Get help now. Once with Ferni closed, once with it open in the background | Help opens both times (Call or Text 988, and a helpline outside the US). It never starts a call. |
| 29 | Hey Siri, talk to Ferni, with the phone locked in a pocket and AirPods in | Note exactly what happens. Expected today: Siri asks you to unlock first. |

## 6. The widget (needs the right hours)

| # | Do | Pass |
|---|----|------|
| 30 | Add the Ferni widget (medium) to the Home Screen | Ferni peeks up from the bottom edge, with a hello for the time of day and a Talk button. Talk starts a call, consent first if needed. The small widget has no Talk button. |
| 31 | Check it just after 5 am, 12 pm, 5 pm and 10 pm, without opening the app | The hello changes: "Good morning", "Good afternoon", "Good evening", "Up late? I'm here." |
| 32 | Check it just after 11 am, 6 pm and 10 pm | The light behind Ferni changes: warm in the morning, plain by day, amber in the evening and late at night. |
| 33 | With the phone in Dark mode, look at the widget at night | A warm near-black, not brown. (The widget follows the phone's own Dark mode, not Ferni's "Dark from 10 pm" switch.) |

## 7. Night Ink (after 10 pm)

| # | Do | Pass |
|---|----|------|
| 34 | After 10 pm, with the phone in Light mode, open Ferni | The whole app is dark (warm near-black) and easy on the eyes, even though the phone is in Light mode. The words are light on dark plates. |
| 35 | In Settings, turn "Dark from 10 pm" off | The app goes back to light right away. Turn it back on. |
| 36 | Open it again after 5 am | Light again, by itself. |

## 8. Heat and smoothness

| # | Do | Pass |
|---|----|------|
| 37 | Stay on Home for 2 minutes, then call for 3 minutes | No warmth, no slowdown. In the logs: `scale=3.0`, fps at least 55 while Ferni speaks and about 30 at rest, thermal no worse than "fair". |

## Evidence to capture

After the session, with the iPhone still connected, collect its logs and pull
out Ferni's lines. The avatar logs every 5 s:
`avatar fps=… scale=… drawable=…x… thermal=… lowPower=…`

```bash
log collect --device-udid <udid> --start "<start time>" --output ferni-device.logarchive
log show --archive ferni-device.logarchive --predicate 'subsystem == "com.sethdford.ferni"' --style compact > ferni-device.log
grep 'avatar fps=' ferni-device.log                 # frame rate, render scale, thermal state over time
grep -E 'category: (call|audio)' ferni-device.log   # call lifecycle and audio engine
```

The run passes when steps 1–28 and 30 do what the Pass column says, the
numbers in 37 hold, and there are no "Audio engine availability not set"
errors. Steps 9 and 29 are notes, not pass or fail. Steps 31–36 can be done on
another day. Anything else is a finding: file it with the step number and the
log lines.
