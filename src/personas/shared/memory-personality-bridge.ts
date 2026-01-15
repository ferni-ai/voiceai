/**
 * Superhuman Memory → Personality Bridge
 *
 * "Better than human" means remembering at the RIGHT moment, in the RIGHT way.
 *
 * This module bridges the superhuman memory system with personality expressions:
 * - Proactive date callbacks ("I know this week is hard...")
 * - Topic absence detection ("You haven't mentioned X in a while...")
 * - Growth arc celebrations ("Look how far you've come!")
 * - Comfort pattern application (what helped before)
 * - Inside joke surfacing (relationship texture)
 *
 * @module personas/shared/memory-personality-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';
import type { ProactiveInsight } from '../../intelligence/superhuman-memory/index.js';

const log = createLogger({ module: 'memory-personality-bridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryCallback {
  /** Type of callback */
  type: 'date' | 'absence' | 'growth' | 'comfort' | 'inside_joke' | 'pattern';

  /** The callback content */
  content: string;

  /** Natural phrasing for conversation */
  naturalPhrase: string;

  /** Priority (high = surface soon) */
  priority: 'high' | 'medium' | 'low';

  /** Best timing to surface */
  timing: 'greeting' | 'when_relevant' | 'closing' | 'anytime';

  /** Emotional tone to use */
  tone: 'celebratory' | 'gentle' | 'curious' | 'warm' | 'supportive';

  /** Theme this maps to */
  suggestedTheme: ThemeCategory;

  /** Source insight ID */
  sourceId?: string;

  /** Whether this has been delivered */
  delivered: boolean;

  /** When this was created */
  createdAt: Date;
}

export interface MemoryPersonalityContext {
  /** Pending callbacks for this user */
  pendingCallbacks: MemoryCallback[];

  /** Recently used callbacks (avoid repetition) */
  recentlyUsed: string[];

  /** Topics the user hasn't mentioned recently */
  absentTopics: string[];

  /** Known comfort patterns */
  comfortPatterns: string[];

  /** Growth markers to celebrate */
  growthMarkers: string[];
}

// ============================================================================
// STATE
// ============================================================================

const userCallbacks = new Map<string, MemoryCallback[]>();
const recentlyDelivered = new Map<string, Set<string>>();
const DELIVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Don't repeat same callback for 24h

// ============================================================================
// CALLBACK CREATION
// ============================================================================

/**
 * Create a memory callback from a proactive insight
 */
export function createCallbackFromInsight(insight: ProactiveInsight): MemoryCallback {
  const typeMap: Record<ProactiveInsight['type'], MemoryCallback['type']> = {
    date_reminder: 'date',
    growth_celebration: 'growth',
    comfort_application: 'comfort',
    topic_absence: 'absence',
    inside_joke: 'inside_joke',
    seasonal_awareness: 'pattern',
    voice_pattern: 'pattern',
  };

  const themeMap: Record<ProactiveInsight['type'], ThemeCategory> = {
    date_reminder: 'family_life',
    growth_celebration: 'vulnerability',
    comfort_application: 'sensory_moment',
    topic_absence: 'quirky_interests',
    inside_joke: 'quirky_interests',
    seasonal_awareness: 'sensory_moment',
    voice_pattern: 'physical_habits',
  };

  return {
    type: typeMap[insight.type] || 'pattern',
    content: insight.content,
    naturalPhrase: insight.naturalPhrase,
    priority: insight.priority,
    timing: insight.context.timing,
    tone: insight.context.tone,
    suggestedTheme: themeMap[insight.type] || 'sensory',
    sourceId: insight.id,
    delivered: false,
    createdAt: new Date(),
  };
}

/**
 * Create a date-aware callback
 */
