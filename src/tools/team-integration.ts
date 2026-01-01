/**
 * Team Integration System - Re-export Shim
 *
 * This file re-exports from the new modular location for backward compatibility.
 * Import from './handoff/team-coordination/index.js' instead for new code.
 *
 * @deprecated Import from './handoff/team-coordination/index.js' instead
 */

// Re-export everything from the new location
export {
  // Types
  type TeamMember,
  type TeamContext,
  type TeamProject,
  type SharedGoal,
  type SharedMilestone,
  type SharedBudget,
  type TeamHandoff,
  // Constants
  TEAM_CAPABILITIES,
  // Helpers
  findBestTeamMember,
  getOrCreateTeamContext,
  // Core functions
  createSharedGoal,
  createTeamHandoff,
  linkMilestoneToTeam,
  // Tools
  createTeamIntegrationTools,
  // Default
  createTeamIntegrationTools as default,
} from './handoff/team-coordination/index.js';
