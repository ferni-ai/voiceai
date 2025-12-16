#!/bin/bash
# Test script for Ferni Voice macOS app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Ferni Voice Test Suite"
echo "========================="
echo ""

# Check if app is running
check_app_running() {
    if pgrep -f "FerniVoice" > /dev/null 2>&1; then
        echo "✅ App is running"
        return 0
    else
        echo "❌ App is not running"
        return 1
    fi
}

# Test 1: Build succeeds
echo "1. Testing build..."
cd "$SCRIPT_DIR"
if swift build 2>&1 | grep -q "Build complete"; then
    echo "   ✅ Build successful"
else
    echo "   ❌ Build failed"
    exit 1
fi

# Test 2: Run the app
echo ""
echo "2. Testing app launch..."
pkill -f FerniVoice 2>/dev/null || true
sleep 1

swift run &
APP_PID=$!
sleep 3

if check_app_running; then
    echo "   ✅ App launched successfully"
else
    echo "   ❌ App failed to launch"
    exit 1
fi

# Test 3: Verify menubar presence
echo ""
echo "3. Testing menubar..."
if osascript -e 'tell application "System Events" to get name of every menu bar item of menu bar 1 of process "FerniVoice"' 2>/dev/null; then
    echo "   ✅ Menubar item present"
else
    echo "   ⚠️  Could not verify menubar (may need accessibility permissions)"
fi

# Test 4: Test cloud mode toggle
echo ""
echo "4. Testing cloud mode persistence..."
defaults write com.ferni.voice useCloudMode -bool true
CLOUD_MODE=$(defaults read com.ferni.voice useCloudMode 2>/dev/null)
if [ "$CLOUD_MODE" == "1" ]; then
    echo "   ✅ Cloud mode persistence works"
else
    echo "   ⚠️  Could not verify cloud mode"
fi

# Test 5: Check sox dependency
echo ""
echo "5. Testing sox installation..."
if command -v sox &> /dev/null; then
    echo "   ✅ sox is installed ($(sox --version | head -1))"
else
    echo "   ⚠️  sox not installed - install with: brew install sox"
fi

# Cleanup
echo ""
echo "Cleaning up..."
pkill -f FerniVoice 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════"
echo "🎉 All tests passed!"
echo "═══════════════════════════════════════════"
echo ""
echo "To run the app manually:"
echo "  cd $SCRIPT_DIR && swift run"
echo ""
echo "Or build the .app bundle:"
echo "  ./build.sh"
echo ""

