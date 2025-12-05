/**
 * Sentry Configuration for Ferni AI
 * 
 * This file configures Sentry error tracking and performance monitoring.
 * 
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Get your DSN from Project Settings > Client Keys
 * 3. Add SENTRY_DSN to your .env file
 * 
 * Usage:
 * import { initSentry } from './sentry.config';
 * initSentry();
 */

import * as Sentry from '@sentry/node';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
}

const defaultConfig: SentryConfig = {
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  release: process.env.npm_package_version,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
};

export function initSentry(config: Partial<SentryConfig> = {}): void {
  const finalConfig = { ...defaultConfig, ...config };
  
  if (!finalConfig.dsn) {
    console.warn('Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: finalConfig.dsn,
    environment: finalConfig.environment,
    release: finalConfig.release,
    
    // Performance Monitoring
    tracesSampleRate: finalConfig.tracesSampleRate,
    profilesSampleRate: finalConfig.profilesSampleRate,
    
    // Integrations
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    
    // Data scrubbing
    beforeSend(event) {
      // Scrub sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      
      // Scrub user messages from errors
      if (event.extra?.userMessage) {
        event.extra.userMessage = '[REDACTED]';
      }
      
      return event;
    },
    
    // Ignore common non-errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Network request failed',
      'AbortError',
      'TimeoutError',
    ],
  });

  console.log(`Sentry initialized for ${finalConfig.environment}`);
}

// Export Sentry for direct use
export { Sentry };

