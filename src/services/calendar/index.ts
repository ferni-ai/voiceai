/**
 * Calendar Service Module
 *
 * High-level calendar operations for Alex (Communication Specialist).
 *
 * HYBRID APPROACH:
 * - Uses Google Calendar when connected
 * - Falls back to local Firestore storage when not
 *
 * @module services/calendar
 */

export * from './calendar-service.js';
export * from './calendar-intelligence.js';
export * from './local-calendar-store.js';

export { default as CalendarService } from './calendar-service.js';
export { default as CalendarIntelligence } from './calendar-intelligence.js';
export { default as LocalCalendarStore } from './local-calendar-store.js';

