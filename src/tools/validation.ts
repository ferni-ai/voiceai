/**
 * Input Validation Utilities
 * 
 * Provides sanitization and validation for user-provided data
 * to prevent injection attacks and API misuse.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 compliant regex (simplified)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // Max email length per RFC
  
  return emailRegex.test(email);
}

/**
 * Sanitize email for logging (mask domain)
 */
export function sanitizeEmailForLog(email: string): string {
  if (!email || !email.includes('@')) return '[invalid]';
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 2 
    ? local.slice(0, 2) + '***' 
    : '***';
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
 * Normalize phone to E.164 format
 */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Handle US numbers without country code
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    cleaned = '+1' + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+') && cleaned.length > 10) {
    cleaned = '+' + cleaned;
  }
  
  // Validate the result
  if (!isValidPhone(cleaned)) {
    getLogger().warn({ phone, cleaned }, 'Invalid phone number after normalization');
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
// STOCK SYMBOL VALIDATION
// ============================================================================

/**
 * Validate stock ticker symbol
 */
export function isValidStockSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  
  // Stock symbols: 1-5 uppercase letters, optionally with . for class shares
  // Examples: AAPL, BRK.A, VTI
  const symbolRegex = /^[A-Z]{1,5}(\.[A-Z])?$/;
  
  return symbolRegex.test(symbol.toUpperCase());
}

/**
 * Normalize stock symbol
 */
export function normalizeStockSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  const normalized = symbol.toUpperCase().trim();
  
  if (!isValidStockSymbol(normalized)) {
    getLogger().warn({ symbol, normalized }, 'Invalid stock symbol');
    return null;
  }
  
  return normalized;
}

// ============================================================================
// TEXT SANITIZATION
// ============================================================================

/**
 * Sanitize text input to prevent injection attacks
 */
export function sanitizeText(text: string, maxLength: number = 1000): string {
  if (!text || typeof text !== 'string') return '';
  
  // Trim and limit length
  let sanitized = text.trim().slice(0, maxLength);
  
  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escape HTML entities to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return sanitized;
}

/**
 * Sanitize for plain text output (no HTML escaping needed)
 */
export function sanitizePlainText(text: string, maxLength: number = 1000): string {
  if (!text || typeof text !== 'string') return '';
  
  // Trim and limit length
  let sanitized = text.trim().slice(0, maxLength);
  
  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ============================================================================
// AMOUNT VALIDATION
// ============================================================================

/**
 * Validate and parse monetary amount
 */
export function parseAmount(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!isFinite(input) || input < 0) return null;
    return Math.round(input * 100) / 100; // Round to cents
  }
  
  if (typeof input !== 'string') return null;
  
  // Remove currency symbols and commas
  const cleaned = input.replace(/[$,]/g, '').trim();
  const amount = parseFloat(cleaned);
  
  if (isNaN(amount) || !isFinite(amount) || amount < 0) return null;
  
  return Math.round(amount * 100) / 100;
}

/**
 * Validate amount is within reasonable bounds
 */
export function isValidAmount(amount: number, min: number = 0, max: number = 1e12): boolean {
  return typeof amount === 'number' && 
         isFinite(amount) && 
         amount >= min && 
         amount <= max;
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

/**
 * Parse and validate date string
 */
export function parseDate(input: string): Date | null {
  if (!input || typeof input !== 'string') return null;
  
  const date = new Date(input);
  
  // Check for invalid date
  if (isNaN(date.getTime())) return null;
  
  // Check for reasonable date range (1900-2100)
  const year = date.getFullYear();
  if (year < 1900 || year > 2100) return null;
  
  return date;
}

// ============================================================================
// COMPOSITE VALIDATORS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: unknown;
}

/**
 * Validate email with result object
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  if (!isValidEmail(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, sanitized: trimmed };
}

/**
 * Validate phone with result object
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone) {
    return { valid: false, error: 'Phone number is required' };
  }
  
  const normalized = normalizePhone(phone);
  
  if (!normalized) {
    return { valid: false, error: 'Invalid phone number format' };
  }
  
  return { valid: true, sanitized: normalized };
}

/**
 * Validate stock symbol with result object
 */
export function validateStockSymbol(symbol: string): ValidationResult {
  if (!symbol) {
    return { valid: false, error: 'Stock symbol is required' };
  }
  
  const normalized = normalizeStockSymbol(symbol);
  
  if (!normalized) {
    return { valid: false, error: 'Invalid stock symbol format (use 1-5 letters like AAPL, VTI)' };
  }
  
  return { valid: true, sanitized: normalized };
}

