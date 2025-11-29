#!/bin/bash
# Start Bogle Agent locally connected to LiveKit Sandbox

set -e

echo "🚀 Starting Bogle Agent with Sandbox..."
echo "   Sandbox URL: wss://bogle-agent-22xhhy.sandbox.livekit.io"
echo ""

# Kill any existing processes
pkill -f "bogle-agent" 2>/dev/null || true
sleep 1

# Load environment from .env.sandbox if it exists, otherwise use .env and override URL
if [ -f .env.sandbox ]; then
    echo "📋 Loading .env.sandbox..."
    export $(grep -v '^#' .env.sandbox | grep -v '^$' | xargs)
else
    echo "📋 Loading .env and overriding LIVEKIT_URL..."
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    fi
    export LIVEKIT_URL="wss://bogle-agent-22xhhy.sandbox.livekit.io"
fi

echo ""
echo "📋 Environment:"
echo "   LIVEKIT_URL: $LIVEKIT_URL"
echo "   GOOGLE_API_KEY: ${GOOGLE_API_KEY:0:20}..."
echo "   CARTESIA_API_KEY: ${CARTESIA_API_KEY:0:20}..."
echo ""
echo "🔗 To test:"
echo "   1. Open: https://bogle-agent-22xhhy.sandbox.livekit.io"
echo "   2. Click 'Start call' button"
echo "   3. The agent will automatically join!"
echo ""
echo "Starting agent..."
echo ""

# Run the agent
npm run dev

