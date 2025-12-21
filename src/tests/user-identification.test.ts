/**
 * User Identification Service Tests
 *
 * Tests for cross-platform user recognition.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
} from '../services/identity/user-identification.js';

describe('User Identification Service', () => {
  describe('Phone Number Normalization', () => {
    it('should normalize US phone numbers with various formats', () => {
      expect(normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('5551234567')).toBe('+15551234567');
      expect(normalizePhoneNumber('1-555-123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('+1 555 123 4567')).toBe('+15551234567');
    });

    it('should handle international numbers', () => {
      expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
      expect(normalizePhoneNumber('+33 1 23 45 67 89')).toBe('+33123456789');
    });

    it('should preserve valid E.164 format', () => {
      expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567');
      expect(normalizePhoneNumber('+442079460958')).toBe('+442079460958');
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate correct phone numbers', () => {
      expect(isValidPhoneNumber('+15551234567')).toBe(true);
      expect(isValidPhoneNumber('555-123-4567')).toBe(true);
      expect(isValidPhoneNumber('+442079460958')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('abcdefg')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('Phone Number Formatting', () => {
    it('should format US numbers for display', () => {
      expect(formatPhoneForDisplay('+15551234567')).toBe('(555) 123-4567');
      expect(formatPhoneForDisplay('5551234567')).toBe('(555) 123-4567');
    });

    it('should return E.164 for non-US numbers', () => {
      expect(formatPhoneForDisplay('+442079460958')).toBe('+442079460958');
    });
  });

  describe('Phone Identification', () => {
    it('should identify new user by phone', async () => {
      const result = await identifyByPhone('+19995551234');

      expect(result.userId).toBe('phone:+19995551234');
      expect(result.isNew).toBe(true);
      expect(result.isReturning).toBe(false);
      expect(result.source.type).toBe('phone');
    });

    it('should normalize phone number during identification', async () => {
      const result = await identifyByPhone('999-555-1234');

      expect(result.userId).toBe('phone:+19995551234');
      expect(result.source.identifier).toBe('+19995551234');
    });
  });

  describe('Web Auth Identification', () => {
    it('should identify user by auth ID', async () => {
      const result = await identifyByWebAuth('user123', 'google');

      expect(result.userId).toBe('auth:google:user123');
      expect(result.source.type).toBe('web_auth');
      expect(result.source.metadata?.provider).toBe('google');
    });

    it('should use default provider when not specified', async () => {
      const result = await identifyByWebAuth('user456');

      expect(result.userId).toBe('auth:default:user456');
    });
  });

  describe('Metadata-Based Identification', () => {
    it('should identify from explicit user_id', async () => {
      const result = await identifyFromMetadata({
        user_id: 'explicit-user-123',
        user_name: 'John',
      });

      expect(result.userId).toBe('explicit-user-123');
      expect(result.source.type).toBe('web_auth');
    });

    it('should identify from phone number in caller_id', async () => {
      const result = await identifyFromMetadata({
        caller_id: '+15551234567',
      });

      expect(result.userId).toBe('phone:+15551234567');
      expect(result.source.type).toBe('phone');
    });

    it('should identify from phone number in "from" field', async () => {
      const result = await identifyFromMetadata({
        from: '555-867-5309',
      });

      expect(result.userId).toBe('phone:+15558675309');
      expect(result.source.type).toBe('phone');
    });

    it('should identify from device_id', async () => {
      const result = await identifyFromMetadata({
        device_id: 'device-abc-123',
      });

      expect(result.userId).toBe('device:device-abc-123');
      expect(result.source.type).toBe('device');
    });

    it('should fall back to anonymous for empty metadata', async () => {
      const result = await identifyFromMetadata({});

      expect(result.source.type).toBe('anonymous');
      expect(result.isNew).toBe(true);
    });

    it('should prioritize explicit user_id over phone', async () => {
      const result = await identifyFromMetadata({
        user_id: 'explicit-user',
        caller_id: '+15551234567',
      });

      expect(result.userId).toBe('explicit-user');
      expect(result.source.type).toBe('web_auth');
    });
  });
});
