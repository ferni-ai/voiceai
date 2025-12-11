/**
 * Brand System Hooks
 *
 * Integration points for the brand system throughout the codebase.
 * These hooks ensure brand compliance at key touchpoints.
 *
 * @module @ferni/brand/brand-hooks
 */

import { createLogger } from '../../utils/safe-logger.js';
import { quickValidate, validateBrandCompliance, autoFixViolations } from './brand-validator.js';
import { getPersonaVoice, getRandomGreeting, getResponsePatterns } from './persona-voices.js';
import { adaptForChannel } from './channel-adapter.js';
import { logValidation } from './brand-evolution.js';
import type { ContextType, PersonaId, Channel, ValidationResult } from './types.js';

const log = createLogger({ module: 'BrandHooks' });

// ============================================================================
// OUTREACH HOOKS
// ============================================================================

/**
 * Validate outreach content before sending
 * Use this in email/SMS/push generation
 */
export async function validateOutreachContent(
  content: string,
  options: {
    personaId: string;
    channel: Channel;
    autoFix?: boolean;
  }
): Promise<{
  isValid: boolean;
  content: string;
  violations: string[];
}> {
  const { personaId, channel, autoFix = true } = options;

  // Map outreach contexts to brand contexts
  const context: ContextType = channel === 'email' ? 'notification' : 'notification';

  const result = await validateBrandCompliance(content, {
    persona: personaId as PersonaId,
    context,
  });

  // Log for metrics
  await logValidation(content, result, { persona: personaId, channel }).catch(() => {});

  if (result.isCompliant) {
    return { isValid: true, content, violations: [] };
  }

  // Auto-fix if enabled
  if (autoFix && result.violations.length > 0) {
    const { fixed, changes } = autoFixViolations(content);
    if (changes.length > 0) {
      log.info({ personaId, channel, changes }, 'Auto-fixed outreach content');
      return { isValid: true, content: fixed, violations: [] };
    }
  }

  return {
    isValid: false,
    content,
    violations: result.violations.map((v) => v.suggestion),
  };
}

/**
 * Adapt outreach content for channel constraints
 */
export function adaptOutreachForChannel(
  content: string,
  channel: Channel,
  personaId: string
): string {
  return adaptForChannel(content, channel, {
    persona: personaId as PersonaId,
    context: 'notification',
  });
}

/**
 * Get brand-compliant greeting for outreach
 */
export function getBrandGreeting(personaId: string): string {
  return getRandomGreeting(personaId as PersonaId);
}

/**
 * Get brand-compliant response patterns for context
 */
export function getBrandPatterns(personaId: string, context: ContextType): string[] {
  return getResponsePatterns(personaId as PersonaId, context);
}

// ============================================================================
// EXPERIMENT HOOKS
// ============================================================================

/**
 * Validate experiment variant content
 * Use this when creating or updating experiment variants
 */
export async function validateExperimentVariant(
  content: string,
  experimentType: 'headline' | 'cta' | 'body'
): Promise<{
  isValid: boolean;
  score: number;
  issues: string[];
}> {
  const result = await validateBrandCompliance(content, {
    context: 'marketing',
    strict: true, // Experiments should be fully compliant
  });

  return {
    isValid: result.isCompliant,
    score: result.score,
    issues: result.violations.map((v) => v.suggestion),
  };
}

/**
 * Batch validate all variants in an experiment
 */
export async function validateExperimentVariants(
  variants: { id: string; content: string }[]
): Promise<{
  allValid: boolean;
  results: { id: string; isValid: boolean; score: number; issues: string[] }[];
}> {
  const results = await Promise.all(
    variants.map(async (variant) => {
      const validation = await validateExperimentVariant(variant.content, 'headline');
      return {
        id: variant.id,
        ...validation,
      };
    })
  );

  return {
    allValid: results.every((r) => r.isValid),
    results,
  };
}

// ============================================================================
// VOICE AGENT HOOKS
// ============================================================================

