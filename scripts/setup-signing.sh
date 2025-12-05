#!/bin/bash

# ============================================================================
# Code Signing Setup Helper
# 
# Interactive script to help set up code signing for all platforms.
# Run from project root: ./scripts/setup-signing.sh
# ============================================================================

set -e

echo "🔐 Voice AI - Code Signing Setup"
echo "================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# MENU
# ============================================================================
show_menu() {
    echo "What would you like to set up?"
    echo ""
    echo "  1) macOS Code Signing"
    echo "  2) Windows Code Signing"
    echo "  3) iOS Code Signing"
    echo "  4) Android Keystore"
    echo "  5) GitHub Actions Secrets"
    echo "  6) Verify Existing Setup"
    echo "  0) Exit"
    echo ""
    read -p "Enter choice [0-6]: " choice
}

# ============================================================================
# macOS SETUP
# ============================================================================
setup_macos() {
    echo ""
    echo -e "${BLUE}🍎 macOS Code Signing Setup${NC}"
    echo "=============================="
    echo ""
    
    echo "Prerequisites:"
    echo "  • Apple Developer account (\$99/year)"
    echo "  • Developer ID Application certificate"
    echo "  • App-specific password for notarization"
    echo ""
    
    # Check for existing certificate
    echo "Checking for Developer ID certificates..."
    if security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
        echo -e "${GREEN}✓ Developer ID certificate found${NC}"
        security find-identity -v -p codesigning | grep "Developer ID Application"
    else
        echo -e "${YELLOW}⚠ No Developer ID certificate found${NC}"
        echo ""
        echo "To create one:"
        echo "  1. Go to https://developer.apple.com/account/resources/certificates"
        echo "  2. Create 'Developer ID Application' certificate"
        echo "  3. Download and install in Keychain"
    fi
    echo ""
    
    # Create .env.signing file
    read -p "Create/update .env.signing file? [y/N] " create_env
    if [[ "$create_env" =~ ^[Yy]$ ]]; then
        echo ""
        read -p "Path to .p12 certificate file: " cert_path
        read -sp "Certificate password: " cert_password
        echo ""
        read -p "Apple ID email: " apple_id
        read -sp "App-specific password: " app_password
        echo ""
        read -p "Team ID (10 chars): " team_id
        
        cat > apps/electron/.env.signing << EOF
# macOS Code Signing - DO NOT COMMIT
CSC_LINK=$cert_path
CSC_KEY_PASSWORD=$cert_password

# Apple Notarization
APPLE_ID=$apple_id
APPLE_APP_SPECIFIC_PASSWORD=$app_password
APPLE_TEAM_ID=$team_id
EOF
        
        echo -e "${GREEN}✓ Created apps/electron/.env.signing${NC}"
        echo ""
        echo "To build signed app:"
        echo "  cd apps/electron"
        echo "  source .env.signing"
        echo "  npm run build:mac"
    fi
}

# ============================================================================
# WINDOWS SETUP
# ============================================================================
setup_windows() {
    echo ""
    echo -e "${BLUE}🪟 Windows Code Signing Setup${NC}"
    echo "==============================="
    echo ""
    
    echo "You'll need a code signing certificate from:"
    echo "  • DigiCert (EV - recommended) - ~\$475/year"
    echo "  • Sectigo (EV) - ~\$400/year"
    echo "  • SSL.com (Standard) - ~\$139/year"
    echo ""
    echo "EV certificates provide instant SmartScreen trust."
    echo "Standard certificates build trust over time."
    echo ""
    echo "Once you have a certificate (.pfx file):"
    echo ""
    echo "Windows (PowerShell):"
    echo '  $env:CSC_LINK = "C:\path\to\certificate.pfx"'
    echo '  $env:CSC_KEY_PASSWORD = "your-password"'
    echo "  cd apps\\electron"
    echo "  npm run build:win"
    echo ""
    echo "macOS/Linux (cross-compile):"
    echo "  export CSC_LINK=/path/to/certificate.pfx"
    echo "  export CSC_KEY_PASSWORD=your-password"
    echo "  cd apps/electron"
    echo "  npm run build:win"
}

