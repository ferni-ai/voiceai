/**
 * Outreach Intelligence Service
 *
 * Predicts when and why agents should proactively reach out to users.
 *
 * TRIGGERS:
 * 1. Commitments - "I'll work out tomorrow" → check-in next evening
 * 2. Goals - Progress milestones, streaks at risk, celebrations
 * 3. Patterns - User hasn't engaged in X days (re-engagement)
 * 4. Life Events - Upcoming appointments, deadlines, birthdays
 * 5. Emotional - Detected stress/struggle → supportive check-in
 * 6. Follow-ups - Explicit "remind me about X" or implicit needs
 *
 * LEARNS:
 * - Best times to reach user (response patterns)
 * - Preferred contact method (SMS vs email vs call)
 * - Engagement patterns (daily, weekly, sporadic)
 * - Topics that resonate (what they respond to)
 *
 * PERSISTENCE: All outreach data persists to Firestore via the unified
 * persistence layer to survive server restarts.
 */

import { getLogger } from '../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from './persistence/index.js';
import {
  scheduleText,
  scheduleEmail,
  scheduleCall,
  getUserContactInfo,
  setUserContactInfo,
} from './outreach/user-contact.js';
import { AgentRole } from '../personas/index.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

// ============================================================================
// TYPES
// ============================================================================

export type OutreachTrigger =
  | 'commitment_check' // User said they'd do something
  | 'goal_milestone' // Progress toward a goal
  | 'streak_at_risk' // About to break a streak
  | 'celebration' // Achievement unlocked
  | 'reengagement' // Haven't heard from user
  | 'life_event' // Appointment/deadline approaching
  | 'emotional_support' // Detected stress/struggle
  | 'follow_up' // Explicit follow-up request
  | 'accountability' // Agreed accountability check
  | 'insight' // AI noticed something helpful
  | 'scheduled'; // User requested specific time

