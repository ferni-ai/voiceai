/**
 * Action Planning Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Converts conversations into actionable next steps.
 * After discussing a problem, creates tiny first steps that feel achievable.
 *
 * Philosophy:
 * - Small steps beat big plans
 * - Action cures anxiety
 * - Follow-up shows we care
 *
 * @module ActionPlanning
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ActionPlanning' });

// ============================================================================
// TYPES
// ============================================================================

export type ActionStatus = 'pending' | 'completed' | 'skipped' | 'deferred';

export type ActionPriority = 'high' | 'medium' | 'low';

export interface ActionItem {
  id: string;
  userId: string;

  // What to do
  action: string;
  context: string; // What conversation spawned this

  // Categorization
  goalId?: string; // Optional link to a goal
  domain?: string;

  // Timing
  dueDate?: Date;
  suggestedTime?: string; // "morning", "after work", etc.

  // Status
  status: ActionStatus;
  completedAt?: Date;
  skippedReason?: string;

  // Follow-up
  followUpScheduled?: Date;
  followUpSent: boolean;

  // Metadata
  createdAt: Date;
  createdInConversation?: string;
}

export interface ActionProfile {
  userId: string;
  actions: ActionItem[];

  // Stats
  stats: {
    totalCreated: number;
    completed: number;
    skipped: number;
    completionRate: number;
  };

  // Preferences
  preferences: {
    reminderTiming: 'morning' | 'evening' | 'custom';
    customReminderTime?: string;
    preferredActionSize: 'tiny' | 'small' | 'medium';
  };
}

export interface ActionSuggestion {
  action: string;
  timeEstimate: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reason: string;
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const actionProfiles = new Map<string, ActionProfile>();

function getOrCreateProfile(userId: string): ActionProfile {
  let profile = actionProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      actions: [],
      stats: {
        totalCreated: 0,
        completed: 0,
        skipped: 0,
        completionRate: 0,
      },
      preferences: {
        reminderTiming: 'morning',
        preferredActionSize: 'tiny',
      },
    };
    actionProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// ACTION OPPORTUNITY DETECTION
// ============================================================================

/** Patterns indicating an action opportunity */
const ACTION_OPPORTUNITY_PATTERNS = [
  /i (should|need to|have to|ought to|must) (.+)/i,
  /i('ve| have) been (meaning|wanting|trying) to (.+)/i,
  /i (don't know|not sure) (how to|what to) (.+)/i,
  /i('m| am) (stuck|struggling) (with|on) (.+)/i,
  /what (should|can|do) i do about (.+)/i,
  /how (do|can|should) i (.+)/i,
];

/** Keywords that indicate discussion of a problem that could use action steps */
const PROBLEM_KEYWORDS = [
  'stressed',
  'overwhelmed',
  'anxious',
  'worried',
  'stuck',
  'frustrated',
  'confused',
  'lost',
  'unsure',
  'difficult',
  'hard',
  'struggling',
  'problem',
  'issue',
  'challenge',
];

/**
 * Detect if this is a good moment to offer action planning
 */
export function detectActionOpportunity(
  userMessage: string,
  context?: {
    recentTopics?: string[];
    emotionalState?: string;
    conversationLength?: number;
  }
): {
  isOpportunity: boolean;
  reason?: string;
  extractedTopic?: string;
} {
  const lower = userMessage.toLowerCase();

  // Check for explicit action language
  for (const pattern of ACTION_OPPORTUNITY_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      const topic = match[match.length - 1];
      return {
        isOpportunity: true,
        reason: 'explicit_intent',
        extractedTopic: topic,
      };
    }
  }

  // Check for problem discussion
  const hasProblemKeywords = PROBLEM_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasProblemKeywords && context?.conversationLength && context.conversationLength > 5) {
    return {
      isOpportunity: true,
      reason: 'problem_discussion',
    };
  }

  return { isOpportunity: false };
}

// ============================================================================
// ACTION GENERATION
// ============================================================================

/**
 * Generate tiny first steps for a given topic/goal
 */
export function generateActionSuggestions(
  topic: string,
  context?: {
    userPreferences?: ActionProfile['preferences'];
    relatedGoal?: string;
  }
): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];
  const lower = topic.toLowerCase();

  // Generate context-aware suggestions
  if (lower.includes('call') || lower.includes('talk') || lower.includes('conversation')) {
    suggestions.push(
      {
        action: 'Write down 3 things you want to say',
        timeEstimate: '5 minutes',
        difficulty: 'easy',
        reason: 'Having talking points reduces anxiety',
      },
      {
        action: 'Send a text to schedule a time to talk',
        timeEstimate: '2 minutes',
        difficulty: 'easy',
        reason: 'Breaking it into steps makes it less overwhelming',
      },
      {
        action: 'Practice what you want to say out loud once',
        timeEstimate: '3 minutes',
        difficulty: 'medium',
        reason: 'Hearing yourself builds confidence',
      }
    );
  } else if (lower.includes('job') || lower.includes('career') || lower.includes('resume')) {
    suggestions.push(
      {
        action: 'Update just the most recent job on your resume',
        timeEstimate: '15 minutes',
        difficulty: 'easy',
        reason: 'Small updates feel manageable',
      },
      {
        action: 'Make a list of 3 companies you admire',
        timeEstimate: '5 minutes',
        difficulty: 'easy',
        reason: 'Direction beats perfection',
      },
      {
        action: 'Reach out to one person in your network',
        timeEstimate: '5 minutes',
        difficulty: 'medium',
        reason: 'Connections open doors',
      }
    );
  } else if (lower.includes('exercise') || lower.includes('health') || lower.includes('workout')) {
    suggestions.push(
      {
        action: 'Put on workout clothes (even if you do nothing else)',
        timeEstimate: '2 minutes',
        difficulty: 'easy',
        reason: 'Starting is the hardest part',
      },
      {
        action: 'Take a 10-minute walk',
        timeEstimate: '10 minutes',
        difficulty: 'easy',
        reason: 'Any movement counts',
      },
      {
        action: 'Set out your workout clothes for tomorrow',
        timeEstimate: '2 minutes',
        difficulty: 'easy',
        reason: 'Remove friction from future you',
      }
    );
  } else {
    // Generic tiny steps
    suggestions.push(
      {
        action: `Write down what "done" looks like for this`,
        timeEstimate: '5 minutes',
        difficulty: 'easy',
        reason: 'Clarity creates momentum',
      },
      {
        action: 'Identify the very first thing you could do',
        timeEstimate: '2 minutes',
        difficulty: 'easy',
        reason: 'Starting is half the battle',
      },
      {
        action: 'Block 15 minutes on your calendar for this',
        timeEstimate: '2 minutes',
        difficulty: 'easy',
        reason: 'What gets scheduled gets done',
      }
    );
  }

  return suggestions;
}

