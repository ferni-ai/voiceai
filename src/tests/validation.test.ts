/**
 * Input Validation Tests
 *
 * Tests for the validation utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  isValidStockSymbol,
  normalizeStockSymbol,
  sanitizeText,
  sanitizePlainText,
  isValidUrl,
  parseAmount,
  isValidAmount,
  parseDate,
  validateEmail,
  validatePhone,
  validateStockSymbol,
  sanitizeEmailForLog,
  sanitizePhoneForLog,
} from '../tools/validation.js';

describe('Input Validation', () => {
  describe('Email Validation', () => {
    it('should accept valid email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
      expect(isValidEmail('a@b.co')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      // Note: user@domain is technically valid per RFC 5322 (local domains)
      // but uncommon - our regex allows it for simplicity
      expect(isValidEmail('user @domain.com')).toBe(false);
    });

    it('should reject very long emails', () => {
      const longEmail = 'a'.repeat(300) + '@example.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });

    it('should sanitize email for logging', () => {
      expect(sanitizeEmailForLog('john.doe@example.com')).toBe('jo***@example.com');
      expect(sanitizeEmailForLog('ab@domain.com')).toBe('***@domain.com');
      expect(sanitizeEmailForLog('invalid')).toBe('[invalid]');
    });

    it('should validate email with result object', () => {
      const valid = validateEmail('test@example.com');
      expect(valid.valid).toBe(true);
      expect(valid.sanitized).toBe('test@example.com');

      const invalid = validateEmail('invalid');
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toBeDefined();
    });
  });

  describe('Phone Validation', () => {
    it('should accept valid phone numbers', () => {
      expect(isValidPhone('+15551234567')).toBe(true);
      expect(isValidPhone('+442071234567')).toBe(true);
      expect(isValidPhone('15551234567')).toBe(true);
      expect(isValidPhone('5551234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('abcdefghij')).toBe(false);
    });

    it('should normalize US phone numbers', () => {
      expect(normalizePhone('5551234567')).toBe('+15551234567');
      expect(normalizePhone('15551234567')).toBe('+15551234567');
      expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhone('555.123.4567')).toBe('+15551234567');
    });

    it('should preserve international numbers', () => {
      expect(normalizePhone('+442071234567')).toBe('+442071234567');
    });

    it('should sanitize phone for logging', () => {
      expect(sanitizePhoneForLog('+15551234567')).toBe('+15****67');
      expect(sanitizePhoneForLog('')).toBe('[invalid]');
    });

    it('should validate phone with result object', () => {
      const valid = validatePhone('5551234567');
      expect(valid.valid).toBe(true);
      expect(valid.sanitized).toBe('+15551234567');

      const invalid = validatePhone('123');
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toBeDefined();
    });
  });

  describe('Stock Symbol Validation', () => {
    it('should accept valid stock symbols', () => {
      expect(isValidStockSymbol('AAPL')).toBe(true);
      expect(isValidStockSymbol('VTI')).toBe(true);
      expect(isValidStockSymbol('BRK.A')).toBe(true);
      expect(isValidStockSymbol('spy')).toBe(true); // lowercase ok
      expect(isValidStockSymbol('A')).toBe(true); // single letter
    });

    it('should reject invalid stock symbols', () => {
      expect(isValidStockSymbol('')).toBe(false);
      expect(isValidStockSymbol('TOOLONG')).toBe(false); // 7 chars
      expect(isValidStockSymbol('123')).toBe(false);
      expect(isValidStockSymbol('AA-BB')).toBe(false);
      expect(isValidStockSymbol('AAPL!')).toBe(false);
    });

    it('should normalize stock symbols to uppercase', () => {
      expect(normalizeStockSymbol('aapl')).toBe('AAPL');
      expect(normalizeStockSymbol('Vti')).toBe('VTI');
      expect(normalizeStockSymbol('brk.a')).toBe('BRK.A');
    });

    it('should validate stock symbol with result object', () => {
      const valid = validateStockSymbol('aapl');
      expect(valid.valid).toBe(true);
      expect(valid.sanitized).toBe('AAPL');

      const invalid = validateStockSymbol('TOOLONGGG');
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toBeDefined();
    });
  });

  describe('Text Sanitization', () => {
    it('should sanitize HTML entities', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(sanitizeText('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should remove control characters', () => {
      expect(sanitizeText('Hello\x00World')).toBe('HelloWorld');
      expect(sanitizeText('Test\x1FText')).toBe('TestText');
    });

    it('should preserve newlines and tabs', () => {
      expect(sanitizeText('Line1\nLine2')).toContain('\n');
      expect(sanitizeText('Col1\tCol2')).toContain('\t');
    });

    it('should truncate long text', () => {
      const longText = 'a'.repeat(2000);
      expect(sanitizeText(longText, 100).length).toBe(100);
    });

    it('should handle plain text without HTML escaping', () => {
      expect(sanitizePlainText('<not html>')).toBe('<not html>');
      expect(sanitizePlainText('Hello\x00World')).toBe('HelloWorld');
    });
  });

  describe('URL Validation', () => {
    it('should accept valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('https://sub.domain.co.uk/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('//example.com')).toBe(false);
    });
  });

  describe('Amount Validation', () => {
    it('should parse valid amounts', () => {
      expect(parseAmount(100)).toBe(100);
      expect(parseAmount(99.99)).toBe(99.99);
      expect(parseAmount('$1,234.56')).toBe(1234.56);
      expect(parseAmount('1000')).toBe(1000);
    });

    it('should reject invalid amounts', () => {
      expect(parseAmount(-100)).toBeNull();
      expect(parseAmount(Infinity)).toBeNull();
      expect(parseAmount('not a number')).toBeNull();
    });

    it('should validate amount bounds', () => {
      expect(isValidAmount(100)).toBe(true);
      expect(isValidAmount(0)).toBe(true);
      expect(isValidAmount(-1)).toBe(false);
      expect(isValidAmount(100, 50, 150)).toBe(true);
      expect(isValidAmount(200, 50, 150)).toBe(false);
    });
  });

  describe('Date Validation', () => {
    it('should parse valid dates', () => {
      const date = parseDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should reject invalid dates', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate('not a date')).toBeNull();
      expect(parseDate('9999-99-99')).toBeNull();
    });

    it('should reject dates outside reasonable range', () => {
      expect(parseDate('1800-01-01')).toBeNull();
      expect(parseDate('2200-01-01')).toBeNull();
    });
  });
});