# ============================================================================
# iOS SETUP
# ============================================================================
setup_ios() {
    echo ""
    echo -e "${BLUE}📱 iOS Code Signing Setup${NC}"
    echo "=========================="
    echo ""
    
    echo "Prerequisites:"
    echo "  • Apple Developer account (\$99/year)"
    echo "  • Xcode installed"
    echo ""
    
    # Check for Xcode
    if command -v xcodebuild &> /dev/null; then
        echo -e "${GREEN}✓ Xcode found${NC}"
        xcodebuild -version | head -1
    else
        echo -e "${RED}✗ Xcode not found${NC}"
        echo "Install from App Store or https://developer.apple.com/xcode/"
        return
    fi
    echo ""
    
    echo "Steps to set up iOS signing:"
    echo ""
    echo "1. Open the project in Xcode:"
    echo "   cd apps/ios && npx cap open ios"
    echo ""
    echo "2. In Xcode:"
    echo "   • Select the 'App' target"
    echo "   • Go to 'Signing & Capabilities'"
    echo "   • Enable 'Automatically manage signing'"
    echo "   • Select your Team"
    echo ""
    echo "3. For App Store distribution:"
    echo "   • Product → Archive"
    echo "   • Distribute App → App Store Connect"
    echo ""
    
    read -p "Open iOS project in Xcode now? [y/N] " open_xcode
    if [[ "$open_xcode" =~ ^[Yy]$ ]]; then
        cd apps/ios && npx cap open ios
    fi
}

