/**
 * Semantic Calendar Intelligence
 *
 * Enhanced calendar intent detection using semantic similarity.
 * Catches natural phrasing that keyword matching misses:
 *
 * - "When's my next dentist appointment?" → Calendar lookup
 * - "I need to remember to call Sarah tomorrow" → Schedule event
 * - "Push my Tuesday meeting to next week" → Reschedule
 * - "What do I have going on this weekend?" → Calendar query
 *
 * @module SemanticCalendar
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticCalendar' });

// ============================================================================
// TYPES
// ============================================================================

export type CalendarIntentType =
  | 'query' // What's on my calendar?
  | 'create' // Add/schedule something
  | 'reschedule' // Move an event
  | 'cancel' // Remove an event
  | 'reminder' // Set a reminder
  | 'availability' // When am I free?
  | 'conflict' // Double-booked
  | 'none'; // Not calendar-related

export interface CalendarIntent {
  type: CalendarIntentType;
  confidence: number;
  reason: string;
  extractedInfo?: {
    timeReference?: string; // "tomorrow", "next week", "Tuesday"
    eventType?: string; // "meeting", "appointment", "call"
    person?: string; // "Sarah", "my dentist"
    action?: string; // "schedule", "cancel", "move"
  };
}

// ============================================================================
// SEMANTIC PATTERNS
// ============================================================================

const CALENDAR_PATTERNS: Record<
  CalendarIntentType,
  {
    strongPatterns: RegExp[];
    weakPatterns: RegExp[];
    examples: string[];
  }
> = {
  query: {
    strongPatterns: [
      /\b(what('s| is|'re| are)?|when('s| is)?)\s*(on\s*)?(my\s*)?(calendar|schedule|agenda|day|week)/i,
      /\b(what|when)\s*(do\s*I|have\s*I)\s*(have|got)\s*(going\s*on|planned|scheduled)/i,
      /\b(what's|what is)\s*(happening|coming\s*up|on\s*tap)/i,
      /\b(show|tell|check)\s*(me\s*)?(my\s*)?(calendar|schedule|day)/i,
      /\bwhat's\s*(on\s*)?for\s*(today|tomorrow|this\s*week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /\b(do\s*I|have\s*I)\s*(have\s*)?(anything|something)\s*(planned|scheduled|going\s*on)/i,
      /\bam\s*I\s*(free|busy|available)\s*(on|this|tomorrow|next)/i,
      /\b(when('s| is)?|what\s*time\s*(is)?)\s*(my\s*next|the\s*next|my)\s*(appointment|meeting|call|event)/i,
      /\b(look\s*up|check|find)\s*(my\s*)?(next\s*)?(appointment|meeting|dentist|doctor)/i,
    ],
    weakPatterns: [
      /\b(calendar|schedule|agenda|appointment|meeting|event)/i,
      /\b(today|tomorrow|this\s*week|next\s*week|monday|tuesday|wednesday|thursday|friday)/i,
      /\b(morning|afternoon|evening|night)/i,
      /\b(busy|free|available|open)/i,
      /\b(planned|scheduled|booked)/i,
    ],
    examples: [
      "What's on my calendar today?",
      'When is my next dentist appointment?',
      'What do I have going on this weekend?',
      'Am I free tomorrow afternoon?',
      'Show me my schedule for next week',
    ],
  },

  create: {
    strongPatterns: [
      /\b(schedule|add|create|put|book|set\s*up|plan)\s*(a\s*)?(meeting|appointment|call|event|reminder)/i,
      /\b(I\s*need\s*to|remind\s*me\s*to|don't\s*let\s*me\s*forget\s*to)\s+\w+/i,
      /\b(block|reserve|hold)\s*(time|my\s*calendar|that\s*time|the\s*slot)/i,
      /\b(put|add)\s+(it\s+)?(on|to)\s*(my\s*)?(calendar|schedule)/i,
      /\b(can\s*you|please)\s*(add|schedule|book|create)\s*(a|an|the)?/i,
      /\b(set\s*up|arrange|organize)\s*(a\s*)?(call|meeting|time|appointment)/i,
      /\b(calendar|schedule)\s*(that|this|the|a)/i,
    ],
    weakPatterns: [
      /\b(schedule|book|reserve|plan)/i,
      /\b(meeting|appointment|call|event)/i,
      /\b(at\s*\d{1,2}(:\d{2})?(\s*(am|pm))?)/i,
      /\b(for\s*(tomorrow|next|this|monday|tuesday|wednesday|thursday|friday))/i,
      /\b(with\s+\w+)/i,
    ],
    examples: [
      'Schedule a meeting with John tomorrow at 2pm',
      'Add dentist appointment to my calendar',
      'I need to remember to call Sarah tomorrow',
      'Block some time for deep work on Friday',
      'Set up a call with the team next week',
    ],
  },

  reschedule: {
    strongPatterns: [
      /\b(reschedule|move|push|postpone|shift|change)\s*(my\s*)?(meeting|appointment|call|event)/i,
      /\b(can\s*(we|I)|let's)\s*(move|push|reschedule|postpone)/i,
      /\b(move|push|shift)\s*(it|that|my|the)\s*(to|back|forward|earlier|later)/i,
      /\b(change|switch)\s*(the\s*)?(time|date|day)\s*(of|for)/i,
      /\b(bump|delay)\s*(it|that|my|the)/i,
    ],
    weakPatterns: [
      /\b(reschedule|move|postpone|push)/i,
      /\b(to\s*(a\s*)?different|to\s*another)/i,
      /\b(earlier|later|next\s*week|different\s*time)/i,
    ],
    examples: [
      'Push my Tuesday meeting to next week',
      'Reschedule the dentist appointment',
      "Move tomorrow's call to Thursday",
      'Can we push back the 3pm meeting?',
    ],
  },

  cancel: {
    strongPatterns: [
      /\b(cancel|remove|delete)\s*(my\s*)?(meeting|appointment|call|event)/i,
      /\b(cancel|remove|delete)\s*(the|that|tomorrow'?s?)/i,
      /\b(clear|free\s*up|wipe)\s*(my\s*)?(calendar|schedule|day)/i,
      /\b(I\s*(need\s*to|have\s*to|should)\s*)?(cancel|bail\s*on|skip)/i,
      /\b(take|get)\s*(that|the|it)\s*(off|out\s*of)\s*(my\s*)?(calendar|schedule)/i,
    ],
    weakPatterns: [
      /\b(cancel|remove|delete|clear)/i,
      /\b(skip|bail|back\s*out)/i,
    ],
    examples: [
      'Cancel my 3pm meeting',
      'Remove the dentist appointment from my calendar',
      'Clear my afternoon',
      'I need to cancel on Sarah',
    ],
  },

  reminder: {
    strongPatterns: [
      /\b(remind\s*me|set\s*(a\s*)?reminder|don't\s*let\s*me\s*forget)/i,
      /\b(I\s*need\s*to\s*remember|help\s*me\s*remember)/i,
      /\b(ping|alert|notify)\s*me\s*(when|before|at)/i,
      /\b(reminder\s*to|reminder\s*for|reminder\s*about)/i,
    ],
    weakPatterns: [
      /\b(remind|reminder|remember|forget)/i,
      /\b(before|at|when|in\s*\d+\s*(minutes|hours|days))/i,
    ],
    examples: [
      'Remind me to call mom tomorrow',
      "Don't let me forget the meeting",
      'Set a reminder for 30 minutes before',
      'Ping me when Sarah arrives',
    ],
  },

  availability: {
    strongPatterns: [
      /\b(when\s*(am|are)\s*I|when\s*('m|are\s*we))\s*(free|available|open)/i,
      /\b(find|check|look\s*for)\s*(a\s*)?(free|open|available)\s*(time|slot|window)/i,
      /\b(what('s| is)|when('s| is))\s*(a\s*)?(good|free|open)\s*time/i,
      /\b(can\s*I|do\s*I\s*have)\s*(fit|squeeze)\s*(in|something)/i,
      /\b(any|some)\s*(openings?|free\s*time|availability)/i,
      /\b(have\s*I|do\s*I\s*have)\s*(any\s*)?(free\s*time|openings|availability)/i,
    ],
    weakPatterns: [
      /\b(free|available|open|busy)/i,
      /\b(time|slot|window|opening)/i,
      /\b(fit|squeeze|make\s*room)/i,
    ],
    examples: [
      'When am I free this week?',
      "Find a time I'm available tomorrow",
      'Do I have any openings on Friday?',
      'Can I fit in a lunch meeting?',
    ],
  },

  conflict: {
    strongPatterns: [
      /\b(double[- ]?booked|overbooked|conflict|overlap)/i,
      /\b(I\s*(have|got)\s*(two|2|multiple)\s*(things|meetings|events))\s*(at\s*the\s*same)/i,
      /\b(scheduled\s*at\s*the\s*same\s*time)/i,
      /\b(conflict(s|ing)?|clash(es|ing)?)\s*(with|between)/i,
    ],
    weakPatterns: [
      /\b(conflict|overlap|clash)/i,
      /\b(same\s*time|double)/i,
    ],
    examples: [
      "I'm double-booked on Tuesday",
      'There is a conflict with my 2pm meeting',
      'I have two things at the same time',
    ],
  },

  none: {
    strongPatterns: [],
    weakPatterns: [],
    examples: [],
  },
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect calendar intent from user message
 */
