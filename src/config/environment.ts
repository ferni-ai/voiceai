/**
 * Environment Configuration
 *
 * Unified configuration that works seamlessly in:
 * - Local development (in-memory or Docker services)
 * - Google Cloud Run (Firestore + Memorystore)
 *
 * Auto-detects environment and selects appropriate backends.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

export type Environment = 'development' | 'production' | 'test';

export function detectEnvironment(): Environment {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return 'test';
  }
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    return 'production';
  }
  return 'development';
}

export function isGoogleCloud(): boolean {
  // K_SERVICE is set by Cloud Run
  return !!(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AppConfig {
  environment: Environment;
  isGoogleCloud: boolean;

  // Persona
  personaId: string;

  // Storage
  storage: {
    type: 'memory' | 'firestore' | 'postgres';
    postgresUrl?: string;
    firestoreProject?: string;
  };

  // Cache
  cache: {
    enabled: boolean;
    redisUrl?: string;
  };

  // Feature Flags
  features: {
    /** Enable/disable all music functionality (tools, playback, ambient music) */
    musicEnabled: boolean;
  };

  // APIs
  apis: {
    livekitUrl: string;
    livekitApiKey: string;
    livekitApiSecret: string;
    googleApiKey: string;
    cartesiaApiKey: string;
  };

  // Optional integrations
  integrations: {
    alphaVantage?: string;
    sendgrid?: string;
    twilio?: {
      accountSid: string;
      authToken: string;
      phoneNumber: string;
    };
    spotify?: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    };
    yelp?: string;
    delivery?: {
      doordashApiKey?: string;
      doordashDeveloperId?: string;
      doordashKeyId?: string;
      doordashSigningSecret?: string;
      uberClientId?: string;
      uberClientSecret?: string;
    };
  };
}

/**
 * Load configuration from environment
 * Auto-detects the best settings for current environment
 */
export function loadConfig(): AppConfig {
  const env = detectEnvironment();
  const isGCP = isGoogleCloud();

  getLogger().info({ environment: env, isGoogleCloud: isGCP }, 'Loading configuration');

  // Determine storage type
  let storageType: 'memory' | 'firestore' | 'postgres' = 'memory';

  if (process.env.MEMORY_STORE_TYPE) {
    storageType = process.env.MEMORY_STORE_TYPE as typeof storageType;
  } else if (isGCP || process.env.GOOGLE_CLOUD_PROJECT) {
    storageType = 'firestore';
  } else if (process.env.DATABASE_URL) {
    storageType = 'postgres';
  }

  const config: AppConfig = {
    environment: env,
    isGoogleCloud: isGCP,

    personaId: process.env.PERSONA_ID || 'nayan-patel',

    storage: {
      type: storageType,
      postgresUrl: process.env.DATABASE_URL,
      firestoreProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    },

    cache: {
      enabled: !!(process.env.REDIS_URL || process.env.REDIS_HOST),
      redisUrl:
        process.env.REDIS_URL ||
        (process.env.REDIS_HOST
          ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
          : undefined),
    },

    features: {
      // Music is ENABLED by default. Set MUSIC_ENABLED=false to disable music tools and playback.
      musicEnabled: process.env.MUSIC_ENABLED !== 'false',
    },

    apis: {
      livekitUrl: process.env.LIVEKIT_URL || '',
      livekitApiKey: process.env.LIVEKIT_API_KEY || '',
      livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
      googleApiKey: process.env.GOOGLE_API_KEY || '',
      cartesiaApiKey: process.env.CARTESIA_API_KEY || '',
    },

    integrations: {
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      sendgrid: process.env.SENDGRID_API_KEY,
      twilio: process.env.TWILIO_ACCOUNT_SID
        ? {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
          }
        : undefined,
      spotify: process.env.SPOTIFY_CLIENT_ID
        ? {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
            refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || '',
          }
        : undefined,
      yelp: process.env.YELP_API_KEY,
      delivery:
        process.env.DOORDASH_API_KEY || process.env.UBER_CLIENT_ID
          ? {
              doordashApiKey: process.env.DOORDASH_API_KEY,
              doordashDeveloperId: process.env.DOORDASH_DEVELOPER_ID,
              doordashKeyId: process.env.DOORDASH_KEY_ID,
              doordashSigningSecret: process.env.DOORDASH_SIGNING_SECRET,
              uberClientId: process.env.UBER_CLIENT_ID,
              uberClientSecret: process.env.UBER_CLIENT_SECRET,
            }
          : undefined,
    },
  };

  return config;
}

