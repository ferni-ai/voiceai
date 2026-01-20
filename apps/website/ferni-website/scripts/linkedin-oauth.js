#!/usr/bin/env node
/**
 * LinkedIn OAuth Helper for Company Page Posting
 *
 * Generates the OAuth URL for authorizing company page access.
 * After authorizing, you'll get a code to exchange for an access token.
 *
 * Usage:
 *   node linkedin-oauth.js --auth-url               # Personal profile posting
 *   node linkedin-oauth.js --auth-url --org         # Company page posting (Ferni)
 *   node linkedin-oauth.js --exchange --code=XXX    # Exchange code for token
 *
 * IMPORTANT: For company page posting, your LinkedIn app needs
 * "Community Management API" approved. Request it at:
 * https://www.linkedin.com/developers/apps/{app-id}/products
 */

// Ferni Marketing app credentials
const CONFIG = {
  clientId: '86tmx8qezi0jz1',
  clientSecret: 'WPL_AP1.FQQlhC4yNWsm3NUb.imS7jg==',
  redirectUri: 'http://localhost:3000/callback',
  organizationId: '110229625', // Ferni company page

  // Personal profile scopes (available immediately)
  personalScopes: [
    'openid',
    'profile',
    'w_member_social', // Post to personal profile
  ],

  // Organization scopes (requires Community Management API approval)
  organizationScopes: [
    'w_organization_social', // Post to company page
    'r_organization_social', // Read company page data
  ],
};

function getAuthorizationUrl(forOrganization = false) {
  if (!CONFIG.clientId) {
    console.error('❌ Client ID not configured');
    process.exit(1);
  }

  const scopes = forOrganization ? CONFIG.organizationScopes : CONFIG.personalScopes;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: scopes.join(' '),
    state: forOrganization ? 'ferni-org-auth' : 'ferni-personal-auth',
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  if (!CONFIG.clientId || !CONFIG.clientSecret) {
    console.error('❌ Missing client credentials');
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

    if (errorText.includes('unauthorized_scope')) {
      console.error('\n⚠️  This error often means your LinkedIn app does not have');
      console.error('   "Community Management API" approved. Request it at:');
      console.error('   https://www.linkedin.com/developers/apps\n');
    }
    process.exit(1);
  }

  const data = await response.json();

  console.log('\n✅ SUCCESS! Here\'s your access token:\n');
  console.log('─'.repeat(60));
  console.log(`LINKEDIN_ACCESS_TOKEN=${data.access_token}`);
  console.log('─'.repeat(60));
  console.log(`\nExpires in: ${data.expires_in} seconds (${Math.round(data.expires_in / 86400)} days)`);
  console.log('\n📝 Add these to your .env file:\n');
  console.log(`LINKEDIN_ACCESS_TOKEN="${data.access_token}"`);
  console.log(`LINKEDIN_ORGANIZATION_URN="urn:li:organization:${CONFIG.organizationId}"`);
  console.log(`SOCIAL_ACCOUNT_TYPE="brand"`);
  console.log('\n🔄 Then restart the agent to pick up the new token.');

  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const forOrganization = args.includes('--org') || args.includes('--organization');

  if (args.includes('--auth-url')) {
    const url = getAuthorizationUrl(forOrganization);
    const mode = forOrganization ? '🏢 ORGANIZATION (Ferni company page)' : '👤 PERSONAL (your profile)';

    console.log(`\n${mode}\n`);

    if (forOrganization) {
      console.log('⚠️  PREREQUISITE: Your LinkedIn app needs "Community Management API" approved.');
      console.log('   Request it at: https://www.linkedin.com/developers/apps');
      console.log('   This usually takes 1-3 business days to approve.\n');
    }

    console.log('🔗 Open this URL in your browser to authorize:\n');
    console.log('─'.repeat(80));
    console.log(url);
    console.log('─'.repeat(80));
    console.log('\nAfter authorizing, you\'ll be redirected to:');
    console.log(`  ${CONFIG.redirectUri}?code=AUTHORIZATION_CODE`);
    console.log('\nCopy the code from the URL and run:');
    console.log('  node linkedin-oauth.js --exchange --code=YOUR_CODE');
    return;
  }

  if (args.includes('--exchange')) {
    const codeArg = args.find((a) => a.startsWith('--code='));
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
LinkedIn OAuth Helper for Ferni
═══════════════════════════════

This script helps you get an access token for posting to LinkedIn.

IMPORTANT: For company page posting, your app needs "Community Management API".
Request it at: https://www.linkedin.com/developers/apps/{your-app}/products

┌─────────────────────────────────────────────────────────────────────────────┐
│ Mode            │ Scope                   │ Posts As                       │
├─────────────────┼─────────────────────────┼────────────────────────────────│
│ Personal        │ w_member_social         │ Your personal profile          │
│ Organization    │ w_organization_social   │ Ferni company page             │
└─────────────────────────────────────────────────────────────────────────────┘

Usage:
  # For PERSONAL profile posting (you):
  node linkedin-oauth.js --auth-url

  # For ORGANIZATION posting (Ferni - RECOMMENDED):
  node linkedin-oauth.js --auth-url --org

  # After authorizing, exchange the code:
  node linkedin-oauth.js --exchange --code=YOUR_CODE

Steps for Company Page Posting:
  1. Go to https://www.linkedin.com/developers/apps
  2. Select your app → Products → Request "Community Management API"
  3. Wait for approval (1-3 business days)
  4. Run: node linkedin-oauth.js --auth-url --org
  5. Authorize in browser (must be admin of Ferni company page)
  6. Copy the 'code' from redirect URL
  7. Run: node linkedin-oauth.js --exchange --code=YOUR_CODE
  8. Update .env with the new token
  9. Verify: ferni brand gtm verify

Current Configuration:
  Organization ID: ${CONFIG.organizationId}
  Redirect URI: ${CONFIG.redirectUri}
`);
}

main().catch(console.error);
