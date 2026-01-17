# Ferni Voice Native Apps

Native desktop and mobile applications for Ferni Voice AI - your AI life coach.

## Supported Platforms

| Platform | Technology | Status |
|----------|------------|--------|
| macOS | Electron | Ready |
| Windows | Electron | Ready |
| Linux | Electron | Ready |
| iOS | Native Swift/SwiftUI | Ready |
| Android | Native Kotlin/Compose | Ready |

## Structure

```
apps/
├── electron/        # Desktop app (macOS, Windows, Linux)
├── ios-native/      # Native iOS app (Swift/SwiftUI)
├── android-native/  # Native Android app (Kotlin/Compose)
├── web/             # Web frontend (shared with Electron)
├── macos-menubar/   # macOS menu bar app
└── README.md
```

## Quick Start

### Desktop (Electron) - macOS, Windows, Linux

```bash
cd apps/electron
npm install
npm start           # Development (connects to Vite dev server)
npm run build       # Build for current platform
npm run build:mac   # macOS DMG + ZIP
npm run build:win   # Windows NSIS + Portable
npm run build:linux # Linux AppImage + DEB + RPM
```

### iOS (Native SwiftUI)

```bash
cd apps/ios-native
open FerniVoice.xcodeproj
# Select your device/simulator in Xcode
# Press Cmd+R to run
```

**Requirements:**
- Xcode 15+
- iOS 16+ deployment target
- LiveKit Swift SDK (via Swift Package Manager)

### Android (Native Kotlin/Compose)

```bash
cd apps/android-native
./gradlew assembleDebug    # Build debug APK
./gradlew installDebug     # Install on connected device/emulator
```

Or open in Android Studio:
1. Open `apps/android-native` folder
2. Wait for Gradle sync
3. Run on emulator or device

**Requirements:**
- Android Studio Hedgehog (2023.1.1)+
- Kotlin 1.9.22
- Min SDK 24 (Android 7.0)
- Target SDK 34 (Android 14)

## Platform-Specific Features

| Feature | Electron | iOS Native | Android Native |
|---------|----------|------------|----------------|
| WebRTC/LiveKit | Full | Native SDK | Native SDK |
| Haptics | N/A | Native UIKit | Native Vibration |
| System Tray | Yes | N/A | N/A |
| Background Audio | Yes | AVAudioSession | Foreground Service |
| Auto-update | electron-updater | App Store | Play Store |
| Code Signing | Notarization | Apple | Keystore |
| Error Tracking | Sentry | Sentry | Sentry |
| Portrait Lock | N/A | Yes | Yes |
| 7-Layer Avatar | Canvas | SwiftUI | Jetpack Compose |

## Native App Architecture

### iOS (apps/ios-native/)

```
FerniVoice/
├── Models/
│   ├── Persona.swift           # 6 personas with colors
│   ├── VoiceState.swift        # State machine
│   └── TranscriptMessage.swift # Chat message model
├── Services/
│   ├── LiveKitSession.swift    # LiveKit integration
│   └── VoiceCallService.swift  # Audio session management
├── Views/
│   ├── ContentView.swift       # Main view
│   ├── VoiceCallView.swift     # Call interface
│   └── Components/             # Reusable UI
└── Utils/
    └── HapticManager.swift     # Haptic feedback
```

### Android (apps/android-native/)

```
app/src/main/java/com/ferni/voice/
├── models/
│   ├── Persona.kt              # 6 personas with colors
│   ├── VoiceState.kt           # State machine
│   └── TranscriptMessage.kt    # Chat message model
├── services/
│   ├── LiveKitSession.kt       # LiveKit integration
│   └── VoiceCallService.kt     # Foreground service
├── ui/
│   ├── theme/                  # Material3 theming
│   ├── screens/                # Main screens
│   └── components/             # Reusable UI
└── util/
    └── HapticFeedback.kt       # Haptic utilities
```

## Backend Connection

Both native apps connect to the same backend:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /token` | Get LiveKit token |

Data channel messages (JSON):
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

## Build Pipeline

For CI/CD, the GitHub Actions workflow builds all platforms:

```bash
# Triggered on version tags (v*) or manual dispatch
# See .github/workflows/build-apps.yml
```

## Distribution

### macOS (Electron)

1. Code sign with Developer ID: `export CSC_LINK=path/to/cert.p12`
2. Notarize with Apple: set `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`
3. Build: `npm run build:mac`
4. Output: `dist/Voice AI-*.dmg`

### Windows (Electron)

1. Get code signing certificate (EV recommended for SmartScreen)
2. Set environment: `$env:CSC_LINK = "path\to\cert.pfx"`
3. Build: `npm run build:win`
4. Output: `dist/Voice AI Setup-*.exe`

### Linux (Electron)

1. Build: `npm run build:linux`
2. Output: `dist/Voice AI-*.AppImage`, `*.deb`, `*.rpm`

### iOS (Native)

1. Open in Xcode: `open apps/ios-native/FerniVoice.xcodeproj`
2. Select your signing team
3. Archive: Product → Archive
4. Distribute to App Store or TestFlight

### Android (Native)

1. Generate signing key:
   ```bash
   keytool -genkey -v -keystore ferni-release.keystore -alias ferni -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Build release: `./gradlew bundleRelease`
3. Upload to Google Play Console
