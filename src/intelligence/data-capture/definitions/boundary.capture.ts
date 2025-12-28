/**
 * Boundary Data Capture Definition
 *
 * Passively captures sensitive topics and boundaries for Protective Silence.
 * Detects topics that are painful, off-limits, or sensitive for the user.
 *
 * @module intelligence/data-capture/definitions/boundary.capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';

const log = createLogger({ module: 'data-capture:boundary' });

// Category detection
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  loss: [
    'death',
    'died',
    'passed away',
    'funeral',
    'lost',
    'gone',
    'miscarriage',
    'divorce',
    'breakup',
  ],
  trauma: ['abuse', 'assault', 'accident', 'trauma', 'ptsd', 'attacked'],
  health: ['diagnosis', 'cancer', 'disease', 'illness', 'surgery', 'hospital', 'mental health'],
  family: ['family', 'parent', 'dad', 'mom', 'sibling', 'brother', 'sister', 'estranged'],
  relationship: ['ex', 'breakup', 'divorce', 'cheated', 'affair', 'separated'],
  work: ['fired', 'laid off', 'job loss', 'failed', 'rejected'],
  financial: ['debt', 'bankruptcy', 'broke', 'foreclosure', 'money problems'],
  achievement: ['failed', "didn't get", 'rejected', 'passed over', "didn't make it"],
};

export const boundaryCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_boundary',
  name: 'Boundary Capture',
  description: 'Captures sensitive topics for Protective Silence',
  category: 'safety',

  triggers: {
    phrases: [
      "i don't want to talk about",
      "don't ask me about",
      "i can't discuss",
      "please don't mention",
      "it's too painful to talk about",
      "i'd rather not discuss",
      "let's not go there",
      'can we change the subject',
      "i'm not ready to talk about",
      'still too raw',
      'too soon to talk about',
      'i hate when people bring up',
      'please avoid',
      'off limits',
    ],
    patterns: [
      /(?:don't|do not|please don't)\s+(?:ask|talk|bring up|mention)\s+(?:about\s+)?(.+)/i,
      /(?:i|we)\s+(?:don't|can't|won't)\s+(?:talk|discuss)\s+(?:about\s+)?(.+)/i,
      /(?:too|still)\s+(?:painful|hard|difficult|raw|soon)\s+to\s+(?:talk|discuss|think)\s+about/i,
      /(?:let's|can we)\s+(?:not|change|avoid)\s+(?:go there|the subject|that topic)/i,
      /(?:off limits|taboo|forbidden topic)/i,
    ],
    keywords: [
      { word: "don't talk about", weight: 0.95 },
      { word: 'off limits', weight: 0.95 },
      { word: "can't discuss", weight: 0.9 },
      { word: 'too painful', weight: 0.9 },
      { word: 'too raw', weight: 0.85 },
      { word: 'rather not', weight: 0.8 },
      { word: 'change the subject', weight: 0.85 },
    ],
    antiKeywords: [],
  },

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'The sensitive topic to avoid',
      required: true,
      extractionPatterns: [
        /(?:don't|do not)\s+(?:ask|talk|bring up|mention)\s+(?:about\s+)?(.+?)(?:\.|,|$)/i,
        /(?:talk|discuss)\s+(?:about\s+)?(.+?)(?:\.|,|$)/i,
        /(?:too|still)\s+(?:painful|hard|raw)\s+to\s+(?:talk|discuss)\s+about\s+(.+?)(?:\.|,|$)/i,
      ],
    },
    {
      name: 'severity',
      type: 'string',
      description: 'How strong the boundary is',
      required: false,
      extractionPatterns: [
        /(never|ever|absolutely|please|really)/i,
        /(too painful|can't handle|breaks me|hurts too much)/i,
      ],
    },
    {
      name: 'reason',
      type: 'string',
      description: 'Why this is sensitive',
      required: false,
      extractionPatterns: [/(?:because|since|after)\s+(.+?)(?:\.|,|$)/i],
    },
  ],

  confidence: {
    baseScore: 0.7,
    patternMatchBonus: 0.2,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.2,
  },

  handler: async (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const topic = String(extractedArgs.topic || '').trim();
    const severityIndicator = String(extractedArgs.severity || '').toLowerCase();
    const reason = String(extractedArgs.reason || '').slice(0, 300);

    if (!topic || topic.length < 3) {
      log.debug('No valid topic identified for boundary');
      return null;
    }

    // Determine severity
    let severity: 'never' | 'only_if_they_bring_up' | 'gentle_only' | 'time_sensitive' =
      'only_if_they_bring_up';
    if (
      severityIndicator.includes('never') ||
      severityIndicator.includes('absolutely') ||
      severityIndicator.includes("can't handle") ||
      severityIndicator.includes('too painful')
    ) {
      severity = 'never';
    } else if (severityIndicator.includes('please') || severityIndicator.includes('really')) {
      severity = 'only_if_they_bring_up';
    }

    // Determine category
    let category:
      | 'loss'
      | 'trauma'
      | 'health'
      | 'family'
      | 'relationship'
      | 'work'
      | 'financial'
      | 'identity'
      | 'comparison'
      | 'achievement'
      | 'other' = 'other';
    const topicLower = topic.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => topicLower.includes(kw))) {
        category = cat as typeof category;
        break;
      }
    }

    // Extract trigger keywords
    const triggerKeywords = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    try {
      const { recordBoundary } = await import('../../../services/superhuman/protective-silence.js');

      await recordBoundary(context.userId, {
        topic,
        severity,
        category,
        reason: reason || undefined,
        triggerKeywords,
        source: 'user_stated',
      });

      log.info(
        { topic, severity, category, userId: context.userId },
        'Captured boundary from conversation'
      );

      // Acknowledge respectfully
      return "I hear you. I won't bring that up.";
    } catch (error) {
      log.error({ error: String(error), topic }, 'Failed to capture boundary');
      return null;
    }
  },
};
