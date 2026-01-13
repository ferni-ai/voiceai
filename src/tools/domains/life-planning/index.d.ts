/**
 * Life Planning Domain Tools
 *
 * Tools for goals, milestones, events, and life planning.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: life-planning
 * TOOLS:
 *   Events: createEvent, searchVenues, addGuests, getChecklist, trackExpense
 *   Goals: createGoal, updateGoalProgress, getGoalsSummary, addGoalMilestone
 *   Milestones: createLifeMilestone, viewLifeMilestones, getMilestoneCountdown
 *   Planning: planMajorPurchase, planVacation, createAnnualPlan
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function getEventPlanningToolDefinitions(): ToolDefinition[];
declare function getLifePlanningToolDefinitions(): ToolDefinition[];
declare function getGoalManagementToolDefinitions(): ToolDefinition[];
declare function getLifeMilestonesToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getEventPlanningToolDefinitions, getLifePlanningToolDefinitions, getGoalManagementToolDefinitions, getLifeMilestonesToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map