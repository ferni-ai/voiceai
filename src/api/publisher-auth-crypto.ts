/**
 * Publisher Authentication - Crypto Helpers
 *
 * Cryptographic utilities for API key generation and hashing.
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a random API key with prefix
 */
export function generateApiKey(type: 'live' | 'test'): string {
  const prefix = type === 'live' ? 'pk_live_' : 'pk_test_';
  const randomPart = randomBytes(24).toString('base64url'); // 32 chars
  return prefix + randomPart;
}

/**
 * Hash an API key for secure storage
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extract prefix from API key for display (first 8 chars after type prefix)
 */
export function extractKeyPrefix(apiKey: string): string {
  const parts = apiKey.split('_');
  if (parts.length < 3) return apiKey.slice(0, 8);
  return `${parts[0]}_${parts[1]}_${parts[2].slice(0, 8)}`;
}

/**
 * Generate a unique publisher ID
 */
export function generatePublisherId(): string {
  return `pub_${randomBytes(16).toString('base64url')}`;
}

/**
 * Generate a unique API key ID
 */
export function generateApiKeyId(): string {
  return `key_${randomBytes(12).toString('base64url')}`;
}
