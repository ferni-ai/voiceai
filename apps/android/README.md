# Voice AI Android (Capacitor)

Native Android application for Voice AI, built with Capacitor.

## Features

- 📱 Native Android experience
- 🎙️ WebRTC/LiveKit voice conversations
- 📳 Native haptic feedback
- 🎨 Material Design status bar
- 💫 Native splash screen
- 🔔 Push notification ready

## Prerequisites

- [Android Studio](https://developer.android.com/studio) (latest stable)
- Android SDK (API level 22+ for min, 34 for target)
- Node.js 18+
- Java 17+ (bundled with Android Studio)

## Quick Start

### First-time Setup

```bash
# From the apps/android directory
npm install

# Build web assets and create Android project
npm run build

# Open in Android Studio
npm run open
```

### Development Workflow

```bash
# Build web assets and sync to Android
npm run build

# Or for live development with hot reload:
# 1. Start the web dev server
cd ../../apps/web && npm run dev

# 2. Update capacitor.config.ts with your local IP
# 3. Run on device/emulator
npm run run:android
```

## Project Structure

```
apps/android/
├── capacitor.config.ts    # Capacitor configuration
├── package.json           # Dependencies
├── android/               # Native Android project (generated)
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/          # Native Java/Kotlin code
│   │   │   └── res/           # Resources (icons, splash, etc.)
│   │   └── build.gradle
│   └── build.gradle
└── README.md
```

## Configuration

### App Permissions

The app requires these permissions (in AndroidManifest.xml):

| Permission | Purpose |
|------------|---------|
| `RECORD_AUDIO` | Voice conversations |
| `INTERNET` | Network access for LiveKit |
| `MODIFY_AUDIO_SETTINGS` | Audio routing |
| `VIBRATE` | Haptic feedback |
| `FOREGROUND_SERVICE` | Background audio |

### Native Modifications

After generating the Android project, you may want to customize:

1. **App Icon**: Replace files in `android/app/src/main/res/mipmap-*/`
2. **Splash Screen**: Customize `android/app/src/main/res/drawable/splash.xml`
3. **Colors**: Edit `android/app/src/main/res/values/colors.xml`

## Building for Release

### 1. Generate Signing Key

```bash
keytool -genkey -v -keystore voiceai-release.keystore -alias voiceai -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Configure Signing

Create `android/key.properties`:
```properties
storePassword=your-store-password
keyPassword=your-key-password
keyAlias=voiceai
storeFile=/path/to/voiceai-release.keystore
```

### 3. Build APK/Bundle

```bash
# Build web assets
npm run build:web

# Sync to Android
npm run sync

# Open Android Studio
npm run open
```

In Android Studio:
1. Build → Generate Signed Bundle/APK
2. Select Android App Bundle (for Play Store) or APK
3. Choose your keystore and build

### 4. Play Store Submission

1. Create app in Google Play Console
2. Upload AAB (Android App Bundle)
3. Fill out store listing
4. Submit for review

## Troubleshooting

### White Screen

- Ensure web assets are built: `npm run build:web`
- Check Android Studio Logcat for JavaScript errors
- Verify `webDir` path in capacitor.config.ts

### Microphone Not Working

- Check `RECORD_AUDIO` permission in AndroidManifest.xml
- Test permission request flow in app
- Verify device microphone is functional

### Build Errors

```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew build
```

### WebRTC Issues

- Ensure `INTERNET` and `MODIFY_AUDIO_SETTINGS` permissions
- Test on physical device (emulator has limited WebRTC support)
- Check that LiveKit client is loading properly

## Performance Tips

1. **Use Release Build**: Debug builds are significantly slower
2. **Enable ProGuard**: Reduces APK size and improves performance
3. **Test on Physical Device**: Emulator has limitations for audio/WebRTC
4. **Monitor Memory**: Use Android Studio Profiler

## Related Documentation

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [LiveKit Android SDK](https://docs.livekit.io/client-sdk-android/)
- [Play Store Guidelines](https://play.google.com/about/developer-content-policy/)

