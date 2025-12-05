#!/bin/bash

# ============================================================================
# Build Native Apps (Electron + iOS + Android)
# 
# This script builds all native app wrappers for Voice AI.
# Run from the project root: ./scripts/build-apps.sh
# ============================================================================

set -e  # Exit on any error

echo "🏗️  Voice AI Native Apps Builder"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# BUILD FRONTEND FIRST
# ============================================================================
build_frontend() {
    echo -e "${YELLOW}📦 Building frontend...${NC}"
    cd "$PROJECT_ROOT/frontend-typescript"
    npm run build
    echo -e "${GREEN}✅ Frontend built${NC}"
    echo ""
    cd "$PROJECT_ROOT"
}

# ============================================================================
# ELECTRON BUILD
# ============================================================================
build_electron() {
    echo -e "${YELLOW}🖥️  Building Electron app...${NC}"
    cd "$PROJECT_ROOT/apps/electron"
    
    # Copy frontend build to Electron web folder
    rm -rf web/* 2>/dev/null || true
    cp -r "$PROJECT_ROOT/frontend-typescript/dist/"* web/
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing Electron dependencies..."
        npm install
    fi
    
    # Determine platform and build
    case "$(uname -s)" in
        Darwin*)
            echo "Building for macOS..."
            npm run build:mac
            ;;
        Linux*)
            echo "Building for Linux..."
            npm run build:linux
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "Building for Windows..."
            npm run build:win
            ;;
        *)
            echo "Building for current platform..."
            npm run build
            ;;
    esac
    
    echo -e "${GREEN}✅ Electron build complete!${NC}"
    echo "   Output: apps/electron/dist/"
    echo ""
}

# ============================================================================
# iOS BUILD
# ============================================================================
build_ios() {
    echo -e "${YELLOW}📱 Building iOS app...${NC}"
    cd "$PROJECT_ROOT/apps/ios"
    
    # Check for macOS
    if [[ "$(uname -s)" != "Darwin" ]]; then
        echo -e "${RED}⚠️  iOS builds require macOS. Skipping...${NC}"
        return
    fi
    
    # Check for Xcode
    if ! command -v xcodebuild &> /dev/null; then
        echo -e "${RED}⚠️  Xcode not found. Install Xcode to build iOS app.${NC}"
        return
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing Capacitor dependencies..."
        npm install
    fi
    
    # Copy web assets directly (avoids pod install issues)
    echo "Copying web assets to iOS project..."
    rm -rf ios/App/App/public/* 2>/dev/null || true
    cp -r "$PROJECT_ROOT/frontend-typescript/dist/"* ios/App/App/public/
    
    echo -e "${GREEN}✅ iOS project synced!${NC}"
    echo "   Open in Xcode: cd apps/ios && npx cap open ios"
    echo "   Or run: npx cap run ios"
    echo ""
}

# ============================================================================
# ANDROID BUILD
# ============================================================================
build_android() {
    echo -e "${YELLOW}🤖 Building Android app...${NC}"
    cd "$PROJECT_ROOT/apps/android"
    
    # Check for Android Studio / ANDROID_HOME
    if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
        echo -e "${YELLOW}⚠️  ANDROID_HOME not set. Syncing only (manual build required).${NC}"
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing Capacitor dependencies..."
        npm install
    fi
    
    # Add Android platform if not exists
    if [ ! -d "android" ]; then
        echo "Adding Android platform..."
        npx cap add android
    fi
    
    # Sync web assets to Android
    echo "Syncing web assets to Android project..."
    npx cap sync android
    
    echo -e "${GREEN}✅ Android project synced!${NC}"
    echo "   Open in Android Studio: cd apps/android && npx cap open android"
    echo "   Or run: npx cap run android"
    echo ""
}

# ============================================================================
# SYNC ONLY (no native builds)
# ============================================================================
sync_all() {
    echo -e "${BLUE}🔄 Syncing web assets to all platforms...${NC}"
    
    # Electron
    echo "  → Electron..."
    rm -rf "$PROJECT_ROOT/apps/electron/web/"* 2>/dev/null || true
    cp -r "$PROJECT_ROOT/frontend-typescript/dist/"* "$PROJECT_ROOT/apps/electron/web/"
    
    # iOS
    if [[ "$(uname -s)" == "Darwin" ]]; then
        echo "  → iOS..."
        rm -rf "$PROJECT_ROOT/apps/ios/ios/App/App/public/"* 2>/dev/null || true
        cp -r "$PROJECT_ROOT/frontend-typescript/dist/"* "$PROJECT_ROOT/apps/ios/ios/App/App/public/"
    fi
    
    # Android
    if [ -d "$PROJECT_ROOT/apps/android/android" ]; then
        echo "  → Android..."
        cd "$PROJECT_ROOT/apps/android"
        npx cap sync android --no-build 2>/dev/null || npx cap copy android
    fi
    
    echo -e "${GREEN}✅ All platforms synced!${NC}"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

# Parse arguments
BUILD_ELECTRON=true
BUILD_IOS=true
BUILD_ANDROID=true
SYNC_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --electron-only)
            BUILD_IOS=false
            BUILD_ANDROID=false
            shift
            ;;
        --ios-only)
            BUILD_ELECTRON=false
            BUILD_ANDROID=false
            shift
            ;;
        --android-only)
            BUILD_ELECTRON=false
            BUILD_IOS=false
            shift
            ;;
        --mobile-only)
            BUILD_ELECTRON=false
            shift
            ;;
        --sync)
            SYNC_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: ./scripts/build-apps.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --electron-only   Build only Electron app"
            echo "  --ios-only        Build only iOS app (macOS required)"
            echo "  --android-only    Build only Android app"
            echo "  --mobile-only     Build iOS and Android only"
            echo "  --sync            Sync web assets only (no native builds)"
            echo "  --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./scripts/build-apps.sh                # Build all platforms"
            echo "  ./scripts/build-apps.sh --sync         # Just sync web assets"
            echo "  ./scripts/build-apps.sh --mobile-only  # iOS + Android only"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Always build frontend first
build_frontend

# Sync only mode
if [ "$SYNC_ONLY" = true ]; then
    sync_all
    exit 0
fi

# Run builds
if [ "$BUILD_ELECTRON" = true ]; then
    build_electron
fi

if [ "$BUILD_IOS" = true ]; then
    build_ios
fi

if [ "$BUILD_ANDROID" = true ]; then
    build_android
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "================================"
echo -e "${GREEN}🎉 Build Complete!${NC}"
echo "================================"
echo ""
echo "Next steps:"
echo ""
if [ "$BUILD_ELECTRON" = true ]; then
    echo "  🖥️  Electron (Desktop):"
    echo "     - Output: apps/electron/dist/"
    case "$(uname -s)" in
        Darwin*)
            echo "     - Test: open apps/electron/dist/mac-universal/Voice\\ AI.app"
            ;;
        *)
            echo "     - Test: Run the executable in dist/"
            ;;
    esac
    echo ""
fi
if [ "$BUILD_IOS" = true ] && [[ "$(uname -s)" == "Darwin" ]]; then
    echo "  📱 iOS:"
    echo "     - Open: cd apps/ios && npx cap open ios"
    echo "     - Run on simulator: cd apps/ios && npx cap run ios"
    echo "     - Archive in Xcode for App Store submission"
    echo ""
fi
if [ "$BUILD_ANDROID" = true ]; then
    echo "  🤖 Android:"
    echo "     - Open: cd apps/android && npx cap open android"
    echo "     - Run on emulator: cd apps/android && npx cap run android"
    echo "     - Build APK in Android Studio: Build → Generate Signed Bundle"
    echo ""
fi
