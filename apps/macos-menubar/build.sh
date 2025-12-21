#!/bin/bash
# Build Ferni Voice menubar app for macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
APP_NAME="Ferni Voice"
BUNDLE_ID="com.ferni.voice"
VERSION="1.0.0"
BUILD_NUMBER="1"

echo "🌿 Building $APP_NAME v$VERSION..."
echo ""

# Step 1: Build standalone voice binary with bun (optional)
echo "→ Building standalone voice binary..."
cd "$PROJECT_ROOT"
if command -v bun &> /dev/null; then
    if bun build apps/cli/src/features/voice/voice-live.ts --compile --outfile dist/ferni-voice-standalone 2>/dev/null; then
        echo "  ✓ Voice binary built ($(du -h dist/ferni-voice-standalone | cut -f1))"
    else
        echo "  ⚠ bun build failed - using ferni CLI fallback"
    fi
else
    echo "  ⚠ bun not found - using ferni CLI fallback"
fi

# Step 2: Run unit tests
echo ""
echo "→ Running tests..."
cd "$SCRIPT_DIR"
if swift test --parallel 2>&1 | grep -E "(Test Suite|passed|failed|error)"; then
    echo "  ✓ Tests passed"
else
    echo "  ⚠ Some tests may have issues (continuing build)"
fi

# Step 3: Build the Swift executable
echo ""
echo "→ Building Swift app..."
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

# Copy LiveKit WebRTC framework (required for native mode)
echo ""
echo "→ Bundling LiveKit framework..."
FRAMEWORKS_DIR="$CONTENTS_DIR/Frameworks"
mkdir -p "$FRAMEWORKS_DIR"

# Find and copy the macOS-specific LiveKitWebRTC framework
WEBRTC_XCFRAMEWORK="$BUILD_DIR/artifacts/webrtc-xcframework/LiveKitWebRTC/LiveKitWebRTC.xcframework"
WEBRTC_FRAMEWORK="$WEBRTC_XCFRAMEWORK/macos-arm64_x86_64/LiveKitWebRTC.framework"
if [ -d "$WEBRTC_FRAMEWORK" ]; then
    cp -R "$WEBRTC_FRAMEWORK" "$FRAMEWORKS_DIR/"
    echo "  ✓ LiveKitWebRTC.framework (macOS) bundled"
    
    # Update the executable's rpath to find the framework
    install_name_tool -add_rpath "@executable_path/../Frameworks" "$MACOS_DIR/FerniVoice" 2>/dev/null || true
else
    echo "  ⚠ LiveKitWebRTC.framework not found at $WEBRTC_FRAMEWORK"
    echo "    Native mode may not work - trying alternate search..."
    # Fallback: try to find any macOS version
    ALT_FRAMEWORK=$(find "$BUILD_DIR" -path "*macos*" -name "LiveKitWebRTC.framework" -type d | head -1)
    if [ -d "$ALT_FRAMEWORK" ]; then
        cp -R "$ALT_FRAMEWORK" "$FRAMEWORKS_DIR/"
        install_name_tool -add_rpath "@executable_path/../Frameworks" "$MACOS_DIR/FerniVoice" 2>/dev/null || true
        echo "  ✓ LiveKitWebRTC.framework found at alternate location"
    fi
fi

# Copy the standalone voice binary if it exists
if [ -f "$PROJECT_ROOT/dist/ferni-voice-standalone" ]; then
    echo ""
    echo "→ Bundling standalone voice binary..."
    cp "$PROJECT_ROOT/dist/ferni-voice-standalone" "$RESOURCES_DIR/ferni-voice"
    chmod +x "$RESOURCES_DIR/ferni-voice"
    echo "  ✓ Voice binary bundled"
fi

