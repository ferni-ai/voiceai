#!/bin/bash

# =============================================================================
# Voice AI - Setup App Icons
# =============================================================================
# 
# Copies and generates icons for native apps from the brand assets.
# Run from the project root: ./scripts/setup-app-icons.sh
#
# Requirements:
#   - ImageMagick (brew install imagemagick) - for icon generation
#   - Existing brand assets in brand/icons/
# =============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Voice AI App Icon Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

BRAND_ICONS="$ROOT_DIR/brand/icons"
BRAND_PNG="$ROOT_DIR/brand/icons/png"

# =============================================================================
# Electron Icons
# =============================================================================
echo -e "${YELLOW}→ Setting up Electron icons...${NC}"
ELECTRON_RESOURCES="$ROOT_DIR/apps/electron/resources"

mkdir -p "$ELECTRON_RESOURCES"

# Copy PNG for Linux/fallback
if [ -f "$BRAND_PNG/ios-1024.png" ]; then
    cp "$BRAND_PNG/ios-1024.png" "$ELECTRON_RESOURCES/icon.png"
    echo "  ✓ Copied icon.png (1024x1024)"
fi

# Generate macOS icns if ImageMagick is available
if command -v convert &> /dev/null; then
    echo "  Generating macOS .icns..."
    ICONSET="$ELECTRON_RESOURCES/icon.iconset"
    mkdir -p "$ICONSET"
    
    # Generate all required sizes for macOS
    convert "$BRAND_PNG/ios-1024.png" -resize 16x16 "$ICONSET/icon_16x16.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 32x32 "$ICONSET/icon_16x16@2x.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 32x32 "$ICONSET/icon_32x32.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 64x64 "$ICONSET/icon_32x32@2x.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 128x128 "$ICONSET/icon_128x128.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 256x256 "$ICONSET/icon_128x128@2x.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 256x256 "$ICONSET/icon_256x256.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 512x512 "$ICONSET/icon_256x256@2x.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 512x512 "$ICONSET/icon_512x512.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 1024x1024 "$ICONSET/icon_512x512@2x.png"
    
    # Create icns file (macOS only)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        iconutil -c icns "$ICONSET" -o "$ELECTRON_RESOURCES/icon.icns"
        echo "  ✓ Generated icon.icns"
    else
        echo "  ⚠ Skipping .icns generation (requires macOS)"
    fi
    
    rm -rf "$ICONSET"
    
    # Generate Windows ico
    echo "  Generating Windows .ico..."
    convert "$BRAND_PNG/ios-1024.png" \
        -define icon:auto-resize=256,128,96,64,48,32,16 \
        "$ELECTRON_RESOURCES/icon.ico"
    echo "  ✓ Generated icon.ico"
    
    # Generate tray icon (smaller, template for macOS)
    convert "$BRAND_PNG/ios-1024.png" -resize 22x22 "$ELECTRON_RESOURCES/trayTemplate.png"
    convert "$BRAND_PNG/ios-1024.png" -resize 44x44 "$ELECTRON_RESOURCES/trayTemplate@2x.png"
    echo "  ✓ Generated tray icons"
    
else
    echo -e "${YELLOW}  ⚠ ImageMagick not found. Install with: brew install imagemagick${NC}"
    echo "  Only basic icons will be available."
fi

echo -e "${GREEN}✓ Electron icons ready${NC}"
echo ""

# =============================================================================
# iOS Icons (Capacitor)
# =============================================================================
echo -e "${YELLOW}→ Setting up iOS icons...${NC}"

# iOS icons will be set up when running 'cap add ios'
# But we can create a reference file for the required sizes
IOS_DIR="$ROOT_DIR/apps/ios"

cat > "$IOS_DIR/ICONS.md" << 'EOF'
# iOS App Icons

When you run `npx cap add ios`, Capacitor creates an Xcode project.
You'll need to add app icons in Xcode's asset catalog.

## Required Icon Sizes

| Size | Scale | Filename |
|------|-------|----------|
| 20pt | @2x | 40x40 |
| 20pt | @3x | 60x60 |
| 29pt | @2x | 58x58 |
| 29pt | @3x | 87x87 |
| 40pt | @2x | 80x80 |
| 40pt | @3x | 120x120 |
| 60pt | @2x | 120x120 |
| 60pt | @3x | 180x180 |
| 1024pt | @1x | 1024x1024 (App Store) |

## Source Icons

Pre-generated icons are available in:
- `brand/icons/png/ios-*.png`

## Adding Icons

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select Assets.xcassets
3. Select AppIcon
4. Drag icons from brand/icons/png/ to the appropriate slots

Or use a tool like:
- [App Icon Generator](https://appicon.co/)
- [Icon Set Creator](https://apps.apple.com/app/icon-set-creator/id939343785)
EOF

echo "  ✓ Created ICONS.md reference"
echo -e "${GREEN}✓ iOS icon reference ready${NC}"
echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Icon Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Generated icons:"
echo "  • Electron: apps/electron/resources/"
echo "  • iOS: See apps/ios/ICONS.md for instructions"
echo ""
echo "Existing brand icons:"
echo "  • iOS PNGs: brand/icons/png/ios-*.png"
echo "  • Android PNGs: brand/icons/png/android-*.png"
echo "  • SVG sources: brand/icons/*.svg"

