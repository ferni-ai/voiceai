#!/bin/bash
# Start all development servers
# Usage: ./scripts/dev-all.sh

set -e

echo "🔪 Killing existing processes..."
pkill -f "node.*agent" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx.*gateway" 2>/dev/null || true
pkill -f "tsx.*agent" 2>/dev/null || true
sleep 1

echo ""
echo "🚀 Starting all servers..."
echo ""

# Start in background with output
cd "$(dirname "$0")/.."

# 1. Gateway (Token + UI servers)
echo "Starting Gateway (Token + UI servers)..."
npx tsx src/servers/gateway.ts &
GATEWAY_PID=$!

# 2. Voice Agent
echo "Starting Voice Agent..."
pnpm dev &
AGENT_PID=$!

# 3. Vite Frontend
echo "Starting Vite Frontend..."
cd apps/web && pnpm dev &
VITE_PID=$!

echo ""
echo "✅ All servers starting..."
echo "   Gateway (Token+UI): PID $GATEWAY_PID"
echo "   Voice Agent: PID $AGENT_PID"  
echo "   Vite Frontend: PID $VITE_PID"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for any to exit
wait

