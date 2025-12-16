#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Ferni Image Optimization Script
# ═══════════════════════════════════════════════════════════════════════════
# Optimizes images for web:
# - Converts large PNGs to WebP
# - Compresses JPGs
# - Creates responsive sizes
# - Reports savings
#
# Requirements: imagemagick, cwebp (brew install imagemagick webp)
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="$PROJECT_DIR/images"
SRC_IMAGES_DIR="$PROJECT_DIR/src/images"

echo "🖼️  Ferni Image Optimization"
echo "=============================="
echo ""

# Check for required tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "⚠️  $1 not found. Install with: brew install $2"
        return 1
    fi
    return 0
}

MISSING_TOOLS=0
check_tool "convert" "imagemagick" || MISSING_TOOLS=1
check_tool "cwebp" "webp" || MISSING_TOOLS=1

if [ $MISSING_TOOLS -eq 1 ]; then
    echo ""
    echo "Install missing tools and try again."
    exit 1
fi

# Track savings
TOTAL_BEFORE=0
TOTAL_AFTER=0

# Function to optimize a single image
optimize_image() {
    local file="$1"
    local filename=$(basename "$file")
    local extension="${filename##*.}"
    local basename="${filename%.*}"
    local dir=$(dirname "$file")
    
    # Get original size
    local original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    local original_kb=$((original_size / 1024))
    
    # Skip if already small
    if [ $original_kb -lt 100 ]; then
        return 0
    fi
    
    TOTAL_BEFORE=$((TOTAL_BEFORE + original_size))
    
    echo "  📷 $filename (${original_kb}KB)"
    
    case "$extension" in
        png|PNG)
            # Convert large PNGs to WebP
            if [ $original_kb -gt 500 ]; then
                local webp_file="$dir/$basename.webp"
                cwebp -q 85 "$file" -o "$webp_file" 2>/dev/null
                
                if [ -f "$webp_file" ]; then
                    local new_size=$(stat -f%z "$webp_file" 2>/dev/null || stat -c%s "$webp_file" 2>/dev/null)
                    local new_kb=$((new_size / 1024))
                    local savings=$((original_kb - new_kb))
                    echo "     → WebP: ${new_kb}KB (saved ${savings}KB)"
                    TOTAL_AFTER=$((TOTAL_AFTER + new_size))
                fi
            else
                # Just optimize PNG
                convert "$file" -strip -quality 85 "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file"
                local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
                TOTAL_AFTER=$((TOTAL_AFTER + new_size))
            fi
            ;;
        jpg|jpeg|JPG|JPEG)
            # Compress JPGs
            convert "$file" -strip -quality 85 -sampling-factor 4:2:0 "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file"
            local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
            local new_kb=$((new_size / 1024))
            local savings=$((original_kb - new_kb))
            if [ $savings -gt 10 ]; then
                echo "     → Compressed: ${new_kb}KB (saved ${savings}KB)"
            fi
            TOTAL_AFTER=$((TOTAL_AFTER + new_size))
            ;;
    esac
}

# Function to create responsive sizes
create_responsive() {
    local file="$1"
    local filename=$(basename "$file")
    local extension="${filename##*.}"
    local basename="${filename%.*}"
    local dir=$(dirname "$file")
    
    # Only for hero/feature images
    if [[ "$file" != *"hero"* ]] && [[ "$file" != *"feature"* ]]; then
        return 0
    fi
    
    echo "  📐 Creating responsive sizes for $filename"
    
    # Create sizes: 640, 1024, 1920
    for width in 640 1024 1920; do
        local outfile="$dir/${basename}-${width}w.$extension"
        if [ ! -f "$outfile" ]; then
            convert "$file" -resize "${width}x>" -quality 85 "$outfile" 2>/dev/null
            echo "     → ${width}w created"
        fi
    done
}

echo "🔍 Finding large images..."
echo ""

# Process images in both directories
for dir in "$IMAGES_DIR" "$SRC_IMAGES_DIR"; do
    if [ -d "$dir" ]; then
        echo "📁 Processing: $dir"
        
        # Find large images (> 500KB)
        find "$dir" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.PNG" -o -name "*.JPG" \) -size +500k 2>/dev/null | while read file; do
            optimize_image "$file"
        done
        
        echo ""
    fi
done

# Summary
if [ $TOTAL_BEFORE -gt 0 ]; then
    BEFORE_MB=$((TOTAL_BEFORE / 1024 / 1024))
    AFTER_MB=$((TOTAL_AFTER / 1024 / 1024))
    SAVINGS_MB=$((BEFORE_MB - AFTER_MB))
    PERCENT=$((100 - (TOTAL_AFTER * 100 / TOTAL_BEFORE)))
    
    echo "=============================="
    echo "📊 Summary"
    echo "  Before: ${BEFORE_MB}MB"
    echo "  After:  ${AFTER_MB}MB"
    echo "  Saved:  ${SAVINGS_MB}MB (${PERCENT}%)"
else
    echo "✅ No large images need optimization"
fi

echo ""
echo "💡 Tips:"
echo "  - Use WebP format with PNG fallback in HTML:"
echo "    <picture>"
echo "      <source srcset=\"image.webp\" type=\"image/webp\">"
echo "      <img src=\"image.png\" alt=\"...\">"
echo "    </picture>"
echo ""
echo "  - Use responsive images:"
echo "    <img srcset=\"image-640w.jpg 640w,"
echo "                 image-1024w.jpg 1024w,"
echo "                 image-1920w.jpg 1920w\""
echo "         sizes=\"(max-width: 640px) 640px, 100vw\""
echo "         src=\"image-1024w.jpg\">"
