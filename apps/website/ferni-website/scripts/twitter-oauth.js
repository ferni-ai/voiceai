#!/usr/bin/env node
/**
 * Twitter/X OAuth Helper for Brand Account Posting
 *
 * Generates OAuth 2.0 tokens for posting to Twitter/X.
 *
 * IMPORTANT: You must be logged into the FERNI Twitter account
 * (not your personal account) when you authorize!
 *
 * Usage:
 *   node twitter-oauth.js                    # Show help
 *   node twitter-oauth.js --auth-url         # Get authorization URL
 *   node twitter-oauth.js --exchange --code=XXX  # Exchange code for tokens
 */

const crypto = require('crypto');

// Ferni app credentials (from .env)
const CONFIG = {
  clientId: process.env.TWITTER_CLIENT_ID || 'LD9Eys1DbmTLpmt5ByF8X4p6E',
  clientSecret: process.env.TWITTER_CLIENT_SECRET || 'TQ7adI_dCUDAPX9_mJGvyTLero8JS_6M2zOuN5V8ks6MwQWrC7',
  // Use production callback - must match Twitter Developer Portal settings
  redirectUri: process.env.TWITTER_CALLBACK_URL || 'https://app.ferni.ai/api/marketing/twitter/callback',

  // OAuth 2.0 scopes for posting
  scopes: [
    'tweet.read',
    'tweet.write',
    'users.read',
    'offline.access', // For refresh tokens
  ],
};

// PKCE helpers
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Store verifier for exchange step
let codeVerifier = null;

function getAuthorizationUrl() {
  if (!CONFIG.clientId) {
    console.error('❌ TWITTER_CLIENT_ID not configured');
    process.exit(1);
  }

  // Generate PKCE values
  codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: CONFIG.scopes.join(' '),
    state: 'ferni-twitter-auth',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
    verifier: codeVerifier,
  };
}

async function exchangeCodeForToken(code, verifier) {
  if (!CONFIG.clientId || !CONFIG.clientSecret) {
    console.error('❌ Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('🔄 Exchanging code for access token...');

  const credentials = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CONFIG.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Token exchange failed:', response.status, errorText);
    process.exit(1);
  }

  const data = await response.json();

  console.log('\n✅ SUCCESS! Here are your tokens:\n');
  console.log('─'.repeat(60));
  console.log(`TWITTER_ACCESS_TOKEN=${data.access_token}`);
  if (data.refresh_token) {
    console.log(`TWITTER_REFRESH_TOKEN=${data.refresh_token}`);
  }
  console.log('─'.repeat(60));
  console.log(`\nExpires in: ${data.expires_in} seconds (${Math.round(data.expires_in / 3600)} hours)`);
  console.log('\n📝 Add these to your .env file:\n');
  console.log(`TWITTER_ACCESS_TOKEN="${data.access_token}"`);
  if (data.refresh_token) {
    console.log(`TWITTER_REFRESH_TOKEN="${data.refresh_token}"`);
  }
  console.log(`TWITTER_ACCOUNT_NAME="ferni"  # or your brand handle`);
  console.log('\n🔄 Then restart the agent to pick up the new tokens.');

  return data;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--auth-url')) {
    const { url, verifier } = getAuthorizationUrl();

    console.log('\n🐦 Twitter OAuth for Ferni Brand Account\n');
    console.log('⚠️  IMPORTANT: Log into the FERNI Twitter account BEFORE clicking this link!');
    console.log('   If you authorize while logged into your personal account,');
    console.log('   posts will go to YOUR timeline, not Ferni\'s.\n');
    console.log('🔗 Open this URL in your browser:\n');
    console.log('─'.repeat(80));
    console.log(url);
    console.log('─'.repeat(80));
    console.log('\n📋 SAVE THIS CODE VERIFIER (needed for token exchange):');
    console.log('─'.repeat(80));
    console.log(verifier);
    console.log('─'.repeat(80));
    console.log('\nAfter authorizing, you\'ll be redirected to:');
    console.log(`  ${CONFIG.redirectUri}?code=AUTHORIZATION_CODE`);
    console.log('\nCopy the code from the URL and run:');
    console.log(`  node twitter-oauth.js --exchange --code=YOUR_CODE --verifier=${verifier}`);
    return;
  }

  if (args.includes('--exchange')) {
    const codeArg = args.find((a) => a.startsWith('--code='));
    const verifierArg = args.find((a) => a.startsWith('--verifier='));

    if (!codeArg) {
      console.error('❌ Please provide --code=YOUR_AUTHORIZATION_CODE');
      process.exit(1);
    }
    if (!verifierArg) {
      console.error('❌ Please provide --verifier=YOUR_CODE_VERIFIER');
      console.error('   (This was shown when you ran --auth-url)');
      process.exit(1);
    }

    const code = codeArg.split('=')[1];
    const verifier = verifierArg.split('=')[1];
    await exchangeCodeForToken(code, verifier);
    return;
  }

  // Default: show help
  console.log(`
Twitter/X OAuth Helper for Ferni
════════════════════════════════

This script helps you get access tokens for posting to the Ferni Twitter account.

⚠️  CRITICAL: You must be logged into the FERNI Twitter account when authorizing!
    Otherwise, posts will go to your personal account.

Usage:
  # Step 1: Get authorization URL
  node twitter-oauth.js --auth-url

  # Step 2: Open URL in browser (while logged into Ferni account)
  # Step 3: Authorize the app
  # Step 4: Copy the code from redirect URL
  # Step 5: Exchange code for tokens (use verifier from step 1)
  node twitter-oauth.js --exchange --code=YOUR_CODE --verifier=YOUR_VERIFIER

Current Configuration:
  Client ID: ${CONFIG.clientId ? CONFIG.clientId.substring(0, 10) + '...' : 'Not set'}
  Redirect URI: ${CONFIG.redirectUri}
  Scopes: ${CONFIG.scopes.join(', ')}
`);
}

main().catch(console.error);
