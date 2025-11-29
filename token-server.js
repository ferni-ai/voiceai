/**
 * Simple Token Server for LiveKit Voice AI Agent
 *
 * This server generates access tokens for clients to connect to LiveKit rooms.
 * Run with: node token-server.js
 */

import 'dotenv/config';
import { AccessToken } from 'livekit-server-sdk';
import http from 'http';
import url from 'url';

const PORT = process.env.TOKEN_SERVER_PORT || 3001;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Validate configuration
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing required environment variables:');
  console.error('   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  console.error('   Please check your .env file');
  process.exit(1);
}

// Create token for a participant
async function createToken(roomName, participantName) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '10m', // Token valid for 10 minutes
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}

// HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Health check endpoint
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return;
  }

  // Token generation endpoint
  if (pathname === '/token') {
    const { room, username } = parsedUrl.query;

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required parameters: room and username'
      }));
      return;
    }

    createToken(room, username)
      .then(token => {
        console.log(`✅ Generated token for user "${username}" in room "${room}"`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          token,
          url: LIVEKIT_URL,
          room,
          username
        }));
      })
      .catch(error => {
        console.error('❌ Error generating token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate token' }));
      });
    return;
  }

  // 404 for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('🎫 LiveKit Token Server');
  console.log('━'.repeat(50));
  console.log(`📡 Server running at http://localhost:${PORT}`);
  console.log(`🔗 LiveKit URL: ${LIVEKIT_URL}`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  GET /token?room=ROOM&username=NAME`);
  console.log(`  GET /token-url`);
  console.log(`  GET /health`);
  console.log('');
  console.log('Example:');
  console.log(`  curl "http://localhost:${PORT}/token?room=test&username=alice"`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('━'.repeat(50));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down token server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
