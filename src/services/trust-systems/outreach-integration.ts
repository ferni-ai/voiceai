/**
 * Proactive Outreach Integration
 *
 * Connects the "thinking of you" system to the actual outreach execution.
 * This makes proactive check-ins actually happen.
 *
 * Philosophy: The best check-ins feel like they came from a friend who
 * genuinely was thinking about you - not a scheduled notification.
 *
 * @module OutreachIntegration
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDueMoments,
  markMomentSent,
  generateThinkingOfYouMoments,
  generateRandomWarmth,
  type ThinkingOfYouMoment,
} from './thinking-of-you.js';

import {
  getUncelebratedWins,
  generateCelebration,
  recordCelebrationResponse,
  type CelebrationOpportunity,
} from './small-wins.js';

import {
  getUnreflectedGrowth,
  generateGrowthReflection,
  type GrowthReflection,
} from './growth-reflection.js';

const log = createLogger({ module: 'OutreachIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachItem {
  id: string;
  userId: string;
  type: 'thinking_of_you' | 'celebration' | 'growth_reflection';
  priority: 'high' | 'medium' | 'low';
  message: string;
  ssml: string;
  scheduledFor: Date;
  metadata: Record<string, unknown>;
}

export interface OutreachResult {
  success: boolean;
  itemId: string;
  method: 'voice' | 'sms' | 'push';
  sentAt?: Date;
  error?: string;
}

export interface OutreachPreferences {
  enabled: boolean;
  maxPerDay: number;
  maxPerWeek: number;
  preferredMethod: 'voice' | 'sms' | 'push' | 'any';
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "08:00"
  quietDays: string[]; // ["saturday", "sunday"]
}

// ============================================================================
// IN-MEMORY QUEUE
// ============================================================================

const outreachQueue = new Map<string, OutreachItem[]>();
const sentToday = new Map<string, number>();
const sentThisWeek = new Map<string, number>();

// Reset counters
setInterval(() => {
  // Reset daily counters at midnight
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    sentToday.clear();
    log.debug('Daily outreach counters reset');
  }
  // Reset weekly on Sunday midnight
  if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) {
    sentThisWeek.clear();
    log.debug('Weekly outreach counters reset');
  }
}, 60000);

// Default preferences
const DEFAULT_PREFERENCES: OutreachPreferences = {
  enabled: true,
  maxPerDay: 2,
  maxPerWeek: 5,
  preferredMethod: 'any',
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietDays: [],
};

const userPreferences = new Map<string, OutreachPreferences>();

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Queue a "thinking of you" moment for delivery
 */
export function queueThinkingOfYou(
  userId: string,
  moment: ThinkingOfYouMoment
): OutreachItem {
  const item: OutreachItem = {
    id: moment.id,
    userId,
    type: 'thinking_of_you',
    priority: moment.priority,
    message: moment.message,
    ssml: moment.ssml,
    scheduledFor: moment.suggestedTiming,
    metadata: {
      triggerType: moment.trigger.type,
      triggerContext: moment.trigger.context,
    },
  };

  const userQueue = outreachQueue.get(userId) || [];
  userQueue.push(item);
  outreachQueue.set(userId, userQueue);

  log.debug({ userId, itemId: item.id, type: moment.type }, '📬 Queued outreach');

  return item;
}

/**
 * Queue a celebration for delivery
 */
export function queueCelebration(
  userId: string,
  celebration: CelebrationOpportunity
): OutreachItem {
  const item: OutreachItem = {
    id: celebration.win.id,
    userId,
    type: 'celebration',
    priority: celebration.intensity === 'big' ? 'high' : 'medium',
    message: celebration.celebration,
    ssml: celebration.ssml,
    scheduledFor: new Date(), // Celebrations happen ASAP
    metadata: {
      winType: celebration.win.type,
      winDescription: celebration.win.description,
    },
  };

  const userQueue = outreachQueue.get(userId) || [];
  userQueue.push(item);
  outreachQueue.set(userId, userQueue);

  return item;
}

/**
 * Queue a growth reflection for delivery
 */
