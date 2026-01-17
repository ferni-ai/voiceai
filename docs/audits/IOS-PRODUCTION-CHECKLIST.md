# iOS App Production Checklist

**Date:** January 3, 2026  
**App:** FerniVoice (`apps/ios-native/`)

---

## 🚨 Critical Issues (Must Fix Before Release)

### 1. ❌ Entitlements File is Empty

**File:** `FerniVoice/FerniVoice.entitlements`

The entitlements file is empty but the app uses these capabilities:
- Sign In with Apple
- HealthKit
- HomeKit
- Siri
- Push Notifications
- App Groups (for widgets/watch)
- Background Modes

**Fix:** Populate entitlements in Xcode → Target → Signing & Capabilities

### 2. ❌ Deep Link URL Handling Missing

**Issue:** Widgets use `ferni://` URLs but `FerniVoiceApp.swift` doesn't have `onOpenURL` handler.

**URLs Used:**
- `ferni://checkin` - Mood check-in
- `ferni://talk` - Start voice conversation
- `ferni://vent` - Quick vent session
- `ferni://music` - Play calming music
- `ferni://insight` - Daily insight

**Fix:** Add URL scheme to Info.plist and `onOpenURL` handler to app

### 3. ❌ App Store Screenshots Missing

**Location:** `AppStore/` folder needs screenshots

**Required Sizes:**
- iPhone 6.7" (1290 × 2796)
- iPhone 6.5" (1242 × 2688)
- iPhone 5.5" (1242 × 2208)
- iPad Pro 12.9" (2048 × 2732)
- Apple Watch

### 4. ❓ In-App Purchase Setup

**Product IDs defined in code:**
```swift
com.ferni.subscription.friend.monthly
com.ferni.subscription.friend.yearly
com.ferni.subscription.partner.monthly
com.ferni.subscription.partner.yearly
```

**Action:** Create these in App Store Connect → In-App Purchases

---

## ⚠️ Should Do Before Release

### 5. Push Notification Backend Integration

**Status:** Local notifications work, remote push needs setup

**Required:**
- [ ] APNS certificate in Apple Developer portal
- [ ] Backend integration with Firebase Cloud Messaging or APNS
- [ ] Device token registration

### 6. Analytics/Crash Reporting

**Options:**
- Firebase Crashlytics (recommended)
- Sentry
- Apple's built-in crash reports

### 7. TestFlight Beta Testing

**Steps:**
1. Archive app in Xcode
2. Upload to App Store Connect
3. Add internal testers
4. Add external beta testers
5. Collect feedback

### 8. CarPlay Testing

**Requires:** Physical CarPlay-enabled car or head unit

### 9. Watch App Testing

**Requires:** Physical Apple Watch paired with iPhone

---

## ✅ Already Complete

| Component | Status | Notes |
|-----------|--------|-------|
| Sign In with Apple | ✅ | Full flow with Firebase |
| Account Deletion | ✅ | Added Jan 3, 2026 |
| Firebase Auth | ✅ | Token verification on backend |
| Keychain Storage | ✅ | Secure credential storage |
| StoreKit 2 Subscriptions | ✅ | Full implementation |
| Voice Session (LiveKit) | ✅ | Real-time voice chat |
| Watch App | ✅ | Mood check-in, voice triggers |
| CarPlay | ✅ | Voice-only driving companion |
| Widgets (4 types) | ✅ | Interactive + static |
| Siri Shortcuts (8 types) | ✅ | Full integration |
| Local Notifications | ✅ | Proactive check-ins |
| HealthKit | ✅ | Sleep, HRV, activity |
| HomeKit | ✅ | Smart lighting control |
| Location Services | ✅ | Context-aware support |
| Contacts | ✅ | Relationship tracking |
| MusicKit | ✅ | Mood-based music |
| Privacy Manifest | ✅ | iOS 17 compliant |
| App Store Metadata | ✅ | Complete descriptions |
| Privacy Questionnaire | ✅ | Documented answers |
| Unit Tests | ✅ | Auth, API, E2E |

---

## 📱 Required Xcode Capabilities

Add these in Xcode → Target → Signing & Capabilities:

### Required Capabilities

