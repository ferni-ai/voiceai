#!/bin/bash
# Create a DMG installer for Ferni Voice

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
APP_NAME="Ferni Voice"
DMG_NAME="FerniVoice"
VERSION="1.0.0"

echo "📦 Creating DMG installer for $APP_NAME v$VERSION..."
echo ""

# Check if app exists
APP_PATH="$BUILD_DIR/$APP_NAME.app"
if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found at $APP_PATH"
    echo "   Run ./build.sh first"
    exit 1
fi

# Create a temporary directory for DMG contents
DMG_TEMP="$BUILD_DIR/dmg-temp"
rm -rf "$DMG_TEMP"
mkdir -p "$DMG_TEMP"

# Copy the app
echo "→ Copying app to DMG staging..."
cp -R "$APP_PATH" "$DMG_TEMP/"

# Create Applications symlink
ln -s /Applications "$DMG_TEMP/Applications"

# Create background image directory (optional)
mkdir -p "$DMG_TEMP/.background"

# Create README
cat > "$DMG_TEMP/README.txt" << EOF
Ferni Voice v$VERSION
=====================

Installation:
1. Drag "Ferni Voice" to the Applications folder
2. Open Ferni Voice from Applications
3. Grant microphone permission when prompted
4. Click the menubar icon or press Cmd+Shift+F to start

Features:
• Voice conversations with Ferni and the team
• Global hotkey (Cmd+Shift+F) works from anywhere
• Six personas: Ferni, Maya, Alex, Jordan, Peter, Nayan
• Claude Code integration via Terminal
• Cloud mode (app.ferni.ai) or local development

Support: hello@ferni.ai
Website: https://ferni.ai
EOF

# Remove old DMG if exists
DMG_PATH="$BUILD_DIR/${DMG_NAME}-${VERSION}.dmg"
rm -f "$DMG_PATH"

# Create DMG
echo "→ Creating DMG..."
if command -v create-dmg &> /dev/null; then
    # Use create-dmg if available (prettier DMG)
    create-dmg \
        --volname "$APP_NAME" \
        --volicon "$APP_PATH/Contents/Resources/AppIcon.icns" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --icon "$APP_NAME.app" 150 190 \
        --hide-extension "$APP_NAME.app" \
        --app-drop-link 450 185 \
        "$DMG_PATH" \
        "$DMG_TEMP" 2>/dev/null || {
            echo "  ⚠ create-dmg failed, falling back to hdiutil"
            hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_TEMP" -ov -format UDZO "$DMG_PATH"
        }
else
    # Fallback to basic hdiutil
    hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_TEMP" -ov -format UDZO "$DMG_PATH"
fi

# Cleanup
rm -rf "$DMG_TEMP"

# Get file size
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📦 DMG created successfully!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Location: $DMG_PATH"
echo "Size: $DMG_SIZE"
echo ""
echo "To install for testing:"
echo "  open \"$DMG_PATH\""
echo ""
echo "To notarize for distribution (requires Apple Developer account):"
echo "  ./sign-and-notarize.sh"
echo ""

