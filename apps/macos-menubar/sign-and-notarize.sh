#!/bin/bash
# Sign and notarize Ferni Voice for distribution
# Requires Apple Developer account and appropriate certificates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
APP_NAME="Ferni Voice"
BUNDLE_ID="com.ferni.voice"
VERSION="1.0.0"

# === CONFIGURATION ===
# Set these environment variables or edit directly:
DEVELOPER_ID="${FERNI_DEVELOPER_ID:-Developer ID Application: Your Name (TEAMID)}"
APPLE_ID="${FERNI_APPLE_ID:-your@email.com}"
APPLE_TEAM_ID="${FERNI_TEAM_ID:-XXXXXXXXXX}"
APP_PASSWORD="${FERNI_APP_PASSWORD:-xxxx-xxxx-xxxx-xxxx}"  # App-specific password from appleid.apple.com

echo "🔐 Signing and notarizing $APP_NAME v$VERSION..."
echo ""

APP_PATH="$BUILD_DIR/$APP_NAME.app"
DMG_PATH="$BUILD_DIR/FerniVoice-${VERSION}.dmg"
ENTITLEMENTS="$APP_PATH/Contents/entitlements.plist"

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found at $APP_PATH"
    echo "   Run ./build.sh first"
    exit 1
fi

# Check for signing identity
if [[ "$DEVELOPER_ID" == *"Your Name"* ]]; then
    echo "⚠️  Developer ID not configured!"
    echo ""
    echo "To sign the app, you need:"
    echo "  1. Apple Developer account ($99/year)"
    echo "  2. Developer ID Application certificate"
    echo "  3. App-specific password for notarization"
    echo ""
    echo "Set these environment variables:"
    echo "  export FERNI_DEVELOPER_ID='Developer ID Application: Your Name (TEAMID)'"
    echo "  export FERNI_APPLE_ID='your@email.com'"
    echo "  export FERNI_TEAM_ID='XXXXXXXXXX'"
    echo "  export FERNI_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx'"
    echo ""
    echo "Or edit this script directly."
    echo ""
    echo "Available signing identities:"
    security find-identity -v -p codesigning 2>/dev/null || echo "  (none found)"
    exit 1
fi

# === STEP 1: Code Sign ===
echo "→ Step 1: Code signing..."

# Sign embedded binaries first
if [ -f "$APP_PATH/Contents/Resources/ferni-voice" ]; then
    echo "  Signing embedded voice binary..."
    codesign --force --options runtime --sign "$DEVELOPER_ID" \
        --entitlements "$ENTITLEMENTS" \
        "$APP_PATH/Contents/Resources/ferni-voice"
fi

# Sign the main app
echo "  Signing main application..."
codesign --force --deep --options runtime --sign "$DEVELOPER_ID" \
    --entitlements "$ENTITLEMENTS" \
    "$APP_PATH"

# Verify signature
echo "  Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH" || {
    echo "❌ Code signing verification failed"
    exit 1
}

echo "  ✓ Code signing complete"
echo ""

# === STEP 2: Create DMG ===
echo "→ Step 2: Creating signed DMG..."
./create-dmg.sh

# Sign the DMG
echo "  Signing DMG..."
codesign --force --sign "$DEVELOPER_ID" "$DMG_PATH"

echo "  ✓ DMG signed"
echo ""

# === STEP 3: Notarize ===
echo "→ Step 3: Notarizing with Apple..."
echo "  (This may take several minutes)"

# Submit for notarization
xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APP_PASSWORD" \
    --wait

# Check notarization status
NOTARIZATION_STATUS=$?
if [ $NOTARIZATION_STATUS -ne 0 ]; then
    echo "❌ Notarization failed"
    echo "   Check the log with: xcrun notarytool log <submission-id> --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password $APP_PASSWORD"
    exit 1
fi

echo "  ✓ Notarization complete"
echo ""

# === STEP 4: Staple ===
echo "→ Step 4: Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

echo "  ✓ Stapling complete"
echo ""

# Verify everything
echo "→ Final verification..."
spctl --assess --type execute --verbose=2 "$APP_PATH" 2>&1 || true
spctl --assess --type install --verbose=2 "$DMG_PATH" 2>&1 || true

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎉 Signing and notarization complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Signed DMG: $DMG_PATH"
echo ""
echo "This DMG is now ready for distribution. Users can:"
echo "  • Download and open without Gatekeeper warnings"
echo "  • Install on any Mac running macOS 13+"
echo ""
echo "To distribute:"
echo "  1. Upload to your website or GitHub releases"
echo "  2. Update the appcast.xml for Sparkle auto-updates"
echo ""

