#!/bin/bash
# Local Development Setup Script
# Run: ./scripts/setup-local.sh

set -e

echo "🚀 Setting up Voice AI for local development..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for required tools
check_command() {
  if ! command -v $1 &> /dev/null; then
    echo -e "${RED}❌ $1 is required but not installed.${NC}"
    return 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

echo ""
echo "Checking dependencies..."
check_command node
check_command npm
check_command docker || echo -e "${YELLOW}⚠️  Docker not found - persistence will use in-memory storage${NC}"

# Install npm dependencies
echo ""
echo "Installing npm packages..."
npm install

# Build TypeScript
echo ""
echo "Building TypeScript..."
npm run build

# Check for .env file
if [ ! -f .env ]; then
  echo ""
  echo -e "${YELLOW}⚠️  No .env file found${NC}"
  echo ""
  echo "Create .env with your API keys:"
  echo ""
  echo "LIVEKIT_URL=wss://your-project.livekit.cloud"
  echo "LIVEKIT_API_KEY=your-key"
  echo "LIVEKIT_API_SECRET=your-secret"
  echo "GOOGLE_API_KEY=your-google-ai-key"
  echo "CARTESIA_API_KEY=your-cartesia-key"
  echo "PERSONA_ID=jack-bogle"
  echo ""
  echo "For persistence (optional):"
  echo "DATABASE_URL=postgresql://voiceai:localdev@localhost:5432/voiceai"
  echo "REDIS_URL=redis://localhost:6379"
  echo ""
fi

# Offer to start Docker services
if command -v docker &> /dev/null; then
  echo ""
  read -p "Start PostgreSQL and Redis for persistent storage? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting Docker services..."
    docker compose -f docker-compose.local.yml up -d
    echo ""
    echo -e "${GREEN}✓ PostgreSQL running on localhost:5432${NC}"
    echo -e "${GREEN}✓ Redis running on localhost:6379${NC}"
    echo ""
    echo "Add these to your .env:"
    echo "DATABASE_URL=postgresql://voiceai:localdev@localhost:5432/voiceai"
    echo "REDIS_URL=redis://localhost:6379"
  fi
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "To run the agent:"
echo "  npm run dev"
echo ""
echo "To run with a specific persona:"
echo "  PERSONA_ID=peter-lynch npm run dev"
echo ""

