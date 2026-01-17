#!/bin/bash
# Ferni App Store Screenshot Capture Script
#
# This script captures screenshots for all required device sizes
# using Xcode's simctl and xcrun commands.
#
# Prerequisites:
# 1. Xcode installed with simulators
# 2. App built and installed on simulators
# 3. fastlane (optional, for more advanced capture)
#
# Usage: ./capture-screenshots.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════"
echo "📸 Ferni App Store Screenshot Capture"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Create output directory
OUTPUT_DIR="./Screenshots/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}Output directory: $OUTPUT_DIR${NC}"
echo ""

# Device configurations for App Store
# Format: "Simulator Name" "Screenshot Size" "Output Prefix"
declare -a DEVICES=(
    "iPhone 15 Pro Max:1290x2796:iphone-6.7"
    "iPhone 15 Pro:1179x2556:iphone-6.1"
    "iPhone 14 Plus:1284x2778:iphone-6.7-alt"
    "iPhone SE (3rd generation):750x1334:iphone-4.7"
    "iPad Pro (12.9-inch) (6th generation):2048x2732:ipad-12.9"
    "iPad Pro (11-inch) (4th generation):1668x2388:ipad-11"
)

# Screenshot scenarios to capture
declare -a SCENARIOS=(
    "01_welcome:Welcome screen with Ferni"
    "02_conversation:Active voice conversation"
    "03_persona_grid:Team persona selection"
    "04_maya_habits:Maya habit coaching"
    "05_insights:Wellness insights"
)

echo "📱 Available Simulators:"
xcrun simctl list devices available | grep -E "iPhone|iPad" | head -20
echo ""

# Function to capture screenshot
capture_screenshot() {
    local simulator_name="$1"
    local output_name="$2"
    local scenario="$3"

    # Get simulator UDID
    local udid=$(xcrun simctl list devices | grep "$simulator_name" | grep -v "unavailable" | head -1 | sed -E 's/.*\(([A-Z0-9-]+)\).*/\1/')

    if [ -z "$udid" ]; then
        echo -e "${YELLOW}⚠️  Simulator not found: $simulator_name${NC}"
        return 1
    fi

    # Boot simulator if needed
    local state=$(xcrun simctl list devices | grep "$udid" | grep -o "(Booted)" || true)
    if [ -z "$state" ]; then
        echo "  Booting $simulator_name..."
        xcrun simctl boot "$udid" 2>/dev/null || true
        sleep 3
    fi

    # Capture screenshot
    local filename="${OUTPUT_DIR}/${output_name}_${scenario}.png"
    xcrun simctl io "$udid" screenshot "$filename"
    echo -e "${GREEN}  ✓ Captured: $filename${NC}"
}

# Function to show manual capture instructions
show_manual_instructions() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "📋 MANUAL SCREENSHOT CAPTURE GUIDE"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "For best results, manually capture these screens:"
    echo ""
    echo "REQUIRED SCREENSHOTS (minimum 3, maximum 10 per device):"
    echo ""
    echo "1️⃣  WELCOME/HERO SHOT"
    echo "   - Show Ferni's avatar prominently"
    echo "   - Clean, inviting first impression"
    echo ""
    echo "2️⃣  VOICE CONVERSATION"
    echo "   - Active call with Ferni"
    echo "   - Waveform animation visible"
    echo "   - Show a warm, engaging exchange"
    echo ""
    echo "3️⃣  PERSONA SELECTION"
    echo "   - Team grid showing all personas"
    echo "   - Highlight the variety of support"
    echo ""
    echo "4️⃣  HABIT COACHING (Maya)"
    echo "   - Show habit tracking or coaching UI"
    echo "   - Demonstrate practical value"
    echo ""
    echo "5️⃣  INSIGHTS/WELLNESS"
    echo "   - Health or mood insights"
    echo "   - Show data visualization"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "DEVICE SIZES NEEDED:"
    echo ""
    echo "📱 iPhone 6.7\" (Required)  - 1290 × 2796 px"
    echo "   Use: iPhone 15 Pro Max or iPhone 14 Plus"
    echo ""
    echo "📱 iPhone 6.5\" (Required)  - 1242 × 2688 px"
    echo "   Use: iPhone 11 Pro Max"
    echo ""
    echo "📱 iPhone 5.5\" (Optional)  - 1242 × 2208 px"
    echo "   Use: iPhone 8 Plus"
    echo ""
    echo "📱 iPad 12.9\" (If supporting iPad) - 2048 × 2732 px"
    echo "   Use: iPad Pro 12.9\""
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "CAPTURE TIPS:"
    echo ""
    echo "• Use Simulator: File → Save Screen (⌘S)"
    echo "• Or use: xcrun simctl io booted screenshot output.png"
    echo "• Remove status bar: Settings → Developer → Status Bar Override"
    echo "• Use clean demo data"
    echo "• Ensure 9:41 AM time (Apple standard)"
    echo "• Full battery, strong signal indicators"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

# Main execution
echo "Choose capture method:"
echo "  1) Automatic capture (requires running simulators)"
echo "  2) Show manual instructions"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
    1)
        echo ""
        echo "Starting automatic capture..."
        echo "Note: You'll need to manually navigate to each screen in the simulator"
        echo ""

        for device_config in "${DEVICES[@]}"; do
            IFS=':' read -r device_name resolution prefix <<< "$device_config"
            echo ""
            echo "📱 Capturing for: $device_name ($resolution)"

            for scenario_config in "${SCENARIOS[@]}"; do
                IFS=':' read -r scenario_id scenario_name <<< "$scenario_config"
                echo "  📸 $scenario_name"
                read -p "     Press Enter when ready to capture (or 's' to skip): " input

                if [ "$input" != "s" ]; then
                    capture_screenshot "$device_name" "$prefix" "$scenario_id"
                fi
            done
        done

        echo ""
        echo -e "${GREEN}✅ Screenshots saved to: $OUTPUT_DIR${NC}"
        ;;
    2)
        show_manual_instructions
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📦 UPLOAD TO APP STORE CONNECT"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "1. Go to App Store Connect → Your App → App Store → Screenshots"
echo "2. Upload screenshots for each device size"
echo "3. Arrange in desired order (first = most prominent)"
echo "4. Add optional preview videos (15-30 seconds)"
echo ""
echo "Done! 🎉"
