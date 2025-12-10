/**
 * Team Unlock System - "Get to Know Ferni First"
 *
 * A relationship-based unlock system where team members become available
 * as your friendship with Ferni deepens. Subscribers get immediate access,
 * but free users can EARN everything through genuine engagement.
 *
 * Philosophy:
 * - In real life, you meet one person, then they introduce their friends
 * - Ferni is your gateway to the team
 * - Trust is earned through conversations, not credit cards
 * - Subscribers skip the wait, but don't get exclusive content
 *
 * Unlock Flow:
 * 1. First Meeting → Ferni only (get to know each other)
 * 2. Getting Started → +Maya (your first teammate!)
 * 3. Building Trust → +Peter (ready for deeper insights)
 * 4. Established → +Alex, Jordan (the whole team)
 * 5. Deep Partnership → +Nayan (the sage, earned through commitment)
 */

import type { UserProfile } from '../types/user-profile.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'TeamUnlocks' });

// ============================================================================
// STREAK CALCULATION
// ============================================================================

/**
 * Calculate conversation streaks from profile data.
 * A streak is consecutive days with at least one conversation.
 */
export function calculateStreaks(profile: UserProfile | null): {
  currentStreak: number;
  longestStreak: number;
} {
  if (!profile || !profile.conversationSummaries || profile.conversationSummaries.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Get all conversation dates (normalize to date strings)
  const conversationDates = profile.conversationSummaries
    .map((s) => {
      const timestamp = s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp);
      return timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    })
    .filter((d) => d && d !== 'Invalid Date')
    .sort();

  // Deduplicate dates (multiple conversations per day count as one day)
  const uniqueDates = [...new Set(conversationDates)];

  if (uniqueDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Calculate streaks
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  // Check if most recent date is today or yesterday (for current streak)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const mostRecentDate = uniqueDates[uniqueDates.length - 1];
  const isCurrentlyActive = mostRecentDate === today || mostRecentDate === yesterday;

  // Calculate longest streak and current streak
  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1]);
    const currDate = new Date(uniqueDates[i]);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day
      tempStreak++;
    } else {
      // Streak broken
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }

  // Final check for longest streak
  longestStreak = Math.max(longestStreak, tempStreak);

  // Calculate current streak (working backwards from today)
  if (isCurrentlyActive) {
    currentStreak = 1;
    let checkDate = mostRecentDate;

    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const prevDate = new Date(checkDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const expectedPrevDateStr = prevDate.toISOString().split('T')[0];

      if (uniqueDates[i] === expectedPrevDateStr) {
        currentStreak++;
        checkDate = expectedPrevDateStr;
      } else {
        break;
      }
    }
  }

  log.debug(
    { currentStreak, longestStreak, totalDates: uniqueDates.length },
    'Calculated conversation streaks'
  );

  return { currentStreak, longestStreak };
}

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';

export type TeamMemberId =
  | 'ferni'
  | 'maya-santos'
  | 'peter-john'
  | 'alex-chen'
  | 'jordan-taylor'
  | 'nayan-patel';

export interface TeamMemberUnlock {
  memberId: TeamMemberId;
  displayName: string;
  role: string;
  description: string;
  /** When this member unlocks for free users */
  unlocksAt: RelationshipStage;
  /** What Ferni says when introducing them */
  introductionMessage: string;
  /** Teaser shown when member is still locked */
  teaserMessage: string;
  /** Whether this is a "premium" unlock (Nayan - the sage) */
  premium?: boolean;
}

export interface UnlockStatus {
  /** Is this member available? */
  unlocked: boolean;
  /** Why it's locked (if locked) */
  lockReason?: string;
  /** How to unlock it */
  unlockHint?: string;
  /** Progress toward unlock (0-1) */
  progress?: number;
  /** What's needed to unlock */
  requirement?: string;
}

