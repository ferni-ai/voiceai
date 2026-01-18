/**
 * Calendar Event Creation on Behalf - Autonomous Calendar Management
 *
 * Allows Ferni to create, modify calendar events on the user's behalf.
 * Uses the trust level system to determine when to ask for approval.
 *
 * @module services/automation/calendar-on-behalf
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  checkActionPermission,
  markActionExecuted,
  type ActionPreview,
} from './trust-level-system.js';

const log = createLogger({ module: 'CalendarOnBehalf' });

// ============================================================================
// Types
// ============================================================================

export interface CalendarEventRequest {
  userId: string;
  title: string;
  description?: string;
  startTime: Date | string;
  endTime?: Date | string;
  location?: string;
  attendees?: Array<{
    name: string;
    email: string;
  }>;
  reminders?: Array<{
    method: 'email' | 'popup';
    minutesBefore: number;
  }>;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    until?: Date | string;
    count?: number;
  };
  calendar?: string; // Calendar ID, defaults to primary
  context?: string; // Why Ferni is creating this event
}

export interface CalendarEventResult {
  success: boolean;
  requiresApproval: boolean;
  pendingActionId?: string;
  preview?: ActionPreview;
  eventId?: string;
  eventLink?: string;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format date/time for display
 */
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calculate duration between two dates
 */