export type OutreachPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface OutreachOpportunity {
  id: string;
  userId: string;
  trigger: OutreachTrigger;
  priority: OutreachPriority;
  suggestedTime: Date;
  message: string;
  context: string;
  method: 'sms' | 'email' | 'call';
  agentId: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UserOutreachPreferences {
  enabled: boolean;
  preferredMethod: 'sms' | 'email' | 'call';
  preferredTimes: {
    morning: boolean; // 7-11am
    afternoon: boolean; // 11am-5pm
    evening: boolean; // 5-9pm
    night: boolean; // 9pm-7am (usually off)
  };
  timezone: string;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
  maxPerDay: number;
  maxPerWeek: number;
  enabledTriggers: OutreachTrigger[];
}

export interface Commitment {
  id: string;
  userId: string;
  what: string; // "work out", "call mom", "apply to 3 jobs"
  when: Date; // When they said they'd do it
  checkInTime: Date; // When to check in
  status: 'pending' | 'completed' | 'missed' | 'rescheduled';
  context?: string; // Why this matters to them
  extractedFrom?: string; // The conversation snippet
}

export interface EngagementPattern {
  userId: string;
  lastInteraction: Date;
  averageGapDays: number;
  preferredDayOfWeek: number[]; // 0=Sun, 6=Sat
  preferredHourOfDay: number[]; // 0-23
  responseRateByMethod: {
    sms: number;
    email: number;
    call: number;
  };
  topicsEngaged: string[];
}

// ============================================================================
// STORAGE (In-memory caches backed by Firestore persistence)
// ============================================================================

const commitmentStore = new Map<string, Commitment[]>();
const opportunityStore = new Map<string, OutreachOpportunity[]>();
const preferencesStore = new Map<string, UserOutreachPreferences>();
const engagementStore = new Map<string, EngagementPattern>();
const sentOutreachLog = new Map<string, Array<{ date: Date; trigger: OutreachTrigger }>>();

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface OutreachUserData {
  commitments: Commitment[];
  opportunities: OutreachOpportunity[];
  preferences: UserOutreachPreferences;
  engagement: EngagementPattern | null;
  sentLog: Array<{ date: string; trigger: OutreachTrigger }>;
  updatedAt: string;
}

// ============================================================================
// PERSISTENCE STORES
// ============================================================================

let persistenceStore: PersistenceStore<OutreachUserData> | null = null;
let isInitialized = false;

/**
 * Initialize persistence for outreach intelligence
 */
export async function initializeOutreachPersistence(): Promise<void> {
  if (isInitialized) return;

  persistenceStore = createPersistenceStore<OutreachUserData>({
    collection: 'outreach_data',
    syncIntervalMs: 10000, // Sync every 10 seconds
    maxPendingChanges: 30,
  });

  // Register with SessionDataManager
  try {
    const { getSessionDataManager } = await import('./session-data-manager.js');
    getSessionDataManager().registerService({
      name: 'OutreachIntelligence',
      clearUserData: clearUserOutreachData,
      clearAllData: clearAllOutreachData,
      getStats: () => {
        const stats = getOutreachMemoryStats();
        return {
          users: stats.totalUsers,
          entries: stats.commitments + stats.opportunities + stats.sentLogs,
        };
      },
    });
  } catch {
    // SessionDataManager may not be initialized yet
    getLogger().debug('SessionDataManager not available for OutreachIntelligence registration');
  }

  isInitialized = true;
  getLogger().info('Outreach intelligence persistence initialized');
}

/**
 * Load user's outreach data from persistence
 */
async function loadUserData(userId: string): Promise<void> {
  if (!persistenceStore) return;

  try {
    const data = await persistenceStore.load(userId);
    if (!data) return;

    // Rehydrate commitments
    if (data.commitments?.length > 0) {
      commitmentStore.set(
        userId,
        data.commitments.map((c) => ({
          ...c,
          when: new Date(c.when),
          checkInTime: new Date(c.checkInTime),
        }))
      );
    }

    // Rehydrate opportunities
    if (data.opportunities?.length > 0) {
      opportunityStore.set(
        userId,
        data.opportunities.map((o) => ({
          ...o,
          suggestedTime: new Date(o.suggestedTime),
          expiresAt: o.expiresAt ? new Date(o.expiresAt) : undefined,
        }))
      );
    }

    // Rehydrate preferences
    if (data.preferences) {
      preferencesStore.set(userId, data.preferences);
    }

    // Rehydrate engagement
    if (data.engagement) {
      engagementStore.set(cleanForFirestore(userId), {
        ...data.engagement,
        lastInteraction: new Date(data.engagement.lastInteraction),
      });
    }

    // Rehydrate sent log
    if (data.sentLog?.length > 0) {
      sentOutreachLog.set(
        userId,
        data.sentLog.map((l) => ({
          date: new Date(l.date),
          trigger: l.trigger,
        }))
      );
    }

    getLogger().debug({ userId }, 'Loaded outreach data from persistence');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load outreach data');
  }
}

/**
 * Persist user's outreach data to Firestore
 */
function persistUserData(userId: string): void {
  if (!persistenceStore) return;

  const data: OutreachUserData = {
    commitments: commitmentStore.get(userId) || [],
    opportunities: opportunityStore.get(userId) || [],
    preferences: preferencesStore.get(userId) || DEFAULT_PREFERENCES,
    engagement: engagementStore.get(userId) || null,
    sentLog: (sentOutreachLog.get(userId) || []).map((l) => ({
      date: l.date.toISOString(),
      trigger: l.trigger,
    })),
    updatedAt: new Date().toISOString(),
  };

  persistenceStore.set(userId, data);
}

/**
 * Shutdown outreach persistence (flush all pending data)
 */
export async function shutdownOutreachPersistence(): Promise<void> {
  if (persistenceStore) {
    await persistenceStore.flush();
    getLogger().info('Outreach intelligence persistence shutdown complete');
  }
}

// ============================================================================
// CLEANUP FUNCTIONS (Prevent Memory Leaks)
// ============================================================================

/**
 * Clear all outreach data for a specific user.
 * Call this when a user session ends or user is deleted.
 */
export async function clearUserOutreachData(userId: string): Promise<void> {
  commitmentStore.delete(userId);
  opportunityStore.delete(userId);
  preferencesStore.delete(userId);
  engagementStore.delete(userId);
  sentOutreachLog.delete(userId);

  // Also clear from persistence
  if (persistenceStore) {
    await persistenceStore.delete(userId);
  }

  getLogger().debug({ userId }, 'Cleared outreach data for user');
}

/**
 * Clear all outreach data for all users.
 * Useful for testing or system reset.
 */
export function clearAllOutreachData(): void {
  commitmentStore.clear();
  opportunityStore.clear();
  preferencesStore.clear();
  engagementStore.clear();
  sentOutreachLog.clear();

  // Also clear persistence caches
  persistenceStore?.clearAllCaches();

  getLogger().info('Cleared all outreach data');
}

/**
 * Prune expired/stale data to prevent memory growth.
 * Call this periodically (e.g., daily) to clean up old data.
 *
 * @param maxAgeDays - Maximum age for data to retain (default: 30 days)
 * @returns Number of items pruned
 */
export function pruneStaleOutreachData(maxAgeDays = 30): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  let prunedCount = 0;

  // Prune old commitments
  for (const [userId, commitments] of commitmentStore.entries()) {
    const fresh = commitments.filter((c) => c.checkInTime > cutoffDate || c.status === 'pending');
    if (fresh.length < commitments.length) {
      prunedCount += commitments.length - fresh.length;
      if (fresh.length === 0) {
        commitmentStore.delete(userId);
      } else {
        commitmentStore.set(userId, fresh);
      }
    }
  }

  // Prune expired opportunities
  for (const [userId, opportunities] of opportunityStore.entries()) {
    const now = new Date();
    const fresh = opportunities.filter((o) => !o.expiresAt || o.expiresAt > now);
    if (fresh.length < opportunities.length) {
      prunedCount += opportunities.length - fresh.length;
      if (fresh.length === 0) {
        opportunityStore.delete(userId);
      } else {
        opportunityStore.set(userId, fresh);
      }
    }
  }

  // Prune old outreach logs
  for (const [userId, logs] of sentOutreachLog.entries()) {
    const fresh = logs.filter((log) => log.date > cutoffDate);
    if (fresh.length < logs.length) {
      prunedCount += logs.length - fresh.length;
      if (fresh.length === 0) {
        sentOutreachLog.delete(userId);
      } else {
        sentOutreachLog.set(userId, fresh);
      }
    }
  }

  if (prunedCount > 0) {
    getLogger().info({ prunedCount, maxAgeDays }, 'Pruned stale outreach data');
  }

  return prunedCount;
}

