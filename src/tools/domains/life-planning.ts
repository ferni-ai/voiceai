/**
 * Life Planning Domain Tools
 *
 * Barrel export for Jordan's lifetime planning features:
 * - Life firsts tracker (all major life milestones)
 * - Cultural celebrations (quinceañera, bar/bat mitzvah, etc.)
 * - First-time planning (guidance for life's firsts)
 * - Gift registry (wishlists and registries)
 * - Milestone proactive (proactive milestone suggestions)
 * - Retirement planning (vision, timeline, checklists)
 * - Goal management (life goals, portfolios, reviews)
 * - Team integration (coordination with Maya, Alex, Jack, etc.)
 *
 * Jordan is the lifetime planner - helping users across every
 * chapter from launching to legacy.
 */

export { createLifeFirstsTools } from './life-planning/life-firsts-tracker.js';
export { createCulturalCelebrationTools } from './life-planning/cultural-celebrations.js';
export { createFirstTimePlanningTools } from './life-planning/first-time-planning.js';
export { createGiftRegistryTools } from './life-planning/gift-registry.js';
export { createMilestoneProactiveTools } from './life-planning/milestone-proactive.js';
export { createRetirementPlanningTools } from './finance/retirement-planning.js';
export { createGoalManagementTools } from './life-planning/goal-management.js';
export { createTeamIntegrationTools } from '../team-integration.js';
export { createEventPlanningTools } from './life-planning/event-planning.js';
