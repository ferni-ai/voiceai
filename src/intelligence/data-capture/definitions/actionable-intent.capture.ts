/**
 * Actionable Intent Data Capture Definition
 *
 * Detects actionable phrases in conversation and surfaces suggestions
 * to the LLM for calendar events, tasks, and reminders.
 *
 * Unlike passive capture (which stores data silently), this actively
 * guides the LLM to offer creating items for the user.
 *
 * Examples:
 * - "I have a dentist appointment Tuesday" → Offer calendar event
 * - "Remind me to call mom tomorrow" → Offer reminder
 * - "I need to finish that report by Friday" → Offer task
 * - "Let's meet for coffee next week" → Offer calendar event
 */

import type { DataCaptureDefinition, DataCaptureContext } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ActionableIntentCapture' });

// ============================================================================
// TYPES
// ============================================================================

type ActionableType = 'calendar_event' | 'reminder' | 'task';

interface ParsedIntent {
  type: ActionableType;
  action: string;
  timeExpression?: string;
  who?: string;
  where?: string;
  confidence: number;
}

// ============================================================================
// TIME EXPRESSIONS
// ============================================================================

const TIME_EXPRESSIONS = [
  // Days of week
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  // Relative days
  /\b(today|tomorrow|tonight|this morning|this afternoon|this evening)\b/i,
  // Next/this week
  /\b(next week|this week|next month|this month)\b/i,
  // Specific dates
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
  // Time expressions
  /\b(at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  /\b(in the morning|in the afternoon|in the evening|at night)\b/i,
  // Relative times
  /\b(in \d+ (?:hour|minute|day|week)s?)\b/i,
  // "by" deadline
  /\b(by (?:end of )?(?:day|week|month|friday|monday|tomorrow))\b/i,
];

// ============================================================================
// INTENT PATTERNS
// ============================================================================

// Calendar event patterns
const CALENDAR_PATTERNS = [
  // Appointments
  /\b(?:have|got|scheduled|booked)\s+(?:a|an|my)\s+(\w+)\s+(?:appointment|visit|meeting)/i,
  /\b(\w+)\s+appointment\s+(?:on|at|for)?\s*(\w+day|\w+)/i,
  // Meetings
  /\b(?:meeting|call|sync)\s+(?:with\s+)?(.+?)(?:\s+(?:on|at|for|about)\s+|$)/i,
  // Plans
  /\b(?:going to|planning to|supposed to)\s+(.+?)(?:\s+(?:on|at)\s+|$)/i,
  // Events
  /\b(?:have|got)\s+(?:a|an)\s+(.+?)\s+(?:on|at|this|next)/i,
];

// Reminder patterns
const REMINDER_PATTERNS = [
  // Explicit reminders
  /\bremind(?:er)?\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+(?:on|at|by|tomorrow|today)|$)/i,
  /\bdon't\s+(?:let me\s+)?forget\s+(?:to\s+)?(.+)/i,
  /\bi\s+(?:can't|cannot|shouldn't|mustn't)\s+forget\s+(?:to\s+)?(.+)/i,
  // Implicit reminders
  /\bi\s+(?:need|have|should|must|gotta)\s+(?:to\s+)?(?:remember to\s+)?(.+?)(?:\s+(?:tomorrow|today|by|before)|$)/i,
];

// Task patterns
const TASK_PATTERNS = [
  // Deadlines
  /\b(?:need to|have to|should|must|gotta)\s+(?:finish|complete|do|submit)\s+(.+?)\s+(?:by|before)\s+(.+)/i,
  // To-dos
  /\b(?:need to|have to|should)\s+(.+?)(?:\s+(?:soon|later|eventually)|$)/i,
  // Work items
  /\b(?:working on|need to work on)\s+(.+)/i,
];

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

function extractTimeExpression(text: string): string | undefined {
  for (const pattern of TIME_EXPRESSIONS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

function extractPerson(text: string): string | undefined {
  // Look for "with [name]" or "[name]'s"
  const withMatch = text.match(/\bwith\s+(\w+(?:\s+\w+)?)/i);
  if (withMatch) return withMatch[1];

  const possessiveMatch = text.match(/\b(\w+)'s\b/i);
  if (possessiveMatch) return possessiveMatch[1];

  return undefined;
}

function extractLocation(text: string): string | undefined {
  const atMatch = text.match(/\bat\s+(?:the\s+)?(.+?)(?:\s+(?:on|at|for)|$)/i);
  if (atMatch) return atMatch[1];

  return undefined;
}

function parseActionableIntent(transcript: string): ParsedIntent | null {
  const normalizedText = transcript.toLowerCase();

  // Check for calendar events first (highest specificity)
  for (const pattern of CALENDAR_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const action = match[1] || match[0];
      const timeExpr = extractTimeExpression(transcript);

      // Only capture if there's a time component (otherwise it's just a mention)
      if (timeExpr) {
        return {
          type: 'calendar_event',
          action: action.trim(),
          timeExpression: timeExpr,
          who: extractPerson(transcript),
          where: extractLocation(transcript),
          confidence: 0.8,
        };
      }
    }
  }

  // Check for reminders
  for (const pattern of REMINDER_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const action = match[1] || match[0];
      return {
        type: 'reminder',
        action: action.trim(),
        timeExpression: extractTimeExpression(transcript),
        who: extractPerson(transcript),
        confidence: normalizedText.includes('remind') ? 0.9 : 0.7,
      };
    }
  }

  // Check for tasks
  for (const pattern of TASK_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const action = match[1] || match[0];
      const deadline = match[2];

      return {
        type: 'task',
        action: action.trim(),
        timeExpression: deadline || extractTimeExpression(transcript),
        confidence: deadline ? 0.8 : 0.6,
      };
    }
  }

  return null;
}

// ============================================================================
// SUGGESTION BUILDERS
// ============================================================================

function buildCalendarSuggestion(intent: ParsedIntent): string {
  const parts = [
    `[ACTIONABLE: CALENDAR EVENT DETECTED]`,
    `The user mentioned: "${intent.action}"`,
  ];

  if (intent.timeExpression) {
    parts.push(`Time: ${intent.timeExpression}`);
  }
  if (intent.who) {
    parts.push(`With: ${intent.who}`);
  }
  if (intent.where) {
    parts.push(`Location: ${intent.where}`);
  }

  parts.push('');
  parts.push('→ Gently offer to add this to their calendar.');
  parts.push("→ Don't be pushy - just acknowledge and offer once.");
  parts.push('→ Example: "Should I add that to your calendar?"');

  return parts.join('\n');
}

function buildReminderSuggestion(intent: ParsedIntent): string {
  const parts = [
    `[ACTIONABLE: REMINDER DETECTED]`,
    `The user wants to remember: "${intent.action}"`,
  ];

  if (intent.timeExpression) {
    parts.push(`When: ${intent.timeExpression}`);
  }

  parts.push('');
  parts.push('→ Offer to set a reminder for them.');
  parts.push('→ Example: "I can remind you about that - when would be helpful?"');

  return parts.join('\n');
}

function buildTaskSuggestion(intent: ParsedIntent): string {
  const parts = [
    `[ACTIONABLE: TASK DETECTED]`,
    `The user mentioned a task: "${intent.action}"`,
  ];

  if (intent.timeExpression) {
    parts.push(`Deadline: ${intent.timeExpression}`);
  }

  parts.push('');
  parts.push('→ Offer to track this as a task.');
  parts.push('→ Example: "Want me to add that to your task list?"');

  return parts.join('\n');
}

// ============================================================================
// CAPTURE DEFINITION
// ============================================================================

export const actionableIntentCaptureDefinition: DataCaptureDefinition = {
  id: 'capture_actionable_intent',
  name: 'Actionable Intent Capture',
  description: 'Detects calendar events, reminders, and tasks mentioned in conversation',
  category: 'actionable',

  triggers: {
    phrases: [
      // Calendar triggers
      'appointment',
      'meeting',
      'scheduled',
      'booked',
      'have to go to',
      'going to',
      // Reminder triggers
      'remind me',
      'reminder',
      "don't forget",
      "can't forget",
      'need to remember',
      // Task triggers
      'need to finish',
      'have to complete',
      'deadline',
      'due',
      'by friday',
      'by end of',
    ],
    keywords: [
      { word: 'appointment', weight: 0.9 },
      { word: 'meeting', weight: 0.8 },
      { word: 'reminder', weight: 0.9 },
      { word: 'remind', weight: 0.9 },
      { word: 'deadline', weight: 0.8 },
      { word: 'schedule', weight: 0.7 },
      { word: 'calendar', weight: 0.9 },
      { word: 'tomorrow', weight: 0.5 },
      { word: 'next week', weight: 0.5 },
      { word: 'monday', weight: 0.4 },
      { word: 'tuesday', weight: 0.4 },
      { word: 'wednesday', weight: 0.4 },
      { word: 'thursday', weight: 0.4 },
      { word: 'friday', weight: 0.4 },
    ],
    // Don't capture past tense or questions about existing items
    antiKeywords: [
      'had a',
      'went to',
      'did you',
      'was the',
      'how was',
      'canceled',
      'missed',
      'forgot about',
      '?', // Questions about existing events
    ],
  },

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'The actionable item (appointment, task, reminder)',
      required: true,
    },
    {
      name: 'time',
      type: 'string',
      description: 'When the action should happen',
      required: false,
    },
    {
      name: 'type',
      type: 'string',
      description: 'Type of actionable item: calendar_event, reminder, task',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.4,
    patternMatchBonus: 0.3,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  handler: async (
    _extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ): Promise<string | null> => {
    const { transcript, userId } = context;

    // Parse the intent from the transcript
    const intent = parseActionableIntent(transcript);

    if (!intent) {
      log.debug({ userId }, 'No actionable intent detected');
      return null;
    }

    // Check confidence threshold
    if (intent.confidence < 0.6) {
      log.debug({ userId, intent }, 'Actionable intent below confidence threshold');
      return null;
    }

    log.info(
      { userId, type: intent.type, action: intent.action, time: intent.timeExpression },
      '🎯 Actionable intent detected'
    );

    // Build suggestion for LLM based on intent type
    switch (intent.type) {
      case 'calendar_event':
        return buildCalendarSuggestion(intent);
      case 'reminder':
        return buildReminderSuggestion(intent);
      case 'task':
        return buildTaskSuggestion(intent);
      default:
        return null;
    }
  },
};