/**
 * Get current memory usage stats for monitoring.
 */
export function getOutreachMemoryStats(): {
  commitments: number;
  opportunities: number;
  preferences: number;
  engagement: number;
  sentLogs: number;
  totalUsers: number;
} {
  const allUserIds = new Set([
    ...commitmentStore.keys(),
    ...opportunityStore.keys(),
    ...preferencesStore.keys(),
    ...engagementStore.keys(),
    ...sentOutreachLog.keys(),
  ]);

  return {
    commitments: commitmentStore.size,
    opportunities: opportunityStore.size,
    preferences: preferencesStore.size,
    engagement: engagementStore.size,
    sentLogs: sentOutreachLog.size,
    totalUsers: allUserIds.size,
  };
}

// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================

const DEFAULT_PREFERENCES: UserOutreachPreferences = {
  // OPT-OUT BY DEFAULT: Users must explicitly enable proactive outreach
  enabled: false,
  preferredMethod: 'sms',
  preferredTimes: {
    morning: true,
    afternoon: true,
    evening: true,
    night: false,
  },
  timezone: 'America/New_York',
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxPerDay: 3,
  maxPerWeek: 10,
  enabledTriggers: [
    'commitment_check',
    'goal_milestone',
    'streak_at_risk',
    'celebration',
    'follow_up',
    'accountability',
    'scheduled',
  ],
};

// ============================================================================
// COMMITMENT TRACKING
// ============================================================================

/**
 * Extract commitments from conversation text
 * Uses pattern matching to find things like:
 * - "I'll do X tomorrow"
 * - "I'm going to X this week"
 * - "I promise to X"
 * - "I need to X by Friday"
 */
