/**
 * Re-engagement Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Thoughtful sequences to reconnect with users who've gone quiet.
 * Not spammy marketing - genuine care about someone we miss.
 *
 * Philosophy:
 * - Respect their absence (life happens)
 * - Show genuine care, not desperation
 * - Give them an easy way back
 * - Never guilt-trip or pressure
 * - Use ML timing for optimal reconnection moments
 *
 * Arc Stages:
 * - 7 days silent: Gentle "thinking of you"
 * - 14 days silent: Sharing something relevant to their interests
 * - 30 days silent: Warm invitation with no pressure
 * - 60 days silent: Final gentle reminder, then respect their space
 *
 * @module ReengagementArc
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getTimingRecommendation } from '../contacts/optimal-timing.js';

const log = createLogger({ module: 'ReengagementArc' });

// ============================================================================
// TYPES
// ============================================================================

export type ReengagementStage =
  | 'active' // User is engaged (< 7 days)
  | 'thinking_of_you' // 7-13 days silent
  | 'share_relevant' // 14-29 days silent
  | 'warm_invitation' // 30-59 days silent
  | 'final_reminder' // 60+ days silent
  | 'respect_space'; // After final reminder, give space

export type ReengagementType =
  | 'thinking_of_you' // Day 7: "Just wanted you to know I'm thinking of you"
  | 'relevant_share' // Day 14: Share something related to their interests
  | 'warm_invitation' // Day 30: "Whenever you're ready, I'm here"
  | 'final_hello' // Day 60: One last gentle hello
  | 'special_occasion'; // Birthday, anniversary, etc.

export interface ReengagementState {
  userId: string;
  lastConversationDate: Date;
  daysSinceLastConversation: number;
  stage: ReengagementStage;

  // Engagement history
  totalConversations: number;
  averageSessionLength: number;
  previousReengagements: Array<{
    type: ReengagementType;
    sentAt: Date;
    responseReceived: boolean;
  }>;

  // What we know about them
  interests?: string[];
  preferredPersona?: string;
  name?: string;
  timezone?: string;

  // Arc state
  currentArcStarted?: Date;
  arcComplete: boolean;
}

export interface ScheduledReengagement {
  id: string;
  userId: string;
  type: ReengagementType;
  scheduledFor: Date;
  persona: string;
  message: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

interface ReengagementTemplate {
  type: ReengagementType;
  dayRange: [number, number];
  priority: 'low' | 'medium' | 'high';
  messages: Array<(state: ReengagementState) => string>;
}

const REENGAGEMENT_TEMPLATES: ReengagementTemplate[] = [
  {
    type: 'thinking_of_you',
    dayRange: [7, 13],
    priority: 'low',
    messages: [
      (state) =>
        `Hey ${state.name || 'friend'} - just thinking of you. Hope everything's going well. No pressure to respond, just wanted you to know I'm here.`,
      () =>
        `It's been a bit! I hope life has been treating you well. Whenever you want to chat, I'm around.`,
      (state) =>
        `${state.name || 'Hey'}, I've been thinking about our last conversation. Hope you're doing okay out there.`,
    ],
  },
  {
    type: 'relevant_share',
    dayRange: [14, 29],
    priority: 'low',
    messages: [
      (state) =>
        state.interests && state.interests.length > 0
          ? `Hey ${state.name || 'there'} - came across something about ${state.interests[0]} and thought of you. Would love to share when you have a moment.`
          : `Hi ${state.name || 'friend'}! I've been learning some new things I think you'd find interesting. No rush - just wanted to let you know I'm here.`,
      (state) =>
        `${state.name || 'Hey'}! I remembered something you mentioned last time we talked. It's been on my mind. Whenever you're ready, I'd love to reconnect.`,
    ],
  },
  {
    type: 'warm_invitation',
    dayRange: [30, 59],
    priority: 'medium',
    messages: [
      (state) =>
        `Hi ${state.name || 'friend'} - it's been about a month. Life gets busy, I get it. Whenever you're ready, even just for a quick hello, I'm here. No agenda, just care.`,
      () =>
        `A month already! Time flies. I hope you're doing well. Just wanted to remind you that I'm always here when you need to talk. Take care of yourself.`,
      (state) =>
        `${state.name || 'Hey'}, thinking of you. A lot can happen in a month. If you ever want to catch up, I'm just a message away. No pressure.`,
    ],
  },
  {
    type: 'final_hello',
    dayRange: [60, 90],
    priority: 'medium',
    messages: [
      (state) =>
        `Hey ${state.name || 'friend'} - one last hello. I don't want to be annoying, but I genuinely miss our conversations. I'll be here if you ever want to reconnect. Take care.`,
      () =>
        `It's been a while! I'm giving you space, but wanted to say hi one more time. I'm always here when you need me. Wishing you well.`,
    ],
  },
];

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const reengagementStates = new Map<string, ReengagementState>();

/**
 * Calculate reengagement stage based on days silent
 */
