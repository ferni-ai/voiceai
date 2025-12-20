/**
 * Event Confirmation Flow
 *
 * Manages the voice-first flow for confirming calendar events:
 * 1. Parse natural language request
 * 2. Detect conflicts
 * 3. Ask for confirmation
 * 4. Create event
 *
 * Designed for smooth voice interaction with minimal back-and-forth.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { parseNaturalDate, suggestTimes, isValidForScheduling, type ParsedDateTime } from './natural-date-parser.js';
import {
  isTimeSlotAvailable,
  getEventsForDay,
  createEvent,
  findFreeTimeSlots,
  type CalendarEvent,
  type CreateEventInput,
} from './calendar-service.js';

const log = createLogger({ module: 'EventConfirmation' });

// ============================================================================
// TYPES
// ============================================================================

export interface PendingEvent {
  id: string;
  userId: string;
  title: string;
  parsedDate?: ParsedDateTime;
  proposedStart?: Date;
  proposedEnd?: Date;
  duration: number; // minutes
  location?: string;
  description?: string;
  attendees?: string[];
  status: 'parsing' | 'needs_time' | 'conflict' | 'ready' | 'confirmed' | 'cancelled';
  conflicts?: CalendarEvent[];
  suggestions?: Date[];
  createdAt: Date;
  expiresAt: Date;
}

export interface ParseEventResult {
  success: boolean;
  pendingEvent?: PendingEvent;
  needsClarification?: boolean;
  clarificationPrompt?: string;
  hasConflict?: boolean;
  conflictDescription?: string;
  suggestedAlternatives?: Date[];
  readyToConfirm?: boolean;
  confirmationPrompt?: string;
}

export interface ConfirmEventResult {
  success: boolean;
  event?: CalendarEvent;
  error?: string;
  speakableResponse: string;
}

// ============================================================================
// PENDING EVENT STORE
// ============================================================================

const pendingEvents = new Map<string, PendingEvent>();
const PENDING_EVENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate pending event ID
 */
function generatePendingId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up expired pending events
 */
function cleanupExpiredPending(): void {
  const now = new Date();
  for (const [id, event] of pendingEvents) {
    if (event.expiresAt < now) {
      pendingEvents.delete(id);
    }
  }
}

// ============================================================================
// MAIN FLOW
// ============================================================================

/**
 * Parse an event request from natural language
 *
 * Example inputs:
 * - "Schedule a meeting with John tomorrow at 3pm"
 * - "Add dentist appointment on the 15th"
 * - "Block off next Friday morning for focus time"
 */
export async function parseEventRequest(
  userId: string,
  input: string,
  defaultDuration = 60 // minutes
): Promise<ParseEventResult> {
  cleanupExpiredPending();

  log.debug({ userId, input }, 'Parsing event request');

  // Extract event details from input
  const { title, duration, location } = extractEventDetails(input, defaultDuration);

  if (!title) {
    return {
      success: false,
      needsClarification: true,
      clarificationPrompt: "What would you like to call this event?",
    };
  }

  // Parse date/time
  const parsedDate = parseNaturalDate(input);

  // Create pending event
  const pending: PendingEvent = {
    id: generatePendingId(),
    userId,
    title,
    parsedDate: parsedDate || undefined,
    duration,
    location,
    status: parsedDate ? 'ready' : 'needs_time',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + PENDING_EVENT_TTL_MS),
  };

  // If no date parsed, ask for clarification
  if (!parsedDate) {
    pending.status = 'needs_time';
    pending.suggestions = suggestTimes('sometime_this_week');
    pendingEvents.set(pending.id, pending);

    return {
      success: true,
      pendingEvent: pending,
      needsClarification: true,
      clarificationPrompt: `When would you like to schedule "${title}"?`,
    };
  }

  // Validate the date
  const validation = isValidForScheduling(parsedDate.date);
  if (!validation.valid) {
    return {
      success: false,
      needsClarification: true,
      clarificationPrompt: `${validation.reason}. When would you like to schedule "${title}"?`,
    };
  }

  // Calculate end time
  pending.proposedStart = parsedDate.date;
  pending.proposedEnd = new Date(parsedDate.date.getTime() + duration * 60 * 1000);

  // Check for conflicts
  const isAvailable = await isTimeSlotAvailable(userId, pending.proposedStart, pending.proposedEnd);

  if (!isAvailable) {
    // Find conflicts
    const dayEvents = await getEventsForDay(userId, pending.proposedStart);
    const conflicts = dayEvents.filter(event => {
      const eventStart = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
      const eventEnd = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);
      return pending.proposedStart! < eventEnd && pending.proposedEnd! > eventStart;
    });

    pending.status = 'conflict';
    pending.conflicts = conflicts;

    // Find alternative times
    const freeSlots = await findFreeTimeSlots(userId, pending.proposedStart!, { minDurationMinutes: duration });
    pending.suggestions = freeSlots.slice(0, 3).map(slot => slot.start);

    pendingEvents.set(pending.id, pending);

    const conflictEvent = conflicts[0];
    const conflictTime = conflictEvent
      ? new Date(conflictEvent.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : 'that time';

    return {
      success: true,
      pendingEvent: pending,
      hasConflict: true,
      conflictDescription: `You have "${conflictEvent?.title || 'an event'}" at ${conflictTime}`,
      suggestedAlternatives: pending.suggestions,
      clarificationPrompt: buildConflictPrompt(pending, conflicts),
    };
  }

  // Ready to confirm
  pending.status = 'ready';
  pendingEvents.set(pending.id, pending);

  // Check if date was ambiguous
  if (parsedDate.ambiguous) {
    return {
      success: true,
      pendingEvent: pending,
      needsClarification: true,
      clarificationPrompt: buildAmbiguousTimePrompt(pending, parsedDate),
    };
  }

  return {
    success: true,
    pendingEvent: pending,
    readyToConfirm: true,
    confirmationPrompt: buildConfirmationPrompt(pending),
  };
}

