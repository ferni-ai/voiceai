#!/usr/bin/env npx tsx
/**
 * Spotify OAuth Helper
 *
 * Gets a Spotify refresh token for Jack persona.
 *
 * SETUP:
 * 1. Go to https://developer.spotify.com/dashboard
 * 2. Create an app
 * 3. Add this EXACT redirect URI: https://example.com/callback
 * 4. Copy your Client ID and Client Secret
 * 5. Run: npx tsx apps/cli/src/commands/auth/spotify-auth.ts
 *    or:  ferni auth spotify
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..', '..', '..', '..');

// Use example.com - Spotify will redirect there and show an error page,
// but the authorization code will be in the URL!
const REDIRECT_URI = 'https://example.com/callback';

const SCOPES = [
  // Web Playback SDK (REQUIRED for browser player)
  'streaming', // Core streaming permission
  'user-read-email', // Required by Web Playback SDK
  'user-read-private', // For Premium status check

  // Playback control
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',

  // Playlists
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

// Prompt for input
function prompt(question: string): Promise<string> {
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

// Exchange auth code for tokens
async function getTokens(code: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
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

export async function spotifyAuth(): Promise<boolean> {
  console.log('');
  console.log('🎵 Spotify OAuth Helper for Jack Bogle');
  console.log('='.repeat(50));
  console.log('');
  console.log('⚠️  IMPORTANT: In Spotify Dashboard, set Redirect URI to:');
  console.log('');
  console.log('   https://example.com/callback');
  console.log('');
  console.log('='.repeat(50));

  const ready = await prompt('\nHave you added this redirect URI to Spotify? (y/n): ');
  if (ready.toLowerCase() !== 'y') {
    console.log('\nPlease add the redirect URI first, then run this script again.');
    return false;
  }

  // Get credentials
  console.log('');
  const clientId = await prompt('Enter your Spotify Client ID: ');
  const clientSecret = await prompt('Enter your Spotify Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('❌ Client ID and Secret are required!');
    return false;
  }

  // Build auth URL
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('show_dialog', 'true');

  console.log('');
  console.log('='.repeat(50));
  console.log('STEP 1: Open this URL in your browser:');
  console.log('='.repeat(50));
  console.log('');
  console.log(authUrl.toString());
  console.log('');
  console.log('='.repeat(50));
  console.log('STEP 2: Log in and click "Agree"');
  console.log('='.repeat(50));
  console.log('');
  console.log("STEP 3: You'll see an example.com error page.");
  console.log("        That's EXPECTED! Look at the URL bar.");
  console.log('');
  console.log('        The URL will look like:');
  console.log('        https://example.com/callback?code=AQBx...');
  console.log('');
  console.log('='.repeat(50));

  const callbackUrl = await prompt('STEP 4: Paste the FULL URL from your browser:\n> ');

  // Extract code from URL
  let code: string | null = null;
  try {
    // Handle if they paste the full URL
    if (callbackUrl.includes('?code=')) {
      const url = new URL(callbackUrl);
      code = url.searchParams.get('code');
    }
    // Handle if they paste just the code
    else if (callbackUrl.length > 50) {
      code = callbackUrl;
    }

    if (!code) {
      throw new Error('No code found');
    }
  } catch {
    console.error('');
    console.error('❌ Could not find authorization code.');
    console.error('Make sure you copied the entire URL from the browser.');
    return false;
  }

  console.log('');
  console.log('🔑 Got code! Exchanging for tokens...');

  try {
    const tokens = await getTokens(code, clientId, clientSecret);

    // Save tokens to file (auto-refresh system will use this)
    const tokenFile = path.join(ROOT_DIR, '.spotify-tokens.json');
    const tokenData: TokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || '',
    };
    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));

    console.log('');
    console.log('='.repeat(50));
    console.log('✅ SUCCESS! Tokens saved automatically!');
    console.log('='.repeat(50));
    console.log('');
    console.log(`📁 Tokens saved to: ${tokenFile}`);
    console.log('   (Jack will auto-refresh these - no manual updates needed!)');
    console.log('');
    console.log('Make sure your .env has:');
    console.log(`SPOTIFY_CLIENT_ID=${clientId}`);
    console.log(`SPOTIFY_CLIENT_SECRET=${clientSecret}`);
    console.log('');
    console.log('='.repeat(50));
    console.log('');
    console.log('🎵 Jack can now play music!');
    console.log('   Try: "Hey Jack, play some jazz"');
    console.log('');

    return true;
  } catch (err) {
    const error = err as Error;
    console.error('');
    console.error('❌ Token exchange failed:', error.message);
    console.error('');
    console.error('Check that:');
    console.error('1. Redirect URI is exactly: https://example.com/callback');
    console.error('2. Client ID and Secret are correct');
    console.error('3. You pasted the complete URL');
    return false;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  spotifyAuth()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