export function extractCommitments(
  userId: string,
  conversationText: string,
  conversationTime: Date = new Date()
): Commitment[] {
  const commitments: Commitment[] = [];
  const lower = conversationText.toLowerCase();

  // Patterns that indicate commitments
  const commitmentPatterns = [
    // "I'll X tomorrow/today/this week" - with "and" support
    /i(?:'ll|'m going to|will|plan to|need to|have to|should|want to)\s+(.+?)\s+(tomorrow|today|tonight|this week|this weekend|next week|by \w+day|in \d+ (?:day|hour|minute)s?)/gi,
    // "X this week/tomorrow" after "and"
    /and\s+(.+?)\s+(tomorrow|today|tonight|this week|this weekend|next week)/gi,
    // "I promise to X"
    /i promise(?:d)?\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    // "My goal is to X"
    /my goal is to\s+(.+?)(?:\.|$)/gi,
    // "I commit to X"
    /i commit(?:ted)?\s+to\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of commitmentPatterns) {
    let match;
    while ((match = pattern.exec(lower)) !== null) {
      const what = match[1]?.trim();
      const when = match[2]?.trim() || 'soon';

      if (what && what.length > 3 && what.length < 100) {
        const targetTime = parseTimeReference(when, conversationTime);
        const checkInTime = calculateCheckInTime(targetTime, when);

        const commitment: Commitment = {
          id: `commit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          userId,
          what,
          when: targetTime,
          checkInTime,
          status: 'pending',
          extractedFrom: match[0],
        };

        commitments.push(commitment);

        getLogger().info(
          { userId, what, when: targetTime.toISOString(), checkIn: checkInTime.toISOString() },
          '📝 Commitment extracted'
        );
      }
    }
  }

  // Store commitments
  if (commitments.length > 0) {
    const existing = commitmentStore.get(userId) || [];
    commitmentStore.set(userId, [...existing, ...commitments]);

    // Persist to Firestore
    persistUserData(userId);
  }

  return commitments;
}

/**
 * Parse time references like "tomorrow", "this week", "by Friday"
 */
function parseTimeReference(timeRef: string, fromDate: Date): Date {
  const result = new Date(fromDate);
  const lower = timeRef.toLowerCase();

  if (lower === 'today' || lower === 'tonight') {
    // Today, evening
    result.setHours(20, 0, 0, 0);
  } else if (lower === 'tomorrow') {
    result.setDate(result.getDate() + 1);
    result.setHours(18, 0, 0, 0);
  } else if (lower === 'this week' || lower === 'this weekend') {
    // End of week
    const daysUntilFriday = (5 - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntilFriday);
    result.setHours(18, 0, 0, 0);
  } else if (lower === 'next week') {
    result.setDate(result.getDate() + 7);
    result.setHours(18, 0, 0, 0);
  } else if (lower.startsWith('by ')) {
    // "by Friday", "by Monday"
    const dayName = lower.replace('by ', '');
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayName);
    if (targetDay >= 0) {
      const daysUntil = (targetDay - result.getDay() + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);
      result.setHours(18, 0, 0, 0);
    }
  } else if (lower.startsWith('in ')) {
    // "in 2 days", "in 1 hour"
    const match = lower.match(/in (\d+) (day|hour|minute|week)s?/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 'minute':
          result.setMinutes(result.getMinutes() + amount);
          break;
        case 'hour':
          result.setHours(result.getHours() + amount);
          break;
        case 'day':
          result.setDate(result.getDate() + amount);
          break;
        case 'week':
          result.setDate(result.getDate() + amount * 7);
          break;
      }
    }
  }

  return result;
}

/**
 * Calculate when to check in based on commitment timing
 */
function calculateCheckInTime(targetTime: Date, timeRef: string): Date {
  const checkIn = new Date(targetTime);
  const lower = timeRef.toLowerCase();

  // Check in after the commitment time has passed
  if (lower === 'today' || lower === 'tonight') {
    // Check in that evening or next morning
    checkIn.setHours(checkIn.getHours() + 2);
  } else if (lower === 'tomorrow') {
    // Check in tomorrow evening
    checkIn.setHours(20, 0, 0, 0);
  } else {
    // For longer commitments, check in at the deadline
    checkIn.setHours(19, 0, 0, 0);
  }

  return checkIn;
}

// ============================================================================
// OPPORTUNITY DETECTION
// ============================================================================

/**
 * Analyze user state and generate outreach opportunities
 */
export async function detectOutreachOpportunities(
  userId: string,
  agentId: string = AgentRole.COACH
): Promise<OutreachOpportunity[]> {
  // Load from persistence if not in memory
  if (!commitmentStore.has(userId) && persistenceStore) {
    await loadUserData(userId);
  }

  const opportunities: OutreachOpportunity[] = [];
  const prefs = getPreferences(userId);
  const now = new Date();

  if (!prefs.enabled) {
    return opportunities;
  }

  // Check pending commitments
  const commitments = commitmentStore.get(userId) || [];
  for (const commitment of commitments) {
    if (commitment.status === 'pending' && commitment.checkInTime <= now) {
      if (prefs.enabledTriggers.includes('commitment_check')) {
        opportunities.push({
          id: `opp_${commitment.id}`,
          userId,
          trigger: 'commitment_check',
          priority: 'medium',
          suggestedTime: adjustForPreferences(now, prefs),
          message: `Hey! Just checking in - how did it go with ${commitment.what}? 💪`,
          context: `User committed to: ${commitment.what}`,
          method: prefs.preferredMethod,
          agentId,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          metadata: { commitmentId: commitment.id },
        });
      }
    }
  }

  // Check engagement patterns for re-engagement
  const engagement = engagementStore.get(userId);
  if (engagement && prefs.enabledTriggers.includes('reengagement')) {
    const daysSinceContact =
      (now.getTime() - engagement.lastInteraction.getTime()) / (1000 * 60 * 60 * 24);

    // If they usually engage every X days but it's been X+2 days
    if (daysSinceContact > engagement.averageGapDays + 2 && daysSinceContact > 3) {
      opportunities.push({
        id: `opp_reengage_${Date.now()}`,
        userId,
        trigger: 'reengagement',
        priority: 'low',
        suggestedTime: adjustForPreferences(now, prefs),
        message: `Hey! Haven't heard from you in a bit. How are things going? I'm here if you want to chat. 🌟`,
        context: `User hasn't engaged in ${Math.round(daysSinceContact)} days (average: ${Math.round(engagement.averageGapDays)})`,
        method: prefs.preferredMethod,
        agentId,
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      });
    }
  }

  // Store opportunities
  if (opportunities.length > 0) {
    const existing = opportunityStore.get(userId) || [];
    opportunityStore.set(userId, [...existing, ...opportunities]);
  }

  return opportunities;
}

