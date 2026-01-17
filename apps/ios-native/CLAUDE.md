# iOS Native App

Native iOS voice client for Ferni with "Better Than Human" emotional intelligence.

## Purpose

Full-featured iOS app with LiveKit voice sessions, native integrations (HealthKit, Calendar, Contacts, HomeKit, Siri, MusicKit), Apple Watch app, widgets, CarPlay, and Share Extension.

## Key Files

```
apps/ios-native/
├── Sources/
│   ├── App/                    # App entry, main views
│   ├── Design/                 # FerniColors, design system
│   ├── Services/
│   │   ├── AuthService.swift
│   │   ├── BetterThanHumanIntegration.swift
│   │   ├── CalendarService.swift
│   │   ├── ContactsService.swift
│   │   ├── HealthKitService.swift
│   │   ├── HomeKitService.swift
│   │   ├── IOSLiveKitSession.swift
│   │   ├── LocationService.swift
│   │   ├── MusicKitService.swift
│   │   ├── SharedItemsService.swift
│   │   ├── SiriShortcutsService.swift
│   │   ├── SubscriptionService.swift     # StoreKit 2
│   │   └── WatchConnectivityService.swift
│   └── Views/
├── FerniWidgets/               # Home screen widgets
├── FerniWatch/                 # Apple Watch app
├── FerniWatchWidgets/          # Watch complications
├── FerniCarPlay/               # CarPlay integration
├── FerniShareExtension/        # Share extension
└── project.yml                 # XcodeGen project spec
```

## Build & Run

```bash
cd apps/ios-native

# Generate Xcode project (requires XcodeGen)
xcodegen generate
open FerniVoice.xcodeproj

# Or use Xcode directly if project exists
```

## Requirements

- Xcode 15+
- XcodeGen (`brew install xcodegen`)
- iOS 16+ device/simulator
- watchOS 9+ for Watch features

## App Group

All extensions share: `group.com.ferni.shared`

## Subscription Tiers (StoreKit 2)

| Tier | Price | Personas | Conversations |
|------|-------|----------|---------------|
| Free | $0 | Ferni only | 5/month |
| Friend | $9.99/mo | All except Nayan | Unlimited |
| Partner | $19.99/mo | All | Unlimited |

## URL Schemes

| URL | Action |
|-----|--------|
| `ferni://talk` | Start voice |
| `ferni://checkin` | Mood check-in |
| `ferni://vent` | Vent session |
| `ferni://music` | Mood music |
| `ferni://share?id={id}` | Open shared item |

## Watch Connectivity

**From Watch to iPhone:**
- `requestVoiceSession()` - Start conversation
- `sendMoodCheckIn(mood:)` - Log mood
- `requestQuickVent()` - Vent session
- `requestCalmingMusic()` - Play calming music

**From iPhone to Watch:**
- `sendVoiceStateUpdate()` - Push session state
- `sendPersonaUpdate()` - Push persona changes
- `updateComplication()` - Update watch face

## Testing

```bash
# CarPlay: Xcode > I/O > External Displays > CarPlay
# Watch: Pair watch simulator with iPhone simulator
# Share Extension: Build FerniVoice, test from Safari
```

## Deployment

1. Archive FerniVoice scheme (Product > Archive)
2. Upload to App Store Connect
3. Submit for TestFlight / App Review

## Related Docs

- `docs/audits/IOS-BETTER-THAN-HUMAN-AUDIT.md`
- `design-system/docs/brand/BETTER-THAN-HUMAN.md`
- `apps/shared/` - Shared Swift code
