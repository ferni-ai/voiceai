/**
 * Dreams Data Capture Definition
 *
 * Passively captures long-term aspirations and dreams mentioned in conversation.
 * Feeds into the Dream Keeper superhuman service.
 *
 * Examples:
 * - "I've always wanted to visit Japan"
 * - "My dream is to write a book"
 * - "Someday I hope to learn piano"
 */

import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'DreamCapture' });

// Dream type classification keywords
const DREAM_TYPE_KEYWORDS: Record<string, string[]> = {
  travel: ['visit', 'travel', 'go to', 'see', 'trip', 'vacation', 'explore'],
  career: ['job', 'career', 'work', 'profession', 'business', 'company', 'start'],
  skill: ['learn', 'play', 'speak', 'master', 'get better at', 'improve'],
  creative: ['write', 'create', 'paint', 'compose', 'design', 'build', 'make'],
  experience: ['run', 'climb', 'swim', 'try', 'do', 'experience'],
  relationship: ['meet', 'find', 'marry', 'family', 'children'],
  financial: ['buy', 'own', 'afford', 'save', 'retire'],
  health: ['lose weight', 'get fit', 'healthy', 'quit', 'stop'],
};

function classifyDreamType(text: string): string {
  const lowerText = text.toLowerCase();

  for (const [type, keywords] of Object.entries(DREAM_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      return type;
    }
  }

  return 'aspiration';
}

export const dreamCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_dream',
  name: 'Dream Capture',
  description: 'Captures long-term aspirations and dreams mentioned in conversation',
  category: 'dream',

  triggers: {
    phrases: [
      "i've always wanted",
      'i always wanted',
      'my dream is',
      'i dream of',
      'someday i',
      "one day i'd",
      "one day i'll",
      'i hope to',
      'bucket list',
      'before i die',
      "i've been wanting",
      'wish i could',
      'if only i could',
    ],
    patterns: [
      // "I've always wanted to visit Japan"
      /i(?:'ve| have)\s+always\s+wanted\s+to\s+(.+)/i,
      // "My dream is to write a book"
      /my\s+dream\s+is\s+(?:to\s+)?(.+)/i,
      // "Someday I hope to learn piano"
      /someday\s+i\s+(?:hope\s+to\s+|want\s+to\s+|will\s+)?(.+)/i,
      // "One day I'll travel the world"
      /one\s+day\s+i(?:'ll| will)\s+(.+)/i,
      // "I dream of owning a restaurant"
      /i\s+dream\s+of\s+(.+)/i,
      // "Bucket list: climb Everest"
      /bucket\s+list[:\s]+(.+)/i,
      // "I wish I could speak French"
      /i\s+wish\s+i\s+could\s+(.+)/i,
    ],
    keywords: [
      { word: 'dream', weight: 0.9 },
      { word: 'always wanted', weight: 0.9 },
      { word: 'someday', weight: 0.8 },
      { word: 'bucket list', weight: 0.9 },
      { word: 'one day', weight: 0.7 },
      { word: 'hope to', weight: 0.7 },
      { word: 'aspiration', weight: 0.9 },
      { word: 'wish', weight: 0.6 },
    ],
    // Avoid capturing immediate plans or complaints
    antiKeywords: ['tonight', 'tomorrow', 'this week', 'yesterday', "didn't", 'failed', 'gave up'],
  },

  arguments: [
    {
      name: 'dream',
      type: 'string',
      description: 'The dream or aspiration',
      required: true,
      extractionPatterns: [
        /i(?:'ve| have)\s+always\s+wanted\s+to\s+(.+?)(?:\.|$)/i,
        /my\s+dream\s+is\s+(?:to\s+)?(.+?)(?:\.|$)/i,
        /someday\s+i\s+(?:hope\s+to\s+|want\s+to\s+|will\s+)?(.+?)(?:\.|$)/i,
        /one\s+day\s+i(?:'ll| will)\s+(.+?)(?:\.|$)/i,
        /i\s+dream\s+of\s+(.+?)(?:\.|$)/i,
        /i\s+wish\s+i\s+could\s+(.+?)(?:\.|$)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.6,
    patternMatchBonus: 0.35,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.3,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const { dream } = extractedArgs as { dream?: string };

    if (!dream || dream.length < 5) {
      log.debug({ extractedArgs }, 'Dream too short or missing');
      return null;
    }

    // Clean up the dream text
    const cleanDream = dream
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.!?]$/, '');

    // Don't capture very generic statements
    if (cleanDream.length < 10) {
      return null;
    }

    const dreamType = classifyDreamType(cleanDream);

    try {
      const { recordDreamMention } = await import('../../../services/superhuman/dream-keeper.js');
      await recordDreamMention(context.userId, {
        statement: cleanDream,
        type: dreamType as 'career' | 'creative' | 'adventure' | 'relationship' | 'impact' | 'lifestyle' | 'growth' | 'healing',
        confidence: 0.8,
      });

      log.info(
        { dream: cleanDream, type: dreamType, userId: context.userId },
        'Captured dream from conversation'
      );

      // Dreams are special - acknowledge them warmly
      return `That's a beautiful dream. I'll keep it safe for you.`;
    } catch (error) {
      log.error({ error: String(error), extractedArgs }, 'Failed to capture dream');
      return null;
    }
  },
};

