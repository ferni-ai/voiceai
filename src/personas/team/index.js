/**
 * Team Index
 *
 * Central exports for team configuration, packages, and prompt injection.
 */
export { FINANCIAL_WELLNESS_TEAM } from './package-types.js';
// Team configuration
export { DEFAULT_TEAM_CONFIG, DEFAULT_TEAM_MEMBERS, DEFAULT_HANDOFF_TEMPLATES, DEFAULT_TEAM_COORDINATION, getTeamMemberByRole, getTeamMemberByCharacter, getHandoffTemplates, getRandomHandoffPhrase, getCoordinatorId, isTeamEnabled, } from './team-config.js';
// Prompt injection
export { generateTeammatesSection, generateHandoffSection, generateCoordinationSection, createTeamContext, injectTeamContext, } from './prompt-injection.js';
//# sourceMappingURL=index.js.map