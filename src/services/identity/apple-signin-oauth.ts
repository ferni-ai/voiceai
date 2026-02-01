/**
 * Apple Sign In OAuth Service
 *
 * Handles OAuth 2.0 authentication with Sign in with Apple for calendar access.
 * Apple's OAuth flow is unique - it uses JWT for client_secret generation.
 *
 * SETUP REQUIREMENTS (in Apple Developer Portal):
 * 1. Create an App ID with "Sign in with Apple" capability
 * 2. Create a Services ID for web authentication
 * 3. Generate a private key (.p8 file) for token signing
 * 4. Configure redirect URIs
 *
 * ENVIRONMENT VARIABLES:
 * - APPLE_CLIENT_ID: Services ID (e.g., com.ferni.calendar)
 * - APPLE_TEAM_ID: Apple Developer Team ID
 * - APPLE_KEY_ID: Key ID from the private key
 * - APPLE_PRIVATE_KEY: Contents of the .p8 private key file
 *
 * @module services/identity/apple-signin-oauth
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'AppleSignInOAuth' });

// ============================================================================
// TYPES
// ============================================================================

export interface AppleTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  email?: string;
  name?: { firstName?: string; lastName?: string };
}

interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
}

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string; // User's unique identifier
  email?: string;
  email_verified?: string;
  is_private_email?: string;
  auth_time: number;
  nonce_supported: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_AUDIENCE = 'https://appleid.apple.com';

// Required scopes for calendar access
const APPLE_SCOPES = ['name', 'email'].join(' ');

// ============================================================================
// CONFIGURATION HELPERS
// ============================================================================

function getAppleConfig() {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const redirectUri = process.env.APPLE_REDIRECT_URI || 'https://app.ferni.ai/auth/apple/callback';

  return { clientId, teamId, keyId, privateKey, redirectUri };
}

function isAppleConfigured(): boolean {
  const { clientId, teamId, keyId, privateKey } = getAppleConfig();
  return !!(clientId && teamId && keyId && privateKey);
}

// ============================================================================
// JWT CLIENT SECRET GENERATION
// ============================================================================

/**
 * Generate a client_secret JWT for Apple Sign In
 * Apple requires a signed JWT instead of a static client secret
 */
export async function generateAppleClientSecret(): Promise<string> {
  const { clientId, teamId, keyId, privateKey } = getAppleConfig();

  if (!clientId || !teamId || !keyId || !privateKey) {
    throw new Error('Apple Sign In not configured. Missing required environment variables.');
  }

  try {
    // Dynamic import for jose library
    const { SignJWT, importPKCS8 } = await import('jose');

    // Parse the private key
    // Apple .p8 files are in PKCS8 format
    const key = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400 * 180; // 180 days (max allowed by Apple)

    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience(APPLE_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(expiry)
      .sign(key);

    return jwt;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate Apple client secret');
    throw error;
  }
}

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getFirestore() {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    return new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
  } catch {
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if Apple Sign In is configured
 */
export function isAppleSignInConfigured(): boolean {
  return isAppleConfigured();
}

/**
 * Get the authorization URL for Apple Sign In
 */
export function getAppleAuthorizationUrl(userId: string, returnUrl?: string): string {
  const { clientId, redirectUri } = getAppleConfig();

  if (!clientId) {
    throw new Error('Apple Sign In not configured');
  }

  // State includes userId and optional return URL
  const state = Buffer.from(JSON.stringify({ userId, returnUrl: returnUrl || '/' })).toString(
    'base64'
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: APPLE_SCOPES,
    response_mode: 'form_post', // Apple recommends form_post
    state,
  });

  return `${APPLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Handle the OAuth callback from Apple
 */
export async function handleAppleCallback(
  code: string,
  state: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Parse state to get userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;

    if (!userId) {
      return { success: false, error: 'Missing userId in state' };
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Save tokens
    await saveTokens(userId, tokens);

    log.info({ userId }, 'Apple Sign In completed successfully');

    return { success: true, userId };
  } catch (error) {
    log.error({ error: String(error) }, 'Apple callback failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string): Promise<AppleTokens> {
  const { clientId, redirectUri } = getAppleConfig();
  const clientSecret = await generateAppleClientSecret();

  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apple token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as AppleTokenResponse;

  // Decode the ID token to get user info
  const idTokenPayload = decodeIdToken(data.id_token);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email: idTokenPayload.email,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshAppleToken(refreshToken: string): Promise<AppleTokens> {
  const { clientId } = getAppleConfig();
  const clientSecret = await generateAppleClientSecret();

  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apple token refresh failed: ${errorText}`);
  }

  const data = (await response.json()) as AppleTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Apple may not return new refresh token
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Get valid access token for a user (refreshing if needed)
 */
export async function getValidAppleToken(userId: string): Promise<string | null> {
  const tokens = await getTokens(userId);

  if (!tokens) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    try {
      const newTokens = await refreshAppleToken(tokens.refreshToken);
      await saveTokens(userId, newTokens);
      return newTokens.accessToken;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to refresh Apple token');
      return null;
    }
  }

  return tokens.accessToken;
}

/**
 * Save tokens to Firestore
 */
async function saveTokens(userId: string, tokens: AppleTokens): Promise<void> {
  const db = await getFirestore();
  if (!db) {
    log.warn({ userId }, 'Firestore not available, tokens not persisted');
    return;
  }

  const docRef = db.collection('apple_calendar_tokens').doc(cleanForFirestore(userId));
  await docRef.set({
    ...tokens,
    updatedAt: new Date().toISOString(),
  });

  log.info({ userId }, 'Apple tokens saved');
}

/**
 * Get tokens from Firestore
 */
export async function getTokens(userId: string): Promise<AppleTokens | null> {
  const db = await getFirestore();
  if (!db) {
    return null;
  }

  const docRef = db.collection('apple_calendar_tokens').doc(cleanForFirestore(userId));
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as AppleTokens;
}

/**
 * Remove tokens (disconnect)
 */
export async function removeTokens(userId: string): Promise<void> {
  const db = await getFirestore();
  if (!db) {
    return;
  }

  const docRef = db.collection('apple_calendar_tokens').doc(cleanForFirestore(userId));
  await docRef.delete();

  log.info({ userId }, 'Apple tokens removed');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Decode an Apple ID token (JWT) without verification
 * Note: In production, you should verify the token signature
 */
function decodeIdToken(idToken: string): AppleIdTokenPayload {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload as AppleIdTokenPayload;
}

export default {
  isAppleSignInConfigured,
  getAppleAuthorizationUrl,
  handleAppleCallback,
  getValidAppleToken,
  getTokens,
  removeTokens,
  generateAppleClientSecret,
  refreshAppleToken,
};
