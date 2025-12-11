/**
 * Brand Hooks - Easy integration points for brand compliance
 *
 * Pre-built hooks for common integration scenarios:
 * - Voice agent responses
 * - Email/SMS outreach
 * - Notifications
 * - Generated content
 *
 * @module @ferni/brand/brand-hooks
 */

import { createLogger } from '../../utils/safe-logger.js';
import { loadBrandContext } from './brand-context.js';
import { buildBrandSystemPrompt, type LLMClient } from './brand-generator.js';
import { getPersonaVoice } from './persona-voices.js';
import { autoFixViolations, quickValidate, validateBrandCompliance } from './brand-validator.js';
import { adaptForChannel } from './channel-adapter.js';
import type { Channel, ContextType, PersonaId } from './types.js';

const log = createLogger({ module: 'BrandHooks' });

// ============================================================================
// VOICE AGENT HOOKS
// ============================================================================

/**
 * Get a brand-aware system prompt for a persona
 * Use this when initializing voice agent sessions
 */
export async function getBrandSystemPrompt(
  personaId: PersonaId,
  context: {
    audience?: 'new_user' | 'returning_user' | 'churned_user' | 'subscriber';
    emotion?: ContextType;
  } = {}
): Promise<string> {
  const brandContext = await loadBrandContext();
  const personaVoice = getPersonaVoice(personaId);

  return buildBrandSystemPrompt({
    brandContext,
    personaVoice,
    contentType: 'response',
    context: {
      audience: context.audience || 'returning_user',
      emotion: context.emotion || 'checkin',
      channel: 'voice',
      persona: personaId,
    },
  });
}

/**
 * Validate and optionally fix agent response before sending
 */
export async function validateAgentResponse(
  response: string,
  personaId: PersonaId = 'ferni'
): Promise<{
  isValid: boolean;
  response: string;
  issues: string[];
}> {
  const result = await validateBrandCompliance(response, {
    persona: personaId,
    context: 'coaching',
  });

  if (result.isCompliant) {
    return { isValid: true, response, issues: [] };
  }

  // Try auto-fix for minor violations
  const { fixed, changes } = autoFixViolations(response);

  if (changes.length > 0) {
    log.info({ changes }, 'Auto-fixed agent response');

    // Re-validate after fix
    const revalidation = await validateBrandCompliance(fixed, {
      persona: personaId,
      context: 'coaching',
    });

    return {
      isValid: revalidation.isCompliant,
      response: fixed,
      issues: revalidation.violations.map((v) => v.suggestion),
    };
  }

  return {
    isValid: false,
    response,
    issues: result.violations.map((v) => v.suggestion),
  };
}

// ============================================================================
// OUTREACH HOOKS
// ============================================================================

/**
 * Validate and adapt content for outreach channel
 * Use before sending emails, SMS, push notifications
 */
export function prepareOutreachContent(
  content: string,
  channel: Channel,
  options: {
    personaId?: PersonaId;
    context?: ContextType;
  } = {}
): {
  content: string;
  isValid: boolean;
  issues: string[];
} {
  const { personaId = 'ferni', context = 'notification' } = options;

  // Quick validate first
  const validation = quickValidate(content);

  let finalContent = content;

  if (validation.hasBannedContent) {
    // Try auto-fix
    const { fixed, changes } = autoFixViolations(content);
    if (changes.length > 0) {
      finalContent = fixed;
      log.info({ channel, changes }, 'Auto-fixed outreach content');
    }
  }

  // Adapt for channel
  const adapted = adaptForChannel(finalContent, channel, {
    persona: personaId,
    context,
  });

  // Final validation
  const finalValidation = quickValidate(adapted);

  return {
    content: adapted,
    isValid: !finalValidation.hasBannedContent,
    issues: finalValidation.issues,
  };
}

/**
 * Validate email content specifically
 */
