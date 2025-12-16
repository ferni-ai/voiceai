#!/bin/bash

# Ferni Configuration Updater
# Run this script after you have all your IDs and it will update your files

echo "🌿 Ferni Configuration Updater"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(dirname "$SCRIPT_DIR")"

echo "Working directory: $WEBSITE_DIR"
echo ""

# Google Analytics
echo -e "${YELLOW}1. Google Analytics${NC}"
echo "   Get your Measurement ID from: https://analytics.google.com"
echo "   It looks like: G-ABC123XYZ"
echo ""
read -p "   Enter your Google Analytics Measurement ID (or press Enter to skip): " GA_ID

if [ ! -z "$GA_ID" ]; then
    sed -i '' "s/G-XXXXXXXXXX/$GA_ID/g" "$WEBSITE_DIR/index.html"
    echo -e "   ${GREEN}✓ Updated Google Analytics ID${NC}"
else
    echo "   Skipped"
fi
echo ""

# Formspree Newsletter
echo -e "${YELLOW}2. Formspree Newsletter Form${NC}"
echo "   Create a form at: https://formspree.io/forms"
echo "   Your endpoint looks like: xabcdefg"
echo ""
read -p "   Enter your Newsletter form ID (just the ID, not full URL): " NEWSLETTER_ID

if [ ! -z "$NEWSLETTER_ID" ]; then
    sed -i '' "s/YOUR_NEWSLETTER_FORM_ID/$NEWSLETTER_ID/g" "$WEBSITE_DIR/index.html"
    echo -e "   ${GREEN}✓ Updated Newsletter form${NC}"
else
    echo "   Skipped"
fi
echo ""

# Formspree Developer
echo -e "${YELLOW}3. Formspree Developer Waitlist Form${NC}"
read -p "   Enter your Developer form ID (just the ID): " DEV_ID

if [ ! -z "$DEV_ID" ]; then
    sed -i '' "s/YOUR_FORM_ID/$DEV_ID/g" "$WEBSITE_DIR/index.html"
    echo -e "   ${GREEN}✓ Updated Developer form${NC}"
else
    echo "   Skipped"
fi
echo ""

# Social Media Handles Confirmation
echo -e "${YELLOW}4. Social Media Accounts${NC}"
echo "   Current links in footer:"
echo "   - X/Twitter: twitter.com/ferniAI"
echo "   - LinkedIn: linkedin.com/company/ferni"
echo "   - Instagram: instagram.com/ferni.ai"
echo "   - TikTok: tiktok.com/@ferni.ai"
echo "   - YouTube: youtube.com/@ferniAI"
echo ""
read -p "   Do you need to change any usernames? (y/n): " CHANGE_SOCIAL

if [ "$CHANGE_SOCIAL" = "y" ]; then
    echo ""
    read -p "   X/Twitter handle (without @, press Enter to keep ferniAI): " TWITTER
    if [ ! -z "$TWITTER" ]; then
        sed -i '' "s|twitter.com/ferniAI|twitter.com/$TWITTER|g" "$WEBSITE_DIR/index.html"
        sed -i '' "s|twitter.com/ferniAI|twitter.com/$TWITTER|g" "$WEBSITE_DIR/links.html"
        echo -e "   ${GREEN}✓ Updated Twitter handle${NC}"
    fi
    
    read -p "   Instagram handle (without @, press Enter to keep ferni.ai): " INSTA
    if [ ! -z "$INSTA" ]; then
        sed -i '' "s|instagram.com/ferni.ai|instagram.com/$INSTA|g" "$WEBSITE_DIR/index.html"
        sed -i '' "s|instagram.com/ferni.ai|instagram.com/$INSTA|g" "$WEBSITE_DIR/links.html"
        echo -e "   ${GREEN}✓ Updated Instagram handle${NC}"
    fi
    
    read -p "   TikTok handle (without @, press Enter to keep ferni.ai): " TIKTOK
    if [ ! -z "$TIKTOK" ]; then
        sed -i '' "s|tiktok.com/@ferni.ai|tiktok.com/@$TIKTOK|g" "$WEBSITE_DIR/index.html"
        sed -i '' "s|tiktok.com/@ferni.ai|tiktok.com/@$TIKTOK|g" "$WEBSITE_DIR/links.html"
        echo -e "   ${GREEN}✓ Updated TikTok handle${NC}"
    fi
    
    read -p "   YouTube handle (without @, press Enter to keep ferniAI): " YOUTUBE
    if [ ! -z "$YOUTUBE" ]; then
        sed -i '' "s|youtube.com/@ferniAI|youtube.com/@$YOUTUBE|g" "$WEBSITE_DIR/index.html"
        sed -i '' "s|youtube.com/@ferniAI|youtube.com/@$YOUTUBE|g" "$WEBSITE_DIR/links.html"
        echo -e "   ${GREEN}✓ Updated YouTube handle${NC}"
    fi
fi
echo ""

# Remove coming soon badges
echo -e "${YELLOW}5. Remove 'Coming Soon' badges from links page?${NC}"
read -p "   Have you created all social accounts? (y/n): " REMOVE_SOON

if [ "$REMOVE_SOON" = "y" ]; then
    sed -i '' 's/ coming-soon//g' "$WEBSITE_DIR/links.html"
    echo -e "   ${GREEN}✓ Removed 'Coming Soon' badges${NC}"
else
    echo "   Keeping badges for now"
fi
echo ""

echo "================================"
echo -e "${GREEN}🌿 Configuration complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Test your forms by submitting test entries"
echo "2. Check Google Analytics real-time to verify tracking"
echo "3. Deploy your updated site"
echo ""

