/**
 * Sentry Configuration for iOS (Capacitor)
 * 
 * Initialize this in your app's entry point.
 * 
 * SETUP:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Get your DSN from Project Settings → Client Keys
 * 3. Set VITE_SENTRY_DSN in your environment
 */

import * as Sentry from '@sentry/capacitor';
import * as SentryAngular from '@sentry/angular';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('ℹ️ Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init(
    {
      dsn: SENTRY_DSN,
      // Environment detection
      environment: import.meta.env.PROD ? 'production' : 'development',
      // Release version (update with your app version)
      release: 'voiceai-ios@1.0.0',
      // Performance monitoring - sample 20% of transactions
      tracesSampleRate: 0.2,
      // Only enable in production
      enabled: import.meta.env.PROD,
      // Integrations
      integrations: [
        // Add breadcrumbs for debugging
        Sentry.breadcrumbsIntegration({
          console: true,
          dom: true,
          fetch: true,
          history: true,
          xhr: true,
        }),
      ],
    },
    // Forward to Angular SDK for better stack traces
    SentryAngular.init
  );

  console.log('✅ Sentry initialized for iOS error tracking');
}

/**
 * Report a custom error to Sentry
 */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  if (SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
  if (SENTRY_DSN) {
    Sentry.addBreadcrumb({
      message,
      category,
      data,
      level: 'info',
    });
  }
}

/**
 * Set user context for error reports
 */
export function setUser(userId: string, email?: string, username?: string): void {
  if (SENTRY_DSN) {
    Sentry.setUser({ id: userId, email, username });
  }
}

