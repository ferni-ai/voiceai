/**
 * Input Validation Utilities
 *
 * Provides sanitization and validation for user-provided data
 * to prevent injection attacks and API misuse.
 *
 * ARCHITECTURE: Level 10 (utils) - can be imported by any layer
 */

import { getLogger } from './safe-logger.js';

const log = getLogger();

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 compliant regex (simplified)
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // Max email length per RFC

  return emailRegex.test(email);
}

/**
 * Validate email and return a result type
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  if (!isValidEmail(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true };
}

/**
 * Sanitize email for logging (mask domain)
 */
export function sanitizeEmailForLog(email: string): string {
  if (!email || !email.includes('@')) return '[invalid]';
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : '***';
  return `${maskedLocal}@${domain}`;
}

// ============================================================================
// PHONE VALIDATION
// ============================================================================

/**
 * Validate phone number format (E.164 or common formats)
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;

  // Remove common formatting
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // E.164 format: +[country code][number] (8-15 digits)
  const e164Regex = /^\+?[1-9]\d{7,14}$/;

  return e164Regex.test(cleaned);
}

/**
 * Validate phone and return a result type
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }
  if (!isValidPhone(phone)) {
    return { valid: false, error: 'Invalid phone number format' };
  }
  return { valid: true };
}

/**
 * Normalize phone to E.164 format
 */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Handle US numbers without country code
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    cleaned = `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = `+${cleaned}`;
  } else if (!cleaned.startsWith('+') && cleaned.length > 10) {
    cleaned = `+${cleaned}`;
  }

  // Validate the result
  if (!isValidPhone(cleaned)) {
    log.warn({ phone, cleaned }, 'Invalid phone number after normalization');
    return null;
  }

  return cleaned;
}

/**
 * Sanitize phone for logging (mask middle digits)
 */
export function sanitizePhoneForLog(phone: string): string {
  if (!phone) return '[invalid]';
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 6) return '[invalid]';

  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-2);
  return `${start}****${end}`;
}

// ============================================================================
// TEXT SANITIZATION
// ============================================================================

/**
 * Sanitize plain text input
 * Removes potentially dangerous characters while preserving readability
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return (
    text
      .trim()
      // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for sanitization
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[<>]/g, '') // Remove angle brackets (prevent HTML injection)
      .slice(0, 10000)
  ); // Reasonable max length
}

/**
 * Sanitize text for use in SQL queries (basic escaping)
 * Note: Always use parameterized queries when possible
 */
export function sanitizeForSql(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

// ============================================================================
// STOCK SYMBOL VALIDATION
// ============================================================================

/**
 * Validate stock ticker symbol
 */
export function isValidStockSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;

  // Standard US stock symbol: 1-5 uppercase letters
  // May include dots for special classes (e.g., BRK.A)
  const symbolRegex = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

  return symbolRegex.test(symbol.toUpperCase());
}

/**
 * Normalize stock symbol to uppercase
 */
export function normalizeStockSymbol(symbol: string): string | null {
  if (!symbol) return null;
  const normalized = symbol.toUpperCase().trim();
  return isValidStockSymbol(normalized) ? normalized : null;
}
