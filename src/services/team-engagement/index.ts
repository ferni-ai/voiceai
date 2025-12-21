/**
 * Team Engagement Module
 *
 * Re-exports all team engagement types, data, and utilities.
 *
 * @module team-engagement
 */

// Types
export * from './types.js';

// Static Data (fallback banter)
export {
  CROSS_PERSONA_REFERENCES,
  HANDOFF_BANTER,
  ARRIVING_BANTER,
  getHandoffBanter,
  getArrivingBanter,
} from './banter.js';
export { PERSONA_EVOLUTION_STORIES } from './evolution-stories.js';

// Intelligent Banter (context-aware handoffs)
export {
  getIntelligentBanter,
  buildBanterContext,
  detectTimeOfDay,
  type BanterContext,
  type IntelligentBanterResult,
  // LLM-driven banter (new!)
  getLLMDrivenBanter,
  buildLLMSoftOpenInstructions,
  buildLLMArrivingInstructions,
  type LLMBanterInstructions,
} from './intelligent-banter.js';

// Main service is in the parent directory for backward compatibility
// Import via: import { getTeamEngagement } from '../services/engagement/team-engagement.js';