// ============================================================================
// ACTION CRUD
// ============================================================================

/**
 * Create a new action item
 */
export function createAction(
  userId: string,
  actionData: {
    action: string;
    context: string;
    goalId?: string;
    domain?: string;
    dueDate?: Date;
    suggestedTime?: string;
  }
): ActionItem {
  const profile = getOrCreateProfile(userId);

  const item: ActionItem = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    action: actionData.action,
    context: actionData.context,
    goalId: actionData.goalId,
    domain: actionData.domain,
    dueDate: actionData.dueDate,
    suggestedTime: actionData.suggestedTime,
    status: 'pending',
    followUpSent: false,
    createdAt: new Date(),
  };

  // Schedule follow-up for tomorrow if no due date
  if (!item.dueDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    item.followUpScheduled = tomorrow;
  } else {
    // Follow up day after due date
    const followUp = new Date(item.dueDate);
    followUp.setDate(followUp.getDate() + 1);
    item.followUpScheduled = followUp;
  }

  profile.actions.push(item);
  profile.stats.totalCreated++;

  log.info({ userId, actionId: item.id, action: item.action.slice(0, 50) }, '📋 Action created');

  return item;
}

/**
 * Complete an action
 */
export function completeAction(userId: string, actionId: string): boolean {
  const profile = actionProfiles.get(userId);
  if (!profile) return false;

  const action = profile.actions.find((a) => a.id === actionId);
  if (!action) return false;

  action.status = 'completed';
  action.completedAt = new Date();
  profile.stats.completed++;
  updateCompletionRate(profile);

  log.info({ userId, actionId }, '✅ Action completed');

  return true;
}

/**
 * Skip an action
 */
export function skipAction(userId: string, actionId: string, reason?: string): boolean {
  const profile = actionProfiles.get(userId);
  if (!profile) return false;

  const action = profile.actions.find((a) => a.id === actionId);
  if (!action) return false;

  action.status = 'skipped';
  action.skippedReason = reason;
  profile.stats.skipped++;
  updateCompletionRate(profile);

  log.debug({ userId, actionId, reason }, '⏭️ Action skipped');

  return true;
}

/**
 * Defer an action to a new date
 */
export function deferAction(userId: string, actionId: string, newDate: Date): boolean {
  const profile = actionProfiles.get(userId);
  if (!profile) return false;

  const action = profile.actions.find((a) => a.id === actionId);
  if (!action) return false;

  action.status = 'deferred';
  action.dueDate = newDate;

  // Update follow-up
  const followUp = new Date(newDate);
  followUp.setDate(followUp.getDate() + 1);
  action.followUpScheduled = followUp;

  log.debug({ userId, actionId, newDate }, '📅 Action deferred');

  return true;
}

