#!/bin/bash
# Add UTM tracking to external app.ferni.ai links
# Usage: ./scripts/add-utm.sh

echo "🔗 Adding UTM tracking to external links..."

# Define UTM parameters
UTM_SOURCE="ferni_website"
UTM_MEDIUM="web"

# Files to process (exclude _site which is generated)
HTML_FILES=$(find . -name "*.html" -not -path "./_site/*" -not -path "./node_modules/*")

for file in $HTML_FILES; do
    filename=$(basename "$file")
    
    # Different campaigns based on file type
    if [[ "$filename" == "index.html" ]]; then
        UTM_CAMPAIGN="homepage"
    elif [[ "$filename" == "pricing.html" ]]; then
        UTM_CAMPAIGN="pricing"
    elif [[ "$filename" == "team.html" ]]; then
        UTM_CAMPAIGN="team"
    elif [[ "$filename" == "contact.html" ]]; then
        UTM_CAMPAIGN="contact"
    else
        UTM_CAMPAIGN="website"
    fi
    
    # Replace href="https://app.ferni.ai" with UTM-tracked version
    # But only if it doesn't already have UTM parameters
    if grep -q 'href="https://app.ferni.ai"' "$file" 2>/dev/null; then
        echo "  Processing: $file"
        
        # macOS sed requires different syntax
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|href=\"https://app.ferni.ai\"|href=\"https://app.ferni.ai?utm_source=${UTM_SOURCE}\&utm_medium=${UTM_MEDIUM}\&utm_campaign=${UTM_CAMPAIGN}\"|g" "$file"
        else
            sed -i "s|href=\"https://app.ferni.ai\"|href=\"https://app.ferni.ai?utm_source=${UTM_SOURCE}\&utm_medium=${UTM_MEDIUM}\&utm_campaign=${UTM_CAMPAIGN}\"|g" "$file"
        fi
    fi
done

echo ""
echo "✅ UTM tracking added!"
echo ""
echo "Links now include:"
echo "  utm_source=ferni_website"
echo "  utm_medium=web"
echo "  utm_campaign=[page-specific]"

