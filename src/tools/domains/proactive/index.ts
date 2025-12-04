/**
 * Proactive Domain Tools
 *
 * Tools for proactive coaching, follow-ups, and goal tracking.
 * Consolidates:
 * - proactive.ts: General proactive tools (goals, reminders)
 * - proactive-coaching.ts: Maya's coaching system (triggers, patterns)
 *
 * DOMAIN: proactive
 * TOOLS:
 *   General: setGoal, checkGoalProgress, scheduleFollowUp, suggestCheckIn
 *   Coaching: checkForProactiveOpportunities, generateProactiveMessage, celebrateAchievement
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import tool creators
import { createProactiveTools } from '../../proactive.js';
import { createProactiveCoachingTools } from '../../proactive-coaching.js';

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
    domain: 'proactive',
    tags: ['proactive', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// GENERAL PROACTIVE TOOLS (from proactive.ts)
// Uses actual method names from createProactiveTools()
// ============================================================================

function getGeneralProactiveToolDefinitions(): ToolDefinition[] {
  const legacyTools = createProactiveTools();

  return [
    wrapLegacyTool(
      'setGoal',
      'Set Goal',
      'Create a new financial goal with target amount and timeline',
      legacyTools.setGoal,
      ['goals', 'financial', 'create']
    ),
    wrapLegacyTool(
      'checkGoalProgress',
      'Check Goal Progress',
      'View progress towards financial goals',
      legacyTools.checkGoalProgress,
      ['goals', 'financial', 'tracking']
    ),
    wrapLegacyTool(
      'scheduleFollowUp',
      'Schedule Follow-Up',
      'Schedule a follow-up conversation about a topic',
      legacyTools.scheduleFollowUp,
      ['reminders', 'follow-up', 'scheduling']
    ),
    wrapLegacyTool(
      'suggestCheckIn',
      'Suggest Check-In',
      'Get AI-suggested check-in approach based on user state',
      legacyTools.suggestCheckIn,
      ['coaching', 'suggestions']
    ),
    wrapLegacyTool(
      'triggerCircleBack',
      'Trigger Circle Back',
      'Circle back to a topic from earlier in the conversation',
      legacyTools.triggerCircleBack,
      ['conversation', 'memory']
    ),
  ];
}

// ============================================================================
// COACHING PROACTIVE TOOLS (from proactive-coaching.ts)
// Uses actual method names from createProactiveCoachingTools()
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createProactiveCoachingTools();

  return [
    wrapLegacyTool(
      'checkForProactiveOpportunities',
      'Check For Proactive Opportunities',
      'Scan for situations that need proactive outreach',
      legacyTools.checkForProactiveOpportunities,
      ['coaching', 'triggers', 'detection']
    ),
    wrapLegacyTool(
      'generateProactiveMessage',
      'Generate Proactive Message',
      'Create a personalized proactive coaching message based on a trigger',
      legacyTools.generateProactiveMessage,
      ['coaching', 'messaging']
    ),
    wrapLegacyTool(
      'celebrateAchievement',
      'Celebrate Achievement',
      'Celebrate a user achievement or milestone',
      legacyTools.celebrateAchievement,
      ['coaching', 'celebration', 'motivation']
    ),
  ];
}

// ============================================================================
// COMBINED DOMAIN TOOLS
// ============================================================================

const proactiveTools: ToolDefinition[] = [
  ...getGeneralProactiveToolDefinitions(),
  ...getCoachingToolDefinitions(),
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'proactive',
  proactiveTools
);

// Export individual getters for selective imports
export {
  getGeneralProactiveToolDefinitions,
  getCoachingToolDefinitions,
};

export default getToolDefinitions;
