/**
 * Error Tracking Service
 *
 * Integrates with Sentry for production error monitoring.
 * Provides structured error capture with context.
 *
 * Environment:
 * - SENTRY_DSN: Sentry project DSN
 * - NODE_ENV: Environment name (production, staging, development)
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// ERROR TRACKING SERVICE
// ============================================================================
class ErrorTrackingService {
    sentry = null;
    initialized = false;
    dsn;
    environment;
    constructor() {
        this.dsn = process.env['SENTRY_DSN'];
        this.environment = process.env['NODE_ENV'] || 'development';
    }
    /**
     * Initialize Sentry SDK
     */
    async init() {
        if (this.initialized)
            return;
        if (!this.dsn) {
            getLogger().info('Sentry DSN not configured - error tracking disabled');
            return;
        }
        try {
            // Dynamic import to avoid bundling Sentry when not used
            const Sentry = await import('@sentry/node').catch(() => null);
            if (!Sentry) {
                getLogger().info('Sentry not installed - error tracking disabled');
                return;
            }
            Sentry.init({
                dsn: this.dsn,
                environment: this.environment,
                tracesSampleRate: this.environment === 'production' ? 0.1 : 1.0,
                profilesSampleRate: this.environment === 'production' ? 0.1 : 1.0,
                integrations: [],
                beforeSend(event) {
                    // Scrub sensitive data
                    const evt = event;
                    const request = evt['request'];
                    if (request?.headers) {
                        delete request.headers['authorization'];
                        delete request.headers['cookie'];
                    }
                    return event;
                },
            });
            this.sentry = Sentry;
            this.initialized = true;
            getLogger().info({ environment: this.environment }, 'Sentry initialized');
        }
        catch (error) {
            getLogger().warn({ error }, 'Failed to initialize Sentry - error tracking disabled');
        }
    }
    /**
     * Capture an exception with context
     */
    captureException(error, context) {
        getLogger().error({ error, ...context }, 'Exception captured');
        if (!this.sentry) {
            return null;
        }
        return this.sentry.captureException(error, {
            tags: {
                component: context?.component,
                action: context?.action,
                personaId: context?.personaId,
            },
            user: context?.userId ? { id: context.userId } : undefined,
            contexts: {
                session: context?.sessionId ? { id: context.sessionId } : undefined,
                custom: context?.metadata,
            },
        });
    }
    /**
     * Capture a message (non-error event)
     */
    captureMessage(message, level = 'info') {
        getLogger().info({ message, level }, 'Message captured');
        if (!this.sentry) {
            return null;
        }
        return this.sentry.captureMessage(message, level);
    }
    /**
     * Set the current user for error context
     */
    setUser(userId, metadata) {
        if (!this.sentry)
            return;
        if (userId) {
            this.sentry.setUser({ id: userId, ...metadata });
        }
        else {
            this.sentry.setUser(null);
        }
    }
    /**
     * Set a tag for all subsequent events
     */
    setTag(key, value) {
        if (!this.sentry)
            return;
        this.sentry.setTag(key, value);
    }
    /**
     * Set context data for all subsequent events
     */
    setContext(name, data) {
        if (!this.sentry)
            return;
        this.sentry.setContext(name, data);
    }
    /**
     * Add a breadcrumb for debugging
     */
    addBreadcrumb(data) {
        if (!this.sentry)
            return;
        this.sentry.addBreadcrumb({
            category: data.category,
            message: data.message,
            level: data.level || 'info',
            data: data.data,
            timestamp: Date.now() / 1000,
        });
    }
    /**
     * Start a performance transaction
     */
    startTransaction(name, op) {
        if (!this.sentry)
            return null;
        return this.sentry.startTransaction({
            name,
            op,
        });
    }
    /**
     * Configure scope for a specific operation
     */
    withScope(callback) {
        if (!this.sentry)
            return;
        this.sentry.configureScope(callback);
    }
    /**
     * Check if error tracking is enabled
     */
    isEnabled() {
        return this.initialized && this.sentry !== null;
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const errorTracking = new ErrorTrackingService();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Wrap an async function with error tracking
 */
export function withErrorTracking(fn, context) {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            errorTracking.captureException(error, {
                ...context,
                metadata: { args: args.map((a) => typeof a) },
            });
            throw error;
        }
    };
}
/**
 * Track a voice session for error context
 */
export function trackVoiceSession(sessionId, userId, personaId) {
    errorTracking.setUser(userId);
    errorTracking.setTag('sessionId', sessionId);
    errorTracking.setTag('personaId', personaId);
    errorTracking.setContext('session', {
        sessionId,
        userId,
        personaId,
        startedAt: new Date().toISOString(),
    });
    errorTracking.addBreadcrumb({
        category: 'session',
        message: `Voice session started with ${personaId}`,
        level: 'info',
        data: { sessionId, personaId },
    });
}
/**
 * Track a handoff event
 */
export function trackHandoff(fromPersona, toPersona, reason) {
    errorTracking.addBreadcrumb({
        category: 'handoff',
        message: `Handoff: ${fromPersona} → ${toPersona}`,
        level: 'info',
        data: { fromPersona, toPersona, reason },
    });
}
/**
 * Track an API call
 */
export function trackApiCall(endpoint, method, statusCode) {
    errorTracking.addBreadcrumb({
        category: 'http',
        message: `${method} ${endpoint} - ${statusCode}`,
        level: statusCode >= 400 ? 'error' : 'info',
        data: { endpoint, method, statusCode },
    });
}
export default errorTracking;
//# sourceMappingURL=error-tracking.js.map