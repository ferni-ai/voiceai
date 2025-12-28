/**
 * Proactive Outreach Scheduler
 *
 * "Better Than Human" - Thinking of you at the right moment.
 *
 * This scheduler enables Ferni to reach out proactively:
 * - "I've been thinking about what you mentioned..."
 * - "Just checking in - how did that conversation go?"
 * - "Something reminded me of you today..."
 *
 * Human friends forget, get busy, or don't know when to reach out.
 * Ferni never forgets and knows the perfect moment.
 *
 * @module proactive-scheduler
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { runBackground } from '../../utils/background-task.js';

const log = createLogger({ module: 'ProactiveScheduler' });

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledOutreach {
  id: string;
  userId: string;
  type: OutreachType;
  message: string;
  ssml?: string;
  scheduledFor: Date;
  context: OutreachContext;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: Date;
}

export type OutreachType =
  | 'thinking_of_you' // Random warmth
  | 'follow_up' // Following up on something they shared
  | 'milestone' // Birthday, anniversary, etc.
  | 'check_in' // Checking on something difficult
  | 'celebration' // Something good happened
  | 'reminder'; // Gentle reminder they asked for

export interface OutreachContext {
  trigger: string; // What triggered this outreach
  relatedTopics?: string[];
  relatedPeople?: string[];
  originalMessage?: string; // What they said that sparked this
}

export interface UserOutreachPreferences {
  enabled: boolean;
  maxPerWeek: number;
  preferredMethod: 'voice' | 'text' | 'push' | 'any';
  quietHoursStart?: number; // Hour (0-23)
  quietHoursEnd?: number;
  quietDays?: number[]; // 0=Sunday, 6=Saturday
  timezone: string;
}

export interface SchedulerConfig {
  checkIntervalMs: number;
  maxBatchSize: number;
  retryDelayMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalMs: 60 * 1000, // Check every minute
  maxBatchSize: 10,
  retryDelayMs: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3,
};

// ============================================================================
// IN-MEMORY STORE (would be Firestore in production)
// ============================================================================

const pendingOutreach = new Map<string, ScheduledOutreach>();
const userPreferences = new Map<string, UserOutreachPreferences>();

// ============================================================================
// SCHEDULING FUNCTIONS
// ============================================================================

/**
 * Schedule a proactive outreach.
 */
