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

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import tool creators
import { createEventPlanningTools } from '../../event-planning.js';
import { createGoalManagementTools } from '../../goal-management.js';
import { createLifeFirstsTools } from '../../life-firsts-tracker.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'life-planning',
    tags: ['life-planning', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// EVENT PLANNING TOOLS
// ============================================================================

function getEventPlanningToolDefinitions(): ToolDefinition[] {
  const legacyTools = createEventPlanningTools();

  return [
    wrapLegacyTool(
      'createEvent',
      'Create Event',
      'Create a new event or celebration to plan',
      legacyTools.createEvent,
      ['events', 'create']
    ),
    wrapLegacyTool(
      'searchVenues',
      'Search Venues',
      'Search for venues for an event',
      legacyTools.searchVenues,
      ['events', 'venues', 'search']
    ),
    wrapLegacyTool(
      'addGuests',
      'Add Guests',
      'Add guests to an event guest list',
      legacyTools.addGuests,
      ['events', 'guests']
    ),
    wrapLegacyTool(
      'getGuestList',
      'Get Guest List',
      'Get the guest list for an event',
      legacyTools.getGuestList,
      ['events', 'guests', 'list']
    ),
    wrapLegacyTool(
      'getChecklist',
      'Get Checklist',
      'Get the planning checklist for an event',
      legacyTools.getChecklist,
      ['events', 'checklist', 'tasks']
    ),
    wrapLegacyTool(
      'completeTask',
      'Complete Task',
      'Mark a planning task as complete',
      legacyTools.completeTask,
      ['events', 'tasks', 'complete']
    ),
    wrapLegacyTool(
      'trackExpense',
      'Track Expense',
      'Track an expense for event planning',
      legacyTools.trackExpense,
      ['events', 'expenses', 'budget']
    ),
    wrapLegacyTool(
      'getEventSummary',
      'Get Event Summary',
      'Get a summary of event planning progress',
      legacyTools.getEventSummary,
      ['events', 'summary', 'status']
    ),
  ];
}

// ============================================================================
// LIFE PLANNING TOOLS
// ============================================================================

function getLifePlanningToolDefinitions(): ToolDefinition[] {
  const legacyTools = createEventPlanningTools();

  return [
    wrapLegacyTool(
      'planMajorPurchase',
      'Plan Major Purchase',
      'Plan and prepare for a major purchase (car, home, etc.)',
      legacyTools.planMajorPurchase,
      ['planning', 'purchases', 'major']
    ),
    wrapLegacyTool(
      'getBestTimeToBuy',
      'Get Best Time to Buy',
      'Get advice on the best time to make a major purchase',
      legacyTools.getBestTimeToBuy,
      ['planning', 'timing', 'purchases']
    ),
    wrapLegacyTool(
      'planVacation',
      'Plan Vacation',
      'Plan a vacation or trip',
      legacyTools.planVacation,
      ['planning', 'vacation', 'travel']
    ),
    wrapLegacyTool(
      'suggestDestinations',
      'Suggest Destinations',
      'Get vacation destination suggestions',
      legacyTools.suggestDestinations,
      ['planning', 'vacation', 'suggestions']
    ),
    wrapLegacyTool(
      'createAnnualPlan',
      'Create Annual Plan',
      'Create an annual life plan with goals and milestones',
      legacyTools.createAnnualPlan,
      ['planning', 'annual', 'goals']
    ),
    wrapLegacyTool(
      'getAnnualPlanStatus',
      'Get Annual Plan Status',
      'Check progress on the annual life plan',
      legacyTools.getAnnualPlanStatus,
      ['planning', 'annual', 'status']
    ),
  ];
}

// ============================================================================
// GOAL MANAGEMENT TOOLS
// ============================================================================

function getGoalManagementToolDefinitions(): ToolDefinition[] {
  const legacyTools = createGoalManagementTools();

  return [
    wrapLegacyTool(
      'createGoal',
      'Create Goal',
      'Create a new life goal to track',
      legacyTools.createGoal,
      ['goals', 'create']
    ),
    wrapLegacyTool(
      'updateGoalProgress',
      'Update Goal Progress',
      'Update progress on a goal',
      legacyTools.updateGoalProgress,
      ['goals', 'progress', 'update']
    ),
    wrapLegacyTool(
      'getGoalsSummary',
      'Get Goals Summary',
      'Get a summary of all goals and their status',
      legacyTools.getGoalsSummary,
      ['goals', 'summary', 'list']
    ),
    wrapLegacyTool(
      'addGoalMilestone',
      'Add Goal Milestone',
      'Add a milestone to a goal',
      legacyTools.addGoalMilestone,
      ['goals', 'milestones', 'add']
    ),
    wrapLegacyTool(
      'getLifePortfolio',
      'Get Life Portfolio',
      'Get the life portfolio showing all life areas and satisfaction',
      legacyTools.getLifePortfolio,
      ['goals', 'portfolio', 'life-areas']
    ),
    wrapLegacyTool(
      'updatePortfolioSatisfaction',
      'Update Portfolio Satisfaction',
      'Update satisfaction scores for life areas',
      legacyTools.updatePortfolioSatisfaction,
      ['goals', 'satisfaction', 'update']
    ),
    wrapLegacyTool(
      'getGoalIdeas',
      'Get Goal Ideas',
      'Get personalized goal ideas based on life stage and interests',
      legacyTools.getGoalIdeas,
      ['goals', 'ideas', 'suggestions']
    ),
    wrapLegacyTool(
      'runQuarterlyReview',
      'Run Quarterly Review',
      'Conduct a quarterly review of goals and progress',
      legacyTools.runQuarterlyReview,
      ['goals', 'review', 'quarterly']
    ),
    wrapLegacyTool(
      'addGoalReflection',
      'Add Goal Reflection',
      'Add a reflection or journal entry about a goal',
      legacyTools.addGoalReflection,
      ['goals', 'reflection', 'journal']
    ),
  ];
}

// ============================================================================
// LIFE MILESTONES TOOLS
// ============================================================================

function getLifeMilestonesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createLifeFirstsTools();

  return [
    wrapLegacyTool(
      'createLifeMilestone',
      'Create Life Milestone',
      'Create a new life milestone to track (first home, first child, etc.)',
      legacyTools.createLifeMilestone,
      ['milestones', 'create', 'firsts']
    ),
    wrapLegacyTool(
      'viewLifeMilestones',
      'View Life Milestones',
      'View all life milestones and their status',
      legacyTools.viewLifeMilestones,
      ['milestones', 'list', 'view']
    ),
    wrapLegacyTool(
      'updateMilestoneTask',
      'Update Milestone Task',
      'Update a task within a milestone',
      legacyTools.updateMilestoneTask,
      ['milestones', 'tasks', 'update']
    ),
    wrapLegacyTool(
      'addMilestoneNote',
      'Add Milestone Note',
      'Add a note or memory to a milestone',
      legacyTools.addMilestoneNote,
      ['milestones', 'notes', 'memories']
    ),
    wrapLegacyTool(
      'getMilestoneTips',
      'Get Milestone Tips',
      'Get tips and advice for an upcoming milestone',
      legacyTools.getMilestoneTips,
      ['milestones', 'tips', 'advice']
    ),
    wrapLegacyTool(
      'getMilestoneCountdown',
      'Get Milestone Countdown',
      'Get countdown to an upcoming milestone',
      legacyTools.getMilestoneCountdown,
      ['milestones', 'countdown', 'upcoming']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const lifePlanningTools: ToolDefinition[] = [
  ...getEventPlanningToolDefinitions(),
  ...getLifePlanningToolDefinitions(),
  ...getGoalManagementToolDefinitions(),
  ...getLifeMilestonesToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'life-planning',
  lifePlanningTools
);

export {
  getEventPlanningToolDefinitions,
  getLifePlanningToolDefinitions,
  getGoalManagementToolDefinitions,
  getLifeMilestonesToolDefinitions,
};

export default getToolDefinitions;

