/**
 * Intelligent Onboarding Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * A Firestore-persisted, LLM-driven onboarding journey that:
 * - Auto-initializes on first session
 * - Generates deeply personalized check-ins
 * - Adapts to user engagement patterns
 * - Survives container restarts
 *
 * Arc Structure (14 days):
 * - Day 0: Signup (auto-initialized)
 * - Day 1: Welcome follow-up
 * - Day 2: "How did yesterday go?"
 * - Day 3-5: First topic deep-dive
 * - Day 6-8: First week reflection
 * - Day 9-12: Momentum check
 * - Day 13-15: Two-week celebration
 *
 * @module IntelligentOnboardingArc
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  generatePersonalizedContent,
  type UserContext,
  type OutreachType,
} from './llm-content-generator.js';

const log = createLogger({ module: 'IntelligentOnboardingArc' });

// ============================================================================
// TYPES
// ============================================================================

export type OnboardingMilestone =
  | 'signup'
  | 'first_conversation'
  | 'shared_concern'
  | 'explored_topic'
  | 'first_week'
  | 'second_week'
  | 'first_month';

export type EngagementLevel = 'high' | 'medium' | 'low' | 'silent';

export interface OnboardingState {
  userId: string;
  signupDate: string; // ISO string for Firestore
  daysSinceSignup: number;

  // Milestones
  milestonesReached: OnboardingMilestone[];
  lastMilestoneDate?: string;

  // Engagement
  conversationCount: number;
  lastConversationDate?: string;
  engagementLevel: EngagementLevel;

  // Check-ins sent
  checkInsSent: Array<{
    type: OutreachType;
    sentAt: string;
    channel: string;
    responded: boolean;
  }>;

  // What we know
  name?: string;
  primaryConcerns: string[];
  recentTopics: string[];
  preferredPersona?: string;
  boundaries: string[];

  // Emotional context
  lastMood?: string;
  emotionalPatterns: string[];

  // Upcoming events
  upcomingEvents: Array<{ event: string; date: string }>;

  // Arc status
  arcComplete: boolean;
  arcCompletedAt?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledCheckIn {
  id: string;
  userId: string;
  type: OutreachType;
  scheduledFor: Date;
  channel: 'sms' | 'email' | 'voice_call' | 'push' | 'in_app';
  content: {
    text: string;
    ssml: string;
    subject?: string;
    htmlBody?: string;
  };
  personaId: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

// ============================================================================
// FIRESTORE COLLECTION
// ============================================================================

const COLLECTION = 'bogle_users';
const SUBCOLLECTION = 'onboarding_arc';

async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestoreDb: getDb } = await import('../superhuman/firestore-utils.js');
    return getDb();
  } catch {
    return null;
  }
}

// ============================================================================
// ONBOARDING STATE MANAGEMENT
// ============================================================================

/**
 * Initialize onboarding for a new user
 *
 * Call this on first session or when user doesn't have onboarding state.
 * Safe to call multiple times - will not overwrite existing state.
 */
export async function initializeOnboarding(
  userId: string,
  profile?: { name?: string; email?: string }
): Promise<OnboardingState> {
  const db = await getFirestoreDb();

  // Check if already exists
  const existing = await getOnboardingState(userId);
  if (existing) {
    log.debug({ userId }, 'Onboarding already initialized');
    return existing;
  }

  const now = new Date().toISOString();
  const state: OnboardingState = {
    userId,
    signupDate: now,
    daysSinceSignup: 0,
    milestonesReached: ['signup'],
    conversationCount: 0,
    engagementLevel: 'high',
    checkInsSent: [],
    name: profile?.name,
    primaryConcerns: [],
    recentTopics: [],
    boundaries: [],
    emotionalPatterns: [],
    upcomingEvents: [],
    arcComplete: false,
    createdAt: now,
    updatedAt: now,
  };

  if (db) {
    try {
      await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(SUBCOLLECTION)
        .doc('state')
        .set(cleanForFirestore(state));

      log.info({ userId, name: profile?.name }, 'Onboarding arc initialized in Firestore');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save onboarding state to Firestore');
    }
  }

  return state;
}

