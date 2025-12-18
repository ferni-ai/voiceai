#!/bin/bash
set -e

echo "🔨 Building Ferni Voice macOS app..."
cd /Users/sethford/Documents/voiceai/apps/macos-menubar

# Build
swift build 2>&1

echo ""
echo "📦 Creating app bundle..."
./build.sh 2>&1

echo ""
echo "🚀 Launching app..."
# Kill any existing instance
pkill -f FerniVoice 2>/dev/null || true
sleep 1

# Launch the app
open ".build/Ferni Voice.app"
sleep 2

# Check if running
if pgrep -q FerniVoice; then
    echo "✅ Ferni Voice is running!"
    echo ""
    echo "📋 Test Checklist:"
    echo "  1. Look for 🎙️ icon in menubar"
    echo "  2. Click the icon to start a voice session"
    echo "  3. Avatar should show initials (FN) not an eye"
    echo "  4. Aurora edge should animate around the window"
    echo "  5. Say 'Hi Ferni' to test voice"
    echo "  6. Right-click menubar for menu options"
else
    echo "❌ App failed to launch"
    exit 1
fi

