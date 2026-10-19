# iPhone device test: calls on LiveCommunicationKit and the Metal Ferni

One sitting on a paired iPhone (Seth's iPhone 16 Pro Max,
00008140-001631841190801C) with Seth talking, about 10 minutes. Covers critic C1
(the call's audio under LiveCommunicationKit) and the Metal avatar's frame rate
and heat. Repeat on an iPad when one is paired (the January rejection device
was an iPad Air).

## Before

1. Build and sign a Debug build for the device (Apple Development, team XT8W26YE9U):
   `xcodebuild build -project apps/ios-native/Ferni.xcodeproj -scheme Ferni -configuration Debug -destination id=<udid> -allowProvisioningUpdates`
2. Install and launch: `xcrun devicectl device install app --device <udid> <Ferni.app>`, then open Ferni.
3. Note the start time (for the log window).

## Steps (tick each, note what you saw)

| # | Do | Expect |
|---|----|--------|
| 1 | Tap Talk, say a sentence | Ferni hears and answers; the call is on the Lock Screen and in the Dynamic Island |
| 2 | Let Ferni talk for 30 s | The body moves with Ferni's voice (glow, lower lids, nods on syllables); no stutter |
| 3 | Mid-call, "Hey Siri, what time is it?", then talk again | The call comes back on its own, or shows On hold with Resume; never "listening" over a dead mic |
| 4 | Have someone call the iPhone; decline; talk again | Same as 3 |
| 5 | Lock the phone mid-call and talk | Audio continues both ways |
| 6 | Ask Ferni to bring in Maya (if unlocked) | The family table: Maya peeks in, they greet, swap; Ferni waits in the corner |
| 7 | End the call from the Lock Screen | The call ends; Ferni's goodbye plays on the phone |
| 8 | Stay on Home for 2 minutes, then call again for 3 minutes | No warmth or slowdown; fps stays near 30 at rest and up to 120 while Ferni speaks |

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

Pass: steps 1–7 behave as expected; fps at least 55 while speaking on a
ProMotion phone (at least 28 at rest); thermal never above "fair" over the
5 minutes; no "Audio engine availability not set" errors. Anything else is a
finding to file with the log lines.
