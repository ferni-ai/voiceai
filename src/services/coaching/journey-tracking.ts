/**
 * Journey Tracking & Reflection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks the user's journey over time and creates meaningful reflection moments.
 * "Look how far you've come."
 *
 * Philosophy:
 * - Progress is often invisible to the person making it
 * - Milestones deserve acknowledgment
 * - The journey matters as much as the destination
 *
 * @module JourneyTracking
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'JourneyTracking' });

// ============================================================================
// TYPES
// ============================================================================

export type MilestoneType =
  | 'session_count' // 10th, 25th, 50th, 100th conversation
  | 'time_duration' // 1 month, 3 months, 6 months, 1 year
  | 'goal_completed'
  | 'breakthrough_moment'
  | 'growth_acknowledged'
  | 'habit_streak'
  | 'challenge_overcome';

export interface JourneyMilestone {
  id: string;
  userId: string;
  type: MilestoneType;
  title: string;
  description: string;
  achievedAt: Date;
  celebrated: boolean;
  celebrationNote?: string;
}

export interface JourneySnapshot {
  date: Date;
  sessionCount: number;
  activeGoals: number;
  completedGoals: number;
  topTopics: string[];
  emotionalTone: string;
  keyMoment?: string;
}

export interface JourneyProfile {
  userId: string;

  // When it all started
  firstSessionDate: Date;
  totalSessions: number;

  // Milestones achieved
  milestones: JourneyMilestone[];

  // Snapshots over time
  snapshots: JourneySnapshot[];

  // Key metrics
  metrics: {
    goalsCompleted: number;
    milestonesAchieved: number;
    breakthroughMoments: number;
    topicsExplored: string[];
  };

  lastUpdated: Date;
}

export interface JourneyReflection {
  type: 'milestone' | 'progress' | 'growth';
  title: string;
  content: string;
  ssml: string;
  dataPoints: string[];
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const journeyProfiles = new Map<string, JourneyProfile>();

function getOrCreateProfile(userId: string): JourneyProfile {
  let profile = journeyProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      firstSessionDate: new Date(),
      totalSessions: 0,
      milestones: [],
      snapshots: [],
      metrics: {
        goalsCompleted: 0,
        milestonesAchieved: 0,
        breakthroughMoments: 0,
        topicsExplored: [],
      },
      lastUpdated: new Date(),
    };
    journeyProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// MILESTONE THRESHOLDS
// ============================================================================

const SESSION_MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 365, 500];
const TIME_MILESTONES = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
];

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Record a new session and check for milestones
 */
