/**
 * Team Prompt Injection
 *
 * Generates team-aware sections for system prompts.
 * This replaces hardcoded team references with dynamic injection.
 */
import type { TeamConfig, TeamContext } from './types.js';
/**
 * Generate the teammates section for a system prompt
 */
export declare function generateTeammatesSection(currentRole: string, team?: TeamConfig): string;
/**
 * Generate the handoff instructions section
 */
export declare function generateHandoffSection(currentRole: string, team?: TeamConfig): string;
/**
 * Generate team coordination section (for cross-team work)
 */
export declare function generateCoordinationSection(currentRole: string, team?: TeamConfig): string;
/**
 * Create a complete team context for prompt building
 */
export declare function createTeamContext(currentRole: string, currentCharacter: string, team?: TeamConfig): TeamContext;
/**
 * Inject team context into a system prompt
 * Replaces placeholder markers with team-specific content
 */
export declare function injectTeamContext(systemPrompt: string, context: TeamContext): string;
//# sourceMappingURL=prompt-injection.d.ts.map