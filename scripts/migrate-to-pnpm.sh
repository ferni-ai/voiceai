#!/bin/bash
# ============================================================================
# Migrate from npm to pnpm
# ============================================================================
# This script converts your project from npm to pnpm.
# Run it once to generate pnpm-lock.yaml from your package-lock.json.
#
# Usage:
#   chmod +x scripts/migrate-to-pnpm.sh
#   ./scripts/migrate-to-pnpm.sh
# ============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Migrating from npm to pnpm                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

echo "✓ pnpm version: $(pnpm --version)"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this from the project root."
    exit 1
fi

# Import from package-lock.json if it exists
if [ -f "package-lock.json" ]; then
    echo ""
    echo "📥 Importing dependencies from package-lock.json..."
    pnpm import
    echo "✓ Generated pnpm-lock.yaml"
else
    echo ""
    echo "⚠️  No package-lock.json found. Running fresh install..."
    pnpm install
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies with pnpm..."
pnpm install

# Also handle frontend-typescript if it exists
if [ -d "frontend-typescript" ] && [ -f "frontend-typescript/package.json" ]; then
    echo ""
    echo "📦 Installing frontend dependencies..."
    cd frontend-typescript
    if [ -f "package-lock.json" ]; then
        pnpm import 2>/dev/null || true
    fi
    pnpm install
    cd ..
fi

# Handle design-system if it exists
if [ -d "design-system" ] && [ -f "design-system/package.json" ]; then
    echo ""
    echo "📦 Installing design-system dependencies..."
    cd design-system
    if [ -f "package-lock.json" ]; then
        pnpm import 2>/dev/null || true
    fi
    pnpm install
    cd ..
fi

# Handle functions if it exists
if [ -d "functions" ] && [ -f "functions/package.json" ]; then
    echo ""
    echo "📦 Installing functions dependencies..."
    cd functions
    if [ -f "package-lock.json" ]; then
        pnpm import 2>/dev/null || true
    fi
    pnpm install
    cd ..
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Migration complete!                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Commit the new pnpm-lock.yaml files:"
echo "     git add pnpm-lock.yaml frontend-typescript/pnpm-lock.yaml"
echo "     git commit -m 'chore: migrate from npm to pnpm'"
echo ""
echo "  2. Use pnpm instead of npm:"
echo "     pnpm install     # Instead of npm install"
echo "     pnpm build       # Instead of npm run build"
echo "     pnpm dev         # Instead of npm run dev"
echo ""
echo "  3. Optional: Remove package-lock.json files:"
echo "     rm package-lock.json frontend-typescript/package-lock.json"
echo ""
echo "Note: CI/CD and Docker builds will automatically use pnpm now."
echo "The Dockerfiles fall back to npm if pnpm-lock.yaml is missing."

