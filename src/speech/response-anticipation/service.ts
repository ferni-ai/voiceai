/**
 * Response Anticipation Service
 *
 * Session-scoped service for anticipating user responses.
 *
 * @module response-anticipation/service
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../../utils/session-registry.js';
import { predictIntent } from './patterns.js';
import type { AnticipatedResponse, CacheStats, CachedPattern, IntentCategory } from './types.js';

const log = getLogger().child({ module: 'ResponseAnticipation' });

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Response anticipation service
 *
 * Reduces perceived latency by ~100-200ms on cache hits.
 */
export class ResponseAnticipationService {
  private stats: CacheStats;
  private intentCounts: Map<IntentCategory, number>;
  private lastAnticipation: AnticipatedResponse | null = null;
  private personaId = 'ferni';
  private pendingCacheHit: IntentCategory | null = null;

  constructor(private sessionId: string) {
    this.stats = {
      hits: 0,
      misses: 0,
      avgHitLatencyMs: 0,
      mostFrequentIntents: [],
    };
    this.intentCounts = new Map();
    log.debug({ sessionId }, '🎯 Response anticipation service initialized');
  }

  /**
   * Configure persona for template selection
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Anticipate response from partial transcript.
   * Call this while user is still speaking.
   */
  anticipate(partialTranscript: string): AnticipatedResponse | null {
    const startTime = Date.now();

    const prediction = predictIntent(partialTranscript);

    if (prediction.confidence < 0.5 || prediction.intent === 'unknown') {
      this.lastAnticipation = null;
      return null;
    }

    // Build anticipated response
    const { pattern } = prediction;
    let template = '';
    let isComplete = false;

    if (pattern && pattern.templates.length > 0) {
      // Select random template for variety
      const templateIdx = Math.floor(Math.random() * pattern.templates.length);
      template = pattern.templates[templateIdx];
      isComplete = pattern.variables.length === 0;

      // Fill simple variables
      template = this.fillVariables(template, pattern.variables);
    }

    const anticipation: AnticipatedResponse = {
      intent: prediction.intent,
      confidence: prediction.confidence,
      template,
      variables: pattern?.variables || [],
      isComplete,
      contextHint: pattern?.contextHint || '',
      ssmlHint: this.getSsmlHintForIntent(prediction.intent),
    };

    this.lastAnticipation = anticipation;

    // Update stats
    const latency = Date.now() - startTime;
    if (isComplete) {
      this.stats.hits++;
      this.stats.avgHitLatencyMs =
        (this.stats.avgHitLatencyMs * (this.stats.hits - 1) + latency) / this.stats.hits;
    }

    // Track intent frequency
    const count = (this.intentCounts.get(prediction.intent) || 0) + 1;
    this.intentCounts.set(prediction.intent, count);

    log.debug(
      {
        intent: prediction.intent,
        confidence: prediction.confidence.toFixed(2),
        isComplete,
        latencyMs: latency,
      },
      '🎯 Response anticipated'
    );

    return anticipation;
  }

  /**
   * Get context hint for LLM if no complete response
   */
  getContextHintForLLM(finalTranscript: string): string | null {
    const anticipation = this.anticipate(finalTranscript);

    if (anticipation && anticipation.contextHint) {
      return `[Hint: ${anticipation.contextHint}]`;
    }

    return null;
  }

  /**
   * Get complete response if available
   */
  getCompleteResponse(): { response: string; ssml: string } | null {
    if (!this.lastAnticipation || !this.lastAnticipation.isComplete) {
      return null;
    }

    const response = this.lastAnticipation.template;
    let ssml = response;

    if (this.lastAnticipation.ssmlHint) {
      ssml = this.lastAnticipation.ssmlHint.replace('{{TEXT}}', response);
    }

    return { response, ssml };
  }

  /**
   * Fill template variables
   */
  private fillVariables(template: string, variables: string[]): string {
    let result = template;

    for (const variable of variables) {
      switch (variable) {
        case 'timeOfDay': {
          const hour = new Date().getHours();
          const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
          result = result.replace(`{{${variable}}}`, tod);
          break;
        }

        case 'userName':
          result = result.replace(`{{${variable}}}`, 'there'); // Fallback
          break;

        default:
          // Leave unknown variables as-is
          break;
      }
    }

    return result;
  }

  /**
   * Get SSML hint for intent
   */
  private getSsmlHintForIntent(intent: IntentCategory): string | undefined {
    switch (intent) {
      case 'greeting':
        return '<prosody pitch="+5%" rate="105%">{{TEXT}}</prosody>';

      case 'farewell':
        return '<prosody pitch="-3%" rate="95%">{{TEXT}}</prosody>';

      case 'gratitude':
        return '<prosody volume="soft" rate="95%">{{TEXT}}</prosody>';

      case 'emotional_disclosure':
        return '<prosody volume="soft" rate="90%"><break time="300ms"/>{{TEXT}}</prosody>';

      default:
        return undefined;
    }
  }

  /**
   * Report if last anticipation was correct (for learning)
   */
  reportAccuracy(wasCorrect: boolean): void {
    if (!wasCorrect) {
      this.stats.misses++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const sorted = Array.from(this.intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    return {
      ...this.stats,
      mostFrequentIntents: sorted,
    };
  }

  /**
   * Get hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Clear last anticipation (after response sent)
   */
  clearAnticipation(): void {
    this.lastAnticipation = null;
    this.pendingCacheHit = null;
  }

  /**
   * Mark that a cache hit is ready to use
   */
  markCacheHit(intent: IntentCategory): void {
    this.pendingCacheHit = intent;
    this.stats.hits++;
  }

  /**
   * Check if there's a cache hit waiting to be used
   */
  hasCacheHit(): boolean {
    return this.pendingCacheHit !== null;
  }

  /**
   * Consume the cache hit (returns intent and clears the flag)
   */
  consumeCacheHit(): IntentCategory | null {
    const intent = this.pendingCacheHit;
    this.pendingCacheHit = null;
    return intent;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      avgHitLatencyMs: 0,
      mostFrequentIntents: [],
    };
    this.intentCounts.clear();
    this.lastAnticipation = null;
    this.pendingCacheHit = null;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const responseAnticipationRegistry = createSessionRegistry(
  (sessionId: string) => new ResponseAnticipationService(sessionId),
  { name: 'ResponseAnticipation', cleanup: (service) => service.reset(), verbose: false }
);

registerGlobalRegistry(responseAnticipationRegistry);

/**
 * Get response anticipation service for a session
 */
export function getResponseAnticipationService(sessionId: string): ResponseAnticipationService {
  return responseAnticipationRegistry.get(sessionId);
}

/**
 * Reset response anticipation service for a session
 */
export function resetResponseAnticipationService(sessionId: string): void {
  responseAnticipationRegistry.reset(sessionId);
  log.debug({ sessionId }, '🎯 Response anticipation service reset');
}

/**
 * Get count of active response anticipation instances
 */
export function getActiveResponseAnticipationCount(): number {
  return responseAnticipationRegistry.getActiveCount();
}

