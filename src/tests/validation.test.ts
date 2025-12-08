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
      const longEmail = `${'a'.repeat(300)}@example.com`;
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

// ============================================================================
// ADDITIONAL VALIDATORS (Team Handler Support)
// ============================================================================

import {
  validateDateField,
  validateEventDate,
  validateDeadline,
  validateStringField,
  validateEventTitle,
  validateGoalName,
  validateReminderDays,
  validateMonetaryAmount,
} from '../tools/validation.js';

describe('Date Field Validators', () => {
  describe('validateDateField', () => {
    it('should return valid for correct dates', () => {
      const result = validateDateField('2024-01-15');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeInstanceOf(Date);
    });

    it('should return error for missing required date', () => {
      const result = validateDateField(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should allow optional dates', () => {
      const result = validateDateField(null, { required: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });

    it('should validate past dates when allowPast is false', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const result = validateDateField(pastDate.toISOString(), { allowPast: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });

    it('should allow past dates by default', () => {
      const result = validateDateField('2020-01-01');
      expect(result.valid).toBe(true);
    });

    it('should use custom field name', () => {
      const result = validateDateField(null, { fieldName: 'Start date' });
      expect(result.error).toContain('Start date');
    });

    it('should handle invalid date format', () => {
      const result = validateDateField('not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('validateEventDate', () => {
    it('should return valid for correct dates', () => {
      const result = validateEventDate('2024-12-25');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeInstanceOf(Date);
    });

    it('should return error for missing date', () => {
      const result = validateEventDate(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Event date');
    });
  });

  describe('validateDeadline', () => {
    it('should return valid for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const result = validateDeadline(futureDate.toISOString());
      expect(result.valid).toBe(true);
    });

    it('should allow null deadline (optional)', () => {
      const result = validateDeadline(null);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });

    it('should reject past deadlines', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const result = validateDeadline(pastDate.toISOString());
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });
  });
});

describe('String Field Validators', () => {
  describe('validateStringField', () => {
    it('should return valid for correct strings', () => {
      const result = validateStringField('Hello World', 'Title');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello World');
    });

    it('should sanitize and limit length', () => {
      const longString = 'a'.repeat(300);
      const result = validateStringField(longString, 'Description', { maxLength: 100 });
      expect(result.sanitized?.length).toBeLessThanOrEqual(100);
    });

    it('should return error for too short strings', () => {
      const result = validateStringField('a', 'Title', { minLength: 2 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2 characters');
    });

    it('should return error for missing required field', () => {
      const result = validateStringField(null, 'Title', { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should allow optional fields', () => {
      const result = validateStringField(null, 'Description', { required: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });

    it('should handle non-string input', () => {
      const result = validateStringField(123, 'Title');
      expect(result.valid).toBe(false);
    });

    it('should use default min/max lengths', () => {
      const result = validateStringField('ab', 'Title'); // Default minLength is 2
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('ab');
    });
  });

  describe('validateEventTitle', () => {
    it('should return valid for correct titles', () => {
      const result = validateEventTitle('Team Meeting');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Team Meeting');
    });

    it('should return error for empty title', () => {
      const result = validateEventTitle('');
      expect(result.valid).toBe(false);
    });

    it('should return error for null title', () => {
      const result = validateEventTitle(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Event title');
    });
  });

  describe('validateGoalName', () => {
    it('should return valid for correct goal names', () => {
      const result = validateGoalName('Run a marathon');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Run a marathon');
    });

    it('should return error for empty goal name', () => {
      const result = validateGoalName('');
      expect(result.valid).toBe(false);
    });

    it('should return error for null goal name', () => {
      const result = validateGoalName(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal name');
    });
  });
});

describe('validateReminderDays', () => {
  it('should return default days when not provided', () => {
    const result = validateReminderDays(null);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual([7, 1]);
  });

  it('should use custom defaults', () => {
    const result = validateReminderDays(null, [30, 14, 7]);
    expect(result.sanitized).toEqual([30, 14, 7]);
  });

  it('should return valid for correct arrays', () => {
    const result = validateReminderDays([7, 3, 1]);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual([7, 3, 1]);
  });

  it('should filter invalid values', () => {
    const result = validateReminderDays([7, -1, 0, 500, 3]);
    expect(result.sanitized).toEqual([7, 3]); // Filters out -1, 0, 500 (>365)
  });

  it('should return defaults for empty filtered array', () => {
    const result = validateReminderDays([-1, 0, 500]);
    expect(result.sanitized).toEqual([7, 1]);
  });

  it('should return error for non-array', () => {
    const result = validateReminderDays('not an array');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array');
  });

  it('should handle undefined input', () => {
    const result = validateReminderDays(undefined);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual([7, 1]);
  });
});

describe('validateMonetaryAmount', () => {
  it('should return valid for correct amounts', () => {
    const result = validateMonetaryAmount(100);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(100);
  });

  it('should parse string amounts', () => {
    const result = validateMonetaryAmount('$1,234.56');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(1234.56);
  });

  it('should return error for missing required amount', () => {
    const result = validateMonetaryAmount(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should return error for null required amount', () => {
    const result = validateMonetaryAmount(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should allow optional amounts', () => {
    const result = validateMonetaryAmount(undefined, { required: false });
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBeUndefined();
  });

  it('should respect min/max bounds', () => {
    const belowMin = validateMonetaryAmount(5, { min: 10, max: 100 });
    expect(belowMin.valid).toBe(false);
    expect(belowMin.error).toContain('between');

    const aboveMax = validateMonetaryAmount(200, { min: 10, max: 100 });
    expect(aboveMax.valid).toBe(false);
    expect(aboveMax.error).toContain('between');

    const inRange = validateMonetaryAmount(50, { min: 10, max: 100 });
    expect(inRange.valid).toBe(true);
  });

  it('should use custom field name in errors', () => {
    const result = validateMonetaryAmount(-1, { fieldName: 'Price' });
    expect(result.valid).toBe(false);
    expect(result.error?.toLowerCase()).toContain('price');
  });

  it('should reject invalid amounts', () => {
    const result = validateMonetaryAmount('not a number');
    expect(result.valid).toBe(false);
  });

  it('should use default bounds', () => {
    const result = validateMonetaryAmount(0.5); // Below default min of 1
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Validation Integration', () => {
  it('should validate a complete event creation flow', () => {
    const title = validateEventTitle('Annual Company Party');
    const date = validateEventDate('2025-12-15');
    const reminders = validateReminderDays([30, 7, 1]);

    expect(title.valid).toBe(true);
    expect(date.valid).toBe(true);
    expect(reminders.valid).toBe(true);
  });

  it('should validate a complete goal creation flow', () => {
    const name = validateGoalName('Save for vacation');
    const amount = validateMonetaryAmount(5000);
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const deadline = validateDeadline(futureDate.toISOString());

    expect(name.valid).toBe(true);
    expect(amount.valid).toBe(true);
    expect(deadline.valid).toBe(true);
  });

  it('should handle validation failures gracefully', () => {
    const title = validateEventTitle(''); // Invalid - empty
    const date = validateEventDate(null); // Invalid - required
    const amount = validateMonetaryAmount('invalid'); // Invalid - not a number
    const deadline = validateDeadline('2020-01-01'); // Invalid - in the past

    expect(title.valid).toBe(false);
    expect(date.valid).toBe(false);
    expect(amount.valid).toBe(false);
    expect(deadline.valid).toBe(false);
  });

  it('should handle mixed validation scenarios', () => {
    const email = validateEmail('user@example.com');
    const phone = validatePhone('123'); // Invalid
    const symbol = validateStockSymbol('AAPL');
    const url = isValidUrl('https://example.com');
    const amount = validateMonetaryAmount(1000);
    const deadline = validateDeadline(null); // Optional - valid

    expect(email.valid).toBe(true);
    expect(phone.valid).toBe(false);
    expect(symbol.valid).toBe(true);
    expect(url).toBe(true);
    expect(amount.valid).toBe(true);
    expect(deadline.valid).toBe(true);
  });
});
