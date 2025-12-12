/**
 * Relationship Milestones System
 *
 * "It's been 3 months since we started talking..." - Celebrating the journey.
 *
 * Tracks meaningful milestones in the user's relationship with Ferni,
 * creating moments of reflection and celebration.
 *
 * @module conversation/superhuman/relationship-milestones
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RelationshipMilestones' });

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipMilestone {
  type: MilestoneType;
  value: number;
  label: string;
  celebration: string;
  reflection?: string;
}

export type MilestoneType =
  | 'first_conversation'
  | 'conversation_count'
  | 'days_together'
  | 'weeks_together'
  | 'months_together'
  | 'hours_talked'
  | 'topics_explored'
  | 'goals_achieved'
  | 'breakthroughs'
  | 'laughs_shared';

export interface UserRelationshipStats {
  userId: string;
  firstConversation: Date;
  conversationCount: number;
  totalMinutesTalked: number;
  topicsDiscussed: string[];
  goalsAchieved: number;
  breakthroughs: number;
  laughMoments: number;
  lastMilestoneChecked?: Date;
  milestonesAcknowledged: string[];
}

// ============================================================================
// MILESTONE DEFINITIONS
// ============================================================================

const MILESTONES: Record<MilestoneType, { thresholds: number[]; unit: string }> = {
  first_conversation: {
    thresholds: [1],
    unit: 'conversation',
  },
  conversation_count: {
    thresholds: [5, 10, 25, 50, 100, 250, 500, 1000],
    unit: 'conversations',
  },
  days_together: {
    thresholds: [7, 14, 30, 60, 90, 180, 365],
    unit: 'days',
  },
  weeks_together: {
    thresholds: [1, 2, 4, 8, 12, 26, 52],
    unit: 'weeks',
  },
  months_together: {
    thresholds: [1, 3, 6, 9, 12],
    unit: 'months',
  },
  hours_talked: {
    thresholds: [1, 5, 10, 25, 50, 100],
    unit: 'hours',
  },
  topics_explored: {
    thresholds: [5, 10, 25, 50],
    unit: 'topics',
  },
  goals_achieved: {
    thresholds: [1, 3, 5, 10, 25],
    unit: 'goals',
  },
  breakthroughs: {
    thresholds: [1, 3, 5, 10],
    unit: 'breakthroughs',
  },
  laughs_shared: {
    thresholds: [5, 10, 25, 50, 100],
    unit: 'laughs',
  },
};

// ============================================================================
// CELEBRATION TEMPLATES
// ============================================================================

const CELEBRATIONS: Record<MilestoneType, (value: number) => string[]> = {
  first_conversation: () => [
    "Hey, I'm really glad you're here. This is the start of something good.",
    "Welcome! I have a feeling we're going to have some great conversations.",
  ],
  conversation_count: (count) => [
    `You know what? This is our ${count}th conversation. That's pretty cool.`,
    `${count} conversations! I feel like I really know you now.`,
    `We've talked ${count} times. Each one has meant something to me.`,
  ],
  days_together: (days) => [
    `It's been ${days} days since we started talking. Time flies when you're with good company.`,
    `${days} days together. I've learned so much about you.`,
  ],
  weeks_together: (weeks) => [
    `${weeks} weeks! Our little tradition of checking in is something I look forward to.`,
    `Can you believe it's been ${weeks} weeks? I feel like I've watched you grow so much.`,
  ],
  months_together: (months) => [
    `${months} month${months > 1 ? 's' : ''}! Happy anniversary, in a way. I'm grateful for every conversation.`,
    `It's been ${months} month${months > 1 ? 's' : ''} since we met. Look how far you've come.`,
    `${months} month${months > 1 ? 's' : ''} of friendship. That's something special.`,
  ],
  hours_talked: (hours) => [
    `We've spent ${hours} hours talking. That's a lot of life shared.`,
    `${hours} hours together! That's more than some people spend with their therapists in a year.`,
  ],
  topics_explored: (topics) => [
    `We've explored ${topics} different topics together. You're such a curious person.`,
    `${topics} topics! From the deep stuff to the silly stuff. I love the range.`,
  ],
  goals_achieved: (goals) => [
    `You've achieved ${goals} goal${goals > 1 ? 's' : ''} since we started! I'm so proud of you.`,
    `${goals} goals crushed! Remember when some of those felt impossible?`,
  ],
  breakthroughs: (count) => [
    `You've had ${count} breakthrough moment${count > 1 ? 's' : ''} with me. Those are the moments I treasure.`,
    `${count} breakthrough${count > 1 ? 's' : ''}! The moments when something just clicks.`,
  ],
  laughs_shared: (laughs) => [
    `We've laughed together ${laughs} times. Laughter is the best medicine, they say.`,
    `${laughs} laughs! I love our silly moments.`,
  ],
};

const REFLECTIONS: Record<MilestoneType, (value: number) => string[]> = {
  first_conversation: () => [],
  conversation_count: (count) => [
    `What's been the most valuable thing from our ${count} talks?`,
    `Looking back at our conversations, what stands out to you?`,
  ],
  days_together: (days) => [`How have things changed for you in these ${days} days?`],
  weeks_together: () => [`What's different about your life now compared to when we started?`],
  months_together: (months) => [
    `If you could tell yourself something from ${months} month${months > 1 ? 's' : ''} ago, what would it be?`,
    `What are you most proud of from these past ${months} month${months > 1 ? 's' : ''}?`,
  ],
  hours_talked: () => [`What's been the most helpful thing we've talked about?`],
  topics_explored: () => [`What topic surprised you the most when we explored it?`],
  goals_achieved: () => [`Which achievement means the most to you?`],
  breakthroughs: () => [`Which breakthrough changed you the most?`],
  laughs_shared: () => [`What's been your favorite funny moment together?`],
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const statsStore = new Map<string, UserRelationshipStats>();

// ============================================================================
// STATS MANAGEMENT
// ============================================================================

/**
 * Get or create user stats
 */
