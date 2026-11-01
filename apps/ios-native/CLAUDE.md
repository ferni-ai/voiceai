# Ferni for iPhone and iPad

Native SwiftUI app, bundle `com.sethdford.ferni`, iOS 26+, Swift 6 language mode
with strict concurrency. Plan: `voiceai-evidence/mobile-2026-10-18/IOS-PLAN.md`.

## Layout

```
apps/ios-native/
├── App/                  thin SwiftUI shell: FerniApp (AppModel), HomeView, SettingsView,
│                         Info.plist (generated), entitlements, assets, privacy manifest
├── Packages/
│   ├── FerniKit/         configuration, the account (Firebase: anonymous first, then
│   │                     Sign in with Apple), the server API (Bearer ID token), team, plans
│   ├── FerniVoice/       a call: CallSession (token, join, wait ≤10 s for Ferni, one
│   │                     retry, captions, mute, rejoin), agent signals, expressions
│   └── FerniDesign/      color/type/spacing tokens from design-system/tokens, window avatar
├── project.yml           XcodeGen spec; Ferni.xcodeproj is generated AND committed
└── Ferni.storekit        StoreKit test configuration (plans are off: PaidPlans.isOffered)
```

Views live in the app; logic lives in packages and is tested there. State is
`@Observable` and `@MainActor`. No `ObservableObject`, no `DispatchQueue.main`.

## Build and test

```bash
cd apps/ios-native
xcodegen generate        # after changing project.yml or adding/removing App/ files
xcodebuild test -project Ferni.xcodeproj -scheme Ferni \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO
```

The scheme runs every package's tests. CI (`.github/workflows/build-apps.yml`,
"iOS build and test") runs the same on every PR touching `apps/ios-native/` and
on pushes to main.

XcodeGen rewrites `App/Info.plist` and `App/Ferni.entitlements` from
`project.yml`: put keys and entitlements in the spec, not the files.

## Archive

Every archive, local or CI, gets a unique build number, stamped on every
target alike (the app, FerniLive, the Watch app and its widgets all read
`CURRENT_PROJECT_VERSION`), and is checked before it ships:

```bash
xcodebuild archive -project Ferni.xcodeproj -scheme Ferni -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Ferni.xcarchive \
  CURRENT_PROJECT_VERSION="$(scripts/build-number.sh)"
scripts/check-archive.sh build/Ferni.xcarchive   # one version everywhere, stamped, English only, dSYMs
```

Sentry is linked as the `Sentry-Dynamic` product: same SDK and module, but
its xcframework ships dSYMs (the static `Sentry` product ships none), so
Sentry frames symbolicate. LiveKitWebRTC ships no dSYMs at all; Xcode's
"missing dSYM" warning for it on upload is expected.

`scripts/testflight.sh` (the TestFlight lane) does both. The project's own
`CURRENT_PROJECT_VERSION` is a placeholder for local runs and is refused in
an archive.

## Rules

- No "AI" in any UI string. Warm, short, human copy.
- Only the microphone permission (notifications come with push). No background
  mode but `audio`. No entitlement the app doesn't use.
- No developer switches in Settings. Version and build come from the bundle.
- Server calls go to the same JSON endpoints as the web (`FerniConfig.apiBaseURL`,
  `FERNI_API_BASE_URL` in project.yml, production `https://app.ferni.ai`).
