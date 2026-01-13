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
    setUser: (user: {
        id: string;
    } | null) => void;
    setContext: (name: string, context: Record<string, unknown> | null) => void;
}
declare class ErrorTrackingService {
    private sentry;
    private initialized;
    private readonly dsn;
    private readonly environment;
    constructor();
    /**
     * Initialize Sentry SDK
     */
    init(): Promise<void>;
    /**
     * Capture an exception with context
     */
    captureException(error: Error, context?: ErrorContext): string | null;
    /**
     * Capture a message (non-error event)
     */
    captureMessage(message: string, level?: 'info' | 'warning' | 'error'): string | null;
    /**
     * Set the current user for error context
     */
    setUser(userId: string | null, metadata?: Record<string, unknown>): void;
    /**
     * Set a tag for all subsequent events
     */
    setTag(key: string, value: string): void;
    /**
     * Set context data for all subsequent events
     */
    setContext(name: string, data: Record<string, unknown> | null): void;
    /**
     * Add a breadcrumb for debugging
     */
    addBreadcrumb(data: BreadcrumbData): void;
    /**
     * Start a performance transaction
     */
    startTransaction(name: string, op: string): Transaction | null;
    /**
     * Configure scope for a specific operation
     */
    withScope(callback: (scope: Scope) => void): void;
    /**
     * Check if error tracking is enabled
     */
    isEnabled(): boolean;
}
export declare const errorTracking: ErrorTrackingService;
/**
 * Wrap an async function with error tracking
 */
export declare function withErrorTracking<T extends unknown[], R>(fn: (...args: T) => Promise<R>, context: Omit<ErrorContext, 'metadata'>): (...args: T) => Promise<R>;
/**
 * Track a voice session for error context
 */
export declare function trackVoiceSession(sessionId: string, userId: string, personaId: string): void;
/**
 * Track a handoff event
 */
export declare function trackHandoff(fromPersona: string, toPersona: string, reason: string): void;
/**
 * Track an API call
 */
export declare function trackApiCall(endpoint: string, method: string, statusCode: number): void;
export default errorTracking;
//# sourceMappingURL=error-tracking.d.ts.map