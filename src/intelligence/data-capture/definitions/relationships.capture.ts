/**
 * Relationship Data Capture Definition
 *
 * Passively captures mentions of people in the user's life and their sentiment.
 * Feeds into the Relationship Network superhuman service.
 *
 * Examples:
 * - "I had lunch with Sarah today"
 * - "My boss has been really supportive"
 * - "I miss my friend John"
 */

import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'RelationshipCapture' });

// Sentiment keywords
const POSITIVE_KEYWORDS = [
  'love',
  'great',
  'amazing',
  'wonderful',
  'supportive',
  'helpful',
  'kind',
  'fun',
  'happy',
  'excited',
  'proud',
  'grateful',
  'thankful',
  'enjoyed',
  'laughed',
];

const NEGATIVE_KEYWORDS = [
  'angry',
  'frustrated',
  'annoyed',
  'upset',
  'disappointed',
  'hurt',
  'miss',
  'worried',
  'concerned',
  'difficult',
  'hard',
  'fight',
  'argument',
];

const RELATIONSHIP_INDICATORS: Record<string, string> = {
  mom: 'family',
  mother: 'family',
  dad: 'family',
  father: 'family',
  sister: 'family',
  brother: 'family',
  wife: 'family',
  husband: 'family',
  partner: 'family',
  son: 'family',
  daughter: 'family',
  grandma: 'family',
  grandpa: 'family',
  aunt: 'family',
  uncle: 'family',
  cousin: 'family',
  boss: 'colleague',
  coworker: 'colleague',
  colleague: 'colleague',
  manager: 'colleague',
  friend: 'friend',
  buddy: 'friend',
  roommate: 'friend',
  neighbor: 'acquaintance',
  therapist: 'professional',
  doctor: 'professional',
};

function detectSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lowerText = text.toLowerCase();
  const positiveCount = POSITIVE_KEYWORDS.filter((word) => lowerText.includes(word)).length;
  const negativeCount = NEGATIVE_KEYWORDS.filter((word) => lowerText.includes(word)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function detectRelationshipType(name: string, context: string): string {
  const lowerName = name.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Direct relationship term used as name
  if (RELATIONSHIP_INDICATORS[lowerName]) {
    return RELATIONSHIP_INDICATORS[lowerName];
  }

  // Look for relationship indicators in context
  for (const [indicator, type] of Object.entries(RELATIONSHIP_INDICATORS)) {
    if (lowerContext.includes(`my ${indicator}`) || lowerContext.includes(`${indicator} ${name}`)) {
      return type;
    }
  }

  // Default to friend for named individuals
  return 'friend';
}

export const relationshipCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_relationship',
  name: 'Relationship Capture',
  description: 'Captures mentions of people and relationships in conversation',
  category: 'relationship',

  triggers: {
    phrases: [
      'i talked to',
      'i called',
      'i met with',
      'i saw',
      'i visited',
      'i had lunch with',
      'i had dinner with',
      'i went out with',
      'my friend',
      'my sister',
      'my brother',
      'my mom',
      'my dad',
      'my boss',
      'my coworker',
      'i miss',
      'i love',
    ],
    patterns: [
      // "I talked to Sarah today"
      /i\s+(?:talked|spoke)\s+(?:to|with)\s+(\w+)/i,
      // "I had lunch with John"
      /i\s+had\s+(?:lunch|dinner|coffee|drinks)\s+with\s+(\w+)/i,
      // "My friend Sarah is..."
      /my\s+(?:friend|sister|brother|mom|dad|boss)\s+(\w+)/i,
      // "Sarah and I went..."
      /(\w+)\s+and\s+i\s+(?:went|had|did)/i,
      // "I miss John"
      /i\s+miss\s+(\w+)/i,
      // "I saw Lisa yesterday"
      /i\s+saw\s+(\w+)/i,
    ],
    keywords: [
      { word: 'talked', weight: 0.7 },
      { word: 'called', weight: 0.7 },
      { word: 'met', weight: 0.7 },
      { word: 'visited', weight: 0.7 },
      { word: 'lunch', weight: 0.5 },
      { word: 'dinner', weight: 0.5 },
      { word: 'friend', weight: 0.6 },
      { word: 'miss', weight: 0.8 },
    ],
    antiKeywords: ['what if', 'should i', 'how do i', '?'],
  },

  arguments: [
    {
      name: 'personName',
      type: 'string',
      description: 'Name of the person mentioned',
      required: true,
      extractionPatterns: [
        /i\s+(?:talked|spoke)\s+(?:to|with)\s+(\w+)/i,
        /i\s+had\s+\w+\s+with\s+(\w+)/i,
        /my\s+(?:friend|sister|brother|mom|dad|boss)\s+(\w+)/i,
        /(\w+)\s+and\s+i/i,
        /i\s+miss\s+(\w+)/i,
        /i\s+saw\s+(\w+)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.4,
    patternMatchBonus: 0.4,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const { personName } = extractedArgs as { personName?: string };

    if (!personName || personName.length < 2) {
      log.debug({ extractedArgs }, 'Person name too short or missing');
      return null;
    }

    // Skip common non-names
    const skipWords = ['i', 'me', 'you', 'they', 'them', 'it', 'we', 'something', 'someone'];
    if (skipWords.includes(personName.toLowerCase())) {
      return null;
    }

    // Capitalize properly
    const cleanName = personName.charAt(0).toUpperCase() + personName.slice(1).toLowerCase();

    const sentiment = detectSentiment(context.transcript);
    const relationship = detectRelationshipType(personName, context.transcript);

    try {
      const { recordMention } = await import('../../../services/superhuman/relationship-network.js');
      // Map to valid RelationshipType
      const validType = ((): 'family' | 'friend' | 'colleague' | 'mentor' | 'partner' | 'acquaintance' | 'complicated' => {
        switch (relationship) {
          case 'family': return 'family';
          case 'friend': return 'friend';
          case 'colleague': return 'colleague';
          case 'mentor': return 'mentor';
          case 'romantic': return 'partner';
          default: return 'acquaintance';
        }
      })();
      await recordMention(context.userId, {
        name: cleanName,
        type: validType,
        context: context.transcript.slice(0, 100),
      });

      log.info(
        { name: cleanName, relationship, sentiment, userId: context.userId },
        'Captured relationship mention from conversation'
      );

      // Don't verbally acknowledge relationship captures - too intrusive
      // The value is in remembering for later
      return null;
    } catch (error) {
      log.error({ error: String(error), extractedArgs }, 'Failed to capture relationship');
      return null;
    }
  },
};

