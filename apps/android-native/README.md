# Ferni Voice - Android Native

Native Android app for Ferni Voice AI, built with Kotlin and Jetpack Compose.

## Features

- Voice conversations with 6 AI personas (Ferni, Maya, Alex, Jordan, Peter, Nayan)
- Real-time transcription
- Persona handoff with data channel coordination
- 7-layer Pixar-quality avatar animations
- Haptic feedback
- Dark theme by default
- Onboarding flow with microphone permission

## Requirements

- Android Studio Hedgehog (2023.1.1) or later
- Kotlin 1.9.22
- Gradle 8.4
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)

## Setup

1. **Open in Android Studio**
   ```bash
   cd apps/android-native
   # Open in Android Studio
   ```

2. **Sync Gradle**
   - Click "Sync Project with Gradle Files" in Android Studio

3. **Run the app**
   - Connect an Android device or start an emulator
   - Click Run (or press Shift+F10)

## Architecture

```
app/src/main/java/com/ferni/voice/
├── models/
│   ├── Persona.kt           # 6 personas with colors
│   ├── VoiceState.kt        # State machine
│   └── TranscriptMessage.kt # Chat message model
├── services/
│   ├── LiveKitSession.kt    # LiveKit integration
│   └── VoiceCallService.kt  # Foreground service
├── ui/
│   ├── theme/               # Material3 theming
│   ├── screens/             # Main screens
│   ├── components/          # Reusable UI components
│   └── animations/          # Animation constants
└── util/
    └── HapticFeedback.kt    # Haptic utilities
```

## Key Dependencies

- **LiveKit Android SDK** - WebRTC voice communication
- **Jetpack Compose** - Modern UI toolkit
- **Material3** - Design system
- **OkHttp** - HTTP client
- **Kotlin Serialization** - JSON parsing
- **DataStore** - Preferences storage

## Backend Connection

The app connects to the same backend as iOS:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /token` | Get LiveKit token |

Data channel messages follow the same JSON format:
- `handoff_request` - Request persona switch
- `handoff_started` - Server starting handoff
- `handoff_complete` - Handoff finished
- `emotion_event` - Avatar emotion trigger

## Persona Colors

From `design-system/tokens/colors.json`:

| Persona | Color | Hex |
|---------|-------|-----|
| Ferni | Sage Green | #4a6741 |
| Maya | Rose/Terracotta | #a67a6a |
| Alex | Slate Blue | #5a6b8a |
| Jordan | Coral | #c4856a |
| Peter | Ocean Teal | #3a6b73 |
| Nayan | Warm Brown | #9a7b5a |

## Building for Release

1. **Generate signing key** (if not exists)
   ```bash
   keytool -genkey -v -keystore ferni-release.keystore -alias ferni -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Configure signing in `app/build.gradle.kts`**

3. **Build release APK**
   ```bash
   ./gradlew assembleRelease
   ```

4. **Build release AAB** (for Play Store)
   ```bash
   ./gradlew bundleRelease
   ```

## Testing

```bash
# Run unit tests
./gradlew test

# Run instrumentation tests
./gradlew connectedAndroidTest
```

## Matching iOS Native App

This Android app mirrors the iOS native app at `apps/ios-native/`:

| iOS | Android |
|-----|---------|
| SwiftUI | Jetpack Compose |
| LiveKit Swift SDK | LiveKit Android SDK |
| AVAudioSession | Android AudioManager |
| UIImpactFeedbackGenerator | VibrationEffect |
| @Published | StateFlow |
| Combine | Kotlin Flow |