export function detectCalendarIntent(message: string): CalendarIntent {
  const scores: Array<{ type: CalendarIntentType; score: number; reason: string }> = [];

  for (const [intentType, patterns] of Object.entries(CALENDAR_PATTERNS)) {
    if (intentType === 'none') continue;

    let strongMatches = 0;
    let weakMatches = 0;
    const matchedStrong: string[] = [];
    const matchedWeak: string[] = [];

    for (const pattern of patterns.strongPatterns) {
      if (pattern.test(message)) {
        strongMatches++;
        matchedStrong.push(pattern.source.slice(0, 30));
      }
    }

    for (const pattern of patterns.weakPatterns) {
      if (pattern.test(message)) {
        weakMatches++;
        matchedWeak.push(pattern.source.slice(0, 20));
      }
    }

    // Score: Strong matches worth 0.4, weak worth 0.1
    const strongScore = Math.min(0.8, strongMatches * 0.4);
    const weakScore = Math.min(0.3, weakMatches * 0.1);
    const score = strongScore + weakScore;

    if (score > 0) {
      const reason = [
        strongMatches > 0 ? `${strongMatches} strong` : '',
        weakMatches > 0 ? `${weakMatches} weak` : '',
      ]
        .filter(Boolean)
        .join(', ');

      scores.push({
        type: intentType as CalendarIntentType,
        score,
        reason,
      });
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // Best match needs >= 0.4
  if (scores.length === 0 || scores[0].score < 0.4) {
    return {
      type: 'none',
      confidence: 0,
      reason: 'No calendar intent detected',
    };
  }

  const best = scores[0];

  // Extract relevant info
  const extractedInfo = extractCalendarInfo(message, best.type);

  log.debug(
    { type: best.type, confidence: best.score, reason: best.reason },
    '📅 Calendar intent detected'
  );

  return {
    type: best.type,
    confidence: Math.min(0.95, best.score),
    reason: best.reason,
    extractedInfo,
  };
}

/**
 * Extract calendar-relevant information from the message
 */
function extractCalendarInfo(
  message: string,
  _intentType: CalendarIntentType
): CalendarIntent['extractedInfo'] {
  const info: CalendarIntent['extractedInfo'] = {};

  // Time references
  const timeMatch = message.match(
    /\b(today|tomorrow|tonight|this\s*(morning|afternoon|evening|week|weekend)|next\s*(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s*\d{1,2}(:\d{2})?(\s*(am|pm))?)/i
  );
  if (timeMatch) {
    info.timeReference = timeMatch[0];
  }

  // Event type
  const eventMatch = message.match(
    /\b(meeting|appointment|call|event|lunch|dinner|breakfast|interview|presentation|review|standup|1:1|one-on-one)/i
  );
  if (eventMatch) {
    info.eventType = eventMatch[0].toLowerCase();
  }

  // Person
  const personMatch = message.match(/\b(with\s+)(\w+)|(\w+)'s\s+(meeting|appointment|call)/i);
  if (personMatch) {
    info.person = personMatch[2] || personMatch[3];
  }

  // Action verbs
  const actionMatch = message.match(
    /\b(schedule|add|create|cancel|remove|delete|move|push|reschedule|remind|book)/i
  );
  if (actionMatch) {
    info.action = actionMatch[0].toLowerCase();
  }

  return Object.keys(info).length > 0 ? info : undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { detectCalendarIntent as default };
