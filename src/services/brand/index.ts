/**
 * Brand System
 *
 * AI-powered brand management system for Ferni.
 * Ensures consistent brand voice across all touchpoints.
 *
 * @module @ferni/brand
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  BrandContext,
  BrandIdentity,
  BrandVoice,
  BrandTokens,
  BrandLearnings,

  // Voice types
  VoicePrinciple,
  WordDefinition,
  WordReplacement,
  ToneConfig,
  SampleCopy,
  ContextType,

  // Persona types
  PersonaId,
  PersonaVoice,

  // Validation types
  BrandViolation,
  ValidationResult,

  // Generation types
  GenerationRequest,
  GenerationResult,
  Channel,
  ChannelConfig,

  // Learning types
  ExperimentPattern,
  BrandRuleChange,
  BrandHealthMetrics,
} from './types.js';

// ============================================================================
// BRAND CONTEXT
// ============================================================================

export {
  loadBrandContext,
  clearBrandContextCache,
  getBrandContextForPersona,
  getVoiceRules,
  getBannedPhrases,
  getWordsToAvoid,
  getToneConfig,
  getClientBrandRules,
} from './brand-context.js';

// ============================================================================
// PERSONA VOICES
// ============================================================================

export {
  PERSONA_VOICES,
  getPersonaVoice,
  getCorePersonas,
  getMarketplacePersonas,
  getRandomGreeting,
  getResponsePatterns,
  containsAntiPattern,
} from './persona-voices.js';

// ============================================================================
// BRAND VALIDATOR
// ============================================================================

export {
  validateBrandCompliance,
  quickValidate,
  autoFixViolations,
  getQuickScore,
} from './brand-validator.js';

// ============================================================================
// BRAND GENERATOR
// ============================================================================

export {
  buildBrandSystemPrompt,
  generateBrandContent,
  generateVariants,
  generateExperimentVariants,
  type LLMClient,
} from './brand-generator.js';

// ============================================================================
// BRAND EVOLUTION
// ============================================================================

export {
  extractBrandLearnings,
  evolveBrandRules,
  recordFailedApproach,
  calculateBrandHealth,
  logValidation,
  runDailyEvolution,
  getRecentRuleChanges,
} from './brand-evolution.js';

// ============================================================================
// CHANNEL ADAPTER
// ============================================================================

export {
  CHANNEL_CONFIGS,
  adaptForChannel,
  generateForAllChannels,
  getChannelConfig,
  fitsChannelConstraints,
  checkVoiceConsistency,
} from './channel-adapter.js';
