/**
 * Team Coordination Core Functions
 *
 * Core operations for team coordination:
 * - Creating shared goals
 * - Creating team handoffs
 * - Linking milestones
 */

import { getLogger, generateId } from '../../utils/tool-helpers.js';
import { sanitizePlainText } from '../../validation.js';
import {
  getLifeDataStore,
  type SharedGoal,
  type SharedMilestone,
  type TeamHandoff,
  type TeamMember,
} from '../../../services/stores/life-data-store.js';
import { getOrCreateTeamContext, validateProjectName, validateAmountField } from './helpers.js';

// ============================================================================
// SHARED GOAL MANAGEMENT
// ============================================================================

/**
 * Create a shared goal that can be tracked by multiple team members
 */
export async function createSharedGoal(
  userId: string,
  title: string,
  category: string,
  financialTarget?: number,
  timeline?: string
): Promise<SharedGoal> {
  // Validate inputs
  const titleValidation = validateProjectName(title);
  if (!titleValidation.valid) {
    throw new Error(titleValidation.error);
  }

  const amountValidation = validateAmountField(financialTarget, 'financial target');
  if (!amountValidation.valid) {
    throw new Error(amountValidation.error);
  }

  const sanitizedTitle = titleValidation.sanitized!;
  const sanitizedCategory = sanitizePlainText(category, 100);
  const sanitizedTimeline = timeline ? sanitizePlainText(timeline, 100) : undefined;
  const sanitizedTarget = amountValidation.sanitized;

  const store = getLifeDataStore();
  const context = await getOrCreateTeamContext(userId);

  const goal: SharedGoal = {
    id: generateId('shared_goal'),
    title: sanitizedTitle,
    category: sanitizedCategory,
    timeline: sanitizedTimeline,
    financialTarget: sanitizedTarget,
    currentSavings: 0,
    status: 'active',
  };

  context.sharedGoals.push(goal);
  context.updatedAt = new Date();
  await store.saveTeamContext(userId, context);

  getLogger().info(
    { goalId: goal.id, title: sanitizedTitle },
    '🤝 Shared goal created (persisted)'
  );

  return goal;
}

// ============================================================================
// TEAM HANDOFF MANAGEMENT
// ============================================================================

/**
 * Create a handoff from one team member to another
 */
export async function createTeamHandoff(
  userId: string,
  fromMember: TeamMember,
  toMember: TeamMember,
  reason: string,
  handoffContext: Record<string, unknown>
): Promise<TeamHandoff> {
  const store = getLifeDataStore();
  const teamContext = await getOrCreateTeamContext(userId);

  const handoff: TeamHandoff = {
    id: generateId('handoff'),
    fromMember,
    toMember,
    reason,
    context: handoffContext,
    timestamp: new Date(),
    acknowledged: false,
  };

  teamContext.pendingHandoffs.push(handoff);
  teamContext.updatedAt = new Date();
  await store.saveTeamContext(userId, teamContext);

  getLogger().info(
    { handoffId: handoff.id, from: fromMember, to: toMember },
    '🔄 Team handoff created (persisted)'
  );

  return handoff;
}

// ============================================================================
// SHARED MILESTONE MANAGEMENT
// ============================================================================

/**
 * Link a milestone to team coordination
 */
export async function linkMilestoneToTeam(
  userId: string,
  jordanMilestoneId: string,
  name: string,
  targetDate?: Date,
  mayaBudgetId?: string
): Promise<SharedMilestone> {
  const store = getLifeDataStore();
  const context = await getOrCreateTeamContext(userId);

  const milestone: SharedMilestone = {
    id: generateId('shared_milestone'),
    name,
    targetDate,
    jordanMilestoneId,
    mayaBudgetId,
    alexEventId: undefined,
    teamNotes: [],
  };

  context.sharedMilestones.push(milestone);
  context.updatedAt = new Date();
  await store.saveTeamContext(userId, context);

  return milestone;
}
