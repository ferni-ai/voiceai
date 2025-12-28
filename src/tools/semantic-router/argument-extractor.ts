/**
 * Argument Extractor
 *
 * Extracts tool arguments from user text using:
 * 1. Named entity recognition patterns
 * 2. Slot filling with defaults
 * 3. Contextual inference
 *
 * @module tools/semantic-router/argument-extractor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolArgument, SemanticToolDefinition, ConversationTurn } from './types.js';

const log = createLogger({ module: 'semantic-router:argument-extractor' });

// ============================================================================
// ENTITY EXTRACTION PATTERNS
// ============================================================================

const ENTITY_PATTERNS: Record<string, RegExp[]> = {
  // Location
  location: [
    /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // "in New York"
    /(?:for|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // "for Paris"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+weather/i, // "New York weather"
  ],

  // Person
  person: [
    /(?:call|text|email|message)\s+(\w+)/i, // "call John"
    /(?:about|from|by)\s+(\w+)/i, // "about Sarah"
    /(\w+)(?:'s|s')\s+/i, // "John's"
  ],

  // Date
  date: [
    /\b(today|tomorrow|yesterday)\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(next|this|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/, // MM/DD or MM/DD/YY
    /\b(\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\b/i,
  ],

  // Time
  time: [
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, // "at 3pm"
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, // "3pm" standalone
    /\b(morning|afternoon|evening|night|noon|midnight)\b/i,
  ],

  // Duration
  duration: [
    /\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?)\b/i,
    /\b(\d+)\s*-?\s*(minute|min|hour|hr|second|sec|day|week)\b/i,
  ],

  // Number
  number: [
    /\b(\d+(?:\.\d+)?)\b/, // Any number
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i, // Word numbers
  ],

  // Genre (for music)
  genre: [
    /\b(jazz|rock|pop|classical|hip hop|hip-hop|country|electronic|edm|r&b|rnb|folk|blues|metal|indie|ambient|lofi|lo-fi|chill|relaxing)\b/i,
  ],
};

// Word to number mapping
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract an entity of a specific type from text
 */
export function extractEntity(text: string, entityType: string): string | number | null {
  const patterns = ENTITY_PATTERNS[entityType];
  if (!patterns) return null;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1] || match[0];

      // Post-process based on type
      if (entityType === 'number') {
        // Convert word numbers
        const lower = value.toLowerCase();
        if (WORD_NUMBERS[lower] !== undefined) {
          return WORD_NUMBERS[lower];
        }
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      }

      if (entityType === 'duration') {
        // Normalize duration format
        const durationMatch = text.match(
          /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?)/i
        );
        if (durationMatch) {
          return `${durationMatch[1]} ${durationMatch[2]}`;
        }
      }

      return value.trim();
    }
  }

  return null;
}

/**
 * Extract arguments for a specific tool
 */
export interface ExtractedArguments {
  args: Record<string, unknown>;
  missingRequired: string[];
  confidence: number;
}

export function extractArguments(
  text: string,
  toolDef: SemanticToolDefinition,
  context?: {
    conversationHistory?: ConversationTurn[];
    userProfile?: Record<string, unknown>;
  }
): ExtractedArguments {
  const args: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  let extractedCount = 0;
  let requiredCount = 0;

  for (const argDef of toolDef.arguments) {
    let value: unknown = null;

    // 1. Try custom extraction patterns first
    if (argDef.extractionPatterns) {
      for (const pattern of argDef.extractionPatterns) {
        const match = text.match(pattern);
        if (match) {
          value = match[1] || match[0];
          break;
        }
      }
    }

    // 2. Try entity extraction based on type
    if (value === null && argDef.entityType) {
      value = extractEntity(text, argDef.entityType);
    }

    // 3. Try enum matching
    if (value === null && argDef.enumValues) {
      const lowerText = text.toLowerCase();
      for (const enumVal of argDef.enumValues) {
        if (lowerText.includes(enumVal.toLowerCase())) {
          value = enumVal;
          break;
        }
      }
    }

    // 4. Try inferring from conversation context
    if (value === null && context?.conversationHistory) {
      value = inferFromContext(argDef, context.conversationHistory);
    }

    // 5. Use default value
    if (value === null && argDef.defaultValue !== undefined) {
      value = argDef.defaultValue;
    }

    // Record the argument
    if (value !== null) {
      args[argDef.name] = value;
      extractedCount++;
    } else if (argDef.required) {
      missingRequired.push(argDef.name);
      requiredCount++;
    }

    if (argDef.required) {
      requiredCount++;
    }
  }

  // Calculate confidence based on how many required args we got
  const requiredExtracted = requiredCount - missingRequired.length;
  const confidence = requiredCount > 0 ? requiredExtracted / requiredCount : 1.0;

  return {
    args,
    missingRequired,
    confidence,
  };
}

