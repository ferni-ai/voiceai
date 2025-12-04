# Voice AI iOS (Capacitor)

Native iOS application for Voice AI, built with Capacitor.

## Features

- 📱 Native iOS experience
- 🎙️ WebRTC/LiveKit voice conversations
- 🔔 Native haptic feedback
- 📲 Status bar integration
- 🎨 Native splash screen
- 📍 Safe area support for notched devices

## Prerequisites

- macOS (required for iOS development)
- Xcode 15+ with iOS SDK
- Node.js 18+
- CocoaPods (`brew install cocoapods`)
- Apple Developer account (for device testing)

## Quick Start

### First-time Setup

```bash
# From the apps/ios directory
npm install

# Build web assets and create iOS project
npm run build

# Open in Xcode
npm run open
```

### Development Workflow

```bash
# Build web assets and sync to iOS
npm run build

# Or for live development with hot reload:
# 1. Start the web dev server
cd ../../frontend-typescript && npm run dev

# 2. Update capacitor.config.ts to use your local IP
# 3. Run on device/simulator
npm run run:ios
```

## Project Structure

```
apps/ios/
├── capacitor.config.ts    # Capacitor configuration
├── package.json           # Dependencies
├── ios/                   # Native iOS project (generated)
│   ├── App/
│   │   ├── App/
│   │   │   ├── Info.plist
│   │   │   ├── AppDelegate.swift
│   │   │   └── capacitor.config.json
│   │   └── App.xcworkspace
│   └── Podfile
└── README.md
```

## Configuration

### App Permissions

The app requires the following permissions (configured in Info.plist):

| Permission | Key | Reason |
|------------|-----|--------|
| Microphone | NSMicrophoneUsageDescription | Voice conversations |
| Camera | NSCameraUsageDescription | Future video features |
| Background Audio | UIBackgroundModes | Continue audio in background |

### Entitlements

For full functionality, add these capabilities in Xcode:
- **Background Modes**: Audio, AirPlay, and Picture in Picture
- **Push Notifications** (if adding notifications)

## Native Plugins

### Included Plugins

| Plugin | Purpose |
|--------|---------|
| @capacitor/app | App lifecycle events |
| @capacitor/haptics | Native haptic feedback |
| @capacitor/keyboard | Keyboard management |
| @capacitor/splash-screen | Native splash screen |
| @capacitor/status-bar | Status bar styling |
| @capawesome/capacitor-screen-orientation | Screen rotation control |

### Adding LiveKit Native Support

For better WebRTC performance, consider adding the LiveKit iOS SDK:

```bash
# In the ios/App directory
# Add to Podfile:
pod 'LiveKit', '~> 2.0'
```

Then create a native bridge to use the LiveKit iOS SDK instead of the web SDK.

## Building for Release

### 1. Configure Signing

In Xcode:
1. Select the App target
2. Go to Signing & Capabilities
3. Select your Team
4. Configure Bundle Identifier

### 2. Build Archive

```bash
# Build web assets
npm run build:web

# Sync to iOS
npm run sync

# Open Xcode
npm run open
```

In Xcode:
1. Select "Any iOS Device" as destination
2. Product → Archive
3. Distribute App

### 3. App Store Submission

1. Create app in App Store Connect
2. Upload via Xcode Organizer or Transporter
3. Submit for review

## Troubleshooting

### White Screen

- Ensure web assets are built: `npm run build:web`
- Check Xcode console for JavaScript errors
- Verify `webDir` path in capacitor.config.ts

### Microphone Not Working

- Add `NSMicrophoneUsageDescription` to Info.plist
- Request permission in web code before accessing

### WebRTC/LiveKit Issues

- iOS WKWebView has some WebRTC limitations
- For production, consider native LiveKit SDK integration
- Check Info.plist includes required background modes

### Build Errors

```bash
# Clean and rebuild
cd ios/App
pod deintegrate
pod install
```

## Native Code Extensions

### Adding Custom Native Code

Create a Capacitor plugin for native features:

```bash
npm init @capacitor/plugin
```

### Audio Session Configuration

For better audio handling, you may want to add native audio session configuration in `AppDelegate.swift`:

```swift
import AVFoundation

func application(_ application: UIApplication, didFinishLaunchingWithOptions...) -> Bool {
    do {
        try AVAudioSession.sharedInstance().setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth]
        )
        try AVAudioSession.sharedInstance().setActive(true)
    } catch {
        print("Audio session error: \(error)")
    }
    return true
}
```

## Performance Tips

1. **Pre-warm WebView**: Load the web app before it's needed
2. **Use Native Haptics**: Replace web vibration API with Capacitor Haptics
3. **Optimize Assets**: Use WebP images, lazy load non-critical resources
4. **Background Audio**: Configure properly to avoid interruption

## Related Documentation

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [LiveKit iOS SDK](https://docs.livekit.io/client-sdk-ios/)
- [App Store Guidelines](https://developer.apple.com/app-store/review/guidelines/)

