#!/bin/bash
# Publish Ferni Design System packages
# Usage: ./scripts/publish-design-system.sh [package]
# Examples:
#   ./scripts/publish-design-system.sh react     # Publish @ferni/react to npm
#   ./scripts/publish-design-system.sh vscode    # Publish VS Code extension
#   ./scripts/publish-design-system.sh all       # Publish everything

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🎨 Ferni Design System Publisher${NC}\n"

publish_react() {
  echo -e "${YELLOW}Publishing @ferni/react to npm...${NC}"
  cd packages/ferni-react
  
  # Build
  pnpm build
  
  # Check if logged in to npm
  if ! npm whoami &>/dev/null; then
    echo "Please log in to npm first: npm login"
    exit 1
  fi
  
  # Publish
  pnpm publish --access public
  
  echo -e "${GREEN}✓ @ferni/react published!${NC}"
  cd "$ROOT_DIR"
}

publish_vscode() {
  echo -e "${YELLOW}Packaging VS Code extension...${NC}"
  cd apps/vscode-extension
  
  # Build
  pnpm build
  
  # Package
  pnpm run package
  
  VSIX_FILE=$(ls -t *.vsix | head -1)
  echo -e "${GREEN}✓ VS Code extension packaged: ${VSIX_FILE}${NC}"
  
  # Check if VSCE token is available
  if [ -n "$VSCE_TOKEN" ]; then
    echo "Publishing to VS Code Marketplace..."
    npx @vscode/vsce publish -p "$VSCE_TOKEN"
    echo -e "${GREEN}✓ VS Code extension published!${NC}"
  else
    echo -e "${YELLOW}To publish to VS Code Marketplace:${NC}"
    echo "  1. Get a Personal Access Token from https://dev.azure.com"
    echo "  2. Run: VSCE_TOKEN=<your-token> npx @vscode/vsce publish"
    echo "  Or install locally: code --install-extension $VSIX_FILE"
  fi
  
  cd "$ROOT_DIR"
}

publish_figma() {
  echo -e "${YELLOW}Building Figma plugin...${NC}"
  cd apps/figma-plugin
  
  # Build
  pnpm build
  
  echo -e "${GREEN}✓ Figma plugin built!${NC}"
  echo ""
  echo -e "${BLUE}To install in Figma:${NC}"
  echo "  1. Open Figma Desktop app"
  echo "  2. Go to Plugins > Development > Import plugin from manifest"
  echo "  3. Select: $ROOT_DIR/apps/figma-plugin/manifest.json"
  echo ""
  echo -e "${BLUE}To publish to Figma Community:${NC}"
  echo "  1. Go to https://www.figma.com/community/publishers"
  echo "  2. Create a new plugin"
  echo "  3. Upload the manifest.json and dist/ files"
  
  cd "$ROOT_DIR"
}

case "$1" in
  react)
    publish_react
    ;;
  vscode)
    publish_vscode
    ;;
  figma)
    publish_figma
    ;;
  all)
    publish_react
    echo ""
    publish_vscode
    echo ""
    publish_figma
    ;;
  *)
    echo "Usage: $0 [react|vscode|figma|all]"
    echo ""
    echo "Commands:"
    echo "  react   - Publish @ferni/react to npm"
    echo "  vscode  - Package/publish VS Code extension"
    echo "  figma   - Build Figma plugin with install instructions"
    echo "  all     - Publish everything"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
