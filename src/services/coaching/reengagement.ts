/**
 * Re-engagement Nudge System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when users go quiet and reaches out thoughtfully.
 * Not "we miss you!" marketing - genuine care.
 *
 * Philosophy:
 * - Absence might mean they're doing well (celebrate that!)
 * - Or it might mean they're struggling (be gentle)
 * - Never pushy, always warm
 *
 * @module Reengagement
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'Reengagement' });

// ============================================================================
// TYPES
// ============================================================================

export type AbsenceReason =
  | 'thriving' // Doing well, doesn't need us
  | 'busy' // Life got hectic
  | 'struggling' // Might be having a hard time
  | 'forgot' // Just fell off radar
  | 'unknown';

export type NudgeType =
  | 'gentle_checkin'
  | 'celebrating_independence'
  | 'supportive_reach'
  | 'casual_hello'
  | 'milestone_based';

export interface ReengagementNudge {
  type: NudgeType;
  message: string;
  ssml: string;
  tone: 'warm' | 'curious' | 'supportive' | 'celebratory';
}

export interface UserEngagementProfile {
  userId: string;

  // Session patterns
  lastSessionDate: Date;
  averageSessionGap: number; // Days between sessions
  longestGap: number;
  totalSessions: number;

  // Absence tracking
  currentAbsenceDays: number;
  nudgesSent: Array<{
    date: Date;
    type: NudgeType;
    responded: boolean;
  }>;

  // Context from last session
  lastSessionContext?: {
    topics: string[];
    emotionalState: string;
    pendingGoals: string[];
    upcomingEvents: string[];
  };

  // Preferences
  reengagementOptOut: boolean;
  preferredNudgeStyle?: NudgeType;
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const engagementProfiles = new Map<string, UserEngagementProfile>();

function getOrCreateProfile(userId: string): UserEngagementProfile {
  let profile = engagementProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      lastSessionDate: new Date(),
      averageSessionGap: 3, // Assume 3 days average
      longestGap: 7,
      totalSessions: 1,
      currentAbsenceDays: 0,
      nudgesSent: [],
      reengagementOptOut: false,
    };
    engagementProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// NUDGE THRESHOLDS
// ============================================================================

const NUDGE_THRESHOLDS = {
  // First nudge after this many days past their average
  firstNudge: 1.5, // 1.5x their average gap
  // Second nudge if no response
  secondNudge: 2.5, // 2.5x their average gap
  // Final gentle reach
  finalNudge: 4, // 4x their average gap
  // Maximum nudges per absence
  maxNudges: 3,
  // Minimum days between nudges
  minDaysBetweenNudges: 3,
};

// ============================================================================
// NUDGE MESSAGES
// ============================================================================

const NUDGE_MESSAGES: Record<NudgeType, string[]> = {
  gentle_checkin: [
    'Hey, just thinking about you. How are things going?',
    "Haven't heard from you in a bit. Everything okay?",
    "Checking in. No pressure - just wanted you to know I'm here.",
    'Been a little while. How are you doing?',
  ],
  celebrating_independence: [
    "Haven't heard from you! If that means things are going well, that's wonderful.",
    "It's been quiet - hoping that means life is good. I'm here when you need me.",
    "No news is often good news. Hope you're thriving!",
  ],
  supportive_reach: [
    "I've been thinking about you. Sometimes when things are hard, it's harder to reach out. I'm here.",
    "Just wanted you to know - I'm here whenever you're ready. No rush.",
    "Sometimes we go quiet when things get heavy. If that's you, I'm here.",
  ],
  casual_hello: [
    "Hey! Random hello. Hope you're doing well.",
    "Just saying hi. What's new?",
    'Thinking of you. Hope life is treating you well.',
  ],
  milestone_based: [
    "It's been about a month since we talked. How are things?",
    "Just realized we haven't connected in a while. Checking in.",
  ],
};

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Record a new session
 */
