/**
 * Team Cameo System
 *
 * Enables team members to "pop in" briefly during Ferni's conversation,
 * deliver a quick insight, and seamlessly hand back.
 *
 * USAGE:
 *
 * ```typescript
 * import { executeCameo, endCameo, cameoEvents } from './services/cameo/index.js';
 *
 * // Listen for cameo events
 * cameoEvents.on('cameo_started', (event) => {
 *   // Switch voice to cameo persona
 *   personaAwareTTS.switchVoice(event.personaName, event.voiceId);
 * });
 *
 * cameoEvents.on('cameo_complete', () => {
 *   // Switch voice back to Ferni
 *   personaAwareTTS.switchVoice('Ferni', ferniVoiceId);
 * });
 *
 * // Trigger a cameo
 * const result = await executeCameo({
 *   personaId: 'peter-john',
 *   triggerType: 'data_insight',
 *   insight: 'That stock you mentioned is up 12% this quarter!',
 * }, { sessionId });
 *
 * // End the cameo (call after persona finishes speaking)
 * await endCameo(sessionId);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  CameoConfig,
  CameoDataMessage,
  CameoDetectionContext,
  CameoEvent,
  CameoEventType,
  CameoHistoryEntry,
  CameoOpportunity,
  CameoPersonaId,
  CameoRequest,
  CameoResult,
  CameoSessionState,
  CameoTriggerType,
  PersonaCameoConfig,
} from './types.js';

// ============================================================================
// ORCHESTRATOR - Main API
// ============================================================================

export {
  cameoEvents,
  cancelCameo,
  endCameo,
  executeCameo,
  getCameoSessionState,
  getCameoStats,
  getCooldownStatus,
  getCurrentCameoPersona,
  hasPersonaCameoed,
  isInCameo,
  resetSessionState,
} from './cameo-orchestrator.js';

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

export {
  CAMEO_CONFIG,
  CAMEO_TIMING,
  PERSONA_CAMEO_CONFIGS,
  getCooldownForPriority,
  getPersonaCameoConfig,
  getRandomHandback,
  getRandomIntroduction,
  getRemainingCooldown,
  getTotalTransitionTime,
  isCooldownExpired,
} from './cameo-timing.js';

// ============================================================================
// CONTENT GENERATION
// ============================================================================

export {
  CONTEXTUAL_HANDBACKS,
  FIRST_TIME_INTRODUCTIONS,
  RETURNING_INTRODUCTIONS,
  TRIGGER_GREETINGS,
  buildCameoSpeech,
  getBestPersonaForTopic,
  getCameoGreeting,
  getCameoHandback,
  getPersonaColor,
  getPersonaGlowColor,
  getTriggerTopicsForPersona,
  isPersonaEnergetic,
} from './cameo-content.js';

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

export {
  CAMEO_OPPORTUNITY_PHRASES,
  EMOTIONAL_TRIGGERS,
  STRONG_TRIGGER_PATTERNS,
  detectCameoOpportunity,
  generateCameoDetectionPrompt,
  parseCameoDetectionResponse,
} from './cameo-triggers.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import cameoOrchestrator from './cameo-orchestrator.js';
export default cameoOrchestrator;
