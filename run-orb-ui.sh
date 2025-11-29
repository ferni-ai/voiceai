#!/bin/bash

# Script to run the Jack Orb UI

echo "🎭 Starting Jack Orb UI..."
echo "================================"
echo ""

# Check if backend is running
if ! lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Warning: Backend not detected on port 8080"
    echo "   Please run 'npm start' in the main directory first"
    echo ""
fi

# Navigate to orb UI directory
cd frontend-orb

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Start the development server
echo "🚀 Starting Orb UI on http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""
npm run dev