/**
 * Update pending event with clarified time
 */
export async function clarifyEventTime(
  pendingId: string,
  timeInput: string
): Promise<ParseEventResult> {
  const pending = pendingEvents.get(pendingId);

  if (!pending) {
    return {
      success: false,
      needsClarification: true,
      clarificationPrompt: "I'm not sure which event you're referring to. Could you start over?",
    };
  }

  // Parse the new time
  const parsedDate = parseNaturalDate(timeInput);

  if (!parsedDate) {
    return {
      success: false,
      needsClarification: true,
      clarificationPrompt: "I couldn't understand that time. Could you try something like '3pm tomorrow' or 'next Tuesday at 2'?",
    };
  }

  // Update pending event
  pending.parsedDate = parsedDate;
  pending.proposedStart = parsedDate.date;
  pending.proposedEnd = new Date(parsedDate.date.getTime() + pending.duration * 60 * 1000);

  // Check availability
  const isAvailable = await isTimeSlotAvailable(
    pending.userId,
    pending.proposedStart,
    pending.proposedEnd
  );

  if (!isAvailable) {
    const dayEvents = await getEventsForDay(pending.userId, pending.proposedStart);
    const conflicts = dayEvents.filter(event => {
      const eventStart = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
      const eventEnd = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);
      return pending.proposedStart! < eventEnd && pending.proposedEnd! > eventStart;
    });

    pending.status = 'conflict';
    pending.conflicts = conflicts;

    const freeSlots = await findFreeTimeSlots(pending.userId, pending.proposedStart!, { minDurationMinutes: pending.duration });
    pending.suggestions = freeSlots.slice(0, 3).map(slot => slot.start);

    pendingEvents.set(pending.id, pending);

    return {
      success: true,
      pendingEvent: pending,
      hasConflict: true,
      conflictDescription: `That time conflicts with "${conflicts[0]?.title || 'another event'}"`,
      suggestedAlternatives: pending.suggestions,
      clarificationPrompt: buildConflictPrompt(pending, conflicts),
    };
  }

  pending.status = 'ready';
  pendingEvents.set(pending.id, pending);

  return {
    success: true,
    pendingEvent: pending,
    readyToConfirm: true,
    confirmationPrompt: buildConfirmationPrompt(pending),
  };
}

/**
 * Confirm and create the event
 */
export async function confirmEvent(pendingId: string): Promise<ConfirmEventResult> {
  const pending = pendingEvents.get(pendingId);

  if (!pending) {
    return {
      success: false,
      error: 'Event not found',
      speakableResponse: "I couldn't find that pending event. Could you start over?",
    };
  }

  if (pending.status !== 'ready') {
    return {
      success: false,
      error: 'Event not ready for confirmation',
      speakableResponse: "This event isn't ready to be scheduled yet. Let me know the time.",
    };
  }

  if (!pending.proposedStart || !pending.proposedEnd) {
    return {
      success: false,
      error: 'Missing event times',
      speakableResponse: "I need a time for this event. When would you like to schedule it?",
    };
  }

  try {
    const eventInput: CreateEventInput = {
      title: pending.title,
      startTime: pending.proposedStart,
      endTime: pending.proposedEnd,
      location: pending.location,
      description: pending.description,
    };

    const createdEvent = await createEvent(pending.userId, eventInput);

    // Clean up pending event
    pendingEvents.delete(pendingId);

    if (!createdEvent) {
      return {
        success: false,
        error: 'Failed to create event',
        speakableResponse: "I couldn't create that event. Please try again.",
      };
    }

    pending.status = 'confirmed';

    const time = pending.proposedStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const date = pending.proposedStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return {
      success: true,
      event: createdEvent,
      speakableResponse: `Done! "${pending.title}" is scheduled for ${time} on ${date}.`,
    };
  } catch (error) {
    log.error({ error: String(error), pendingId }, 'Failed to confirm event');
    return {
      success: false,
      error: String(error),
      speakableResponse: "Something went wrong creating that event. Please try again.",
    };
  }
}

