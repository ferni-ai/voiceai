# FerniVoice - iOS Native App

> Ferni's native iOS experience with "Better Than Human" emotional intelligence.

## 🎯 Features

### Core Voice Experience
- **LiveKit Voice Sessions** - Real-time voice conversations with Ferni
- **Better Than Human Engine** - Micro-expressions, active listening, breath sync
- **Late Night Mode** - Automatic warm theming after 10pm
- **Spatial Audio** - Immersive 3D voice positioning

### Native iOS Integrations

| Integration | What It Does |
|-------------|--------------|
| **HealthKit** | Sleep, HRV, activity tracking for wellness insights |
| **Calendar** | Upcoming events, schedule awareness |
| **Contacts** | Relationship tracking, remember important people |
| **HomeKit** | Mood-based ambient lighting control |
| **Location** | Context-aware support (home, work, commuting) |
| **Siri Shortcuts** | "Hey Siri, talk to Ferni" |
| **MusicKit** | Mood-based music playback |
| **WatchConnectivity** | Two-way iPhone ↔ Watch communication |
| **StoreKit 2** | Native subscription management |

### Extensions

| Extension | Description |
|-----------|-------------|
| **FerniWidgets** | Home screen widgets (mood check-in, daily insights, quick actions) |
| **FerniWatch** | Apple Watch app with mood tracking and quick check-ins |
| **FerniWatchWidgets** | Watch complications for always-on presence |
| **FerniShareExtension** | Share articles, quotes, images to Ferni from any app |
| **CarPlay** | Voice-only driving companion |

## ⌚ WatchConnectivity

Real two-way communication between iPhone and Apple Watch:

**From Watch → iPhone:**
- `requestVoiceSession()` - Start a conversation
- `sendMoodCheckIn(mood:)` - Log mood (syncs to backend)
- `requestQuickVent()` - Start vent session
- `requestCalmingMusic()` - Play calming music

**From iPhone → Watch:**
- `sendVoiceStateUpdate()` - Push session state (listening/speaking)
- `sendPersonaUpdate()` - Push persona changes
- `sendStreakUpdate()` - Push streak data
- `updateComplication()` - Update watch face

**Watch UI Features:**
- Connection status indicator
- Real-time voice state ring around avatar
- Streak badge
- Quick actions: Talk, Check In, Vent, Calm

## 💳 Subscription Management (StoreKit 2)

Native subscription handling with iOS StoreKit 2:

```swift
// Check tier
let tier = SubscriptionService.shared.currentTier

// Check feature access
let canAccessMaya = SubscriptionService.shared.isPersonaAvailable("maya")

// Purchase
let result = await SubscriptionService.shared.purchase(tier: .friend)

// Restore
await SubscriptionService.shared.restorePurchases()

// Manage subscription
await SubscriptionService.shared.manageSubscription()
```

**Subscription Tiers:**

| Tier | Price | Personas | Conversations |
|------|-------|----------|---------------|
| Free | $0 | Ferni only | 5/month |
| Friend | $9.99/mo | All except Nayan | Unlimited |
| Partner | $19.99/mo | All personas | Unlimited |

**Product IDs (configure in App Store Connect):**
- `com.ferni.subscription.friend.monthly`
- `com.ferni.subscription.friend.yearly`
- `com.ferni.subscription.partner.monthly`
- `com.ferni.subscription.partner.yearly`

## 🚗 CarPlay Integration

Ferni becomes your driving companion:

- **Voice-only interface** - No visual distractions
- **Quick actions**: Talk, Check-in, Calming moment, Music
- **Commute support** - "How are you feeling on your drive?"
- **Traffic stress relief** - Breathing exercises and calming music

## 📤 Share Extension

Share content from any app to Ferni:

1. Select text, URL, or image in any app
2. Tap Share → "Share with Ferni"
3. Add optional note and category
4. Save for later or "Talk About This Now"

**Categories:**
- 🌟 Inspiration - quotes and ideas that resonate
- 💬 Discuss - things you want to talk about
- 📝 Remember - memories to preserve
- 📓 Journal - quick thoughts

**Ferni references shared items in conversations:**
> "I saw you saved an article earlier - what caught your attention?"

## 🏗️ Project Structure

