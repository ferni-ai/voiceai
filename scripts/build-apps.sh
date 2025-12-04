#!/bin/bash

# =============================================================================
# Voice AI - Build Native Apps
# =============================================================================
# 
# This script builds all native application packages.
# Run from the project root: ./scripts/build-apps.sh
#
# Options:
#   --electron    Build only Electron (desktop)
#   --ios         Build only iOS (requires macOS + Xcode)
#   --all         Build all platforms (default)
# =============================================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
BUILD_ELECTRON=false
BUILD_IOS=false

if [[ "$1" == "--electron" ]]; then
    BUILD_ELECTRON=true
elif [[ "$1" == "--ios" ]]; then
    BUILD_IOS=true
else
    BUILD_ELECTRON=true
    BUILD_IOS=true
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Voice AI Native App Builder${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# =============================================================================
# Step 1: Build Frontend
# =============================================================================
echo -e "${YELLOW}→ Building frontend...${NC}"
cd "$ROOT_DIR/frontend-typescript"

if [ ! -d "node_modules" ]; then
    echo "  Installing frontend dependencies..."
    npm install
fi

npm run build
echo -e "${GREEN}✓ Frontend built successfully${NC}"
echo ""

# =============================================================================
# Step 2: Build Electron (Desktop)
# =============================================================================
if [ "$BUILD_ELECTRON" = true ]; then
    echo -e "${YELLOW}→ Building Electron desktop app...${NC}"
    cd "$ROOT_DIR/apps/electron"
    
    if [ ! -d "node_modules" ]; then
        echo "  Installing Electron dependencies..."
        npm install
    fi
    
    # Create web directory and copy frontend
    mkdir -p web
    cp -r "$ROOT_DIR/frontend-typescript/dist/"* web/
    
    # Copy design system assets
    if [ -d "$ROOT_DIR/design-system/dist" ]; then
        mkdir -p web/design-system
        cp -r "$ROOT_DIR/design-system/dist/"* web/design-system/
    fi
    
    echo "  Building for current platform..."
    npm run build
    
    echo -e "${GREEN}✓ Electron app built - check apps/electron/dist/${NC}"
    echo ""
fi

# =============================================================================
# Step 3: Build iOS (Capacitor)
# =============================================================================
if [ "$BUILD_IOS" = true ]; then
    # Check if we're on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${YELLOW}→ Building iOS app...${NC}"
        cd "$ROOT_DIR/apps/ios"
        
        if [ ! -d "node_modules" ]; then
            echo "  Installing iOS dependencies..."
            npm install
        fi
        
        # Initialize Capacitor iOS project if needed
        if [ ! -d "ios" ]; then
            echo "  Initializing Capacitor iOS project..."
            npx cap add ios
        fi
        
        # Sync web assets to iOS
        echo "  Syncing to iOS..."
        npx cap sync ios
        
        echo -e "${GREEN}✓ iOS project synced - run 'npm run open' in apps/ios to open Xcode${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠ Skipping iOS build (requires macOS)${NC}"
        echo ""
    fi
fi

# =============================================================================
# Summary
# =============================================================================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Built apps:"

if [ "$BUILD_ELECTRON" = true ]; then
    echo "  • Electron: apps/electron/dist/"
fi

if [ "$BUILD_IOS" = true ] && [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  • iOS: apps/ios/ios/ (open with Xcode)"
fi

echo ""
echo "Next steps:"
echo "  Electron: cd apps/electron && npm start"
echo "  iOS: cd apps/ios && npm run open"

