/**
 * Base Identity Rules
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Persona-agnostic rules that apply to ALL voice AI personas.
 * These are the foundational behaviors that make the AI feel human,
 * regardless of which specific persona is being used.
 *
 * This file is the heart of our human-first philosophy in code.
 *
 * NOTE: This is intentionally similar to src/persona/core-identity.ts
 * The difference:
 *   - THIS FILE (base-identity.ts): Generic rules for ANY persona
 *   - core-identity.ts: Jack Bogle's FULL identity (includes his specific character)
 *
 * For new personas, use buildSystemPrompt(personaSpecificContent) which
 * combines these generic rules with your persona's unique content.
 *
 * Jack Bogle's agent uses CORE_IDENTITY directly because it has
 * additional Jack-specific character details baked in.
 */
export declare const BASE_IDENTITY_RULES: string;
/**
 * Generate a complete system prompt by combining base rules with persona-specific content
 */
export declare function buildSystemPrompt(personaSpecificContent: string): string;
//# sourceMappingURL=base-identity.d.ts.map