#!/bin/bash

# ============================================================================
# Generate App Store Marketing Assets
# 
# Creates properly sized assets for iOS App Store, Google Play, and social
# from existing generated images.
# ============================================================================

set -e

echo "🎨 Voice AI - App Store Asset Generator"
echo "========================================"
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Source directories
GENERATED_DIR="promo/ferni-website/images/generated"
BRAND_ICONS="brand/icons/png"

# Output directories
OUTPUT_DIR="apps/marketing"
GRAPHICS_DIR="$OUTPUT_DIR/graphics"
SOCIAL_DIR="$OUTPUT_DIR/social"

mkdir -p "$GRAPHICS_DIR" "$SOCIAL_DIR"

# ============================================================================
# FEATURE GRAPHIC (Google Play - 1024x500)
# ============================================================================
echo "📐 Creating Google Play Feature Graphic (1024x500)..."

HERO_SOURCE="$GENERATED_DIR/hero/hero-meadow.jpg"
if [ -f "$HERO_SOURCE" ]; then
  # Crop and resize hero image to 1024x500
  convert "$HERO_SOURCE" \
    -resize 1024x500^ \
    -gravity center \
    -extent 1024x500 \
    -quality 95 \
    "$GRAPHICS_DIR/feature-graphic-1024x500.jpg"
  echo "  ✅ feature-graphic-1024x500.jpg"
  
  # Add text overlay version
  convert "$GRAPHICS_DIR/feature-graphic-1024x500.jpg" \
    -fill 'rgba(0,0,0,0.3)' \
    -draw 'rectangle 0,0,1024,500' \
    -font Helvetica-Bold \
    -pointsize 72 \
    -fill white \
    -gravity center \
    -annotate +0-50 'Voice AI' \
    -pointsize 32 \
    -annotate +0+50 'Your AI Life Coach' \
    -quality 95 \
    "$GRAPHICS_DIR/feature-graphic-with-text.jpg"
  echo "  ✅ feature-graphic-with-text.jpg"
else
  echo "  ⚠️ Hero source not found: $HERO_SOURCE"
fi

# ============================================================================
# SOCIAL MEDIA IMAGES
# ============================================================================
echo ""
echo "📱 Creating Social Media Assets..."

OG_SOURCE="$GENERATED_DIR/social/og-image.jpg"
if [ -f "$OG_SOURCE" ]; then
  # Twitter Card (1200x628)
  convert "$OG_SOURCE" \
    -resize 1200x628^ \
    -gravity center \
    -extent 1200x628 \
    -quality 90 \
    "$SOCIAL_DIR/twitter-card-1200x628.jpg"
  echo "  ✅ twitter-card-1200x628.jpg"
  
  # Facebook/LinkedIn Share (1200x630)
  convert "$OG_SOURCE" \
    -resize 1200x630^ \
    -gravity center \
    -extent 1200x630 \
    -quality 90 \
    "$SOCIAL_DIR/facebook-share-1200x630.jpg"
  echo "  ✅ facebook-share-1200x630.jpg"
  
  # Instagram Square (1080x1080)
  convert "$OG_SOURCE" \
    -resize 1080x1080^ \
    -gravity center \
    -extent 1080x1080 \
    -quality 90 \
    "$SOCIAL_DIR/instagram-square-1080.jpg"
  echo "  ✅ instagram-square-1080.jpg"
  
  # LinkedIn Banner (1584x396)
  convert "$OG_SOURCE" \
    -resize 1584x396^ \
    -gravity center \
    -extent 1584x396 \
    -quality 90 \
    "$SOCIAL_DIR/linkedin-banner-1584x396.jpg"
  echo "  ✅ linkedin-banner-1584x396.jpg"
else
  echo "  ⚠️ OG source not found: $OG_SOURCE"
fi

# ============================================================================
# WINDOWS STORE TILES
# ============================================================================
echo ""
echo "🪟 Creating Windows Store Assets..."

ICON_SOURCE="$BRAND_ICONS/ios-1024.png"
if [ -f "$ICON_SOURCE" ]; then
  mkdir -p "$GRAPHICS_DIR/windows"
  
  # Store Logo (300x300)
  convert "$ICON_SOURCE" -resize 300x300 "$GRAPHICS_DIR/windows/store-logo-300.png"
  echo "  ✅ store-logo-300.png"
  
  # Square 150x150
  convert "$ICON_SOURCE" -resize 150x150 "$GRAPHICS_DIR/windows/square-150.png"
  echo "  ✅ square-150.png"
  
  # Square 44x44
  convert "$ICON_SOURCE" -resize 44x44 "$GRAPHICS_DIR/windows/square-44.png"
  echo "  ✅ square-44.png"
  
  # Wide 310x150 (with padding)
  convert "$ICON_SOURCE" \
    -resize 150x150 \
    -background '#0d0d1a' \
    -gravity center \
    -extent 310x150 \
    "$GRAPHICS_DIR/windows/wide-310x150.png"
  echo "  ✅ wide-310x150.png"
