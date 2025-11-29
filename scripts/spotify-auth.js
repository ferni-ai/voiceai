#!/usr/bin/env node
/**
 * Spotify OAuth Helper
 * 
 * This script helps you get a Spotify refresh token for Jack.
 * 
 * SETUP:
 * 1. Go to https://developer.spotify.com/dashboard
 * 2. Create an app (or use existing)
 * 3. Add redirect URI: http://localhost:8888/callback
 * 4. Copy your Client ID and Client Secret
 * 5. Run this script: node scripts/spotify-auth.js
 * 
 * The script will:
 * - Start a local server on port 8888
 * - Open your browser to Spotify login
 * - Capture the auth code
 * - Exchange it for tokens
 * - Print your refresh token to add to .env
 */

import { createServer } from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';

const execAsync = promisify(exec);

// Config
const PORT = 8888;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state', 
  'user-read-currently-playing',
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// Prompt for input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Open URL in browser
async function openBrowser(url) {
  const platform = process.platform;
  
  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }
  } catch {
    console.log('\n⚠️  Could not open browser automatically.');
    console.log('Please open this URL manually:');
    console.log(url);
  }
}

// Exchange auth code for tokens
async function getTokens(code, clientId, clientSecret) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

// Main
async function main() {
  console.log('🎵 Spotify OAuth Helper for Jack Bogle\n');
  console.log('This will get you a refresh token for Spotify integration.\n');
  
  // Get credentials
  const clientId = await prompt('Enter your Spotify Client ID: ');
  const clientSecret = await prompt('Enter your Spotify Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('❌ Client ID and Secret are required!');
    process.exit(1);
  }

  // Build auth URL
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('show_dialog', 'true');

  console.log('\n📡 Starting local server on port', PORT);
  
  // Create server to capture callback
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>❌ Authorization Failed</h1>
                <p>${error}</p>
              </body>
            </html>
          `);
          console.error('\n❌ Authorization failed:', error);
          server.close();
          resolve();
          return;
        }

        if (code) {
          try {
            console.log('\n🔑 Got authorization code, exchanging for tokens...');
            
            const tokens = await getTokens(code, clientId, clientSecret);
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #1DB954; color: white;">
                  <h1>✅ Success!</h1>
                  <p>You can close this window and check your terminal.</p>
                </body>
              </html>
            `);

            console.log('\n' + '='.repeat(60));
            console.log('✅ SUCCESS! Add these to your .env file:');
            console.log('='.repeat(60));
            console.log(`\nSPOTIFY_CLIENT_ID=${clientId}`);
            console.log(`SPOTIFY_CLIENT_SECRET=${clientSecret}`);
            console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('\n' + '='.repeat(60));
            console.log('\n🎵 Jack can now play music from Spotify!');
            console.log('Try: "Hey Jack, play some jazz"');
            
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1>❌ Token Exchange Failed</h1>
                  <p>${err.message}</p>
                </body>
              </html>
            `);
            console.error('\n❌ Token exchange failed:', err.message);
          }
          
          server.close();
          resolve();
          return;
        }
      }

      // Default response for other paths
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Waiting for Spotify callback...');
    });

    server.listen(PORT, async () => {
      console.log('✅ Server ready!\n');
      console.log('🌐 Opening Spotify login in your browser...');
      await openBrowser(authUrl.toString());
      console.log('\n⏳ Waiting for you to authorize...');
    });
  });
}

main().catch(console.error);