export function createDateCallback(
  dateType: string,
  dateName: string,
  daysUntil: number
): MemoryCallback {
  let naturalPhrase: string;
  let tone: MemoryCallback['tone'] = 'warm';
  let priority: MemoryCallback['priority'] = 'medium';

  if (daysUntil === 0) {
    naturalPhrase = `I know today is ${dateName}. How are you feeling about it?`;
    priority = 'high';
  } else if (daysUntil === 1) {
    naturalPhrase = `Tomorrow is ${dateName}. Is that on your mind?`;
    priority = 'high';
  } else if (daysUntil <= 7) {
    naturalPhrase = `${dateName} is coming up this week. How are you feeling as it approaches?`;
    priority = 'medium';
  } else {
    naturalPhrase = `I've been thinking about ${dateName} coming up. Want to talk about it?`;
    priority = 'low';
  }

  // Adjust tone for difficult dates
  if (dateType === 'anniversary_loss' || dateType === 'difficult') {
    tone = 'gentle';
    naturalPhrase = naturalPhrase.replace('How are you feeling', "I'm here if you want to talk");
  }

  return {
    type: 'date',
    content: `${dateName} (${daysUntil} days away)`,
    naturalPhrase,
    priority,
    timing: 'greeting',
    tone,
    suggestedTheme: 'family_life',
    delivered: false,
    createdAt: new Date(),
  };
}

/**
 * Create a topic absence callback
 */
export function createAbsenceCallback(topic: string, lastMentioned: Date): MemoryCallback {
  const daysSince = Math.floor((Date.now() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24));

  let naturalPhrase: string;
  let priority: MemoryCallback['priority'] = 'low';

  if (daysSince > 30) {
    naturalPhrase = `You know, I've been thinking... you haven't mentioned ${topic} in a while. How's that going?`;
    priority = 'medium';
  } else if (daysSince > 14) {
    naturalPhrase = `I noticed you haven't brought up ${topic} lately. Everything okay there?`;
    priority = 'low';
  } else {
    naturalPhrase = `How's ${topic} going? You mentioned it a while back.`;
    priority = 'low';
  }

  return {
    type: 'absence',
    content: `${topic} (${daysSince} days since mentioned)`,
    naturalPhrase,
    priority,
    timing: 'when_relevant',
    tone: 'curious',
    suggestedTheme: 'quirky_interests',
    delivered: false,
    createdAt: new Date(),
  };
}

/**
 * Create a growth celebration callback
 */
export function createGrowthCallback(area: string, progress: string): MemoryCallback {
  return {
    type: 'growth',
    content: `Growth in ${area}: ${progress}`,
    naturalPhrase: `You know what I've noticed? ${progress}. That's real growth.`,
    priority: 'medium',
    timing: 'when_relevant',
    tone: 'celebratory',
    suggestedTheme: 'vulnerability',
    delivered: false,
    createdAt: new Date(),
  };
}

/**
 * Create a comfort pattern callback
 */
export function createComfortCallback(pattern: string, context: string): MemoryCallback {
  return {
    type: 'comfort',
    content: `Comfort pattern: ${pattern}`,
    naturalPhrase: `Remember when ${context}? ${pattern} seemed to help then.`,
    priority: 'high',
    timing: 'when_relevant',
    tone: 'supportive',
    suggestedTheme: 'sensory_moment',
    delivered: false,
    createdAt: new Date(),
  };
}

// ============================================================================
// CALLBACK MANAGEMENT
// ============================================================================

/**
 * Add a callback for a user
 */
export function addCallback(userId: string, callback: MemoryCallback): void {
  const existing = userCallbacks.get(userId) || [];
  existing.push(callback);
  userCallbacks.set(userId, existing);

  log.debug(
    { userId, type: callback.type, priority: callback.priority },
    '📝 Memory callback added'
  );
}

/**
 * Get the best callback for current context
 */
