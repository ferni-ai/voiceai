/**
 * UI Server with Token Server + Plaid Integration
 * Serves the frontend UI, provides LiveKit token generation, and handles Plaid OAuth flow
 */

import 'dotenv/config';
import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';

const PORT = process.env.PORT || 8080;
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Plaid configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_BASE_URL = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}[PLAID_ENV] || 'https://sandbox.plaid.com';

// In-memory token storage (production would use database)
// This is shared between server and agent via file or Redis
const plaidAccessTokens = new Map();
const PLAID_TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json');

// Load tokens from file on startup
function loadPlaidTokens() {
  try {
    if (fs.existsSync(PLAID_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAID_TOKENS_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        plaidAccessTokens.set(key, value);
      }
      console.log(`✅ Loaded ${plaidAccessTokens.size} Plaid tokens from storage`);
    }
  } catch (err) {
    console.warn('⚠️ Could not load Plaid tokens:', err.message);
  }
}

// Save tokens to file
function savePlaidTokens() {
  try {
    const data = Object.fromEntries(plaidAccessTokens);
    fs.writeFileSync(PLAID_TOKENS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not save Plaid tokens:', err.message);
  }
}

// Store a Plaid access token for a user
function storePlaidToken(userId, accessToken, itemId, institution) {
  plaidAccessTokens.set(userId, {
    access_token: accessToken,
    item_id: itemId,
    institution,
    linked_at: new Date().toISOString(),
  });
  savePlaidTokens();
  console.log(`🔐 Stored Plaid token for user: ${userId} (${institution?.name || 'Unknown'})`);
}

// Get Plaid access token for a user (exported for agent use)
export function getPlaidToken(userId) {
  return plaidAccessTokens.get(userId);
}

loadPlaidTokens();

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  process.exit(1);
}

// Agent dispatch client for dispatching John Bogle agent to rooms
const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

const AGENT_NAME = 'john-bogle-agent';  // Must match livekit.toml agent name

/**
 * Generate LiveKit access token
 */
async function createToken(roomName, participantName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Serve static files from frontend directory
 */
function serveStaticFile(filePath, res) {
  const fullPath = path.join(process.cwd(), 'frontend', filePath);
  
  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  const frontendDir = path.resolve(process.cwd(), 'frontend');
  if (!resolvedPath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    res.end(JSON.stringify({ status: 'ok', service: 'john-bogle-ui', timestamp: new Date().toISOString() }));
    return;
  }

  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return;
  }

  // ============================================================================
  // PLAID ROUTES
  // ============================================================================
  
  // Serve Plaid Link page
  if (pathname === '/link-account') {
    serveStaticFile('plaid-link.html', res);
    return;
  }
  
  // Exchange Plaid public token for access token
  if (pathname === '/plaid/exchange' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { public_token, user_id, institution, accounts } = JSON.parse(body);
        
        if (!public_token || !user_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing public_token or user_id' }));
          return;
        }
        
        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Plaid not configured' }));
          return;
        }
        
        // Exchange public token for access token
        const exchangeResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            public_token,
          }),
        });
        
        if (!exchangeResponse.ok) {
          const error = await exchangeResponse.json();
          console.error('❌ Plaid exchange error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.error_message || 'Token exchange failed' }));
          return;
        }
        
        const { access_token, item_id } = await exchangeResponse.json();
        
        // Store the access token for this user
        storePlaidToken(user_id, access_token, item_id, institution);
        
        console.log(`✅ Plaid account linked for user: ${user_id}`);
        console.log(`   Institution: ${institution?.name || 'Unknown'}`);
        console.log(`   Accounts: ${accounts?.length || 0}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true,
          institution: institution?.name,
          accounts_linked: accounts?.length || 0,
        }));
        
      } catch (err) {
        console.error('❌ Plaid exchange error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  
  // Check if user has Plaid linked
  if (pathname === '/plaid/status') {
    const { user_id } = parsedUrl.query;
    
    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing user_id' }));
      return;
    }
    
    const tokenData = getPlaidToken(user_id);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      linked: !!tokenData,
      institution: tokenData?.institution?.name,
      linked_at: tokenData?.linked_at,
    }));
    return;
  }
  
  // ============================================================================
  // LIVEKIT ROUTES
  // ============================================================================

  // Token generation endpoint
  if (pathname === '/token') {
    const { room, username, device_id } = parsedUrl.query;

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required parameters: room and username'
      }));
      return;
    }

    createToken(room, username)
      .then(async token => {
        console.log(`✅ Generated token for user "${username}" in room "${room}"${device_id ? ` (device: ${device_id})` : ''}`);
        
        // Dispatch the John Bogle agent to the room
        // Include device_id for cross-session user recognition!
        try {
          const agentMetadata = {
            user_name: username,
            device_id: device_id || undefined,  // Pass device ID for user identification
            source: 'web',  // Mark as web connection
          };
          await agentDispatch.createDispatch(room, AGENT_NAME, {
            metadata: JSON.stringify(agentMetadata)
          });
          console.log(`✅ Dispatched agent "${AGENT_NAME}" to room "${room}" with metadata:`, agentMetadata);
        } catch (dispatchError) {
          // Agent might already be dispatched, or room doesn't exist yet - that's ok
          console.log(`ℹ️ Agent dispatch note: ${dispatchError.message}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          token,
          url: LIVEKIT_URL,
          room,
          username,
          device_id,
        }));
      })
      .catch(error => {
        console.error('❌ Error generating token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate token' }));
      });
    return;
  }

  // Serve static files
  if (pathname === '/' || pathname === '') {
    serveStaticFile('index.html', res);
    return;
  }

  // Serve other static files
  serveStaticFile(pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌐 John Bogle UI Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📍 Server: http://0.0.0.0:${PORT}`);
  console.log(`  🔗 LiveKit: ${LIVEKIT_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

