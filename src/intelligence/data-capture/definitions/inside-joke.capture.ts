/**
 * Inside Joke / Shared Moment Data Capture Definition
 *
 * Passively captures shared moments and potential inside jokes.
 * Detects laughter, callbacks, and memorable shared experiences.
 *
 * @module intelligence/data-capture/definitions/inside-joke.capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DataCaptureContext, DataCaptureDefinition } from '../types.js';

const log = createLogger({ module: 'data-capture:inside-joke' });

export const insideJokeCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_inside_joke',
  name: 'Inside Joke Capture',
  description: 'Captures shared moments and inside jokes',
  category: 'relationship',

  triggers: {
    phrases: [
      'haha',
      'lol',
      'that was funny',
      "that's hilarious",
      "i can't stop laughing",
      'you crack me up',
      'remember when',
      "you're so funny",
      'classic',
      "that's our thing",
      'you always say that',
      'every time',
      "that's so us",
    ],
    patterns: [
      /(?:haha|hahaha|lol|lmao|rofl|😂|🤣)+/i,
      /(?:that(?:'s| is|was)\s+(?:so|really|hilarious|funny))/i,
      /(?:remember\s+when|you always|every time)\s+(.+)/i,
      /(?:that's our|that's so us|classic you|typical|you and your)/i,
      /(?:i love how you|you're so|only you would)/i,
    ],
    keywords: [
      { word: 'haha', weight: 0.7 },
      { word: 'funny', weight: 0.6 },
      { word: 'hilarious', weight: 0.8 },
      { word: 'remember when', weight: 0.9 },
      { word: 'classic', weight: 0.7 },
      { word: 'every time', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  arguments: [
    {
      name: 'momentType',
      type: 'string',
      description: 'Type of shared moment',
      required: false,
      extractionPatterns: [/(funny|hilarious|classic|remember)/i, /(always|every time)/i],
    },
    {
      name: 'content',
      type: 'string',
      description: 'What the moment was about',
      required: false,
      extractionPatterns: [
        /remember\s+when\s+(.+?)(?:\?|\.|$)/i,
        /you\s+always\s+(.+?)(?:\.|$)/i,
        /every\s+time\s+(.+?)(?:\.|$)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.5,
    patternMatchBonus: 0.2,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.1,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const momentTypeHint = String(extractedArgs.momentType || '').toLowerCase();
    const contentHint = String(extractedArgs.content || '').trim();

    // Determine moment type
    let momentType:
      | 'inside_joke'
      | 'callback'
      | 'shared_discovery'
      | 'memorable_quote'
      | 'silly_moment'
      | 'breakthrough'
      | 'running_gag'
      | 'nickname'
      | 'tradition' = 'silly_moment';

    if (
      momentTypeHint.includes('remember') ||
      momentTypeHint.includes('always') ||
      momentTypeHint.includes('every time')
    ) {
      momentType = 'callback';
    } else if (
      context.transcript.toLowerCase().includes('haha') ||
      context.transcript.toLowerCase().includes('lol')
    ) {
      momentType = 'silly_moment';
    } else if (contentHint && contentHint.length > 20) {
      momentType = 'inside_joke';
    }

    // Extract the essence - what made this moment special
    // This is tricky - we need to capture the right thing
    const { transcript } = context;
    let essence = contentHint || '';

    // If no content hint, try to extract something meaningful
    if (!essence) {
      // Look for the part before the laughter
      const parts = transcript.split(/(?:haha|lol|😂|🤣)/i);
      if (parts.length > 1 && parts[0].length > 10 && parts[0].length < 200) {
        essence = parts[0].trim();
      } else {
        // Not enough context to capture a meaningful moment
        log.debug('Not enough context for inside joke capture');
        return null;
      }
    }

    if (essence.length < 10) {
      log.debug('Essence too short for inside joke capture');
      return null;
    }

    // Create trigger keywords from the essence
    const triggerKeywords = essence
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .slice(0, 5);

    // Create a natural callback phrase
    let callbackPhrase = '';
    if (momentType === 'callback') {
      callbackPhrase = `Remember ${essence.slice(0, 50)}?`;
    } else if (momentType === 'silly_moment') {
      callbackPhrase = `Like that time ${essence.slice(0, 50)}`;
    } else {
      callbackPhrase = `That reminds me of when ${essence.slice(0, 50)}`;
    }

    try {
      const { recordSharedMoment } =
        await import('../../../services/superhuman/inside-joke-memory.js');

      await recordSharedMoment(
        context.userId,
        momentType,
        essence.slice(0, 150),
        transcript.slice(0, 300),
        triggerKeywords,
        callbackPhrase
      );

      log.info(
        { type: momentType, essence: essence.slice(0, 50), userId: context.userId },
        'Captured shared moment from conversation'
      );

      // Silently capture - we'll use it for callbacks later
      return null;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to capture inside joke');
      return null;
    }
  },
};
