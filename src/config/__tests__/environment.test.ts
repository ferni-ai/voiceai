/**
 * Environment Configuration Tests
 *
 * Tests for environment detection and configuration loading.
 *
 * Note: Since Vitest sets VITEST=true, detectEnvironment() always returns 'test'.
 * We test the other behaviors that don't depend on NODE_ENV detection.
 *
 * @module @ferni/config/__tests__/environment
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectEnvironment,
  getConfig,
  getFirestoreDatabase,
  getGCPProjectId,
  isGoogleCloud,
  isMusicEnabled,
  loadConfig,
  resetConfig,
  validateConfig,
  type AppConfig,
} from '../environment.js';

describe('Environment Configuration', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    vi.unstubAllEnvs();
  });

  describe('detectEnvironment', () => {
    it('should detect test environment in Vitest', () => {
      // VITEST is automatically set by vitest, so this always returns 'test'
      expect(detectEnvironment()).toBe('test');
    });
  });

  describe('isGoogleCloud', () => {
    it('should return false by default', () => {
      expect(isGoogleCloud()).toBe(false);
    });

    it('should return true when K_SERVICE is set', () => {
      vi.stubEnv('K_SERVICE', 'my-service');
      expect(isGoogleCloud()).toBe(true);
    });

    it('should return true when GOOGLE_CLOUD_PROJECT is set', () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-project');
      expect(isGoogleCloud()).toBe(true);
    });
  });

  describe('getGCPProjectId', () => {
    it('should return undefined when no project env vars set', () => {
      expect(getGCPProjectId()).toBeUndefined();
    });

    it('should return GOOGLE_CLOUD_PROJECT', () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'gcp-project');
      expect(getGCPProjectId()).toBe('gcp-project');
    });

    it('should return GCLOUD_PROJECT as fallback', () => {
      vi.stubEnv('GCLOUD_PROJECT', 'gcloud-project');
      expect(getGCPProjectId()).toBe('gcloud-project');
    });

    it('should return GCP_PROJECT_ID as fallback', () => {
      vi.stubEnv('GCP_PROJECT_ID', 'gcp-project-id');
      expect(getGCPProjectId()).toBe('gcp-project-id');
    });

    it('should return FIREBASE_PROJECT_ID as fallback', () => {
      vi.stubEnv('FIREBASE_PROJECT_ID', 'firebase-project');
      expect(getGCPProjectId()).toBe('firebase-project');
    });

    it('should prefer GOOGLE_CLOUD_PROJECT over others', () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'preferred');
      vi.stubEnv('GCLOUD_PROJECT', 'fallback');
      expect(getGCPProjectId()).toBe('preferred');
    });
  });

  describe('getFirestoreDatabase', () => {
    it('should return (default) when no env var set', () => {
      expect(getFirestoreDatabase()).toBe('(default)');
    });

    it('should return custom database from env var', () => {
      vi.stubEnv('FIRESTORE_DATABASE', 'custom-db');
      expect(getFirestoreDatabase()).toBe('custom-db');
    });
  });

  describe('loadConfig', () => {
    it('should load configuration with test environment', () => {
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.environment).toBe('test'); // Always test in Vitest
      expect(config.personaId).toBe('ferni');
    });

    it('should use memory storage by default', () => {
      const config = loadConfig();
      expect(config.storage.type).toBe('memory');
    });

    it('should use custom MEMORY_STORE_TYPE', () => {
      vi.stubEnv('MEMORY_STORE_TYPE', 'firestore');
      resetConfig();
      const config = loadConfig();
      expect(config.storage.type).toBe('firestore');
    });

    it('should detect Google Cloud from GOOGLE_CLOUD_PROJECT', () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-project');
      resetConfig();
      const config = loadConfig();
      expect(config.isGoogleCloud).toBe(true);
    });

    it('should load API keys from environment', () => {
      vi.stubEnv('LIVEKIT_URL', 'wss://livekit.example.com');
      vi.stubEnv('LIVEKIT_API_KEY', 'api-key');
      vi.stubEnv('LIVEKIT_API_SECRET', 'api-secret');
      vi.stubEnv('GOOGLE_API_KEY', 'google-key');
      vi.stubEnv('CARTESIA_API_KEY', 'cartesia-key');
      resetConfig();

      const config = loadConfig();

      expect(config.apis.livekitUrl).toBe('wss://livekit.example.com');
      expect(config.apis.livekitApiKey).toBe('api-key');
      expect(config.apis.livekitApiSecret).toBe('api-secret');
      expect(config.apis.googleApiKey).toBe('google-key');
      expect(config.apis.cartesiaApiKey).toBe('cartesia-key');
    });

    it('should load Redis config when REDIS_URL is set', () => {
      vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
      resetConfig();
      const config = loadConfig();
      expect(config.cache.enabled).toBe(true);
      expect(config.cache.redisUrl).toBe('redis://localhost:6379');
    });

    it('should load Spotify integration when configured', () => {
      vi.stubEnv('SPOTIFY_CLIENT_ID', 'spotify-id');
      vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'spotify-secret');
      vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'spotify-refresh');
      resetConfig();

      const config = loadConfig();

      expect(config.integrations.spotify).toBeDefined();
      expect(config.integrations.spotify?.clientId).toBe('spotify-id');
    });

    it('should load Twilio integration when configured', () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'twilio-sid');
      vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-token');
      vi.stubEnv('TWILIO_PHONE_NUMBER', '+15551234567');
      resetConfig();

      const config = loadConfig();

      expect(config.integrations.twilio).toBeDefined();
      expect(config.integrations.twilio?.accountSid).toBe('twilio-sid');
    });
  });

  describe('getConfig', () => {
    it('should return cached config', () => {
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('should reload after resetConfig', () => {
      const config1 = getConfig();
      resetConfig();
      const config2 = getConfig();
      expect(config1).not.toBe(config2);
    });
  });

  describe('validateConfig', () => {
    it('should report missing required API keys', () => {
      const config: AppConfig = {
        ...loadConfig(),
        apis: {
          livekitUrl: '',
          livekitApiKey: '',
          livekitApiSecret: '',
          googleApiKey: '',
          cartesiaApiKey: '',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('LIVEKIT_URL is required');
      expect(result.errors).toContain('LIVEKIT_API_KEY is required');
      expect(result.errors).toContain('GOOGLE_API_KEY is required');
    });

    it('should pass with all required keys', () => {
      const config: AppConfig = {
        ...loadConfig(),
        apis: {
          livekitUrl: 'wss://livekit.example.com',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google',
          cartesiaApiKey: 'cartesia',
        },
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about memory storage in production', () => {
      const config: AppConfig = {
        ...loadConfig(),
        environment: 'production',
        storage: { type: 'memory' },
        apis: {
          livekitUrl: 'wss://livekit.example.com',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google',
          cartesiaApiKey: 'cartesia',
        },
      };

      const result = validateConfig(config);

      expect(result.warnings).toContain(
        'Using in-memory storage in production - data will not persist!'
      );
    });

    it('should warn about missing Redis in production', () => {
      const config: AppConfig = {
        ...loadConfig(),
        environment: 'production',
        cache: { enabled: false },
        apis: {
          livekitUrl: 'wss://livekit.example.com',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google',
          cartesiaApiKey: 'cartesia',
        },
      };

      const result = validateConfig(config);

      expect(result.warnings).toContain('Redis cache not configured - sessions may be slower');
    });
  });

  describe('isMusicEnabled', () => {
    it('should return true by default', () => {
      resetConfig();
      expect(isMusicEnabled()).toBe(true);
    });

    it('should return false when MUSIC_ENABLED=false', () => {
      vi.stubEnv('MUSIC_ENABLED', 'false');
      resetConfig();
      expect(isMusicEnabled()).toBe(false);
    });

    it('should return true for any value other than false', () => {
      vi.stubEnv('MUSIC_ENABLED', 'true');
      resetConfig();
      expect(isMusicEnabled()).toBe(true);

      vi.stubEnv('MUSIC_ENABLED', '1');
      resetConfig();
      expect(isMusicEnabled()).toBe(true);
    });
  });
});
