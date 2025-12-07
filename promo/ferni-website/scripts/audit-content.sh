#!/bin/bash
# Content Audit Script
# Checks all marketing content against brand guidelines
#
# Usage: ./scripts/audit-content.sh

set -e

WEBSITE_DIR="$(dirname "$0")/.."
cd "$WEBSITE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "\n${BLUE}🔍 Ferni Content Audit${NC}"
echo "=========================="
echo ""

# ============================================
# 1. IMAGE AUDIT
# ============================================

echo -e "${BLUE}📷 Checking Images...${NC}\n"

# Check for missing alt text in HTML
echo "  Checking for images without alt text..."
missing_alt=$(grep -rn '<img' *.html 2>/dev/null | grep -v 'alt=' | head -5 || true)
if [ -n "$missing_alt" ]; then
    echo -e "  ${RED}✗ Images missing alt text:${NC}"
    echo "$missing_alt" | while read -r line; do
        echo "    $line"
        ERRORS=$((ERRORS + 1))
    done
else
    echo -e "  ${GREEN}✓ All images have alt text${NC}"
fi

# Check for oversized images
echo ""
echo "  Checking for oversized images (>500KB)..."
find images -type f \( -name "*.jpg" -o -name "*.png" \) -size +500k 2>/dev/null | head -10 | while read -r file; do
    size=$(ls -lh "$file" | awk '{print $5}')
    echo -e "  ${YELLOW}⚠ Large: $file ($size)${NC}"
    WARNINGS=$((WARNINGS + 1))
done

# Check for missing generated assets
echo ""
echo "  Checking for required generated assets..."
required_assets=(
    "images/generated/hero/hero-zen-fallback.jpg"
    "images/generated/avatars/avatar-ferni.png"
    "images/og-image.jpg"
)

for asset in "${required_assets[@]}"; do
    if [ ! -f "$asset" ]; then
        echo -e "  ${YELLOW}⚠ Missing: $asset${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# ============================================
# 2. VIDEO AUDIT
# ============================================

echo ""
echo -e "${BLUE}🎬 Checking Videos...${NC}\n"

# Check for videos without WebM fallback
echo "  Checking for videos without WebM fallback..."
find videos -name "*.mp4" -type f 2>/dev/null | while read -r mp4; do
    webm="${mp4%.mp4}.webm"
    if [ ! -f "$webm" ]; then
        echo -e "  ${YELLOW}⚠ Missing WebM: $mp4${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# Check video file sizes
echo ""
echo "  Checking for oversized videos (>10MB)..."
find videos -type f -name "*.mp4" -size +10M 2>/dev/null | head -5 | while read -r file; do
    size=$(ls -lh "$file" | awk '{print $5}')
    echo -e "  ${YELLOW}⚠ Large: $file ($size)${NC}"
    WARNINGS=$((WARNINGS + 1))
done

# ============================================
# 3. COPY AUDIT
# ============================================

echo ""
echo -e "${BLUE}✍️ Checking Copy...${NC}\n"

# Check for corporate language (anti-patterns)
echo "  Checking for corporate language..."
corporate_words="leverage|utilize|synergy|paradigm|scalable|enterprise|revolutionary|cutting-edge"
corporate_found=$(grep -rniE "$corporate_words" *.html 2>/dev/null | grep -v "<!--" | head -5 || true)
if [ -n "$corporate_found" ]; then
    echo -e "  ${YELLOW}⚠ Corporate language found:${NC}"
    echo "$corporate_found" | while read -r line; do
        echo "    $line"
        WARNINGS=$((WARNINGS + 1))
    done
else
    echo -e "  ${GREEN}✓ No corporate language detected${NC}"
fi

# Check for "user" instead of "you"
echo ""
echo "  Checking for impersonal language (user vs you)..."
user_found=$(grep -rni '\buser\b' *.html 2>/dev/null | grep -v "user-select" | grep -v "<!--" | head -3 || true)
if [ -n "$user_found" ]; then
    echo -e "  ${YELLOW}⚠ Consider 'you/your' instead of 'user':${NC}"
    echo "$user_found" | while read -r line; do
        echo "    $line"
    done
