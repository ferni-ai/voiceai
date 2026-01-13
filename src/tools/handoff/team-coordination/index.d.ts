/**
 * Team Coordination Module
 *
 * Deep integration between team members:
 * - Jordan: Life planning, goals, milestones, events
 * - Maya: Budget, savings, spending, financial goals
 * - Alex: Communication, scheduling, reminders, follow-ups
 *
 * This module enables:
 * - Shared context between team members
 * - Coordinated goal tracking
 * - Seamless handoffs with full context
 * - Team-based planning workflows
 * - ACTUAL cross-agent tool execution via the Agent Bus
 */
export type { TeamMember, TeamContext, TeamProject, SharedGoal, SharedMilestone, SharedBudget, TeamHandoff, TeamMemberInfo, } from './types.js';
export { TEAM_CAPABILITIES, MAX_NAME_LENGTH, MAX_NOTES_LENGTH, MAX_AMOUNT } from './types.js';
export { validateProjectName, validateAmountField, validateNotes, getOrCreateTeamContext, findBestTeamMember, getTeamMemberInfo, } from './helpers.js';
export { createSharedGoal, createTeamHandoff, linkMilestoneToTeam } from './core.js';
export { createTeamIntegrationTools } from './tools.js';
export { createTeamIntegrationTools as default } from './tools.js';
//# sourceMappingURL=index.d.ts.map