```
FerniVoice/
├── Sources/
│   ├── App/                    # App entry point, main views
│   ├── Design/                 # FerniColors, design system
│   ├── Services/               # Core services
│   │   ├── AuthService.swift
│   │   ├── BetterThanHumanIntegration.swift
│   │   ├── CalendarService.swift
│   │   ├── ContactsService.swift
│   │   ├── HealthKitService.swift
│   │   ├── HomeKitService.swift
│   │   ├── IOSLiveKitSession.swift
│   │   ├── LocationService.swift
│   │   ├── MusicKitService.swift
│   │   ├── ProactiveNotificationsService.swift
│   │   ├── SharedItemsService.swift    # NEW: Share Extension handler
│   │   └── SiriShortcutsService.swift
│   └── Views/                  # SwiftUI views
├── FerniVoice/                 # App resources, assets
├── FerniWidgets/               # Home screen widgets
├── FerniWatch/                 # Apple Watch app
├── FerniWatchWidgets/          # Watch complications
├── FerniCarPlay/               # CarPlay integration (NEW)
└── FerniShareExtension/        # Share extension (NEW)
```

## 🛠️ Setup

### Prerequisites
- Xcode 15+
- XcodeGen (`brew install xcodegen`)
- iOS 16+ device/simulator
- watchOS 9+ for Watch features

### Generate Xcode Project

```bash
cd apps/ios-native
xcodegen generate
open FerniVoice.xcodeproj
```

### Configure Signing

1. Open project in Xcode
2. Select each target → Signing & Capabilities
3. Choose your development team
4. Update bundle IDs if needed

### Required Capabilities

The app requires these entitlements (already configured in `.entitlements` files):

| Capability | Purpose |
|------------|---------|
| App Groups | Share data between app and extensions |
| HealthKit | Read health/fitness data |
| HomeKit | Smart home control |
| Siri | Voice shortcuts |
| CarPlay Audio | Driving companion |
| Push Notifications | Proactive outreach |

### App Group

All extensions use the App Group: `group.com.ferni.shared`

Register this in Apple Developer Portal if you haven't already.

## 🧪 Testing

### CarPlay Simulator

1. In Xcode, go to **I/O > External Displays > CarPlay**
2. Run the app on a simulator
3. CarPlay interface appears in separate window

### Share Extension Testing

1. Build and run FerniVoice
2. Open Safari and navigate to any article
3. Tap Share → "Share with Ferni"
4. Test save and "Talk About This Now" flows

### Watch App Testing

1. Pair watch simulator with iPhone simulator
2. Run FerniWatch scheme
3. Test mood check-in and quick actions

## 📱 Schemes

| Scheme | Description |
|--------|-------------|
| FerniVoice | Main iOS app + all extensions |
| FerniWidgets | Widget extension only |
| FerniWatch | Watch app + complications |
| FerniShareExtension | Share extension only |

## 🔗 URL Schemes

The app handles these deep links:

| URL | Action |
|-----|--------|
| `ferni://talk` | Start voice conversation |
| `ferni://checkin` | Open mood check-in |
| `ferni://vent` | Start venting session |
| `ferni://music` | Play mood-based music |
| `ferni://share?id={id}` | Open shared item |
| `ferni://insight` | Show daily insight |

## 🎨 Design System

Colors are defined in `FerniColors.swift`:

| Color | Usage |
|-------|-------|
| `ferniPrimary` | Main brand green |
| `ferniAccent` | Darker accent green |
| `bgDark` | Dark background |
| `textPrimary` | Primary text |

## 📝 Adding New Features

### Adding a New Service

1. Create file in `Sources/Services/`
2. Use singleton pattern: `static let shared`
3. Make it `ObservableObject` for SwiftUI
4. Add to `BetterThanHumanIntegration` if needed

### Adding a Widget

1. Add widget struct to `FerniWidgets/`
2. Register in `FerniWidgetsBundle`
3. Create corresponding `TimelineProvider`
4. Add deep link URL handler

### CarPlay Enhancements

The CarPlay interface uses `CPTemplateApplicationSceneDelegate`.

Available templates:
- `CPVoiceControlTemplate` - For voice-first interaction
- `CPGridTemplate` - For quick action buttons
- `CPListTemplate` - For status display

## 🚀 Deployment

The iOS app is deployed via App Store Connect:

1. Archive FerniVoice scheme (Product → Archive)
2. Upload to App Store Connect
3. Submit for TestFlight / App Review

## 📚 Related Docs

- `docs/audits/IOS-BETTER-THAN-HUMAN-AUDIT.md` - Feature audit
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - EQ guidelines
- `apps/shared/` - Shared code between iOS/macOS
