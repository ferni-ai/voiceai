/**
 * Team Handler Registry - Handler Index
 *
 * Exports all handlers for the team handler registry.
 *
 * USAGE:
 *   import { registerAllHandlers, registerFinancialHandlers } from './handlers/index.js';
 *
 *   // Register all handlers with their default agents
 *   registerAllHandlers();
 *
 *   // Or register specific handler sets
 *   registerFinancialHandlers('maya');
 *   registerSchedulingHandlers('alex');
 *   registerLifePlanningHandlers('jordan');
 *   registerResearchHandlers('peter-john');
 *   registerCoordinationHandlers('ferni');
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AgentId } from '../../agent-bus.js';

// Financial handlers (Maya)
export {
  registerFinancialHandlers,
  financialHandlers,
  createSavingsGoalHandler,
  getSavingsProgressHandler,
  createBudgetHandler,
  trackExpenseHandler,
  getFinancialStatusHandler,
} from './financial.js';

// Scheduling handlers (Alex)
export {
  registerSchedulingHandlers,
  schedulingHandlers,
  scheduleEventHandler,
  getUpcomingEventsHandler,
  createReminderHandler,
  createRecurringCheckInHandler,
  sendNotificationHandler,
} from './scheduling.js';

// Life Planning handlers (Jordan)
export {
  registerLifePlanningHandlers,
  lifePlanningHandlers,
  getActiveGoalsHandler,
  createGoalHandler,
  getMilestoneStatusHandler,
  updateMilestoneProgressHandler,
  getRetirementPlanHandler,
  linkSavingsToMilestoneHandler,
} from './life-planning.js';

// Research/Insights handlers (Peter)
export {
  registerResearchHandlers,
  researchHandlers,
  synthesizeInsightsHandler,
  spotAnomaliesHandler,
  findCorrelationsHandler,
  projectTrendsHandler,
  runProactiveInsightScanHandler,
} from './research.js';

// Coordination handlers (Ferni)
export {
  registerCoordinationHandlers,
  coordinationHandlers,
  getTeamStatusHandler,
  getAgentSummaryHandler,
  shareContextHandler,
  coordinateTeamHandler,
  handleEscalationHandler,
  requestSpecialistHandler,
} from './coordination.js';

// ============================================================================
// REGISTER ALL HANDLERS
// ============================================================================

/**
 * Register all handlers with their default agents
 */
export async function registerAllHandlers(options?: {
  ferni?: AgentId;
  maya?: AgentId;
  alex?: AgentId;
  jordan?: AgentId;
  peter?: AgentId;
}): Promise<{ registered: number; agents: string[] }> {
  const { registerFinancialHandlers } = await import('./financial.js');
  const { registerSchedulingHandlers } = await import('./scheduling.js');
  const { registerLifePlanningHandlers } = await import('./life-planning.js');
  const { registerResearchHandlers } = await import('./research.js');
  const { registerCoordinationHandlers } = await import('./coordination.js');

  const ferniAgent = options?.ferni || 'ferni';
  const mayaAgent = options?.maya || 'maya';
  const alexAgent = options?.alex || 'alex';
  const jordanAgent = options?.jordan || 'jordan';
  const peterAgent = options?.peter || 'peter-john';

  // Register all handler sets
  registerCoordinationHandlers(ferniAgent); // 6 handlers
  registerFinancialHandlers(mayaAgent); // 5 handlers
  registerSchedulingHandlers(alexAgent); // 5 handlers
  registerLifePlanningHandlers(jordanAgent); // 6 handlers
  registerResearchHandlers(peterAgent); // 5 handlers

  const totalHandlers = 6 + 5 + 5 + 6 + 5; // 27 handlers
  const agents = [ferniAgent, mayaAgent, alexAgent, jordanAgent, peterAgent];

  getLogger().info({ totalHandlers, agents }, 'All team handlers registered');

  return { registered: totalHandlers, agents };
}

// ============================================================================
// HANDLER COUNTS BY AGENT
// ============================================================================

export const HANDLER_COUNTS = {
  ferni: 6, // Coordination
  maya: 5, // Financial
  alex: 5, // Scheduling
  jordan: 6, // Life Planning
  peter: 5, // Research
  total: 27,
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default registerAllHandlers;
