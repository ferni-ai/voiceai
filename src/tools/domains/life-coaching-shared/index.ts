/**
 * Life Coaching Shared Intelligence
 *
 * Shared utilities, content databases, and intelligence patterns
 * used across all life coaching domains. This is the "state of the art"
 * foundation that makes Ferni superhuman.
 *
 * INTELLIGENCE LAYERS:
 * 1. Content Databases - Evidence-based scripts, frameworks, templates
 * 2. User Personalization - Four Tendencies, attachment style, history
 * 3. Adaptive Responses - Adjusts based on emotional state, past attempts
 * 4. Pattern Recognition - Identifies recurring themes across conversations
 *
 * PRINCIPLE ALIGNMENT:
 * - "Better than Human" - Perfect memory, zero judgment, superhuman pattern recognition
 * - "Making AI Human" - Warm language, never clinical, always personal
 * - "Gentle Growth" - Meet them where they are, no rushing
 */

// Core types - main Framework definition
export * from './types.js';

// User profile management
export * from './user-profile.js';

// Adaptive responses (has adaptForTendency)
export * from './adaptive-response.js';

// Content databases (uses Framework from types)
export * from './content-databases.js';

// Safety guards
export * from './safety-guards.js';

// Analytics
export * from './analytics.js';

// Cross-persona hooks
export * from './cross-persona-hooks.js';

// PhD-level research content - has its own Framework type, so use explicit exports
// to avoid collision with types.js Framework
export {
  loadResearchBase,
  loadPersonaMethodology,
  getFramework as getResearchFramework,
  getDomainResearch,
  getFrameworksForDomain as getResearchFrameworks,
  getPersonaPhrases,
  getTendencyApproach,
  getRandomInsight,
  type DomainResearch,
  type PersonaMethodology,
  type Framework as ResearchFramework,
  type Technique,
  type Expert,
  type Assessment,
} from './content/content-loader.js';

// Tool integration from content module - has adaptForTendency, so use explicit exports
// to avoid collision with adaptive-response.js
export {
  getEnrichedToolContext,
  formatFrameworkReference,
  enrichResponse,
  getSpecificFramework as getSpecificResearchFramework,
  adaptForTendency as adaptForTendencyResearch,
  getCBTDistortions,
  getAttachmentInfo,
  getRelationshipWarnings,
  getHandoffNotes,
} from './content/tool-integration.js';

// Tool integration helpers
export * from './tool-content-integration.js';