# ============================================================================
# ANDROID SETUP
# ============================================================================
setup_android() {
    echo ""
    echo -e "${BLUE}🤖 Android Keystore Setup${NC}"
    echo "=========================="
    echo ""
    
    KEYSTORE_DIR="$PROJECT_ROOT/apps/android"
    KEYSTORE_FILE="$KEYSTORE_DIR/voiceai-release.keystore"
    
    if [ -f "$KEYSTORE_FILE" ]; then
        echo -e "${YELLOW}⚠ Keystore already exists at:${NC}"
        echo "  $KEYSTORE_FILE"
        echo ""
        read -p "Generate a new keystore? (will overwrite) [y/N] " regenerate
        if [[ ! "$regenerate" =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    echo "Generating new release keystore..."
    echo ""
    
    # Generate keystore
    keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias voiceai \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000
    
    echo ""
    echo -e "${GREEN}✓ Keystore created at:${NC}"
    echo "  $KEYSTORE_FILE"
    echo ""
    
    # Create key.properties
    echo "Now let's create the key.properties file..."
    echo ""
    read -sp "Enter keystore password (same as above): " store_pass
    echo ""
    read -sp "Enter key password (same as above if you used the same): " key_pass
    echo ""
    
    cat > "$PROJECT_ROOT/apps/android/android/key.properties" << EOF
storePassword=$store_pass
keyPassword=$key_pass
keyAlias=voiceai
storeFile=../voiceai-release.keystore
EOF
    
    echo ""
    echo -e "${GREEN}✓ Created key.properties${NC}"
    echo ""
    echo -e "${RED}⚠️  IMPORTANT: Back up your keystore file!${NC}"
    echo "If you lose it, you cannot update your app on Play Store."
    echo ""
    echo "Recommended backup locations:"
    echo "  • Password manager (1Password, Bitwarden)"
    echo "  • Encrypted cloud storage"
    echo "  • Secure offline backup"
    echo ""
    echo "To build signed APK:"
    echo "  cd apps/android/android"
    echo "  ./gradlew assembleRelease"
}

# ============================================================================
# GITHUB SECRETS
# ============================================================================
setup_github() {
    echo ""
    echo -e "${BLUE}🔑 GitHub Actions Secrets${NC}"
    echo "=========================="
    echo ""
    
    echo "Add these secrets to your GitHub repository:"
    echo "Settings → Secrets and variables → Actions → New repository secret"
    echo ""
    
    echo "macOS Signing:"
    echo "  APPLE_CERTIFICATE_P12_BASE64  - base64-encoded .p12 file"
    echo "  APPLE_CERTIFICATE_PASSWORD    - certificate password"
    echo "  APPLE_ID                      - your Apple ID email"
    echo "  APPLE_APP_SPECIFIC_PASSWORD   - app-specific password"
    echo "  APPLE_TEAM_ID                 - your team ID"
    echo ""
    
    echo "Windows Signing:"
    echo "  WINDOWS_CERTIFICATE_P12_BASE64 - base64-encoded .pfx file"
    echo "  WINDOWS_CERTIFICATE_PASSWORD   - certificate password"
    echo ""
    
    echo "Android Signing:"
    echo "  ANDROID_KEYSTORE_BASE64       - base64-encoded .keystore file"
    echo "  ANDROID_KEYSTORE_PASSWORD     - keystore password"
    echo "  ANDROID_KEY_ALIAS             - key alias (voiceai)"
    echo "  ANDROID_KEY_PASSWORD          - key password"
    echo ""
    
    echo "To encode a file to base64:"
    echo "  base64 -i yourfile.p12 | tr -d '\\n' > encoded.txt"
    echo ""
    
    read -p "Generate base64 encodings for existing files? [y/N] " encode_files
    if [[ "$encode_files" =~ ^[Yy]$ ]]; then
        echo ""
        
        # macOS certificate
        if [ -f "apps/electron/.env.signing" ]; then
            source apps/electron/.env.signing
            if [ -f "$CSC_LINK" ]; then
                echo "Encoding macOS certificate..."
                base64 -i "$CSC_LINK" | tr -d '\n' > /tmp/apple_cert_base64.txt
                echo -e "${GREEN}✓ Saved to /tmp/apple_cert_base64.txt${NC}"
            fi
        fi
        
        # Android keystore
        if [ -f "apps/android/voiceai-release.keystore" ]; then
            echo "Encoding Android keystore..."
            base64 -i "apps/android/voiceai-release.keystore" | tr -d '\n' > /tmp/android_keystore_base64.txt
            echo -e "${GREEN}✓ Saved to /tmp/android_keystore_base64.txt${NC}"
        fi
        
        echo ""
        echo "Copy the contents of these files to GitHub Secrets."
        echo "Delete the temporary files when done!"
    fi
}

# ============================================================================
# VERIFY SETUP
# ============================================================================
verify_setup() {
    echo ""
    echo -e "${BLUE}🔍 Verifying Code Signing Setup${NC}"
    echo "================================="
    echo ""
    
    # macOS
    echo "macOS:"
    if security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
        echo -e "  ${GREEN}✓ Developer ID certificate installed${NC}"
    else
        echo -e "  ${RED}✗ No Developer ID certificate${NC}"
    fi
    
    if [ -f "apps/electron/.env.signing" ]; then
        echo -e "  ${GREEN}✓ .env.signing exists${NC}"
    else
        echo -e "  ${YELLOW}○ .env.signing not found${NC}"
    fi
    echo ""
    
    # iOS
    echo "iOS:"
    if command -v xcodebuild &> /dev/null; then
        echo -e "  ${GREEN}✓ Xcode installed${NC}"
    else
        echo -e "  ${RED}✗ Xcode not installed${NC}"
    fi
    echo ""
    
    # Android
    echo "Android:"
    if [ -f "apps/android/voiceai-release.keystore" ]; then
        echo -e "  ${GREEN}✓ Release keystore exists${NC}"
    else
        echo -e "  ${YELLOW}○ Release keystore not found${NC}"
    fi
    
    if [ -f "apps/android/android/key.properties" ]; then
        echo -e "  ${GREEN}✓ key.properties exists${NC}"
    else
        echo -e "  ${YELLOW}○ key.properties not found${NC}"
    fi
    echo ""
    
    # GitHub workflow
    echo "CI/CD:"
    if [ -f ".github/workflows/build-apps.yml" ]; then
        echo -e "  ${GREEN}✓ GitHub Actions workflow exists${NC}"
    else
        echo -e "  ${YELLOW}○ GitHub Actions workflow not found${NC}"
    fi
}

# ============================================================================
# MAIN LOOP
# ============================================================================
while true; do
    show_menu
    case $choice in
        1) setup_macos ;;
        2) setup_windows ;;
        3) setup_ios ;;
        4) setup_android ;;
        5) setup_github ;;
        6) verify_setup ;;
        0) 
            echo ""
            echo "See apps/CODE_SIGNING.md for detailed documentation."
            echo ""
            exit 0
            ;;
        *) echo "Invalid option" ;;
    esac
    echo ""
    read -p "Press Enter to continue..."
    clear
done