/**
 * Try to infer argument value from conversation context
 */
function inferFromContext(argDef: ToolArgument, history: ConversationTurn[]): unknown {
  // Look through recent conversation for relevant info
  const recentText = history
    .slice(-5)
    .map((t) => t.text)
    .join(' ');

  // Try entity extraction on context
  if (argDef.entityType) {
    return extractEntity(recentText, argDef.entityType);
  }

  return null;
}

// ============================================================================
// SPECIALIZED EXTRACTORS
// ============================================================================

/**
 * Extract music-related arguments
 */
export function extractMusicArgs(text: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Genre
  const genre = extractEntity(text, 'genre');
  if (genre) args.genre = genre;

  // Artist (after "by")
  const byMatch = text.match(/\bby\s+(.+?)(?:\s+(?:and|on|for|from)|$)/i);
  if (byMatch) args.artist = byMatch[1].trim();

  // Song/track name (in quotes or after "play")
  const quotedMatch = text.match(/"([^"]+)"|'([^']+)'/);
  if (quotedMatch) {
    args.track = quotedMatch[1] || quotedMatch[2];
  } else {
    // Try "play X by Y" pattern
    const playMatch = text.match(/play\s+(.+?)(?:\s+by\s+|$)/i);
    if (playMatch && playMatch[1] && !playMatch[1].match(/^(some|me|any)/i)) {
      args.query = playMatch[1].trim();
    }
  }

  // Mood/vibe
  const moodPatterns = [
    /\b(happy|sad|energetic|calm|relaxing|upbeat|mellow|chill|focus|workout|party|romantic)\b/i,
  ];
  for (const pattern of moodPatterns) {
    const match = text.match(pattern);
    if (match) {
      args.mood = match[1].toLowerCase();
      break;
    }
  }

  // Activity
  const activityPatterns = [
    /\bfor\s+(working|studying|sleeping|cooking|exercising|driving|reading)\b/i,
    /\bwhile\s+(?:i'm\s+)?(\w+ing)\b/i,
  ];
  for (const pattern of activityPatterns) {
    const match = text.match(pattern);
    if (match) {
      args.activity = match[1].toLowerCase();
      break;
    }
  }

  return args;
}

/**
 * Extract calendar/reminder arguments
 */
export function extractCalendarArgs(text: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Date
  const date = extractEntity(text, 'date');
  if (date) args.date = date;

  // Time
  const time = extractEntity(text, 'time');
  if (time) args.time = time;

  // Duration
  const duration = extractEntity(text, 'duration');
  if (duration) args.duration = duration;

  // Title (extract the main subject)
  const titlePatterns = [
    /(?:remind me to|reminder to|schedule|add|create|set)\s+(.+?)(?:\s+(?:at|on|for|tomorrow|today)|$)/i,
    /(?:meeting|appointment|event)\s+(?:with|about|for)\s+(.+?)(?:\s+(?:at|on)|$)/i,
  ];
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match) {
      args.title = match[1].trim();
      break;
    }
  }

  // People
  const withMatch = text.match(/\bwith\s+(\w+(?:\s+(?:and|,)\s+\w+)*)/i);
  if (withMatch) {
    args.attendees = withMatch[1].split(/\s+(?:and|,)\s+/);
  }

  // Location
  const atMatch = text.match(/\bat\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (atMatch) {
    args.location = atMatch[1];
  }

  return args;
}

/**
 * Extract weather arguments
 */
export function extractWeatherArgs(text: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Location
  const location = extractEntity(text, 'location');
  if (location) args.location = location;

  // Date (for forecast)
  const date = extractEntity(text, 'date');
  if (date) args.date = date;

  // Specific weather aspect
  const aspectPatterns = [
    /\b(temperature|temp|hot|cold|rain|sunny|cloudy|snow|wind|humidity|forecast)\b/i,
  ];
  for (const pattern of aspectPatterns) {
    const match = text.match(pattern);
    if (match) {
      args.aspect = match[1].toLowerCase();
      break;
    }
  }

  return args;
}

/**
 * Extract handoff arguments
 */
