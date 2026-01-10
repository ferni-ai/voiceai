/**
 * Validation Utilities Tests
 *
 * Tests for email, phone, text sanitization, and stock symbol validation.
 *
 * @module utils/__tests__/validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  validateEmail,
  sanitizeEmailForLog,
  isValidPhone,
  validatePhone,
  normalizePhone,
  sanitizePhoneForLog,
  sanitizePlainText,
  sanitizeForSql,
  isValidStockSymbol,
  normalizeStockSymbol,
} from '../validation.js';

describe('Email Validation', () => {
  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user.name@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
      expect(isValidEmail('user@subdomain.example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('user name@example.com')).toBe(false);
    });

    it('should reject emails exceeding max length', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
      expect(isValidEmail(123 as unknown as string)).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should return valid result for valid email', () => {
      const result = validateEmail('user@example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid email', () => {
      const result = validateEmail('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('should return error for empty email', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email is required');
    });
  });

  describe('sanitizeEmailForLog', () => {
    it('should mask local part of email', () => {
      expect(sanitizeEmailForLog('john@example.com')).toBe('jo***@example.com');
      expect(sanitizeEmailForLog('abc@example.com')).toBe('ab***@example.com');
    });

    it('should handle short local parts (2 chars or less)', () => {
      expect(sanitizeEmailForLog('a@example.com')).toBe('***@example.com');
      expect(sanitizeEmailForLog('ab@example.com')).toBe('***@example.com');
    });

    it('should handle invalid emails', () => {
      expect(sanitizeEmailForLog('')).toBe('[invalid]');
      expect(sanitizeEmailForLog('noemail')).toBe('[invalid]');
    });
  });
});

describe('Phone Validation', () => {
  describe('isValidPhone', () => {
    it('should validate E.164 format', () => {
      expect(isValidPhone('+15551234567')).toBe(true);
      expect(isValidPhone('+447911123456')).toBe(true);
      expect(isValidPhone('+33612345678')).toBe(true);
    });

    it('should validate common US formats', () => {
      expect(isValidPhone('5551234567')).toBe(true);
      expect(isValidPhone('(555) 123-4567')).toBe(true);
      expect(isValidPhone('555-123-4567')).toBe(true);
      expect(isValidPhone('555.123.4567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('abc-def-ghij')).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(isValidPhone(null as unknown as string)).toBe(false);
      expect(isValidPhone(undefined as unknown as string)).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should return valid result for valid phone', () => {
      const result = validatePhone('+15551234567');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid phone', () => {
      const result = validatePhone('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid phone number format');
    });

    it('should return error for empty phone', () => {
      const result = validatePhone('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Phone number is required');
    });
  });

  describe('normalizePhone', () => {
    it('should normalize US numbers to E.164', () => {
      expect(normalizePhone('5551234567')).toBe('+15551234567');
      expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhone('15551234567')).toBe('+15551234567');
    });

    it('should preserve E.164 format', () => {
      expect(normalizePhone('+15551234567')).toBe('+15551234567');
      expect(normalizePhone('+447911123456')).toBe('+447911123456');
    });

    it('should return null for invalid numbers', () => {
      expect(normalizePhone('')).toBe(null);
      expect(normalizePhone('123')).toBe(null);
    });
  });

  describe('sanitizePhoneForLog', () => {
    it('should mask middle digits', () => {
      expect(sanitizePhoneForLog('+15551234567')).toBe('+15****67');
    });

    it('should handle invalid phones', () => {
      expect(sanitizePhoneForLog('')).toBe('[invalid]');
      expect(sanitizePhoneForLog('123')).toBe('[invalid]');
    });
  });
});

describe('Text Sanitization', () => {
  describe('sanitizePlainText', () => {
    it('should trim whitespace', () => {
      expect(sanitizePlainText('  hello  ')).toBe('hello');
    });

    it('should remove control characters', () => {
      expect(sanitizePlainText('hello\x00world')).toBe('helloworld');
      expect(sanitizePlainText('test\x1Fvalue')).toBe('testvalue');
    });

    it('should remove angle brackets', () => {
      expect(sanitizePlainText('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
      expect(sanitizePlainText('Hello <b>World</b>')).toBe('Hello bWorld/b');
    });

    it('should truncate long text', () => {
      const longText = 'a'.repeat(20000);
      expect(sanitizePlainText(longText).length).toBe(10000);
    });

    it('should handle empty input', () => {
      expect(sanitizePlainText('')).toBe('');
      expect(sanitizePlainText(null as unknown as string)).toBe('');
      expect(sanitizePlainText(undefined as unknown as string)).toBe('');
    });
  });

  describe('sanitizeForSql', () => {
    it('should escape single quotes', () => {
      expect(sanitizeForSql("O'Brien")).toBe("O''Brien");
      expect(sanitizeForSql("it's")).toBe("it''s");
    });

    it('should escape backslashes', () => {
      expect(sanitizeForSql('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should handle empty input', () => {
      expect(sanitizeForSql('')).toBe('');
      expect(sanitizeForSql(null as unknown as string)).toBe('');
    });
  });
});

describe('Stock Symbol Validation', () => {
  describe('isValidStockSymbol', () => {
    it('should validate standard symbols', () => {
      expect(isValidStockSymbol('AAPL')).toBe(true);
      expect(isValidStockSymbol('MSFT')).toBe(true);
      expect(isValidStockSymbol('A')).toBe(true);
      expect(isValidStockSymbol('META')).toBe(true);
    });

    it('should validate symbols with class designation', () => {
      expect(isValidStockSymbol('BRK.A')).toBe(true);
      expect(isValidStockSymbol('BRK.B')).toBe(true);
    });

    it('should validate lowercase (case-insensitive)', () => {
      expect(isValidStockSymbol('aapl')).toBe(true);
    });

    it('should reject invalid symbols', () => {
      expect(isValidStockSymbol('')).toBe(false);
      expect(isValidStockSymbol('TOOLONG')).toBe(false);
      expect(isValidStockSymbol('123')).toBe(false);
      expect(isValidStockSymbol('AA.BBB')).toBe(false); // Too long class
    });

    it('should handle non-string input', () => {
      expect(isValidStockSymbol(null as unknown as string)).toBe(false);
      expect(isValidStockSymbol(undefined as unknown as string)).toBe(false);
    });
  });

  describe('normalizeStockSymbol', () => {
    it('should convert to uppercase', () => {
      expect(normalizeStockSymbol('aapl')).toBe('AAPL');
      expect(normalizeStockSymbol('msft')).toBe('MSFT');
    });

    it('should trim whitespace', () => {
      expect(normalizeStockSymbol('  AAPL  ')).toBe('AAPL');
    });

    it('should return null for invalid symbols', () => {
      expect(normalizeStockSymbol('')).toBe(null);
      expect(normalizeStockSymbol('INVALID!')).toBe(null);
    });
  });
});
