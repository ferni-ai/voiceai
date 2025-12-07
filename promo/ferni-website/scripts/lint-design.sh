#!/bin/bash
# Ferni Website Design Linter
# Checks for hardcoded values that should use design tokens
#
# Usage: ./scripts/lint-design.sh
# Add to CI: npm run lint:design

set -e

WEBSITE_DIR="$(dirname "$0")/.."
CSS_DIR="$WEBSITE_DIR/css"
SRC_CSS="$WEBSITE_DIR/src/css"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "🎨 Ferni Design System Linter"
echo "=============================="
echo ""

# Function to check files
check_css_files() {
    local dir="$1"
    local label="$2"
    
    if [ ! -d "$dir" ]; then
        return
    fi
    
    echo "Checking $label..."
    echo ""
    
    # Skip design-tokens.css (it's the source of truth)
    for file in "$dir"/*.css; do
        [ -e "$file" ] || continue
        
        filename=$(basename "$file")
        
        # Skip token files
        if [[ "$filename" == "design-tokens.css" ]] || [[ "$filename" == "tokens.css" ]]; then
            continue
        fi
        
        echo "  📄 $filename"
        
        # Check for hardcoded hex colors (but allow in var() fallbacks)
        hardcoded_colors=$(grep -nE "#[0-9a-fA-F]{3,6}" "$file" 2>/dev/null | grep -v "var(" | grep -v "filter:" | grep -v "url(" || true)
        if [ -n "$hardcoded_colors" ]; then
            echo -e "    ${RED}✗ Hardcoded colors found:${NC}"
            echo "$hardcoded_colors" | head -5 | while read -r line; do
                echo "      $line"
            done
            count=$(echo "$hardcoded_colors" | wc -l | tr -d ' ')
            if [ "$count" -gt 5 ]; then
                echo "      ... and $((count - 5)) more"
            fi
            ERRORS=$((ERRORS + count))
        fi
        
        # Check for hardcoded rgba colors
        hardcoded_rgba=$(grep -nE "rgba\([0-9]" "$file" 2>/dev/null | grep -v "var(" || true)
        if [ -n "$hardcoded_rgba" ]; then
            echo -e "    ${YELLOW}⚠ Hardcoded rgba() values:${NC}"
            echo "$hardcoded_rgba" | head -3 | while read -r line; do
                echo "      $line"
            done
            count=$(echo "$hardcoded_rgba" | wc -l | tr -d ' ')
            WARNINGS=$((WARNINGS + count))
        fi
        
        # Check for hardcoded font-sizes (but allow line-height numbers)
        hardcoded_fonts=$(grep -nE "font-size:\s*[0-9]+" "$file" 2>/dev/null | grep -v "var(" || true)
        if [ -n "$hardcoded_fonts" ]; then
            echo -e "    ${RED}✗ Hardcoded font-sizes:${NC}"
            echo "$hardcoded_fonts" | head -3 | while read -r line; do
                echo "      $line"
            done
            count=$(echo "$hardcoded_fonts" | wc -l | tr -d ' ')
            ERRORS=$((ERRORS + count))
        fi
        
        # Check for hardcoded spacing (padding/margin with px)
        hardcoded_spacing=$(grep -nE "(padding|margin|gap):\s*[0-9]+px" "$file" 2>/dev/null | grep -v "var(" | grep -v "@media" || true)
        if [ -n "$hardcoded_spacing" ]; then
            echo -e "    ${YELLOW}⚠ Hardcoded spacing (consider tokens):${NC}"
            echo "$hardcoded_spacing" | head -3 | while read -r line; do
                echo "      $line"
            done
            count=$(echo "$hardcoded_spacing" | wc -l | tr -d ' ')
            WARNINGS=$((WARNINGS + count))
        fi
        
        # Check for hardcoded border-radius
        hardcoded_radius=$(grep -nE "border-radius:\s*[0-9]+px" "$file" 2>/dev/null | grep -v "var(" | grep -v "50%" || true)
        if [ -n "$hardcoded_radius" ]; then
            echo -e "    ${YELLOW}⚠ Hardcoded border-radius:${NC}"
            echo "$hardcoded_radius" | head -3 | while read -r line; do
                echo "      $line"
            done
            count=$(echo "$hardcoded_radius" | wc -l | tr -d ' ')
            WARNINGS=$((WARNINGS + count))
        fi
        
        echo ""
    done
}

# Check main css directory
check_css_files "$CSS_DIR" "css/"

# Check src/css directory (Eleventy source)
check_css_files "$SRC_CSS" "src/css/"

# Summary
echo "=============================="
echo "Summary:"
if [ $ERRORS -gt 0 ]; then
    echo -e "  ${RED}✗ $ERRORS errors${NC} (hardcoded colors/fonts - should fix)"
fi
if [ $WARNINGS -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ $WARNINGS warnings${NC} (hardcoded spacing/rgba - consider fixing)"
fi
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All clean!${NC} No hardcoded values found."
fi
echo ""

# Token reference
if [ $ERRORS -gt 0 ] || [ $WARNINGS -gt 0 ]; then
    echo "Quick Reference - Use These Instead:"
    echo "  Colors:  var(--color-accent), var(--color-bg-primary), etc."
    echo "  Fonts:   var(--text-display-hero), var(--text-body-md), etc."
    echo "  Spacing: var(--space-4), var(--space-8), etc."
    echo "  Radius:  var(--radius-sm), var(--radius-lg), etc."
    echo ""
    echo "See: brand/ferni-design-tokens.css for full token list"
    echo ""
fi

# Exit with error if any errors found
if [ $ERRORS -gt 0 ]; then
    exit 1
fi

exit 0