/**
 * Get onboarding state for a user
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const db = await getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUBCOLLECTION)
      .doc('state')
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as OnboardingState;

    // Update daysSinceSignup dynamically
    if (data.signupDate) {
      const signup = new Date(data.signupDate);
      data.daysSinceSignup = Math.floor((Date.now() - signup.getTime()) / (24 * 60 * 60 * 1000));
    }

    return data;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get onboarding state');
    return null;
  }
}

/**
 * Update onboarding state
 */
export async function updateOnboardingState(
  userId: string,
  updates: Partial<OnboardingState>
): Promise<void> {
  const db = await getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SUBCOLLECTION)
      .doc('state')
      .update(
        cleanForFirestore({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
      );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update onboarding state');
  }
}

// ============================================================================
// CONVERSATION TRACKING
// ============================================================================

/**
 * Record a conversation during onboarding
 *
 * Call this after each conversation to track progress and learn about user.
 */
export async function recordConversation(
  userId: string,
  context?: {
    primaryConcern?: string;
    topics?: string[];
    mood?: string;
    persona?: string;
    upcomingEvent?: { event: string; date: Date };
    boundary?: string;
  }
): Promise<void> {
  const state = await getOnboardingState(userId);
  if (!state || state.arcComplete) return;

  const updates: Partial<OnboardingState> = {
    conversationCount: state.conversationCount + 1,
    lastConversationDate: new Date().toISOString(),
  };

  // Update concerns
  if (context?.primaryConcern && !state.primaryConcerns.includes(context.primaryConcern)) {
    updates.primaryConcerns = [...state.primaryConcerns, context.primaryConcern];

    // Mark milestone
    if (!state.milestonesReached.includes('shared_concern')) {
      updates.milestonesReached = [...state.milestonesReached, 'shared_concern'];
      updates.lastMilestoneDate = new Date().toISOString();
    }
  }

  // Update topics
  if (context?.topics) {
    const newTopics = context.topics.filter((t) => !state.recentTopics.includes(t));
    if (newTopics.length > 0) {
      updates.recentTopics = [...state.recentTopics, ...newTopics].slice(-10);
    }
  }

  // Update mood
  if (context?.mood) {
    updates.lastMood = context.mood;
    if (!state.emotionalPatterns.includes(context.mood)) {
      updates.emotionalPatterns = [...state.emotionalPatterns, context.mood].slice(-20);
    }
  }

  // Update preferred persona
  if (context?.persona) {
    updates.preferredPersona = context.persona;
  }

  // Update upcoming events
  if (context?.upcomingEvent) {
    updates.upcomingEvents = [
      ...state.upcomingEvents,
      { event: context.upcomingEvent.event, date: context.upcomingEvent.date.toISOString() },
    ].slice(-10);
  }

  // Update boundaries
  if (context?.boundary && !state.boundaries.includes(context.boundary)) {
    updates.boundaries = [...state.boundaries, context.boundary];
  }

  // Track first conversation milestone
  if (state.conversationCount === 0 && !state.milestonesReached.includes('first_conversation')) {
    updates.milestonesReached = [
      ...(updates.milestonesReached || state.milestonesReached),
      'first_conversation',
    ];
    updates.lastMilestoneDate = new Date().toISOString();
  }

  // Update engagement level
  updates.engagementLevel = calculateEngagementLevel(state, updates);

  await updateOnboardingState(userId, updates);
  log.debug(
    { userId, conversationCount: updates.conversationCount || state.conversationCount },
    'Recorded conversation'
  );
}

/**
 * Calculate engagement level based on activity
 */
function calculateEngagementLevel(
  state: OnboardingState,
  updates: Partial<OnboardingState>
): EngagementLevel {
  const lastConvo = updates.lastConversationDate || state.lastConversationDate;
  const daysSinceLastConvo = lastConvo
    ? Math.floor((Date.now() - new Date(lastConvo).getTime()) / (24 * 60 * 60 * 1000))
    : state.daysSinceSignup;

  const convoCount = updates.conversationCount ?? state.conversationCount;
  const avgConvosPerDay = convoCount / Math.max(1, state.daysSinceSignup);

  if (daysSinceLastConvo >= 5) return 'silent';
  if (daysSinceLastConvo >= 3 || avgConvosPerDay < 0.3) return 'low';
  if (avgConvosPerDay >= 1) return 'high';
  return 'medium';
}

// ============================================================================
// CHECK-IN SCHEDULING
// ============================================================================

