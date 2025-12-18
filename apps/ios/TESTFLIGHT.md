# 🚀 Ferni iOS - TestFlight Distribution Guide

This guide walks you through distributing Ferni to beta testers via Apple TestFlight.

## Prerequisites

- [ ] Apple Developer Program membership ($99/year)
- [ ] Xcode 15+ installed
- [ ] App built and synced (`npm run build`)
- [ ] Valid development certificate in Xcode

## Step 1: App Store Connect Setup

### 1.1 Create App Record

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **Apps** → **+** → **New App**
3. Fill in details:

| Field | Value |
|-------|-------|
| Platform | iOS |
| Name | Ferni |
| Primary Language | English (U.S.) |
| Bundle ID | com.sethdford.ferni |
| SKU | ferni-ios-001 |
| User Access | Full Access |

4. Click **Create**

### 1.2 App Information

Fill in required metadata:

- **Category**: Health & Fitness (or Lifestyle)
- **Content Rights**: Does not contain third-party content
- **Age Rating**: Complete the questionnaire (likely 4+)

## Step 2: Configure Xcode Project

### 2.1 Signing & Capabilities

1. Open `apps/ios/ios/App/App.xcworkspace` in Xcode
2. Select **App** in the navigator
3. Select **App** target
4. Go to **Signing & Capabilities** tab
5. Configure:

| Setting | Value |
|---------|-------|
| Team | Your Apple Developer Team |
| Bundle Identifier | com.sethdford.ferni |
| Signing Certificate | Apple Distribution (auto-managed) |
| Provisioning Profile | Managed by Xcode |

> ✅ Enable "Automatically manage signing" for simplicity

### 2.2 Build Settings

1. Select **App** target → **Build Settings**
2. Verify:

| Setting | Value |
|---------|-------|
| iOS Deployment Target | 13.0 (or higher) |
| Valid Architectures | arm64 |
| Build Active Architecture Only | No (for Release) |

### 2.3 Version & Build Numbers

1. Select **App** target → **General**
2. Set:

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Build | 1 |

> 💡 Increment Build number for each TestFlight upload

## Step 3: Create Archive

### 3.1 Build Web Assets

```bash
cd apps/ios
npm run build
```

### 3.2 Archive in Xcode

1. Select **Any iOS Device (arm64)** as build destination
2. **Product** → **Archive** (⌘+Shift+B then Archive)
3. Wait for build to complete (~2-5 minutes)

The Organizer window opens automatically when complete.

## Step 4: Upload to App Store Connect

### 4.1 Validate Archive

1. In Organizer, select your archive
2. Click **Validate App**
3. Sign in with Apple ID
4. Select distribution options:
   - ✅ Upload your app's symbols
   - ✅ Manage Version and Build Number
5. Click **Validate**
6. Fix any errors and re-archive if needed

### 4.2 Distribute Archive

1. Click **Distribute App**
2. Select **App Store Connect** → **Upload**
3. Same options as validation
4. Click **Upload**
5. Wait for upload (~5-10 minutes)

## Step 5: TestFlight Configuration

### 5.1 Wait for Processing

1. Go to App Store Connect → Your App → **TestFlight**
2. Wait for build to appear (5-30 minutes)
3. Build status will show:
   - 🟡 Processing → ✅ Ready to Submit

### 5.2 Export Compliance

When prompted:
1. Does your app use encryption? → **No** (or Yes if using HTTPS)
2. If Yes: Is it exempt? → **Yes** (HTTPS is exempt)

### 5.3 Test Information

Required for each build:
1. Click on the build version
2. Add **Test Details**:

```
What to Test:
- Voice conversations with AI coach
- Haptic feedback during swipes
- Theme switching (light/dark)
- Deep link handling (ferni://)
- Offline mode behavior

Known Issues:
- First voice connection may take 2-3 seconds
- Push notifications not yet implemented
```

### 5.4 Add Testers

#### Internal Testers (up to 100)
1. **App Store Connect Users** tab
2. Add team members by email
3. They'll receive TestFlight invite instantly

#### External Testers (up to 10,000)
1. **External Groups** tab → **+** → Create group
2. Name: "Beta Testers"
3. Add testers by email
4. Click **Submit for Review**
5. Wait for beta review (~24-48 hours first time)

## Step 6: Tester Experience

### What Testers Receive

1. Email invite from TestFlight
2. Install TestFlight app from App Store
3. Accept invite → Install Ferni
4. Yellow dot indicates TestFlight build

### Tester Feedback

Testers can:
- Submit feedback via TestFlight app
- Take screenshots with comments
- Report crashes (automatic)

View feedback in App Store Connect → TestFlight → Feedback

## Updating TestFlight Builds

### Quick Update Workflow

```bash
# 1. Make code changes in apps/web

# 2. Rebuild
cd apps/ios
npm run build

# 3. In Xcode: Increment Build number
# General → Build: 2 (then 3, 4, etc.)

# 4. Archive and upload
# Product → Archive → Distribute App
```

### Automatic Build Number Script

Add to `package.json`:

```json
"scripts": {
  "bump-build": "cd ios/App && agvtool next-version -all"
}
```

Then: `npm run bump-build` before archiving.

## Troubleshooting

### "No Suitable Application Records Found"

- Bundle ID in Xcode must match App Store Connect exactly
- Try: **Product** → **Clean Build Folder** → Rebuild

### "Invalid Provisioning Profile"

1. **Xcode** → **Settings** → **Accounts**
2. Select your team → **Download Manual Profiles**
3. Enable "Automatically manage signing"

### "Missing Compliance"

Go to TestFlight → Click on build → Answer encryption questions

### Build Processing Stuck

- Wait up to 1 hour for first build
- Check App Store Connect status page for outages
- Try re-uploading

### "Beta App Review Rejected"

Common reasons:
- App crashes on launch → Test thoroughly first
- Missing privacy policy → Add URL in App Store Connect
- Incomplete functionality → Add test account if needed

## Timeline Expectations

| Step | Duration |
|------|----------|
| Archive build | 2-5 minutes |
| Upload | 5-10 minutes |
| Processing | 5-30 minutes |
| Beta review (first) | 24-48 hours |
| Beta review (subsequent) | Usually automatic |
| Internal tester access | Immediate after processing |
| External tester access | After beta review |

## Checklist Before Each Upload

- [ ] Web assets rebuilt (`npm run build`)
- [ ] Build number incremented
- [ ] Tested on simulator
- [ ] Tested on real device (recommended)
- [ ] Test information updated
- [ ] No console errors in Safari Web Inspector

---

## Quick Reference

```bash
# Full rebuild and open Xcode
cd apps/ios
npm run build
npm run open

# In Xcode
# 1. Any iOS Device (arm64)
# 2. Product → Archive
# 3. Distribute App → App Store Connect → Upload
```

**TestFlight links:**
- [App Store Connect](https://appstoreconnect.apple.com)
- [TestFlight FAQ](https://developer.apple.com/testflight/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

---

Happy testing! 🌱

