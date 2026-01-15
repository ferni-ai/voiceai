/**
 * Joy Amplification
 *
 * Phase 14: Emotional Memory Intelligence
 *
 * "Better Than Human" feature: Surface positive memories when users
 * are struggling to remind them of their strength and past joys.
 *
 * Human friends forget the good times when you're down.
 * Ferni doesn't.
 *
 * @module memory/emotional/joy-amplification
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EmotionalTag, EmotionalValence } from './emotional-tagging.js';

const log = createLogger({ module: 'JoyAmplification' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Joy amplification candidate
 */
export interface JoyMemory {
  /** Memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** Emotional tag */
  emotionalTag: EmotionalTag;
  /** When the memory was captured */
  capturedAt: Date;
  /** Relevance score for current context */
  relevanceScore: number;
  /** Attribution phrase */
  attribution?: string;
}

/**
 * Current emotional state input
 */
export interface CurrentStateInput {
  /** Detected emotion */
  emotion: string;
  /** Emotion intensity (0-1) */
  intensity: number;
  /** Valence (-1 to 1) */
  valence?: number;
  /** Arousal (0-1) */
  arousal?: number;
  /** Topic being discussed */
  topic?: string;
  /** Mentioned entities */
  mentionedEntities?: string[];
}

/**
 * Joy amplification decision
 */
export interface JoyAmplificationResult {
  /** Whether to amplify */
  shouldAmplify: boolean;
  /** Selected joy memory (if any) */
  selectedMemory?: JoyMemory;
  /** Suggested delivery phrase */
  deliveryPhrase?: string;
  /** Reason for decision */
  reason: string;
  /** Confidence in decision */
  confidence: number;
}

/**
 * Joy memory pool
 */
