#!/usr/bin/env node
/**
 * Spotify OAuth Helper
 * 
 * Gets a Spotify refresh token for Jack using manual code entry.
 * 
 * SETUP:
 * 1. Go to https://developer.spotify.com/dashboard
 * 2. Create an app (or use existing)
 * 3. Add redirect URI: https://localhost:8888/callback
 *    (Spotify requires HTTPS, but we'll extract the code manually)
 * 4. Copy your Client ID and Client Secret
 * 5. Run this script: node scripts/spotify-auth.js
 */

import * as readline from 'readline';

// Config
const REDIRECT_URI = 'https://localhost:8888/callback';
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
  console.log('=' .repeat(60));
  
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

  console.log('\n' + '='.repeat(60));
  console.log('📋 STEP 1: Open this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 STEP 2: Log in to Spotify and click "Agree"');
  console.log('\n📋 STEP 3: You\'ll be redirected to a page that won\'t load.');
  console.log('           That\'s OK! Look at the URL bar.\n');
  console.log('   It will look like:');
  console.log('   https://localhost:8888/callback?code=AQD...longcode...\n');
  console.log('='.repeat(60));
  
  const callbackUrl = await prompt('\n📋 STEP 4: Paste the ENTIRE URL from your browser here:\n> ');

  // Extract code from URL
  let code;
  try {
    const url = new URL(callbackUrl);
    code = url.searchParams.get('code');
    
    if (!code) {
      // Maybe they just pasted the code
      if (callbackUrl.startsWith('AQ') && callbackUrl.length > 100) {
        code = callbackUrl;
      } else {
        throw new Error('No code found in URL');
      }
    }
  } catch {
    // Try treating input as raw code
    if (callbackUrl.startsWith('AQ') && callbackUrl.length > 100) {
      code = callbackUrl;
    } else {
      console.error('\n❌ Could not extract authorization code from URL.');
      console.error('Make sure you copied the entire URL including "https://localhost:8888/callback?code=..."');
      process.exit(1);
    }
  }

  console.log('\n🔑 Got authorization code! Exchanging for tokens...');

  try {
    const tokens = await getTokens(code, clientId, clientSecret);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS! Add these to your .env file:');
    console.log('='.repeat(60));
    console.log(`\nSPOTIFY_CLIENT_ID=${clientId}`);
    console.log(`SPOTIFY_CLIENT_SECRET=${clientSecret}`);
    console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n' + '='.repeat(60));
    console.log('\n🎵 Jack can now play music from Spotify!');
    console.log('Try: "Hey Jack, play some jazz"\n');
    
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message);
    console.error('\nMake sure:');
    console.error('1. The redirect URI in Spotify Dashboard matches exactly: https://localhost:8888/callback');
    console.error('2. Your Client ID and Secret are correct');
    console.error('3. You pasted the full callback URL');
    process.exit(1);
  }
}

main().catch(console.error);