/**
 * Get pending check-ins for a user
 *
 * Evaluates the onboarding state and generates personalized check-ins
 * using LLM content generation.
 */
export async function getPendingCheckIns(
  userId: string,
  channel: 'sms' | 'email' | 'voice_call' | 'push' | 'in_app' = 'in_app'
): Promise<ScheduledCheckIn[]> {
  const state = await getOnboardingState(userId);
  if (!state || state.arcComplete) return [];

  // Update days since signup
  const daysSinceSignup = Math.floor(
    (Date.now() - new Date(state.signupDate).getTime()) / (24 * 60 * 60 * 1000)
  );

  // Check if arc should be complete
  if (daysSinceSignup > 14) {
    await markArcComplete(userId);
    return [];
  }

  const pendingCheckIns: ScheduledCheckIn[] = [];
  const sentTypes = new Set(state.checkInsSent.map((c) => c.type));

  // Determine which check-in is appropriate
  const checkInType = determineCheckInType(daysSinceSignup, state, sentTypes);
  if (!checkInType) return [];

  // Build user context for LLM
  const userContext: UserContext = {
    userId,
    name: state.name,
    daysSinceSignup,
    conversationCount: state.conversationCount,
    lastConversationDate: state.lastConversationDate
      ? new Date(state.lastConversationDate)
      : undefined,
    engagementLevel: state.engagementLevel,
    primaryConcerns: state.primaryConcerns,
    recentTopics: state.recentTopics,
    milestonesReached: state.milestonesReached,
    lastMood: state.lastMood,
    emotionalPatterns: state.emotionalPatterns,
    boundaries: state.boundaries,
    upcomingEvents: state.upcomingEvents.map((e) => ({ event: e.event, date: new Date(e.date) })),
    preferredPersona: state.preferredPersona,
  };

  try {
    // Generate personalized content using LLM
    const content = await generatePersonalizedContent(userContext, checkInType.type, channel);

    const checkIn: ScheduledCheckIn = {
      id: `onboarding_${userId}_${checkInType.type}_${Date.now()}`,
      userId,
      type: checkInType.type,
      scheduledFor: getOptimalSendTime(state),
      channel,
      content: {
        text: content.text,
        ssml: content.ssml,
        subject: content.subject,
        htmlBody: content.htmlBody,
      },
      personaId: content.personaId,
      reason: content.reason,
      priority: checkInType.priority,
    };

    pendingCheckIns.push(checkIn);

    log.info(
      {
        userId,
        type: checkInType.type,
        day: daysSinceSignup,
        channel,
      },
      'Generated onboarding check-in'
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate onboarding check-in');
  }

  return pendingCheckIns;
}

/**
 * Determine which check-in type is appropriate based on day and state
 */
function determineCheckInType(
  day: number,
  state: OnboardingState,
  sentTypes: Set<OutreachType>
): { type: OutreachType; priority: 'high' | 'medium' | 'low' } | null {
  // Check-in schedule with conditions
  const schedule: Array<{
    type: OutreachType;
    dayRange: [number, number];
    priority: 'high' | 'medium' | 'low';
    condition?: (s: OnboardingState) => boolean;
  }> = [
    {
      type: 'welcome_followup',
      dayRange: [1, 1],
      priority: 'high',
      condition: (s) => s.conversationCount >= 1,
    },
    {
      type: 'next_day_check',
      dayRange: [2, 2],
      priority: 'medium',
    },
    {
      type: 'topic_deepdive',
      dayRange: [3, 5],
      priority: 'medium',
      condition: (s) => s.primaryConcerns.length > 0,
    },
    {
      type: 'habit_nudge',
      dayRange: [4, 14],
      priority: 'low',
      condition: (s) => s.engagementLevel === 'low' || s.engagementLevel === 'silent',
    },
    {
      type: 'first_week_reflection',
      dayRange: [6, 8],
      priority: 'high',
    },
    {
      type: 'momentum_check',
      dayRange: [9, 12],
      priority: 'medium',
      condition: (s) => s.engagementLevel !== 'silent',
    },
    {
      type: 'two_week_celebration',
      dayRange: [13, 15],
      priority: 'high',
    },
    {
      type: 'win_celebration',
      dayRange: [1, 14],
      priority: 'high',
      condition: (s) => s.milestonesReached.includes('explored_topic'),
    },
  ];

  for (const item of schedule) {
    // Skip if already sent
    if (sentTypes.has(item.type)) continue;

    // Check day range
    const [minDay, maxDay] = item.dayRange;
    if (day < minDay || day > maxDay) continue;

    // Check condition
    if (item.condition && !item.condition(state)) continue;

    // Skip habit nudge if engagement is good
    if (item.type === 'habit_nudge' && state.engagementLevel === 'high') continue;

    return { type: item.type, priority: item.priority };
  }

  return null;
}

/**
 * Get optimal send time based on user patterns
 */
function getOptimalSendTime(state: OnboardingState): Date {
  // Default to 2 hours from now, within business hours
  const now = new Date();
  const sendTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Adjust to business hours (9 AM - 8 PM)
  const hours = sendTime.getHours();
  if (hours < 9) {
    sendTime.setHours(9, 0, 0, 0);
  } else if (hours >= 20) {
    sendTime.setDate(sendTime.getDate() + 1);
    sendTime.setHours(10, 0, 0, 0);
  }

  // If we have conversation history, prefer similar times
  if (state.lastConversationDate) {
    const lastConvoTime = new Date(state.lastConversationDate);
    const lastHour = lastConvoTime.getHours();

    // If they usually engage in the evening, schedule for evening
    if (lastHour >= 17 && lastHour < 21) {
      sendTime.setHours(18, 0, 0, 0);
    }
    // If they usually engage in the morning, schedule for morning
    else if (lastHour >= 6 && lastHour < 11) {
      sendTime.setHours(9, 0, 0, 0);
    }
  }

  return sendTime;
}

// ============================================================================
// CHECK-IN RECORDING
// ============================================================================

/**
 * Record that a check-in was sent
 */
export async function recordCheckInSent(
  userId: string,
  type: OutreachType,
  channel: string
): Promise<void> {
  const state = await getOnboardingState(userId);
  if (!state) return;

  const checkIn = {
    type,
    sentAt: new Date().toISOString(),
    channel,
    responded: false,
  };

  await updateOnboardingState(userId, {
    checkInsSent: [...state.checkInsSent, checkIn],
  });

  log.info({ userId, type, channel }, 'Recorded onboarding check-in sent');
}

/**
 * Record that user responded to a check-in
 */
export async function recordCheckInResponse(userId: string): Promise<void> {
  const state = await getOnboardingState(userId);
  if (!state || state.checkInsSent.length === 0) return;

  // Mark the most recent check-in as responded
  const checkInsSent = [...state.checkInsSent];
  checkInsSent[checkInsSent.length - 1].responded = true;

  await updateOnboardingState(userId, { checkInsSent });
}

/**
 * Mark arc as complete
 */
async function markArcComplete(userId: string): Promise<void> {
  await updateOnboardingState(userId, {
    arcComplete: true,
    arcCompletedAt: new Date().toISOString(),
    milestonesReached: ['signup', 'first_conversation', 'first_week', 'second_week'],
  });

  log.info({ userId }, 'Onboarding arc completed');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user is in onboarding period
 */
export async function isInOnboardingPeriod(userId: string): Promise<boolean> {
  const state = await getOnboardingState(userId);
  if (!state) return false;
  return !state.arcComplete && state.daysSinceSignup <= 14;
}

/**
 * Get onboarding progress summary
 */
export async function getOnboardingProgress(userId: string): Promise<{
  daysSinceSignup: number;
  milestonesReached: number;
  checkInsSent: number;
  engagementLevel: EngagementLevel;
  arcComplete: boolean;
} | null> {
  const state = await getOnboardingState(userId);
  if (!state) return null;

  return {
    daysSinceSignup: state.daysSinceSignup,
    milestonesReached: state.milestonesReached.length,
    checkInsSent: state.checkInsSent.length,
    engagementLevel: state.engagementLevel,
    arcComplete: state.arcComplete,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const intelligentOnboardingArc = {
  initialize: initializeOnboarding,
  getState: getOnboardingState,
  updateState: updateOnboardingState,
  recordConversation,
  getPendingCheckIns,
  recordCheckInSent,
  recordCheckInResponse,
  isInOnboarding: isInOnboardingPeriod,
  getProgress: getOnboardingProgress,
};

export default intelligentOnboardingArc;
