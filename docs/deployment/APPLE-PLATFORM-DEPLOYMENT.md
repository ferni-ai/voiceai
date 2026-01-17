# Apple Platform Deployment Guide

> **Production deployment guide for Ferni iOS and macOS apps**

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [App Store Connect Setup](#app-store-connect-setup)
3. [iOS Deployment](#ios-deployment)
4. [macOS Deployment](#macos-deployment)
5. [Subscription Configuration](#subscription-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Apple Developer Account
- **Apple Developer Program** ($99/year): https://developer.apple.com/programs/
- Team ID: `XT8W26YE9U` (configured in project)

### Required Certificates

Generate these in Keychain Access or via Apple Developer portal:

| Certificate | Purpose | Where |
|-------------|---------|-------|
| **Apple Development** | iOS/macOS development | Xcode (automatic) |
| **Apple Distribution** | App Store submission | Xcode (automatic) |
| **Developer ID Application** | macOS direct distribution | Manual creation |

### Tools Required

```bash
# Xcode (required)
xcode-select --install

# XcodeGen (iOS project generation)
brew install xcodegen

# Fastlane (optional, for CI/CD)
brew install fastlane

# create-dmg (optional, prettier macOS installers)
brew install create-dmg
```

---

## App Store Connect Setup

### 1. Create App Records

Go to [App Store Connect](https://appstoreconnect.apple.com) → My Apps → + (New App)

#### iOS App

| Field | Value |
|-------|-------|
| Platform | iOS |
| Name | Ferni |
| Primary Language | English (U.S.) |
| Bundle ID | `com.sethdford.ferni` |
| SKU | `ferni-ios-001` |

#### watchOS App

The Apple Watch app is automatically included with the iOS app (no separate record needed).

### 2. Register App Groups

In Apple Developer Portal → Identifiers → App Groups:

Create: `group.com.ferni.shared`

This enables data sharing between:
- Main iOS app
- Apple Watch app
- Widgets
- Share Extension

### 3. Register Capabilities

For Bundle ID `com.sethdford.ferni`:

| Capability | Required For |
|------------|--------------|
| ✅ App Groups | Widget/Extension data sharing |
| ✅ HealthKit | Sleep, HRV, activity insights |
| ✅ HomeKit | Smart home mood control |
| ✅ Push Notifications | Proactive check-ins |
| ✅ Sign in with Apple | User authentication |
| ✅ Siri | "Hey Siri, talk to Ferni" |
| ✅ CarPlay | Voice-only driving companion |

### 4. Configure In-App Purchases

In App Store Connect → Your App → Features → In-App Purchases:

#### Subscription Group: "Ferni Subscription"

| Product ID | Type | Price | Duration |
|------------|------|-------|----------|
| `com.ferni.subscription.friend.monthly` | Auto-Renewable | $9.99 | Monthly |
| `com.ferni.subscription.friend.yearly` | Auto-Renewable | $99.99 | Yearly |
| `com.ferni.subscription.partner.monthly` | Auto-Renewable | $19.99 | Monthly |
| `com.ferni.subscription.partner.yearly` | Auto-Renewable | $199.99 | Yearly |

**Introductory Offers:**
- Friend Monthly: 7-day free trial
- Partner Monthly: 7-day free trial

---

## iOS Deployment

### Build for Testing (TestFlight)

```bash
cd apps/ios-native

# Generate Xcode project
xcodegen

# Open in Xcode
open FerniVoice.xcodeproj

# In Xcode:
# 1. Select "Any iOS Device (arm64)" as destination
# 2. Product → Archive
# 3. Window → Organizer → Distribute App → TestFlight
```

### Build for Release (App Store)

```bash
# Same as TestFlight, but:
# - In Organizer: Distribute App → App Store Connect
# - Upload to App Store Connect
# - Complete app metadata in App Store Connect
# - Submit for review
```

### Required App Store Metadata

| Asset | Specification |
|-------|---------------|
| App Icon | 1024x1024 PNG (no alpha) |
| Screenshots (6.5") | 1290 x 2796 (iPhone 15 Pro Max) |
| Screenshots (5.5") | 1242 x 2208 (iPhone 8 Plus) |
| App Preview Video | 1080p, 15-30 seconds (optional) |
| Privacy Policy URL | Required |
| Support URL | Required |
| Description | Up to 4000 characters |
| Keywords | Up to 100 characters |

### Privacy Declarations

The app already includes `PrivacyInfo.xcprivacy` with:
- Email collection (app functionality)
- Name collection (app functionality)
- Audio data collection (app functionality)
- Health data collection (app functionality)
- UserDefaults API access (CA92.1)

---

## macOS Deployment

### Option A: Direct Distribution (Recommended for Now)

Direct distribution via DMG installer with notarization.

#### 1. Set Up Signing Credentials

```bash
# Create environment file
cat > ~/.ferni-signing << 'EOF'
export FERNI_DEVELOPER_ID='Developer ID Application: Your Name (XT8W26YE9U)'
export FERNI_APPLE_ID='your@email.com'
export FERNI_TEAM_ID='XT8W26YE9U'
export FERNI_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx'  # App-specific password
EOF

# Load credentials
source ~/.ferni-signing
```

#### 2. Create App-Specific Password

1. Go to https://appleid.apple.com
2. Sign in → Security → App-Specific Passwords
3. Generate password for "Ferni macOS Notarization"
4. Save as `FERNI_APP_PASSWORD`

#### 3. Build and Distribute

```bash
cd apps/macos-menubar

# Build the app bundle
./build.sh

# Create DMG installer
./create-dmg.sh

# Sign and notarize (requires credentials)
source ~/.ferni-signing
./sign-and-notarize.sh
```

Output: `.build/FerniVoice-1.0.0.dmg` (notarized, ready for distribution)

### Option B: Mac App Store (Future)

For Mac App Store distribution:

1. Enable App Sandbox in entitlements
2. Create separate App Store Connect record
3. Archive and upload via Xcode

**Note:** Current entitlements have sandbox disabled (`com.apple.security.app-sandbox: false`) for Terminal/Claude Code integration. Mac App Store requires sandboxing.

---

## Subscription Configuration

### StoreKit Testing (Development)

The `Ferni.storekit` configuration file enables local testing:

1. Open project in Xcode
2. Run on simulator or device
3. StoreKit simulates transactions automatically
4. Test scenarios: purchase, restore, expire, cancel

### Server-Side Validation

Backend endpoint for receipt validation:
```
POST https://app.ferni.ai/api/subscription/verify
```

The iOS app already syncs with this endpoint via `SubscriptionService.swift`.

---

## Troubleshooting

### Common Issues

#### "Provisioning profile doesn't include capability"

Enable the capability in Apple Developer Portal:
1. Identifiers → Your App ID
2. Capabilities → Enable required capability
3. Regenerate provisioning profile in Xcode

#### "Code signing failed"

```bash
# Reset signing
cd apps/ios-native
rm -rf ~/Library/MobileDevice/Provisioning\ Profiles/*
xcodegen
# Open Xcode, let it download new profiles
```

#### "Notarization failed"

Check the log:
```bash
xcrun notarytool log <submission-id> \
    --apple-id $FERNI_APPLE_ID \
    --team-id $FERNI_TEAM_ID \
    --password $FERNI_APP_PASSWORD
```

Common fixes:
- Ensure all binaries are signed
- Remove any unsigned frameworks
- Check hardened runtime is enabled

#### "StoreKit products not loading"

1. Verify `Ferni.storekit` is selected in scheme
2. Check product IDs match App Store Connect
3. For production: Agreements & Contracts must be accepted

### Useful Commands

```bash
# List available signing identities
security find-identity -v -p codesigning

# Verify app signature
codesign --verify --deep --strict --verbose=2 "Ferni Voice.app"

# Check notarization status
spctl --assess --type execute --verbose=2 "Ferni Voice.app"

# Reset Xcode signing
rm -rf ~/Library/Developer/Xcode/DerivedData
rm -rf ~/Library/MobileDevice/Provisioning\ Profiles/*
```

---

## Quick Reference

### iOS Bundle IDs

| Target | Bundle ID |
|--------|-----------|
| Main App | `com.sethdford.ferni` |
| Watch App | `com.sethdford.ferni.watch` |
| Widgets | `com.sethdford.ferni.widgets` |
| Watch Widgets | `com.sethdford.ferni.watch.widgets` |
| Share Extension | `com.sethdford.ferni.share` |

### macOS Bundle ID

| Target | Bundle ID |
|--------|-----------|
| Menu Bar App | `com.ferni.voice` |

### Key Files

| File | Purpose |
|------|---------|
| `apps/ios-native/project.yml` | iOS project configuration |
| `apps/ios-native/Ferni.storekit` | StoreKit testing config |
| `apps/ios-native/FerniVoice/PrivacyInfo.xcprivacy` | Privacy manifest |
| `apps/macos-menubar/build.sh` | macOS build script |
| `apps/macos-menubar/sign-and-notarize.sh` | macOS distribution |

---

*Last updated: December 2024*
