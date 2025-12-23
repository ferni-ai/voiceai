/**
 * Hyper-Specific Quoted Memory
 *
 * The "magic" that makes Ferni's memory feel superhuman.
 * Extracts and stores specific quotable phrases that can be referenced back
 * with uncanny specificity: "That thing you said about feeling like a hamster wheel..."
 *
 * @module conversation/conversational-memory/quoted-memory
 */

import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import { getLogger } from '../../utils/safe-logger.js';

import type { MemoryCallback, QuotedMemory, RecordMessageContext } from './types.js';

const log = getLogger();

// ============================================================================
// PATTERNS FOR QUOTABLE CONTENT
// ============================================================================

interface QuotablePattern {
  pattern: RegExp;
  contextDescription: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';
}

const QUOTABLE_PATTERNS: QuotablePattern[] = [
  // Metaphors and analogies
  {
    pattern: /(?:like|feels like|it's like|kind of like) ([^.!?]{10,60})/i,
    contextDescription: 'a metaphor you used',
    emotionalWeight: 'medium',
  },
  // Self-descriptions
  {
    pattern:
      /i('m| am) (?:the (?:kind|type|sort) of person (?:who|that)|someone who) ([^.!?]{10,80})/i,
    contextDescription: 'how you described yourself',
    emotionalWeight: 'medium',
  },
  // Revelations / insights
  {
    pattern: /i (?:realized|noticed|figured out|discovered) (?:that )?([^.!?]{10,80})/i,
    contextDescription: 'something you realized',
    emotionalWeight: 'medium',
  },
  // Core beliefs
  {
    pattern:
      /(?:what matters (?:to me )?is|i (?:truly |really )?believe|my (?:philosophy|motto) is) ([^.!?]{10,80})/i,
    contextDescription: 'what you believe',
    emotionalWeight: 'heavy',
  },
  // "The thing is" / "The truth is" revelations
  {
    pattern: /(?:the thing is|the truth is|honestly|if i'm being honest),? ([^.!?]{10,100})/i,
    contextDescription: 'something you confided',
    emotionalWeight: 'heavy',
  },
  // "My [relationship] always/never" patterns
  {
    pattern:
      /my (?:mom|dad|partner|wife|husband|boss|friend|brother|sister|family) (?:always|never) ([^.!?]{10,60})/i,
    contextDescription: 'something about your family',
    emotionalWeight: 'medium',
  },
  // Strong "I feel" statements
  {
    pattern: /i feel (?:like|that|so) ([^.!?]{10,80})/i,
    contextDescription: 'how you were feeling',
    emotionalWeight: 'medium',
  },
  // "I've never told anyone" / vulnerability
  {
    pattern: /i(?:'ve| have) never (?:told anyone|said this|admitted) ([^.!?]{5,80})/i,
    contextDescription: 'something vulnerable you shared',
    emotionalWeight: 'heavy',
  },
  // Specific struggles
  {
    pattern: /i(?:'ve| have) been struggling with ([^.!?]{10,80})/i,
    contextDescription: 'something you were struggling with',
    emotionalWeight: 'heavy',
  },
  // Dreams / aspirations
  {
    pattern: /i(?:'ve| have) always wanted to ([^.!?]{10,60})/i,
    contextDescription: 'a dream you mentioned',
    emotionalWeight: 'medium',
  },
  // "What if" fears
  {
    pattern: /what if ([^.!?]{10,60})/i,
    contextDescription: 'a worry you had',
    emotionalWeight: 'medium',
  },
];

// ============================================================================
// MAX MEMORIES TO STORE
// ============================================================================

const MAX_QUOTED_MEMORIES = 15;

// ============================================================================
// QUOTED MEMORY ENGINE
// ============================================================================

export class QuotedMemoryEngine {
  private quotedMemories: QuotedMemory[] = [];

  /**
   * Extract quotable phrases from user message
   */
  extractQuotedMemories(text: string, turn: number, context: RecordMessageContext): void {
    for (const { pattern, contextDescription, emotionalWeight } of QUOTABLE_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[0]) {
        const phrase = match[0].trim();

        // Don't store duplicates
        if (this.quotedMemories.some((m) => m.phrase.toLowerCase() === phrase.toLowerCase())) {
          continue;
        }

        // Determine if this is a vulnerable share
        const isVulnerable =
          emotionalWeight === 'heavy' ||
          context.wasPersonal ||
          context.emotion === 'sad' ||
          context.emotion === 'anxious' ||
          context.emotion === 'vulnerable';

        this.quotedMemories.push({
          phrase,
          turn,
          timestamp: Date.now(),
          context: contextDescription,
          topic: context.topic,
          emotionalWeight: isVulnerable ? 'heavy' : emotionalWeight,
          emotion: context.emotion,
          wasVulnerable: isVulnerable,
          usedThisSession: false,
        });

        log.debug(
          { phrase: phrase.slice(0, 50), context: contextDescription },
          'Hyper-specific memory stored'
        );

        // Trim to max memories
        this.trimToMax();
      }
    }
  }

  /**
   * Get a hyper-specific memory callback
   * Returns the most impactful unused quoted memory
   */
  getCallback(currentTurn: number): MemoryCallback | null {
    // Find unused memories from earlier in the conversation
    const available = this.quotedMemories.filter(
      (m) => !m.usedThisSession && currentTurn - m.turn >= 3
    );

    if (available.length === 0) return null;

    // Prioritize: heavy > recent > light
    available.sort((a, b) => {
      const weightScore = { heavy: 3, medium: 2, light: 1 };
      if (weightScore[a.emotionalWeight] !== weightScore[b.emotionalWeight]) {
        return weightScore[b.emotionalWeight] - weightScore[a.emotionalWeight];
      }
      return b.turn - a.turn; // More recent within same weight
    });

    const memory = available[0];
    memory.usedThisSession = true;

    // Calculate time ago string
    const minutesAgo = Math.floor((Date.now() - memory.timestamp) / 60000);
    let timeAgo = 'earlier';
    if (minutesAgo < 5) {
      timeAgo = 'a moment ago';
    } else if (minutesAgo < 30) {
      timeAgo = 'earlier in our conversation';
    }

    // Create callback phrase
    const phrases = [
      `That thing you said ${timeAgo}—"${memory.phrase}"—I keep thinking about it.`,
      `You know what stuck with me? When you said "${memory.phrase}."`,
      `I can't let go of "${memory.phrase}." There's more there, isn't there?`,
      `"${memory.phrase}"—you said that ${timeAgo}. Tell me more about that.`,
      `Going back to ${memory.context}... "${memory.phrase}." What's behind that?`,
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    // Emit signal to frontend for EQ response
    void humanizationSignalEmitter.memoryCallback(
      memory.phrase,
      memory.context,
      timeAgo,
      memory.emotionalWeight
    );

    return {
      phrase,
      ssml: `<break time="200ms"/>${phrase}`,
      referenceType: 'earlier_this_convo',
    };
  }

  /**
   * Get all quoted memories for persistence
   */
  getAll(): QuotedMemory[] {
    return [...this.quotedMemories];
  }

  /**
   * Import quoted memories from a previous session
   */
  import(memories: QuotedMemory[]): void {
    const imported = memories.map((m) => ({
      ...m,
      usedThisSession: false,
    }));

    this.quotedMemories = [...imported, ...this.quotedMemories];
    this.trimToMax();

    log.debug(
      { importedCount: imported.length, totalCount: this.quotedMemories.length },
      'Imported quoted memories from previous session'
    );
  }

  /**
   * Reset all quoted memories
   */
  reset(): void {
    this.quotedMemories = [];
    log.debug('Quoted memories reset');
  }

  /**
   * Check if we have any quoted memories
   */
  hasMemories(): boolean {
    return this.quotedMemories.length > 0;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private trimToMax(): void {
    if (this.quotedMemories.length > MAX_QUOTED_MEMORIES) {
      // Keep the most important ones (heavy > medium > light)
      this.quotedMemories.sort((a, b) => {
        const weightScore = { heavy: 3, medium: 2, light: 1 };
        return weightScore[b.emotionalWeight] - weightScore[a.emotionalWeight];
      });
      this.quotedMemories = this.quotedMemories.slice(0, MAX_QUOTED_MEMORIES);
    }
  }
}