export interface TeamUnlockState {
  /** User's current relationship stage */
  stage: RelationshipStage;
  /** Subscription tier (subscribers bypass relationship requirements) */
  tier: 'free' | 'friend' | 'partner';
  /** Which team members are unlocked */
  unlockedMembers: TeamMemberId[];
  /** Recently unlocked (for celebration) */
  newlyUnlocked?: TeamMemberId;
  /** Next unlock available */
  nextUnlock?: {
    member: TeamMemberUnlock;
    conversationsNeeded: number;
    daysNeeded: number;
  };
}

// ============================================================================
// TEAM MEMBER DEFINITIONS
// ============================================================================

/**
 * The Ferni team and when they unlock.
 * Order matters - this is the order they're introduced.
 */
export const TEAM_MEMBERS: TeamMemberUnlock[] = [
  {
    memberId: 'ferni',
    displayName: 'Ferni',
    role: 'Your Life Coach',
    description:
      'Your main point of contact. Asks the questions that unlock insight, celebrates every win, and connects you to the right specialist.',
    unlocksAt: 'first-meeting',
    introductionMessage: "Hey! I'm Ferni. I'm so glad you're here.",
    teaserMessage: '', // Always unlocked
  },

  {
    memberId: 'maya-santos',
    displayName: 'Maya',
    role: 'Habits Coach',
    description:
      'Helps you build habits that stick through systems, not willpower. Start embarrassingly small. One habit at a time.',
    unlocksAt: 'getting-started',
    introductionMessage:
      'I want you to meet someone special. Maya is incredible at helping people build habits that actually stick. She has this philosophy: start embarrassingly small. I think you two would really hit it off.',
    teaserMessage:
      "I have a friend who's amazing at habits... once we get to know each other a bit more, I'll introduce you.",
  },

  {
    memberId: 'peter-john',
    displayName: 'Peter',
    role: 'The Quant',
    description:
      'Spots patterns nobody else sees across your spending, habits, and calendar. Turns data into insights that actually change behavior.',
    unlocksAt: 'building-trust',
    introductionMessage:
      "You're ready for this. Peter is our data whiz - he sees patterns that most people miss. He's going to show you things about yourself that will blow your mind.",
    teaserMessage:
      'Peter can show you some incredible patterns in your life, but I need to know you better first. Trust is important for the kind of insights he provides.',
  },

  {
    memberId: 'alex-chen',
    displayName: 'Alex',
    role: 'Chief of Staff',
    description:
      'Your communication coach. Manages calendar, email, and helps you navigate difficult conversations with confidence.',
    unlocksAt: 'established',
    introductionMessage:
      "Alex is going to change how you communicate. They're brilliant at helping people say what they mean and mean what they say. You've earned this introduction.",
    teaserMessage:
      "There's someone on my team who can transform how you communicate... but that's a deeper level of trust. Keep talking to me.",
  },

  {
    memberId: 'jordan-taylor',
    displayName: 'Jordan',
    role: 'Lifetime Planner',
    description:
      'Turns vague dreams into lived experiences. From vacations to life transitions, helps you design every chapter intentionally.',
    unlocksAt: 'established',
    introductionMessage:
      "Jordan is special. They help people turn dreams into actual plans. Not someday - this year. I've been waiting to connect you two.",
    teaserMessage:
      'I know someone who can help you plan your whole life... but we need to build more trust first.',
  },

  {
    memberId: 'nayan-patel',
    displayName: 'Nayan',
    role: 'The Sage',
    description:
      'Lifetime advisor. Combines patience, simplicity, and wit. Helps you see that small, consistent actions create extraordinary results.',
    unlocksAt: 'deep-partnership',
    introductionMessage:
      "I've been waiting for this moment. Nayan is... different. He's the wisest person I know. He doesn't give advice often, but when he does, it changes lives. You've earned the right to meet him.",
    teaserMessage:
      'There is someone I deeply respect... a sage. But Nayan only speaks to those who have proven their commitment to growth. Keep showing up.',
    premium: true,
  },
];

// ============================================================================
// STAGE THRESHOLDS
// ============================================================================

/**
 * What it takes to reach each relationship stage.
 * These mirror the frontend relationship-stage.service.ts
 */