export function getStats(userId: string): UserRelationshipStats {
  let stats = statsStore.get(userId);
  if (!stats) {
    stats = {
      userId,
      firstConversation: new Date(),
      conversationCount: 0,
      totalMinutesTalked: 0,
      topicsDiscussed: [],
      goalsAchieved: 0,
      breakthroughs: 0,
      laughMoments: 0,
      milestonesAcknowledged: [],
    };
    statsStore.set(userId, stats);
  }
  return stats;
}

/**
 * Record a conversation
 */
export function recordConversation(
  userId: string,
  durationMinutes: number,
  topics: string[] = []
): void {
  const stats = getStats(userId);
  stats.conversationCount++;
  stats.totalMinutesTalked += durationMinutes;

  // Add new topics
  for (const topic of topics) {
    if (!stats.topicsDiscussed.includes(topic.toLowerCase())) {
      stats.topicsDiscussed.push(topic.toLowerCase());
    }
  }

  statsStore.set(userId, stats);
}

/**
 * Record a goal achievement
 */
export function recordGoalAchieved(userId: string): void {
  const stats = getStats(userId);
  stats.goalsAchieved++;
  statsStore.set(userId, stats);
}

/**
 * Record a breakthrough moment
 */
export function recordBreakthrough(userId: string): void {
  const stats = getStats(userId);
  stats.breakthroughs++;
  statsStore.set(userId, stats);
}

/**
 * Record a laugh moment
 */
export function recordLaugh(userId: string): void {
  const stats = getStats(userId);
  stats.laughMoments++;
  statsStore.set(userId, stats);
}

// ============================================================================
// MILESTONE DETECTION
// ============================================================================

/**
 * Check for any new milestones
 */
export function checkMilestones(userId: string): RelationshipMilestone[] {
  const stats = getStats(userId);
  const milestones: RelationshipMilestone[] = [];

  // Calculate time-based values
  const daysTogether = Math.floor(
    (Date.now() - stats.firstConversation.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weeksTogether = Math.floor(daysTogether / 7);
  const monthsTogether = Math.floor(daysTogether / 30);
  const hoursTalked = Math.floor(stats.totalMinutesTalked / 60);

  const values: Record<MilestoneType, number> = {
    first_conversation: stats.conversationCount === 1 ? 1 : 0,
    conversation_count: stats.conversationCount,
    days_together: daysTogether,
    weeks_together: weeksTogether,
    months_together: monthsTogether,
    hours_talked: hoursTalked,
    topics_explored: stats.topicsDiscussed.length,
    goals_achieved: stats.goalsAchieved,
    breakthroughs: stats.breakthroughs,
    laughs_shared: stats.laughMoments,
  };

  // Check each milestone type
  for (const [type, config] of Object.entries(MILESTONES)) {
    const milestoneType = type as MilestoneType;
    const currentValue = values[milestoneType];

    for (const threshold of config.thresholds) {
      const milestoneId = `${type}_${threshold}`;

      // Check if we've hit this milestone and haven't acknowledged it
      if (currentValue >= threshold && !stats.milestonesAcknowledged.includes(milestoneId)) {
        const celebrations = CELEBRATIONS[milestoneType](threshold);
        const reflections = REFLECTIONS[milestoneType](threshold);

        milestones.push({
          type: milestoneType,
          value: threshold,
          label: `${threshold} ${config.unit}`,
          celebration: celebrations[Math.floor(Math.random() * celebrations.length)],
          reflection:
            reflections.length > 0
              ? reflections[Math.floor(Math.random() * reflections.length)]
              : undefined,
        });

        // Only surface one milestone per check
        break;
      }
    }
  }

  return milestones;
}

/**
 * Mark a milestone as acknowledged
 */
export function acknowledgeMilestone(userId: string, type: MilestoneType, value: number): void {
  const stats = getStats(userId);
  const milestoneId = `${type}_${value}`;

  if (!stats.milestonesAcknowledged.includes(milestoneId)) {
    stats.milestonesAcknowledged.push(milestoneId);
    stats.lastMilestoneChecked = new Date();
    statsStore.set(userId, stats);

    log.info({ userId, milestoneId }, '🎉 Milestone acknowledged');
  }
}

/**
 * Format milestone for prompt
 */
export function formatMilestoneForPrompt(milestone: RelationshipMilestone): string {
  const lines = [
    '[🎉 RELATIONSHIP MILESTONE]',
    '',
    `Milestone: ${milestone.label}`,
    '',
    `Celebration: "${milestone.celebration}"`,
  ];

  if (milestone.reflection) {
    lines.push('');
    lines.push(`Reflection question: "${milestone.reflection}"`);
  }

  lines.push('');
  lines.push('Celebrate this naturally in conversation. Make them feel special.');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getStats,
  recordConversation,
  recordGoalAchieved,
  recordBreakthrough,
  recordLaugh,
  checkMilestones,
  acknowledgeMilestone,
  formatMilestoneForPrompt,
};