| Capability | Why |
|------------|-----|
| Sign In with Apple | Authentication |
| HealthKit | Wellness insights |
| HomeKit | Smart home control |
| Siri | Voice shortcuts |
| Push Notifications | Remote notifications |
| App Groups | Share data with widgets/watch |
| Background Modes | Audio, VoIP, fetch |

### Background Modes to Enable

- [x] Audio, AirPlay, and Picture in Picture
- [x] Voice over IP
- [x] Background fetch
- [x] Background processing

---

## 🔗 URL Scheme Setup

### Info.plist Addition

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.ferni.fernivoice</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>ferni</string>
        </array>
    </dict>
</array>
```

### App Handler (FerniVoiceApp.swift)

```swift
.onOpenURL { url in
    handleDeepLink(url)
}

func handleDeepLink(_ url: URL) {
    guard url.scheme == "ferni" else { return }
    
    switch url.host {
    case "talk":
        // Start voice conversation
    case "checkin":
        // Show mood check-in
    case "vent":
        // Start vent session
    case "music":
        // Play calming music
    case "insight":
        // Show daily insight
    default:
        break
    }
}
```

---

## 📸 Screenshot Requirements

### iPhone Screenshots (Required)

| Size | Device |
|------|--------|
| 1290 × 2796 | iPhone 15 Pro Max (6.7") |
| 1242 × 2688 | iPhone 11 Pro Max (6.5") |
| 1242 × 2208 | iPhone 8 Plus (5.5") |

### iPad Screenshots (If supporting iPad)

| Size | Device |
|------|--------|
| 2048 × 2732 | iPad Pro 12.9" |

### Apple Watch Screenshots

| Size | Device |
|------|--------|
| 410 × 502 | Apple Watch Series 7+ |

### Screenshot Scenes to Capture

1. **Welcome/Onboarding** - First launch experience
2. **Voice Conversation** - Active Ferni conversation
3. **Persona Selection** - Team picker
4. **Settings/Account** - Account management
5. **Watch App** - Watch companion
6. **Widget** - Home screen widget

---

## 🧪 Testing Checklist

### Before TestFlight

- [ ] All features work on physical device
- [ ] Audio permissions work correctly
- [ ] Sign In with Apple flow complete
- [ ] Subscription purchase flow works (sandbox)
- [ ] Voice conversation connects
- [ ] Persona handoffs work
- [ ] Watch connectivity works
- [ ] Widgets display correctly
- [ ] Siri shortcuts trigger correctly

### Before App Store Submission

- [ ] TestFlight beta feedback addressed
- [ ] Crash-free sessions > 99%
- [ ] All reviewer notes in metadata
- [ ] Demo account created (if needed)
- [ ] Support URL live
- [ ] Privacy policy URL live
- [ ] Marketing URL live

---

## 🚀 App Store Connect Checklist

### App Information

- [ ] App name: Ferni
- [ ] Subtitle: Your AI emotional support team
- [ ] Category: Health & Fitness
- [ ] Secondary: Lifestyle
- [ ] Content rights confirmation

### Pricing & Availability

- [ ] Price: Free (with IAP)
- [ ] Territories selected
- [ ] Pre-order (optional)

### App Privacy

- [ ] Data types declared
- [ ] Third-party data sharing
- [ ] Privacy policy URL

### In-App Purchases

- [ ] Friend Monthly ($9.99)
- [ ] Friend Yearly ($99.99)
- [ ] Partner Monthly ($19.99)
- [ ] Partner Yearly ($199.99)
- [ ] Review information for each

### App Review

- [ ] Contact info
- [ ] Demo account (if needed)
- [ ] Notes for reviewer
- [ ] Attachment (if needed)

---

## 📅 Release Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Fix Critical | 1-2 days | Entitlements, deep links |
| Screenshots | 1 day | Capture all sizes |
| IAP Setup | 1 day | App Store Connect |
| TestFlight | 1-2 weeks | Internal + external beta |
| Bug Fixes | 1 week | Address beta feedback |
| Submission | 1-3 days | Review process |

**Estimated Time to App Store:** 2-4 weeks

---

*Last Updated: January 3, 2026*
