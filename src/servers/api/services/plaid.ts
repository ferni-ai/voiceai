/**
 * Plaid Token Management
 *
 * Stores and retrieves Plaid access tokens for users.
 */

import fs from 'fs';
import path from 'path';

/**
 * Plaid token data
 */
export interface PlaidTokenData {
  access_token: string;
  item_id: string;
  institution: {
    name?: string;
    institution_id?: string;
  };
  linked_at: string;
}

// Configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_BASE_URL =
  {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[PLAID_ENV] || 'https://sandbox.plaid.com';

// Token storage
const plaidAccessTokens = new Map<string, PlaidTokenData>();
const PLAID_TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json');

/**
 * Check if Plaid is configured
 */
export function isConfigured(): boolean {
  return !!(PLAID_CLIENT_ID && PLAID_SECRET);
}

/**
 * Get Plaid configuration
 */
export function getConfig(): { clientId: string; secret: string; baseUrl: string; env: string } {
  return {
    clientId: PLAID_CLIENT_ID,
    secret: PLAID_SECRET,
    baseUrl: PLAID_BASE_URL,
    env: PLAID_ENV,
  };
}

/**
 * Load tokens from file on startup
 */
export function loadTokens(): void {
  try {
    if (fs.existsSync(PLAID_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAID_TOKENS_FILE, 'utf8')) as Record<
        string,
        PlaidTokenData
      >;
      for (const [key, value] of Object.entries(data)) {
        plaidAccessTokens.set(key, value);
      }
      console.log(`✅ Loaded ${plaidAccessTokens.size} Plaid tokens from storage`);
    }
  } catch (err) {
    console.warn('⚠️ Could not load Plaid tokens:', (err as Error).message);
  }
}

/**
 * Save tokens to file
 */
function saveTokens(): void {
  try {
    const data = Object.fromEntries(plaidAccessTokens);
    fs.writeFileSync(PLAID_TOKENS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not save Plaid tokens:', (err as Error).message);
  }
}

/**
 * Store a Plaid access token for a user
 */
export function storeToken(
  userId: string,
  accessToken: string,
  itemId: string,
  institution?: { name?: string; institution_id?: string }
): void {
  plaidAccessTokens.set(userId, {
    access_token: accessToken,
    item_id: itemId,
    institution: institution || {},
    linked_at: new Date().toISOString(),
  });
  saveTokens();
  console.log(`🔐 Stored Plaid token for user: ${userId} (${institution?.name || 'Unknown'})`);
}

/**
 * Get Plaid access token for a user
 */
export function getToken(userId: string): PlaidTokenData | null {
  return plaidAccessTokens.get(userId) || null;
}

/**
 * Remove Plaid token for a user
 */
export function removeToken(userId: string): void {
  plaidAccessTokens.delete(userId);
  saveTokens();
}

/**
 * Exchange public token for access token
 */
export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string } | null> {
  if (!isConfigured()) {
    return null;
  }

  try {
    const response = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token: publicToken,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error_message?: string };
      console.error('❌ Plaid exchange error:', error);
      return null;
    }

    const data = (await response.json()) as { access_token: string; item_id: string };
    return {
      accessToken: data.access_token,
      itemId: data.item_id,
    };
  } catch (err) {
    console.error('❌ Plaid exchange error:', err);
    return null;
  }
}

// Load tokens on module init
loadTokens();
