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
      // Laughter indicators
      'haha',
      'lol',
      'that was funny',
      "that's hilarious",
      "i can't stop laughing",
      'you crack me up',
      "you're so funny",
      // Callbacks and references
      'remember when',
      'remember that time',
      'just like when',
      'classic',
      "that's our thing",
      'you always say that',
      'every time',
      "that's so us",
      // Nicknames
      "i'll call you",
      "i'm gonna call you",
      "let's call it",
      "your new name is",
      "we should call that",
      // Traditions
      'we always do that',
      'our tradition',
      "that's what we do",
      'every time we',
      "it's become our",
      // Breakthroughs
      'i finally get it',
      'that makes sense now',
      'aha moment',
      "i've been thinking",
      'this is huge',
      // Running gags
      'there you go again',
      'you and your',
      'typical you',
      "that's so on brand",
    ],
    patterns: [
      /(?:haha|hahaha|lol|lmao|rofl|😂|🤣)+/i,
      /(?:that(?:'s| is|was)\s+(?:so|really|hilarious|funny))/i,
      /(?:remember\s+(?:when|that\s+time)|you always|every time)\s+(.+)/i,
      /(?:that's our|that's so us|classic you|typical|you and your)/i,
      /(?:i love how you|you're so|only you would)/i,
      // Nickname patterns
      /(?:call(?:ing)?\s+(?:you|it|this))\s+["']?([^"']+)["']?/i,
      /(?:new\s+name|nickname)\s+(?:is|will be)\s+["']?([^"']+)["']?/i,
      // Tradition patterns
      /(?:always|every\s+(?:time|week|month|year))\s+(?:we|you|i)\s+(.+)/i,
      /(?:our\s+(?:tradition|thing|ritual))\s+(?:is|to)\s+(.+)/i,
      // Breakthrough patterns
      /(?:finally|now\s+i)\s+(?:get|understand|see)\s+(.+)/i,
      /(?:aha|eureka|lightbulb|breakthrough)\s*(?:moment)?/i,
    ],
    keywords: [
      { word: 'haha', weight: 0.7 },
      { word: 'funny', weight: 0.6 },
      { word: 'hilarious', weight: 0.8 },
      { word: 'remember when', weight: 0.9 },
      { word: 'classic', weight: 0.7 },
      { word: 'every time', weight: 0.8 },
      { word: 'nickname', weight: 0.9 },
      { word: 'tradition', weight: 0.9 },
      { word: 'breakthrough', weight: 0.8 },
      { word: 'aha moment', weight: 0.9 },
      { word: 'running joke', weight: 0.9 },
      { word: 'our thing', weight: 0.8 },
    ],
    antiKeywords: ['worried', 'scared', 'anxious', 'upset', 'angry'],
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

    // Determine moment type with expanded detection
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

    const lowerTranscript = context.transcript.toLowerCase();

    // Check for nicknames first (specific pattern)
    if (
      lowerTranscript.includes("call you") ||
      lowerTranscript.includes("call it") ||
      lowerTranscript.includes("nickname") ||
      lowerTranscript.includes("new name")
    ) {
      momentType = 'nickname';
    }
    // Check for traditions
    else if (
      lowerTranscript.includes("tradition") ||
      lowerTranscript.includes("ritual") ||
      (lowerTranscript.includes("always") && lowerTranscript.includes("we"))
    ) {
      momentType = 'tradition';
    }
    // Check for breakthroughs
    else if (
      lowerTranscript.includes("finally get") ||
      lowerTranscript.includes("makes sense") ||
      lowerTranscript.includes("aha") ||
      lowerTranscript.includes("eureka") ||
      lowerTranscript.includes("breakthrough")
    ) {
      momentType = 'breakthrough';
    }
    // Check for running gags
    else if (
      lowerTranscript.includes("there you go again") ||
      lowerTranscript.includes("typical you") ||
      lowerTranscript.includes("on brand") ||
      lowerTranscript.includes("you and your")
    ) {
      momentType = 'running_gag';
    }
    // Check for callbacks
    else if (
      momentTypeHint.includes('remember') ||
      momentTypeHint.includes('always') ||
      momentTypeHint.includes('every time') ||
      lowerTranscript.includes('remember when') ||
      lowerTranscript.includes('remember that time')
    ) {
      momentType = 'callback';
    }
    // Check for laughter
    else if (
      lowerTranscript.includes('haha') ||
      lowerTranscript.includes('lol') ||
      lowerTranscript.includes('lmao') ||
      lowerTranscript.includes('😂')
    ) {
      momentType = 'silly_moment';
    }
    // Default to inside_joke if there's meaningful content
    else if (contentHint && contentHint.length > 20) {
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