function formatDuration(start: Date | string, end: Date | string): string {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  const durationMs = endDate.getTime() - startDate.getTime();
  const minutes = Math.round(durationMs / (1000 * 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Generate a preview for a calendar event
 */
function generateEventPreview(request: CalendarEventRequest): ActionPreview {
  const startTime = formatDateTime(request.startTime);
  const endTime = request.endTime ? formatDateTime(request.endTime) : null;
  const duration = request.endTime ? formatDuration(request.startTime, request.endTime) : null;

  const details: string[] = [
    `📅 ${startTime}`,
    ...(duration ? [`⏱️ ${duration}`] : []),
    ...(request.location ? [`📍 ${request.location}`] : []),
    ...(request.attendees && request.attendees.length > 0
      ? [`👥 ${request.attendees.map((a) => a.name).join(', ')}`]
      : []),
  ];

  return {
    title: `Add "${request.title}" to your calendar`,
    summary: request.description || `Event: ${request.title}`,
    details,
    canUndo: true, // Events can be deleted
    affectedParties: request.attendees?.map((a) => a.name),
  };
}

/**
 * Validate an event request
 */
function validateEventRequest(request: CalendarEventRequest): string | null {
  if (!request.userId) {
    return 'userId is required';
  }

  if (!request.title || request.title.trim().length === 0) {
    return 'title is required';
  }

  if (!request.startTime) {
    return 'startTime is required';
  }

  const startDate = typeof request.startTime === 'string'
    ? new Date(request.startTime)
    : request.startTime;

  if (isNaN(startDate.getTime())) {
    return 'invalid startTime';
  }

  if (request.endTime) {
    const endDate = typeof request.endTime === 'string'
      ? new Date(request.endTime)
      : request.endTime;

    if (isNaN(endDate.getTime())) {
      return 'invalid endTime';
    }

    if (endDate <= startDate) {
      return 'endTime must be after startTime';
    }
  }

  return null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Request to create a calendar event on behalf of the user
 */
export async function createEventOnBehalf(
  request: CalendarEventRequest
): Promise<CalendarEventResult> {
  // Validate request
  const validationError = validateEventRequest(request);
  if (validationError) {
    return { success: false, requiresApproval: false, error: validationError };
  }

  const preview = generateEventPreview(request);

  // Check permission via trust level system
  const permissionResult = await checkActionPermission(
    request.userId,
    'create_event',
    preview
  );

  if (!permissionResult.success) {
    return {
      success: false,
      requiresApproval: false,
      error: permissionResult.error,
    };
  }

  // If requires approval, store and return pending action
  if (permissionResult.requiresApproval) {
    await storeEventRequest(request, permissionResult.pendingActionId!);

    return {
      success: true,
      requiresApproval: true,
      pendingActionId: permissionResult.pendingActionId,
      preview,
    };
  }

  // Trusted - create immediately
  const createResult = await executeEventCreation(request);

  if (createResult.success) {
    await markActionExecuted(request.userId, permissionResult.actionId);
  }

  return {
    success: createResult.success,
    requiresApproval: false,
    eventId: createResult.eventId,
    eventLink: createResult.eventLink,
    error: createResult.error,
  };
}

/**
 * Execute an approved event creation
 */
export async function executeApprovedEvent(
  userId: string,
  pendingActionId: string
): Promise<CalendarEventResult> {
  const request = await getStoredEventRequest(userId, pendingActionId);

  if (!request) {
    return {
      success: false,
      requiresApproval: false,
      error: 'Event request not found',
    };
  }

  const result = await executeEventCreation(request);

  if (result.success) {
    await markActionExecuted(userId, pendingActionId);
  }

  return {
    ...result,
    requiresApproval: false, // Already approved at this point
  };
}

/**
 * Store an event request for later execution
 */
async function storeEventRequest(
  request: CalendarEventRequest,
  pendingActionId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('pending_events')
      .doc(pendingActionId)
      .set({
        ...request,
        startTime: typeof request.startTime === 'string'
          ? request.startTime
          : request.startTime.toISOString(),
        endTime: request.endTime
          ? typeof request.endTime === 'string'
            ? request.endTime
            : request.endTime.toISOString()
          : null,
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store event request');
  }
}

/**
 * Get a stored event request
 */
async function getStoredEventRequest(
  userId: string,
  pendingActionId: string
): Promise<CalendarEventRequest | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_events')
      .doc(pendingActionId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as CalendarEventRequest;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get stored event');
    return null;
  }
}

/**
 * Actually create the calendar event via Google Calendar API
 */
async function executeEventCreation(
  request: CalendarEventRequest
): Promise<{ success: boolean; eventId?: string; eventLink?: string; error?: string }> {
  try {
    // Import calendar service functions
    const { isConnected, createEvent } = await import('../calendar/calendar-service.js');

    // Check if calendar is connected
    const connected = await isConnected(request.userId);
    if (!connected) {
      return { success: false, error: 'Calendar not connected' };
    }

    // Convert times
    const startTime = typeof request.startTime === 'string'
      ? new Date(request.startTime)
      : request.startTime;
    const endTime = request.endTime
      ? typeof request.endTime === 'string'
        ? new Date(request.endTime)
        : request.endTime
      : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

    // Create event using the calendar service
    const result = await createEvent(request.userId, {
      title: request.title,
      description: request.description,
      startTime,
      endTime,
      location: request.location,
      attendees: request.attendees?.map((a) => a.email),
    });

    if (result) {
      log.info(
        {
          userId: request.userId,
          eventId: result.id,
          title: request.title,
        },
        'Calendar event created on behalf of user'
      );

      return {
        success: true,
        eventId: result.id,
        // Google Calendar link format - construct from event ID
        eventLink: `https://calendar.google.com/calendar/event?eid=${Buffer.from(result.id).toString('base64').replace(/=/g, '')}`,
      };
    }

    return { success: false, error: 'Failed to create event' };
  } catch (error) {
    log.error({ error: String(error) }, 'Event creation failed');
    return { success: false, error: 'Calendar service unavailable' };
  }
}

/**
 * Delete an event (for undo functionality)
 */
export async function deleteEvent(
  userId: string,
  eventId: string,
  calendarId = 'primary'
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendarService = await import('../calendar/calendar-service.js');

    const deleted = await calendarService.deleteEvent(userId, eventId, calendarId);

    if (deleted) {
      log.info({ userId, eventId }, 'Calendar event deleted (undo)');
      return { success: true };
    }

    return { success: false, error: 'Failed to delete event' };
  } catch (error) {
    log.error({ error: String(error) }, 'Event deletion failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Exports
// ============================================================================

export const calendarOnBehalf = {
  createEvent: createEventOnBehalf,
  executeApproved: executeApprovedEvent,
  deleteEvent,
};

export default calendarOnBehalf;
