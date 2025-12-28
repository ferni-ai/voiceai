/**
 * Apple JWT Token Generation
 *
 * Generates JWT tokens for Apple APIs (MusicKit, WeatherKit)
 *
 * Setup:
 * 1. Go to developer.apple.com/account/resources/authkeys
 * 2. Create a key with MusicKit and/or WeatherKit enabled
 * 3. Download the .p8 private key file
 * 4. Set environment variables:
 *    - APPLE_TEAM_ID (10-char team ID from membership page)
 *    - APPLE_KEY_ID (from the key you created)
 *    - APPLE_PRIVATE_KEY (contents of .p8 file, or path to it)
 *    - APPLE_MUSIC_APP_ID (optional, for MusicKit)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// Environment variables
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || '';
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY || '';

// Token cache
interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

/**
 * Check if Apple credentials are configured
 */
export function isAppleConfigured(): boolean {
  return !!(APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY);
}

/**
 * Get the private key, handling both inline and file path formats
 */
function getPrivateKey(): string {
  if (!APPLE_PRIVATE_KEY) {
    throw new Error('APPLE_PRIVATE_KEY not configured');
  }

  // If it starts with "-----BEGIN", it's the key content directly
  if (APPLE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
    return APPLE_PRIVATE_KEY;
  }

  // Otherwise, try to read it as a file path
  try {
    return fs.readFileSync(APPLE_PRIVATE_KEY, 'utf8');
  } catch {
    throw new Error('APPLE_PRIVATE_KEY is not valid key content or file path');
  }
}

/**
 * Generate a JWT token for Apple APIs
 *
 * @param service - 'musickit' or 'weatherkit'
 * @param expirationHours - How long the token should be valid (default 12 hours)
 */
export function generateAppleJWT(service: 'musickit' | 'weatherkit', expirationHours = 12): string {
  // Check cache first
  const cacheKey = service;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    // 1 min buffer
    return cached.token;
  }

  if (!isAppleConfigured()) {
    throw new Error(
      'Apple credentials not configured. Set APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY'
    );
  }

  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + expirationHours * 60 * 60;

  // JWT Header
  const header = {
    alg: 'ES256',
    kid: APPLE_KEY_ID,
  };

  // JWT Payload varies by service
  let payload: Record<string, unknown>;

  if (service === 'musickit') {
    payload = {
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: expiration,
      // MusicKit requires origin claim for web apps
      // origin: 'https://your-domain.com', // Add if needed for web
    };
  } else if (service === 'weatherkit') {
    payload = {
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: expiration,
      sub: 'com.ferni.voiceai', // Your app's bundle ID
    };
  } else {
    throw new Error(`Unknown Apple service: ${service}`);
  }

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with ES256 (ECDSA with P-256 and SHA-256)
  const sign = crypto.createSign('SHA256');
  sign.update(signatureInput);
  sign.end();

  const signature = sign.sign(privateKey);
  const encodedSignature = base64UrlEncode(signature);

  const token = `${signatureInput}.${encodedSignature}`;

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt: expiration * 1000,
  });

  log.info({ service, expiresIn: `${expirationHours}h` }, '🍎 Generated Apple JWT token');

  return token;
}

/**
 * Base64URL encode (JWT-safe encoding)
 */
function base64UrlEncode(input: string | Buffer): string {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Get MusicKit developer token
 */
export function getMusicKitToken(): string {
  return generateAppleJWT('musickit');
}

/**
 * Get WeatherKit token
 */
export function getWeatherKitToken(): string {
  return generateAppleJWT('weatherkit');
}

export default {
  isAppleConfigured,
  generateAppleJWT,
  getMusicKitToken,
  getWeatherKitToken,
};
