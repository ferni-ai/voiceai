/**
 * Service Dependency Validator
 *
 * Validates that required services are available before tool execution.
 * Provides clear error messages when dependencies are missing.
 *
 * USAGE:
 *   const validator = new ServiceDependencyValidator();
 *   const result = validator.validate(['twilio', 'firestore'], { twilio: twilioClient, firestore: db });
 *   if (!result.valid) {
 *     return result.errorMessage;
 *   }
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceConfig {
  twilio?: {
    accountSid: string;
    authToken: string;
  };
  firestore?: unknown;
  spotify?: {
    clientId: string;
    clientSecret: string;
  };
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken?: string;
  };
  linkedin?: {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
  };
  homeAssistant?: {
    url: string;
    token: string;
  };
  googlePlaces?: {
    apiKey: string;
  };
  plaid?: {
    clientId: string;
    secret: string;
  };
}

export type ServiceName = keyof ServiceConfig;

export interface ValidationResult {
  valid: boolean;
  missingServices: ServiceName[];
  errorMessage: string;
}

// ============================================================================
// ENVIRONMENT VARIABLE REQUIREMENTS
// ============================================================================

/**
 * Maps services to their required environment variables
 */
export const SERVICE_ENV_VARS: Record<ServiceName, string[]> = {
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
  firestore: ['GOOGLE_CLOUD_PROJECT'],
  spotify: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
  twitter: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  homeAssistant: ['HOME_ASSISTANT_URL', 'HOME_ASSISTANT_TOKEN'],
  googlePlaces: ['GOOGLE_PLACES_API_KEY'],
  plaid: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
};

/**
 * User-friendly service names for error messages
 */
export const SERVICE_DISPLAY_NAMES: Record<ServiceName, string> = {
  twilio: 'phone calling (Twilio)',
  firestore: 'database (Firestore)',
  spotify: 'music (Spotify)',
  twitter: 'Twitter posting',
  linkedin: 'LinkedIn integration',
  homeAssistant: 'smart home (Home Assistant)',
  googlePlaces: 'location search (Google Places)',
  plaid: 'banking (Plaid)',
};

// ============================================================================
// VALIDATOR CLASS
// ============================================================================

export class ServiceDependencyValidator {
  /**
   * Validate that required services are available
   *
   * @param requiredServices - List of services the tool needs
   * @param availableServices - Services actually available (from context)
   * @returns Validation result with error message if invalid
   */
  validate(
    requiredServices: ServiceName[],
    availableServices: Partial<ServiceConfig> = {}
  ): ValidationResult {
    const missingServices: ServiceName[] = [];

    for (const service of requiredServices) {
      // Check if service object is provided
      if (!availableServices[service]) {
        // Also check environment variables
        const envVars = SERVICE_ENV_VARS[service] || [];
        const hasEnvVars = envVars.every((v) => !!process.env[v]);

        if (!hasEnvVars) {
          missingServices.push(service);
        }
      }
    }

    if (missingServices.length === 0) {
      return {
        valid: true,
        missingServices: [],
        errorMessage: '',
      };
    }

    // Build user-friendly error message
    const serviceNames = missingServices
      .map((s) => SERVICE_DISPLAY_NAMES[s] || s)
      .join(', ');

    const errorMessage =
      missingServices.length === 1
        ? `I can't do that right now because ${serviceNames} isn't set up yet. Would you like help connecting it?`
        : `I need a few things set up first: ${serviceNames}. Want me to help you get started?`;

    log.warn(
      { missingServices, requiredServices },
      'Tool execution blocked due to missing service dependencies'
    );

    return {
      valid: false,
      missingServices,
      errorMessage,
    };
  }

  /**
   * Check if a specific service is configured via environment variables
   */
  isServiceConfigured(service: ServiceName): boolean {
    const envVars = SERVICE_ENV_VARS[service] || [];
    return envVars.every((v) => !!process.env[v]);
  }

  /**
   * Get a list of all unconfigured services
   */
  getUnconfiguredServices(): ServiceName[] {
    const unconfigured: ServiceName[] = [];

    for (const service of Object.keys(SERVICE_ENV_VARS) as ServiceName[]) {
      if (!this.isServiceConfigured(service)) {
        unconfigured.push(service);
      }
    }

    return unconfigured;
  }

  /**
   * Get missing environment variables for a service
   */
  getMissingEnvVars(service: ServiceName): string[] {
    const envVars = SERVICE_ENV_VARS[service] || [];
    return envVars.filter((v) => !process.env[v]);
  }

  /**
   * Log a diagnostic report of all service configurations
   */
  logDiagnostics(): void {
    const diagnostics: Record<string, { configured: boolean; missing: string[] }> = {};

    for (const service of Object.keys(SERVICE_ENV_VARS) as ServiceName[]) {
      const missing = this.getMissingEnvVars(service);
      diagnostics[service] = {
        configured: missing.length === 0,
        missing,
      };
    }

    log.info({ diagnostics }, 'Service dependency diagnostics');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let validatorInstance: ServiceDependencyValidator | null = null;

export function getServiceValidator(): ServiceDependencyValidator {
  if (!validatorInstance) {
    validatorInstance = new ServiceDependencyValidator();
  }
  return validatorInstance;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick validation check for a tool definition
 *
 * @example
 * const def: ToolDefinition = {
 *   id: 'inviteFriendByCall',
 *   requiredServices: ['twilio'],
 *   create: (ctx) => {
 *     return llm.tool({
 *       execute: async (params) => {
 *         const validation = validateServiceDependencies(['twilio']);
 *         if (!validation.valid) {
 *           return validation.errorMessage;
 *         }
 *         // ... rest of execution
 *       }
 *     });
 *   }
 * };
 */
export function validateServiceDependencies(
  requiredServices: ServiceName[]
): ValidationResult {
  return getServiceValidator().validate(requiredServices);
}

/**
 * Check if all services for a tool domain are configured
 */
export function isDomainFullyConfigured(domainServices: ServiceName[]): boolean {
  const validator = getServiceValidator();
  return domainServices.every((s) => validator.isServiceConfigured(s));
}

/**
 * Generate documentation for required environment variables
 */
export function generateEnvDocumentation(): string {
  let doc = '# Required Environment Variables for Tool Domains\n\n';

  for (const [service, envVars] of Object.entries(SERVICE_ENV_VARS)) {
    const displayName = SERVICE_DISPLAY_NAMES[service as ServiceName] || service;
    doc += `## ${displayName}\n\n`;

    for (const envVar of envVars) {
      const isSet = !!process.env[envVar];
      doc += `- \`${envVar}\`: ${isSet ? '✅ Set' : '❌ Not set'}\n`;
    }
    doc += '\n';
  }

  return doc;
}
