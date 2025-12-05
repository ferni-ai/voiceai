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
// EVENT PLANNING TOOLS (Consolidated: 8 → 3 essential tools)
// ============================================================================

function getEventPlanningToolDefinitions(): ToolDefinition[] {
  const legacyTools = createEventPlanningTools();

  // Consolidated: manageEvent handles create/summary/checklist/tasks, eventGuests for guest list,
  // eventBudget for expenses/venues
  return [
    wrapLegacyTool(
      'manageEvent',
      'Manage Event',
      'Create a new event (wedding, birthday, graduation, etc.), view event summary, get planning checklist, or mark tasks complete. Actions: "create", "summary", "checklist", or "complete_task". Supports all event types: weddings, birthdays, baby showers, retirement parties, graduations, and more.',
      legacyTools.createEvent,
      ['events', 'create', 'summary', 'checklist', 'tasks']
    ),
    wrapLegacyTool(
      'eventGuests',
      'Event Guests',
      'Manage the guest list for an event: add guests, view guest list, track RSVPs. Actions: "add", "list", or "rsvp".',
      legacyTools.addGuests,
      ['events', 'guests', 'rsvp']
    ),
    wrapLegacyTool(
      'eventBudget',
      'Event Budget',
      'Track event budget and expenses, or search for venues. Actions: "expense" (track a purchase), "summary" (budget overview), or "venues" (find venues).',
      legacyTools.trackExpense,
      ['events', 'budget', 'expenses', 'venues']
    ),
  ];
}

// ============================================================================
// LIFE PLANNING TOOLS (Consolidated: 6 → 2 essential tools)
// ============================================================================

function getLifePlanningToolDefinitions(): ToolDefinition[] {
  const legacyTools = createEventPlanningTools();

  // Consolidated: planPurchase handles major purchases and timing, planVacation handles travel
  return [
    wrapLegacyTool(
      'planPurchase',
      'Plan Major Purchase',
      'Plan a major purchase (car, home, appliances, etc.). Get a preparation checklist, best time to buy advice, and savings timeline. Supports: cars, homes, electronics, furniture, and other big-ticket items.',
      legacyTools.planMajorPurchase,
      ['planning', 'purchases', 'major', 'timing']
    ),
    wrapLegacyTool(
      'planVacation',
      'Plan Vacation',
      'Plan a vacation or trip: get destination suggestions based on preferences/budget, create itinerary, or check best times to travel. Actions: "suggest" (get destination ideas), "plan" (create trip plan), or "timing" (best times to go).',
      legacyTools.planVacation,
      ['planning', 'vacation', 'travel', 'destinations']
    ),
    wrapLegacyTool(
      'annualPlan',
      'Annual Plan',
      'Create or review your annual life plan with goals and milestones. Actions: "create" (new annual plan), "status" (check progress), or "review" (quarterly review).',
      legacyTools.createAnnualPlan,
      ['planning', 'annual', 'goals', 'review']
    ),
  ];
}

// ============================================================================
// GOAL MANAGEMENT TOOLS (Consolidated: 9 → 3 essential tools)
// ============================================================================

function getGoalManagementToolDefinitions(): ToolDefinition[] {
  const legacyTools = createGoalManagementTools();

  // Consolidated: manageGoal handles create/progress/milestones, goalsSummary handles list/review/ideas,
  // lifePortfolio handles life areas and satisfaction
  return [
    wrapLegacyTool(
      'manageGoal',
      'Manage Goal',
      'Create a new goal, update progress, add milestones, or add reflections. Actions: "create" (new goal), "progress" (update %), "milestone" (add milestone), or "reflect" (journal entry). Supports any life goal: career, health, financial, relationship, personal growth, etc.',
      legacyTools.createGoal,
      ['goals', 'create', 'progress', 'milestones', 'reflection']
    ),
    wrapLegacyTool(
      'goalsSummary',
      'Goals Summary',
      'View all goals and their status, get personalized goal ideas, or run a quarterly review. Actions: "list" (all goals), "ideas" (suggestions based on your life stage), or "review" (quarterly check-in).',
      legacyTools.getGoalsSummary,
      ['goals', 'summary', 'list', 'ideas', 'review']
    ),
    wrapLegacyTool(
      'lifePortfolio',
      'Life Portfolio',
      'View or update your life portfolio - a holistic view of satisfaction across all life areas (career, health, relationships, finances, personal growth, etc.). Actions: "view" or "update" (rate satisfaction 1-10).',
      legacyTools.getLifePortfolio,
      ['goals', 'portfolio', 'life-areas', 'satisfaction']
    ),
  ];
}

// ============================================================================
// LIFE MILESTONES TOOLS (Consolidated: 6 → 2 essential tools)
// ============================================================================

function getLifeMilestonesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createLifeFirstsTools();

  // Consolidated: manageMilestone handles create/view/tasks/notes, milestoneSupport handles tips/countdown
  return [
    wrapLegacyTool(
      'manageMilestone',
      'Manage Life Milestone',
      'Track life milestones like first home, first child, wedding, graduation, retirement. Actions: "create" (new milestone), "list" (view all), "task" (update preparation task), or "note" (add memory/reflection). Supports all major life transitions.',
      legacyTools.createLifeMilestone,
      ['milestones', 'create', 'list', 'tasks', 'notes', 'firsts']
    ),
    wrapLegacyTool(
      'milestoneSupport',
      'Milestone Support',
      'Get tips, advice, and countdown for upcoming milestones. Actions: "tips" (preparation advice), "countdown" (days until milestone), or "checklist" (things to prepare). Great for wedding prep, new baby, home buying, retirement planning.',
      legacyTools.getMilestoneTips,
      ['milestones', 'tips', 'countdown', 'advice', 'checklist']
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
