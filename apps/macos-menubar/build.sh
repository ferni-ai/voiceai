#!/bin/bash
# Build Ferni Voice menubar app for macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
APP_NAME="Ferni Voice"
BUNDLE_ID="com.ferni.voice"

echo "Building $APP_NAME..."

# Step 1: Build standalone voice binary with bun
echo "→ Building standalone voice binary..."
cd "$PROJECT_ROOT"
if command -v bun &> /dev/null; then
    bun build apps/cli/src/features/voice/voice-live.ts --compile --outfile dist/ferni-voice-standalone
    echo "  ✓ Voice binary built ($(du -h dist/ferni-voice-standalone | cut -f1))"
else
    echo "  ⚠ bun not found - using existing binary or ferni CLI fallback"
fi

# Step 2: Build the Swift executable
echo "→ Building Swift app..."
cd "$SCRIPT_DIR"
swift build -c release

# Create the .app bundle structure
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# Copy the executable
cp "$BUILD_DIR/release/FerniVoice" "$MACOS_DIR/FerniVoice"

# Copy the standalone voice binary if it exists
if [ -f "$PROJECT_ROOT/dist/ferni-voice-standalone" ]; then
    echo "→ Bundling standalone voice binary..."
    cp "$PROJECT_ROOT/dist/ferni-voice-standalone" "$RESOURCES_DIR/ferni-voice"
    chmod +x "$RESOURCES_DIR/ferni-voice"
    echo "  ✓ Voice binary bundled"
fi

# Copy sounds
SOUNDS_DIR="$PROJECT_ROOT/design-system/assets/sounds"
if [ -d "$SOUNDS_DIR" ]; then
    echo "→ Bundling sound effects..."
    mkdir -p "$RESOURCES_DIR/sounds"
    cp "$SOUNDS_DIR"/*.mp3 "$RESOURCES_DIR/sounds/" 2>/dev/null || true
    echo "  ✓ Sounds bundled"
fi

# Create Info.plist
cat > "$CONTENTS_DIR/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>FerniVoice</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Ferni Voice needs microphone access to enable voice conversations with Ferni.</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# Create entitlements for microphone access
cat > "$CONTENTS_DIR/entitlements.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.app-sandbox</key>
    <false/>
</dict>
</plist>
EOF

echo ""
echo "Build complete!"
echo ""
echo "App location: $APP_DIR"
echo ""
echo "To install:"
echo "  1. cp -r \"$APP_DIR\" /Applications/"
echo "  2. Open from Applications or Spotlight"
echo ""
echo "To run directly:"
echo "  open \"$APP_DIR\""