export function recordSession(
  userId: string,
  sessionData?: {
    topics?: string[];
    emotionalTone?: string;
    keyMoment?: string;
  }
): JourneyMilestone | null {
  const profile = getOrCreateProfile(userId);
  profile.totalSessions++;
  profile.lastUpdated = new Date();

  // Update topics explored
  if (sessionData?.topics) {
    for (const topic of sessionData.topics) {
      if (!profile.metrics.topicsExplored.includes(topic)) {
        profile.metrics.topicsExplored.push(topic);
      }
    }
  }

  // Create snapshot periodically (every 10 sessions)
  if (profile.totalSessions % 10 === 0) {
    profile.snapshots.push({
      date: new Date(),
      sessionCount: profile.totalSessions,
      activeGoals: 0, // Would be populated from goal tracking
      completedGoals: profile.metrics.goalsCompleted,
      topTopics: sessionData?.topics || [],
      emotionalTone: sessionData?.emotionalTone || 'neutral',
      keyMoment: sessionData?.keyMoment,
    });
  }

  // Check for session milestones
  if (SESSION_MILESTONES.includes(profile.totalSessions)) {
    const milestone = createMilestone(
      profile,
      'session_count',
      `${profile.totalSessions} conversations!`,
      `You've had ${profile.totalSessions} conversations with Ferni. That's real commitment to your growth.`
    );
    return milestone;
  }

  // Check for time milestones
  const daysSinceStart = Math.floor(
    (Date.now() - profile.firstSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  for (const { days, label } of TIME_MILESTONES) {
    if (daysSinceStart >= days && daysSinceStart < days + 7) {
      const existingTimeMilestone = profile.milestones.find(
        (m) => m.type === 'time_duration' && m.title.includes(label)
      );

      if (!existingTimeMilestone) {
        const milestone = createMilestone(
          profile,
          'time_duration',
          `${label} together!`,
          `We've been talking for ${label} now. That's ${profile.totalSessions} conversations, countless topics, and real growth.`
        );
        return milestone;
      }
    }
  }

  return null;
}

/**
 * Create and store a milestone
 */
function createMilestone(
  profile: JourneyProfile,
  type: MilestoneType,
  title: string,
  description: string
): JourneyMilestone {
  const milestone: JourneyMilestone = {
    id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: profile.userId,
    type,
    title,
    description,
    achievedAt: new Date(),
    celebrated: false,
  };

  profile.milestones.push(milestone);
  profile.metrics.milestonesAchieved++;

  log.info({ userId: profile.userId, type, title }, '🎉 Journey milestone achieved');

  return milestone;
}

// ============================================================================
// MILESTONE CREATION
// ============================================================================

/**
 * Record a goal completion as a journey milestone
 */
export function recordGoalCompletion(userId: string, goalTitle: string): JourneyMilestone {
  const profile = getOrCreateProfile(userId);
  profile.metrics.goalsCompleted++;

  return createMilestone(
    profile,
    'goal_completed',
    `Goal completed: ${goalTitle}`,
    `You set out to "${goalTitle}" and you did it. That's not nothing.`
  );
}

/**
 * Record a breakthrough moment
 */
export function recordBreakthrough(userId: string, description: string): JourneyMilestone {
  const profile = getOrCreateProfile(userId);
  profile.metrics.breakthroughMoments++;

  return createMilestone(profile, 'breakthrough_moment', 'Breakthrough moment', description);
}

/**
 * Mark a milestone as celebrated
 */
export function markMilestoneCelebrated(userId: string, milestoneId: string, note?: string): void {
  const profile = journeyProfiles.get(userId);
  if (!profile) return;

  const milestone = profile.milestones.find((m) => m.id === milestoneId);
  if (milestone) {
    milestone.celebrated = true;
    milestone.celebrationNote = note;
  }
}

// ============================================================================
// JOURNEY REFLECTION
// ============================================================================

/**
 * Generate a journey reflection for the user
 */
export function generateJourneyReflection(userId: string): JourneyReflection | null {
  const profile = journeyProfiles.get(userId);
  if (!profile || profile.totalSessions < 5) return null;

  // Find uncelebrated milestones first
  const uncelebrated = profile.milestones.find((m) => !m.celebrated);
  if (uncelebrated) {
    return {
      type: 'milestone',
      title: uncelebrated.title,
      content: uncelebrated.description,
      ssml: uncelebrated.description.replace(/\. /g, ". <break time='300ms'/> "),
      dataPoints: [`Achieved: ${uncelebrated.achievedAt.toLocaleDateString()}`],
    };
  }

  // Generate a progress reflection
  const daysTogether = Math.floor(
    (Date.now() - profile.firstSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const dataPoints = [
    `${profile.totalSessions} conversations`,
    `${daysTogether} days together`,
    `${profile.metrics.goalsCompleted} goals completed`,
    `${profile.metrics.topicsExplored.length} topics explored`,
  ];

  const reflections = [
    {
      content: `You know, we've been talking for ${daysTogether} days now. ${profile.totalSessions} conversations. I've watched you work through so much.`,
      type: 'progress' as const,
    },
    {
      content: `Remember when you first started? Look at how much has changed since then. ${profile.metrics.goalsCompleted} goals completed, countless moments of growth.`,
      type: 'growth' as const,
    },
    {
      content: `I've been thinking about our journey together. ${profile.totalSessions} conversations is a lot of trust. Thank you for that.`,
      type: 'progress' as const,
    },
  ];

  const reflection = reflections[Math.floor(Math.random() * reflections.length)];

  return {
    type: reflection.type,
    title: `${daysTogether} days of growth`,
    content: reflection.content,
    ssml: reflection.content.replace(/\. /g, ". <break time='300ms'/> "),
    dataPoints,
  };
}

/**
 * Get journey summary for a user
 */
export function getJourneySummary(userId: string): {
  daysTogether: number;
  totalSessions: number;
  goalsCompleted: number;
  milestonesAchieved: number;
  topicsCount: number;
} | null {
  const profile = journeyProfiles.get(userId);
  if (!profile) return null;

  return {
    daysTogether: Math.floor(
      (Date.now() - profile.firstSessionDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
    totalSessions: profile.totalSessions,
    goalsCompleted: profile.metrics.goalsCompleted,
    milestonesAchieved: profile.metrics.milestonesAchieved,
    topicsCount: profile.metrics.topicsExplored.length,
  };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for journey
 */
export function buildJourneyContext(userId: string): string | null {
  const profile = journeyProfiles.get(userId);
  if (!profile || profile.totalSessions < 10) return null;

  const daysTogether = Math.floor(
    (Date.now() - profile.firstSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const lines: string[] = ['[🛤️ JOURNEY CONTEXT]'];
  lines.push(
    `You've been talking with this person for ${daysTogether} days (${profile.totalSessions} sessions)`
  );

  if (profile.metrics.goalsCompleted > 0) {
    lines.push(`They've completed ${profile.metrics.goalsCompleted} goals with you`);
  }

  // Check for uncelebrated milestones
  const uncelebrated = profile.milestones.filter((m) => !m.celebrated);
  if (uncelebrated.length > 0) {
    lines.push('');
    lines.push('⭐ UNCELEBRATED MILESTONE:');
    lines.push(`"${uncelebrated[0].title}" - Consider acknowledging this naturally`);
  }

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportJourneyProfile(userId: string): JourneyProfile | null {
  return journeyProfiles.get(userId) || null;
}

export function importJourneyProfile(profile: JourneyProfile): void {
  profile.firstSessionDate = new Date(profile.firstSessionDate);
  profile.lastUpdated = new Date(profile.lastUpdated);
  profile.milestones.forEach((m) => {
    m.achievedAt = new Date(m.achievedAt);
  });
  profile.snapshots.forEach((s) => {
    s.date = new Date(s.date);
  });
  journeyProfiles.set(profile.userId, profile);
  log.debug({ userId: profile.userId }, 'Imported journey profile');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordSession,
  recordGoalCompletion,
  recordBreakthrough,
  markMilestoneCelebrated,
  generateJourneyReflection,
  getJourneySummary,
  buildJourneyContext,
  exportJourneyProfile,
  importJourneyProfile,
};