export function recordSession(
  userId: string,
  context?: UserEngagementProfile['lastSessionContext']
): void {
  const profile = getOrCreateProfile(userId);
  const now = new Date();

  // Calculate gap since last session
  const daysSinceLast = Math.floor(
    (now.getTime() - profile.lastSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Update running average (weighted toward recent)
  profile.averageSessionGap = profile.averageSessionGap * 0.7 + daysSinceLast * 0.3;

  // Update longest gap
  if (daysSinceLast > profile.longestGap) {
    profile.longestGap = daysSinceLast;
  }

  profile.lastSessionDate = now;
  profile.totalSessions++;
  profile.currentAbsenceDays = 0;

  if (context) {
    profile.lastSessionContext = context;
  }

  // Mark any pending nudges as responded
  for (const nudge of profile.nudgesSent) {
    if (!nudge.responded) {
      nudge.responded = true;
    }
  }

  log.debug(
    { userId, daysSinceLast, avgGap: profile.averageSessionGap.toFixed(1) },
    'Session recorded'
  );
}

// ============================================================================
// NUDGE DETERMINATION
// ============================================================================

/**
 * Check if user needs a re-engagement nudge
 */
export function shouldSendNudge(userId: string): {
  shouldNudge: boolean;
  nudgeType?: NudgeType;
  reason?: string;
} {
  const profile = engagementProfiles.get(userId);
  if (!profile) return { shouldNudge: false };

  // Respect opt-out
  if (profile.reengagementOptOut) {
    return { shouldNudge: false, reason: 'opted_out' };
  }

  const now = new Date();
  const daysSinceLast = Math.floor(
    (now.getTime() - profile.lastSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Count nudges in this absence period
  const recentNudges = profile.nudgesSent.filter((n) => n.date > profile.lastSessionDate);

  // Max nudges reached
  if (recentNudges.length >= NUDGE_THRESHOLDS.maxNudges) {
    return { shouldNudge: false, reason: 'max_nudges_reached' };
  }

  // Check minimum gap between nudges
  if (recentNudges.length > 0) {
    const lastNudge = recentNudges[recentNudges.length - 1];
    const daysSinceNudge = Math.floor(
      (now.getTime() - lastNudge.date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceNudge < NUDGE_THRESHOLDS.minDaysBetweenNudges) {
      return { shouldNudge: false, reason: 'too_soon_since_last_nudge' };
    }
  }

  // Determine if it's time for a nudge
  const threshold = profile.averageSessionGap * NUDGE_THRESHOLDS.firstNudge;

  if (daysSinceLast < threshold) {
    return { shouldNudge: false, reason: 'within_normal_range' };
  }

  // Determine nudge type based on context
  const nudgeType = determineNudgeType(profile, daysSinceLast);

  return {
    shouldNudge: true,
    nudgeType,
    reason: `${daysSinceLast} days since last session (threshold: ${threshold.toFixed(0)})`,
  };
}

/**
 * Determine appropriate nudge type
 */
function determineNudgeType(profile: UserEngagementProfile, daysSinceLast: number): NudgeType {
  const lastContext = profile.lastSessionContext;

  // If last session was positive/neutral, celebrate independence
  if (lastContext?.emotionalState === 'positive' || lastContext?.emotionalState === 'content') {
    return 'celebrating_independence';
  }

  // If last session was heavy, be supportive
  if (
    lastContext?.emotionalState === 'sad' ||
    lastContext?.emotionalState === 'anxious' ||
    lastContext?.emotionalState === 'struggling'
  ) {
    return 'supportive_reach';
  }

  // Milestone-based for longer absences
  if (daysSinceLast >= 30) {
    return 'milestone_based';
  }

  // Default to gentle check-in
  return 'gentle_checkin';
}

// ============================================================================
// NUDGE GENERATION
// ============================================================================

/**
 * Generate a re-engagement nudge
 */
export function generateNudge(userId: string): ReengagementNudge | null {
  const check = shouldSendNudge(userId);
  if (!check.shouldNudge || !check.nudgeType) return null;

  const profile = engagementProfiles.get(userId)!;
  const messages = NUDGE_MESSAGES[check.nudgeType];
  const message = messages[Math.floor(Math.random() * messages.length)];

  // Personalize with context if available
  let personalizedMessage = message;
  if (profile.lastSessionContext?.pendingGoals?.length) {
    const goal = profile.lastSessionContext.pendingGoals[0];
    personalizedMessage = `${message} I've been wondering how "${goal}" is going.`;
  } else if (profile.lastSessionContext?.upcomingEvents?.length) {
    const event = profile.lastSessionContext.upcomingEvents[0];
    personalizedMessage = `${message} How did "${event}" go?`;
  }

  const toneMap: Record<NudgeType, ReengagementNudge['tone']> = {
    gentle_checkin: 'warm',
    celebrating_independence: 'celebratory',
    supportive_reach: 'supportive',
    casual_hello: 'curious',
    milestone_based: 'warm',
  };

  // Record the nudge
  profile.nudgesSent.push({
    date: new Date(),
    type: check.nudgeType,
    responded: false,
  });

  log.info({ userId, type: check.nudgeType }, '📬 Re-engagement nudge generated');

  return {
    type: check.nudgeType,
    message: personalizedMessage,
    ssml: personalizedMessage.replace(/\. /g, ". <break time='300ms'/> "),
    tone: toneMap[check.nudgeType],
  };
}

/**
 * Get all users needing nudges
 */
export function getUsersNeedingNudges(): string[] {
  const needsNudge: string[] = [];

  Array.from(engagementProfiles.keys()).forEach((userId) => {
    const check = shouldSendNudge(userId);
    if (check.shouldNudge) {
      needsNudge.push(userId);
    }
  });

  return needsNudge;
}

// ============================================================================
// PREFERENCES
// ============================================================================

/**
 * Opt out of re-engagement nudges
 */
export function optOutOfReengagement(userId: string): void {
  const profile = getOrCreateProfile(userId);
  profile.reengagementOptOut = true;
  log.info({ userId }, 'User opted out of re-engagement');
}

/**
 * Opt back in to re-engagement nudges
 */
export function optInToReengagement(userId: string): void {
  const profile = getOrCreateProfile(userId);
  profile.reengagementOptOut = false;
  log.info({ userId }, 'User opted back into re-engagement');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportEngagementProfile(userId: string): UserEngagementProfile | null {
  return engagementProfiles.get(userId) || null;
}

export function importEngagementProfile(profile: UserEngagementProfile): void {
  profile.lastSessionDate = new Date(profile.lastSessionDate);
  profile.nudgesSent.forEach((n) => {
    n.date = new Date(n.date);
  });
  engagementProfiles.set(profile.userId, profile);
  log.debug({ userId: profile.userId }, 'Imported engagement profile');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordSession,
  shouldSendNudge,
  generateNudge,
  getUsersNeedingNudges,
  optOutOfReengagement,
  optInToReengagement,
  exportEngagementProfile,
  importEngagementProfile,
};
