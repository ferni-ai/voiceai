#!/bin/bash
# Test Bogle Agent Locally

set -e

echo "🧪 Testing Bogle Agent Locally"
echo ""

# Kill any existing agent processes
echo "🧹 Cleaning up existing processes..."
pkill -f "bogle-agent" 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
sleep 1

# Build the project
echo "📦 Building TypeScript..."
npm run build

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Please create .env with your API keys"
    exit 1
fi

# Load environment variables
echo "🔐 Loading environment variables..."
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# Verify required variables
if [ -z "$LIVEKIT_URL" ] || [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ]; then
    echo "❌ Missing required LiveKit environment variables!"
    exit 1
fi

if [ -z "$GOOGLE_API_KEY" ]; then
    echo "❌ Missing GOOGLE_API_KEY!"
    exit 1
fi

if [ -z "$CARTESIA_API_KEY" ]; then
    echo "❌ Missing CARTESIA_API_KEY!"
    exit 1
fi

echo ""
echo "✅ Environment configured:"
echo "   LIVEKIT_URL: $LIVEKIT_URL"
echo "   GOOGLE_API_KEY: ${GOOGLE_API_KEY:0:20}..."
echo "   CARTESIA_API_KEY: ${CARTESIA_API_KEY:0:20}..."
echo ""
echo "🚀 Starting Bogle Agent..."
echo ""
echo "📝 To test:"
echo "   1. Open: https://playground.livekit.io"
echo "   2. Enter your LiveKit URL: $LIVEKIT_URL"
echo "   3. Create/join a room"
echo "   4. The agent will automatically join!"
echo ""
echo "   Or use your frontend at: frontend/index.html"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Run the agent
npm run dev

