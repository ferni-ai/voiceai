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
import { type LLMClient } from './brand-generator.js';
import type { Channel, ContextType, PersonaId } from './types.js';
/**
 * Get a brand-aware system prompt for a persona
 * Use this when initializing voice agent sessions
 */
export declare function getBrandSystemPrompt(personaId: PersonaId, context?: {
    audience?: 'new_user' | 'returning_user' | 'churned_user' | 'subscriber';
    emotion?: ContextType;
}): Promise<string>;
/**
 * Validate and optionally fix agent response before sending
 */
export declare function validateAgentResponse(response: string, personaId?: PersonaId): Promise<{
    isValid: boolean;
    response: string;
    issues: string[];
}>;
/**
 * Validate and adapt content for outreach channel
 * Use before sending emails, SMS, push notifications
 */
export declare function prepareOutreachContent(content: string, channel: Channel, options?: {
    personaId?: PersonaId;
    context?: ContextType;
}): {
    content: string;
    isValid: boolean;
    issues: string[];
};
/**
 * Validate email content specifically
 */
export declare function validateEmailContent(subject: string, body: string, personaId?: PersonaId): {
    isValid: boolean;
    subject: string;
    body: string;
    issues: string[];
};
/**
 * Validate SMS content specifically
 */
export declare function validateSmsContent(message: string, personaId?: PersonaId): {
    isValid: boolean;
    message: string;
    issues: string[];
};
/**
 * Create a brand-aware content generator function
 * Returns a function that validates and fixes generated content
 */
export declare function createBrandValidator(personaId?: PersonaId): (content: string) => {
    content: string;
    isValid: boolean;
};
/**
 * Wrap an LLM client to add brand validation
 */
export declare function wrapLLMWithBrandValidation(client: LLMClient, personaId?: PersonaId): LLMClient;
/**
 * Quick check if content is brand-compliant
 * Fastest option - no async, no detailed report
 */
export declare function isBrandCompliant(content: string): boolean;
/**
 * Get a list of brand issues in content
 */
export declare function getBrandIssues(content: string): string[];
/**
 * Auto-fix content and return the result
 */
export declare function fixBrandViolations(content: string): string;
/**
 * Get greeting options for a persona
 */
export declare function getPersonaGreetings(personaId: PersonaId): string[];
/**
 * Get response patterns for a persona and context
 */
export declare function getPersonaResponses(personaId: PersonaId, context: ContextType): string[];
/**
 * Check if phrase matches persona's anti-patterns
 */
export declare function isAntiPattern(content: string, personaId: PersonaId): boolean;
//# sourceMappingURL=brand-hooks.d.ts.map