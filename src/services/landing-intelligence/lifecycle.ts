/**
 * Landing Intelligence Lifecycle
 *
 * Initialization and shutdown for landing intelligence services.
 *
 * @module services/landing-intelligence/lifecycle
 */

import { createLogger } from '../../utils/safe-logger.js';
import { checkGeminiHealth, clearCache } from './gemini-client.js';

const log = createLogger({ module: 'LandingIntelligenceLifecycle' });

// ============================================================================
// STATE
// ============================================================================

let initialized = false;
let geminiHealthy = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initLandingIntelligence(): Promise<boolean> {
  if (initialized) {
    log.debug('Landing intelligence already initialized');
    return geminiHealthy;
  }

  log.info('Initializing landing intelligence...');

  // Check Gemini health
  try {
    geminiHealthy = await checkGeminiHealth();
    log.info({ geminiHealthy }, 'Gemini health check complete');
  } catch (error) {
    log.warn({ error }, 'Gemini health check failed - will use fallbacks');
    geminiHealthy = false;
  }

  initialized = true;

  log.info({ geminiHealthy }, 'Landing intelligence initialized');

  return geminiHealthy;
}

// ============================================================================
// SHUTDOWN
// ============================================================================

export async function shutdownLandingIntelligence(): Promise<void> {
  log.info('Shutting down landing intelligence...');

  // Clear caches
  clearCache();

  initialized = false;
  geminiHealthy = false;

  log.info('Landing intelligence shut down');
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface LandingIntelligenceHealth {
  initialized: boolean;
  geminiHealthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export function getLandingIntelligenceHealth(): LandingIntelligenceHealth {
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';

  if (initialized && geminiHealthy) {
    status = 'healthy';
  } else if (initialized) {
    status = 'degraded'; // Working with fallbacks
  }

  return {
    initialized,
    geminiHealthy,
    status,
  };
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export interface LandingIntelligenceFlags {
  enableAIVariants: boolean;
  enableIntentDetection: boolean;
  enableLayoutOptimization: boolean;
  enableChatWidget: boolean;
  enableTimeAware: boolean;
  enableReturningVisitor: boolean;
}

const defaultFlags: LandingIntelligenceFlags = {
  enableAIVariants: true,
  enableIntentDetection: true,
  enableLayoutOptimization: true,
  enableChatWidget: true,
  enableTimeAware: true,
  enableReturningVisitor: true,
};

let activeFlags = { ...defaultFlags };

export function setLandingIntelligenceFlags(flags: Partial<LandingIntelligenceFlags>): void {
  activeFlags = { ...activeFlags, ...flags };
  log.info({ flags: activeFlags }, 'Landing intelligence flags updated');
}

export function getLandingIntelligenceFlags(): LandingIntelligenceFlags {
  return { ...activeFlags };
}

export function isFeatureEnabled(feature: keyof LandingIntelligenceFlags): boolean {
  return activeFlags[feature];
}
