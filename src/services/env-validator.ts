/**
 * Environment Variable Validator
 *
 * Validates required environment variables at startup.
 * Fails fast if critical variables are missing.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// ENVIRONMENT VARIABLE DEFINITIONS
// ============================================================================

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  category: 'core' | 'memory' | 'ai' | 'communication' | 'banking' | 'entertainment';
}

const ENV_VARS: EnvVar[] = [
  // Core - required for basic operation
  { name: 'LIVEKIT_API_KEY', required: true, description: 'LiveKit API key', category: 'core' },
  {
    name: 'LIVEKIT_API_SECRET',
    required: true,
    description: 'LiveKit API secret',
    category: 'core',
  },
  { name: 'LIVEKIT_URL', required: true, description: 'LiveKit server URL', category: 'core' },

  // AI - required for LLM functionality
  { name: 'GOOGLE_API_KEY', required: true, description: 'Google Gemini API key', category: 'ai' },
  { name: 'CARTESIA_API_KEY', required: true, description: 'Cartesia TTS API key', category: 'ai' },

  // Memory - optional but recommended
  {
    name: 'DATABASE_URL',
    required: false,
    description: 'PostgreSQL connection string',
    category: 'memory',
  },
  {
    name: 'GOOGLE_CLOUD_PROJECT',
    required: false,
    description: 'GCP project for Firestore',
    category: 'memory',
  },
  { name: 'REDIS_URL', required: false, description: 'Redis connection URL', category: 'memory' },

  // Communication - optional
  {
    name: 'SENDGRID_API_KEY',
    required: false,
    description: 'SendGrid API key for email',
    category: 'communication',
  },
  {
    name: 'SENDGRID_FROM_EMAIL',
    required: false,
    description: 'From email address',
    category: 'communication',
  },
  {
    name: 'TWILIO_ACCOUNT_SID',
    required: false,
    description: 'Twilio account SID',
    category: 'communication',
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    required: false,
    description: 'Twilio auth token',
    category: 'communication',
  },
  {
    name: 'TWILIO_PHONE_NUMBER',
    required: false,
    description: 'Twilio phone number',
    category: 'communication',
  },

  // Banking - optional
  { name: 'PLAID_CLIENT_ID', required: false, description: 'Plaid client ID', category: 'banking' },
  { name: 'PLAID_SECRET', required: false, description: 'Plaid secret key', category: 'banking' },
  {
    name: 'PLAID_ENV',
    required: false,
    description: 'Plaid environment (sandbox/development/production)',
    category: 'banking',
  },

  // Entertainment - optional
  {
    name: 'SPOTIFY_CLIENT_ID',
    required: false,
    description: 'Spotify client ID',
    category: 'entertainment',
  },
  {
    name: 'SPOTIFY_CLIENT_SECRET',
    required: false,
    description: 'Spotify client secret',
    category: 'entertainment',
  },

  // Market Data - optional
  {
    name: 'ALPHA_VANTAGE_API_KEY',
    required: false,
    description: 'Alpha Vantage API key',
    category: 'ai',
  },

  // Voice Configuration - optional (has defaults)
  {
    name: 'JACK_BOGLE_VOICE_ID',
    required: false,
    description: 'Cartesia voice ID for Jack Bogle',
    category: 'ai',
  },
  {
    name: 'PETER_LYNCH_VOICE_ID',
    required: false,
    description: 'Cartesia voice ID for Peter John',
    category: 'ai',
  },

  // Telephony - optional
  {
    name: 'SIP_TRUNK_ID',
    required: false,
    description: 'LiveKit SIP trunk ID for outbound calls',
    category: 'communication',
  },
  {
    name: 'CALLER_ID',
    required: false,
    description: 'Caller ID for outbound calls',
    category: 'communication',
  },

  // Plaid - optional
  {
    name: 'PLAID_LINK_BASE_URL',
    required: false,
    description: 'URL for hosted Plaid Link page',
    category: 'banking',
  },
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
  available: Record<string, boolean>;
}

/**
 * Validate all environment variables
 * Returns result with missing required vars and warnings for optional ones
 */
export function validateEnvironment(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    missing: [],
    warnings: [],
    available: {},
  };

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];
    const isSet = !!value && value.trim() !== '';

    result.available[envVar.name] = isSet;

    if (envVar.required && !isSet) {
      result.valid = false;
      result.missing.push(`${envVar.name} - ${envVar.description}`);
    } else if (!envVar.required && !isSet) {
      result.warnings.push(`${envVar.name} not set - ${envVar.description}`);
    }
  }

  return result;
}

/**
 * Get a summary of available features based on env vars
 */
export function getFeatureAvailability(): Record<string, boolean> {
  return {
    livekitCore: !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    geminiLLM: !!process.env.GOOGLE_API_KEY,
    cartesiaTTS: !!process.env.CARTESIA_API_KEY,
    postgresMemory: !!process.env.DATABASE_URL,
    firestoreMemory: !!process.env.GOOGLE_CLOUD_PROJECT,
    redisCache: !!process.env.REDIS_URL,
    emailNotifications: !!process.env.SENDGRID_API_KEY,
    smsNotifications: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    plaidBanking: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    // Music master flag - controls whether music tools are available
    musicEnabled: process.env.MUSIC_ENABLED === 'true',
    // Spotify configuration - only meaningful if musicEnabled is true
    spotifyMusic: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    marketData: !!process.env.ALPHA_VANTAGE_API_KEY,
  };
}

/**
 * Validate environment at startup and log results
 * Throws if required variables are missing
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();
  const features = getFeatureAvailability();

  // Log available features
  getLogger().info({ features }, 'Feature availability');

  if (!result.valid) {
    const errorMsg = `Missing required environment variables:\n  - ${result.missing.join('\n  - ')}`;
    getLogger().error({ missing: result.missing }, errorMsg);
    throw new Error(errorMsg);
  }

  // Log warnings for optional vars
  if (result.warnings.length > 0) {
    getLogger().warn(
      {
        count: result.warnings.length,
        warnings: result.warnings.slice(0, 5), // Limit to avoid log spam
      },
      'Some optional environment variables not configured'
    );
  }

  getLogger().info('Environment validation passed');
}

/**
 * Check if a specific feature is available
 */
export function isFeatureAvailable(
  feature: keyof ReturnType<typeof getFeatureAvailability>
): boolean {
  const features = getFeatureAvailability();
  return features[feature] ?? false;
}

/**
 * Get list of missing optional features for user feedback
 */
export function getMissingFeatures(): string[] {
  const features = getFeatureAvailability();
  const missing: string[] = [];

  if (!features.emailNotifications)
    missing.push('Email notifications (configure SENDGRID_API_KEY)');
  if (!features.smsNotifications) missing.push('SMS notifications (configure TWILIO_*)');
  if (!features.plaidBanking) missing.push('Bank account linking (configure PLAID_*)');
  // Music is disabled by default - only note if they have Spotify configured but music disabled
  if (features.spotifyMusic && !features.musicEnabled) {
    missing.push('Music playback (set MUSIC_ENABLED=true to enable)');
  } else if (!features.spotifyMusic && features.musicEnabled) {
    missing.push('Spotify music (configure SPOTIFY_* for full music)');
  }
  if (!features.marketData) missing.push('Real-time market data (configure ALPHA_VANTAGE_API_KEY)');
  if (!features.redisCache) missing.push('Session caching (configure REDIS_URL)');

  return missing;
}

export default {
  validateEnvironment,
  validateEnvironmentOrThrow,
  getFeatureAvailability,
  isFeatureAvailable,
  getMissingFeatures,
};