/**
 * Validate configuration and report issues
 */
export function validateConfig(config: AppConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required for all environments
  if (!config.apis.livekitUrl) errors.push('LIVEKIT_URL is required');
  if (!config.apis.livekitApiKey) errors.push('LIVEKIT_API_KEY is required');
  if (!config.apis.livekitApiSecret) errors.push('LIVEKIT_API_SECRET is required');
  if (!config.apis.googleApiKey) errors.push('GOOGLE_API_KEY is required');
  if (!config.apis.cartesiaApiKey) errors.push('CARTESIA_API_KEY is required');

  // Warnings for optional features
  if (config.storage.type === 'memory' && config.environment === 'production') {
    warnings.push('Using in-memory storage in production - data will not persist!');
  }

  if (!config.cache.enabled && config.environment === 'production') {
    warnings.push('Redis cache not configured - sessions may be slower');
  }

  if (!config.integrations.alphaVantage) {
    warnings.push('ALPHA_VANTAGE_API_KEY not set - market data unavailable');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Print configuration summary (safe - no secrets)
 */
export function printConfigSummary(config: AppConfig): void {
  const logger = getLogger();

  logger.info('┌─────────────────────────────────────────────────┐');
  logger.info('│           Voice AI Configuration               │');
  logger.info('├─────────────────────────────────────────────────┤');
  logger.info(`│ Environment:  ${config.environment.padEnd(33)}│`);
  logger.info(`│ Google Cloud: ${(config.isGoogleCloud ? 'Yes' : 'No').padEnd(33)}│`);
  logger.info(`│ Persona:      ${config.personaId.padEnd(33)}│`);
  logger.info(`│ Storage:      ${config.storage.type.padEnd(33)}│`);
  logger.info(`│ Redis Cache:  ${(config.cache.enabled ? 'Enabled' : 'Disabled').padEnd(33)}│`);
  logger.info('├─────────────────────────────────────────────────┤');
  logger.info(`│ Music:        ${(config.features.musicEnabled ? '✓ Enabled' : '✗ Disabled').padEnd(33)}│`);
  logger.info('├─────────────────────────────────────────────────┤');
  logger.info(
    `│ LiveKit:      ${(config.apis.livekitUrl ? '✓ Configured' : '✗ Missing').padEnd(33)}│`
  );
  logger.info(
    `│ Google AI:    ${(config.apis.googleApiKey ? '✓ Configured' : '✗ Missing').padEnd(33)}│`
  );
  logger.info(
    `│ Cartesia:     ${(config.apis.cartesiaApiKey ? '✓ Configured' : '✗ Missing').padEnd(33)}│`
  );
  logger.info(
    `│ Market Data:  ${(config.integrations.alphaVantage ? '✓ Configured' : '○ Optional').padEnd(33)}│`
  );
  logger.info(
    `│ Spotify:      ${(config.integrations.spotify ? '✓ Configured' : '○ Optional').padEnd(33)}│`
  );
  logger.info(
    `│ Yelp:         ${(config.integrations.yelp ? '✓ Configured' : '○ Optional').padEnd(33)}│`
  );
  logger.info(
    `│ Twilio:       ${(config.integrations.twilio ? '✓ Configured' : '○ Optional').padEnd(33)}│`
  );
  logger.info(
    `│ Delivery:     ${(config.integrations.delivery ? '✓ Configured' : '○ Optional').padEnd(33)}│`
  );
  logger.info('└─────────────────────────────────────────────────┘');
}

/**
 * Check if music functionality is enabled
 * Returns false by default - set MUSIC_ENABLED=true to enable
 */
export function isMusicEnabled(): boolean {
  return getConfig().features.musicEnabled;
}

// ============================================================================
// SINGLETON
// ============================================================================

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}

export default {
  load: loadConfig,
  get: getConfig,
  validate: validateConfig,
  print: printConfigSummary,
  detectEnvironment,
  isGoogleCloud,
  isMusicEnabled,
};
