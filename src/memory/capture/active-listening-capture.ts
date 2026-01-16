/**
 * Active Listening Memory Capture
 *
 * Phase 17: Enhanced memory capture with "Better Than Human" active listening.
 *
 * Features:
 * - Incremental capture as user speaks (not just at turn end)
 * - Confirmation loops for important details
 * - Context-aware capture prioritization
 * - Real-time entity and fact extraction
 *
 * Architecture:
 * ```
 * User Speaking → Incremental Capture → Buffer
 *                       │
 *                       ▼
 *               Importance Scoring
 *                       │
 *         ┌─────────────┼─────────────┐
 *         │             │             │
 *         ▼             ▼             ▼
 *    Low Priority   Med Priority  High Priority
 *    (batch end)    (end of turn) (immediate)
 *                                      │
 *                                      ▼
 *                              Confirmation Loop?
 * ```
 *
 * @module memory/capture/active-listening-capture
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ActiveListeningCapture' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Incremental capture input (partial speech)
 */
export interface IncrementalCaptureInput {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Partial transcript */
  partialTranscript: string;
  /** Whether this is final for the turn */
  isFinal: boolean;
  /** Current turn number */
  turnNumber: number;
  /** Time since turn start (ms) */
  elapsedMs: number;
  /** Current topic context */
  topicContext?: string;
  /** Emotional context */
  emotionalContext?: {
    primary: string;
    intensity: number;
  };
}

/**
 * Capture priority levels
 */
export type CapturePriority = 'immediate' | 'end_of_turn' | 'batch_end';

/**
 * Captured item from active listening
 */
export interface CapturedItem {
  /** Item ID */
  id: string;
  /** Type of capture */
  type: CaptureType;
  /** Content */
  content: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Priority for storage */
  priority: CapturePriority;
  /** Whether to confirm with user */
  requiresConfirmation: boolean;
  /** Suggested confirmation question */
  confirmationQuestion?: string;
  /** Timestamp */
  timestamp: Date;
  /** Context */
  context?: Record<string, unknown>;
}

/**
 * Types of captured items
 */
export type CaptureType =
  | 'entity_name' // Person, place, thing
  | 'entity_relation' // Relationship between entities
  | 'fact' // Factual statement
  | 'preference' // User preference
  | 'commitment' // Something they'll do
  | 'emotion' // Emotional state
  | 'date' // Important date
  | 'correction'; // Correction to previous info

/**
 * Confirmation loop item
 */
export interface ConfirmationItem {
  /** Item ID */
  itemId: string;
  /** Question to ask */
  question: string;
  /** Priority (1-100) */
  priority: number;
  /** Expires after (ms from creation) */
  expiresAfterMs: number;
  /** Created timestamp */
  createdAt: Date;
  /** Whether it's been asked */
  asked: boolean;
  /** User response (if any) */
  response?: {
    confirmed: boolean;
    correction?: string;
    timestamp: Date;
  };
}

/**
 * Active listening session state
 */
