# Voice AI Native Apps

Native desktop and mobile applications for Voice AI - your AI life coach.

## Supported Platforms

| Platform | Technology | Status |
|----------|------------|--------|
| 🍎 macOS | Electron | ✅ Ready |
| 🪟 Windows | Electron | ✅ Ready |
| 🐧 Linux | Electron | ✅ Ready |
| 📱 iOS | Capacitor | ✅ Ready |
| 🤖 Android | Capacitor | ✅ Ready |

## Structure

```
apps/
├── electron/     # Desktop app (macOS, Windows, Linux)
├── ios/          # iOS app (Capacitor)
├── android/      # Android app (Capacitor)
└── README.md
```

## Quick Start

### One-Command Build (All Platforms)

```bash
# From project root
./scripts/build-apps.sh

# Or specific platforms:
./scripts/build-apps.sh --electron-only
./scripts/build-apps.sh --ios-only
./scripts/build-apps.sh --android-only
./scripts/build-apps.sh --mobile-only    # iOS + Android
./scripts/build-apps.sh --sync           # Just sync web assets
```

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

### iOS (Capacitor)

```bash
cd apps/ios
npm install
npm run build  # Build web + sync iOS
npm run open   # Open in Xcode
```

### Android (Capacitor)

```bash
cd apps/android
npm install
npm run build  # Build web + sync Android
npm run open   # Open in Android Studio
```

## Shared Web Assets

All native apps use the same web frontend from `frontend-typescript/`. The build process:

1. Builds the TypeScript frontend (`npm run build` in frontend-typescript)
2. Copies/references the built assets
3. Packages with the native wrapper

## Platform-Specific Features

| Feature | Electron (Desktop) | iOS | Android |
|---------|-------------------|-----|---------|
| WebRTC/LiveKit | ✅ Full | ✅ WKWebView | ✅ WebView |
| Haptics | ❌ N/A | ✅ Native | ✅ Native |
| System Tray | ✅ Yes | ❌ N/A | ❌ N/A |
| Background Audio | ✅ Yes | ✅ AVAudioSession | ✅ Foreground Service |
| Auto-update | ✅ electron-updater | ✅ App Store | ✅ Play Store |
| Code Signing | ✅ Notarization | ✅ Apple | ✅ Keystore |
| Error Tracking | ✅ Sentry | ✅ Sentry | ✅ Sentry |
| Bluetooth Audio | ✅ Yes | ✅ Yes | ✅ Yes |
| Portrait Lock | ❌ N/A | ✅ Yes | ✅ Yes |

## Native Features

### Platform Detection

The frontend automatically detects the platform and adapts:

```typescript
import { platform, isNative, isElectron, isIOS } from './utils/platform.js';

// Check platform
if (isNative()) {
  // iOS or Android
}
if (isElectron()) {
  // Desktop app
}
```

### Native Haptics (iOS)

The app uses native Capacitor Haptics for rich tactile feedback:

```typescript
import { haptic } from './utils/platform.js';

haptic('light');    // Subtle tap
haptic('medium');   // Standard feedback
haptic('heavy');    // Strong impact
haptic('success');  // Success notification
```

### Audio Session (iOS)

The iOS app automatically configures AVAudioSession for optimal voice chat:
- Play and record simultaneously
- Bluetooth headset support
- Background audio continuation
- Proper ducking when receiving calls

## Development Tips

### Live Reload

**Electron**: Automatically connects to Vite dev server at `localhost:3004`

**iOS/Android**: Update `capacitor.config.ts` with your local IP:
```typescript
server: {
  url: 'http://192.168.x.x:3004',
  cleartext: true,
}
```

### Debugging

**Electron**: DevTools are enabled by default in development

**iOS**: Use Safari Developer Tools:
1. Enable Safari Developer Menu (Safari → Settings → Advanced)
2. Connect device or launch simulator
3. Safari → Develop → [Device] → Voice AI

**Android**: Use Chrome DevTools:
1. Enable USB debugging on device (Developer Options)
2. Connect device via USB
3. Open `chrome://inspect` in Chrome
4. Click "inspect" on your app's WebView

## Build Pipeline

For CI/CD, use these commands:

```bash
# Build all platforms
./scripts/build-apps.sh

# Or individually:
cd apps/electron && npm run build:mac
cd apps/ios && npm run build && npx cap copy ios
```

## Distribution

### macOS (Electron)

1. Code sign with Developer ID: `export CSC_LINK=path/to/cert.p12`
2. Notarize with Apple: set `APPLE_ID` and `APPLE_ID_PASSWORD`
3. Build: `npm run build:mac`
4. Output: `dist/Voice AI-*.dmg`

### Windows (Electron)

1. Get code signing certificate (EV recommended for SmartScreen)
2. Set environment: `$env:CSC_LINK = "path\to\cert.pfx"`
3. Build: `npm run build:win`
4. Output: `dist/Voice AI Setup-*.exe` + `dist/Voice AI-*-portable.exe`
5. See `apps/electron/WINDOWS.md` for detailed guide

### Linux (Electron)

1. Build: `npm run build:linux`
2. Output: `dist/Voice AI-*.AppImage`, `dist/voice-ai_*.deb`, `dist/voice-ai-*.rpm`
3. AppImage is recommended for broad compatibility

### iOS

1. Open in Xcode: `npm run open`
2. Select your signing team in Xcode
3. Archive: Product → Archive
4. Distribute to App Store or TestFlight

### Android

1. Generate signing key:
   ```bash
   keytool -genkey -v -keystore voiceai.keystore -alias voiceai -keyalg RSA
   ```
2. Open in Android Studio: `npm run open`
3. Build → Generate Signed Bundle/APK
4. Upload to Google Play Console