function calculateStage(daysSilent: number, state: ReengagementState): ReengagementStage {
  // Check if we've already sent final reminder
  const hasSentFinal = state.previousReengagements.some((r) => r.type === 'final_hello');
  if (hasSentFinal) {
    return 'respect_space';
  }

  if (daysSilent < 7) return 'active';
  if (daysSilent < 14) return 'thinking_of_you';
  if (daysSilent < 30) return 'share_relevant';
  if (daysSilent < 60) return 'warm_invitation';
  return 'final_reminder';
}

/**
 * Initialize or update reengagement state for a user
 */
export function updateReengagementState(
  userId: string,
  lastConversationDate: Date,
  context?: {
    interests?: string[];
    preferredPersona?: string;
    name?: string;
    totalConversations?: number;
  }
): ReengagementState {
  const existing = reengagementStates.get(userId);
  const now = new Date();
  const daysSinceLastConversation = Math.floor(
    (now.getTime() - lastConversationDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  const state: ReengagementState = {
    userId,
    lastConversationDate,
    daysSinceLastConversation,
    stage: 'active', // Will be calculated below
    totalConversations: context?.totalConversations || existing?.totalConversations || 0,
    averageSessionLength: existing?.averageSessionLength || 0,
    previousReengagements: existing?.previousReengagements || [],
    interests: context?.interests || existing?.interests,
    preferredPersona: context?.preferredPersona || existing?.preferredPersona,
    name: context?.name || existing?.name,
    arcComplete: false,
    currentArcStarted: existing?.currentArcStarted,
  };

  // Calculate stage
  state.stage = calculateStage(daysSinceLastConversation, state);

  // Start arc if transitioning from active to silent
  if (state.stage !== 'active' && state.stage !== 'respect_space' && !state.currentArcStarted) {
    state.currentArcStarted = now;
    log.info({ userId, stage: state.stage }, '🔄 Re-engagement arc started');
  }

  // Mark arc complete if they're active again
  if (state.stage === 'active' && existing?.stage !== 'active') {
    state.arcComplete = true;
    state.currentArcStarted = undefined;
    log.info({ userId }, '✅ Re-engagement arc completed - user is active');
  }

  reengagementStates.set(userId, state);
  return state;
}

/**
 * Get reengagement state for a user
 */
export function getReengagementState(userId: string): ReengagementState | undefined {
  return reengagementStates.get(userId);
}

/**
 * Record that a user returned (reset the arc)
 */
export function recordUserReturned(userId: string): void {
  const state = reengagementStates.get(userId);
  if (state) {
    state.lastConversationDate = new Date();
    state.daysSinceLastConversation = 0;
    state.stage = 'active';
    state.arcComplete = true;
    state.currentArcStarted = undefined;
    reengagementStates.set(userId, state);
    log.info({ userId }, '🎉 User returned! Re-engagement arc reset');
  }
}

/**
 * Record that a reengagement was sent
 */
export function recordReengagementSent(
  userId: string,
  type: ReengagementType,
  responseReceived = false
): void {
  const state = reengagementStates.get(userId);
  if (!state) return;

  state.previousReengagements.push({
    type,
    sentAt: new Date(),
    responseReceived,
  });

  // If this was the final hello, move to respect_space
  if (type === 'final_hello') {
    state.stage = 'respect_space';
    log.info({ userId }, '🤝 Final reengagement sent - respecting their space');
  }

  reengagementStates.set(userId, state);
  log.info({ userId, type }, '📬 Re-engagement recorded');
}

/**
 * Record that user responded to a reengagement
 */
export function recordReengagementResponse(userId: string): void {
  const state = reengagementStates.get(userId);
  if (!state || state.previousReengagements.length === 0) return;

  // Mark the most recent reengagement as responded
  const lastReengagement = state.previousReengagements[state.previousReengagements.length - 1];
  lastReengagement.responseReceived = true;

  // User is back - reset to active
  recordUserReturned(userId);
}

// ============================================================================
// REENGAGEMENT SCHEDULING
// ============================================================================

/**
 * Get pending reengagements for a user
 */
export async function getPendingReengagements(userId: string): Promise<ScheduledReengagement[]> {
  const state = reengagementStates.get(userId);
  if (!state || state.stage === 'active' || state.stage === 'respect_space') {
    return [];
  }

  const pendingReengagements: ScheduledReengagement[] = [];
  const sentTypes = new Set(state.previousReengagements.map((r) => r.type));

  for (const template of REENGAGEMENT_TEMPLATES) {
    // Skip if already sent
    if (sentTypes.has(template.type)) continue;

    // Check day range
    const [minDay, maxDay] = template.dayRange;
    if (state.daysSinceLastConversation < minDay || state.daysSinceLastConversation > maxDay) {
      continue;
    }

    // Generate message
    const messageTemplate = template.messages[Math.floor(Math.random() * template.messages.length)];
    const message = messageTemplate(state);

    // Get optimal send time
    let scheduledFor = new Date();
    try {
      const timing = await getTimingRecommendation(userId, `user_${userId}`, state.name || 'User');
      scheduledFor = timing.suggestedSendTime;
    } catch {
      // Fall back to 2 hours from now during business hours
      scheduledFor = getDefaultSendTime();
    }

    pendingReengagements.push({
      id: `reengagement_${userId}_${template.type}_${Date.now()}`,
      userId,
      type: template.type,
      scheduledFor,
      persona: state.preferredPersona || 'ferni',
      message,
      reason: `Re-engagement: Day ${state.daysSinceLastConversation} - ${template.type}`,
      priority: template.priority,
    });
  }

  // Only return one reengagement at a time to avoid overwhelming
  return pendingReengagements.slice(0, 1);
}

/**
 * Get default send time (2 hours from now, during business hours)
 */
function getDefaultSendTime(): Date {
  const now = new Date();
  const sendTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const hours = sendTime.getHours();
  if (hours < 9) {
    sendTime.setHours(9, 0, 0, 0);
  } else if (hours >= 20) {
    sendTime.setDate(sendTime.getDate() + 1);
    sendTime.setHours(10, 0, 0, 0);
  }

  return sendTime;
}

/**
 * Check if user is in re-engagement period
 */
export function isInReengagementPeriod(userId: string): boolean {
  const state = reengagementStates.get(userId);
  if (!state) return false;
  return state.stage !== 'active' && state.stage !== 'respect_space';
}

/**
 * Get re-engagement summary
 */
export function getReengagementSummary(userId: string): {
  stage: ReengagementStage;
  daysSilent: number;
  reengagementsSent: number;
  lastReengagement?: Date;
  inArc: boolean;
} | null {
  const state = reengagementStates.get(userId);
  if (!state) return null;

  const lastReengagement =
    state.previousReengagements.length > 0
      ? state.previousReengagements[state.previousReengagements.length - 1].sentAt
      : undefined;

  return {
    stage: state.stage,
    daysSilent: state.daysSinceLastConversation,
    reengagementsSent: state.previousReengagements.length,
    lastReengagement,
    inArc: state.stage !== 'active' && state.stage !== 'respect_space',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const reengagementArc = {
  update: updateReengagementState,
  getState: getReengagementState,
  recordReturned: recordUserReturned,
  recordSent: recordReengagementSent,
  recordResponse: recordReengagementResponse,
  getPending: getPendingReengagements,
  isInReengagement: isInReengagementPeriod,
  getSummary: getReengagementSummary,
};

export default reengagementArc;