export function getBestCallback(
  userId: string,
  currentTiming: MemoryCallback['timing'],
  currentMood?: string
): MemoryCallback | null {
  const callbacks = userCallbacks.get(userId) || [];
  const delivered = recentlyDelivered.get(userId) || new Set();

  // Filter out delivered and wrong timing
  const available = callbacks.filter((cb) => {
    if (cb.delivered) return false;
    if (cb.sourceId && delivered.has(cb.sourceId)) return false;
    if (cb.timing !== 'anytime' && cb.timing !== currentTiming) return false;
    return true;
  });

  if (available.length === 0) return null;

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  available.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // If user is distressed, prefer supportive/gentle callbacks
  if (currentMood === 'stressed' || currentMood === 'sad') {
    const supportive = available.find((cb) => cb.tone === 'supportive' || cb.tone === 'gentle');
    if (supportive) return supportive;
  }

  return available[0];
}

/**
 * Mark a callback as delivered
 */
export function markDelivered(userId: string, callback: MemoryCallback): void {
  callback.delivered = true;

  // Track in recently delivered
  const delivered = recentlyDelivered.get(userId) || new Set();
  if (callback.sourceId) {
    delivered.add(callback.sourceId);
  }
  recentlyDelivered.set(userId, delivered);

  log.debug(
    { userId, type: callback.type, content: callback.content },
    '✅ Memory callback delivered'
  );

  // Schedule cleanup of delivered set
  if (callback.sourceId) {
    setTimeout(() => {
      const current = recentlyDelivered.get(userId);
      if (current && callback.sourceId) {
        current.delete(callback.sourceId);
      }
    }, DELIVERY_COOLDOWN_MS);
  }
}

/**
 * Get pending callbacks count
 */
export function getPendingCount(userId: string): number {
  const callbacks = userCallbacks.get(userId) || [];
  return callbacks.filter((cb) => !cb.delivered).length;
}

/**
 * Clear all callbacks for a user
 */
export function clearCallbacks(userId: string): void {
  userCallbacks.delete(userId);
  recentlyDelivered.delete(userId);
}

// ============================================================================
// INTEGRATION WITH PERSONALITY SYSTEM
// ============================================================================

/**
 * Convert a memory callback to an expression-compatible format
 */
export function callbackToExpression(callback: MemoryCallback): {
  content: string;
  theme: ThemeCategory;
  timing: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
} {
  // Map callback timing to ComposedExpression timing
  const timingMap: Record<
    MemoryCallback['timing'],
    'immediate' | 'after_pause' | 'mid_response' | 'at_end'
  > = {
    greeting: 'immediate',
    when_relevant: 'mid_response',
    closing: 'at_end',
    anytime: 'mid_response',
  };

  return {
    content: callback.naturalPhrase,
    theme: callback.suggestedTheme,
    timing: timingMap[callback.timing],
  };
}

/**
 * Get memory callbacks as personality context
 */
export function getMemoryPersonalityContext(userId: string): MemoryPersonalityContext {
  const callbacks = userCallbacks.get(userId) || [];

  return {
    pendingCallbacks: callbacks.filter((cb) => !cb.delivered),
    recentlyUsed: Array.from(recentlyDelivered.get(userId) || []),
    absentTopics: callbacks
      .filter((cb) => cb.type === 'absence' && !cb.delivered)
      .map((cb) => cb.content),
    comfortPatterns: callbacks
      .filter((cb) => cb.type === 'comfort' && !cb.delivered)
      .map((cb) => cb.content),
    growthMarkers: callbacks
      .filter((cb) => cb.type === 'growth' && !cb.delivered)
      .map((cb) => cb.content),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const memoryPersonalityBridge = {
  // Callback creation
  fromInsight: createCallbackFromInsight,
  createDateCallback,
  createAbsenceCallback,
  createGrowthCallback,
  createComfortCallback,

  // Management
  add: addCallback,
  getBest: getBestCallback,
  markDelivered,
  getPendingCount,
  clear: clearCallbacks,

  // Integration
  toExpression: callbackToExpression,
  getContext: getMemoryPersonalityContext,
};

export default memoryPersonalityBridge;
