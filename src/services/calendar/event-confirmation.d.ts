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
import { type ParsedDateTime } from './natural-date-parser.js';
import { type CalendarEvent } from './calendar-service.js';
export interface PendingEvent {
    id: string;
    userId: string;
    title: string;
    parsedDate?: ParsedDateTime;
    proposedStart?: Date;
    proposedEnd?: Date;
    duration: number;
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
/**
 * Parse an event request from natural language
 *
 * Example inputs:
 * - "Schedule a meeting with John tomorrow at 3pm"
 * - "Add dentist appointment on the 15th"
 * - "Block off next Friday morning for focus time"
 */
export declare function parseEventRequest(userId: string, input: string, defaultDuration?: number): Promise<ParseEventResult>;
/**
 * Update pending event with clarified time
 */
export declare function clarifyEventTime(pendingId: string, timeInput: string): Promise<ParseEventResult>;
/**
 * Confirm and create the event
 */
export declare function confirmEvent(pendingId: string): Promise<ConfirmEventResult>;
/**
 * Cancel a pending event
 */
export declare function cancelPendingEvent(pendingId: string): {
    success: boolean;
    speakableResponse: string;
};
/**
 * Get pending event by ID
 */
export declare function getPendingEvent(pendingId: string): PendingEvent | undefined;
/**
 * Get all pending events for a user
 */
export declare function getUserPendingEvents(userId: string): PendingEvent[];
//# sourceMappingURL=event-confirmation.d.ts.map