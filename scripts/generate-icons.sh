#!/bin/bash
# ============================================================================
# FERNI ICON GENERATOR
# Converts SVG icons to PNG at various sizes for App Store / Play Store
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}🎨 Ferni Icon Generator${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Check for conversion tool
CONVERTER=""
if command -v rsvg-convert &> /dev/null; then
  CONVERTER="rsvg"
  echo -e "${GREEN}✓ Using rsvg-convert${NC}"
elif command -v inkscape &> /dev/null; then
  CONVERTER="inkscape"
  echo -e "${GREEN}✓ Using Inkscape${NC}"
elif command -v convert &> /dev/null && convert -list format | grep -q SVG; then
  CONVERTER="imagemagick"
  echo -e "${GREEN}✓ Using ImageMagick${NC}"
else
  echo -e "${YELLOW}No SVG converter found. Installing librsvg...${NC}"
  if command -v brew &> /dev/null; then
    brew install librsvg
    CONVERTER="rsvg"
  else
    echo "Please install one of: librsvg, inkscape, or imagemagick"
    echo "  brew install librsvg"
    echo "  brew install inkscape"
    echo "  brew install imagemagick"
    exit 1
  fi
fi

# Function to convert SVG to PNG
convert_svg() {
  local input="$1"
  local output="$2"
  local size="$3"
  
  case $CONVERTER in
    rsvg)
      rsvg-convert -w "$size" -h "$size" "$input" -o "$output"
      ;;
    inkscape)
      inkscape "$input" -w "$size" -h "$size" -o "$output" 2>/dev/null
      ;;
    imagemagick)
      convert -background none -density 300 -resize "${size}x${size}" "$input" "$output"
      ;;
  esac
}

# Create output directories
mkdir -p brand/icons/png
mkdir -p frontend-typescript/public/icons

echo ""
echo "Generating PNG icons..."

# ============================================================================
# APP ICONS (for App Store / Play Store)
# ============================================================================

echo ""
echo -e "${CYAN}App Store / Play Store Icons${NC}"

# iOS App Icons
SIZES_IOS="20 29 40 58 60 76 80 87 120 152 167 180 1024"
for size in $SIZES_IOS; do
  echo -n "  iOS ${size}x${size}... "
  convert_svg "brand/icons/app-icon-1024.svg" "brand/icons/png/ios-${size}.png" "$size"
  echo -e "${GREEN}✓${NC}"
done

# Android App Icons
SIZES_ANDROID="36 48 72 96 144 192 512"
for size in $SIZES_ANDROID; do
  echo -n "  Android ${size}x${size}... "
  convert_svg "brand/icons/app-icon-android.svg" "brand/icons/png/android-${size}.png" "$size"
  echo -e "${GREEN}✓${NC}"
done

# ============================================================================
# WEB ICONS (for PWA / Favicons)
# ============================================================================

echo ""
echo -e "${CYAN}Web / PWA Icons${NC}"

# Favicons
echo -n "  favicon-16x16.png... "
convert_svg "brand/favicons/favicon-16.svg" "frontend-typescript/public/icons/favicon-16x16.png" "16"
echo -e "${GREEN}✓${NC}"

echo -n "  favicon-32x32.png... "
convert_svg "brand/favicons/favicon-32.svg" "frontend-typescript/public/icons/favicon-32x32.png" "32"
echo -e "${GREEN}✓${NC}"

# Apple Touch Icons
for size in 120 152 167 180; do
  echo -n "  apple-touch-icon-${size}x${size}.png... "
  convert_svg "frontend-typescript/public/icons/apple-touch-icon.svg" "frontend-typescript/public/icons/apple-touch-icon-${size}x${size}.png" "$size"
  echo -e "${GREEN}✓${NC}"
done

echo -n "  apple-touch-icon.png (180)... "
convert_svg "frontend-typescript/public/icons/apple-touch-icon.svg" "frontend-typescript/public/icons/apple-touch-icon.png" "180"
echo -e "${GREEN}✓${NC}"

# Android Chrome / PWA
echo -n "  android-chrome-192x192.png... "
convert_svg "frontend-typescript/public/icons/android-chrome-192.svg" "frontend-typescript/public/icons/android-chrome-192x192.png" "192"
echo -e "${GREEN}✓${NC}"

echo -n "  android-chrome-512x512.png... "
convert_svg "frontend-typescript/public/icons/android-chrome-512.svg" "frontend-typescript/public/icons/android-chrome-512x512.png" "512"
echo -e "${GREEN}✓${NC}"

# Maskable icons
echo -n "  maskable-icon-192x192.png... "
convert_svg "frontend-typescript/public/icons/maskable-icon.svg" "frontend-typescript/public/icons/maskable-icon-192x192.png" "192"
echo -e "${GREEN}✓${NC}"

echo -n "  maskable-icon-512x512.png... "
convert_svg "frontend-typescript/public/icons/maskable-icon.svg" "frontend-typescript/public/icons/maskable-icon-512x512.png" "512"
echo -e "${GREEN}✓${NC}"

# Microsoft Tile
echo -n "  mstile-150x150.png... "
convert_svg "frontend-typescript/public/icons/mstile-150.svg" "frontend-typescript/public/icons/mstile-150x150.png" "150"
echo -e "${GREEN}✓${NC}"

# General icons
echo -n "  icon-256x256.png... "
convert_svg "frontend-typescript/public/icons/icon-base.svg" "frontend-typescript/public/icons/icon-256x256.png" "256"
echo -e "${GREEN}✓${NC}"

echo -n "  icon-512x512.png... "
convert_svg "frontend-typescript/public/icons/icon-base.svg" "frontend-typescript/public/icons/icon-512x512.png" "512"
echo -e "${GREEN}✓${NC}"

echo -n "  icon-1024x1024.png... "
convert_svg "frontend-typescript/public/icons/icon-1024.svg" "frontend-typescript/public/icons/icon-1024x1024.png" "1024"
echo -e "${GREEN}✓${NC}"

# OG Image (1200x630 - not square)
echo -n "  og-image.png (1200x630)... "
if [ "$CONVERTER" = "rsvg" ]; then
  rsvg-convert -w 1200 -h 630 "frontend-typescript/public/icons/og-image.svg" -o "frontend-typescript/public/icons/og-image.png"
elif [ "$CONVERTER" = "inkscape" ]; then
  inkscape "frontend-typescript/public/icons/og-image.svg" -w 1200 -h 630 -o "frontend-typescript/public/icons/og-image.png" 2>/dev/null
else
  convert -background "#F5F1E8" -density 300 -resize "1200x630!" "frontend-typescript/public/icons/og-image.svg" "frontend-typescript/public/icons/og-image.png"
fi
echo -e "${GREEN}✓${NC}"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo -e "${GREEN}✅ Icon generation complete!${NC}"
echo ""
echo "Generated icons:"
echo "  App Store (iOS):    brand/icons/png/ios-*.png"
echo "  Play Store (Android): brand/icons/png/android-*.png"
echo "  Web/PWA:            frontend-typescript/public/icons/*.png"
echo ""
echo "Next steps:"
echo "  1. Upload iOS icons to App Store Connect"
echo "  2. Upload Android icons to Google Play Console"
echo "  3. Deploy frontend: ./scripts/deploy-ui.sh"
echo ""

