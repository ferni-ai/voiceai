#!/usr/bin/env node
/**
 * LinkedIn OAuth Helper for Company Page Posting
 *
 * Generates the OAuth URL for authorizing company page access.
 * After authorizing, you'll get a code to exchange for an access token.
 *
 * Usage:
 *   node linkedin-oauth.js --auth-url     # Get authorization URL
 *   node linkedin-oauth.js --exchange --code=YOUR_CODE  # Exchange code for token
 */

const path = require('path');

// Ferni Marketing app credentials (for personal profile posting)
// Company page posting requires Community Management API approval
const CONFIG = {
  clientId: '86tmx8qezi0jz1',
  clientSecret: 'WPL_AP1.FQQlhC4yNWsm3NUb.imS7jg==',
  redirectUri: 'http://localhost:3000/callback',
  // Personal profile scopes (available now)
  // For company page, need: w_organization_social, r_organization_social
  scopes: [
    'openid',
    'profile',
    'w_member_social',  // Post to personal profile
  ],
};

function getAuthorizationUrl() {
  if (!CONFIG.clientId) {
    console.error('❌ LINKEDIN_CLIENT_ID not found in .env');
    process.exit(1);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: CONFIG.scopes.join(' '),
    state: 'ferni-company-page-auth',
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  if (!CONFIG.clientId || !CONFIG.clientSecret) {
    console.error('❌ Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('🔄 Exchanging code for access token...');

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CONFIG.redirectUri,
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Token exchange failed:', response.status, errorText);
    process.exit(1);
  }

  const data = await response.json();

  console.log('\n✅ SUCCESS! Here\'s your access token:\n');
  console.log('─'.repeat(60));
  console.log(`LINKEDIN_ACCESS_TOKEN=${data.access_token}`);
  console.log('─'.repeat(60));
  console.log(`\nExpires in: ${data.expires_in} seconds (${Math.round(data.expires_in / 86400)} days)`);
  console.log('\nAdd this to your .env file:');
  console.log(`  export LINKEDIN_ACCESS_TOKEN="${data.access_token}"`);
  console.log(`  export LINKEDIN_ORGANIZATION_ID="110229625"`);

  return data;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--auth-url')) {
    const url = getAuthorizationUrl();
    console.log('\n🔗 Open this URL in your browser to authorize:\n');
    console.log('─'.repeat(60));
    console.log(url);
    console.log('─'.repeat(60));
    console.log('\nAfter authorizing, you\'ll be redirected to:');
    console.log(`  ${CONFIG.redirectUri}?code=AUTHORIZATION_CODE`);
    console.log('\nCopy the code from the URL and run:');
    console.log('  node linkedin-oauth.js --exchange --code=YOUR_CODE');
    return;
  }

  if (args.includes('--exchange')) {
    const codeArg = args.find(a => a.startsWith('--code='));
    if (!codeArg) {
      console.error('❌ Please provide --code=YOUR_AUTHORIZATION_CODE');
      process.exit(1);
    }
    const code = codeArg.split('=')[1];
    await exchangeCodeForToken(code);
    return;
  }

  // Default: show help
  console.log(`
LinkedIn OAuth Helper for Company Page Posting
===============================================

This script helps you get an access token for posting to the Ferni company page.

Usage:
  node linkedin-oauth.js --auth-url              # Get authorization URL
  node linkedin-oauth.js --exchange --code=XXX   # Exchange code for token

Steps:
  1. Run: node linkedin-oauth.js --auth-url
  2. Open the URL in your browser
  3. Authorize the app (you must be an admin of the company page)
  4. Copy the 'code' from the redirect URL
  5. Run: node linkedin-oauth.js --exchange --code=YOUR_CODE
  6. Add the token to your .env file

Note: You need to be an admin of the Ferni LinkedIn company page to authorize.
`);
}

main().catch(console.error);