/**
 * Detect emotional state from conversation and potentially trigger support
 */
export function detectEmotionalTriggers(
  userId: string,
  conversationText: string,
  agentId: string = AgentRole.COACH
): OutreachOpportunity | null {
  const prefs = getPreferences(userId);

  if (!prefs.enabled || !prefs.enabledTriggers.includes('emotional_support')) {
    return null;
  }

  const lower = conversationText.toLowerCase();

  // Detect struggle indicators
  const struggleIndicators = [
    'struggling',
    'stressed',
    'overwhelmed',
    'anxious',
    'worried',
    "can't sleep",
    'feeling down',
    'having a hard time',
    'difficult day',
    'really tough',
    'falling behind',
    'failing',
    'giving up',
  ];

  const hasStruggle = struggleIndicators.some((indicator) => lower.includes(indicator));

  if (hasStruggle) {
    // Schedule a supportive check-in for the next day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const opportunity: OutreachOpportunity = {
      id: `opp_emotional_${Date.now()}`,
      userId,
      trigger: 'emotional_support',
      priority: 'high',
      suggestedTime: adjustForPreferences(tomorrow, prefs),
      message: `Hey, just wanted to check in on you. I know things have been tough. How are you feeling today? Remember, I'm always here to talk. 💙`,
      context: 'User expressed struggle/stress in recent conversation',
      method: prefs.preferredMethod,
      agentId,
    };

    getLogger().info(
      { userId, trigger: 'emotional_support' },
      '💙 Emotional support outreach scheduled'
    );

    return opportunity;
  }

  return null;
}

// ============================================================================
// PREFERENCE MANAGEMENT
// ============================================================================

/**
 * Get user's outreach preferences
 */
export function getPreferences(userId: string): UserOutreachPreferences {
  return preferencesStore.get(userId) || { ...DEFAULT_PREFERENCES };
}

/**
 * Update user's outreach preferences
 */
export function setPreferences(userId: string, prefs: Partial<UserOutreachPreferences>): void {
  const existing = getPreferences(userId);
  preferencesStore.set(cleanForFirestore(userId), { ...existing, ...prefs });

  // Persist to Firestore
  persistUserData(userId);

  // Also sync timezone to contact info
  if (prefs.timezone) {
    void (async () => {
      const contact = await getUserContactInfo(userId);
      if (contact) {
        await setUserContactInfo(userId, { ...contact, timezone: prefs.timezone });
      }
    })();
  }

  getLogger().info({ userId, prefs }, '⚙️ Outreach preferences updated');
}