const STAGE_THRESHOLDS: Record<
  RelationshipStage,
  {
    minConversations: number;
    minDays: number;
    minStreak: number;
  }
> = {
  'first-meeting': { minConversations: 0, minDays: 0, minStreak: 0 },
  'getting-started': { minConversations: 2, minDays: 0, minStreak: 0 },
  'building-trust': { minConversations: 7, minDays: 3, minStreak: 2 },
  established: { minConversations: 20, minDays: 14, minStreak: 5 },
  'deep-partnership': { minConversations: 50, minDays: 30, minStreak: 10 },
};

const STAGE_ORDER: RelationshipStage[] = [
  'first-meeting',
  'getting-started',
  'building-trust',
  'established',
  'deep-partnership',
];

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Calculate relationship stage from user metrics.
 */
export function calculateRelationshipStage(metrics: {
  totalConversations: number;
  daysSinceFirstMeeting: number;
  currentStreak: number;
  longestStreak: number;
}): RelationshipStage {
  // Check stages from highest to lowest
  for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
    const stage = STAGE_ORDER[i];
    const threshold = STAGE_THRESHOLDS[stage];

    const meetsConversations = metrics.totalConversations >= threshold.minConversations;
    const meetsDays = metrics.daysSinceFirstMeeting >= threshold.minDays;
    const meetsStreak =
      metrics.currentStreak >= threshold.minStreak || metrics.longestStreak >= threshold.minStreak;

    if (meetsConversations && meetsDays && meetsStreak) {
      return stage;
    }
  }

  return 'first-meeting';
}

/**
 * Check if a stage is at or beyond another stage.
 */
