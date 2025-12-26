/**
 * Environment Validator Tests
 *
 * Tests for environment variable validation,
 * feature availability detection, and configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  type ValidationResult,
  validateEnvironment,
  getFeatureAvailability,
  isFeatureAvailable,
  getMissingFeatures,
} from '../env-validator.js';

describe('EnvValidator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ValidationResult type', () => {
    it('should have all required properties', () => {
      const result: ValidationResult = {
        valid: true,
        missing: [],
        warnings: [],
        available: {},
      };

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.available).toEqual({});
    });

    it('should represent invalid state with missing vars', () => {
      const result: ValidationResult = {
        valid: false,
        missing: ['LIVEKIT_API_KEY - LiveKit API key', 'GOOGLE_API_KEY - Google Gemini API key'],
        warnings: [],
        available: {
          LIVEKIT_API_KEY: false,
          GOOGLE_API_KEY: false,
        },
      };

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(2);
      expect(result.available.LIVEKIT_API_KEY).toBe(false);
    });

    it('should include warnings for optional vars', () => {
      const result: ValidationResult = {
        valid: true,
        missing: [],
        warnings: [
          'REDIS_URL not set - Redis connection URL',
          'SENDGRID_API_KEY not set - SendGrid API key for email',
        ],
        available: {
          REDIS_URL: false,
          SENDGRID_API_KEY: false,
        },
      };

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('validateEnvironment', () => {
    it('should validate when required vars are set', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';

      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should fail when required vars are missing', () => {
      // Clear all required vars
      delete process.env.LIVEKIT_API_KEY;
      delete process.env.LIVEKIT_API_SECRET;
      delete process.env.LIVEKIT_URL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.CARTESIA_API_KEY;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should treat empty strings as unset', () => {
      process.env.LIVEKIT_API_KEY = '';
      process.env.LIVEKIT_API_SECRET = '   ';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some((m) => m.includes('LIVEKIT_API_KEY'))).toBe(true);
    });

    it('should track available vars', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const result = validateEnvironment();

      expect(result.available.LIVEKIT_API_KEY).toBe(true);
      expect(result.available.REDIS_URL).toBe(true);
    });

    it('should generate warnings for missing optional vars', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';

      const result = validateEnvironment();

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('getFeatureAvailability', () => {
    beforeEach(() => {
      // Set minimal required
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
    });

    it('should detect LiveKit core availability', () => {
      const features = getFeatureAvailability();
      expect(features.livekitCore).toBe(true);
    });

    it('should detect Gemini LLM availability', () => {
      const features = getFeatureAvailability();
      expect(features.geminiLLM).toBe(true);
    });

    it('should detect Cartesia TTS availability', () => {
      const features = getFeatureAvailability();
      expect(features.cartesiaTTS).toBe(true);
    });

    it('should detect Postgres memory when DATABASE_URL set', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      const features = getFeatureAvailability();
      expect(features.postgresMemory).toBe(true);
    });

    it('should detect Firestore memory when GOOGLE_CLOUD_PROJECT set', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      const features = getFeatureAvailability();
      expect(features.firestoreMemory).toBe(true);
    });

    it('should detect Redis cache when REDIS_URL set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const features = getFeatureAvailability();
      expect(features.redisCache).toBe(true);
    });

    it('should detect email notifications when SENDGRID_API_KEY set', () => {
      process.env.SENDGRID_API_KEY = 'sg-key';
      const features = getFeatureAvailability();
      expect(features.emailNotifications).toBe(true);
    });

    it('should detect SMS when both Twilio vars set', () => {
      process.env.TWILIO_ACCOUNT_SID = 'sid';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      const features = getFeatureAvailability();
      expect(features.smsNotifications).toBe(true);
    });

    it('should not detect SMS when only partial Twilio config', () => {
      process.env.TWILIO_ACCOUNT_SID = 'sid';
      delete process.env.TWILIO_AUTH_TOKEN;
      const features = getFeatureAvailability();
      expect(features.smsNotifications).toBe(false);
    });

    it('should detect Plaid banking when both vars set', () => {
      process.env.PLAID_CLIENT_ID = 'client-id';
      process.env.PLAID_SECRET = 'secret';
      const features = getFeatureAvailability();
      expect(features.plaidBanking).toBe(true);
    });

    it('should handle music enabled flag', () => {
      // Default: music enabled
      let features = getFeatureAvailability();
      expect(features.musicEnabled).toBe(true);

      // Explicitly disabled
      process.env.MUSIC_ENABLED = 'false';
      features = getFeatureAvailability();
      expect(features.musicEnabled).toBe(false);

      // Explicitly enabled
      process.env.MUSIC_ENABLED = 'true';
      features = getFeatureAvailability();
      expect(features.musicEnabled).toBe(true);
    });

    it('should detect Spotify when both vars set', () => {
      process.env.SPOTIFY_CLIENT_ID = 'spotify-id';
      process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';
      const features = getFeatureAvailability();
      expect(features.spotifyMusic).toBe(true);
    });

    it('should detect market data when ALPHA_VANTAGE set', () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'av-key';
      const features = getFeatureAvailability();
      expect(features.marketData).toBe(true);
    });
  });

  describe('isFeatureAvailable', () => {
    beforeEach(() => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
    });

    it('should return true for available features', () => {
      expect(isFeatureAvailable('livekitCore')).toBe(true);
      expect(isFeatureAvailable('geminiLLM')).toBe(true);
    });

    it('should return false for unavailable features', () => {
      expect(isFeatureAvailable('redisCache')).toBe(false);
      expect(isFeatureAvailable('plaidBanking')).toBe(false);
    });

    it('should handle all feature keys', () => {
      const featureKeys = [
        'livekitCore',
        'geminiLLM',
        'cartesiaTTS',
        'postgresMemory',
        'firestoreMemory',
        'redisCache',
        'emailNotifications',
        'smsNotifications',
        'plaidBanking',
        'musicEnabled',
        'spotifyMusic',
        'marketData',
      ] as const;

      featureKeys.forEach((key) => {
        const result = isFeatureAvailable(key);
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('getMissingFeatures', () => {
    beforeEach(() => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
    });

    it('should list missing features', () => {
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Email'))).toBe(true);
      expect(missing.some((m) => m.includes('SMS'))).toBe(true);
      expect(missing.some((m) => m.includes('Bank'))).toBe(true);
    });

    it('should not list available features', () => {
      process.env.SENDGRID_API_KEY = 'sg-key';
      const missing = getMissingFeatures();

      expect(missing.some((m) => m.includes('Email'))).toBe(false);
    });

    it('should handle Spotify/Music configuration edge cases', () => {
      // Music enabled but no Spotify
      delete process.env.MUSIC_ENABLED;
      delete process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_SECRET;
      let missing = getMissingFeatures();
      expect(missing.some((m) => m.includes('Spotify'))).toBe(true);

      // Spotify configured but music disabled
      process.env.SPOTIFY_CLIENT_ID = 'id';
      process.env.SPOTIFY_CLIENT_SECRET = 'secret';
      process.env.MUSIC_ENABLED = 'false';
      missing = getMissingFeatures();
      expect(missing.some((m) => m.includes('MUSIC_ENABLED'))).toBe(true);
    });

    it('should return empty array when all configured', () => {
      process.env.SENDGRID_API_KEY = 'sg-key';
      process.env.TWILIO_ACCOUNT_SID = 'sid';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.PLAID_CLIENT_ID = 'plaid-id';
      process.env.PLAID_SECRET = 'plaid-secret';
      process.env.SPOTIFY_CLIENT_ID = 'spotify-id';
      process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';
      process.env.ALPHA_VANTAGE_API_KEY = 'av-key';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const missing = getMissingFeatures();
      expect(missing).toHaveLength(0);
    });
  });

  describe('Environment variable categories', () => {
    describe('Core variables', () => {
      const coreVars = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];

      it.each(coreVars)('%s should be required', (varName) => {
        // Clear all and set only the others
        delete process.env.LIVEKIT_API_KEY;
        delete process.env.LIVEKIT_API_SECRET;
        delete process.env.LIVEKIT_URL;
        process.env.GOOGLE_API_KEY = 'google-key';
        process.env.CARTESIA_API_KEY = 'cartesia-key';

        coreVars.forEach((v) => {
          if (v !== varName) {
            process.env[v] = 'test-value';
          }
        });

        const result = validateEnvironment();
        expect(result.missing.some((m) => m.includes(varName))).toBe(true);
      });
    });

    describe('AI variables', () => {
      const aiVars = ['GOOGLE_API_KEY', 'CARTESIA_API_KEY'];

      it.each(aiVars)('%s should be required', (varName) => {
        process.env.LIVEKIT_API_KEY = 'test-key';
        process.env.LIVEKIT_API_SECRET = 'test-secret';
        process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
        delete process.env.GOOGLE_API_KEY;
        delete process.env.CARTESIA_API_KEY;

        aiVars.forEach((v) => {
          if (v !== varName) {
            process.env[v] = 'test-value';
          }
        });

        const result = validateEnvironment();
        expect(result.missing.some((m) => m.includes(varName))).toBe(true);
      });
    });

    describe('Memory variables', () => {
      const memoryVars = ['DATABASE_URL', 'GOOGLE_CLOUD_PROJECT', 'REDIS_URL'];

      it.each(memoryVars)('%s should be optional', (varName) => {
        process.env.LIVEKIT_API_KEY = 'test-key';
        process.env.LIVEKIT_API_SECRET = 'test-secret';
        process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
        process.env.GOOGLE_API_KEY = 'google-key';
        process.env.CARTESIA_API_KEY = 'cartesia-key';
        delete process.env[varName];

        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes(varName))).toBe(true);
      });
    });

    describe('Communication variables', () => {
      const commVars = ['SENDGRID_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];

      it.each(commVars)('%s should be optional', (varName) => {
        process.env.LIVEKIT_API_KEY = 'test-key';
        process.env.LIVEKIT_API_SECRET = 'test-secret';
        process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
        process.env.GOOGLE_API_KEY = 'google-key';
        process.env.CARTESIA_API_KEY = 'cartesia-key';

        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Feature combinations', () => {
    it('should detect full notification stack', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
      process.env.SENDGRID_API_KEY = 'sg-key';
      process.env.TWILIO_ACCOUNT_SID = 'sid';
      process.env.TWILIO_AUTH_TOKEN = 'token';

      const features = getFeatureAvailability();
      expect(features.emailNotifications && features.smsNotifications).toBe(true);
    });

    it('should detect full memory stack', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      process.env.REDIS_URL = 'redis://localhost:6379';

      const features = getFeatureAvailability();
      expect(features.postgresMemory && features.firestoreMemory && features.redisCache).toBe(true);
    });

    it('should detect entertainment stack', () => {
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';
      process.env.SPOTIFY_CLIENT_ID = 'spotify-id';
      process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

      const features = getFeatureAvailability();
      expect(features.musicEnabled && features.spotifyMusic).toBe(true);
    });
  });
});
