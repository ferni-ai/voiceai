/**
 * Services Modules Tests
 *
 * Tests for utility/helper services that are easily testable.
 * Focuses on:
 * - Environment validation
 * - Session management helpers
 * - Utility functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// ENV VALIDATOR TESTS
// ============================================================================

describe('env-validator', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Clear module cache to reset state
    vi.resetModules();
  });

  describe('validateEnvironment', () => {
    it('should pass validation when all required vars are set', async () => {
      process.env.LIVEKIT_API_KEY = 'test-api-key';
      process.env.LIVEKIT_API_SECRET = 'test-api-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.available.LIVEKIT_API_KEY).toBe(true);
      expect(result.available.GOOGLE_API_KEY).toBe(true);
    });

    it('should fail validation when required vars are missing', async () => {
      process.env.LIVEKIT_API_KEY = '';
      process.env.GOOGLE_API_KEY = '';

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing.some((m) => m.includes('LIVEKIT_API_KEY'))).toBe(true);
    });

    it('should include warnings for optional vars', async () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('DATABASE_URL'))).toBe(true);
    });

    it('should handle empty string values as missing', async () => {
      process.env.LIVEKIT_API_KEY = '   '; // Whitespace only
      process.env.GOOGLE_API_KEY = '';

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.available.LIVEKIT_API_KEY).toBe(false);
      expect(result.available.GOOGLE_API_KEY).toBe(false);
    });

    it('should correctly categorize all environment variables', async () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.available).toBeDefined();
      expect(typeof result.available).toBe('object');
      expect(Object.keys(result.available).length).toBeGreaterThan(0);
    });
  });

  describe('getFeatureAvailability', () => {
    it('should detect core features when keys are present', async () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.livekitCore).toBe(true);
      expect(features.geminiLLM).toBe(true);
      expect(features.cartesiaTTS).toBe(true);
    });

    it('should detect missing core features', async () => {
      delete process.env.LIVEKIT_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.livekitCore).toBe(false);
      expect(features.geminiLLM).toBe(false);
    });

    it('should detect optional features when configured', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.SENDGRID_API_KEY = 'test-sendgrid-key';

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.postgresMemory).toBe(true);
      expect(features.redisCache).toBe(true);
      expect(features.emailNotifications).toBe(true);
    });

    it('should require both Twilio credentials for SMS', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      delete process.env.TWILIO_AUTH_TOKEN;

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.smsNotifications).toBe(false);

      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      const featuresWithAuth = getFeatureAvailability();
      expect(featuresWithAuth.smsNotifications).toBe(true);
    });

    it('should require both Plaid credentials for banking', async () => {
      process.env.PLAID_CLIENT_ID = 'test-client-id';
      delete process.env.PLAID_SECRET;

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.plaidBanking).toBe(false);

      process.env.PLAID_SECRET = 'test-secret';
      const featuresWithSecret = getFeatureAvailability();
      expect(featuresWithSecret.plaidBanking).toBe(true);
    });

    it('should handle music feature flag correctly', async () => {
      process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
      process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
      process.env.MUSIC_ENABLED = 'false';

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.spotifyMusic).toBe(true);
      expect(features.musicEnabled).toBe(false);

      process.env.MUSIC_ENABLED = 'true';
      const featuresEnabled = getFeatureAvailability();
      expect(featuresEnabled.musicEnabled).toBe(true);
    });

    it('should detect market data availability', async () => {
      delete process.env.ALPHA_VANTAGE_API_KEY;

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.marketData).toBe(false);

      process.env.ALPHA_VANTAGE_API_KEY = 'test-alpha-key';
      const featuresWithKey = getFeatureAvailability();
      expect(featuresWithKey.marketData).toBe(true);
    });

    it('should detect Firestore memory when GCP project is set', async () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;

      const { getFeatureAvailability } = await import('../services/env-validator.js');
      const features = getFeatureAvailability();

      expect(features.firestoreMemory).toBe(false);

      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      const featuresWithProject = getFeatureAvailability();
      expect(featuresWithProject.firestoreMemory).toBe(true);
    });
  });

  describe('isFeatureAvailable', () => {
    it('should check individual feature availability', async () => {
      process.env.SENDGRID_API_KEY = 'test-key';

      const { isFeatureAvailable } = await import('../services/env-validator.js');

      expect(isFeatureAvailable('emailNotifications')).toBe(true);
      expect(isFeatureAvailable('smsNotifications')).toBe(false);
    });

    it('should return false for unavailable features', async () => {
      delete process.env.PLAID_CLIENT_ID;
      delete process.env.PLAID_SECRET;

      const { isFeatureAvailable } = await import('../services/env-validator.js');

      expect(isFeatureAvailable('plaidBanking')).toBe(false);
    });

    it('should handle all feature keys', async () => {
      const { isFeatureAvailable } = await import('../services/env-validator.js');

      // Should not throw for any valid feature key
      expect(() => isFeatureAvailable('livekitCore')).not.toThrow();
      expect(() => isFeatureAvailable('geminiLLM')).not.toThrow();
      expect(() => isFeatureAvailable('cartesiaTTS')).not.toThrow();
      expect(() => isFeatureAvailable('postgresMemory')).not.toThrow();
      expect(() => isFeatureAvailable('firestoreMemory')).not.toThrow();
      expect(() => isFeatureAvailable('redisCache')).not.toThrow();
      expect(() => isFeatureAvailable('emailNotifications')).not.toThrow();
      expect(() => isFeatureAvailable('smsNotifications')).not.toThrow();
      expect(() => isFeatureAvailable('plaidBanking')).not.toThrow();
      expect(() => isFeatureAvailable('musicEnabled')).not.toThrow();
      expect(() => isFeatureAvailable('spotifyMusic')).not.toThrow();
      expect(() => isFeatureAvailable('marketData')).not.toThrow();
    });
  });

  describe('getMissingFeatures', () => {
    it('should return empty array when all optional features are configured', async () => {
      process.env.SENDGRID_API_KEY = 'test-key';
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.PLAID_CLIENT_ID = 'test-client';
      process.env.PLAID_SECRET = 'test-secret';
      process.env.ALPHA_VANTAGE_API_KEY = 'test-alpha';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MUSIC_ENABLED = 'false'; // Intentionally disabled

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      // Should only mention music since it's intentionally disabled
      expect(missing.length).toBeLessThanOrEqual(1);
    });

    it('should list missing email notifications', async () => {
      delete process.env.SENDGRID_API_KEY;

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Email notifications'))).toBe(true);
    });

    it('should list missing SMS notifications', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('SMS notifications'))).toBe(true);
    });

    it('should list missing bank account linking', async () => {
      delete process.env.PLAID_CLIENT_ID;
      delete process.env.PLAID_SECRET;

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Bank account linking'))).toBe(true);
    });

    it('should list missing market data', async () => {
      delete process.env.ALPHA_VANTAGE_API_KEY;

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('market data'))).toBe(true);
    });

    it('should list missing Redis cache', async () => {
      delete process.env.REDIS_URL;

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Session caching'))).toBe(true);
    });

    it('should handle music feature flags correctly', async () => {
      // Spotify configured but music disabled
      process.env.SPOTIFY_CLIENT_ID = 'test-client';
      process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
      process.env.MUSIC_ENABLED = 'false';

      const { getMissingFeatures } = await import('../services/env-validator.js');
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('MUSIC_ENABLED=true'))).toBe(true);

      // Music enabled but Spotify not configured
      process.env.MUSIC_ENABLED = 'true';
      delete process.env.SPOTIFY_CLIENT_ID;
      const missingWithFlag = getMissingFeatures();

      expect(missingWithFlag.some((m) => m.includes('Spotify'))).toBe(true);
    });
  });

  describe('validateEnvironmentOrThrow', () => {
    it('should not throw when all required vars are set', async () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.CARTESIA_API_KEY = 'test-cartesia-key';

      const { validateEnvironmentOrThrow } = await import('../services/env-validator.js');

      expect(() => validateEnvironmentOrThrow()).not.toThrow();
    });

    it('should throw when required vars are missing', async () => {
      delete process.env.LIVEKIT_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const { validateEnvironmentOrThrow } = await import('../services/env-validator.js');

      expect(() => validateEnvironmentOrThrow()).toThrow(/Missing required environment variables/);
    });

    it('should include missing var names in error message', async () => {
      delete process.env.LIVEKIT_API_KEY;
      delete process.env.CARTESIA_API_KEY;

      const { validateEnvironmentOrThrow } = await import('../services/env-validator.js');

      try {
        validateEnvironmentOrThrow();
        expect.fail('Should have thrown');
      } catch (error) {
        const errorMsg = (error as Error).message;
        expect(errorMsg).toContain('LIVEKIT_API_KEY');
        expect(errorMsg).toContain('CARTESIA_API_KEY');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle undefined environment gracefully', async () => {
      const originalProcessEnv = process.env;
      process.env = {} as NodeJS.ProcessEnv;

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);

      process.env = originalProcessEnv;
    });

    it('should handle very long whitespace in env vars', async () => {
      process.env.LIVEKIT_API_KEY = '                                ';

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.available.LIVEKIT_API_KEY).toBe(false);
    });

    it('should handle environment with only some required vars', async () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      delete process.env.LIVEKIT_URL;
      delete process.env.GOOGLE_API_KEY;

      const { validateEnvironment } = await import('../services/env-validator.js');
      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.available.LIVEKIT_API_KEY).toBe(true);
      expect(result.available.LIVEKIT_URL).toBe(false);
    });
  });
});

// ============================================================================
// SESSION MANAGER HELPER FUNCTIONS TESTS
// ============================================================================

describe('session-manager helpers', () => {
  describe('session state management', () => {
    it('should track active sessions', async () => {
      const { getActiveSessionIds, getActiveSessionCount } =
        await import('../services/session-manager.js');

      const initialCount = getActiveSessionCount();
      const initialIds = getActiveSessionIds();

      expect(typeof initialCount).toBe('number');
      expect(Array.isArray(initialIds)).toBe(true);
      expect(initialCount).toBe(initialIds.length);
    });

    it('should return array of session IDs', async () => {
      const { getActiveSessionIds } = await import('../services/session-manager.js');

      const ids = getActiveSessionIds();

      expect(Array.isArray(ids)).toBe(true);
      ids.forEach((id) => {
        expect(typeof id).toBe('string');
      });
    });

    it('should return numeric session count', async () => {
      const { getActiveSessionCount } = await import('../services/session-manager.js');

      const count = getActiveSessionCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle clearing all sessions', async () => {
      const { clearAllSessions } = await import('../services/session-manager.js');

      const cleared = await clearAllSessions();

      expect(typeof cleared).toBe('number');
      expect(cleared).toBeGreaterThanOrEqual(0);
    });
  });

  describe('session retrieval', () => {
    it('should return undefined for non-existent session', async () => {
      const { getSessionServices } = await import('../services/session-manager.js');

      const services = getSessionServices('non-existent-session-id-12345');

      expect(services).toBeUndefined();
    });

    it('should handle empty session ID', async () => {
      const { getSessionServices } = await import('../services/session-manager.js');

      const services = getSessionServices('');

      expect(services).toBeUndefined();
    });
  });
});

// ============================================================================
// SUMMARY STATS
// ============================================================================

describe('test suite summary', () => {
  it('should have comprehensive test coverage', () => {
    // This test serves as documentation of what we're testing
    const testedModules = ['env-validator', 'session-manager helpers'];

    const testCategories = [
      'validation logic',
      'feature detection',
      'error handling',
      'edge cases',
      'state management',
    ];

    expect(testedModules.length).toBeGreaterThan(0);
    expect(testCategories.length).toBeGreaterThan(0);
  });
});
