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
export async function initLandingIntelligence() {
    if (initialized) {
        log.debug('Landing intelligence already initialized');
        return geminiHealthy;
    }
    log.info('Initializing landing intelligence...');
    // Check Gemini health
    try {
        geminiHealthy = await checkGeminiHealth();
        log.info({ geminiHealthy }, 'Gemini health check complete');
    }
    catch (error) {
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
export async function shutdownLandingIntelligence() {
    log.info('Shutting down landing intelligence...');
    // Clear caches
    clearCache();
    initialized = false;
    geminiHealthy = false;
    log.info('Landing intelligence shut down');
}
export function getLandingIntelligenceHealth() {
    let status = 'unhealthy';
    if (initialized && geminiHealthy) {
        status = 'healthy';
    }
    else if (initialized) {
        status = 'degraded'; // Working with fallbacks
    }
    return {
        initialized,
        geminiHealthy,
        status,
    };
}
const defaultFlags = {
    enableAIVariants: true,
    enableIntentDetection: true,
    enableLayoutOptimization: true,
    enableChatWidget: true,
    enableTimeAware: true,
    enableReturningVisitor: true,
};
let activeFlags = { ...defaultFlags };
export function setLandingIntelligenceFlags(flags) {
    activeFlags = { ...activeFlags, ...flags };
    log.info({ flags: activeFlags }, 'Landing intelligence flags updated');
}
export function getLandingIntelligenceFlags() {
    return { ...activeFlags };
}
export function isFeatureEnabled(feature) {
    return activeFlags[feature];
}
//# sourceMappingURL=lifecycle.js.map