export function queueGrowthReflection(
  userId: string,
  reflection: GrowthReflection
): OutreachItem {
  const item: OutreachItem = {
    id: reflection.pattern.id,
    userId,
    type: 'growth_reflection',
    priority: reflection.pattern.significance === 'transformative' ? 'high' : 'medium',
    message: reflection.reflection,
    ssml: reflection.ssml,
    scheduledFor:
      reflection.timing === 'now'
        ? new Date()
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
    metadata: {
      patternType: reflection.pattern.type,
      significance: reflection.pattern.significance,
    },
  };

  const userQueue = outreachQueue.get(userId) || [];
  userQueue.push(item);
  outreachQueue.set(userId, userQueue);

  return item;
}

// ============================================================================
// DELIVERY LOGIC
// ============================================================================

/**
 * Get items ready for delivery
 */
export function getDueItems(userId: string): OutreachItem[] {
  const queue = outreachQueue.get(userId) || [];
  const now = new Date();

  return queue
    .filter((item) => item.scheduledFor <= now)
    .sort((a, b) => {
      // Sort by priority, then by scheduled time
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
}

/**
 * Check if we can send outreach right now
 */
export function canSendOutreach(userId: string): {
  allowed: boolean;
  reason?: string;
} {
  const prefs = userPreferences.get(userId) || DEFAULT_PREFERENCES;

  if (!prefs.enabled) {
    return { allowed: false, reason: 'Outreach disabled for user' };
  }

  // Check daily limit
  const todayCount = sentToday.get(userId) || 0;
  if (todayCount >= prefs.maxPerDay) {
    return { allowed: false, reason: 'Daily limit reached' };
  }

  // Check weekly limit
  const weekCount = sentThisWeek.get(userId) || 0;
  if (weekCount >= prefs.maxPerWeek) {
    return { allowed: false, reason: 'Weekly limit reached' };
  }

  // Check quiet hours
  if (isQuietTime(prefs)) {
    return { allowed: false, reason: 'Quiet hours' };
  }

  // Check quiet days
  const today = new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();
  if (prefs.quietDays.includes(today)) {
    return { allowed: false, reason: 'Quiet day' };
  }

  return { allowed: true };
}

/**
 * Check if current time is in quiet hours
 */
function isQuietTime(prefs: OutreachPreferences): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = prefs.quietHoursStart.split(':').map(Number);
  const [endHour, endMin] = prefs.quietHoursEnd.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Execute outreach delivery
 */
export async function executeOutreach(
  item: OutreachItem,
  method: 'voice' | 'sms' | 'push' = 'sms'
): Promise<OutreachResult> {
  const { allowed, reason } = canSendOutreach(item.userId);

  if (!allowed) {
    log.debug({ userId: item.userId, reason }, 'Outreach blocked');
    return {
      success: false,
      itemId: item.id,
      method,
      error: reason,
    };
  }

  try {
    // Actually send the message
    // This would integrate with your existing outreach infrastructure
    const sent = await sendMessage(item, method);

    if (sent) {
      // Update counters
      sentToday.set(item.userId, (sentToday.get(item.userId) || 0) + 1);
      sentThisWeek.set(item.userId, (sentThisWeek.get(item.userId) || 0) + 1);

      // Remove from queue
      const queue = outreachQueue.get(item.userId) || [];
      outreachQueue.set(
        item.userId,
        queue.filter((i) => i.id !== item.id)
      );

      // Mark as sent in thinking-of-you system
      if (item.type === 'thinking_of_you') {
        markMomentSent(item.userId, item.id);
      }

      log.info(
        { userId: item.userId, itemId: item.id, type: item.type, method },
        '💌 Outreach sent'
      );

      return {
        success: true,
        itemId: item.id,
        method,
        sentAt: new Date(),
      };
    }

    return {
      success: false,
      itemId: item.id,
      method,
      error: 'Send failed',
    };
  } catch (error) {
    log.error({ error, userId: item.userId, itemId: item.id }, 'Outreach failed');
    return {
      success: false,
      itemId: item.id,
      method,
      error: String(error),
    };
  }
}

/**
 * Send message via appropriate channel
 */
async function sendMessage(
  item: OutreachItem,
  method: 'voice' | 'sms' | 'push'
): Promise<boolean> {
  // This is a placeholder - integrate with your actual outreach system
  // Options:
  // 1. SMS via Twilio
  // 2. Push notification via Firebase
  // 3. Voice call via LiveKit

  log.debug(
    {
      userId: item.userId,
      method,
      message: item.message.slice(0, 50),
    },
    '📤 Would send message (placeholder)'
  );

  // For now, return true to simulate success
  // In production, this would call:
  // - twilioClient.messages.create() for SMS
  // - admin.messaging().send() for push
  // - livekit outbound call for voice

  return true;
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

/**
 * Generate all outreach opportunities for a user
 */
export function generateOutreachOpportunities(userId: string): {
  thinkingOfYou: ThinkingOfYouMoment[];
  celebrations: CelebrationOpportunity[];
  growthReflections: GrowthReflection[];
} {
  // Generate thinking of you moments
  const thinkingOfYou = generateThinkingOfYouMoments(userId);

  // Maybe add random warmth
  if (thinkingOfYou.length === 0 && Math.random() < 0.1) {
    const warmth = generateRandomWarmth(userId);
    if (warmth) {
      thinkingOfYou.push(warmth);
    }
  }

  // Get celebrations
  const uncelebratedWins = getUncelebratedWins(userId);
  const celebrations: CelebrationOpportunity[] = [];
  for (const win of uncelebratedWins.slice(0, 2)) {
    const celebration = generateCelebration(userId, win);
    if (celebration) {
      celebrations.push(celebration);
    }
  }

  // Get growth reflections
  const unreflectedGrowth = getUnreflectedGrowth(userId);
  const growthReflections: GrowthReflection[] = [];
  for (const pattern of unreflectedGrowth.slice(0, 1)) {
    const reflection = generateGrowthReflection(userId);
    if (reflection) {
      growthReflections.push(reflection);
    }
  }

  return { thinkingOfYou, celebrations, growthReflections };
}

/**
 * Process all due outreach for a user
 */
export async function processUserOutreach(userId: string): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const dueItems = getDueItems(userId);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of dueItems) {
    const { allowed } = canSendOutreach(userId);
    if (!allowed) {
      skipped++;
      continue;
    }

    const prefs = userPreferences.get(userId) || DEFAULT_PREFERENCES;
    const method =
      prefs.preferredMethod === 'any' ? 'sms' : prefs.preferredMethod;

    const result = await executeOutreach(item, method as 'voice' | 'sms' | 'push');
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, skipped, failed };
}

// ============================================================================
// PREFERENCES MANAGEMENT
// ============================================================================

/**
 * Update user outreach preferences
 */
export function setUserPreferences(
  userId: string,
  prefs: Partial<OutreachPreferences>
): void {
  const current = userPreferences.get(userId) || DEFAULT_PREFERENCES;
  userPreferences.set(userId, { ...current, ...prefs });
}

/**
 * Get user outreach preferences
 */
export function getUserPreferences(userId: string): OutreachPreferences {
  return userPreferences.get(userId) || DEFAULT_PREFERENCES;
}

/**
 * Disable outreach for a user
 */
export function disableOutreach(userId: string): void {
  const current = userPreferences.get(userId) || DEFAULT_PREFERENCES;
  userPreferences.set(userId, { ...current, enabled: false });
  log.info({ userId }, 'Outreach disabled');
}

/**
 * Enable outreach for a user
 */
export function enableOutreach(userId: string): void {
  const current = userPreferences.get(userId) || DEFAULT_PREFERENCES;
  userPreferences.set(userId, { ...current, enabled: true });
  log.info({ userId }, 'Outreach enabled');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  queueThinkingOfYou,
  queueCelebration,
  queueGrowthReflection,
  getDueItems,
  canSendOutreach,
  executeOutreach,
  generateOutreachOpportunities,
  processUserOutreach,
  setUserPreferences,
  getUserPreferences,
  disableOutreach,
  enableOutreach,
};

