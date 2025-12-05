# Code Signing Guide - Voice AI

Complete guide for signing Voice AI apps for distribution on all platforms.

## Overview

| Platform | Certificate Type | Cost | Notes |
|----------|-----------------|------|-------|
| macOS | Developer ID Application | $99/year (Apple Developer) | Required for notarization |
| Windows | EV Code Signing | ~$400-500/year | Instant SmartScreen trust |
| Windows | Standard Code Signing | ~$100-200/year | Builds trust over time |
| iOS | Apple Distribution | $99/year (Apple Developer) | Same account as macOS |
| Android | Self-signed Keystore | Free | You manage the key |

---

## 🍎 macOS Code Signing & Notarization

### Prerequisites

1. **Apple Developer Program membership** ($99/year)
   - Enroll at [developer.apple.com](https://developer.apple.com/programs/)

2. **Xcode installed** (for command-line tools)
   ```bash
   xcode-select --install
   ```

### Step 1: Create Certificates

1. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click "+" to create a new certificate
3. Select **"Developer ID Application"** (for distribution outside App Store)
4. Follow instructions to create a Certificate Signing Request (CSR)
5. Download and double-click to install in Keychain

### Step 2: Export Certificate as .p12

```bash
# Find your certificate name
security find-identity -v -p codesigning

# Export (will prompt for password)
# In Keychain Access: Right-click certificate → Export → Save as .p12
```

### Step 3: Create App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com/)
2. Sign In → Security → App-Specific Passwords
3. Generate a new password for "Voice AI Notarization"
4. Save this password securely

### Step 4: Configure Environment

Create `apps/electron/.env.signing` (add to .gitignore!):

```bash
# macOS Code Signing
CSC_LINK=/path/to/your-certificate.p12
CSC_KEY_PASSWORD=your-p12-password

# Apple Notarization
APPLE_ID=your-apple-id@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

### Step 5: Build Signed & Notarized App

```bash
cd apps/electron

# Load environment
source .env.signing

# Build with signing and notarization
npm run build:mac
```

The build will:
1. Sign with your Developer ID certificate
2. Submit to Apple for notarization
3. Staple the notarization ticket to the app

### Troubleshooting macOS

```bash
# Check if app is signed
codesign -dv --verbose=4 "dist/mac-universal/Voice AI.app"

# Check notarization status
spctl -a -vvv -t install "dist/mac-universal/Voice AI.app"

# Check notarization history
xcrun notarytool history --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID
```

---

## 🪟 Windows Code Signing

### Option A: EV Certificate (Recommended)

EV certificates provide **instant SmartScreen reputation** - no warning dialogs!

**Providers:**
- [DigiCert](https://www.digicert.com/signing/code-signing-certificates) (~$474/year)
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) (~$399/year)
- [GlobalSign](https://www.globalsign.com/en/code-signing-certificate) (~$429/year)

**Requirements:**
- Business registration documents
- Hardware token (USB key) - shipped by provider
- ~1-2 weeks verification process

### Option B: Standard Certificate

Standard certificates work but users see SmartScreen warnings initially.
Reputation builds over time with more downloads.

**Providers:**
- [Certum](https://shop.certum.eu/code-signing-certificates) (~$59/year)
- [SSL.com](https://www.ssl.com/certificates/code-signing/) (~$139/year)

### Step 1: Purchase & Setup Certificate

1. Purchase certificate from provider
2. Complete verification (business docs, phone call)
3. Receive certificate file (.pfx) or hardware token

### Step 2: Configure Environment

For **file-based certificate** (.pfx):

```powershell
# PowerShell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
```

For **EV certificate** (hardware token):

```powershell
# Windows with SafeNet/hardware token
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "token-pin"
# May need additional signtool configuration
```

### Step 3: Build Signed App

```powershell
cd apps\electron
npm run build:win
```

### Troubleshooting Windows

```powershell
# Check if exe is signed
signtool verify /pa /v "dist\Voice AI Setup-1.0.0.exe"

# Manual sign (if auto-sign fails)
signtool sign /f certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 "dist\*.exe"
```

---

## 📱 iOS Code Signing

### Prerequisites

1. **Apple Developer Program** ($99/year) - same as macOS
2. **Xcode** installed
3. **Physical device** for testing (or TestFlight)

### Step 1: Create App ID

1. Go to [Apple Developer Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click "+" → Select "App IDs" → "App"
3. Enter:
   - Description: `Voice AI`
   - Bundle ID: `com.sethdford.voiceai` (explicit)
4. Enable capabilities:
   - ✅ Access WiFi Information
   - ✅ Push Notifications (optional)

### Step 2: Create Certificates

1. Go to [Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Create:
   - **Apple Development** (for testing)
   - **Apple Distribution** (for App Store)

### Step 3: Create Provisioning Profiles

1. Go to [Profiles](https://developer.apple.com/account/resources/profiles/list)
2. Create:
   - **iOS App Development** profile (for testing)
   - **App Store** profile (for distribution)
3. Download and double-click to install

### Step 4: Configure Xcode

```bash
cd apps/ios
npx cap open ios
```

In Xcode:
1. Select the "App" target
2. Go to "Signing & Capabilities"
3. Check "Automatically manage signing"
4. Select your Team
5. Xcode will create/download profiles automatically

### Step 5: Build for Distribution

**TestFlight (recommended for testing):**
1. Product → Archive
2. Distribute App → App Store Connect
3. Upload
4. Go to App Store Connect → TestFlight → Add testers

**App Store:**
1. Product → Archive
2. Distribute App → App Store Connect
3. Submit for review in App Store Connect

### Automated CI/CD (Fastlane)

```ruby
# apps/ios/fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "Push to TestFlight"
  lane :beta do
    build_app(
      workspace: "ios/App/App.xcworkspace",
      scheme: "App"
    )
    upload_to_testflight
  end
end
```

---

## 🤖 Android Code Signing

### Step 1: Generate Keystore

```bash
cd apps/android

# Generate release keystore
keytool -genkey -v \
  -keystore voiceai-release.keystore \
  -alias voiceai \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# You'll be prompted for:
# - Keystore password (save this!)
# - Key password (can be same as keystore)
# - Name, Organization, etc.
```

**⚠️ IMPORTANT:** Back up your keystore file and passwords!
If lost, you cannot update your app on Play Store.

### Step 2: Configure Gradle Signing

Create `apps/android/android/key.properties` (add to .gitignore!):

```properties
storePassword=your-keystore-password
keyPassword=your-key-password
keyAlias=voiceai
storeFile=../voiceai-release.keystore
```

Update `apps/android/android/app/build.gradle`:

```gradle
// Add at the top, after plugins block
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ... existing config ...
    
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 3: Build Signed APK/Bundle

```bash
cd apps/android/android

# Build signed APK
./gradlew assembleRelease

# Build signed App Bundle (for Play Store)
./gradlew bundleRelease
```

Output:
- APK: `app/build/outputs/apk/release/app-release.apk`
- Bundle: `app/build/outputs/bundle/release/app-release.aab`

### Step 4: Upload to Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Create app → Fill details
3. Production → Create new release
4. Upload your `.aab` file
5. Submit for review

---

## 🔐 CI/CD Secrets Setup

### GitHub Actions Secrets

Go to your repo → Settings → Secrets and variables → Actions

Add these secrets:

```
# macOS
APPLE_CERTIFICATE_P12_BASE64    # base64-encoded .p12 file
APPLE_CERTIFICATE_PASSWORD      # .p12 password
APPLE_ID                        # your@email.com
APPLE_APP_SPECIFIC_PASSWORD     # app-specific password
APPLE_TEAM_ID                   # XXXXXXXXXX

# Windows
WINDOWS_CERTIFICATE_P12_BASE64  # base64-encoded .pfx file
WINDOWS_CERTIFICATE_PASSWORD    # .pfx password

# Android
ANDROID_KEYSTORE_BASE64         # base64-encoded .keystore file
ANDROID_KEYSTORE_PASSWORD       # keystore password
ANDROID_KEY_ALIAS               # voiceai
ANDROID_KEY_PASSWORD            # key password

# iOS (if using Fastlane match)
MATCH_PASSWORD                  # match encryption password
FASTLANE_USER                   # Apple ID
FASTLANE_PASSWORD               # Apple password
```

### Encoding Files to Base64

```bash
# macOS/Linux
base64 -i certificate.p12 | tr -d '\n' > certificate.txt

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Out-File certificate.txt
```

---

## 📋 Checklist

### Before Release

- [ ] macOS certificate created & tested
- [ ] macOS notarization working
- [ ] Windows certificate purchased
- [ ] Windows signing tested
- [ ] iOS profiles created
- [ ] iOS TestFlight tested
- [ ] Android keystore generated & backed up
- [ ] Android Play Store listing created
- [ ] All secrets added to CI/CD
- [ ] Version numbers updated

### Security Best Practices

1. **Never commit** certificates, keystores, or passwords
2. **Back up** Android keystore in secure location (password manager)
3. **Use hardware tokens** for Windows EV certificates
4. **Rotate** app-specific passwords periodically
5. **Enable 2FA** on all developer accounts