/**
 * Enhance persona system prompt with brand context
 * Call this when building LLM prompts
 */
export function enhancePromptWithBrandContext(
  basePrompt: string,
  personaId: string
): string {
  const persona = getPersonaVoice(personaId as PersonaId);

  const brandInstructions = `
## CRITICAL BRAND RULES

You are ${persona.name}, ${persona.archetype}. 
Your tone: ${persona.tone}

NEVER say these phrases:
- "As an AI"
- "I'm designed to"
- "I'm programmed"
- Any reference to being artificial

ALWAYS use language like:
${persona.signaturePhrases.map((p) => `- "${p}"`).join('\n')}

Your speaking style: ${persona.speakingStyle}

Words you use often: ${persona.vocabularyBias.join(', ')}
`;

  // Inject brand rules at the start of the prompt
  return brandInstructions + '\n\n' + basePrompt;
}

/**
 * Validate LLM response against brand rules
 * Call this after receiving LLM output
 */
export async function validateAgentResponse(
  response: string,
  personaId: string
): Promise<{
  isValid: boolean;
  sanitized: string;
  hadViolations: boolean;
}> {
  const result = await validateBrandCompliance(response, {
    persona: personaId as PersonaId,
    context: 'support', // Agent responses are usually supportive
  });

  if (result.isCompliant) {
    return { isValid: true, sanitized: response, hadViolations: false };
  }

  // Auto-fix any violations
  const { fixed, changes } = autoFixViolations(response);

  if (changes.length > 0) {
    log.warn({ personaId, changes }, 'Auto-fixed agent response brand violations');
  }

  return {
    isValid: changes.length === 0 || quickValidate(fixed).hasBannedContent === false,
    sanitized: fixed,
    hadViolations: true,
  };
}

// ============================================================================
// CONTENT GENERATION HOOKS
// ============================================================================

/**
 * Wrap any content generation with brand validation
 */
export async function withBrandValidation<T extends string>(
  generator: () => T | Promise<T>,
  options: {
    personaId?: string;
    context?: ContextType;
    autoFix?: boolean;
  } = {}
): Promise<{ content: T; wasFixed: boolean; score: number }> {
  const { personaId = 'ferni', context = 'checkin', autoFix = true } = options;

  const content = await generator();

  const result = await validateBrandCompliance(content, {
    persona: personaId as PersonaId,
    context,
  });

  if (result.isCompliant) {
    return { content, wasFixed: false, score: result.score };
  }

  if (autoFix) {
    const { fixed, changes } = autoFixViolations(content);
    if (changes.length > 0) {
      return { content: fixed as T, wasFixed: true, score: 100 };
    }
  }

  return { content, wasFixed: false, score: result.score };
}

// ============================================================================
// QUICK VALIDATION HOOKS
// ============================================================================

/**
 * Quick check for banned content (fast, synchronous)
 * Use this for real-time validation in UI
 */
export function quickBrandCheck(content: string): {
  hasBannedContent: boolean;
  issues: string[];
} {
  return quickValidate(content);
}

/**
 * Check if content contains any critical brand violations
 */
export function hasCriticalViolations(content: string): boolean {
  const { hasBannedContent } = quickValidate(content);
  return hasBannedContent;
}

// ============================================================================
// PERSONA HELPERS
// ============================================================================

/**
 * Get persona voice profile for integrations
 */
export function getPersonaProfile(personaId: string) {
  return getPersonaVoice(personaId as PersonaId);
}

/**
 * Map outreach tone to brand context
 */
export function mapOutreachToneToBrandContext(
  tone: 'celebratory' | 'supportive' | 'encouraging' | 'casual' | 'informative' | 'urgent'
): ContextType {
  const mapping: Record<string, ContextType> = {
    celebratory: 'celebration',
    supportive: 'support',
    encouraging: 'coaching',
    casual: 'checkin',
    informative: 'notification',
    urgent: 'notification',
  };
  return mapping[tone] || 'checkin';
}
