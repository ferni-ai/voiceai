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
cd ../../apps/web && npm run dev

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

| Permission       | Key                          | Reason                       |
| ---------------- | ---------------------------- | ---------------------------- |
| Microphone       | NSMicrophoneUsageDescription | Voice conversations          |
| Camera           | NSCameraUsageDescription     | Future video features        |
| Background Audio | UIBackgroundModes            | Continue audio in background |

### Entitlements

For full functionality, add these capabilities in Xcode:

- **Background Modes**: Audio, AirPlay, and Picture in Picture
- **Push Notifications** (if adding notifications)

## Native Plugins

### Included Plugins

| Plugin                                   | Purpose                 |
| ---------------------------------------- | ----------------------- |
| @capacitor/app                           | App lifecycle events    |
| @capacitor/haptics                       | Native haptic feedback  |
| @capacitor/keyboard                      | Keyboard management     |
| @capacitor/splash-screen                 | Native splash screen    |
| @capacitor/status-bar                    | Status bar styling      |
| @capawesome/capacitor-screen-orientation | Screen rotation control |

### Adding LiveKit Native Support

For better WebRTC performance, consider adding the LiveKit iOS SDK:

```bash
# In the ios/App directory
# Add to Podfile:
pod 'LiveKit', '~> 2.0'
```

Then create a native bridge to use the LiveKit iOS SDK instead of the web SDK.

## In-App Purchases (StoreKit 2)

Ferni supports subscriptions via Apple In-App Purchases.

### 1. App Store Connect Setup

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app → In-App Purchases
3. Create a **Subscription Group** called "Ferni Premium"
4. Add subscription products:

| Product ID                  | Type           | Duration | Price   |
| --------------------------- | -------------- | -------- | ------- |
| `com.ferni.friend.monthly`  | Auto-Renewable | 1 Month  | $9.99   |
| `com.ferni.friend.annual`   | Auto-Renewable | 1 Year   | $99.90  |
| `com.ferni.partner.monthly` | Auto-Renewable | 1 Month  | $19.99  |
| `com.ferni.partner.annual`  | Auto-Renewable | 1 Year   | $199.90 |

5. Configure App Store Server Notifications:
   - URL: `https://app.ferni.ai/api/apple/webhook`
   - Version: V2

### 2. Xcode Capabilities

In Xcode, add the following capabilities:

1. Select your target → Signing & Capabilities
2. Click "+ Capability"
3. Add:
   - **In-App Purchase** - Required for StoreKit
   - **StoreKit Testing** (optional, for sandbox testing)

### 3. Environment Variables

Add these to your backend (Cloud Run / local):

```bash
# App Store Connect API
APPLE_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_KEY_ID=XXXXXXXXXX
APPLE_BUNDLE_ID=com.ferni.app

# Private key (base64 encoded .p8 file)
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

To get these credentials:

1. App Store Connect → Users and Access → Keys
2. Create an "In-App Purchase" key
3. Download the .p8 file (only once!)
4. Note the Key ID and Issuer ID

### 4. Testing In-App Purchases

#### Sandbox Testing

1. Create a Sandbox tester account:
   - App Store Connect → Users and Access → Sandbox
   - Add a test email (not your real Apple ID)

2. On device:
   - Sign out of App Store
   - When prompted during purchase, use sandbox credentials

3. In Xcode:
   - Use StoreKit Configuration File for local testing
   - Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration

#### Testing Checklist

- [ ] Products load correctly
- [ ] Purchase flow completes
- [ ] Receipt verification works
- [ ] Subscription status syncs
- [ ] Restore purchases works
- [ ] Cancellation instructions show correctly

### 5. StoreKit Integration Notes

The web app uses a Capacitor plugin for StoreKit. Key files:

| File                                                    | Purpose              |
| ------------------------------------------------------- | -------------------- |
| `apps/web/src/services/apple-iap.service.ts` | Frontend IAP client  |
| `src/services/apple-iap.ts`                             | Backend verification |
| `src/api/apple-iap-routes.ts`                           | API endpoints        |

#### Subscription Cancellation

**Important**: Apple doesn't allow in-app subscription cancellation. Users must:

1. Open iOS Settings
2. Tap their name → Subscriptions
3. Find Ferni and tap Cancel

The app shows these instructions in the Manage Subscription modal.

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
