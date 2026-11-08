/**
 * The crisis guard's levels and the voice emotions that amplify them. Moved out of crisis-guard.ts
 * unchanged (#2697, 500-line ratchet).
 *
 * @module CrisisSeverity
 */

/** Patterns that indicate high distress from voice */
export const HIGH_DISTRESS_VOICE_EMOTIONS = [
  'distressed',
  'panicked',
  'desperate',
  'hopeless',
  'suicidal',
];

/** Patterns that indicate moderate distress requiring care */
export const MODERATE_DISTRESS_VOICE_EMOTIONS = ['anxious', 'sad', 'hurt', 'scared', 'overwhelmed'];

export const SEVERITY = {
  explicit: 0.9,
  passive: 0.75,
  implicit: 0.6,
  block: 0.85,
  crisis: 0.7,
} as const;

/** Whether a detection replaces the reply: guardFromDetection's test, without its log. */
export const replacesReply = (crisis: { isCrisis: boolean; severity: number }): boolean =>
  crisis.isCrisis && crisis.severity >= SEVERITY.block;
