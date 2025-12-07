# App Rebuild Guide - Three Stones Logo Update

After updating the Ferni logo to the "Three Stones" design, follow these steps to rebuild the mobile and desktop apps with the new icons.

## Prerequisites

1. All logo PNGs have been regenerated:
   ```bash
   node scripts/generate-logo-pngs.js
   node scripts/generate-marketing-assets.js
   ```

2. Design system assets are updated (check `design-system/assets/logos/`)

## iOS App Rebuild

### 1. Update App Icons

The iOS app icons are located in:
```
apps/ios/ios/App/App/Assets.xcassets/AppIcon.appiconset/
```

Required sizes for iOS (from Apple Human Interface Guidelines):
- 20pt: 40x40 (@2x), 60x60 (@3x)
- 29pt: 58x58 (@2x), 87x87 (@3x)
- 40pt: 80x80 (@2x), 120x120 (@3x)
- 60pt: 120x120 (@2x), 180x180 (@3x)
- 1024pt: 1024x1024 (App Store)

**Option A: Use the generator**
```bash
cd apps/ios
node ../../scripts/generate-logo-pngs.js --ios
```

**Option B: Manual update**
1. Copy the 1024x1024 PNG from `apps/marketing/assets/app-stores/apple/icon-1024.png`
2. Use Xcode or an online tool to generate all required sizes
3. Update `Contents.json` in the appiconset folder

### 2. Update Splash Screen (if using Lottie)

If using the animated splash:
1. Copy `brand/logos/ferni-logo.lottie.json` to `apps/ios/ios/App/App/`
2. Update the splash screen code to reference the new animation

### 3. Build & Archive

```bash
cd apps/ios

# Install dependencies
npm install

# Sync Capacitor
npx cap sync ios

# Open in Xcode
npx cap open ios
```

In Xcode:
1. Select your target
2. Product → Clean Build Folder
3. Product → Archive
4. Distribute to TestFlight

See `apps/ios/TESTFLIGHT.md` for detailed TestFlight instructions.

## Android App Rebuild

### 1. Update App Icons

Android app icons are located in:
```
apps/android/android/app/src/main/res/
├── mipmap-mdpi/ic_launcher.png      (48x48)
├── mipmap-hdpi/ic_launcher.png      (72x72)
├── mipmap-xhdpi/ic_launcher.png     (96x96)
├── mipmap-xxhdpi/ic_launcher.png    (144x144)
├── mipmap-xxxhdpi/ic_launcher.png   (192x192)
└── mipmap-anydpi-v26/               (Adaptive icons)
```

**Option A: Use the generator**
```bash
cd apps/android
node ../../scripts/generate-logo-pngs.js --android
```

**Option B: Use Android Studio Asset Studio**
1. Open the project in Android Studio
2. Right-click `res` folder → New → Image Asset
3. Select the 1024x1024 source image
4. Generate all density versions

### 2. Update Adaptive Icons (Android 8+)

For proper adaptive icon support, also update:
```
apps/android/android/app/src/main/res/mipmap-anydpi-v26/
├── ic_launcher.xml
└── ic_launcher_round.xml
```

The foreground layer should be the logo, background the brand color.

### 3. Update Splash Screen

For animated splash using Lottie:
1. Copy `brand/logos/ferni-logo.lottie.json` to `apps/android/android/app/src/main/assets/`
2. Update `SplashActivity` or `MainActivity` to load the animation

### 4. Build & Release

```bash
cd apps/android

# Install dependencies
npm install

# Sync Capacitor
npx cap sync android

# Build release APK
cd android
./gradlew assembleRelease

# Or build for Play Store (AAB)
./gradlew bundleRelease
```

The signed APK/AAB will be in:
```
android/app/build/outputs/apk/release/
android/app/build/outputs/bundle/release/
```

See `apps/android/README.md` for keystore and signing details.

## Electron App Rebuild

### 1. Update Icons

Electron icons are in:
```
apps/electron/resources/
├── icon.png      (512x512 or 1024x1024)
├── icon.icns     (macOS)
└── icon.ico      (Windows)
```

**Generate .icns (macOS):**
```bash
# Using iconutil (requires macOS)
mkdir icon.iconset
cp logo-16.png icon.iconset/icon_16x16.png
cp logo-32.png icon.iconset/icon_16x16@2x.png
cp logo-32.png icon.iconset/icon_32x32.png
cp logo-64.png icon.iconset/icon_32x32@2x.png
# ... continue for all sizes
iconutil -c icns icon.iconset
```

**Generate .ico (Windows):**
```bash
# Using ImageMagick
convert logo-16.png logo-32.png logo-48.png logo-256.png icon.ico
```

Or use an online converter like https://icoconvert.com

### 2. Build

```bash
cd apps/electron
npm install
npm run build

# Package for distribution
npm run package  # Creates installers for all platforms
```

## Web App (PWA)

### 1. Update Manifest Icons

The web manifest icons are in:
```
frontend-typescript/public/icons/
```

These should already be updated if you ran `generate-logo-pngs.js`.

### 2. Clear Cache

After deploying, users may need to:
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- Clear browser cache
- Reinstall PWA

### 3. Deploy

```bash
cd frontend-typescript
npm run build
# Deploy dist/ to your hosting provider
```

## Verification Checklist

After rebuilding each platform:

### iOS
- [ ] App icon appears correctly on Home Screen
- [ ] App icon appears correctly in Settings
- [ ] App icon appears correctly in TestFlight
- [ ] Splash screen shows new logo (if animated)

### Android
- [ ] App icon appears correctly on Home Screen
- [ ] App icon appears correctly in App Drawer
- [ ] Adaptive icon looks correct in different launcher shapes
- [ ] Splash screen shows new logo

### Electron
- [ ] Window icon is updated (title bar)
- [ ] Dock/taskbar icon is updated
- [ ] About dialog shows new icon

### Web
- [ ] Favicon updates in browser tab
- [ ] PWA icon updates on home screen
- [ ] Open Graph images use new logo

## Troubleshooting

### Icons not updating (iOS)
1. Delete the app from device/simulator
2. Clean build folder in Xcode
3. Rebuild and reinstall

### Icons not updating (Android)
1. Uninstall the app completely
2. Clear Gradle cache: `./gradlew clean`
3. Rebuild

### Icons not updating (Web)
1. Clear browser cache
2. Check service worker isn't caching old icons
3. Update cache-busting version in manifest

### Lottie animation not playing
1. Check file path is correct
2. Verify JSON is valid
3. Check lottie library version compatibility

## Resources

- iOS HIG: https://developer.apple.com/design/human-interface-guidelines/app-icons
- Android Icons: https://developer.android.com/guide/practices/ui_guidelines/icon_design
- Lottie: https://lottiefiles.com/
- Logo source files: `brand/logos/`
- Brand guidelines: `brand/FERNI-BRAND-GUIDELINES.md`