export interface JoyMemoryPool {
  /** User ID */
  userId: string;
  /** Available joy memories */
  memories: JoyMemory[];
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface JoyAmplificationConfig {
  /** Minimum valence threshold to trigger amplification (-1 to 0) */
  triggerValenceThreshold: number;
  /** Minimum negative emotion intensity to trigger */
  triggerIntensityThreshold: number;
  /** Minimum positive valence for joy memory selection */
  joyMemoryValenceThreshold: number;
  /** Cool-down between amplifications (minutes) */
  cooldownMinutes: number;
  /** Maximum times to surface same memory per session */
  maxMemorySurfaceCount: number;
  /** Emotions that trigger amplification */
  triggerEmotions: string[];
}

const DEFAULT_CONFIG: JoyAmplificationConfig = {
  triggerValenceThreshold: -0.4,
  triggerIntensityThreshold: 0.5,
  joyMemoryValenceThreshold: 0.5,
  cooldownMinutes: 30,
  maxMemorySurfaceCount: 2,
  triggerEmotions: [
    'sad', 'sadness', 'depressed', 'down', 'low',
    'anxious', 'worried', 'stressed', 'overwhelmed',
    'hopeless', 'helpless', 'lost', 'struggling',
    'frustrated', 'disappointed', 'discouraged',
  ],
};

let config: JoyAmplificationConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setJoyAmplificationConfig(newConfig: Partial<JoyAmplificationConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getJoyAmplificationConfig(): JoyAmplificationConfig {
  return { ...config };
}

// ============================================================================
// STATE TRACKING
// ============================================================================

/** Last amplification time by user */
const lastAmplificationByUser = new Map<string, number>();

/** Memory surface counts by session */
const memorySurfaceCounts = new Map<string, Map<string, number>>();

/**
 * Record that a joy memory was surfaced
 */
export function recordJoyMemorySurfaced(
  userId: string,
  sessionId: string,
  memoryId: string
): void {
  // Update last amplification time
  lastAmplificationByUser.set(userId, Date.now());

  // Update surface count
  const sessionKey = `${userId}_${sessionId}`;
  let sessionCounts = memorySurfaceCounts.get(sessionKey);
  if (!sessionCounts) {
    sessionCounts = new Map();
    memorySurfaceCounts.set(sessionKey, sessionCounts);
  }

  const currentCount = sessionCounts.get(memoryId) || 0;
  sessionCounts.set(memoryId, currentCount + 1);
}

/**
 * Clear surface counts for a session
 */
export function clearSessionSurfaceCounts(userId: string, sessionId: string): void {
  const sessionKey = `${userId}_${sessionId}`;
  memorySurfaceCounts.delete(sessionKey);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Decide whether to amplify joy for the current state.
 *
 * This is the main entry point for joy amplification.
 */
export function shouldAmplifyJoy(
  userId: string,
  sessionId: string,
  currentState: CurrentStateInput,
  joyPool: JoyMemoryPool
): JoyAmplificationResult {
  // 1. Check if we're in a state that could benefit from joy amplification
  const shouldTrigger = checkTriggerConditions(currentState);
  if (!shouldTrigger.shouldTrigger) {
    return {
      shouldAmplify: false,
      reason: shouldTrigger.reason,
      confidence: 0.9,
    };
  }

  // 2. Check cooldown
  const lastAmplification = lastAmplificationByUser.get(userId);
  if (lastAmplification) {
    const minutesSince = (Date.now() - lastAmplification) / (1000 * 60);
    if (minutesSince < config.cooldownMinutes) {
      return {
        shouldAmplify: false,
        reason: `Cooldown active (${Math.round(config.cooldownMinutes - minutesSince)} min remaining)`,
        confidence: 0.95,
      };
    }
  }

  // 3. Find suitable joy memory
  const selectedMemory = selectBestJoyMemory(
    userId,
    sessionId,
    joyPool.memories,
    currentState
  );

  if (!selectedMemory) {
    return {
      shouldAmplify: false,
      reason: 'No suitable joy memories found',
      confidence: 0.8,
    };
  }

  // 4. Generate delivery phrase
  const deliveryPhrase = generateDeliveryPhrase(selectedMemory, currentState);

  log.debug(
    {
      userId,
      emotion: currentState.emotion,
      selectedMemoryId: selectedMemory.id,
    },
    '✨ Joy amplification triggered'
  );

  return {
    shouldAmplify: true,
    selectedMemory,
    deliveryPhrase,
    reason: `User showing ${currentState.emotion}, surfacing positive memory`,
    confidence: 0.85,
  };
}

/**
 * Check if current state should trigger joy amplification
 */
function checkTriggerConditions(state: CurrentStateInput): {
  shouldTrigger: boolean;
  reason: string;
} {
  const emotionLower = state.emotion.toLowerCase();

  // Check if emotion is in trigger list
  const isTriggerEmotion = config.triggerEmotions.some((e) =>
    emotionLower.includes(e)
  );

  if (!isTriggerEmotion) {
    return {
      shouldTrigger: false,
      reason: `Emotion "${state.emotion}" is not a trigger emotion`,
    };
  }

  // Check intensity threshold
  if (state.intensity < config.triggerIntensityThreshold) {
    return {
      shouldTrigger: false,
      reason: `Intensity ${state.intensity} below threshold ${config.triggerIntensityThreshold}`,
    };
  }

  // Check valence threshold
  if (state.valence !== undefined && state.valence > config.triggerValenceThreshold) {
    return {
      shouldTrigger: false,
      reason: `Valence ${state.valence} above threshold ${config.triggerValenceThreshold}`,
    };
  }

  return {
    shouldTrigger: true,
    reason: 'Trigger conditions met',
  };
}

/**
 * Select the best joy memory for the current context
 */
function selectBestJoyMemory(
  userId: string,
  sessionId: string,
  memories: JoyMemory[],
  currentState: CurrentStateInput
): JoyMemory | undefined {
  if (memories.length === 0) return undefined;

  const sessionKey = `${userId}_${sessionId}`;
  const sessionCounts = memorySurfaceCounts.get(sessionKey) || new Map();

  // Filter and score memories
  const scoredMemories = memories
    .filter((m) => {
      // Must be positive
      if (m.emotionalTag.valenceScore < config.joyMemoryValenceThreshold) {
        return false;
      }

      // Check surface count
      const surfaceCount = sessionCounts.get(m.id) || 0;
      if (surfaceCount >= config.maxMemorySurfaceCount) {
        return false;
      }

      return true;
    })
    .map((m) => ({
      memory: m,
      score: calculateJoyMemoryScore(m, currentState, sessionCounts.get(m.id) || 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scoredMemories[0]?.memory;
}

/**
 * Calculate score for a joy memory
 */
function calculateJoyMemoryScore(
  memory: JoyMemory,
  currentState: CurrentStateInput,
  surfaceCount: number
): number {
  let score = memory.relevanceScore;

  // Boost for higher valence
  score += memory.emotionalTag.valenceScore * 0.2;

  // Boost for topic match
  if (currentState.topic && memory.content.toLowerCase().includes(currentState.topic.toLowerCase())) {
    score += 0.3;
  }

  // Boost for entity match
  if (currentState.mentionedEntities) {
    for (const entity of currentState.mentionedEntities) {
      if (memory.content.toLowerCase().includes(entity.toLowerCase())) {
        score += 0.2;
        break;
      }
    }
  }

  // Penalty for already surfaced
  score -= surfaceCount * 0.3;

  // Slight penalty for very old memories (prefer recent achievements)
  const daysOld = (Date.now() - memory.capturedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld > 90) {
    score -= 0.1;
  }

  return score;
}

// ============================================================================
// DELIVERY PHRASES
// ============================================================================

/**
 * Generate a natural delivery phrase for the joy memory
 */
function generateDeliveryPhrase(
  memory: JoyMemory,
  currentState: CurrentStateInput
): string {
  const emotionLower = currentState.emotion.toLowerCase();

  // Different openers for different states
  let opener: string;

  if (emotionLower.includes('sad') || emotionLower.includes('depressed')) {
    const sadOpeners = [
      "You know what I've been thinking about?",
      "Can I remind you of something?",
      "I want you to remember something...",
      "I know things feel hard right now, but remember when",
    ];
    opener = sadOpeners[Math.floor(Math.random() * sadOpeners.length)];
  } else if (emotionLower.includes('anxious') || emotionLower.includes('worried')) {
    const anxiousOpeners = [
      "You've handled hard things before.",
      "Remember when you were worried about something similar?",
      "Let me remind you of something...",
      "You're stronger than you think. Remember when",
    ];
    opener = anxiousOpeners[Math.floor(Math.random() * anxiousOpeners.length)];
  } else if (emotionLower.includes('frustrated') || emotionLower.includes('overwhelmed')) {
    const frustrationOpeners = [
      "You've pushed through before.",
      "Remember when you accomplished something you thought was impossible?",
      "I want to remind you of a time when",
      "You've got this. Remember when",
    ];
    opener = frustrationOpeners[Math.floor(Math.random() * frustrationOpeners.length)];
  } else {
    const defaultOpeners = [
      "I was just thinking about",
      "Remember when",
      "I want to remind you of",
    ];
    opener = defaultOpeners[Math.floor(Math.random() * defaultOpeners.length)];
  }

  // Build the full phrase
  if (memory.attribution) {
    return `${opener} ${memory.attribution.toLowerCase()}, ${memory.content.toLowerCase()}?`;
  }

  return `${opener} ${memory.content}`;
}

// ============================================================================
// JOY MEMORY POOL MANAGEMENT
// ============================================================================

/**
 * Build a joy memory pool from tagged memories
 */
export function buildJoyMemoryPool(
  userId: string,
  taggedMemories: Array<{
    id: string;
    content: string;
    emotionalTag: EmotionalTag;
    capturedAt: Date;
    attribution?: string;
  }>
): JoyMemoryPool {
  // Filter to positive memories
  const joyMemories: JoyMemory[] = taggedMemories
    .filter((m) => m.emotionalTag.valence === 'positive' && m.emotionalTag.valenceScore >= 0.3)
    .map((m) => ({
      id: m.id,
      content: m.content,
      emotionalTag: m.emotionalTag,
      capturedAt: m.capturedAt,
      relevanceScore: m.emotionalTag.valenceScore,
      attribution: m.attribution,
    }));

  return {
    userId,
    memories: joyMemories,
    lastUpdated: new Date(),
  };
}

/**
 * Add a new memory to the joy pool if it qualifies
 */
export function addToJoyPoolIfQualifies(
  pool: JoyMemoryPool,
  memory: {
    id: string;
    content: string;
    emotionalTag: EmotionalTag;
    capturedAt: Date;
    attribution?: string;
  }
): boolean {
  // Check if memory qualifies
  if (memory.emotionalTag.valence !== 'positive' ||
      memory.emotionalTag.valenceScore < config.joyMemoryValenceThreshold) {
    return false;
  }

  // Add to pool
  pool.memories.push({
    id: memory.id,
    content: memory.content,
    emotionalTag: memory.emotionalTag,
    capturedAt: memory.capturedAt,
    relevanceScore: memory.emotionalTag.valenceScore,
    attribution: memory.attribution,
  });

  pool.lastUpdated = new Date();

  log.debug(
    { userId: pool.userId, memoryId: memory.id },
    '💛 Memory added to joy pool'
  );

  return true;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Get joy amplification stats for observability
 */
export function getJoyAmplificationStats(): {
  usersWithRecentAmplification: number;
  activeSessionCounts: number;
  config: JoyAmplificationConfig;
} {
  // Clean up old entries
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [userId, timestamp] of lastAmplificationByUser) {
    if (timestamp < oneHourAgo) {
      lastAmplificationByUser.delete(userId);
    }
  }

  return {
    usersWithRecentAmplification: lastAmplificationByUser.size,
    activeSessionCounts: memorySurfaceCounts.size,
    config: { ...config },
  };
}