export function extractHandoffArgs(text: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  // Target persona
  const personaPatterns = [
    /(?:talk to|speak with|transfer to|hand off to|switch to|connect me with|let me talk to)\s+(\w+)/i,
    /\b(maya|peter|alex|jordan|nayan|ferni)\b/i,
  ];
  for (const pattern of personaPatterns) {
    const match = text.match(pattern);
    if (match) {
      args.targetPersona = match[1].toLowerCase();
      break;
    }
  }

  // Reason/topic
  const reasonPatterns = [/(?:about|regarding|for|to discuss)\s+(.+?)(?:\s+(?:with|and)|$)/i];
  for (const pattern of reasonPatterns) {
    const match = text.match(pattern);
    if (match) {
      args.reason = match[1].trim();
      break;
    }
  }

  return args;
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract arguments with category-specific logic
 */
export function extractToolArguments(
  text: string,
  toolDef: SemanticToolDefinition,
  context?: {
    conversationHistory?: ConversationTurn[];
    userProfile?: Record<string, unknown>;
  }
): ExtractedArguments {
  // Start with generic extraction
  const baseExtraction = extractArguments(text, toolDef, context);

  // Apply category-specific extraction
  let specializedArgs: Record<string, unknown> = {};

  switch (toolDef.category) {
    case 'music':
      specializedArgs = extractMusicArgs(text);
      break;
    case 'calendar':
      specializedArgs = extractCalendarArgs(text);
      break;
    case 'information':
      if (toolDef.id.includes('weather')) {
        specializedArgs = extractWeatherArgs(text);
      }
      break;
    case 'handoff':
      specializedArgs = extractHandoffArgs(text);
      break;
  }

  // Merge specialized args (they override base)
  const mergedArgs = { ...baseExtraction.args, ...specializedArgs };

  // Recalculate missing required
  const missingRequired = toolDef.arguments
    .filter((arg) => arg.required && mergedArgs[arg.name] === undefined)
    .map((arg) => arg.name);

  // Recalculate confidence
  const requiredCount = toolDef.arguments.filter((a) => a.required).length;
  const requiredExtracted = requiredCount - missingRequired.length;
  const confidence = requiredCount > 0 ? requiredExtracted / requiredCount : 1.0;

  return {
    args: mergedArgs,
    missingRequired,
    confidence,
  };
}

// ============================================================================
// SLOT FILLING
// ============================================================================

export interface SlotFillingState {
  toolId: string;
  collectedArgs: Record<string, unknown>;
  missingSlots: string[];
  currentSlot?: string;
  attempts: number;
}

/**
 * Create initial slot filling state
 */
export function createSlotFillingState(
  toolDef: SemanticToolDefinition,
  initialArgs: Record<string, unknown>
): SlotFillingState {
  const missingSlots = toolDef.arguments
    .filter((arg) => arg.required && initialArgs[arg.name] === undefined)
    .map((arg) => arg.name);

  return {
    toolId: toolDef.id,
    collectedArgs: { ...initialArgs },
    missingSlots,
    currentSlot: missingSlots[0],
    attempts: 0,
  };
}

/**
 * Generate question to fill a slot
 */
export function generateSlotQuestion(toolDef: SemanticToolDefinition, slotName: string): string {
  const argDef = toolDef.arguments.find((a) => a.name === slotName);
  if (!argDef) return `What is the ${slotName}?`;

  // Generate natural question based on argument type
  switch (argDef.entityType) {
    case 'location':
      return 'Which city or location?';
    case 'date':
      return 'What date?';
    case 'time':
      return 'What time?';
    case 'person':
      return 'Who?';
    case 'duration':
      return 'For how long?';
    case 'genre':
      return 'What kind of music?';
    default:
      return argDef.description
        ? `What's the ${argDef.description.toLowerCase()}?`
        : `What's the ${slotName}?`;
  }
}

/**
 * Update slot filling state with new input
 */
export function updateSlotFillingState(
  state: SlotFillingState,
  userInput: string,
  toolDef: SemanticToolDefinition
): SlotFillingState {
  const newState = { ...state, attempts: state.attempts + 1 };

  // Try to extract the current slot
  if (state.currentSlot) {
    const argDef = toolDef.arguments.find((a) => a.name === state.currentSlot);
    if (argDef && argDef.entityType) {
      const value = extractEntity(userInput, argDef.entityType);
      if (value !== null) {
        newState.collectedArgs[state.currentSlot] = value;
        newState.missingSlots = newState.missingSlots.filter((s) => s !== state.currentSlot);
        newState.currentSlot = newState.missingSlots[0];
      }
    }
  }

  return newState;
}
