/**
 * Reading Between the Lines - Re-export Shim
 *
 * @deprecated Import from '../trust/reading-between-lines.js' instead.
 * This file exists for backward compatibility during the DDD migration.
 *
 * Core detection logic has been split into:
 * - ../trust/reading-between-lines.ts (main API + profiles)
 * - ../trust/intent-detector.ts (intent/emotion detection patterns)
 * - ../trust/tone-analyzer.ts (tone/deflection analysis)
 */
export {
  flushReadingBetweenLinesPersistence,
  shutdownReadingBetweenLines,
  detectUnsaidSignals,
  getUnsaidProfile,
  getAvoidedTopics,
  shouldAvoidTopic,
  recordDidShare,
  exportUnsaidProfile,
  importUnsaidProfile,
  recordDeflectionPattern,
  getDeflectionStats,
  buildDeflectionContext,
} from '../trust/reading-between-lines.js';

export type {
  UnsaidSignal,
  ConversationPattern,
  UserUnsaidProfile,
  PersistedConversationPattern,
  PersistedUserUnsaidProfile,
} from '../trust/reading-between-lines.js';

// Default export for backward compatibility
export { default } from '../trust/reading-between-lines.js';
