#!/bin/bash

# Start signed-in web app stack with Firebase emulators
#
# This script:
# 1. Starts Firebase emulators (Auth + Firestore)
# 2. Seeds test data into the emulators
# 3. Starts the Vite dev server with emulator mode enabled
#
# The app will be available at http://localhost:3004
# Test user: test@ferni.local / Test123!@#
#
# Usage:
#   ./scripts/e2e/start-signed-in-stack.sh
#   # In another terminal: npm run test:e2e to run Playwright tests
#
# To stop, press Ctrl+C in any of the terminals

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🚀 Starting Firebase emulators + Vite dev server for e2e testing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Set emulator environment variables
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_PROJECT_ID="demo-ferni"

# Ensure we have Java installed (required for Firebase emulators)
if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Installing openjdk@21..."
    export JAVA_HOME="$(brew --prefix openjdk@21)"
    export PATH="$JAVA_HOME/bin:$PATH"
    if ! command -v java &> /dev/null; then
        echo "❌ Failed to find Java. Please install openjdk@21:"
        echo "   brew install openjdk@21"
        exit 1
    fi
else
    # Ensure we use the right Java version
    export JAVA_HOME="$(brew --prefix openjdk@21)"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "✓ Java configured: $(java -version 2>&1 | head -1)"
echo ""

# Start Firebase emulators in the background
echo "📦 Starting Firebase emulators..."
cd "$PROJECT_ROOT"

# Kill any existing emulator processes
pkill -f "firebase.*emulator" || true
sleep 1

# Start emulators
firebase emulators:start --project=demo-ferni &
EMULATORS_PID=$!
echo "   PID: $EMULATORS_PID"

# Wait for emulators to be ready
echo "   Waiting for emulators to start..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8080 > /dev/null 2>&1; then
        echo "   ✓ Emulators ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Emulators failed to start"
        kill $EMULATORS_PID
        exit 1
    fi
    sleep 1
done

echo ""

# Seed emulator data
echo "🌱 Seeding test data..."
cd "$PROJECT_ROOT"
FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099" \
FIRESTORE_EMULATOR_HOST="127.0.0.1:8080" \
npx tsx scripts/e2e/seed-emulators.ts

echo ""

# Start Vite dev server
echo "🌐 Starting Vite dev server..."
cd "$PROJECT_ROOT/apps/web"

# Create or update .env.development.local with emulator settings
cat > .env.development.local << EOF
# Emulator configuration for e2e testing
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_API_KEY=AIzaSyDummyKeyForEmulatorOnly
VITE_FIREBASE_AUTH_DOMAIN=demo-ferni.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-ferni
VITE_FIREBASE_STORAGE_BUCKET=demo-ferni.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
EOF

echo "   Environment configured"

# Start the dev server
VITE_USE_FIREBASE_EMULATORS=true npm run dev &
DEV_SERVER_PID=$!
echo "   PID: $DEV_SERVER_PID"

echo ""
echo "✅ Stack started successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Web app:      http://localhost:3004"
echo "🔐 Test user:    test@ferni.local"
echo "🔑 Password:     Test123!@#"
echo "📊 Emulators:    Firestore (8080), Auth (9099)"
echo ""
echo "To run e2e tests, open another terminal and run:"
echo "   cd $PROJECT_ROOT/apps/web"
echo "   npm run test:e2e"
echo ""
echo "To stop all services, press Ctrl+C (may need to do it twice)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for user interrupt
trap "echo ''; echo 'Stopping services...'; kill $EMULATORS_PID $DEV_SERVER_PID 2>/dev/null || true; exit 0" SIGINT

wait
