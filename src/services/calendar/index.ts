/**
 * Calendar Service Module
 *
 * High-level calendar operations for Alex (Communication Specialist).
 *
 * HYBRID APPROACH:
 * - Uses Google Calendar when connected
 * - Falls back to local Firestore storage when not
 *
 * FEATURES:
 * - Core service: CRUD operations, availability checks
 * - Intelligence: Smart scheduling, alerts, patterns
 * - Natural date parsing: "tomorrow at 3pm" → Date
 * - Event confirmation: Voice-first scheduling flow
 * - Proactive: Pre-meeting briefings, follow-ups
 *
 * @module services/calendar
 */

// Core services
export * from './calendar-service.js';
export * from './calendar-intelligence.js';
export * from './local-calendar-store.js';

// Natural language & confirmation
export * from './natural-date-parser.js';
export * from './event-confirmation.js';

// Proactive features
export * from './proactive-calendar.js';

// Default exports
export { default as CalendarService } from './calendar-service.js';
export { default as CalendarIntelligence } from './calendar-intelligence.js';
export { default as LocalCalendarStore } from './local-calendar-store.js';

