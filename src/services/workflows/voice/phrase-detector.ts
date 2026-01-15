/**
 * Voice Phrase Detector
 *
 * Detects trigger phrases in voice transcripts to trigger workflows:
 * - Exact match detection
 * - Fuzzy matching for natural speech
 * - Intent classification
 * - Context-aware triggers
 *
 * @module services/workflows/voice/phrase-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEventBus } from '../events/event-bus.js';

const log = createLogger({ module: 'phrase-detector' });

// ============================================================================
// TYPES
// ============================================================================

export interface PhraseTrigger {
  id: string;
  userId: string;
  workflowId: string;

  // Phrases that trigger this workflow
  phrases: string[];

  // Matching options
  requireExactMatch: boolean;
  caseSensitive: boolean;
  fuzzyThreshold: number; // 0-1, how close the match needs to be

  // Context requirements
  contextRequired?: {
    personaId?: string;
    timeWindow?: { start: string; end: string }; // HH:mm format
    locationId?: string;
  };

  // Extraction patterns
  extractVariables?: Array<{
    name: string;
    pattern: string; // Regex pattern with capture group
    optional: boolean;
  }>;

  // Confirmation
  requireConfirmation: boolean;
  confirmationPrompt?: string;

  // Active status
  enabled: boolean;

  // Metadata
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhraseMatch {
  triggerId: string;
  workflowId: string;
  matchedPhrase: string;
  originalTranscript: string;
  confidence: number;
  extractedVariables: Record<string, string>;
  timestamp: Date;
}

export interface DetectionContext {
  userId: string;
  personaId?: string;
  currentTime?: Date;
  locationId?: string;
  conversationHistory?: string[];
}

// ============================================================================
// PHRASE DETECTOR CLASS
// ============================================================================

export class PhraseDetector {
  private triggers: Map<string, PhraseTrigger> = new Map();
  private userTriggers: Map<string, string[]> = new Map(); // userId -> triggerId[]

  constructor() {
    log.info('Phrase detector initialized');
  }

  // ==========================================================================
  // TRIGGER MANAGEMENT
  // ==========================================================================

  /**
   * Register a phrase trigger
   */
  registerTrigger(
    userId: string,
    workflowId: string,
    phrases: string[],
    options?: Partial<
      Omit<PhraseTrigger, 'id' | 'userId' | 'workflowId' | 'phrases' | 'createdAt' | 'updatedAt'>
    >
  ): PhraseTrigger {
    const trigger: PhraseTrigger = {
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      workflowId,
      phrases: phrases.map((p) => p.toLowerCase().trim()),
      requireExactMatch: options?.requireExactMatch ?? false,
      caseSensitive: options?.caseSensitive ?? false,
      fuzzyThreshold: options?.fuzzyThreshold ?? 0.8,
      contextRequired: options?.contextRequired,
      extractVariables: options?.extractVariables,
      requireConfirmation: options?.requireConfirmation ?? false,
      confirmationPrompt: options?.confirmationPrompt,
      enabled: options?.enabled ?? true,
      description: options?.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.triggers.set(trigger.id, trigger);

    // Index by user
    const userTriggerList = this.userTriggers.get(userId) || [];
    userTriggerList.push(trigger.id);
    this.userTriggers.set(userId, userTriggerList);

    log.info(
      { triggerId: trigger.id, workflowId, phraseCount: phrases.length },
      'Phrase trigger registered'
    );

    return trigger;
  }

  /**
   * Update a phrase trigger
   */
  updateTrigger(
    triggerId: string,
    updates: Partial<Omit<PhraseTrigger, 'id' | 'userId' | 'createdAt'>>
  ): PhraseTrigger | null {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return null;

    if (updates.phrases) {
      updates.phrases = updates.phrases.map((p) => p.toLowerCase().trim());
    }

    Object.assign(trigger, updates, { updatedAt: new Date() });
    return trigger;
  }

  /**
   * Remove a phrase trigger
   */
  removeTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    this.triggers.delete(triggerId);

    // Remove from user index
    const userTriggerList = this.userTriggers.get(trigger.userId);
    if (userTriggerList) {
      const index = userTriggerList.indexOf(triggerId);
      if (index !== -1) {
        userTriggerList.splice(index, 1);
      }
    }

    log.info({ triggerId }, 'Phrase trigger removed');
    return true;
  }

  /**
   * Get user's phrase triggers
   */
  getUserTriggers(userId: string): PhraseTrigger[] {
    const triggerIds = this.userTriggers.get(userId) || [];
    return triggerIds
      .map((id) => this.triggers.get(id))
      .filter((t): t is PhraseTrigger => t !== undefined);
  }

  // ==========================================================================
  // PHRASE DETECTION
  // ==========================================================================

  /**
   * Detect trigger phrases in a transcript
   */
  async detectPhrases(transcript: string, context: DetectionContext): Promise<PhraseMatch[]> {
    const matches: PhraseMatch[] = [];
    const normalizedTranscript = transcript.toLowerCase().trim();

    const userTriggers = this.getUserTriggers(context.userId).filter((t) => t.enabled);

    for (const trigger of userTriggers) {
      // Check context requirements
      if (!this.checkContext(trigger, context)) {
        continue;
      }

      // Try to match each phrase
      for (const phrase of trigger.phrases) {
        const matchResult = this.matchPhrase(normalizedTranscript, phrase, trigger);

        if (matchResult.matched) {
          const extractedVars = this.extractVariables(transcript, trigger.extractVariables);

          matches.push({
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            matchedPhrase: phrase,
            originalTranscript: transcript,
            confidence: matchResult.confidence,
            extractedVariables: extractedVars,
            timestamp: new Date(),
          });

          // Publish event
          await getEventBus().publish({
            userId: context.userId,
            eventType: 'custom',
            source: 'phrase-detector',
            data: {
              triggerId: trigger.id,
              workflowId: trigger.workflowId,
              matchedPhrase: phrase,
              confidence: matchResult.confidence,
              variables: extractedVars,
            },
          });

          log.debug(
            {
              triggerId: trigger.id,
              phrase,
              confidence: matchResult.confidence,
            },
            'Phrase trigger matched'
          );

          break; // Only one match per trigger
        }
      }
    }

    return matches;
  }

  /**
   * Check if context requirements are met
   */
  private checkContext(trigger: PhraseTrigger, context: DetectionContext): boolean {
    const req = trigger.contextRequired;
    if (!req) return true;

    // Check persona
    if (req.personaId && context.personaId !== req.personaId) {
      return false;
    }

    // Check time window
    if (req.timeWindow) {
      const now = context.currentTime || new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startHour, startMin] = req.timeWindow.start.split(':').map(Number);
      const [endHour, endMin] = req.timeWindow.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (startTime <= endTime) {
        if (currentTime < startTime || currentTime > endTime) {
          return false;
        }
      } else {
        // Spans midnight
        if (currentTime < startTime && currentTime > endTime) {
          return false;
        }
      }
    }

    // Check location
    if (req.locationId && context.locationId !== req.locationId) {
      return false;
    }

    return true;
  }

  /**
   * Match a phrase against transcript
   */
  private matchPhrase(
    transcript: string,
    phrase: string,
    trigger: PhraseTrigger
  ): { matched: boolean; confidence: number } {
    if (trigger.requireExactMatch) {
      const matched = transcript === phrase;
      return { matched, confidence: matched ? 1.0 : 0.0 };
    }

    // Check for exact substring match first
    if (transcript.includes(phrase)) {
      return { matched: true, confidence: 1.0 };
    }

    // Fuzzy matching
    const similarity = this.calculateSimilarity(transcript, phrase);
    const matched = similarity >= trigger.fuzzyThreshold;

    return { matched, confidence: similarity };
  }

  /**
   * Calculate similarity between two strings (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    // Check if all words from phrase exist in transcript
    let matchedWords = 0;
    for (const word2 of words2) {
      for (const word1 of words1) {
        if (this.wordSimilarity(word1, word2) > 0.8) {
          matchedWords++;
          break;
        }
      }
    }

    return matchedWords / words2.length;
  }

  /**
   * Calculate similarity between two words
   */
  private wordSimilarity(word1: string, word2: string): number {
    if (word1 === word2) return 1.0;

    const maxLen = Math.max(word1.length, word2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(word1, word2);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Extract variables from transcript using patterns
   */
  private extractVariables(
    transcript: string,
    patterns?: PhraseTrigger['extractVariables']
  ): Record<string, string> {
    const variables: Record<string, string> = {};

    if (!patterns) return variables;

    for (const { name, pattern, optional } of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = transcript.match(regex);

        if (match && match[1]) {
          variables[name] = match[1].trim();
        } else if (!optional) {
          log.debug({ name, pattern }, 'Required variable not found');
        }
      } catch (error) {
        log.warn({ pattern, error: String(error) }, 'Invalid variable pattern');
      }
    }

    return variables;
  }

  // ==========================================================================
  // INTENT PATTERNS
  // ==========================================================================

  /**
   * Common intent patterns for quick setup
   */
  static readonly INTENT_PATTERNS = {
    // Time-related
    SET_ALARM: ['set an alarm for', 'wake me up at', 'remind me at'],
    SET_TIMER: ['set a timer for', 'timer for', 'countdown for'],

    // Task-related
    CREATE_TASK: ['add task', 'create task', 'remind me to', 'i need to'],
    COMPLETE_TASK: ['mark as done', 'complete task', 'finished with'],

    // Communication
    SEND_MESSAGE: ['send a message to', 'text', 'message'],
    MAKE_CALL: ['call', 'dial', 'phone'],

    // Smart home
    TURN_ON: ['turn on', 'switch on', 'enable'],
    TURN_OFF: ['turn off', 'switch off', 'disable'],
    SET_TEMPERATURE: ['set temperature to', 'make it', 'change temp to'],

    // Navigation
    GET_DIRECTIONS: ['directions to', 'how do i get to', 'navigate to'],
    ORDER_RIDE: ['order a ride', 'get me an uber', 'book a lyft'],

    // Shopping
    ADD_TO_LIST: ['add to shopping list', 'add to list', 'i need to buy'],
    ORDER_GROCERIES: ['order groceries', 'get groceries from'],

    // Music
    PLAY_MUSIC: ['play', 'play music', 'play some'],
    PAUSE_MUSIC: ['pause', 'stop music', 'pause music'],

    // Custom automation
    RUN_WORKFLOW: ['run', 'start', 'execute', 'trigger'],
  } as const;

  /**
   * Check if transcript matches a common intent
   */
  static detectIntent(
    transcript: string
  ): { intent: keyof typeof PhraseDetector.INTENT_PATTERNS; confidence: number } | null {
    const normalized = transcript.toLowerCase().trim();

    for (const [intent, phrases] of Object.entries(this.INTENT_PATTERNS)) {
      for (const phrase of phrases) {
        if (normalized.includes(phrase)) {
          return {
            intent: intent as keyof typeof PhraseDetector.INTENT_PATTERNS,
            confidence: 0.9,
          };
        }
      }
    }

    return null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let phraseDetectorInstance: PhraseDetector | null = null;

export function getPhraseDetector(): PhraseDetector {
  if (!phraseDetectorInstance) {
    phraseDetectorInstance = new PhraseDetector();
  }
  return phraseDetectorInstance;
}

export function resetPhraseDetector(): void {
  phraseDetectorInstance = null;
}
