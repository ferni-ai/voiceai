#!/bin/bash
# Restart Frontend and Agent for Testing

set -e

echo "🔄 Restarting Frontend and Agent..."
echo ""

# Kill existing processes
echo "🧹 Cleaning up..."
pkill -f "bogle-agent|tsx.*bogle" 2>/dev/null || true
pkill -f "http.server 8000" 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
sleep 2

# Build
echo "📦 Building..."
npm run build

# Start frontend server
echo "🌐 Starting frontend server..."
cd frontend
python3 -m http.server 8000 > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 2

# Start token server
echo "🎫 Starting token server..."
node token-server.js > /dev/null 2>&1 &
TOKEN_PID=$!
sleep 2

# Start agent
echo "🤖 Starting bogle agent..."
npm run dev > agent.log 2>&1 &
AGENT_PID=$!
sleep 3

# Verify everything is running
echo ""
echo "✅ Status Check:"
echo ""

if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "   ✅ Frontend: http://localhost:8000"
else
    echo "   ❌ Frontend: Not responding"
fi

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✅ Token Server: http://localhost:3001"
else
    echo "   ❌ Token Server: Not responding"
fi

if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "   ✅ Agent Health: http://localhost:8080"
else
    echo "   ⚠️  Agent Health: Not responding (may take a moment)"
fi

echo ""
echo "📝 To test:"
echo "   1. Open: http://localhost:8000"
echo "   2. Click the green connect button"
echo "   3. Allow microphone access"
echo "   4. Start talking!"
echo ""
echo "📋 Process IDs:"
echo "   Frontend: $FRONTEND_PID"
echo "   Token Server: $TOKEN_PID"
echo "   Agent: $AGENT_PID"
echo ""
echo "📄 Agent logs: tail -f agent.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "echo ''; echo '🛑 Stopping services...'; kill $FRONTEND_PID $TOKEN_PID $AGENT_PID 2>/dev/null; exit" INT
wait

