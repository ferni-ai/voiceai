/**
 * Conflict Data Capture Definition
 *
 * Passively captures conflict mentions for the Conflict Resolution Memory.
 * Detects disagreements, arguments, and conflict situations.
 *
 * @module intelligence/data-capture/definitions/conflict.capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';

const log = createLogger({ module: 'data-capture:conflict' });

// Map conflict indicators to types
const CONFLICT_TYPE_MAP: Record<string, string> = {
  'disagreement': 'disagreement',
  'disagree': 'disagreement',
  'different opinion': 'disagreement',
  'misunderstanding': 'miscommunication',
  'miscommunication': 'miscommunication',
  "didn't understand": 'miscommunication',
  'crossed a line': 'boundary_violation',
  'boundary': 'boundary_violation',
  'overstepped': 'boundary_violation',
  'let down': 'unmet_expectations',
  'disappointed': 'unmet_expectations',
  "didn't follow through": 'unmet_expectations',
  "didn't do what": 'unmet_expectations',
  'same fight': 'recurring_issue',
  'again': 'recurring_issue',
  'keeps happening': 'recurring_issue',
  'always': 'recurring_issue',
  'argument': 'disagreement',
  'fight': 'disagreement',
  'blowup': 'emotional_flooding',
  'exploded': 'emotional_flooding',
  'lost it': 'emotional_flooding',
  'snapped': 'emotional_flooding',
};

export const conflictCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_conflict',
  name: 'Conflict Capture',
  description: 'Captures conflict situations for the Conflict Resolution Memory',
  category: 'relationship',

  triggers: {
    phrases: [
      'got into a fight with',
      'had an argument with',
      'disagreed with',
      "we're not talking",
      'had a falling out',
      'things are tense with',
      "i'm upset with",
      'had a conflict with',
      'got into it with',
      "we're fighting",
      'blew up at',
      'snapped at',
      'lost my temper',
      "we're having issues",
    ],
    patterns: [
      /(?:got into|had)\s+(?:a|an)?\s*(fight|argument|disagreement|conflict)\s+with\s+(\w+)/i,
      /(\w+)\s+and\s+i\s+(?:are|had)\s+(?:fighting|arguing|not talking)/i,
      /(?:i'm|i am)\s+(?:upset|angry|frustrated|mad)\s+(?:at|with)\s+(\w+)/i,
      /(?:we|my\s+\w+\s+and\s+i)\s+(?:had|got into)\s+(?:a|an)?\s*(fight|argument)/i,
      /things\s+(?:are|have been)\s+(?:tense|difficult|rough)\s+(?:with|between)\s+(?:me and\s+)?(\w+)/i,
    ],
    keywords: [
      { word: 'fight', weight: 0.9 },
      { word: 'argument', weight: 0.9 },
      { word: 'conflict', weight: 0.9 },
      { word: 'disagreement', weight: 0.8 },
      { word: 'tense', weight: 0.7 },
      { word: 'upset', weight: 0.6 },
      { word: 'angry', weight: 0.7 },
      { word: 'not talking', weight: 0.9 },
    ],
    antiKeywords: ['what if we', 'hypothetically', 'in the movie', 'in the book', "don't want to"],
  },

  arguments: [
    {
      name: 'person',
      type: 'string',
      description: 'Who the conflict is with',
      required: true,
      extractionPatterns: [
        /(?:with|at)\s+(?:my\s+)?(\w+)/i,
        /(\w+)\s+and\s+i/i,
        /between\s+(?:me\s+and\s+)?(?:my\s+)?(\w+)/i,
      ],
    },
    {
      name: 'relationship',
      type: 'string',
      description: 'Relationship to the person',
      required: false,
      extractionPatterns: [
        /my\s+(mom|mother|dad|father|sister|brother|husband|wife|partner|boss|coworker|friend|roommate)/i,
      ],
    },
    {
      name: 'conflictType',
      type: 'string',
      description: 'What type of conflict',
      required: false,
      extractionPatterns: [
        /(fight|argument|disagreement|misunderstanding|boundary|let down|disappointed)/i,
        /(?:same|keeps happening|again|always)/i,
      ],
    },
    {
      name: 'trigger',
      type: 'string',
      description: 'What triggered the conflict',
      required: false,
      extractionPatterns: [
        /(?:about|over|because of)\s+(.+?)(?:\.|,|$)/i,
        /(?:because|when)\s+(.+?)(?:\.|,|$)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.6,
    patternMatchBonus: 0.2,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const person = String(extractedArgs.person || '').trim();
    const relationship = String(extractedArgs.relationship || '').toLowerCase().trim() || 'other';
    const rawConflictType = String(extractedArgs.conflictType || '').toLowerCase();
    const trigger = String(extractedArgs.trigger || '').slice(0, 200);

    if (!person) {
      log.debug('No person identified for conflict');
      return null;
    }

    // Determine conflict type
    let conflictType = 'disagreement';
    for (const [key, type] of Object.entries(CONFLICT_TYPE_MAP)) {
      if (rawConflictType.includes(key) || context.transcript.toLowerCase().includes(key)) {
        conflictType = type;
        break;
      }
    }

    try {
      const { recordConflict } = await import('../../../services/superhuman/conflict-resolution-memory.js');

      await recordConflict(context.userId, {
        withPerson: person,
        relationship,
        conflictType: conflictType as 'disagreement' | 'miscommunication' | 'boundary_violation' | 'unmet_expectations' | 'values_clash' | 'recurring_issue' | 'external_stress' | 'emotional_flooding',
        triggers: trigger ? [trigger] : [],
        approachesTried: [],
        effectiveApproaches: [],
        ineffectiveApproaches: [],
        outcome: 'ongoing',
        cooldownNeeded: 0,
      });

      log.info(
        { person, conflictType, userId: context.userId },
        'Captured conflict from conversation'
      );

      // Acknowledge gently - let them know we're tracking it
      return null; // Silent capture to not interrupt
    } catch (error) {
      log.error({ error: String(error), person }, 'Failed to capture conflict');
      return null;
    }
  },
};