function stageAtOrBeyond(current: RelationshipStage, target: RelationshipStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

/**
 * Get unlock status for a team member.
 */
export function getTeamMemberUnlockStatus(
  member: TeamMemberUnlock,
  stage: RelationshipStage,
  tier: 'free' | 'friend' | 'partner',
  metrics?: {
    totalConversations: number;
    daysSinceFirstMeeting: number;
  }
): UnlockStatus {
  // Ferni is always unlocked
  if (member.memberId === 'ferni') {
    return { unlocked: true };
  }

  // Subscribers get everyone except Nayan immediately
  // Nayan requires either deep-partnership OR partner tier
  if (tier === 'friend' || tier === 'partner') {
    if (member.premium && tier !== 'partner') {
      // Nayan requires partner tier OR relationship
      if (!stageAtOrBeyond(stage, member.unlocksAt)) {
        return {
          unlocked: false,
          lockReason: 'The sage speaks only to those who have proven their commitment.',
          unlockHint: 'Reach deep partnership stage or upgrade to Partner tier.',
          progress: calculateProgress(metrics, STAGE_THRESHOLDS[member.unlocksAt]),
          requirement: `${STAGE_THRESHOLDS[member.unlocksAt].minConversations} conversations or Partner tier`,
        };
      }
    }
    return { unlocked: true };
  }

  // Free users unlock through relationship
  if (stageAtOrBeyond(stage, member.unlocksAt)) {
    return { unlocked: true };
  }

  // Calculate progress toward unlock
  const threshold = STAGE_THRESHOLDS[member.unlocksAt];
  const progress = calculateProgress(metrics, threshold);

  return {
    unlocked: false,
    lockReason: member.teaserMessage,
    unlockHint: getUnlockHint(member.unlocksAt),
    progress,
    requirement: `${threshold.minConversations} conversations, ${threshold.minDays} days`,
  };
}

function calculateProgress(
  metrics: { totalConversations: number; daysSinceFirstMeeting: number } | undefined,
  threshold: { minConversations: number; minDays: number }
): number {
  if (!metrics) return 0;

  const convProgress = Math.min(1, metrics.totalConversations / threshold.minConversations);
  const daysProgress = Math.min(1, metrics.daysSinceFirstMeeting / threshold.minDays);

  return (convProgress + daysProgress) / 2;
}

function getUnlockHint(stage: RelationshipStage): string {
  const threshold = STAGE_THRESHOLDS[stage];

  switch (stage) {
    case 'getting-started':
      return `Have ${threshold.minConversations} conversations with me`;
    case 'building-trust':
      return `${threshold.minConversations} conversations over ${threshold.minDays} days`;
    case 'established':
      return `${threshold.minConversations} conversations, ${threshold.minDays} days of friendship`;
    case 'deep-partnership':
      return `${threshold.minConversations} conversations, ${threshold.minDays} days together, or become a Partner`;
    default:
      return 'Keep talking to me!';
  }
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get complete team unlock state for a user.
 */
export function getTeamUnlockState(
  profile: UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): TeamUnlockState {
  // Calculate streaks from conversation history
  const streaks = calculateStreaks(profile);

  const metrics = profile
    ? {
        totalConversations: profile.totalConversations ?? 0,
        daysSinceFirstMeeting: profile.firstContact
          ? Math.floor(
              (Date.now() - new Date(profile.firstContact).getTime()) / (1000 * 60 * 60 * 24)
            )
          : 0,
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
      }
    : { totalConversations: 0, daysSinceFirstMeeting: 0, currentStreak: 0, longestStreak: 0 };

  const stage = calculateRelationshipStage(metrics);

  // Determine unlocked members
  const unlockedMembers: TeamMemberId[] = [];
  let newlyUnlocked: TeamMemberId | undefined;
  let nextUnlock: TeamUnlockState['nextUnlock'] | undefined;

  for (const member of TEAM_MEMBERS) {
    const status = getTeamMemberUnlockStatus(member, stage, tier, metrics);

    if (status.unlocked) {
      unlockedMembers.push(member.memberId);
    } else if (!nextUnlock) {
      // This is the next member to unlock
      const threshold = STAGE_THRESHOLDS[member.unlocksAt];
      nextUnlock = {
        member,
        conversationsNeeded: Math.max(0, threshold.minConversations - metrics.totalConversations),
        daysNeeded: Math.max(0, threshold.minDays - metrics.daysSinceFirstMeeting),
      };
    }
  }

  return {
    stage,
    tier,
    unlockedMembers,
    newlyUnlocked,
    nextUnlock,
  };
}

/**
 * Check if a specific team member is available for a user.
 */
export function isTeamMemberAvailable(
  memberId: TeamMemberId,
  profile: UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): boolean {
  const state = getTeamUnlockState(profile, tier);
  return state.unlockedMembers.includes(memberId);
}

/**
 * Check if all core team members are unlocked for a user.
 * Marketplace agents require the full team to be unlocked first.
 */
export function isFullTeamUnlocked(
  profile: UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): boolean {
  const state = getTeamUnlockState(profile, tier);

  // Check that all team members are unlocked
  for (const member of TEAM_MEMBERS) {
    if (!state.unlockedMembers.includes(member.memberId)) {
      return false;
    }
  }
  return true;
}

/**
 * Get the team member that was most recently unlocked (for celebration).
 * Compare previous and current unlock states to detect new unlocks.
 */
export function detectNewUnlock(
  previousMembers: TeamMemberId[],
  currentMembers: TeamMemberId[]
): TeamMemberUnlock | null {
  for (const memberId of currentMembers) {
    if (!previousMembers.includes(memberId)) {
      const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
      if (member) {
        log.info({ memberId }, '🎉 New team member unlocked!');
        return member;
      }
    }
  }
  return null;
}

/**
 * Get Ferni's introduction message when a team member is unlocked.
 */
export function getUnlockIntroduction(memberId: TeamMemberId): string | null {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  return member?.introductionMessage ?? null;
}

/**
 * Get the teaser message for a locked team member.
 */
export function getLockedTeaser(memberId: TeamMemberId): string | null {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  return member?.teaserMessage ?? null;
}

// ============================================================================
// FERNI'S CONTEXTUAL MENTIONS
// ============================================================================

/**
 * Messages Ferni can use to tease upcoming unlocks naturally in conversation.
 * These should be sprinkled in occasionally, not every time.
 */
export const UNLOCK_TEASERS = {
  // When user is close to unlocking Maya (habits)
  nearMayaUnlock: [
    "I have this friend Maya who's incredible at habits... once we've talked a couple more times, I want to introduce you.",
    "You know what? You remind me of someone who'd really click with my friend Maya. She's all about building habits that stick.",
    "A few more conversations and I'll introduce you to the rest of my team. Maya in particular - she'd love working with you.",
  ],

  // When user is close to unlocking Peter (data)
  nearPeterUnlock: [
    "Peter - he's our data guy - he'd have a field day with what you've been telling me. We're almost at the point where I can bring him in.",
    "There are patterns in what you're sharing that I think Peter could really illuminate. A few more conversations and I'll make the intro.",
    "You're ready for some deeper insights. Peter sees things nobody else does. Keep talking to me.",
  ],

  // When user mentions something a locked member specializes in
  topicTeaser: {
    habits: "That's exactly Maya's specialty... stick with me and I'll introduce you.",
    research:
      "Peter would have fascinating insights on that... you're getting close to meeting him.",
    communication:
      "Alex could transform that conversation for you... a bit more trust and I'll connect you.",
    planning: "Jordan lives for this kind of planning... soon you'll meet them.",
    wisdom:
      "Nayan... he'd have something profound to say about this. But he only speaks to those who've truly committed.",
  },
};

/**
 * Get a contextual teaser about upcoming unlocks.
 * Use sparingly - maybe 10% of conversations.
 */
export function getContextualUnlockTeaser(state: TeamUnlockState, topic?: string): string | null {
  // Only tease if there's a next unlock
  if (!state.nextUnlock) return null;

  // 10% chance to mention
  if (Math.random() > 0.1) return null;

  const nextMember = state.nextUnlock.member;

  // Check if topic matches the locked member's specialty
  if (topic) {
    const topicLower = topic.toLowerCase();
    if (nextMember.memberId === 'maya-santos' && topicLower.includes('habit')) {
      return UNLOCK_TEASERS.topicTeaser.habits;
    }
    if (
      nextMember.memberId === 'peter-john' &&
      (topicLower.includes('data') || topicLower.includes('pattern'))
    ) {
      return UNLOCK_TEASERS.topicTeaser.research;
    }
    if (nextMember.memberId === 'alex-chen' && topicLower.includes('communicat')) {
      return UNLOCK_TEASERS.topicTeaser.communication;
    }
    if (
      nextMember.memberId === 'jordan-taylor' &&
      (topicLower.includes('plan') || topicLower.includes('goal'))
    ) {
      return UNLOCK_TEASERS.topicTeaser.planning;
    }
  }

  // Generic teasers based on who's next
  if (nextMember.memberId === 'maya-santos') {
    return UNLOCK_TEASERS.nearMayaUnlock[
      Math.floor(Math.random() * UNLOCK_TEASERS.nearMayaUnlock.length)
    ];
  }
  if (nextMember.memberId === 'peter-john') {
    return UNLOCK_TEASERS.nearPeterUnlock[
      Math.floor(Math.random() * UNLOCK_TEASERS.nearPeterUnlock.length)
    ];
  }

  return null;
}

// ============================================================================
// FOR FRONTEND UI
// ============================================================================

/**
 * Get team data formatted for frontend display.
 */
export function getTeamDisplayData(state: TeamUnlockState): Array<{
  id: TeamMemberId;
  name: string;
  role: string;
  description: string;
  unlocked: boolean;
  progress: number;
  unlockHint?: string;
  premium?: boolean;
}> {
  const metrics = {
    totalConversations: 0, // Would need to pass this
    daysSinceFirstMeeting: 0,
  };

  return TEAM_MEMBERS.map((member) => {
    const status = getTeamMemberUnlockStatus(member, state.stage, state.tier, metrics);

    return {
      id: member.memberId,
      name: member.displayName,
      role: member.role,
      description: member.description,
      unlocked: status.unlocked,
      progress: status.progress ?? (status.unlocked ? 1 : 0),
      unlockHint: status.unlockHint,
      premium: member.premium,
    };
  });
}