export function validateEmailContent(
  subject: string,
  body: string,
  personaId: PersonaId = 'ferni'
): {
  isValid: boolean;
  subject: string;
  body: string;
  issues: string[];
} {
  const subjectResult = quickValidate(subject);
  const bodyResult = quickValidate(body);

  let finalSubject = subject;
  let finalBody = body;
  const issues: string[] = [];

  if (subjectResult.hasBannedContent) {
    const { fixed, changes } = autoFixViolations(subject);
    if (changes.length > 0) {
      finalSubject = fixed;
    } else {
      issues.push(...subjectResult.issues.map((i) => `Subject: ${i}`));
    }
  }

  if (bodyResult.hasBannedContent) {
    const { fixed, changes } = autoFixViolations(body);
    if (changes.length > 0) {
      finalBody = fixed;
    } else {
      issues.push(...bodyResult.issues.map((i) => `Body: ${i}`));
    }
  }

  // Adapt body for email channel
  const adaptedBody = adaptForChannel(finalBody, 'email', {
    persona: personaId,
    context: 'notification',
  });

  return {
    isValid: issues.length === 0,
    subject: finalSubject,
    body: adaptedBody,
    issues,
  };
}

/**
 * Validate SMS content specifically
 */
export function validateSmsContent(
  message: string,
  personaId: PersonaId = 'ferni'
): {
  isValid: boolean;
  message: string;
  issues: string[];
} {
  const result = quickValidate(message);

  let finalMessage = message;
  const issues: string[] = [];

  if (result.hasBannedContent) {
    const { fixed, changes } = autoFixViolations(message);
    if (changes.length > 0) {
      finalMessage = fixed;
    } else {
      issues.push(...result.issues);
    }
  }

  // Adapt for SMS (shorten, remove links if needed)
  const adapted = adaptForChannel(finalMessage, 'sms', {
    persona: personaId,
    context: 'notification',
  });

  return {
    isValid: issues.length === 0,
    message: adapted,
    issues,
  };
}

// ============================================================================
// CONTENT GENERATION HOOKS
// ============================================================================

/**
 * Create a brand-aware content generator function
 * Returns a function that validates and fixes generated content
 */
export function createBrandValidator(personaId: PersonaId = 'ferni') {
  return (content: string): { content: string; isValid: boolean } => {
    const result = quickValidate(content);

    if (!result.hasBannedContent) {
      return { content, isValid: true };
    }

    const { fixed, changes } = autoFixViolations(content);

    if (changes.length > 0) {
      const recheck = quickValidate(fixed);
      return { content: fixed, isValid: !recheck.hasBannedContent };
    }

    return { content, isValid: false };
  };
}

/**
 * Wrap an LLM client to add brand validation
 */
export function wrapLLMWithBrandValidation(
  client: LLMClient,
  personaId: PersonaId = 'ferni'
): LLMClient {
  const validator = createBrandValidator(personaId);

  return {
    async generate(params) {
      const response = await client.generate(params);
      const { content, isValid } = validator(response);

      if (!isValid) {
        log.warn({ personaId }, 'LLM response failed brand validation after fix');
      }

      return content;
    },
  };
}

// ============================================================================
// QUICK CHECKS
// ============================================================================

/**
 * Quick check if content is brand-compliant
 * Fastest option - no async, no detailed report
 */
export function isBrandCompliant(content: string): boolean {
  const result = quickValidate(content);
  return !result.hasBannedContent;
}

/**
 * Get a list of brand issues in content
 */
export function getBrandIssues(content: string): string[] {
  const result = quickValidate(content);
  return result.issues;
}

/**
 * Auto-fix content and return the result
 */
export function fixBrandViolations(content: string): string {
  const { fixed } = autoFixViolations(content);
  return fixed;
}

// ============================================================================
// PERSONA-SPECIFIC HOOKS
// ============================================================================

/**
 * Get greeting options for a persona
 */
export function getPersonaGreetings(personaId: PersonaId): string[] {
  const persona = getPersonaVoice(personaId);
  return persona.greetings;
}

/**
 * Get response patterns for a persona and context
 */
export function getPersonaResponses(
  personaId: PersonaId,
  context: ContextType
): string[] {
  const persona = getPersonaVoice(personaId);
  return persona.responsePatterns[context] || persona.responsePatterns.checkin;
}

/**
 * Check if phrase matches persona's anti-patterns
 */
export function isAntiPattern(content: string, personaId: PersonaId): boolean {
  const persona = getPersonaVoice(personaId);
  const lowerContent = content.toLowerCase();

  return persona.antiPatterns.some((pattern) =>
    lowerContent.includes(pattern.toLowerCase())
  );
}
