/**
 * Tool Factory Types
 *
 * Shared types, interfaces, and configurations for role-based tool factories.
 * This enables persona-specific tool behavior without duplicating tool code.
 */

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export type ToolCategory =
  | 'universal'
  | 'financial'
  | 'communication'
  | 'life-planning'
  | 'research'
  | 'wisdom'
  | 'memory'
  | 'productivity'
  | 'entertainment';

// ============================================================================
// BASE BEHAVIOR CONFIG
// ============================================================================

/**
 * Base configuration for all tool factories
 */
export interface ToolBehaviorConfig {
  /** Which persona is using these tools */
  personaId: string;

  /** Response verbosity */
  verbosity: 'brief' | 'moderate' | 'detailed';

  /** Include coaching tips in responses */
  includeCoaching: boolean;

  /** Include relevant stories/anecdotes */
  includeStories: boolean;

  /** Emotional tone */
  emotionalTone: 'warm' | 'professional' | 'direct' | 'playful';
}

/**
 * Default behavior config
 */
export const DEFAULT_TOOL_BEHAVIOR: ToolBehaviorConfig = {
  personaId: 'default',
  verbosity: 'moderate',
  includeCoaching: false,
  includeStories: false,
  emotionalTone: 'professional',
};

// ============================================================================
// LIFE PLANNING TOOLS CONFIG
// ============================================================================

export interface LifePlanningToolsConfig extends ToolBehaviorConfig {
  /** Track life milestones */
  milestoneTracking: boolean;

  /** Event planning depth */
  eventPlanningDepth: 'basic' | 'detailed' | 'comprehensive';

  /** Cultural celebration awareness */
  culturalAwareness: boolean;

  /** Life transition support */
  transitionSupport: boolean;

  /** Goal management style */
  goalStyle: 'structured' | 'flexible' | 'coaching';

  /** Goal management features enabled */
  goalManagement: boolean;

  /** Gift registry features */
  giftRegistry: boolean;

  /** Retirement planning features */
  retirementPlanning: boolean;

  /** Team coordination features */
  teamCoordination: boolean;

  /** Celebrate success moments */
  celebrateSuccess: boolean;
}

export const PERSONA_LIFE_PLANNING_CONFIGS: Record<string, Partial<LifePlanningToolsConfig>> = {
  'jordan-taylor': {
    personaId: 'jordan-taylor',
    milestoneTracking: true,
    eventPlanningDepth: 'comprehensive',
    culturalAwareness: true,
    transitionSupport: true,
    goalStyle: 'structured',
    goalManagement: true,
    giftRegistry: true,
    retirementPlanning: true,
    teamCoordination: true,
    celebrateSuccess: true,
    emotionalTone: 'warm',
    includeCoaching: true,
    verbosity: 'detailed',
  },
  ferni: {
    personaId: 'ferni',
    milestoneTracking: true,
    eventPlanningDepth: 'basic',
    culturalAwareness: false,
    transitionSupport: true,
    goalStyle: 'coaching',
    goalManagement: true,
    giftRegistry: false,
    retirementPlanning: false,
    teamCoordination: true,
    celebrateSuccess: true,
    emotionalTone: 'warm',
    verbosity: 'moderate',
  },
};