else
  echo "  ⚠️ Icon source not found: $ICON_SOURCE"
fi

# ============================================================================
# APP STORE PROMOTIONAL IMAGES
# ============================================================================
echo ""
echo "🍎 Creating App Store Promotional Assets..."

mkdir -p "$GRAPHICS_DIR/appstore"

# Use hero images for promotional banners
for hero in "$GENERATED_DIR"/hero/hero-*.jpg; do
  if [ -f "$hero" ]; then
    basename=$(basename "$hero" .jpg)
    
    # App Store Banner (2208x1242 - iPhone 5.5")
    convert "$hero" \
      -resize 2208x1242^ \
      -gravity center \
      -extent 2208x1242 \
      -quality 95 \
      "$GRAPHICS_DIR/appstore/${basename}-banner.jpg"
  fi
done
echo "  ✅ Created app store banners from hero images"

# ============================================================================
# AVATAR SHOWCASE
# ============================================================================
echo ""
echo "👥 Creating Avatar Showcase..."

mkdir -p "$GRAPHICS_DIR/avatars"

# Copy team avatar
TEAM_AVATAR="$GENERATED_DIR/avatars/avatar-team.png"
if [ -f "$TEAM_AVATAR" ]; then
  cp "$TEAM_AVATAR" "$GRAPHICS_DIR/avatars/team-showcase.png"
  
  # Create 16:9 version for video backgrounds
  convert "$TEAM_AVATAR" \
    -resize 1920x1080^ \
    -gravity center \
    -extent 1920x1080 \
    -quality 95 \
    "$GRAPHICS_DIR/avatars/team-showcase-1920x1080.jpg"
  echo "  ✅ team-showcase images"
fi

# Create individual avatar sprites at standard sizes
for avatar in "$GENERATED_DIR"/avatars/avatar-*.png; do
  if [ -f "$avatar" ] && [[ ! "$avatar" == *"-v"* ]] && [[ ! "$avatar" == *"team"* ]]; then
    basename=$(basename "$avatar" .png)
    
    # 256x256 for app
    convert "$avatar" -resize 256x256 "$GRAPHICS_DIR/avatars/${basename}-256.png"
    
    # 128x128 for thumbnails
    convert "$avatar" -resize 128x128 "$GRAPHICS_DIR/avatars/${basename}-128.png"
  fi
done
echo "  ✅ Individual avatar sizes created"

# ============================================================================
# PRESS KIT
# ============================================================================
echo ""
echo "📦 Creating Press Kit..."

PRESS_DIR="$GRAPHICS_DIR/press-kit"
mkdir -p "$PRESS_DIR"

# Copy key assets to press kit
cp "$BRAND_ICONS/ios-1024.png" "$PRESS_DIR/app-icon-1024.png" 2>/dev/null || true
cp "$GENERATED_DIR/social/og-image.jpg" "$PRESS_DIR/og-image.jpg" 2>/dev/null || true
cp "$GRAPHICS_DIR/feature-graphic-1024x500.jpg" "$PRESS_DIR/" 2>/dev/null || true
cp brand/logos/logo-primary.svg "$PRESS_DIR/" 2>/dev/null || true
cp brand/logos/logo-dark-bg.svg "$PRESS_DIR/" 2>/dev/null || true

echo "  ✅ Press kit assembled"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "========================================"
echo "✅ Asset Generation Complete!"
echo "========================================"
echo ""
echo "📁 Output locations:"
echo ""
echo "  Feature Graphic (Google Play):"
echo "    $GRAPHICS_DIR/feature-graphic-1024x500.jpg"
echo "    $GRAPHICS_DIR/feature-graphic-with-text.jpg"
echo ""
echo "  Social Media:"
echo "    $SOCIAL_DIR/twitter-card-1200x628.jpg"
echo "    $SOCIAL_DIR/facebook-share-1200x630.jpg"
echo "    $SOCIAL_DIR/instagram-square-1080.jpg"
echo "    $SOCIAL_DIR/linkedin-banner-1584x396.jpg"
echo ""
echo "  Windows Store:"
echo "    $GRAPHICS_DIR/windows/"
echo ""
echo "  App Store Banners:"
echo "    $GRAPHICS_DIR/appstore/"
echo ""
echo "  Avatars:"
echo "    $GRAPHICS_DIR/avatars/"
echo ""
echo "  Press Kit:"
echo "    $PRESS_DIR/"
echo ""
echo "📝 Still needed:"
echo "  - Screenshots (run app and capture)"
echo "  - App preview video (use Veo prompts)"

