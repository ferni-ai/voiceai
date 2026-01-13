/**
 * Brand System
 *
 * AI-powered brand management system for Ferni.
 * Ensures consistent brand voice across all touchpoints.
 *
 * @module @ferni/brand
 */
export type { BrandContext, BrandHealthMetrics, BrandIdentity, BrandLearnings, BrandRuleChange, BrandTokens, BrandViolation, BrandVoice, Channel, ChannelConfig, ContextType, ExperimentPattern, GenerationRequest, GenerationResult, PersonaId, PersonaVoice, SampleCopy, ToneConfig, ValidationResult, VoicePrinciple, WordDefinition, WordReplacement, } from './types.js';
export { clearBrandContextCache, getBannedPhrases, getBrandContextForPersona, getClientBrandRules, getToneConfig, getVoiceRules, getWordsToAvoid, loadBrandContext, } from './brand-context.js';
export { PERSONA_VOICES, containsAntiPattern, getCorePersonas, getMarketplacePersonas, getPersonaVoice, getRandomGreeting, getResponsePatterns, } from './persona-voices.js';
export { autoFixViolations, getQuickScore, quickValidate, validateBrandCompliance, } from './brand-validator.js';
export { buildBrandSystemPrompt, generateBrandContent, generateExperimentVariants, generateVariants, type LLMClient, } from './brand-generator.js';
export { calculateBrandHealth, evolveBrandRules, extractBrandLearnings, getRecentRuleChanges, logValidation, recordFailedApproach, runDailyEvolution, } from './brand-evolution.js';
export { CHANNEL_CONFIGS, adaptForChannel, checkVoiceConsistency, fitsChannelConstraints, generateForAllChannels, getChannelConfig, } from './channel-adapter.js';
export { createBrandValidator, fixBrandViolations, getBrandIssues, getBrandSystemPrompt, getPersonaGreetings, getPersonaResponses, isAntiPattern, isBrandCompliant, prepareOutreachContent, validateAgentResponse, validateEmailContent, validateSmsContent, wrapLLMWithBrandValidation, } from './brand-hooks.js';
//# sourceMappingURL=index.d.ts.map