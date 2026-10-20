# Merge plan: `ios/earcons` into `main`

Written 2026-10-20 at `78b4790c6`, when `ios/earcons` was 134 commits ahead of
`origin/main` (`e1ee0a7b6`) and 201 behind it. Nothing here has been pushed or
opened: the merge queue is frozen until the drain (#2206), and the lead opens
these PRs in order afterwards.

## The numbers

Every size here is measured, not estimated. Each figure comes from
`git diff --numstat -M -C` over the PR's commit range, counted by the
`excluded()` function imported from `~/.claude/hooks/pdlc/pr_size_gate.py`. So
tests (`*Tests/`), `*.pbxproj` and `Package.resolved` are left out exactly as
the gate leaves them out. The gate re-measures each PR at `gh pr create`.

| | Lines |
|---|---|
| Whole branch, as the gate counts it | 35,976 |
| of which: deleting the old iPhone app (pure deletions) | 14,091 |
| of which: `App/Localizable.xcstrings` (133 keys in 10 locales) | 8,518 |
| of which: the new app's code, config and docs | about 13,400 |

- Commits 1 and 2 (`26b07455b`, `69688a3fb`) are already on `main`, squashed into
  #2013. Their files match `main` exactly, so they get no PR.
- That leaves 132 commits, landed as **60 PRs**: 59 cut from the branch and 1
  new (the waitlist port). One optional PR for the string catalog follows.

## How each PR is cut

The PRs form a chain. Each one is a contiguous range of branch commits, cut
from `origin/main` after the previous PR has merged:

```bash
git switch -c ios/pr-NN origin/main
git cherry-pick --no-commit <first>^..<last>
# The string catalog stays out of every PR (see "The string catalog" below):
git rm -q --cached --ignore-unmatch apps/ios-native/App/Localizable.xcstrings apps/ios-native/scripts/build-string-catalog.py
rm -f apps/ios-native/App/Localizable.xcstrings apps/ios-native/scripts/build-string-catalog.py
(cd apps/ios-native && xcodegen generate)   # so the project never names the catalog
# build, run the unit, app and UI suites, then commit one squashed PR commit
```

The check after each merge: `main` must now equal the range's last commit for
the iPhone app.

```bash
git diff <last> origin/main -- apps/ios-native docs/ios \
  ':!apps/ios-native/App/Localizable.xcstrings' ':!apps/ios-native/scripts/build-string-catalog.py'
```

This must be empty, apart from PR 08 (the waitlist port, which isn't on the
branch) and conflict resolutions in files `main` also changed (listed below).
After PR 60 merges, the same diff against `78b4790c6` is empty except for the
waitlist port.

Why a chain of cherry-picks rather than copying files from the branch: `main`
changed `.github/workflows/build-apps.yml` (#1998, #2021, #2055, #2203),
`.gitignore` (#2121) and `apps/cli/src/commands/build/build.ts` (#2021) after
the branch point. Copying the branch's files would quietly undo those changes.

## The PRs, in merge order

Every PR depends on the one before it: the chain is linear, because each range
is measured on, and applies to, the previous range's tip. Reviews can run in
parallel; merges can't. The "Depends on" column lists only dependencies
outside the chain.

| PR | Commits | Feature | Lines | Test lines | Override, flag, depends on |
|---|---|---|---|---|---|
| 01 | `1cdaf4710` | Swift 6 app shell on local packages (CI and CLI switch to `Ferni.xcodeproj`) | 1,401 | 626 | **Override, approved 2026-10-19** (pr-overrides.md). Conflicts: `build-apps.yml`, `GoogleService-Info.plist` (take main's #2123 content; it equals the branch's) |
| 02 | `5066c222f` | Remove the old iPhone app | 12,886 | 4,864 | **Override, approved**. Also delete #1988's old-app files that `main` gained (WaitlistStatus, WaitingView, their test, pbxproj entries). Tell #1988's author first |
| 03 | `ff5cf559a`..`994ccc996` | iOS 26 and a silent anonymous account with an API client | 369 | 331 | |
| 04 | `b043512a1` | Sign in with Apple, linked to the same account | 205 | 103 | |
| 05 | `b8c7dc35a` | The seams a call is built on | 153 | 38 | |
| 06 | `2d1dc9169` | A call session that waits for Ferni, retries once, never sits silent | 272 | 346 | |
| 07 | `5eecc50bd`..`2ec869697` | A LiveKit call screen with captions; only the agent steers | 399 | 78 | |
| 08 | *new* | Port #1988's waitlist screen to the new app (CallToken + Home) | est. 150-250 | | **New work.** It's parity with main, which PR 02 removes. Must land before any TestFlight build |
| 09 | `617027a2c`..`f810c7292` | Captions by transcribed track; one avatar state machine | 363 | 212 | |
| 10 | `4c460558e` | Ferni's mouth follows the real voice level | 135 | 59 | |
| 11 | `5c817d152` | One canvas avatar on one clock (replaces #2013's window avatar) | 1,124 | 156 | **Override, approved** (-678 is the replaced file) |
| 12 | `80f786288` | Five call haptics, and a CI guard on timers | 105 | 55 | Conflicts: `build-apps.yml` |
| 13 | `d72dfd7db`..`775bf16cf` | Consent before anything leaves the phone | 225 | 98 | |
| 14 | `d268b7f30`..`2ada14359` | Ferni's room; Home with the team in the corner | 295 | 120 | |
| 15 | `59865de19` | The call happens in the same room, with tap to interrupt | 473 | 25 | **Override, approved.** The server's `TAP_INTERRUPT` decision (H4) is still open |
| 16 | `e5d8ceb8a` | Calls belong to the system (LiveCommunicationKit) | 190 | 119 | |
| 17 | `fd4c2bbda`..`5242ae67d` | What Ferni remembers; nothing leaks between people on one phone | 270 | 200 | |
| 18 | `56a1724f7`..`68fa23596` | Delete your account, get help, report something Ferni said | 262 | 80 | |
| 19 | `0ef917818`..`6d3856ff9` | TestFlight lane, by hand from main, behind approval | 97 | 0 | **This lane is the release flag:** don't approve a run before PR 60 and PR 08 |
| 20 | `5bfb975b3`..`6f2a938f2` | The call on the lock screen; Siri, Shortcuts, Action button | 374 | 301 | |
| 21 | `59324d09a` | Notes from Ferni (push), asked after the first good call | 189 | 58 | **Flag gap:** `FERNI_PUSH` gates this only from PR 25. Acceptable only while no lane run is approved; otherwise pull `9e262e15d`'s gate into this PR |
| 22 | `84db972d4`..`b129f1832` | Push tokens unbound reliably (security review fixes) | 358 | 337 | |
| 23 | `e4794a90e`..`0358156a7` | Call sounds, Plus Jakarta Sans, recovery after interruptions | 341 | 166 | |
| 24 | `2b1cf87cb`..`a2c8e1ece` | System call audio, start/end as chosen, cold launch, teammate handoff | 230 | 367 | |
| 25 | `9e262e15d`..`01b9cda8a` | `FERNI_PUSH` build flag (off); crash reporting off unless a build has a DSN | 140 | 58 | **Flags:** `FERNI_PUSH` (compile-time, off until the server's device route #1991); Sentry DSN |
| 26 | `cd590d892`..`f0698401b` | The new avatar's face, springs and keyed moments; Sentry linked | 359 | 161 | |
| 27 | `06db0a1f9`, AliveShader.swift only | Ferni's body in Metal: the shader | 282 | | Split of one commit; the shader compiles alone |
| 28 | `06db0a1f9`, AliveRenderer.swift | Ferni's body in Metal: the renderer | 129 | 125 | |
| 29 | `ea440be3e` | CI: retry only a host app that never launched; log overrides | 82 | 0 | Conflicts: `build-apps.yml` |
| 30 | `189099e05` | Ferni's body moves on springs, keys and the real voice | 427 | 125 | **New override needed:** one new file (AliveRig.swift, 427 lines) can't be split. Suggested reason: `one new file, AliveRig.swift; 27 over` |
| 31 | `d9a1b85bb`..`f9d471b61` | The new Ferni on Home and in the call | 241 | 32 | |
| 32 | `36aa35f0b`..`a90ad1dd6` | Teammate portraits; frame-rate log; full-size forget button (removes the canvas avatar) | 337 | 230 | |
| 33 | `7f3b70299`..`22bec01bf` | Layered app icon; iPad sidebar and keyboard shortcuts | 317 | 8 | |
| 34 | `4a7194085`..`f75e34bda` | Localized call sites (catalog stripped); minimum-build check; review packet | 250 | 68 | See "The string catalog" |
| 35 | `b56728392` | "Not quite" fixes what Ferni kept from a call | 220 | 95 | |
| 36 | `60b2acc15` | Optional Face ID lock on memories | 134 | 72 | |
| 37 | `01d21529c`..`0c1d2e2b3` | Home screen and StandBy widget; ask your notes | 257 | 114 | |
| 38 | `6d2c13c45` | Apple Watch remote, phone side | 157 | 62 | |
| 39 | `ddef11035` | Apple Watch app, Control and Smart Stack card | 313 | 261 | |
| 40 | `64a4c7578`..`5117f6597` | CarPlay, built and not registered; leaving ends the call | 189 | 79 | **Flag:** CarPlay stays unregistered until Apple grants `carplay-voice-based-conversation` |
| 41 | `f7d3da6ae`..`e9e48bab9` | Fixes: Apple account mismatch, VoiceOver, one end haptic, check-in ask | 131 | 126 | |
| 42 | `9127d948e`..`541aead21` | Privacy answers; audio background mode only; first-visit Home | 400 | 31 | At the cap. If the gate says 401 or more, cut it as `74-75` (315) and `76-79` (181), with `80` alone |
| 43 | `2b1a34400`..`43953065f` | Dark-mode call buttons; pause under sheets; one pinned Xcode; whole Talk button | 393 | 345 | Conflicts: `build-apps.yml`, `ios-testflight.yml` |
| 44 | `1a8d0bf9e`..`e13e0992c` | Device-run records; accessibility audit and screenshot lanes; iPad findings | 264 | 114 | Conflicts: `build-apps.yml` |
| 45 | `801900b8d`..`3b41c5c26` | Ferni can be touched (tears, firefly, sparkles); one first minute | 365 | 333 | |
| 46 | `0dbf73213`..`23ab2ba35` | Ferni arrives when he joins; the next day starts fresh | 224 | 203 | |
| 47 | `0563959c3`..`f35914bf4` | Lock-screen goodbye and mute; `GET /api/home` read as served | 220 | 211 | |
| 48 | `4182c14b2`..`9bbcbaaa3` | Ferni's note on Home; screen scale; 1.0 in English only; health link | 201 | 254 | |
| 49 | `185b8e7e9`..`0b72cf87b` | Next step to calendar or tasks; teammates in Spotlight and Shortcuts | 268 | 177 | |
| 50 | `6c365f716`..`8ece8e6c3` | AirPods pass; a unique build number; critic L1-L4 | 280 | 139 | Conflicts: `build-apps.yml` |
| 51 | `bb10bd899`..`f83f9c215` | Critic L6/L7; Sentry dSYMs; Google Sign-In package | 103 | 119 | |
| 52 | `034bce7b1`, `Packages/` only | Sign in to the account you already have: FerniKit half | 310 | with its half | If FerniKit's API change doesn't build alone, merge 52 and 53 under an override (`p0 sign-in, one feature: +310 FerniKit, +273 app`) |
| 53 | `034bce7b1`, the rest | Sign in to the account you already have: app half | 273 | with its half | **Depends on:** the server's `IDENTITY_MERGE_ANON` route live in prod before any external TestFlight |
| 54 | `ce51fe22e`..`90b244273` | Store frames; Home in every light; sign-in and calling fixes; iPad Settings page | 393 | 353 | |
| 55 | `bce0121f6`..`fe0c39522` | Z, sweat, ?, !; Firebase after launch; sign-in errors | 174 | 135 | |
| 56 | `7000c22c2`..`5aaadc1be` | Micro-expressions, four-tap spin, double take | 219 | 309 | |
| 57 | `333f2993d`..`47c19973b` | Finger held near, convergence, firefly sneeze | 238 | 214 | |
| 58 | `0f9531759`..`5bffb4f74` | Design-system sequences; every avatar input reaches the rig | 339 | 279 | |
| 59 | `fcfce181e`..`8fee08270` | Two quiet sounds at rest; ready for HomeView and shared screens | 220 | 194 | |
| 60 | `70676596d`..`78b4790c6` | iPad audit fixes: sidebar, touch margin, evening line, consent | 242 | 99 | |
| (61) | catalog | `Localizable.xcstrings` + `build-string-catalog.py` | 8,617 | | **Optional; recommend not landing yet** |

## Overrides

- **Already approved** (`docs/ios/pr-overrides.md`, 2026-10-19): PRs 01, 02,
  11 and 15. Use the reasons there verbatim.
- **New, needing the lead:**
  - PR 30: 427 lines, one new file, 27 over the cap.
  - PRs 52 and 53, only if the split doesn't build.
  - The catalog, if it lands at all.
- **Split instead of overriding:** commit `06db0a1f9` (411 lines) becomes PRs
  27 and 28.

Two optional changes to the gate (the lead's call) would remove most of these.
Today it counts both of these the same as hand-written code:
- Whole-file deletions: it already discounts moves.
- `*.xcscheme` files: XcodeGen writes them from `project.yml`, as it writes
  `*.pbxproj`.

## The string catalog

Commit 95 (`8ed7c4214`) took `Localizable.xcstrings` out of the app for 1.0:
about 78% of it was English placeholders, so a German phone got an English app
while the App Store listed German. `LocalizationTests` now asserts English only.

So the catalog stays out of every PR above, and PR 34 carries only commit 59's
call-site changes.

PR 34 must also take 1.0's English-only state from commit 95, not commit 59's:
- `AppTests/LocalizationTests.swift`
- `CFBundleLocalizations: [en]` in `project.yml` and `App/Info.plist`

Commit 59's version of `LocalizationTests` asserts the German strings
("Einstellungen"), which fail without the catalog. When PR 48 reaches commit
95, those hunks are already on `main`; drop them there.

Recommendation: keep the catalog on the branch until real translations exist,
then land it as one PR under an override (`generated by
build-string-catalog.py; 133 keys in 10 locales`).

## Flags and release gates

Nothing on this list reaches a person until the TestFlight lane (PR 19) is run
by hand and approved. That approval is the release gate for the whole chain.

| What | Kind | Off until |
|---|---|---|
| TestFlight lane | `workflow_dispatch` plus environment approval | PR 60 and the waitlist port (PR 08) are merged |
| Notes from Ferni (push) | `FERNI_PUSH` compile flag, off | the server's device route (#1991); ungated between PRs 21 and 25 (see PR 21) |
| Crash reporting | on only if the build has a DSN | a DSN is configured |
| CarPlay | scene not registered | Apple grants the entitlement |
| Sign in to an existing account | server `IDENTITY_MERGE_ANON` | the route is live in prod (before external TestFlight) |
| Tap to interrupt | server `TAP_INTERRUPT` (H4) | decided: on in prod, or the gesture removed |

## Known conflicts with `main`

- **`.github/workflows/build-apps.yml`** (#1998, #2021, #2055, #2203)
  - Affects PRs 01, 12, 29, 43, 44 and 50.
  - Keep main's merge-queue (#2203) and cancellation (#2055) settings, and
    swap only the iOS job's project and scheme.
- **#1988 waitlist** added files to the old app.
  - PR 02 deletes them, and they get modify/delete conflicts.
  - PR 08 brings the feature back in the new app: `grep -ri waitlist` over
    `App/` and `Packages/` finds nothing today.
- **#2123 Firebase config**
  - The branch moves `FerniVoice/GoogleService-Info.plist` to `App/`.
  - Main's content and the branch's are identical (0-line diff), so take
    either.
- **#2121** stopped tracking `.xcuserstate`. PR 02 deletes it anyway.
- **#2013** is commits 1 and 2. Skip them: they're already on main.
