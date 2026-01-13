/**
 * Actionable Intent Data Capture Definition
 *
 * Detects actionable phrases in conversation and surfaces suggestions
 * to the LLM for calendar events, tasks, and reminders.
 *
 * Unlike passive capture (which stores data silently), this actively
 * guides the LLM to offer creating items for the user.
 *
 * Examples:
 * - "I have a dentist appointment Tuesday" → Offer calendar event
 * - "Remind me to call mom tomorrow" → Offer reminder
 * - "I need to finish that report by Friday" → Offer task
 * - "Let's meet for coffee next week" → Offer calendar event
 */
import type { DataCaptureDefinition } from '../types.js';
export declare const actionableIntentCaptureDefinition: DataCaptureDefinition;
//# sourceMappingURL=actionable-intent.capture.d.ts.map