/**
 * Adjust time for user preferences (quiet hours, preferred times)
 */
function adjustForPreferences(time: Date, prefs: UserOutreachPreferences): Date {
  const adjusted = new Date(time);
  const hour = adjusted.getHours();

  // Check quiet hours
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    const quietStart = parseInt(prefs.quietHoursStart.split(':')[0]);
    const quietEnd = parseInt(prefs.quietHoursEnd.split(':')[0]);

    if (hour >= quietStart || hour < quietEnd) {
      // Move to after quiet hours
      adjusted.setHours(quietEnd + 1, 0, 0, 0);
      if (hour >= quietStart) {
        adjusted.setDate(adjusted.getDate() + 1);
      }
    }
  }

  // Adjust to preferred time window
  const newHour = adjusted.getHours();
  if (!prefs.preferredTimes.morning && newHour >= 7 && newHour < 11) {
    adjusted.setHours(12, 0, 0, 0); // Move to afternoon
  } else if (!prefs.preferredTimes.afternoon && newHour >= 11 && newHour < 17) {
    adjusted.setHours(18, 0, 0, 0); // Move to evening
  } else if (!prefs.preferredTimes.evening && newHour >= 17 && newHour < 21) {
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(9, 0, 0, 0); // Move to next morning
  }

  return adjusted;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if we can send another outreach to this user
 */
export function canSendOutreach(userId: string): boolean {
  const prefs = getPreferences(userId);
  const log = sentOutreachLog.get(userId) || [];
  const now = new Date();

  // Count today's outreach
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayCount = log.filter((l) => l.date >= today).length;

  if (todayCount >= prefs.maxPerDay) {
    getLogger().debug({ userId, todayCount, max: prefs.maxPerDay }, 'Daily outreach limit reached');
    return false;
  }

  // Count this week's outreach
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekCount = log.filter((l) => l.date >= weekAgo).length;

  if (weekCount >= prefs.maxPerWeek) {
    getLogger().debug(
      { userId, weekCount, max: prefs.maxPerWeek },
      'Weekly outreach limit reached'
    );
    return false;
  }

  return true;
}

/**
 * Log that we sent an outreach
 */
function logOutreach(userId: string, trigger: OutreachTrigger): void {
  const log = sentOutreachLog.get(userId) || [];
  log.push({ date: new Date(), trigger });
  sentOutreachLog.set(userId, log);

  // Persist to Firestore
  persistUserData(userId);
}

// ============================================================================
// ENGAGEMENT TRACKING
// ============================================================================

/**
 * Record user interaction to learn patterns
 */
