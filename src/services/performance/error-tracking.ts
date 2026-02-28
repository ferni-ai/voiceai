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

import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface ErrorContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

interface BreadcrumbData {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

interface SentryLike {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: Error, context?: Record<string, unknown>) => string;
  captureMessage: (message: string, level?: string) => string;
  setUser: (user: { id: string; [key: string]: unknown } | null) => void;
  setTag: (key: string, value: string) => void;
  setContext: (name: string, context: Record<string, unknown> | null) => void;
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void;
  startTransaction: (options: Record<string, unknown>) => Transaction;
  configureScope: (callback: (scope: Scope) => void) => void;
}

interface Transaction {
  finish: () => void;
  setStatus: (status: string) => void;
  startChild: (options: Record<string, unknown>) => Span;
}

interface Span {
  finish: () => void;
  setStatus: (status: string) => void;
}

interface Scope {
  setTag: (key: string, value: string) => void;
  setUser: (user: { id: string } | null) => void;
  setContext: (name: string, context: Record<string, unknown> | null) => void;
}

// ============================================================================
// ERROR TRACKING SERVICE
// ============================================================================

class ErrorTrackingService {
  private sentry: SentryLike | null = null;
  private initialized = false;
  private readonly dsn: string | undefined;
  private readonly environment: string;

  constructor() {
    this.dsn = process.env['SENTRY_DSN'];
    this.environment = process.env['NODE_ENV'] || 'development';
  }

  /**
   * Initialize Sentry SDK
   */
  async init(): Promise<void> {
    if (this.initialized) return;

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
          const evt = event as unknown as Record<string, unknown>;
          const request = evt['request'] as { headers?: Record<string, unknown> } | undefined;
          if (request?.headers) {
            delete request.headers['authorization'];
            delete request.headers['cookie'];
          }
          return event;
        },
      });

      this.sentry = Sentry as unknown as SentryLike;
      this.initialized = true;

      getLogger().info({ environment: this.environment }, 'Sentry initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Failed to initialize Sentry - error tracking disabled');
    }
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: ErrorContext): string | null {
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
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): string | null {
    getLogger().info({ message, level }, 'Message captured');

    if (!this.sentry) {
      return null;
    }

    return this.sentry.captureMessage(message, level);
  }

  /**
   * Set the current user for error context
   */
  setUser(userId: string | null, metadata?: Record<string, unknown>): void {
    if (!this.sentry) return;

    if (userId) {
      this.sentry.setUser({ id: userId, ...metadata });
    } else {
      this.sentry.setUser(null);
    }
  }

  /**
   * Set a tag for all subsequent events
   */
  setTag(key: string, value: string): void {
    if (!this.sentry) return;
    this.sentry.setTag(key, value);
  }

  /**
   * Set context data for all subsequent events
   */
  setContext(name: string, data: Record<string, unknown> | null): void {
    if (!this.sentry) return;
    this.sentry.setContext(name, data);
  }

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(data: BreadcrumbData): void {
    if (!this.sentry) return;

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
  startTransaction(name: string, op: string): Transaction | null {
    if (!this.sentry) return null;

    return this.sentry.startTransaction({
      name,
      op,
    });
  }

  /**
   * Configure scope for a specific operation
   */
  withScope(callback: (scope: Scope) => void): void {
    if (!this.sentry) return;
    this.sentry.configureScope(callback);
  }

  /**
   * Check if error tracking is enabled
   */
  isEnabled(): boolean {
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
export function withErrorTracking<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context: Omit<ErrorContext, 'metadata'>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      errorTracking.captureException(error as Error, {
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
export function trackVoiceSession(sessionId: string, userId: string, personaId: string): void {
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
export function trackHandoff(fromPersona: string, toPersona: string, reason: string): void {
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
export function trackApiCall(endpoint: string, method: string, statusCode: number): void {
  errorTracking.addBreadcrumb({
    category: 'http',
    message: `${method} ${endpoint} - ${statusCode}`,
    level: statusCode >= 400 ? 'error' : 'info',
    data: { endpoint, method, statusCode },
  });
}

export default errorTracking;
