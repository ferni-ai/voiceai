/**
 * Comprehensive tests for config modules
 *
 * Tests all exported functions, constants, and configurations from:
 * - environment.ts
 * - feature-flags.ts
 * - handoff-timing.ts
 * - voice-ids.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// ENVIRONMENT.TS TESTS
// ============================================================================

describe('environment.ts', () => {
  describe('detectEnvironment', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Clear environment before each test
      delete process.env.NODE_ENV;
      delete process.env.VITEST;
      delete process.env.K_SERVICE;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect test environment from NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      const { detectEnvironment } = await import('../config/environment.js');
      expect(detectEnvironment()).toBe('test');
    });

    it('should detect test environment from VITEST flag', async () => {
      process.env.VITEST = 'true';
      const { detectEnvironment } = await import('../config/environment.js');
      expect(detectEnvironment()).toBe('test');
    });

    it('should detect production environment from NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const { detectEnvironment } = await import('../config/environment.js');
      expect(detectEnvironment()).toBe('production');
    });

    it('should detect production environment from K_SERVICE', async () => {
      process.env.K_SERVICE = 'my-service';
      const { detectEnvironment } = await import('../config/environment.js');
      expect(detectEnvironment()).toBe('production');
    });

    it('should default to development environment', async () => {
      const { detectEnvironment } = await import('../config/environment.js');
      expect(detectEnvironment()).toBe('development');
    });
  });

  describe('isGoogleCloud', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      delete process.env.K_SERVICE;
      delete process.env.GOOGLE_CLOUD_PROJECT;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when K_SERVICE is set', async () => {
      process.env.K_SERVICE = 'my-service';
      const { isGoogleCloud } = await import('../config/environment.js');
      expect(isGoogleCloud()).toBe(true);
    });

    it('should return true when GOOGLE_CLOUD_PROJECT is set', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      const { isGoogleCloud } = await import('../config/environment.js');
      expect(isGoogleCloud()).toBe(true);
    });

    it('should return false when neither is set', async () => {
      const { isGoogleCloud } = await import('../config/environment.js');
      expect(isGoogleCloud()).toBe(false);
    });
  });

  describe('loadConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Clear all env vars
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should load minimal config with defaults', async () => {
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.environment).toBeDefined();
      expect(config.personaId).toBe('nayan-patel');
      expect(config.storage.type).toBe('memory');
      expect(config.cache.enabled).toBe(false);
      expect(config.features.musicEnabled).toBe(true);
    });

    it('should use custom PERSONA_ID when set', async () => {
      process.env.PERSONA_ID = 'ferni';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.personaId).toBe('ferni');
    });

    it('should detect Firestore storage on GCP', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.storage.type).toBe('firestore');
      expect(config.storage.firestoreProject).toBe('my-project');
    });

    it('should detect Postgres storage when DATABASE_URL is set', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.storage.type).toBe('postgres');
      expect(config.storage.postgresUrl).toBe('postgresql://localhost/test');
    });

    it('should prefer MEMORY_STORE_TYPE override', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.MEMORY_STORE_TYPE = 'memory';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.storage.type).toBe('memory');
    });

    it('should enable cache when REDIS_URL is set', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.cache.enabled).toBe(true);
      expect(config.cache.redisUrl).toBe('redis://localhost:6379');
    });

    it('should enable cache when REDIS_HOST is set', async () => {
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6380';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.cache.enabled).toBe(true);
      expect(config.cache.redisUrl).toBe('redis://localhost:6380');
    });

    it('should use default Redis port when not specified', async () => {
      process.env.REDIS_HOST = 'localhost';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.cache.redisUrl).toBe('redis://localhost:6379');
    });

    it('should disable music when MUSIC_ENABLED=false', async () => {
      process.env.MUSIC_ENABLED = 'false';
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.features.musicEnabled).toBe(false);
    });

    it('should load API keys from environment', async () => {
      process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
      process.env.LIVEKIT_API_KEY = 'api-key';
      process.env.LIVEKIT_API_SECRET = 'api-secret';
      process.env.GOOGLE_API_KEY = 'google-key';
      process.env.CARTESIA_API_KEY = 'cartesia-key';

      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.apis.livekitUrl).toBe('wss://example.livekit.cloud');
      expect(config.apis.livekitApiKey).toBe('api-key');
      expect(config.apis.livekitApiSecret).toBe('api-secret');
      expect(config.apis.googleApiKey).toBe('google-key');
      expect(config.apis.cartesiaApiKey).toBe('cartesia-key');
    });

    it('should load Twilio integration when configured', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.integrations.twilio).toBeDefined();
      expect(config.integrations.twilio?.accountSid).toBe('AC123');
      expect(config.integrations.twilio?.authToken).toBe('token');
      expect(config.integrations.twilio?.phoneNumber).toBe('+15551234567');
    });

    it('should not load Twilio when TWILIO_ACCOUNT_SID is missing', async () => {
      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.integrations.twilio).toBeUndefined();
    });

    it('should load Spotify integration when configured', async () => {
      process.env.SPOTIFY_CLIENT_ID = 'client-id';
      process.env.SPOTIFY_CLIENT_SECRET = 'client-secret';
      process.env.SPOTIFY_REFRESH_TOKEN = 'refresh-token';

      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.integrations.spotify).toBeDefined();
      expect(config.integrations.spotify?.clientId).toBe('client-id');
      expect(config.integrations.spotify?.clientSecret).toBe('client-secret');
      expect(config.integrations.spotify?.refreshToken).toBe('refresh-token');
    });

    it('should load delivery integration when configured', async () => {
      process.env.DOORDASH_API_KEY = 'dd-key';
      process.env.UBER_CLIENT_ID = 'uber-id';

      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.integrations.delivery).toBeDefined();
      expect(config.integrations.delivery?.doordashApiKey).toBe('dd-key');
      expect(config.integrations.delivery?.uberClientId).toBe('uber-id');
    });

    it('should load optional integration keys', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'alpha-key';
      process.env.SENDGRID_API_KEY = 'sendgrid-key';
      process.env.YELP_API_KEY = 'yelp-key';

      const { loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(config.integrations.alphaVantage).toBe('alpha-key');
      expect(config.integrations.sendgrid).toBe('sendgrid-key');
      expect(config.integrations.yelp).toBe('yelp-key');
    });
  });

  describe('validateConfig', () => {
    it('should validate complete config successfully', async () => {
      const { validateConfig } = await import('../config/environment.js');
      const config = {
        environment: 'development' as const,
        isGoogleCloud: false,
        personaId: 'nayan-patel',
        storage: { type: 'memory' as const },
        cache: { enabled: false },
        features: { musicEnabled: true },
        apis: {
          livekitUrl: 'wss://example.livekit.cloud',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google-key',
          cartesiaApiKey: 'cartesia-key',
        },
        integrations: {},
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report errors for missing required API keys', async () => {
      const { validateConfig } = await import('../config/environment.js');
      const config = {
        environment: 'development' as const,
        isGoogleCloud: false,
        personaId: 'nayan-patel',
        storage: { type: 'memory' as const },
        cache: { enabled: false },
        features: { musicEnabled: true },
        apis: {
          livekitUrl: '',
          livekitApiKey: '',
          livekitApiSecret: '',
          googleApiKey: '',
          cartesiaApiKey: '',
        },
        integrations: {},
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('LIVEKIT_URL is required');
      expect(result.errors).toContain('LIVEKIT_API_KEY is required');
      expect(result.errors).toContain('LIVEKIT_API_SECRET is required');
      expect(result.errors).toContain('GOOGLE_API_KEY is required');
      expect(result.errors).toContain('CARTESIA_API_KEY is required');
    });

    it('should warn about in-memory storage in production', async () => {
      const { validateConfig } = await import('../config/environment.js');
      const config = {
        environment: 'production' as const,
        isGoogleCloud: false,
        personaId: 'nayan-patel',
        storage: { type: 'memory' as const },
        cache: { enabled: false },
        features: { musicEnabled: true },
        apis: {
          livekitUrl: 'wss://example.livekit.cloud',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google-key',
          cartesiaApiKey: 'cartesia-key',
        },
        integrations: {},
      };

      const result = validateConfig(config);

      expect(result.warnings).toContain(
        'Using in-memory storage in production - data will not persist!'
      );
    });

    it('should warn about missing Redis cache in production', async () => {
      const { validateConfig } = await import('../config/environment.js');
      const config = {
        environment: 'production' as const,
        isGoogleCloud: false,
        personaId: 'nayan-patel',
        storage: { type: 'firestore' as const },
        cache: { enabled: false },
        features: { musicEnabled: true },
        apis: {
          livekitUrl: 'wss://example.livekit.cloud',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google-key',
          cartesiaApiKey: 'cartesia-key',
        },
        integrations: {},
      };

      const result = validateConfig(config);

      expect(result.warnings).toContain('Redis cache not configured - sessions may be slower');
    });

    it('should warn about missing optional integrations', async () => {
      const { validateConfig } = await import('../config/environment.js');
      const config = {
        environment: 'development' as const,
        isGoogleCloud: false,
        personaId: 'nayan-patel',
        storage: { type: 'memory' as const },
        cache: { enabled: false },
        features: { musicEnabled: true },
        apis: {
          livekitUrl: 'wss://example.livekit.cloud',
          livekitApiKey: 'key',
          livekitApiSecret: 'secret',
          googleApiKey: 'google-key',
          cartesiaApiKey: 'cartesia-key',
        },
        integrations: {},
      };

      const result = validateConfig(config);

      expect(result.warnings).toContain('ALPHA_VANTAGE_API_KEY not set - market data unavailable');
    });
  });

  describe('getConfig and resetConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(async () => {
      process.env = originalEnv;
      const { resetConfig } = await import('../config/environment.js');
      resetConfig();
    });

    it('should cache config on first call', async () => {
      const { getConfig } = await import('../config/environment.js');
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2); // Same object reference
    });

    it('should reload config after reset', async () => {
      process.env.PERSONA_ID = 'ferni';
      const { getConfig, resetConfig } = await import('../config/environment.js');

      const config1 = getConfig();
      expect(config1.personaId).toBe('ferni');

      process.env.PERSONA_ID = 'nayan-patel';
      resetConfig();

      const config2 = getConfig();
      expect(config2.personaId).toBe('nayan-patel');
      expect(config1).not.toBe(config2);
    });
  });

  describe('printConfigSummary', () => {
    it('should not throw when printing config', async () => {
      const { printConfigSummary, loadConfig } = await import('../config/environment.js');
      const config = loadConfig();

      expect(() => printConfigSummary(config)).not.toThrow();
    });
  });
});

// ============================================================================
// FEATURE-FLAGS.TS TESTS
// ============================================================================

describe('feature-flags.ts', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear environment
    Object.keys(process.env).forEach((key) => {
      if (
        key.startsWith('DEBUG_') ||
        key.startsWith('ENABLE_') ||
        key.startsWith('EXPERIMENTAL_')
      ) {
        delete process.env[key];
      }
    });
  });

  afterEach(async () => {
    process.env = originalEnv;
    const { resetFeatureFlags } = await import('../config/feature-flags.js');
    resetFeatureFlags();
  });

  describe('getFeatureFlags', () => {
    it('should return default flags when no env vars set', async () => {
      const { getFeatureFlags } = await import('../config/feature-flags.js');
      const flags = getFeatureFlags();

      expect(flags).toBeDefined();
      expect(flags.humanization.enabled).toBe(true);
      expect(flags.humanization.disfluencies).toBe(true);
      expect(flags.debug.agent).toBe(false);
      expect(flags.experimental.voiceEmotionDetection).toBe(true);
      expect(flags.audio.musicEnabled).toBe(true);
    });

    it('should cache flags on subsequent calls', async () => {
      const { getFeatureFlags } = await import('../config/feature-flags.js');
      const flags1 = getFeatureFlags();
      const flags2 = getFeatureFlags();

      expect(flags1).toBe(flags2);
    });
  });

  describe('environment variable parsing', () => {
    it('should parse DEBUG_AGENT=true', async () => {
      process.env.DEBUG_AGENT = 'true';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(true);
    });

    it('should parse DEBUG_AGENT=1', async () => {
      process.env.DEBUG_AGENT = '1';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(true);
    });

    it('should parse DEBUG_AGENT=yes', async () => {
      process.env.DEBUG_AGENT = 'yes';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(true);
    });

    it('should parse DEBUG_AGENT=false', async () => {
      process.env.DEBUG_AGENT = 'false';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(false);
    });

    it('should parse DEBUG_AGENT=0', async () => {
      process.env.DEBUG_AGENT = '0';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(false);
    });

    it('should parse DEBUG_AGENT=no', async () => {
      process.env.DEBUG_AGENT = 'no';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(false);
    });

    it('should ignore empty string values', async () => {
      process.env.DEBUG_AGENT = '';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(false); // Default value
    });

    it('should ignore invalid values', async () => {
      process.env.DEBUG_AGENT = 'maybe';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(false); // Default value
    });

    it('should be case insensitive', async () => {
      process.env.DEBUG_AGENT = 'TRUE';
      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(true);
    });
  });

  describe('multiple environment variables', () => {
    it('should override multiple flags', async () => {
      process.env.DEBUG_AGENT = 'true';
      process.env.DEBUG_MEMORY = 'true';
      process.env.ENABLE_DISFLUENCIES = 'false';
      process.env.ENABLE_MUSIC = 'false';

      const { reloadFeatureFlags } = await import('../config/feature-flags.js');
      const flags = reloadFeatureFlags();

      expect(flags.debug.agent).toBe(true);
      expect(flags.debug.memory).toBe(true);
      expect(flags.humanization.disfluencies).toBe(false);
      expect(flags.audio.musicEnabled).toBe(false);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should check nested feature flags', async () => {
      const { isFeatureEnabled } = await import('../config/feature-flags.js');

      expect(isFeatureEnabled('humanization.disfluencies')).toBe(true);
      expect(isFeatureEnabled('debug.agent')).toBe(false);
    });

    it('should return false for non-existent paths', async () => {
      const { isFeatureEnabled } = await import('../config/feature-flags.js');

      expect(isFeatureEnabled('nonexistent.path')).toBe(false);
    });

    it('should work with environment overrides', async () => {
      process.env.DEBUG_AGENT = 'true';
      const { reloadFeatureFlags, isFeatureEnabled } = await import('../config/feature-flags.js');
      reloadFeatureFlags();

      expect(isFeatureEnabled('debug.agent')).toBe(true);
    });
  });

  describe('isDebugEnabled', () => {
    it('should check debug flags', async () => {
      const { isDebugEnabled } = await import('../config/feature-flags.js');

      expect(isDebugEnabled('agent')).toBe(false);
      expect(isDebugEnabled('memory')).toBe(false);
    });

    it('should work with environment overrides', async () => {
      process.env.DEBUG_HUMANIZING = 'true';
      const { reloadFeatureFlags, isDebugEnabled } = await import('../config/feature-flags.js');
      reloadFeatureFlags();

      expect(isDebugEnabled('humanizing')).toBe(true);
    });
  });

  describe('isExperimentalEnabled', () => {
    it('should check experimental flags', async () => {
      const { isExperimentalEnabled } = await import('../config/feature-flags.js');

      expect(isExperimentalEnabled('voiceEmotionDetection')).toBe(true);
      expect(isExperimentalEnabled('abTesting')).toBe(false);
    });

    it('should work with environment overrides', async () => {
      process.env.ENABLE_AB_TESTING = 'true';
      const { reloadFeatureFlags, isExperimentalEnabled } =
        await import('../config/feature-flags.js');
      reloadFeatureFlags();

      expect(isExperimentalEnabled('abTesting')).toBe(true);
    });
  });

  describe('isHumanizationEnabled', () => {
    it('should return true by default', async () => {
      const { isHumanizationEnabled } = await import('../config/feature-flags.js');

      expect(isHumanizationEnabled()).toBe(true);
    });

    it('should respect environment override', async () => {
      process.env.HUMANIZATION_ENABLED = 'false';
      const { reloadFeatureFlags, isHumanizationEnabled } =
        await import('../config/feature-flags.js');
      reloadFeatureFlags();

      expect(isHumanizationEnabled()).toBe(false);
    });
  });

  describe('getEnabledDebugCategories', () => {
    it('should return empty array when no debug flags enabled', async () => {
      const { getEnabledDebugCategories } = await import('../config/feature-flags.js');

      expect(getEnabledDebugCategories()).toEqual([]);
    });

    it('should return enabled debug categories', async () => {
      process.env.DEBUG_AGENT = 'true';
      process.env.DEBUG_MEMORY = 'true';
      process.env.DEBUG_TOOLS = 'true';

      const { reloadFeatureFlags, getEnabledDebugCategories } =
        await import('../config/feature-flags.js');
      reloadFeatureFlags();

      const enabled = getEnabledDebugCategories();
      expect(enabled).toContain('agent');
      expect(enabled).toContain('memory');
      expect(enabled).toContain('tools');
      expect(enabled).not.toContain('humanizing');
    });
  });

  describe('setFeatureFlagsForTesting', () => {
    it('should override specific flags', async () => {
      const { setFeatureFlagsForTesting, getFeatureFlags } =
        await import('../config/feature-flags.js');

      setFeatureFlagsForTesting({
        debug: { agent: true, humanizing: true },
      } as any);

      const flags = getFeatureFlags();
      expect(flags.debug.agent).toBe(true);
      expect(flags.debug.humanizing).toBe(true);
    });

    it('should deep merge overrides', async () => {
      const { setFeatureFlagsForTesting, getFeatureFlags } =
        await import('../config/feature-flags.js');

      setFeatureFlagsForTesting({
        humanization: { disfluencies: false },
      } as any);

      const flags = getFeatureFlags();
      expect(flags.humanization.disfluencies).toBe(false);
      expect(flags.humanization.backchannels).toBe(true); // Other flags unchanged
    });
  });

  describe('reloadFeatureFlags', () => {
    it('should reload flags from environment', async () => {
      const { getFeatureFlags, reloadFeatureFlags } = await import('../config/feature-flags.js');

      const flags1 = getFeatureFlags();
      expect(flags1.debug.agent).toBe(false);

      process.env.DEBUG_AGENT = 'true';
      const flags2 = reloadFeatureFlags();

      expect(flags2.debug.agent).toBe(true);
      expect(flags1).not.toBe(flags2);
    });
  });

  describe('resetFeatureFlags', () => {
    it('should clear cached flags', async () => {
      const { getFeatureFlags, resetFeatureFlags } = await import('../config/feature-flags.js');

      const flags1 = getFeatureFlags();
      resetFeatureFlags();
      const flags2 = getFeatureFlags();

      expect(flags1).not.toBe(flags2);
    });
  });
});

// ============================================================================
// HANDOFF-TIMING.TS TESTS
// ============================================================================

describe('handoff-timing.ts', () => {
  describe('HANDOFF_TIMING constants', () => {
    it('should export all timing constants', async () => {
      const { HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      expect(HANDOFF_TIMING.USER_INITIATED).toBe(200);
      expect(HANDOFF_TIMING.FIRST_MEETING).toBe(400);
      expect(HANDOFF_TIMING.RETURNING_TO_COACH).toBe(300);
      expect(HANDOFF_TIMING.STANDARD).toBe(350);
      expect(HANDOFF_TIMING.DEBOUNCE_MS).toBe(800);
      expect(HANDOFF_TIMING.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(HANDOFF_TIMING.MAX_HANDOFFS_PER_WINDOW).toBe(15);
      expect(HANDOFF_TIMING.HANDOFF_TIMEOUT_MS).toBe(15000);
    });

    it('should have post-sound pause constants', async () => {
      const { HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      expect(HANDOFF_TIMING.POST_SOUND_PAUSE_BASE).toBe(250);
      expect(HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS).toBe(150);
      expect(HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS).toBe(100);
    });
  });

  describe('TRANSITION_MULTIPLIERS', () => {
    it('should export transition multipliers', async () => {
      const { TRANSITION_MULTIPLIERS } = await import('../config/handoff-timing.js');

      expect(TRANSITION_MULTIPLIERS.standard).toBe(1.0);
      expect(TRANSITION_MULTIPLIERS.dramatic).toBe(1.3);
      expect(TRANSITION_MULTIPLIERS.subtle).toBe(0.8);
      expect(TRANSITION_MULTIPLIERS.warm).toBe(1.0);
    });
  });

  describe('getTransitionDelay', () => {
    it('should return user-initiated delay when requested', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('standard', true);
      expect(delay).toBe(HANDOFF_TIMING.USER_INITIATED);
    });

    it('should return first meeting delay', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('standard', false, true);
      expect(delay).toBe(HANDOFF_TIMING.FIRST_MEETING);
    });

    it('should return returning to coach delay', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('standard', false, false, true);
      expect(delay).toBe(HANDOFF_TIMING.RETURNING_TO_COACH);
    });

    it('should return standard delay by default', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('standard');
      expect(delay).toBe(HANDOFF_TIMING.STANDARD);
    });

    it('should apply dramatic multiplier', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('dramatic', false, true);
      expect(delay).toBe(Math.round(HANDOFF_TIMING.FIRST_MEETING * 1.3));
    });

    it('should apply subtle multiplier', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('subtle');
      expect(delay).toBe(Math.round(HANDOFF_TIMING.STANDARD * 0.8));
    });

    it('should prioritize user-initiated over other flags', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('dramatic', true, true, true);
      expect(delay).toBe(Math.round(HANDOFF_TIMING.USER_INITIATED * 1.3));
    });

    it('should prioritize first meeting over returning to coach', async () => {
      const { getTransitionDelay, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const delay = getTransitionDelay('standard', false, true, true);
      expect(delay).toBe(HANDOFF_TIMING.FIRST_MEETING);
    });
  });

  describe('getPostSoundPause', () => {
    it('should return base pause by default', async () => {
      const { getPostSoundPause, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const pause = getPostSoundPause('standard');
      expect(pause).toBe(HANDOFF_TIMING.POST_SOUND_PAUSE_BASE);
    });

    it('should add first meeting bonus', async () => {
      const { getPostSoundPause, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const pause = getPostSoundPause('standard', true);
      expect(pause).toBe(
        HANDOFF_TIMING.POST_SOUND_PAUSE_BASE + HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS
      );
    });

    it('should add dramatic bonus', async () => {
      const { getPostSoundPause, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const pause = getPostSoundPause('dramatic');
      expect(pause).toBe(
        HANDOFF_TIMING.POST_SOUND_PAUSE_BASE + HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS
      );
    });

    it('should combine first meeting and dramatic bonuses', async () => {
      const { getPostSoundPause, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const pause = getPostSoundPause('dramatic', true);
      expect(pause).toBe(
        HANDOFF_TIMING.POST_SOUND_PAUSE_BASE +
          HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS +
          HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS
      );
    });
  });

  describe('isHandoffAllowed', () => {
    it('should allow handoff after debounce period', async () => {
      const { isHandoffAllowed, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const lastHandoff = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS - 100;
      expect(isHandoffAllowed(lastHandoff)).toBe(true);
    });

    it('should disallow handoff within debounce period', async () => {
      const { isHandoffAllowed, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const lastHandoff = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS + 100;
      expect(isHandoffAllowed(lastHandoff)).toBe(false);
    });

    it('should allow handoff exactly at debounce boundary', async () => {
      const { isHandoffAllowed, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const lastHandoff = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS;
      expect(isHandoffAllowed(lastHandoff)).toBe(true);
    });
  });

  describe('getRateLimitCooldown', () => {
    it('should return 0 when handoff is allowed', async () => {
      const { getRateLimitCooldown, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const lastHandoff = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS - 100;
      expect(getRateLimitCooldown(lastHandoff)).toBe(0);
    });

    it('should return remaining cooldown time', async () => {
      const { getRateLimitCooldown, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const remainingMs = 200;
      const lastHandoff = Date.now() - HANDOFF_TIMING.DEBOUNCE_MS + remainingMs;
      const cooldown = getRateLimitCooldown(lastHandoff);

      expect(cooldown).toBeGreaterThan(0);
      expect(cooldown).toBeLessThanOrEqual(remainingMs);
    });

    it('should return full debounce time for immediate retry', async () => {
      const { getRateLimitCooldown, HANDOFF_TIMING } = await import('../config/handoff-timing.js');

      const lastHandoff = Date.now();
      const cooldown = getRateLimitCooldown(lastHandoff);

      expect(cooldown).toBeGreaterThan(HANDOFF_TIMING.DEBOUNCE_MS - 50);
      expect(cooldown).toBeLessThanOrEqual(HANDOFF_TIMING.DEBOUNCE_MS);
    });
  });
});

// ============================================================================
// VOICE-IDS.TS TESTS
// ============================================================================

describe('voice-ids.ts', () => {
  describe('VOICE_IDS constants', () => {
    it('should export all voice ID constants', async () => {
      const { VOICE_IDS } = await import('../config/voice-ids.js');

      expect(VOICE_IDS.FERNI).toBeDefined();
      expect(VOICE_IDS.PETER_JOHN).toBeDefined();
      expect(VOICE_IDS.ALEX_CHEN).toBeDefined();
      expect(VOICE_IDS.MAYA_SANTOS).toBeDefined();
      expect(VOICE_IDS.JORDAN_TAYLOR).toBeDefined();
      expect(VOICE_IDS.NAYAN_PATEL).toBeDefined();
      expect(VOICE_IDS.GENERIC).toBeDefined();
    });

    it('should have valid UUID format for all voice IDs', async () => {
      const { VOICE_IDS, isValidVoiceId } = await import('../config/voice-ids.js');

      Object.values(VOICE_IDS).forEach((voiceId) => {
        expect(isValidVoiceId(voiceId)).toBe(true);
      });
    });
  });

  describe('getVoiceIdForPersona', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return Ferni voice ID for ferni persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('ferni')).toBe(VOICE_IDS.FERNI);
    });

    it('should handle case-insensitive persona IDs', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('FERNI')).toBe(VOICE_IDS.FERNI);
      expect(getVoiceIdForPersona('Ferni')).toBe(VOICE_IDS.FERNI);
    });

    it('should handle persona aliases', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('jack-b')).toBe(VOICE_IDS.FERNI);
      expect(getVoiceIdForPersona('coach')).toBe(VOICE_IDS.FERNI);
      expect(getVoiceIdForPersona('life-coach')).toBe(VOICE_IDS.FERNI);
    });

    it('should return Peter John voice ID for peter-john persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('peter-john')).toBe(VOICE_IDS.PETER_JOHN);
      expect(getVoiceIdForPersona('peter')).toBe(VOICE_IDS.PETER_JOHN);
      expect(getVoiceIdForPersona('john')).toBe(VOICE_IDS.PETER_JOHN);
    });

    it('should return Alex Chen voice ID for alex-chen persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('alex-chen')).toBe(VOICE_IDS.ALEX_CHEN);
      expect(getVoiceIdForPersona('alex')).toBe(VOICE_IDS.ALEX_CHEN);
      expect(getVoiceIdForPersona('comm-specialist')).toBe(VOICE_IDS.ALEX_CHEN);
    });

    it('should return Maya Santos voice ID for maya-santos persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('maya-santos')).toBe(VOICE_IDS.MAYA_SANTOS);
      expect(getVoiceIdForPersona('maya')).toBe(VOICE_IDS.MAYA_SANTOS);
      expect(getVoiceIdForPersona('spend-save')).toBe(VOICE_IDS.MAYA_SANTOS);
    });

    it('should return Jordan Taylor voice ID for jordan-taylor persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('jordan-taylor')).toBe(VOICE_IDS.JORDAN_TAYLOR);
      expect(getVoiceIdForPersona('jordan')).toBe(VOICE_IDS.JORDAN_TAYLOR);
      expect(getVoiceIdForPersona('event-planner')).toBe(VOICE_IDS.JORDAN_TAYLOR);
    });

    it('should return Nayan Patel voice ID for nayan-patel persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('nayan-patel')).toBe(VOICE_IDS.NAYAN_PATEL);
      expect(getVoiceIdForPersona('nayan')).toBe(VOICE_IDS.NAYAN_PATEL);
      expect(getVoiceIdForPersona('patel')).toBe(VOICE_IDS.NAYAN_PATEL);
      expect(getVoiceIdForPersona('guru')).toBe(VOICE_IDS.NAYAN_PATEL);
      expect(getVoiceIdForPersona('mystic')).toBe(VOICE_IDS.NAYAN_PATEL);
      expect(getVoiceIdForPersona('lifetime-advisor')).toBe(VOICE_IDS.NAYAN_PATEL);
    });

    it('should return generic advisor voice ID', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('generic-advisor')).toBe(VOICE_IDS.GENERIC);
    });

    it('should fallback to Ferni for unknown persona', async () => {
      const { getVoiceIdForPersona, VOICE_IDS } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('unknown-persona')).toBe(VOICE_IDS.FERNI);
    });

    it('should use environment variable override for Ferni', async () => {
      process.env.FERNI_VOICE_ID = 'custom-ferni-id';
      const { getVoiceIdForPersona } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('ferni')).toBe('custom-ferni-id');
    });

    it('should use legacy JACK_B_VOICE_ID as fallback', async () => {
      process.env.JACK_B_VOICE_ID = 'legacy-jack-id';
      const { getVoiceIdForPersona } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('ferni')).toBe('legacy-jack-id');
    });

    it('should prefer canonical env var over legacy', async () => {
      process.env.FERNI_VOICE_ID = 'canonical-id';
      process.env.JACK_B_VOICE_ID = 'legacy-id';
      const { getVoiceIdForPersona } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('ferni')).toBe('canonical-id');
    });

    it('should use environment variable override for Peter John', async () => {
      process.env.PETER_JOHN_VOICE_ID = 'custom-peter-id';
      const { getVoiceIdForPersona } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('peter-john')).toBe('custom-peter-id');
    });

    it('should use environment variable override for Nayan Patel', async () => {
      process.env.NAYAN_PATEL_VOICE_ID = 'custom-nayan-id';
      const { getVoiceIdForPersona } = await import('../config/voice-ids.js');

      expect(getVoiceIdForPersona('nayan-patel')).toBe('custom-nayan-id');
    });
  });

  describe('isValidVoiceId', () => {
    it('should validate valid UUID v4 format', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId('fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc')).toBe(true);
      expect(isValidVoiceId('3f04e815-3260-4f50-8fd9-af9c657be4c2')).toBe(true);
    });

    it('should accept lowercase UUIDs', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId('fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc')).toBe(true);
    });

    it('should accept uppercase UUIDs', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId('FDEB5D75-4F2E-4224-9E98-6AA6AA1188BC')).toBe(true);
    });

    it('should reject invalid UUID formats', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId('not-a-uuid')).toBe(false);
      expect(isValidVoiceId('12345')).toBe(false);
      expect(isValidVoiceId('fdeb5d75-4f2e-4224-9e98')).toBe(false); // Too short
      expect(isValidVoiceId('fdeb5d75_4f2e_4224_9e98_6aa6aa1188bc')).toBe(false); // Wrong separator
    });

    it('should reject empty or null values', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId('')).toBe(false);
      expect(isValidVoiceId(null as any)).toBe(false);
      expect(isValidVoiceId(undefined as any)).toBe(false);
    });

    it('should reject non-string values', async () => {
      const { isValidVoiceId } = await import('../config/voice-ids.js');

      expect(isValidVoiceId(123 as any)).toBe(false);
      expect(isValidVoiceId({} as any)).toBe(false);
      expect(isValidVoiceId([] as any)).toBe(false);
    });
  });

  describe('logVoiceIdAssignments', () => {
    it('should not throw when logging assignments', async () => {
      const { logVoiceIdAssignments } = await import('../config/voice-ids.js');

      expect(() => logVoiceIdAssignments()).not.toThrow();
    });
  });

  describe('getVoiceIdFromManifest', () => {
    it('should attempt to get voice ID from manifest', async () => {
      const { getVoiceIdFromManifest } = await import('../config/voice-ids.js');

      // Should not throw, will fallback to legacy lookup if manifest fails
      const voiceId = await getVoiceIdFromManifest('ferni');
      expect(voiceId).toBeDefined();
      expect(typeof voiceId).toBe('string');
    });

    it('should fallback to legacy lookup on error', async () => {
      const { getVoiceIdFromManifest, VOICE_IDS } = await import('../config/voice-ids.js');

      // Unknown persona should fallback
      const voiceId = await getVoiceIdFromManifest('unknown-persona');
      expect(voiceId).toBe(VOICE_IDS.FERNI);
    });
  });
});