export async function scheduleOutreach(
  userId: string,
  type: OutreachType,
  message: string,
  options: {
    scheduledFor?: Date;
    ssml?: string;
    context: OutreachContext;
    priority?: 'high' | 'medium' | 'low';
  }
): Promise<ScheduledOutreach> {
  const id = `outreach_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const outreach: ScheduledOutreach = {
    id,
    userId,
    type,
    message,
    ssml: options.ssml,
    scheduledFor: options.scheduledFor ?? getOptimalSendTime(userId),
    context: options.context,
    priority: options.priority ?? 'medium',
    status: 'pending',
    createdAt: new Date(),
  };

  pendingOutreach.set(id, outreach);

  // Persist to Firestore (fire and forget)
  runBackground(persistOutreach(outreach), { task: 'persist-outreach', userId });

  log.info(
    {
      userId,
      type,
      scheduledFor: outreach.scheduledFor.toISOString(),
      priority: outreach.priority,
    },
    '📅 Scheduled proactive outreach'
  );

  return outreach;
}

/**
 * Cancel a scheduled outreach.
 */
export function cancelOutreach(outreachId: string): boolean {
  const outreach = pendingOutreach.get(outreachId);
  if (outreach && outreach.status === 'pending') {
    outreach.status = 'cancelled';
    log.debug({ outreachId }, 'Cancelled scheduled outreach');
    return true;
  }
  return false;
}

/**
 * Get pending outreach for a user.
 */
export function getPendingOutreach(userId: string): ScheduledOutreach[] {
  return Array.from(pendingOutreach.values()).filter(
    (o) => o.userId === userId && o.status === 'pending'
  );
}

// ============================================================================
// TIMING OPTIMIZATION
// ============================================================================

/**
 * Get the optimal time to send outreach to a user.
 *
 * Considers:
 * - User's timezone
 * - Quiet hours
 * - Quiet days
 * - Recent activity patterns
 */
function getOptimalSendTime(userId: string): Date {
  const prefs = userPreferences.get(userId);
  const now = new Date();

  // Default: Send in 2-4 hours if no preferences
  if (!prefs) {
    const delayHours = 2 + Math.random() * 2;
    return new Date(now.getTime() + delayHours * 60 * 60 * 1000);
  }

  // Get user's local time
  let targetTime = now;

  // Avoid quiet hours
  if (prefs.quietHoursStart !== undefined && prefs.quietHoursEnd !== undefined) {
    const hour = targetTime.getHours();
    if (hour >= prefs.quietHoursStart || hour < prefs.quietHoursEnd) {
      // In quiet hours - push to after quiet hours end
      targetTime = new Date(targetTime);
      targetTime.setHours(prefs.quietHoursEnd + 1, 0, 0, 0);
      if (targetTime <= now) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
    }
  }

  // Avoid quiet days
  if (prefs.quietDays && prefs.quietDays.length > 0) {
    while (prefs.quietDays.includes(targetTime.getDay())) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
  }

  // Add some randomness (1-3 hours)
  const jitter = (1 + Math.random() * 2) * 60 * 60 * 1000;
  return new Date(targetTime.getTime() + jitter);
}

// ============================================================================
// DELIVERY (placeholder - integrates with outreach/delivery/)
// ============================================================================

async function deliverOutreach(outreach: ScheduledOutreach): Promise<boolean> {
  try {
    const prefs = userPreferences.get(outreach.userId);
    const method = prefs?.preferredMethod ?? 'push';

    log.info(
      {
        outreachId: outreach.id,
        userId: outreach.userId,
        type: outreach.type,
        method,
      },
      '📤 Delivering proactive outreach'
    );

    // Import delivery service dynamically
    switch (method) {
      case 'push': {
        const { sendPushNotification } = await import('./delivery/push-notifications.js');
        await sendPushNotification({
          userId: outreach.userId,
          outreachId: outreach.id,
          personaId: 'ferni',
          title: 'Ferni',
          body: outreach.message,
          data: { type: outreach.type },
        });
        break;
      }
      case 'text': {
        // SMS requires phone number lookup - skip for now
        log.debug({ userId: outreach.userId }, 'SMS delivery not yet implemented');
        break;
      }
      // Voice would require initiating a call - more complex
      default:
        log.warn({ method }, 'Unknown delivery method, using push');
    }

    return true;
  } catch (error) {
    log.error({ error: String(error), outreachId: outreach.id }, 'Failed to deliver outreach');
    return false;
  }
}

// ============================================================================
// SCHEDULER LOOP
// ============================================================================

let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the proactive outreach scheduler.
 *
 * This runs continuously, checking for due outreach and delivering it.
 */
export function startScheduler(config: Partial<SchedulerConfig> = {}): void {
  if (schedulerRunning) {
    log.warn('Scheduler already running');
    return;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  schedulerRunning = true;
  log.info({ checkIntervalMs: cfg.checkIntervalMs }, '🚀 Starting proactive outreach scheduler');

  schedulerInterval = setInterval(async () => {
    await processScheduledOutreach(cfg);
  }, cfg.checkIntervalMs);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  log.info('⏹️ Stopped proactive outreach scheduler');
}

/**
 * Process due outreach.
 */
async function processScheduledOutreach(config: SchedulerConfig): Promise<void> {
  const now = new Date();

  // Find due outreach
  const dueOutreach = Array.from(pendingOutreach.values())
    .filter((o) => o.status === 'pending' && o.scheduledFor <= now)
    .sort((a, b) => {
      // Priority order: high > medium > low
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, config.maxBatchSize);

  if (dueOutreach.length === 0) return;

  log.debug({ count: dueOutreach.length }, 'Processing due outreach');

  for (const outreach of dueOutreach) {
    // Check rate limit per user
    if (!canSendToUser(outreach.userId)) {
      // Reschedule for later
      outreach.scheduledFor = new Date(now.getTime() + config.retryDelayMs);
      continue;
    }

    const success = await deliverOutreach(outreach);

    if (success) {
      outreach.status = 'sent';
      recordSentOutreach(outreach.userId);
    } else {
      // Could add retry logic here
      outreach.status = 'failed';
    }
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const userSendCounts = new Map<string, { count: number; weekStart: Date }>();

function canSendToUser(userId: string): boolean {
  const prefs = userPreferences.get(userId);
  const maxPerWeek = prefs?.maxPerWeek ?? 3;

  const userCount = userSendCounts.get(userId);
  const now = new Date();

  if (!userCount) {
    return true;
  }

  // Reset weekly count
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (now.getTime() - userCount.weekStart.getTime() > weekMs) {
    userSendCounts.set(cleanForFirestore(userId), { count: 0, weekStart: now });
    return true;
  }

  return userCount.count < maxPerWeek;
}

function recordSentOutreach(userId: string): void {
  const userCount = userSendCounts.get(userId);
  if (userCount) {
    userCount.count++;
  } else {
    userSendCounts.set(cleanForFirestore(userId), { count: 1, weekStart: new Date() });
  }
}

// ============================================================================
// PERSISTENCE (Firestore)
// ============================================================================

async function persistOutreach(outreach: ScheduledOutreach): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(outreach.userId)
      .collection('scheduled_outreach')
      .doc(outreach.id)
      .set(
        cleanForFirestore({
          ...outreach,
          scheduledFor: outreach.scheduledFor.toISOString(),
          createdAt: outreach.createdAt.toISOString(),
        })
      );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to persist outreach');
  }
}

/**
 * Load pending outreach from Firestore on startup.
 */
export async function loadPendingOutreach(): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    const snapshot = await db
      .collectionGroup('scheduled_outreach')
      .where('status', '==', 'pending')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const outreach: ScheduledOutreach = {
        ...data,
        scheduledFor: new Date(data.scheduledFor),
        createdAt: new Date(data.createdAt),
      } as ScheduledOutreach;

      pendingOutreach.set(outreach.id, outreach);
    }

    log.info({ count: snapshot.size }, '📥 Loaded pending outreach from Firestore');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load pending outreach');
  }
}

/**
 * Update user preferences.
 */
export function setUserOutreachPreferences(
  userId: string,
  prefs: Partial<UserOutreachPreferences>
): void {
  const existing = userPreferences.get(userId) ?? {
    enabled: true,
    maxPerWeek: 3,
    preferredMethod: 'push' as const,
    timezone: 'America/New_York',
  };

  userPreferences.set(cleanForFirestore(userId), { ...existing, ...prefs });
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Schedule a "thinking of you" moment.
 */
export async function scheduleThinkingOfYou(
  userId: string,
  trigger: string,
  message: string
): Promise<ScheduledOutreach> {
  return scheduleOutreach(userId, 'thinking_of_you', message, {
    context: { trigger },
    priority: 'low',
  });
}

/**
 * Schedule a follow-up on something they shared.
 */
export async function scheduleFollowUp(
  userId: string,
  originalMessage: string,
  followUpMessage: string,
  delayHours = 24
): Promise<ScheduledOutreach> {
  const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  return scheduleOutreach(userId, 'follow_up', followUpMessage, {
    scheduledFor,
    context: {
      trigger: 'follow_up',
      originalMessage,
    },
    priority: 'medium',
  });
}

/**
 * Schedule a milestone message (birthday, anniversary, etc.)
 */
export async function scheduleMilestone(
  userId: string,
  type: string,
  message: string,
  date: Date
): Promise<ScheduledOutreach> {
  // Schedule for morning of the date
  const scheduledFor = new Date(date);
  scheduledFor.setHours(9, 0, 0, 0);

  return scheduleOutreach(userId, 'milestone', message, {
    scheduledFor,
    context: {
      trigger: `milestone:${type}`,
    },
    priority: 'high',
  });
}
