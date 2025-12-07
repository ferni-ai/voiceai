#!/bin/bash
# Update all logos across the repository from design system source

set -e

DESIGN_SYSTEM="/Users/sethford/Documents/voiceai/design-system/assets/logos"
FRONTEND_PUBLIC="/Users/sethford/Documents/voiceai/frontend-typescript/public"
BRAND_DIR="/Users/sethford/Documents/voiceai/brand"

echo "🎨 Updating all Ferni logos from design system..."

# ============================================================================
# 1. Update frontend-typescript/public (main web app source)
# ============================================================================
echo "📱 Updating frontend-typescript/public..."

# Copy main logo SVGs
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/logo.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/logo-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/favicon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/apple-touch-icon.svg"

# Copy to icons folder
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/icon-base.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/icon-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/apple-touch-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/favicon-16.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/favicon-32.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$FRONTEND_PUBLIC/icons/maskable-icon.svg"

# Copy PNGs
cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$FRONTEND_PUBLIC/icons/icon-1024x1024.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$FRONTEND_PUBLIC/icons/icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-256.png" "$FRONTEND_PUBLIC/icons/icon-256x256.png"
cp "$DESIGN_SYSTEM/ferni-logo-192.png" "$FRONTEND_PUBLIC/icons/maskable-icon-192x192.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$FRONTEND_PUBLIC/icons/maskable-icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$FRONTEND_PUBLIC/icons/apple-touch-icon-180x180.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$FRONTEND_PUBLIC/icons/apple-touch-icon.png"
cp "$DESIGN_SYSTEM/ferni-logo-16.png" "$FRONTEND_PUBLIC/icons/favicon-16x16.png"
cp "$DESIGN_SYSTEM/ferni-logo-32.png" "$FRONTEND_PUBLIC/icons/favicon-32x32.png"

# Generate other apple touch icon sizes
cd "$DESIGN_SYSTEM"
rsvg-convert -w 120 -h 120 ferni-logo.svg > "$FRONTEND_PUBLIC/icons/apple-touch-icon-120x120.png"
rsvg-convert -w 152 -h 152 ferni-logo.svg > "$FRONTEND_PUBLIC/icons/apple-touch-icon-152x152.png"
rsvg-convert -w 167 -h 167 ferni-logo.svg > "$FRONTEND_PUBLIC/icons/apple-touch-icon-167x167.png"

echo "  ✅ frontend-typescript/public updated"

# ============================================================================
# 2. Update brand directory
# ============================================================================
echo "🎨 Updating brand directory..."

# Main brand logos
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/logos/logo-primary.svg"
cp "$DESIGN_SYSTEM/ferni-logo-dark.svg" "$BRAND_DIR/logos/logo-dark-bg.svg"
cp "$DESIGN_SYSTEM/ferni-logo-dark.svg" "$BRAND_DIR/logos/logo-light-bg.svg"
cp "$DESIGN_SYSTEM/ferni-logo-simple.svg" "$BRAND_DIR/logos/logo-monochrome-light.svg"
cp "$DESIGN_SYSTEM/ferni-logo-simple.svg" "$BRAND_DIR/logos/logo-monochrome-dark.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/logos/logo-wordmark-horizontal.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/logos/logo-wordmark-stacked.svg"
cp "$DESIGN_SYSTEM/ferni-logo-300.png" "$BRAND_DIR/logo.png"

# Update ferni-logo files
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/logos/ferni-logo.svg"
cp "$DESIGN_SYSTEM/ferni-logo-300.png" "$BRAND_DIR/logos/ferni-logo-300.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$BRAND_DIR/logos/ferni-logo-512.png"
cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$BRAND_DIR/logos/ferni-logo-1024.png"
cp "$DESIGN_SYSTEM/ferni-logo-dark.svg" "$BRAND_DIR/logos/ferni-logo-dark.svg"
cp "$DESIGN_SYSTEM/ferni-logo-dark-300.png" "$BRAND_DIR/logos/ferni-logo-dark-300.png"
cp "$DESIGN_SYSTEM/ferni-logo-simple.svg" "$BRAND_DIR/logos/ferni-logo-simple.svg"
cp "$DESIGN_SYSTEM/ferni-logo-simple-300.png" "$BRAND_DIR/logos/ferni-logo-simple-300.png"

