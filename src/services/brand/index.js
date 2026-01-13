/**
 * Brand System
 *
 * AI-powered brand management system for Ferni.
 * Ensures consistent brand voice across all touchpoints.
 *
 * @module @ferni/brand
 */
// ============================================================================
// BRAND CONTEXT
// ============================================================================
export { clearBrandContextCache, getBannedPhrases, getBrandContextForPersona, getClientBrandRules, getToneConfig, getVoiceRules, getWordsToAvoid, loadBrandContext, } from './brand-context.js';
// ============================================================================
// PERSONA VOICES
// ============================================================================
export { PERSONA_VOICES, containsAntiPattern, getCorePersonas, getMarketplacePersonas, getPersonaVoice, getRandomGreeting, getResponsePatterns, } from './persona-voices.js';
// ============================================================================
// BRAND VALIDATOR
// ============================================================================
export { autoFixViolations, getQuickScore, quickValidate, validateBrandCompliance, } from './brand-validator.js';
// ============================================================================
// BRAND GENERATOR
// ============================================================================
export { buildBrandSystemPrompt, generateBrandContent, generateExperimentVariants, generateVariants, } from './brand-generator.js';
// ============================================================================
// BRAND EVOLUTION
// ============================================================================
export { calculateBrandHealth, evolveBrandRules, extractBrandLearnings, getRecentRuleChanges, logValidation, recordFailedApproach, runDailyEvolution, } from './brand-evolution.js';
// ============================================================================
// CHANNEL ADAPTER
// ============================================================================
export { CHANNEL_CONFIGS, adaptForChannel, checkVoiceConsistency, fitsChannelConstraints, generateForAllChannels, getChannelConfig, } from './channel-adapter.js';
// ============================================================================
// BRAND HOOKS (Integration helpers)
// ============================================================================
export { 
// Content generation hooks
createBrandValidator, fixBrandViolations, getBrandIssues, 
// Voice agent hooks
getBrandSystemPrompt, 
// Persona helpers
getPersonaGreetings, getPersonaResponses, isAntiPattern, 
// Quick checks
isBrandCompliant, 
// Outreach hooks
prepareOutreachContent, validateAgentResponse, validateEmailContent, validateSmsContent, wrapLLMWithBrandValidation, } from './brand-hooks.js';
//# sourceMappingURL=index.js.map