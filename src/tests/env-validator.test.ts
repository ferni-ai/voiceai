/**
 * Environment Validator Tests
 *
 * Tests for:
 * - validateEnvironment
 * - getFeatureAvailability
 * - validateEnvironmentOrThrow
 * - isFeatureAvailable
 * - getMissingFeatures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  validateEnvironment,
  getFeatureAvailability,
  validateEnvironmentOrThrow,
  isFeatureAvailable,
  getMissingFeatures,
} from '../services/env-validator.js';

describe('Environment Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment to clean state
    process.env = { ...originalEnv };
    // Clear all relevant env vars
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.CARTESIA_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.REDIS_URL;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.MUSIC_ENABLED;
    delete process.env.ALPHA_VANTAGE_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should return invalid when required vars are missing', () => {
      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should return valid when all required vars are set', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should track available status for each var', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';

      const result = validateEnvironment();

      expect(result.available['LIVEKIT_API_KEY']).toBe(true);
      expect(result.available['LIVEKIT_API_SECRET']).toBe(false);
    });

    it('should add warnings for missing optional vars', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const result = validateEnvironment();

      // Should have warnings for optional vars like DATABASE_URL, REDIS_URL, etc.
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('DATABASE_URL'))).toBe(true);
    });

    it('should not warn for optional vars that are set', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      const result = validateEnvironment();

      expect(result.warnings.some((w) => w.includes('DATABASE_URL'))).toBe(false);
    });

    it('should treat empty strings as unset', () => {
      process.env.LIVEKIT_API_KEY = '';

      const result = validateEnvironment();

      expect(result.available['LIVEKIT_API_KEY']).toBe(false);
      expect(result.missing.some((m) => m.includes('LIVEKIT_API_KEY'))).toBe(true);
    });

    it('should treat whitespace-only strings as unset', () => {
      process.env.LIVEKIT_API_KEY = '   ';

      const result = validateEnvironment();

      expect(result.available['LIVEKIT_API_KEY']).toBe(false);
    });
  });

  describe('getFeatureAvailability', () => {
    it('should return all false when no env vars set', () => {
      const features = getFeatureAvailability();

      expect(features.livekitCore).toBe(false);
      expect(features.geminiLLM).toBe(false);
      expect(features.cartesiaTTS).toBe(false);
      expect(features.postgresMemory).toBe(false);
      expect(features.firestoreMemory).toBe(false);
      expect(features.redisCache).toBe(false);
      expect(features.emailNotifications).toBe(false);
      expect(features.smsNotifications).toBe(false);
      expect(features.plaidBanking).toBe(false);
      expect(features.spotifyMusic).toBe(false);
      expect(features.marketData).toBe(false);
    });

    it('should require both LiveKit key and secret for livekitCore', () => {
      process.env.LIVEKIT_API_KEY = 'key';
      expect(getFeatureAvailability().livekitCore).toBe(false);

      process.env.LIVEKIT_API_SECRET = 'secret';
      expect(getFeatureAvailability().livekitCore).toBe(true);
    });

    it('should detect Gemini LLM availability', () => {
      process.env.GOOGLE_API_KEY = 'test-key';

      expect(getFeatureAvailability().geminiLLM).toBe(true);
    });

    it('should detect Cartesia TTS availability', () => {
      process.env.CARTESIA_API_KEY = 'test-key';

      expect(getFeatureAvailability().cartesiaTTS).toBe(true);
    });

    it('should detect Postgres memory availability', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      expect(getFeatureAvailability().postgresMemory).toBe(true);
    });

    it('should detect Firestore memory availability', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';

      expect(getFeatureAvailability().firestoreMemory).toBe(true);
    });

    it('should detect Redis cache availability', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      expect(getFeatureAvailability().redisCache).toBe(true);
    });

    it('should detect email notifications availability', () => {
      process.env.SENDGRID_API_KEY = 'test-key';

      expect(getFeatureAvailability().emailNotifications).toBe(true);
    });

    it('should require both Twilio SID and token for SMS', () => {
      process.env.TWILIO_ACCOUNT_SID = 'sid';
      expect(getFeatureAvailability().smsNotifications).toBe(false);

      process.env.TWILIO_AUTH_TOKEN = 'token';
      expect(getFeatureAvailability().smsNotifications).toBe(true);
    });

    it('should require both Plaid ID and secret for banking', () => {
      process.env.PLAID_CLIENT_ID = 'id';
      expect(getFeatureAvailability().plaidBanking).toBe(false);

      process.env.PLAID_SECRET = 'secret';
      expect(getFeatureAvailability().plaidBanking).toBe(true);
    });

    it('should have musicEnabled true by default (opt-out model)', () => {
      // Music is enabled by default - you must explicitly set MUSIC_ENABLED=false to disable
      expect(getFeatureAvailability().musicEnabled).toBe(true);

      process.env.MUSIC_ENABLED = 'false';
      expect(getFeatureAvailability().musicEnabled).toBe(false);

      process.env.MUSIC_ENABLED = 'true';
      expect(getFeatureAvailability().musicEnabled).toBe(true);
    });

    it('should require both Spotify ID and secret for Spotify', () => {
      process.env.SPOTIFY_CLIENT_ID = 'id';
      expect(getFeatureAvailability().spotifyMusic).toBe(false);

      process.env.SPOTIFY_CLIENT_SECRET = 'secret';
      expect(getFeatureAvailability().spotifyMusic).toBe(true);
    });

    it('should detect market data availability', () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      expect(getFeatureAvailability().marketData).toBe(true);
    });
  });

  describe('validateEnvironmentOrThrow', () => {
    it('should throw when required vars are missing', () => {
      expect(() => validateEnvironmentOrThrow()).toThrow('Missing required environment variables');
    });

    it('should not throw when all required vars are set', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      expect(() => validateEnvironmentOrThrow()).not.toThrow();
    });

    it('should include missing var names in error message', () => {
      try {
        validateEnvironmentOrThrow();
      } catch (error) {
        expect((error as Error).message).toContain('LIVEKIT_API_KEY');
      }
    });
  });

  describe('isFeatureAvailable', () => {
    it('should return false for unavailable features', () => {
      expect(isFeatureAvailable('geminiLLM')).toBe(false);
      expect(isFeatureAvailable('redisCache')).toBe(false);
    });

    it('should return true for available features', () => {
      process.env.GOOGLE_API_KEY = 'test-key';

      expect(isFeatureAvailable('geminiLLM')).toBe(true);
    });

    it('should return false for unknown features', () => {
      // @ts-expect-error - testing unknown feature
      expect(isFeatureAvailable('unknownFeature')).toBe(false);
    });
  });

  describe('getMissingFeatures', () => {
    it('should list all missing optional features', () => {
      const missing = getMissingFeatures();

      expect(missing).toContain('Email notifications (configure SENDGRID_API_KEY)');
      expect(missing).toContain('SMS notifications (configure TWILIO_*)');
      expect(missing).toContain('Bank account linking (configure PLAID_*)');
      expect(missing).toContain('Real-time market data (configure ALPHA_VANTAGE_API_KEY)');
      expect(missing).toContain('Session caching (configure REDIS_URL)');
    });

    it('should not list features that are configured', () => {
      process.env.SENDGRID_API_KEY = 'test-key';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Email notifications'))).toBe(false);
      expect(missing.some((m) => m.includes('Session caching'))).toBe(false);
    });

    it('should note when Spotify is configured but music disabled', () => {
      process.env.SPOTIFY_CLIENT_ID = 'id';
      process.env.SPOTIFY_CLIENT_SECRET = 'secret';
      process.env.MUSIC_ENABLED = 'false';

      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('MUSIC_ENABLED=true'))).toBe(true);
    });

    it('should note when music enabled but Spotify not configured', () => {
      process.env.MUSIC_ENABLED = 'true';

      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Spotify music'))).toBe(true);
    });

    it('should not note music when both configured', () => {
      process.env.SPOTIFY_CLIENT_ID = 'id';
      process.env.SPOTIFY_CLIENT_SECRET = 'secret';
      process.env.MUSIC_ENABLED = 'true';

      const missing = getMissingFeatures();

      expect(missing.some((m) => m.toLowerCase().includes('music'))).toBe(false);
    });
  });
});
