/**
 * Data Capture Definitions Index
 *
 * Exports all passive data capture definitions for the Semantic Data Capture Router.
 * These definitions enable "Better than Human" by feeding the superhuman services.
 */

import { contactCaptureDefinition } from './contacts.capture.js';
import { commitmentCaptureDefinition } from './commitments.capture.js';
import { dreamCaptureDefinition } from './dreams.capture.js';
import { relationshipCaptureDefinition } from './relationships.capture.js';
// V2 "Better Than Human" capture definitions
import { moodCaptureDefinition } from './mood.capture.js';
import { socialEventCaptureDefinition } from './social-event.capture.js';
import { conflictCaptureDefinition } from './conflict.capture.js';
import { boundaryCaptureDefinition } from './boundary.capture.js';
import { recoveryEventCaptureDefinition } from './recovery-event.capture.js';
import { insideJokeCaptureDefinition } from './inside-joke.capture.js';
// Actionable Intent Capture - surfaces suggestions to LLM
import { actionableIntentCaptureDefinition } from './actionable-intent.capture.js';
// V3 Domain Hooks - location and pets capture (E2E integration)
import { locationCaptureDefinition } from './location.capture.js';
import { petCaptureDefinition } from './pets.capture.js';
import type { DataCaptureDefinition } from '../types.js';

/**
 * All data capture definitions.
 * Order matters - more specific definitions should come first.
 */
export const allDataCaptureDefinitions: DataCaptureDefinition[] = [
  // Safety/Boundaries first - important to respect
  boundaryCaptureDefinition,
  // Actionable intents - calendar, tasks, reminders (guides LLM to offer)
  actionableIntentCaptureDefinition,
  // Contacts - most specific (phone/email patterns)
  contactCaptureDefinition,
  // Commitments - specific language patterns
  commitmentCaptureDefinition,
  // Dreams - long-term aspirations
  dreamCaptureDefinition,
  // Conflict detection
  conflictCaptureDefinition,
  // Recovery events
  recoveryEventCaptureDefinition,
  // Social events
  socialEventCaptureDefinition,
  // Mood capture
  moodCaptureDefinition,
  // Inside jokes (needs context)
  insideJokeCaptureDefinition,
  // Pets - furry family members (E2E domain hooks)
  petCaptureDefinition,
  // Locations - favorite places and memories (E2E domain hooks)
  locationCaptureDefinition,
  // Relationships last - broad pattern matching
  relationshipCaptureDefinition,
];

// Re-export individual definitions
export { contactCaptureDefinition } from './contacts.capture.js';
export { commitmentCaptureDefinition } from './commitments.capture.js';
export { dreamCaptureDefinition } from './dreams.capture.js';
export { relationshipCaptureDefinition } from './relationships.capture.js';
// V2 "Better Than Human" capture definitions
export { moodCaptureDefinition } from './mood.capture.js';
export { socialEventCaptureDefinition } from './social-event.capture.js';
export { conflictCaptureDefinition } from './conflict.capture.js';
export { boundaryCaptureDefinition } from './boundary.capture.js';
export { recoveryEventCaptureDefinition } from './recovery-event.capture.js';
export { insideJokeCaptureDefinition } from './inside-joke.capture.js';
export { actionableIntentCaptureDefinition } from './actionable-intent.capture.js';
// V3 Domain Hooks - location and pets capture (E2E integration)
export { locationCaptureDefinition } from './location.capture.js';
export { petCaptureDefinition } from './pets.capture.js';
