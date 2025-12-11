/**
 * Simple Utilities - Shared State
 *
 * In-memory stores shared across tool modules.
 * These are per-session and not persisted.
 *
 * @module simple-utilities/shared-state
 */

// Active timers by user
export const activeTimers = new Map<
  string,
  { timeout: NodeJS.Timeout; label: string; endTime: Date }
>();

// Quick notes by user (transient, session-only)
export const quickNotes = new Map<string, Array<{ note: string; createdAt: Date }>>();