# Favicons
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/favicons/favicon-16.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/favicons/favicon-32.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/favicons/favicon-192.svg"

# Icons
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/icons/app-icon-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/icons/app-icon-orb-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo-simple.svg" "$BRAND_DIR/icons/app-icon-orb-simple-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo-simple.svg" "$BRAND_DIR/icons/app-icon-ios-simple.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/icons/app-icon-android.svg"

echo "  ✅ brand directory updated"

# ============================================================================
# 3. Update marketing assets
# ============================================================================
echo "📣 Updating marketing assets..."

cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$BRAND_DIR/../apps/marketing/graphics/press-kit/app-icon-1024.png"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$BRAND_DIR/../apps/marketing/graphics/press-kit/logo-primary.svg"
cp "$DESIGN_SYSTEM/ferni-logo-dark.svg" "$BRAND_DIR/../apps/marketing/graphics/press-kit/logo-dark-bg.svg"
cp "$DESIGN_SYSTEM/ferni-logo-300.png" "$BRAND_DIR/../apps/marketing/graphics/windows/store-logo-300.png"

echo "  ✅ marketing assets updated"

# ============================================================================
# 4. Update Electron app
# ============================================================================
echo "💻 Updating Electron app..."

ELECTRON_WEB="/Users/sethford/Documents/voiceai/apps/electron/web"

cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/logo.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/logo-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/favicon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/apple-touch-icon.svg"

# Icons
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/icon-base.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/icon-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/apple-touch-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/favicon-16.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/favicon-32.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ELECTRON_WEB/icons/maskable-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$ELECTRON_WEB/icons/icon-1024x1024.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$ELECTRON_WEB/icons/icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-256.png" "$ELECTRON_WEB/icons/icon-256x256.png"
cp "$DESIGN_SYSTEM/ferni-logo-192.png" "$ELECTRON_WEB/icons/maskable-icon-192x192.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$ELECTRON_WEB/icons/maskable-icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$ELECTRON_WEB/icons/apple-touch-icon-180x180.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$ELECTRON_WEB/icons/apple-touch-icon.png"
cp "$DESIGN_SYSTEM/ferni-logo-16.png" "$ELECTRON_WEB/icons/favicon-16x16.png"
cp "$DESIGN_SYSTEM/ferni-logo-32.png" "$ELECTRON_WEB/icons/favicon-32x32.png"

cd "$DESIGN_SYSTEM"
rsvg-convert -w 120 -h 120 ferni-logo.svg > "$ELECTRON_WEB/icons/apple-touch-icon-120x120.png"
rsvg-convert -w 152 -h 152 ferni-logo.svg > "$ELECTRON_WEB/icons/apple-touch-icon-152x152.png"
rsvg-convert -w 167 -h 167 ferni-logo.svg > "$ELECTRON_WEB/icons/apple-touch-icon-167x167.png"

# Electron resources
cp "$DESIGN_SYSTEM/ferni-logo-256.png" "/Users/sethford/Documents/voiceai/apps/electron/resources/icon.png"

echo "  ✅ Electron app updated"

# ============================================================================
# 5. Update iOS app
# ============================================================================
echo "📱 Updating iOS app..."

IOS_PUBLIC="/Users/sethford/Documents/voiceai/apps/ios/ios/App/App/public"

cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/logo.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/logo-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/favicon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/apple-touch-icon.svg"

cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/icon-base.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/icon-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/apple-touch-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/favicon-16.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/favicon-32.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$IOS_PUBLIC/icons/maskable-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$IOS_PUBLIC/icons/icon-1024x1024.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$IOS_PUBLIC/icons/icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-256.png" "$IOS_PUBLIC/icons/icon-256x256.png"
cp "$DESIGN_SYSTEM/ferni-logo-192.png" "$IOS_PUBLIC/icons/maskable-icon-192x192.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$IOS_PUBLIC/icons/maskable-icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$IOS_PUBLIC/icons/apple-touch-icon-180x180.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$IOS_PUBLIC/icons/apple-touch-icon.png"
cp "$DESIGN_SYSTEM/ferni-logo-16.png" "$IOS_PUBLIC/icons/favicon-16x16.png"
cp "$DESIGN_SYSTEM/ferni-logo-32.png" "$IOS_PUBLIC/icons/favicon-32x32.png"

cd "$DESIGN_SYSTEM"
rsvg-convert -w 120 -h 120 ferni-logo.svg > "$IOS_PUBLIC/icons/apple-touch-icon-120x120.png"
rsvg-convert -w 152 -h 152 ferni-logo.svg > "$IOS_PUBLIC/icons/apple-touch-icon-152x152.png"
rsvg-convert -w 167 -h 167 ferni-logo.svg > "$IOS_PUBLIC/icons/apple-touch-icon-167x167.png"

echo "  ✅ iOS app updated"

# ============================================================================
# 6. Update Android app
# ============================================================================
echo "🤖 Updating Android app..."

ANDROID_PUBLIC="/Users/sethford/Documents/voiceai/apps/android/android/app/src/main/assets/public"

cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/logo.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/logo-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/favicon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/apple-touch-icon.svg"

cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/icon-base.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/icon-1024.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/apple-touch-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/favicon-16.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/favicon-32.svg"
cp "$DESIGN_SYSTEM/ferni-logo.svg" "$ANDROID_PUBLIC/icons/maskable-icon.svg"
cp "$DESIGN_SYSTEM/ferni-logo-1024.png" "$ANDROID_PUBLIC/icons/icon-1024x1024.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$ANDROID_PUBLIC/icons/icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-256.png" "$ANDROID_PUBLIC/icons/icon-256x256.png"
cp "$DESIGN_SYSTEM/ferni-logo-192.png" "$ANDROID_PUBLIC/icons/maskable-icon-192x192.png"
cp "$DESIGN_SYSTEM/ferni-logo-512.png" "$ANDROID_PUBLIC/icons/maskable-icon-512x512.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$ANDROID_PUBLIC/icons/apple-touch-icon-180x180.png"
cp "$DESIGN_SYSTEM/ferni-logo-180.png" "$ANDROID_PUBLIC/icons/apple-touch-icon.png"
cp "$DESIGN_SYSTEM/ferni-logo-16.png" "$ANDROID_PUBLIC/icons/favicon-16x16.png"
cp "$DESIGN_SYSTEM/ferni-logo-32.png" "$ANDROID_PUBLIC/icons/favicon-32x32.png"

cd "$DESIGN_SYSTEM"
rsvg-convert -w 120 -h 120 ferni-logo.svg > "$ANDROID_PUBLIC/icons/apple-touch-icon-120x120.png"
rsvg-convert -w 152 -h 152 ferni-logo.svg > "$ANDROID_PUBLIC/icons/apple-touch-icon-152x152.png"
rsvg-convert -w 167 -h 167 ferni-logo.svg > "$ANDROID_PUBLIC/icons/apple-touch-icon-167x167.png"

echo "  ✅ Android app updated"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ All logos updated from design system!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📍 Source of truth: design-system/assets/logos/"
echo ""
echo "Updated locations:"
echo "  • frontend-typescript/public/"
echo "  • brand/logos/"
echo "  • brand/icons/"
echo "  • brand/favicons/"
echo "  • apps/marketing/graphics/"
echo "  • apps/electron/web/"
echo "  • apps/ios/ios/App/App/public/"
echo "  • apps/android/android/app/src/main/assets/public/"
echo ""
echo "🔄 Run 'npm run build' in each app to regenerate dist folders"
echo ""

