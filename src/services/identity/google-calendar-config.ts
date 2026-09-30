/**
 * Google Calendar OAuth configuration: client credentials, scopes and the
 * shared Google API circuit breaker. Extracted from google-calendar-oauth.ts.
 */

import { publicUrl } from '../../config/api-urls.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';

export const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
export const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
export const GOOGLE_OAUTH_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI || publicUrl('/auth/google/callback');

// Scopes needed for calendar and email operations
// NOTE: Gmail scope is read-only for security
export const GOOGLE_API_SCOPES = [
  // Calendar (full access for scheduling)
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  // Gmail (read-only for inbox triage)
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Legacy alias for compatibility
export const CALENDAR_SCOPES = GOOGLE_API_SCOPES;

// Circuit breaker for Google APIs - prevents hammering a failing service
export const googleCalendarCircuitBreaker = getCircuitBreaker('google-calendar', {
  failureThreshold: 5, // Open circuit after 5 failures
  resetTimeout: 30_000, // Try again after 30s
  successThreshold: 2, // Need 2 successes to close
});