export function recordInteraction(
  userId: string,
  interactionTime: Date = new Date(),
  respondedToOutreach = false,
  method?: 'sms' | 'email' | 'call'
): void {
  const existing = engagementStore.get(userId);

  if (existing) {
    // Update average gap
    const gap =
      (interactionTime.getTime() - existing.lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
    existing.averageGapDays = existing.averageGapDays * 0.8 + gap * 0.2; // Exponential smoothing
    existing.lastInteraction = interactionTime;

    // Track preferred times
    const hour = interactionTime.getHours();
    const day = interactionTime.getDay();
    if (!existing.preferredHourOfDay.includes(hour)) {
      existing.preferredHourOfDay.push(hour);
    }
    if (!existing.preferredDayOfWeek.includes(day)) {
      existing.preferredDayOfWeek.push(day);
    }

    // Track response rates
    if (respondedToOutreach && method) {
      existing.responseRateByMethod[method] = existing.responseRateByMethod[method] * 0.9 + 0.1;
    }

    engagementStore.set(userId, existing);
  } else {
    // First interaction
    engagementStore.set(userId, {
      userId,
      lastInteraction: interactionTime,
      averageGapDays: 1, // Start with daily assumption
      preferredDayOfWeek: [interactionTime.getDay()],
      preferredHourOfDay: [interactionTime.getHours()],
      responseRateByMethod: { sms: 0.5, email: 0.3, call: 0.2 },
      topicsEngaged: [],
    });
  }

  // Persist to Firestore
  persistUserData(userId);
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute an outreach opportunity
 */
export async function executeOutreach(
  opportunity: OutreachOpportunity
): Promise<{ success: boolean; error?: string }> {
  const { userId, method, message, trigger, suggestedTime } = opportunity;

  // Check rate limits
  if (!canSendOutreach(userId)) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  // Check if time has passed
  if (suggestedTime > new Date()) {
    // Schedule for later
    let result;
    switch (method) {
      case 'email':
        result = await scheduleEmail(
          userId,
          '💬 Check-in from Ferni',
          message,
          suggestedTime,
          opportunity.agentId
        );
        break;
      case 'call':
        result = await scheduleCall(userId, message, suggestedTime, opportunity.agentId);
        break;
      default:
        result = await scheduleText(userId, message, suggestedTime, opportunity.agentId);
    }

    if (result.success) {
      logOutreach(userId, trigger);
      getLogger().info(
        { userId, trigger, method, scheduledFor: suggestedTime },
        '📤 Outreach scheduled'
      );
    }

    return result;
  }

  // Execute immediately (using the proactive outreach functions)
  const { textUser, emailUser, callUser } =
    await import('../tools/domains/proactive/outreach/index.js');

  let result;
  switch (method) {
    case 'email':
      result = await emailUser(userId, '💬 Check-in from Ferni', message, opportunity.agentId);
      break;
    case 'call':
      result = await callUser(userId, message, opportunity.agentId);
      break;
    default:
      result = await textUser(userId, message, opportunity.agentId);
  }

  if (result.success) {
    logOutreach(userId, trigger);
    getLogger().info({ userId, trigger, method }, '📤 Outreach sent');
  }

  return result;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze a conversation and schedule any appropriate outreach
 * Call this after each conversation ends
 */
export async function analyzeConversationForOutreach(
  userId: string,
  conversationText: string,
  agentId: string = AgentRole.COACH
): Promise<{
  commitments: Commitment[];
  opportunities: OutreachOpportunity[];
  scheduled: number;
}> {
  // Record this interaction
  recordInteraction(userId);

  // Extract commitments
  const commitments = extractCommitments(userId, conversationText);

  // Detect emotional triggers
  const emotionalOpp = detectEmotionalTriggers(userId, conversationText, agentId);

  // Detect other opportunities
  const opportunities = await detectOutreachOpportunities(userId, agentId);

  if (emotionalOpp) {
    opportunities.push(emotionalOpp);
  }

  // Schedule high-priority opportunities automatically
  let scheduled = 0;
  for (const opp of opportunities) {
    if (opp.priority === 'high' || opp.priority === 'urgent') {
      const result = await executeOutreach(opp);
      if (result.success) {
        scheduled++;
      }
    }
  }

  // Schedule commitment check-ins
  for (const commitment of commitments) {
    const checkInOpp: OutreachOpportunity = {
      id: `opp_${commitment.id}`,
      userId,
      trigger: 'commitment_check',
      priority: 'medium',
      suggestedTime: commitment.checkInTime,
      message: `Hey! How did it go with ${commitment.what}? I'd love to hear about it! 💪`,
      context: `Commitment made: ${commitment.what}`,
      method: getPreferences(userId).preferredMethod,
      agentId,
    };

    const result = await executeOutreach(checkInOpp);
    if (result.success) {
      scheduled++;
    }
  }

  getLogger().info(
    { userId, commitments: commitments.length, opportunities: opportunities.length, scheduled },
    '🧠 Conversation analyzed for outreach'
  );

  return { commitments, opportunities, scheduled };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Persistence lifecycle
  initializeOutreachPersistence,
  shutdownOutreachPersistence,

  // Commitment tracking
  extractCommitments,

  // Opportunity detection
  detectOutreachOpportunities,
  detectEmotionalTriggers,

  // Preferences
  getPreferences,
  setPreferences,

  // Engagement
  recordInteraction,
  canSendOutreach,

  // Execution
  executeOutreach,

  // Main analysis
  analyzeConversationForOutreach,

  // Cleanup (prevent memory leaks)
  clearUserOutreachData,
  clearAllOutreachData,
  pruneStaleOutreachData,
  getOutreachMemoryStats,
};
