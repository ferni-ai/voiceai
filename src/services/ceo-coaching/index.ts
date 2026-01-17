/**
 * CEO Coaching Services
 *
 * Supporting services for the CEO coaching domain:
 * - Weekly digest generation and email rendering
 * - Proactive outbound call triggers (pattern detection)
 *
 * @module services/ceo-coaching
 */

export {
  generateWeeklyDigest,
  renderDigestEmail,
  renderDigestText,
  type WeeklyDigestData,
} from './weekly-digest.js';

export {
  analyzeUserForTriggers,
  triggerProactiveOutreach,
  checkImmediateTrigger,
  processCEOTriggersBatch,
  TRIGGER_CONFIG,
  type CEOTrigger,
  type CEOTriggerType,
  type CEOTriggerAnalysis,
} from './proactive-triggers.js';