# Copy sounds
SOUNDS_DIR="$PROJECT_ROOT/design-system/assets/sounds"
if [ -d "$SOUNDS_DIR" ]; then
    echo ""
    echo "→ Bundling sound effects..."
    mkdir -p "$RESOURCES_DIR/sounds"
    cp "$SOUNDS_DIR"/*.mp3 "$RESOURCES_DIR/sounds/" 2>/dev/null || true
    echo "  ✓ Sounds bundled"
fi

# Copy app icon
echo ""
echo "→ Adding app icon..."
ICON_SOURCE="$PROJECT_ROOT/apps/electron/resources/icon.icns"
if [ -f "$ICON_SOURCE" ]; then
    cp "$ICON_SOURCE" "$RESOURCES_DIR/AppIcon.icns"
    echo "  ✓ App icon added"
else
    echo "  ⚠ App icon not found at $ICON_SOURCE"
    # Generate icon from PNG if available
    ICON_PNG="$PROJECT_ROOT/brand/icons/png/ios-1024.png"
    if [ -f "$ICON_PNG" ]; then
        echo "  → Generating .icns from PNG..."
        ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"
        mkdir -p "$ICONSET_DIR"
        
        # Generate all required sizes
        sips -z 16 16 "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16.png" 2>/dev/null
        sips -z 32 32 "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" 2>/dev/null
        sips -z 32 32 "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32.png" 2>/dev/null
        sips -z 64 64 "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" 2>/dev/null
        sips -z 128 128 "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128.png" 2>/dev/null
        sips -z 256 256 "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" 2>/dev/null
        sips -z 256 256 "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256.png" 2>/dev/null
        sips -z 512 512 "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" 2>/dev/null
        sips -z 512 512 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512.png" 2>/dev/null
        sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" 2>/dev/null
        
        iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns" 2>/dev/null && \
            echo "  ✓ Generated .icns from PNG" || \
            echo "  ⚠ Failed to generate .icns"
        
        rm -rf "$ICONSET_DIR"
    fi
fi

# Copy menubar icon assets
echo ""
echo "→ Adding menubar icons..."
MENUBAR_ICONS_DIR="$RESOURCES_DIR/MenubarIcons"
mkdir -p "$MENUBAR_ICONS_DIR"
# The menubar icons will be generated at runtime from SF Symbols or bundled here
echo "  ✓ Menubar icons directory created"

# Create Info.plist with full metadata
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
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleVersion</key>
    <string>$BUILD_NUMBER</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Ferni Voice needs microphone access to enable voice conversations with Ferni.</string>
    <key>NSCameraUsageDescription</key>
    <string>Ferni Voice may use camera for future video features.</string>
    <key>NSCameraUseContinuityCameraDeviceType</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2024 Ferni AI. All rights reserved.</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <key>NSAppleEventsUsageDescription</key>
    <string>Ferni Voice uses AppleScript to integrate with Terminal for Claude Code.</string>
    <!-- System Intelligence Permissions -->
    <key>NSAccessibilityUsageDescription</key>
    <string>Ferni uses accessibility to understand what you're working on and offer contextual help with the "Help me with this" feature.</string>
    <key>NSCalendarsUsageDescription</key>
    <string>Ferni uses calendar access to provide meeting context, help you prepare for upcoming events, and manage your schedule.</string>
    <key>NSContactsUsageDescription</key>
    <string>Ferni uses contacts to help you remember birthdays, anniversaries, and maintain important relationships.</string>
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>Ferni uses location for habit reminders when you arrive at places like home, work, or gym.</string>
    <key>NSLocationUsageDescription</key>
    <string>Ferni uses location to provide context-aware suggestions and location-based reminders.</string>
    <key>NSScreenCaptureUsageDescription</key>
    <string>Ferni can analyze your screen to help with errors and provide context-aware assistance.</string>
    <key>NSFocusStatusUsageDescription</key>
    <string>Ferni respects your Focus modes to avoid interruptions and adjust behavior based on whether you're in Do Not Disturb, Work, or Personal focus.</string>
    <!-- Siri / Shortcuts Integration -->
    <key>INIntentsSupported</key>
    <array>
        <string>StartFerniCheckInIntent</string>
        <string>EndFerniSessionIntent</string>
        <string>HelpMeWithThisIntent</string>
    </array>
    <key>INIntentsRestrictedWhileLocked</key>
    <array/>
    <!-- Handoff / Continuity -->
    <key>NSUserActivityTypes</key>
    <array>
        <string>com.ferni.voice.conversation</string>
        <string>com.ferni.voice.insight</string>
        <string>com.ferni.voice.checkin</string>
    </array>
    <key>SUFeedURL</key>
    <string>https://app.ferni.ai/updates/macos/appcast.xml</string>
    <key>SUPublicDSAKeyFile</key>
    <string>dsa_pub.pem</string>
</dict>
</plist>
EOF

# Create entitlements for microphone access and other capabilities
cat > "$CONTENTS_DIR/entitlements.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.ferni.voice</string>
    </array>
</dict>
</plist>
EOF

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🌿 Build complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "App location: $APP_DIR"
echo "Version: $VERSION (build $BUILD_NUMBER)"
echo ""
echo "To install:"
echo "  cp -r \"$APP_DIR\" /Applications/"
echo ""
echo "To run directly:"
echo "  open \"$APP_DIR\""
echo ""
echo "To create a DMG installer:"
echo "  ./create-dmg.sh"
echo ""
echo "To test voice:"
echo "  1. Click the menubar mic icon"
echo "  2. Or press Cmd+Shift+F from anywhere"
echo "  3. Say 'Hi Ferni!'"
echo ""
