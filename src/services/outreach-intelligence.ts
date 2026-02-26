/**
 * Outreach Intelligence Service - Re-export Shim
 *
 * @deprecated Import from './outreach/outreach-intelligence.js' instead.
 * This file exists for backward compatibility during the DDD migration.
 */
export {
  initializeOutreachPersistence,
  shutdownOutreachPersistence,
  clearUserOutreachData,
  clearAllOutreachData,
  pruneStaleOutreachData,
  getOutreachMemoryStats,
  extractCommitments,
  detectOutreachOpportunities,
  detectEmotionalTriggers,
  getPreferences,
  setPreferences,
  canSendOutreach,
  recordInteraction,
  executeOutreach,
} from './outreach/outreach-intelligence.js';

export type {
  OutreachTrigger,
  OutreachPriority,
  OutreachOpportunity,
  UserOutreachPreferences,
  Commitment,
  EngagementPattern,
} from './outreach/outreach-intelligence.js';
