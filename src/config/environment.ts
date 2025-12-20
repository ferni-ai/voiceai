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

/**
 * Get the GCP project ID from any of the common env var names
 * Handles: GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, GCP_PROJECT_ID, FIREBASE_PROJECT_ID
 */
export function getGCPProjectId(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID
  );
}

/**
 * Get the Firestore database ID (defaults to '(default)')
 */
export function getFirestoreDatabase(): string {
  return process.env.FIRESTORE_DATABASE || '(default)';
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

  // Payments
  payments: {
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    stripePublishableKey?: string;
    // Seed Fund one-time contribution prices
    seedFundPrices: {
      seed5?: string; // Plant a Seed ($5)
      seed10?: string; // Sponsor a Conversation ($10)
      seed25?: string; // Help Someone Get Started ($25)
      seed50?: string; // Support the Mission ($50)
    };
    // Monthly subscription prices (Founding Member/Patron)
    subscriptionPrices: {
      foundingMember?: string; // $10/month
      foundingPatron?: string; // $20/month
    };
  };

  // URLs
  urls: {
    webhookBaseUrl?: string;
    dashboardUrl?: string;
  };

  // Optional integrations
  integrations: {
    alphaVantage?: string;
    sendgrid?: string;
    resend?: string;
    hume?: string;
    openai?: string;
    slackAlertsWebhook?: string;
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
    sip?: {
      trunkId: string;
      domain: string;
    };
  };

  // Cloud Storage
  cloudStorage: {
    voiceBucket?: string;
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

    personaId: process.env.PERSONA_ID || 'ferni',

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

    payments: {
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      stripePublishableKey:
        process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY,
      seedFundPrices: {
        seed5: process.env.STRIPE_PRICE_SEED_5, // Plant a Seed ($5)
        seed10: process.env.STRIPE_PRICE_SEED_10, // Sponsor a Conversation ($10)
        seed25: process.env.STRIPE_PRICE_SEED_25, // Help Someone Get Started ($25)
        seed50: process.env.STRIPE_PRICE_SEED_50, // Support the Mission ($50)
      },
      subscriptionPrices: {
        foundingMember: process.env.STRIPE_PRICE_FOUNDING_MEMBER || process.env.STRIPE_PRICE_FRIEND,
        foundingPatron:
          process.env.STRIPE_PRICE_FOUNDING_PATRON || process.env.STRIPE_PRICE_PARTNER,
      },
    },

    urls: {
      webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
      dashboardUrl: process.env.DASHBOARD_URL,
    },

    integrations: {
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      sendgrid: process.env.SENDGRID_API_KEY,
      resend: process.env.RESEND_API_KEY,
      hume: process.env.HUME_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      slackAlertsWebhook: process.env.SLACK_ALERTS_WEBHOOK_URL,
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
      sip:
        process.env.SIP_TRUNK_ID && process.env.SIP_DOMAIN
          ? {
              trunkId: process.env.SIP_TRUNK_ID,
              domain: process.env.SIP_DOMAIN,
            }
          : undefined,
    },

    cloudStorage: {
      voiceBucket: process.env.GCS_VOICE_BUCKET,
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
  logger.info(
    `│ Music:        ${(config.features.musicEnabled ? '✓ Enabled' : '✗ Disabled').padEnd(33)}│`
  );
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
  getGCPProjectId,
  getFirestoreDatabase,
};