export interface ActiveListeningState {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Items captured this session */
  capturedItems: CapturedItem[];
  /** Pending confirmations */
  pendingConfirmations: ConfirmationItem[];
  /** Items awaiting batch storage */
  storageBuffer: CapturedItem[];
  /** Running context */
  runningContext: {
    currentTopic?: string;
    mentionedEntities: string[];
    emotionalArc: Array<{ emotion: string; intensity: number; time: number }>;
  };
  /** Session started at */
  startedAt: Date;
  /** Last activity */
  lastActivity: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ActiveListeningConfig {
  /** Minimum confidence for immediate capture */
  immediateConfidenceThreshold: number;
  /** Enable confirmation loops */
  enableConfirmationLoops: boolean;
  /** Maximum pending confirmations */
  maxPendingConfirmations: number;
  /** Confirmation expiry (ms) */
  confirmationExpiryMs: number;
  /** Batch storage interval (ms) */
  batchStorageIntervalMs: number;
  /** Types that require confirmation */
  typesRequiringConfirmation: CaptureType[];
}

const DEFAULT_CONFIG: ActiveListeningConfig = {
  immediateConfidenceThreshold: 0.85,
  enableConfirmationLoops: true,
  maxPendingConfirmations: 3,
  confirmationExpiryMs: 5 * 60 * 1000, // 5 minutes
  batchStorageIntervalMs: 30 * 1000, // 30 seconds
  typesRequiringConfirmation: ['entity_name', 'date', 'commitment'],
};

let config: ActiveListeningConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setActiveListeningConfig(newConfig: Partial<ActiveListeningConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getActiveListeningConfig(): ActiveListeningConfig {
  return { ...config };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/** Active sessions by session ID */
const activeSessions = new Map<string, ActiveListeningState>();

/**
 * Initialize active listening for a session
 */
export function initActiveListening(userId: string, sessionId: string): ActiveListeningState {
  const state: ActiveListeningState = {
    sessionId,
    userId,
    capturedItems: [],
    pendingConfirmations: [],
    storageBuffer: [],
    runningContext: {
      mentionedEntities: [],
      emotionalArc: [],
    },
    startedAt: new Date(),
    lastActivity: new Date(),
  };

  activeSessions.set(sessionId, state);

  log.debug({ sessionId, userId }, '👂 Active listening initialized');

  return state;
}

/**
 * Get active listening state for a session
 */
export function getActiveListeningState(sessionId: string): ActiveListeningState | undefined {
  return activeSessions.get(sessionId);
}

/**
 * End active listening session
 */
export function endActiveListening(sessionId: string): CapturedItem[] {
  const state = activeSessions.get(sessionId);
  if (!state) return [];

  // Return all captured items for final storage
  const allItems = [...state.capturedItems, ...state.storageBuffer];

  activeSessions.delete(sessionId);

  log.debug({ sessionId, capturedCount: allItems.length }, '👂 Active listening ended');

  return allItems;
}

// ============================================================================
// INCREMENTAL CAPTURE
// ============================================================================

/**
 * Process incremental capture as user speaks.
 *
 * This is the main entry point called during speech.
 */
export function processIncrementalCapture(input: IncrementalCaptureInput): CapturedItem[] {
  let state = activeSessions.get(input.sessionId);
  if (!state) {
    state = initActiveListening(input.userId, input.sessionId);
  }

  // Update activity
  state.lastActivity = new Date();

  // Update running context
  if (input.topicContext) {
    state.runningContext.currentTopic = input.topicContext;
  }

  if (input.emotionalContext) {
    state.runningContext.emotionalArc.push({
      emotion: input.emotionalContext.primary,
      intensity: input.emotionalContext.intensity,
      time: input.elapsedMs,
    });
  }

  // Extract items from partial transcript
  const extracted = extractFromPartial(input, state);

  // Categorize by priority
  const immediate: CapturedItem[] = [];
  const endOfTurn: CapturedItem[] = [];
  const batch: CapturedItem[] = [];

  for (const item of extracted) {
    state.capturedItems.push(item);

    switch (item.priority) {
      case 'immediate':
        immediate.push(item);
        // Add to confirmation queue if needed
        if (item.requiresConfirmation && config.enableConfirmationLoops) {
          addToConfirmationQueue(state, item);
        }
        break;
      case 'end_of_turn':
        endOfTurn.push(item);
        break;
      case 'batch_end':
        batch.push(item);
        state.storageBuffer.push(item);
        break;
    }
  }

  // If final, process end-of-turn items
  if (input.isFinal) {
    immediate.push(...endOfTurn);
  }

  log.debug(
    {
      sessionId: input.sessionId,
      extractedCount: extracted.length,
      immediateCount: immediate.length,
      isFinal: input.isFinal,
    },
    '🎯 Incremental capture processed'
  );

  return immediate;
}

/**
 * Extract capturable items from partial transcript
 */
function extractFromPartial(
  input: IncrementalCaptureInput,
  state: ActiveListeningState
): CapturedItem[] {
  const items: CapturedItem[] = [];
  const text = input.partialTranscript;

  // 1. Extract entity names
  const entityItems = extractEntities(text, state);
  items.push(...entityItems);

  // 2. Extract dates
  const dateItems = extractDates(text);
  items.push(...dateItems);

  // 3. Extract commitments
  const commitmentItems = extractCommitments(text);
  items.push(...commitmentItems);

  // 4. Extract preferences
  const preferenceItems = extractPreferences(text);
  items.push(...preferenceItems);

  // 5. Extract corrections
  const correctionItems = extractCorrections(text);
  items.push(...correctionItems);

  return items;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract entity names (people, places)
 */
function extractEntities(text: string, state: ActiveListeningState): CapturedItem[] {
  const items: CapturedItem[] = [];

  // Simple pattern for names (capitalized words)
  // In production, this would use NER
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  const commonWords = new Set([
    'I',
    'The',
    'This',
    'That',
    'We',
    'They',
    'What',
    'When',
    'Where',
    'How',
    'Why',
  ]);

  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];

    // Skip common words
    if (commonWords.has(name)) continue;

    // Skip if already mentioned in this session
    if (state.runningContext.mentionedEntities.includes(name)) continue;

    // Track as mentioned
    state.runningContext.mentionedEntities.push(name);

    items.push({
      id: generateItemId(),
      type: 'entity_name',
      content: name,
      confidence: 0.7, // Would be higher with proper NER
      priority: 'end_of_turn',
      requiresConfirmation: config.typesRequiringConfirmation.includes('entity_name'),
      confirmationQuestion: `Is ${name} someone important to you?`,
      timestamp: new Date(),
      context: { extractedFrom: text.substring(0, 50) },
    });
  }

  return items;
}

/**
 * Extract dates
 */
function extractDates(text: string): CapturedItem[] {
  const items: CapturedItem[] = [];

  // Date patterns
  const patterns = [
    {
      regex: /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi,
      confidence: 0.85,
    },
    {
      regex:
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
      confidence: 0.9,
    },
    { regex: /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g, confidence: 0.85 },
    { regex: /\b(tomorrow|yesterday|next\s+week|next\s+month)\b/gi, confidence: 0.8 },
  ];

  for (const { regex, confidence } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      items.push({
        id: generateItemId(),
        type: 'date',
        content: match[1],
        confidence,
        priority: confidence >= config.immediateConfidenceThreshold ? 'immediate' : 'end_of_turn',
        requiresConfirmation: config.typesRequiringConfirmation.includes('date'),
        confirmationQuestion: `Is "${match[1]}" an important date I should remember?`,
        timestamp: new Date(),
      });
    }
  }

  return items;
}

/**
 * Extract commitments
 */
function extractCommitments(text: string): CapturedItem[] {
  const items: CapturedItem[] = [];

  const commitmentPatterns = [
    { regex: /i('m going to|will|want to|need to|should)\s+(.+?)(?:\.|,|$)/gi, confidence: 0.75 },
    { regex: /i promise\s+(.+?)(?:\.|,|$)/gi, confidence: 0.9 },
    { regex: /my goal is\s+(.+?)(?:\.|,|$)/gi, confidence: 0.85 },
  ];

  for (const { regex, confidence } of commitmentPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const content = match[2] || match[1];
      if (content && content.length > 5) {
        items.push({
          id: generateItemId(),
          type: 'commitment',
          content: content.trim(),
          confidence,
          priority: confidence >= config.immediateConfidenceThreshold ? 'immediate' : 'end_of_turn',
          requiresConfirmation: config.typesRequiringConfirmation.includes('commitment'),
          confirmationQuestion: `So you're planning to ${content.trim()}?`,
          timestamp: new Date(),
        });
      }
    }
  }

  return items;
}

/**
 * Extract preferences
 */
function extractPreferences(text: string): CapturedItem[] {
  const items: CapturedItem[] = [];

  const preferencePatterns = [
    {
      regex: /i (love|really like|prefer|enjoy|hate|can't stand)\s+(.+?)(?:\.|,|$)/gi,
      confidence: 0.8,
    },
    { regex: /my favorite\s+(.+?)\s+is\s+(.+?)(?:\.|,|$)/gi, confidence: 0.85 },
  ];

  for (const { regex, confidence } of preferencePatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const content = match[0].trim();
      if (content.length > 10) {
        items.push({
          id: generateItemId(),
          type: 'preference',
          content,
          confidence,
          priority: 'end_of_turn',
          requiresConfirmation: false,
          timestamp: new Date(),
        });
      }
    }
  }

  return items;
}

/**
 * Extract corrections to previous information
 */
function extractCorrections(text: string): CapturedItem[] {
  const items: CapturedItem[] = [];

  const correctionPatterns = [
    { regex: /actually,?\s+(?:it's|it was|i meant)\s+(.+?)(?:\.|,|$)/gi, confidence: 0.85 },
    { regex: /no,?\s+(?:it's|that's)\s+(.+?)(?:\.|,|$)/gi, confidence: 0.8 },
    { regex: /i was wrong,?\s+(.+?)(?:\.|,|$)/gi, confidence: 0.9 },
  ];

  for (const { regex, confidence } of correctionPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length > 3) {
        items.push({
          id: generateItemId(),
          type: 'correction',
          content,
          confidence,
          priority: 'immediate', // Corrections are always high priority
          requiresConfirmation: false,
          timestamp: new Date(),
        });
      }
    }
  }

  return items;
}

// ============================================================================
// CONFIRMATION LOOPS
// ============================================================================

/**
 * Add item to confirmation queue
 */
function addToConfirmationQueue(state: ActiveListeningState, item: CapturedItem): void {
  // Check queue limit
  if (state.pendingConfirmations.length >= config.maxPendingConfirmations) {
    // Remove oldest expired
    const now = Date.now();
    state.pendingConfirmations = state.pendingConfirmations.filter(
      (c) => now - c.createdAt.getTime() < config.confirmationExpiryMs
    );

    // Still full? Skip
    if (state.pendingConfirmations.length >= config.maxPendingConfirmations) {
      return;
    }
  }

  state.pendingConfirmations.push({
    itemId: item.id,
    question: item.confirmationQuestion || `Did I understand correctly: ${item.content}?`,
    priority: item.priority === 'immediate' ? 90 : 50,
    expiresAfterMs: config.confirmationExpiryMs,
    createdAt: new Date(),
    asked: false,
  });
}

/**
 * Get next confirmation to ask
 */
export function getNextConfirmation(sessionId: string): ConfirmationItem | undefined {
  const state = activeSessions.get(sessionId);
  if (!state) return undefined;

  // Clean expired
  const now = Date.now();
  state.pendingConfirmations = state.pendingConfirmations.filter(
    (c) => !c.asked && now - c.createdAt.getTime() < c.expiresAfterMs
  );

  // Return highest priority unasked
  const unasked = state.pendingConfirmations
    .filter((c) => !c.asked)
    .sort((a, b) => b.priority - a.priority);

  return unasked[0];
}

/**
 * Record confirmation response
 */
export function recordConfirmationResponse(
  sessionId: string,
  itemId: string,
  confirmed: boolean,
  correction?: string
): void {
  const state = activeSessions.get(sessionId);
  if (!state) return;

  const confirmation = state.pendingConfirmations.find((c) => c.itemId === itemId);
  if (confirmation) {
    confirmation.asked = true;
    confirmation.response = {
      confirmed,
      correction,
      timestamp: new Date(),
    };

    // Update the captured item
    const item = state.capturedItems.find((i) => i.id === itemId);
    if (item) {
      if (confirmed) {
        item.confidence = Math.min(1.0, item.confidence + 0.2);
      } else if (correction) {
        item.content = correction;
        item.confidence = 0.95;
      }
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function generateItemId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Get active listening stats
 */
export function getActiveListeningStats(): {
  activeSessions: number;
  totalCaptured: number;
  pendingConfirmations: number;
} {
  let totalCaptured = 0;
  let pendingConfirmations = 0;

  for (const state of activeSessions.values()) {
    totalCaptured += state.capturedItems.length;
    pendingConfirmations += state.pendingConfirmations.filter((c) => !c.asked).length;
  }

  return {
    activeSessions: activeSessions.size,
    totalCaptured,
    pendingConfirmations,
  };
}
