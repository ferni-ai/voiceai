#!/bin/bash
# Setup LiveKit Forks
#
# This script helps set up our forks of LiveKit packages.
# Run this after creating the GitHub fork at github.com/ferni-ai/livekit-agents-js
#
# Usage:
#   ./scripts/setup-livekit-forks.sh

set -e

FORK_ORG="ferni-ai"
FORK_REPO="livekit-agents-js"
UPSTREAM_VERSION="1.0.32"
FERNI_VERSION="1.0.32-ferni.1"

echo "🔧 LiveKit Fork Setup"
echo "===================="
echo ""

# Check if fork directory exists
FORK_DIR="../livekit-agents-js"

if [ -d "$FORK_DIR" ]; then
    echo "📁 Fork directory already exists at $FORK_DIR"
    cd "$FORK_DIR"
else
    echo "📥 Cloning fork from github.com/$FORK_ORG/$FORK_REPO..."
    
    # Check if fork exists on GitHub
    if ! git ls-remote "https://github.com/$FORK_ORG/$FORK_REPO.git" &>/dev/null; then
        echo ""
        echo "❌ Fork not found at github.com/$FORK_ORG/$FORK_REPO"
        echo ""
        echo "Please create the fork first:"
        echo "  1. Go to https://github.com/livekit/agents-js"
        echo "  2. Click 'Fork'"
        echo "  3. Select '$FORK_ORG' as the owner"
        echo "  4. Name it '$FORK_REPO'"
        echo "  5. Run this script again"
        exit 1
    fi
    
    git clone "https://github.com/$FORK_ORG/$FORK_REPO.git" "$FORK_DIR"
    cd "$FORK_DIR"
fi

# Add upstream remote if not exists
if ! git remote | grep -q upstream; then
    echo "📡 Adding upstream remote..."
    git remote add upstream https://github.com/livekit/agents-js.git
fi

# Fetch all tags
echo "🔄 Fetching tags..."
git fetch --tags
git fetch upstream --tags

# Check if our branch exists
BRANCH_NAME="ferni-v$UPSTREAM_VERSION"
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    echo "✅ Branch $BRANCH_NAME already exists"
    git checkout "$BRANCH_NAME"
else
    echo "🌿 Creating branch $BRANCH_NAME from agents-v$UPSTREAM_VERSION..."
    git checkout "tags/agents-v$UPSTREAM_VERSION" -b "$BRANCH_NAME"
fi

echo ""
echo "📝 Now apply the changes manually:"
echo ""
echo "1. Edit packages/agents/src/telemetry/traces.ts"
echo "   - Fix duration calculation (see docs/LIVEKIT-FORKS.md)"
echo ""
echo "2. Edit packages/agents/src/voice/background_audio.ts"
echo "   - Add Mutex import"
echo "   - Add playTasksLock property"
echo "   - Wrap array access with lock"
echo ""
echo "3. Edit plugins/google/src/beta/realtime/realtime_api.ts"
echo "   - Change timeout from 5e3 to 15e3"
echo "   - Add error logging (optional)"
echo ""
echo "4. Build and test:"
echo "   pnpm install"
echo "   pnpm build"
echo ""
echo "5. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'feat: Ferni customizations for voice agent stability'"
echo "   git tag agents-v$FERNI_VERSION"
echo "   git push origin $BRANCH_NAME --tags"
echo ""
echo "6. Update voiceai/package.json:"
echo '   "@livekit/agents": "github:ferni-ai/livekit-agents-js#agents-v1.0.31-ferni.1"'
echo ""
