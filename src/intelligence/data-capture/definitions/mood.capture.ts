/**
 * Mood Data Capture Definition
 *
 * Passively captures mood signals from user speech for the Mood Calendar.
 * Detects explicit emotion statements and implicit mood indicators.
 *
 * @module intelligence/data-capture/definitions/mood.capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';

const log = createLogger({ module: 'data-capture:mood' });

// Map common emotion words to MoodType
const MOOD_WORD_MAP: Record<string, { mood: string; intensity: number }> = {
  // Positive
  happy: { mood: 'content', intensity: 0.7 },
  excited: { mood: 'joyful', intensity: 0.9 },
  great: { mood: 'content', intensity: 0.7 },
  amazing: { mood: 'joyful', intensity: 0.9 },
  good: { mood: 'content', intensity: 0.5 },
  peaceful: { mood: 'calm', intensity: 0.6 },
  calm: { mood: 'calm', intensity: 0.5 },
  relieved: { mood: 'calm', intensity: 0.6 },
  hopeful: { mood: 'hopeful', intensity: 0.7 },
  grateful: { mood: 'content', intensity: 0.8 },
  // Negative
  sad: { mood: 'sad', intensity: 0.7 },
  down: { mood: 'sad', intensity: 0.5 },
  depressed: { mood: 'sad', intensity: 0.9 },
  anxious: { mood: 'anxious', intensity: 0.7 },
  worried: { mood: 'anxious', intensity: 0.5 },
  nervous: { mood: 'anxious', intensity: 0.6 },
  stressed: { mood: 'overwhelmed', intensity: 0.7 },
  overwhelmed: { mood: 'overwhelmed', intensity: 0.8 },
  frustrated: { mood: 'frustrated', intensity: 0.7 },
  angry: { mood: 'frustrated', intensity: 0.8 },
  exhausted: { mood: 'exhausted', intensity: 0.8 },
  tired: { mood: 'exhausted', intensity: 0.5 },
  drained: { mood: 'exhausted', intensity: 0.7 },
  // Neutral
  okay: { mood: 'neutral', intensity: 0.3 },
  fine: { mood: 'neutral', intensity: 0.3 },
  alright: { mood: 'neutral', intensity: 0.3 },
};

export const moodCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_mood',
  name: 'Mood Capture',
  description: 'Passively captures mood signals for the Mood Calendar',
  category: 'emotional',

  triggers: {
    phrases: [
      'i feel',
      "i'm feeling",
      'feeling',
      'i am',
      "i've been",
      "today i'm",
      'right now i feel',
      "lately i've been",
      "this week i've felt",
      'been feeling',
    ],
    patterns: [
      /i(?:'m| am| feel| have been)?\s+(so\s+)?(happy|sad|anxious|stressed|overwhelmed|exhausted|tired|frustrated|excited|calm|worried|nervous|down|great|good|okay|fine)/i,
      /feeling\s+(so\s+)?(happy|sad|anxious|stressed|overwhelmed|exhausted|tired|frustrated|excited|calm|worried|nervous|down|great|good|okay|fine)/i,
      /(?:today|lately|recently|this week)\s+(?:i(?:'ve)?|has)\s+been\s+(rough|hard|tough|great|good|difficult|exhausting)/i,
    ],
    keywords: [
      { word: 'feel', weight: 0.8 },
      { word: 'feeling', weight: 0.8 },
      { word: 'mood', weight: 0.9 },
      { word: 'emotion', weight: 0.7 },
    ],
    // Don't capture if they're asking about someone else's feelings
    antiKeywords: [
      'how do you feel',
      'does she feel',
      'does he feel',
      'do they feel',
      'what do you think',
    ],
  },

  arguments: [
    {
      name: 'mood',
      type: 'string',
      description: 'The detected mood type',
      required: true,
      extractionPatterns: [
        /i(?:'m| am| feel)?\s+(so\s+)?(\w+)/i,
        /feeling\s+(so\s+)?(\w+)/i,
        /been\s+(so\s+)?(\w+)/i,
      ],
    },
    {
      name: 'intensity',
      type: 'string',
      description: 'How intense the feeling is',
      required: false,
      extractionPatterns: [
        /(?:so|really|very|extremely|incredibly)\s+(\w+)/i,
        /(\w+)\s+(?:today|right now|lately)/i,
      ],
    },
    {
      name: 'context',
      type: 'string',
      description: 'What triggered or relates to this mood',
      required: false,
      extractionPatterns: [/because\s+(.+?)(?:\.|,|$)/i, /(?:about|over|from)\s+(.+?)(?:\.|,|$)/i],
    },
  ],

  confidence: {
    baseScore: 0.5,
    patternMatchBonus: 0.2,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const rawMood = String(extractedArgs.mood || '')
      .toLowerCase()
      .trim();
    const hasIntensifier =
      String(extractedArgs.intensity || '')
        .toLowerCase()
        .includes('so') ||
      String(extractedArgs.intensity || '')
        .toLowerCase()
        .includes('really') ||
      String(extractedArgs.intensity || '')
        .toLowerCase()
        .includes('very');

    // Find the mapped mood
    const moodMapping = MOOD_WORD_MAP[rawMood];
    if (!moodMapping) {
      log.debug({ rawMood }, 'No mood mapping found');
      return null;
    }

    // Adjust intensity based on intensifiers
    let intensity = moodMapping.intensity;
    if (hasIntensifier) {
      intensity = Math.min(1, intensity + 0.2);
    }

    const moodContext = String(extractedArgs.context || '').slice(0, 200);

    try {
      const { recordMoodEntry } = await import('../../../services/superhuman/mood-calendar.js');

      await recordMoodEntry(
        context.userId,
        moodMapping.mood as
          | 'joyful'
          | 'content'
          | 'calm'
          | 'neutral'
          | 'anxious'
          | 'sad'
          | 'frustrated'
          | 'overwhelmed'
          | 'exhausted'
          | 'hopeful',
        intensity,
        moodContext || undefined,
        rawMood ? [rawMood] : undefined
      );

      log.info(
        { mood: moodMapping.mood, intensity, userId: context.userId },
        'Captured mood entry from conversation'
      );

      // Silently capture - don't interrupt the flow
      return null;
    } catch (error) {
      log.error({ error: String(error), rawMood }, 'Failed to capture mood');
      return null;
    }
  },
};
