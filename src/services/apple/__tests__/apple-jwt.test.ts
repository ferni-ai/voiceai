/**
 * Apple JWT Service Tests
 *
 * Tests for JWT token generation for Apple APIs (MusicKit, WeatherKit).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock crypto
vi.mock('crypto', () => ({
  createSign: vi.fn().mockReturnValue({
    update: vi.fn(),
    end: vi.fn(),
    sign: vi.fn().mockReturnValue(Buffer.from('mock-signature')),
  }),
}));

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Store original env
const originalEnv = { ...process.env };

describe('AppleJWT', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset env
    process.env.APPLE_TEAM_ID = '';
    process.env.APPLE_KEY_ID = '';
    process.env.APPLE_PRIVATE_KEY = '';
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('isAppleConfigured', () => {
    it('should return false when no credentials configured', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      expect(isAppleConfigured()).toBe(false);
    });

    it('should return false when only some credentials configured', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      vi.resetModules();

      const { isAppleConfigured } = await import('../apple-jwt.js');
      expect(isAppleConfigured()).toBe(false);
    });

    it('should return true when all credentials configured', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      vi.resetModules();

      const { isAppleConfigured } = await import('../apple-jwt.js');
      expect(isAppleConfigured()).toBe(true);
    });
  });

  describe('generateAppleJWT', () => {
    beforeEach(() => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
    });

    it('should throw error when not configured', async () => {
      process.env.APPLE_TEAM_ID = '';
      vi.resetModules();

      const { generateAppleJWT } = await import('../apple-jwt.js');

      expect(() => generateAppleJWT('musickit')).toThrow('Apple credentials not configured');
    });

    it('should generate token for musickit service', async () => {
      vi.resetModules();
      const { generateAppleJWT } = await import('../apple-jwt.js');

      const token = generateAppleJWT('musickit');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate token for weatherkit service', async () => {
      vi.resetModules();
      const { generateAppleJWT } = await import('../apple-jwt.js');

      const token = generateAppleJWT('weatherkit');

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should throw error for unknown service', async () => {
      vi.resetModules();
      const { generateAppleJWT } = await import('../apple-jwt.js');

      expect(() => generateAppleJWT('unknown' as 'musickit')).toThrow('Unknown Apple service');
    });

    it('should cache tokens for subsequent calls', async () => {
      vi.resetModules();
      const { generateAppleJWT } = await import('../apple-jwt.js');

      const token1 = generateAppleJWT('musickit');
      const token2 = generateAppleJWT('musickit');

      expect(token1).toBe(token2);
    });

    it('should use custom expiration hours', async () => {
      vi.resetModules();
      const { generateAppleJWT } = await import('../apple-jwt.js');

      // Just verify it doesn't throw
      const token = generateAppleJWT('musickit', 24);
      expect(token).toBeDefined();
    });
  });

  describe('getMusicKitToken', () => {
    it('should call generateAppleJWT with musickit', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      vi.resetModules();

      const { getMusicKitToken, generateAppleJWT } = await import('../apple-jwt.js');

      const token = getMusicKitToken();
      const directToken = generateAppleJWT('musickit');

      expect(token).toBe(directToken);
    });
  });

  describe('getWeatherKitToken', () => {
    it('should call generateAppleJWT with weatherkit', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      vi.resetModules();

      const { getWeatherKitToken, generateAppleJWT } = await import('../apple-jwt.js');

      const token = getWeatherKitToken();
      const directToken = generateAppleJWT('weatherkit');

      expect(token).toBe(directToken);
    });
  });

  describe('Private key handling', () => {
    it('should accept inline key content', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      vi.resetModules();

      const { generateAppleJWT } = await import('../apple-jwt.js');

      // Should not throw
      const token = generateAppleJWT('musickit');
      expect(token).toBeDefined();
    });

    it('should throw for invalid key format', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY = '/invalid/path/to/key.p8';
      vi.resetModules();

      const { generateAppleJWT } = await import('../apple-jwt.js');

      expect(() => generateAppleJWT('musickit')).toThrow('not valid key content or file path');
    });
  });

  describe('Default exports', () => {
    it('should export all functions via default', async () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_KEY_ID = 'KEY123456';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      vi.resetModules();

      const appleJwt = await import('../apple-jwt.js');
      const defaultExport = appleJwt.default;

      expect(defaultExport.isAppleConfigured).toBeDefined();
      expect(defaultExport.generateAppleJWT).toBeDefined();
      expect(defaultExport.getMusicKitToken).toBeDefined();
      expect(defaultExport.getWeatherKitToken).toBeDefined();
    });
  });
});
