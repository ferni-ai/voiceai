/**
 * Team Configuration
 *
 * ARCHITECTURE:
 * =============
 * SINGLE SOURCE OF TRUTH: Each persona's `persona.manifest.json` file.
 *
 * The PRIMARY method for getting team config is `getTeamConfig()` which calls
 * `generateTeamConfigFromBundles()` to dynamically build team configuration
 * from bundle manifests.
 *
 * The hardcoded DEFAULT_* constants below are FALLBACKS ONLY, used when:
 * - Bundle discovery fails
 * - Running in environments without filesystem access
 * - Testing scenarios that don't load full bundles
 *
 * To update team member info, edit the persona's manifest file at:
 *   src/personas/bundles/{persona-id}/persona.manifest.json
 *
 * Then run `npm run generate:personas` to update frontend config.
 */
import type { TeamConfig, TeamMember, HandoffTemplate, TeamCoordination } from './types.js';
/**
 * FALLBACK team members - used only when bundle loading fails.
 * PRIMARY SOURCE: persona.manifest.json files in each bundle.
 * @deprecated Prefer using getTeamConfig() which loads from bundles.
 */
export declare const DEFAULT_TEAM_MEMBERS: TeamMember[];
/**
 * FALLBACK handoff templates - used only when bundle loading fails.
 * PRIMARY SOURCE: team.handoff_phrases in persona.manifest.json files.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export declare const DEFAULT_HANDOFF_TEMPLATES: HandoffTemplate[];
/**
 * FALLBACK team coordination rules - used only when bundle loading fails.
 * PRIMARY SOURCE: role.domains and team.handoff_triggers in persona.manifest.json files.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export declare const DEFAULT_TEAM_COORDINATION: TeamCoordination;
/**
 * FALLBACK team configuration - used only when bundle loading fails.
 * Use getTeamConfig() as the primary method to get team configuration.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export declare const DEFAULT_TEAM_CONFIG: TeamConfig;
/**
 * Get a team member by role ID
 */
export declare function getTeamMemberByRole(roleId: string, team?: TeamConfig): TeamMember | undefined;
/**
 * Get a team member by character ID
 */
export declare function getTeamMemberByCharacter(characterId: string, team?: TeamConfig): TeamMember | undefined;
/**
 * Get handoff templates from one role to another
 */
export declare function getHandoffTemplates(fromRole: string, toRole: string, team?: TeamConfig): string[];
/**
 * Get a random handoff phrase
 */
export declare function getRandomHandoffPhrase(fromRole: string, toRole: string, team?: TeamConfig): string | undefined;
/**
 * Get the coordinator's character ID
 */
export declare function getCoordinatorId(team?: TeamConfig): string;
/**
 * Check if team mode is enabled
 */
export declare function isTeamEnabled(team?: TeamConfig): boolean;
/**
 * Generate team configuration from loaded bundles.
 * This is now the PRIMARY method for getting team config.
 * Creates team config dynamically based on bundle manifest data.
 *
 * @param forceRefresh - Force reload from bundles even if cached
 */
export declare function generateTeamConfigFromBundles(forceRefresh?: boolean): Promise<TeamConfig>;
/**
 * Clear the team config cache.
 * Call this when bundles are added/removed.
 */
export declare function clearTeamConfigCache(): void;
/**
 * Get the team config - uses bundle-based generation as primary.
 * Falls back to hardcoded DEFAULT_TEAM_CONFIG if bundles fail.
 */
export declare function getTeamConfig(): Promise<TeamConfig>;
/**
 * Get handoff triggers for a persona from their bundle.
 * Returns empty array if no triggers defined.
 */
export declare function getHandoffTriggersForPersona(personaId: string): Promise<string[]>;
/**
 * Get all handoff triggers mapped to persona IDs.
 * Useful for the handoff detection system.
 */
export declare function getAllHandoffTriggers(): Promise<Map<string, string[]>>;
//# sourceMappingURL=team-config.d.ts.map