function updateCompletionRate(profile: ActionProfile): void {
  const total = profile.stats.completed + profile.stats.skipped;
  if (total > 0) {
    profile.stats.completionRate = Math.round((profile.stats.completed / total) * 100);
  }
}

// ============================================================================
// ACTION QUERIES
// ============================================================================

/**
 * Get pending actions for a user
 */
export function getPendingActions(userId: string): ActionItem[] {
  const profile = actionProfiles.get(userId);
  return profile?.actions.filter((a) => a.status === 'pending') || [];
}

/**
 * Get actions needing follow-up
 */
export function getActionsNeedingFollowUp(userId: string): ActionItem[] {
  const profile = actionProfiles.get(userId);
  if (!profile) return [];

  const now = new Date();
  return profile.actions.filter(
    (a) =>
      a.status === 'pending' && a.followUpScheduled && a.followUpScheduled <= now && !a.followUpSent
  );
}

/**
 * Get action stats
 */
export function getActionStats(userId: string): ActionProfile['stats'] | null {
  const profile = actionProfiles.get(userId);
  return profile?.stats || null;
}

// ============================================================================
// FOLLOW-UP GENERATION
// ============================================================================

/**
 * Generate a follow-up question for an action
 */
export function generateActionFollowUp(action: ActionItem): {
  question: string;
  ssml: string;
  tone: 'curious' | 'supportive' | 'celebratory';
} {
  const templates = {
    curious: [
      `Hey, did you get a chance to ${action.action.toLowerCase()}?`,
      `How'd it go with that thing you were going to do - ${action.action.toLowerCase()}?`,
      `I remembered you were going to ${action.action.toLowerCase()}. Did it happen?`,
    ],
    supportive: [
      `No pressure, but I wanted to check in on ${action.action.toLowerCase()}. How are you feeling about it?`,
      `That ${action.action.toLowerCase()} thing - still on your radar? No judgment either way.`,
    ],
  };

  // Choose tone based on action age
  const daysSinceCreated = Math.floor(
    (Date.now() - action.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const tone: 'curious' | 'supportive' = daysSinceCreated > 3 ? 'supportive' : 'curious';
  const options = templates[tone];
  const question = options[Math.floor(Math.random() * options.length)];

  const ssml = question.replace(/\?/g, "? <break time='300ms'/>");

  return { question, ssml, tone };
}

/**
 * Get the highest priority action to follow up on
 */
export function getActionToFollowUp(userId: string): {
  action: ActionItem;
  followUp: ReturnType<typeof generateActionFollowUp>;
} | null {
  const needsFollowUp = getActionsNeedingFollowUp(userId);

  if (needsFollowUp.length === 0) return null;

  // Sort by due date or creation date
  const sorted = needsFollowUp.sort((a, b) => {
    const aTime = a.dueDate?.getTime() || a.createdAt.getTime();
    const bTime = b.dueDate?.getTime() || b.createdAt.getTime();
    return aTime - bTime;
  });

  const action = sorted[0];
  const followUp = generateActionFollowUp(action);

  // Mark follow-up as sent
  action.followUpSent = true;

  return { action, followUp };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for actions
 */
export function buildActionContext(userId: string): string | null {
  const pending = getPendingActions(userId);
  if (pending.length === 0) return null;

  const lines: string[] = ['[📋 PENDING ACTIONS]'];

  for (const action of pending.slice(0, 5)) {
    let line = `• ${action.action}`;
    if (action.dueDate) {
      const daysUntil = Math.ceil((action.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 0) {
        line += ' (overdue)';
      } else if (daysUntil === 1) {
        line += ' (due tomorrow)';
      } else {
        line += ` (due in ${daysUntil} days)`;
      }
    }
    lines.push(line);
  }

  lines.push('');
  lines.push('Ask about these naturally when relevant.');

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportActionProfile(userId: string): ActionProfile | null {
  return actionProfiles.get(userId) || null;
}

export function importActionProfile(profile: ActionProfile): void {
  profile.actions.forEach((a) => {
    a.createdAt = new Date(a.createdAt);
    if (a.dueDate) a.dueDate = new Date(a.dueDate);
    if (a.completedAt) a.completedAt = new Date(a.completedAt);
    if (a.followUpScheduled) a.followUpScheduled = new Date(a.followUpScheduled);
  });
  actionProfiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, actionCount: profile.actions.length },
    'Imported action profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectActionOpportunity,
  generateActionSuggestions,
  createAction,
  completeAction,
  skipAction,
  deferAction,
  getPendingActions,
  getActionsNeedingFollowUp,
  getActionStats,
  generateActionFollowUp,
  getActionToFollowUp,
  buildActionContext,
  exportActionProfile,
  importActionProfile,
};