fi

# ============================================
# 4. BRAND COLOR AUDIT
# ============================================

echo ""
echo -e "${BLUE}🎨 Checking Brand Colors...${NC}\n"

# Check for purple (not a brand color)
echo "  Checking for non-brand colors (purple)..."
purple_found=$(grep -rniE "purple|violet|#800080|#9b59b6" css/*.css 2>/dev/null | head -3 || true)
if [ -n "$purple_found" ]; then
    echo -e "  ${RED}✗ Non-brand color (purple) found:${NC}"
    echo "$purple_found" | while read -r line; do
        echo "    $line"
        ERRORS=$((ERRORS + 1))
    done
else
    echo -e "  ${GREEN}✓ No purple colors found${NC}"
fi

# Run the design linter
echo ""
echo "  Running design token linter..."
if ./scripts/lint-design.sh > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Design tokens pass${NC}"
else
    echo -e "  ${YELLOW}⚠ Design token warnings (run: npm run lint:design)${NC}"
fi

# ============================================
# 5. LINK AUDIT
# ============================================

echo ""
echo -e "${BLUE}🔗 Checking Links...${NC}\n"

# Check for broken internal links
echo "  Checking internal links..."
internal_links=$(grep -rohE 'href="[^"]*"' *.html 2>/dev/null | grep -v 'http' | grep -v '#' | grep -v 'mailto' | grep -v 'tel' | sort -u | head -20)
broken_count=0
for link in $internal_links; do
    file=$(echo "$link" | sed 's/href="//;s/"//')
    if [ -n "$file" ] && [ ! -f "$file" ] && [ ! -f "${file}.html" ] && [ ! -d "$file" ]; then
        echo -e "  ${YELLOW}⚠ Potentially broken: $file${NC}"
        broken_count=$((broken_count + 1))
    fi
done
if [ $broken_count -eq 0 ]; then
    echo -e "  ${GREEN}✓ No broken internal links detected${NC}"
fi

# Check for UTM tracking on external links
echo ""
echo "  Checking for UTM tracking on external links..."
external_no_utm=$(grep -rohE 'href="https?://[^"]*"' *.html 2>/dev/null | grep -v 'utm_' | grep -v 'fonts.google' | grep -v 'fonts.gstatic' | head -5 || true)
if [ -n "$external_no_utm" ]; then
    echo -e "  ${YELLOW}⚠ External links without UTM tracking:${NC}"
    echo "$external_no_utm" | head -3 | while read -r link; do
        echo "    $link"
    done
fi

# ============================================
# 6. SEO AUDIT
# ============================================

echo ""
echo -e "${BLUE}🔍 Checking SEO...${NC}\n"

# Check for missing meta descriptions
echo "  Checking for meta descriptions..."
for file in *.html; do
    if ! grep -q 'name="description"' "$file" 2>/dev/null; then
        echo -e "  ${YELLOW}⚠ Missing meta description: $file${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# Check for missing Open Graph tags
echo ""
echo "  Checking for Open Graph tags..."
for file in *.html; do
    if ! grep -q 'og:title' "$file" 2>/dev/null; then
        echo -e "  ${YELLOW}⚠ Missing OG tags: $file${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# ============================================
# SUMMARY
# ============================================

echo ""
echo "=========================="
echo "Summary:"

if [ $ERRORS -gt 0 ]; then
    echo -e "  ${RED}✗ $ERRORS errors${NC} (must fix)"
fi
if [ $WARNINGS -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ $WARNINGS warnings${NC} (should fix)"
fi
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All checks passed!${NC}"
fi

echo ""

# Exit with error if any errors found
if [ $ERRORS -gt 0 ]; then
    exit 1
fi

exit 0

