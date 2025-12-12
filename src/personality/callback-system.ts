/**
 * Callback System - The Smile Factor
 *
 * This is what makes users feel LOVED. We:
 * 1. Extract meaningful moments from what users share
 * 2. Store them for later follow-up
 * 3. Surface follow-up questions at the right time
 *
 * "How'd that conversation with your sister go? You were dreading it."
 * THAT makes people smile. Not "I drink coffee."
 *
 * @module personality/callback-system
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  UserMomentRecord,
  UserMomentCategory,
  PendingCallback,
  CallbackExtractionOptions,
} from './types.js';

const log = createLogger({ module: 'CallbackSystem' });

// ============================================================================
// CALLBACK EXTRACTION PATTERNS
// ============================================================================

/**
 * Patterns for detecting callback-worthy moments in user messages
 */
const CALLBACK_PATTERNS: Array<{
  pattern: RegExp;
  category: UserMomentCategory;
  followUpTemplate: string;
  alternates: string[];
  priority: 'high' | 'medium' | 'low';
  /** Days after which to follow up (0 = next conversation) */
  followUpDelay: number;
}> = [
  // UPCOMING EVENTS - High priority, specific timing
  {
    pattern:
      /(?:have|got|there'?s)\s+(?:a|an)\s+(\w+(?:\s+\w+)?)\s+(?:on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\w+day)/i,
    category: 'upcoming_event',
    followUpTemplate: "How'd the {event} go?",
    alternates: ['Tell me about the {event}!', 'How was the {event}?'],
    priority: 'high',
    followUpDelay: 1,
  },
  {
    pattern:
      /(?:interview|meeting|presentation|recital|performance|exam|test|appointment)\s+(?:on|this|next|tomorrow)/i,
    category: 'upcoming_event',
    followUpTemplate: "How'd it go?",
    alternates: ['Tell me how it went!', 'How was it?'],
    priority: 'high',
    followUpDelay: 1,
  },

  // DIFFICULT CONVERSATIONS - High priority
  {
    pattern:
      /(?:need to|have to|going to)\s+(?:talk|speak|tell|confront)\s+(?:to|with)\s+(?:my\s+)?(\w+)/i,
    category: 'relationship_moment',
    followUpTemplate: "How'd that conversation with {person} go?",
    alternates: ['Did you talk to {person}?', 'What happened with {person}?'],
    priority: 'high',
    followUpDelay: 0,
  },
  {
    pattern: /(?:dreading|nervous about|worried about)\s+(?:talking|speaking|telling)/i,
    category: 'relationship_moment',
    followUpTemplate: "How'd that conversation go? You were nervous about it.",
    alternates: ['Did you have that difficult conversation?'],
    priority: 'high',
    followUpDelay: 0,
  },

  // DECISIONS - Medium priority
  {
    pattern:
      /(?:thinking about|considering|might)\s+(?:quitting|leaving|changing|starting|ending)/i,
    category: 'decision_point',
    followUpTemplate: 'Any movement on that decision?',
    alternates: ['Have you decided yet?', 'Where are you at with that?'],
    priority: 'medium',
    followUpDelay: 3,
  },
  {
    pattern: /(?:should i|trying to decide|can'?t decide)/i,
    category: 'decision_point',
    followUpTemplate: 'Any clarity on that decision?',
    alternates: ['How are you feeling about that choice?'],
    priority: 'medium',
    followUpDelay: 3,
  },

  // STRUGGLES - Medium priority
  {
    pattern: /(?:having a hard time|been struggling|going through)/i,
    category: 'struggle',
    followUpTemplate: 'How are you doing with that?',
    alternates: ['How are things going?', 'Has anything shifted?'],
    priority: 'medium',
    followUpDelay: 0,
  },

  // GOALS - Medium priority
  {
    pattern: /(?:want to|trying to|going to)\s+(?:start|begin|learn|practice|do)/i,
    category: 'goal',
    followUpTemplate: 'Any progress on that goal?',
    alternates: ["How's that going?", 'Have you started?'],
    priority: 'medium',
    followUpDelay: 7,
  },

  // ACHIEVEMENTS - Low priority (celebrate, don't follow up)
  {
    pattern: /(?:finally|just|i)\s+(?:finished|completed|did|passed|got)/i,
    category: 'achievement',
    followUpTemplate: "Still riding that win? You should be proud!",
    alternates: ['Celebrated that yet?'],
    priority: 'low',
    followUpDelay: 7,
  },

  // HEALTH STUFF - Medium priority, sensitive
  {
    pattern: /(?:my\s+)?(?:mom|dad|parent|grandpa|grandma|spouse|partner)'?s?\s+health/i,
    category: 'ongoing_situation',
    followUpTemplate: "How's your {person} doing?",
    alternates: ['Any updates on {person}?'],
    priority: 'high',
    followUpDelay: 7,
  },
];

// ============================================================================
// CALLBACK EXTRACTION
// ============================================================================

/**
 * Extract callback-worthy moments from user message
 */
export function extractCallbackMoments(
  options: CallbackExtractionOptions
): Array<Omit<UserMomentRecord, 'id' | 'sharedAt'>> {
  const { userMessage } = options;
  const extracted: Array<Omit<UserMomentRecord, 'id' | 'sharedAt'>> = [];

  for (const pattern of CALLBACK_PATTERNS) {
    const match = userMessage.match(pattern.pattern);

    if (match) {
      // Extract keywords from the match
      const keywords = extractKeywords(userMessage);

      // Calculate emotional weight based on pattern priority and context
      let emotionalWeight = pattern.priority === 'high' ? 0.8 : pattern.priority === 'medium' ? 0.6 : 0.4;

      // Boost weight if emotionally charged
      if (options.emotionalState && ['stressed', 'anxious', 'sad', 'worried'].includes(options.emotionalState)) {
        emotionalWeight = Math.min(1, emotionalWeight + 0.2);
      }

      // Create follow-up question with any captured groups
      let followUpQuestion = pattern.followUpTemplate;
      let alternates = [...pattern.alternates];

      // Replace placeholders with captured groups
      if (match[1]) {
        const captured = match[1].toLowerCase();
        followUpQuestion = followUpQuestion.replace('{event}', captured);
        followUpQuestion = followUpQuestion.replace('{person}', captured);
        alternates = alternates.map(a => 
          a.replace('{event}', captured).replace('{person}', captured)
        );
      }

      // Calculate follow-up date
      const followUpAfter = pattern.followUpDelay > 0
        ? new Date(Date.now() + pattern.followUpDelay * 24 * 60 * 60 * 1000)
        : undefined;

      extracted.push({
        what: userMessage.slice(0, 100), // Truncate for storage
        keywords,
        emotionalWeight,
        category: pattern.category,
        followUpAfter,
        followUpQuestion,
        alternateQuestions: alternates,
        followedUp: false,
      });

      log.debug(
        {
          category: pattern.category,
          question: followUpQuestion,
          emotionalWeight,
        },
        '📝 Extracted callback-worthy moment'
      );

      // Only extract one per message to avoid overwhelming
      break;
    }
  }

  return extracted;
}

/**
 * Extract keywords from a message for later matching
 */
function extractKeywords(message: string): string[] {
  // Remove common words and extract meaningful ones
  const stopWords = new Set([
    'i', 'me', 'my', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'as', 'until', 'while', 'this', 'that', 'these', 'those', 'it',
    'its', 'got', 'going', 'really', 'think', 'know', 'feel', 'like', 'want',
  ]);

  const words = message.toLowerCase().split(/\s+/);
  return words
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .filter((word) => /^[a-z]+$/.test(word))
    .slice(0, 10); // Limit to 10 keywords
}

// ============================================================================
// CALLBACK PRIORITIZATION
// ============================================================================

/**
 * Get pending callbacks ready to surface
 */
export function getPendingCallbacks(
  userMoments: UserMomentRecord[]
): PendingCallback[] {
  const now = new Date();
  const callbacks: PendingCallback[] = [];

  for (const moment of userMoments) {
    // Skip if already followed up
    if (moment.followedUp) {
      continue;
    }

    // Check if follow-up date has passed (or no date = follow up anytime)
    if (moment.followUpAfter && new Date(moment.followUpAfter) > now) {
      continue;
    }

    // Determine priority based on emotional weight and category
    let priority: 'high' | 'medium' | 'low';
    if (moment.emotionalWeight > 0.7 || moment.category === 'upcoming_event') {
      priority = 'high';
    } else if (moment.emotionalWeight > 0.5) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    callbacks.push({
      userMomentId: moment.id,
      userId: '', // Will be filled in by caller
      topic: moment.category,
      originalContext: moment.what,
      priority,
      activeAfter: moment.followUpAfter || new Date(moment.sharedAt),
      question: moment.followUpQuestion,
      transitions: [
        'Hey, before we get into anything—',
        'I was thinking about you—',
        'Quick thing—',
        '',
      ],
    });
  }

  // Sort by priority (high first) then by age (older first)
  callbacks.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(a.activeAfter).getTime() - new Date(b.activeAfter).getTime();
  });

  return callbacks;
}

/**
 * Format a callback for prompt injection
 */
export function formatCallbackForPrompt(callback: PendingCallback): string {
  const transition = callback.transitions[Math.floor(Math.random() * callback.transitions.length)];

  return [
    '[💝 CALLBACK OPPORTUNITY - THE SMILE FACTOR]',
    '',
    'You have something to follow up on with this person:',
    '',
    `Original context: "${callback.originalContext}"`,
    `Follow-up question: "${callback.question}"`,
    `Suggested transition: "${transition}"`,
    '',
    'This is what makes people feel LOVED - that you remembered.',
    "Only bring this up if it feels natural. Don't force it.",
    'But this is GOLD. Use it.',
  ].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractCallbackMoments,
  getPendingCallbacks,
  formatCallbackForPrompt,
};
