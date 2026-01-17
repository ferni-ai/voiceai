/**
 * Calendar Routes Helpers
 *
 * Shared helper functions for calendar API routes.
 */

import type { ServerResponse } from 'http';
import { sendJSON } from '../helpers.js';
import {
  checkCalendarRateLimit,
  getCalendarRateLimitStatus,
} from '../../services/calendar/utils/rate-limiter.js';
import type { CalendarEvent } from '../../services/calendar/calendar-service.js';

/**
 * Legacy wrapper for sendJSON with (res, data, status) signature.
 */
export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  sendJSON(res, data, status);
}

/**
 * Check rate limit and apply headers.
 * Returns true if request should be blocked.
 */
export function checkRateLimitAndApply(
  res: ServerResponse,
  userId: string,
  operation: 'sync' | 'credential'
): boolean {
  const rateLimit = checkCalendarRateLimit(userId, operation);

  // Apply rate limit headers
  for (const [key, value] of Object.entries(rateLimit.headers)) {
    res.setHeader(key, value);
  }

  if (!rateLimit.allowed) {
    sendJson(
      res,
      {
        error: 'Rate limit exceeded',
        retryAfter: rateLimit.retryAfterSeconds,
        message: `Too many requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      429
    );
    return true;
  }

  return false;
}

/**
 * Format a calendar event for API response.
 */
export function formatEventForApi(event: CalendarEvent): Record<string, unknown> {
  return {
    id: event.id,
    title: event.title || 'Untitled',
    startTime: event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime,
    endTime: event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime,
    location: event.location || null,
    isAllDay: event.isAllDay || false,
    status: event.status || 'confirmed',
  };
}

// Re-export rate limit status getter
export { getCalendarRateLimitStatus };
