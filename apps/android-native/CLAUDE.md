# Android Native App

Native Android voice client for Ferni, built with Kotlin and Jetpack Compose.

## Purpose

Provides the native Android experience for voice conversations with Ferni's 6 AI personas. Uses LiveKit Android SDK for real-time WebRTC communication.

## Key Files

```
app/src/main/java/com/ferni/voice/
├── models/
│   ├── Persona.kt              # 6 personas with colors (from design-system/tokens/colors.json)
│   ├── VoiceState.kt           # Connection state machine
│   └── TranscriptMessage.kt    # Chat message model
├── services/
│   ├── LiveKitSession.kt       # LiveKit SDK integration
│   └── VoiceCallService.kt     # Foreground service for background audio
├── ui/
│   ├── theme/                  # Material3 theming (dark mode default)
│   ├── screens/                # Main screens (voice, onboarding)
│   ├── components/             # Avatar, transcript, controls
│   └── animations/             # 7-layer Pixar-quality avatar animations
└── util/
    └── HapticFeedback.kt       # Haptic utilities
```

## Build & Run

```bash
# Open in Android Studio
cd apps/android-native

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Build AAB for Play Store
./gradlew bundleRelease

# Run tests
./gradlew test
./gradlew connectedAndroidTest
```

## Requirements

- Android Studio Hedgehog (2023.1.1)+
- Kotlin 1.9.22
- Gradle 8.4
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)

## Backend Integration

Connects to same backend as iOS:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /token` | Get LiveKit room token |

Data channel messages for real-time coordination:
- `handoff_request` / `handoff_started` / `handoff_complete` - Persona switching
- `emotion_event` - Avatar emotion triggers

## Persona Colors (from design-system)

| Persona | Hex |
|---------|-----|
| Ferni | #4a6741 |
| Maya | #a67a6a |
| Alex | #5a6b8a |
| Jordan | #c4856a |
| Peter | #3a6b73 |
| Nayan | #9a7b5a |

## Platform Parity

Mirrors `apps/ios-native/`:

| iOS | Android |
|-----|---------|
| SwiftUI | Jetpack Compose |
| LiveKit Swift SDK | LiveKit Android SDK |
| Combine | Kotlin Flow |
| @Published | StateFlow |