/**
 * Cancel a pending event
 */
export function cancelPendingEvent(pendingId: string): { success: boolean; speakableResponse: string } {
  const pending = pendingEvents.get(pendingId);

  if (!pending) {
    return {
      success: false,
      speakableResponse: "No problem! Let me know if you want to schedule something else.",
    };
  }

  pendingEvents.delete(pendingId);

  return {
    success: true,
    speakableResponse: `Okay, I won't schedule "${pending.title}".`,
  };
}

/**
 * Get pending event by ID
 */
export function getPendingEvent(pendingId: string): PendingEvent | undefined {
  return pendingEvents.get(pendingId);
}

/**
 * Get all pending events for a user
 */
export function getUserPendingEvents(userId: string): PendingEvent[] {
  return Array.from(pendingEvents.values()).filter(e => e.userId === userId);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract event details from natural language input
 */
function extractEventDetails(
  input: string,
  defaultDuration: number
): { title: string; duration: number; location?: string } {
  const lower = input.toLowerCase();

  // Duration patterns
  let duration = defaultDuration;
  const durationMatch = input.match(/(\d+)\s*(hour|hr|minute|min)/i);
  if (durationMatch) {
    const amount = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    duration = unit.startsWith('hour') || unit.startsWith('hr') ? amount * 60 : amount;
  }

  // Common duration keywords
  if (lower.includes('quick') || lower.includes('brief')) duration = 30;
  if (lower.includes('lunch')) duration = 60;
  if (lower.includes('all day') || lower.includes('block')) duration = 480;

  // Extract location (after "at" that isn't followed by a time)
  let location: string | undefined;
  const locationMatch = input.match(/(?:at|in)\s+([^0-9][^,\n]+?)(?:,|\s+(?:at|on|for|tomorrow|today|next)|$)/i);
  if (locationMatch && !locationMatch[1].match(/^\d/)) {
    const possibleLocation = locationMatch[1].trim();
    // Filter out time-related words
    if (!['morning', 'noon', 'afternoon', 'evening', 'night'].includes(possibleLocation.toLowerCase())) {
      location = possibleLocation;
    }
  }

  // Extract title - remove time/date/location phrases
  let title = input
    .replace(/(?:schedule|add|create|put|book)\s+(?:a|an|my)?\s*/gi, '')
    .replace(/(?:at|on|for|tomorrow|today|next|this)\s+.*/gi, '')
    .replace(/(?:in|at)\s+\d+\s*(?:hour|minute|min|hr).*/gi, '')
    .replace(/\s+at\s+[^,\n]+/gi, '') // Remove location
    .trim();

  // Clean up common phrases
  title = title
    .replace(/^(?:meeting|appointment|event)\s+(?:with|for|about)\s+/i, 'Meeting with ')
    .replace(/^(?:call|phone)\s+(?:with)?\s*/i, 'Call with ')
    .replace(/^(?:lunch|dinner|breakfast)\s+(?:with)?\s*/i, 'Lunch with ')
    .trim();

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, duration, location };
}

/**
 * Build prompt for conflict resolution
 */
function buildConflictPrompt(pending: PendingEvent, conflicts: CalendarEvent[]): string {
  const conflictEvent = conflicts[0];
  const conflictTime = conflictEvent
    ? new Date(conflictEvent.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'that time';

  let prompt = `That time conflicts with "${conflictEvent?.title || 'another event'}" at ${conflictTime}. `;

  if (pending.suggestions && pending.suggestions.length > 0) {
    const alternatives = pending.suggestions.slice(0, 2).map(d =>
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    ).join(' or ');
    prompt += `How about ${alternatives} instead?`;
  } else {
    prompt += 'When else would work for you?';
  }

  return prompt;
}

/**
 * Build prompt for ambiguous time
 */
function buildAmbiguousTimePrompt(pending: PendingEvent, parsed: ParsedDateTime): string {
  const time = parsed.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Just to confirm - you mean ${time}, right?`;
}

/**
 * Build confirmation prompt
 */
function buildConfirmationPrompt(pending: PendingEvent): string {
  if (!pending.proposedStart) return `Ready to schedule "${pending.title}"?`;

  const time = pending.proposedStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = pending.proposedStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  let prompt = `I'll schedule "${pending.title}" for ${time} on ${date}`;

  if (pending.location) {
    prompt += ` at ${pending.location}`;
  }

  const duration = pending.duration >= 60
    ? `${pending.duration / 60} hour${pending.duration > 60 ? 's' : ''}`
    : `${pending.duration} minutes`;

  prompt += ` for ${duration}. Sound good?`;

  return prompt;
}

