/**
 * Intent Classifier
 *
 * Fast NLU-style intent classification + slot filling.
 * Runs in <5ms for most queries, providing a fast first-pass before
 * more expensive routing strategies.
 *
 * Approach:
 * 1. Classify intent using trained patterns + optional ML
 * 2. Extract slots (entities) from the input
 * 3. Map intent to tool(s)
 *
 * @module semantic-router/advanced/intelligent/intent-classifier
 */

import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'intent-classifier' });

// ============================================================================
// TYPES
// ============================================================================

export interface IntentClassifierConfig {
  /** Minimum confidence to return an intent */
  minConfidence: number;
  /** Enable fuzzy matching */
  fuzzyMatching: boolean;
  /** Enable learning from corrections */
  enableLearning: boolean;
  /** Maximum cached classifications */
  maxCacheSize: number;
}

export interface Intent {
  /** Intent ID (e.g., 'music.play', 'weather.check') */
  id: string;
  /** Category (e.g., 'music', 'weather') */
  category: string;
  /** Action (e.g., 'play', 'check') */
  action: string;
  /** Human-readable name */
  name: string;
  /** Training patterns */
  patterns: RegExp[];
  /** Keywords that boost this intent */
  keywords: string[];
  /** Required slot types */
  requiredSlots: string[];
  /** Optional slot types */
  optionalSlots: string[];
  /** Tool mapping */
  toolId: string;
  /** Priority (higher = prefer when tied) */
  priority: number;
}

export interface Slot {
  /** Slot name */
  name: string;
  /** Slot type */
  type: SlotType;
  /** Extracted value */
  value: string;
  /** Original text span */
  span: [number, number];
  /** Confidence */
  confidence: number;
}

export type SlotType =
  | 'person'
  | 'location'
  | 'datetime'
  | 'duration'
  | 'number'
  | 'genre'
  | 'mood'
  | 'contact'
  | 'query'
  | 'custom';

export interface ClassificationResult {
  /** Top intent */
  intent: Intent | null;
  /** Confidence (0-1) */
  confidence: number;
  /** Extracted slots */
  slots: Slot[];
  /** Alternative intents */
  alternatives: Array<{ intent: Intent; confidence: number }>;
  /** Classification time */
  latencyMs: number;
  /** Source of classification */
  source: 'pattern' | 'keyword' | 'ml' | 'cache' | 'fallback';
  /** Mapped tool ID */
  toolId: string | null;
  /** Arguments built from slots */
  args: Record<string, unknown>;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: IntentClassifierConfig = {
  minConfidence: 0.5,
  fuzzyMatching: true,
  enableLearning: true,
  maxCacheSize: 1000,
};

// ============================================================================
// BUILT-IN INTENTS
// ============================================================================

const BUILT_IN_INTENTS: Intent[] = [
  // Music
  {
    id: 'music.play',
    category: 'music',
    action: 'play',
    name: 'Play Music',
    patterns: [
      /^play\s+(?:some\s+)?(?:music|song|songs|tunes?)/i,
      /^play\s+(?:some\s+)?(\w+)\s+(?:music|song)/i,
      /^put\s+on\s+(?:some\s+)?(?:music|song)/i,
      /^i\s+(?:want|need)\s+(?:some\s+)?music/i,
    ],
    keywords: ['play', 'music', 'song', 'listen', 'spotify', 'tunes'],
    requiredSlots: [],
    optionalSlots: ['genre', 'mood', 'query'],
    toolId: 'spotify_play',
    priority: 10,
  },
  {
    id: 'music.pause',
    category: 'music',
    action: 'pause',
    name: 'Pause Music',
    patterns: [
      /^(?:pause|stop)\s+(?:the\s+)?music/i,
      /^stop\s+playing/i,
    ],
    keywords: ['pause', 'stop', 'music'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'spotify_pause',
    priority: 10,
  },

  // Weather
  {
    id: 'weather.check',
    category: 'weather',
    action: 'check',
    name: 'Check Weather',
    patterns: [
      /^what(?:'s| is)\s+the\s+weather/i,
      /^(?:how(?:'s| is)\s+)?the\s+weather/i,
      /^weather\s+(?:in|for|at)\s+/i,
      /^(?:is\s+it|will\s+it)\s+(?:going\s+to\s+)?(?:rain|snow|sunny|cold|hot)/i,
    ],
    keywords: ['weather', 'temperature', 'forecast', 'rain', 'sunny', 'cold', 'hot'],
    requiredSlots: [],
    optionalSlots: ['location', 'datetime'],
    toolId: 'weather_check',
    priority: 10,
  },

  // Reminders
  {
    id: 'reminder.set',
    category: 'reminder',
    action: 'set',
    name: 'Set Reminder',
    patterns: [
      /^(?:set\s+)?(?:a\s+)?reminder\s+(?:to|for|about)/i,
      /^remind\s+me\s+(?:to|about)/i,
      /^don(?:'t| not)\s+let\s+me\s+forget/i,
    ],
    keywords: ['remind', 'reminder', 'remember', 'forget'],
    requiredSlots: ['query'],
    optionalSlots: ['datetime'],
    toolId: 'reminder_set',
    priority: 10,
  },

  // Timer/Alarm
  {
    id: 'timer.set',
    category: 'timer',
    action: 'set',
    name: 'Set Timer',
    patterns: [
      /^(?:set\s+)?(?:a\s+)?timer\s+(?:for\s+)?(\d+)/i,
      /^(\d+)\s+minute\s+timer/i,
    ],
    keywords: ['timer', 'countdown', 'minutes'],
    requiredSlots: ['duration'],
    optionalSlots: [],
    toolId: 'timer_set',
    priority: 10,
  },

  // Calendar
  {
    id: 'calendar.check',
    category: 'calendar',
    action: 'check',
    name: 'Check Calendar',
    patterns: [
      /^what(?:'s| is)\s+on\s+my\s+(?:calendar|schedule)/i,
      /^(?:what|do\s+i)\s+have\s+(?:on|today|tomorrow)/i,
      /^(?:show|check)\s+(?:my\s+)?(?:calendar|schedule)/i,
    ],
    keywords: ['calendar', 'schedule', 'appointment', 'meeting', 'event'],
    requiredSlots: [],
    optionalSlots: ['datetime'],
    toolId: 'calendar_check',
    priority: 10,
  },
  {
    id: 'calendar.create',
    category: 'calendar',
    action: 'create',
    name: 'Create Event',
    patterns: [
      /^(?:add|create|schedule)\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /^(?:put|add)\s+(?:it\s+)?(?:on|in)\s+(?:my\s+)?calendar/i,
    ],
    keywords: ['create', 'schedule', 'add', 'event', 'meeting', 'appointment'],
    requiredSlots: ['query'],
    optionalSlots: ['datetime', 'duration', 'person'],
    toolId: 'calendar_create',
    priority: 8,
  },

  // Communication
  {
    id: 'communication.call',
    category: 'communication',
    action: 'call',
    name: 'Make Call',
    patterns: [
      /^call\s+(\w+)/i,
      /^(?:phone|dial)\s+(\w+)/i,
    ],
    keywords: ['call', 'phone', 'dial'],
    requiredSlots: ['contact'],
    optionalSlots: [],
    toolId: 'communication_call',
    priority: 10,
  },
  {
    id: 'communication.text',
    category: 'communication',
    action: 'text',
    name: 'Send Text',
    patterns: [
      /^(?:send\s+)?(?:a\s+)?text\s+(?:to\s+)?(\w+)/i,
      /^(?:message|text)\s+(\w+)/i,
    ],
    keywords: ['text', 'message', 'sms', 'send'],
    requiredSlots: ['contact'],
    optionalSlots: ['query'],
    toolId: 'communication_text',
    priority: 10,
  },

  // Handoff - Generic (lower priority than persona-specific)
  {
    id: 'handoff.transfer',
    category: 'handoff',
    action: 'transfer',
    name: 'Transfer to Persona',
    patterns: [
      /^transfer\s+(?:me\s+)?to\s+(?:someone|another|a\s+different)/i,
      /^(?:let\s+me\s+)?talk\s+to\s+(?:someone|another)/i,
      /^(?:switch|hand\s+off?)\s+(?:me\s+)?to\s+(?:someone|another)/i,
    ],
    keywords: ['transfer', 'handoff', 'someone', 'another'],
    requiredSlots: ['person'],
    optionalSlots: [],
    toolId: 'handoff_transfer',
    priority: 10, // Lower than persona-specific (15)
  },

  // Habits
  {
    id: 'habits.log',
    category: 'habits',
    action: 'log',
    name: 'Log Habit',
    patterns: [
      /^(?:i\s+)?(?:just\s+)?(?:did|completed|finished)\s+(?:my\s+)?(\w+)/i,
      /^log\s+(?:my\s+)?(\w+)/i,
      /^track\s+(?:my\s+)?(\w+)/i,
    ],
    keywords: ['habit', 'log', 'track', 'completed', 'did', 'exercise', 'meditation', 'workout'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'habit_log',
    priority: 8,
  },

  // Information
  {
    id: 'info.search',
    category: 'info',
    action: 'search',
    name: 'Search',
    patterns: [
      /^(?:search|look\s+up|find)\s+(?:for\s+)?/i,
      /^what\s+is\s+/i,
      /^who\s+is\s+/i,
      /^how\s+(?:do|does|to)\s+/i,
    ],
    keywords: ['search', 'find', 'look', 'what', 'who', 'how'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'web_search',
    priority: 3, // Low priority - fallback
  },

  // Small talk (non-tool)
  {
    id: 'smalltalk.greeting',
    category: 'smalltalk',
    action: 'greeting',
    name: 'Greeting',
    patterns: [
      /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))/i,
      /^how\s+are\s+you/i,
      /^what(?:'s| is)\s+up/i,
    ],
    keywords: ['hi', 'hello', 'hey', 'morning', 'afternoon', 'evening'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: '__conversation__', // Special: no tool
    priority: 5,
  },
  {
    id: 'smalltalk.thanks',
    category: 'smalltalk',
    action: 'thanks',
    name: 'Thanks',
    patterns: [
      /^(?:thanks?|thank\s+you)/i,
      /^(?:great|awesome|perfect|wonderful)/i,
    ],
    keywords: ['thank', 'thanks', 'great', 'awesome', 'perfect'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: '__conversation__',
    priority: 5,
  },
];

// ============================================================================
// SLOT EXTRACTORS
// ============================================================================

const SLOT_EXTRACTORS: Record<SlotType, (text: string) => Slot[]> = {
  person: (text) => {
    const slots: Slot[] = [];
    // Named person after keywords
    const personMatch = text.match(/(?:to|with|for|call|text|talk)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (personMatch) {
      slots.push({
        name: 'person',
        type: 'person',
        value: personMatch[1],
        span: [personMatch.index! + personMatch[0].indexOf(personMatch[1]), personMatch.index! + personMatch[0].length],
        confidence: 0.9,
      });
    }
    return slots;
  },

  location: (text) => {
    const slots: Slot[] = [];
    // Location after 'in', 'at', 'for'
    const locationMatch = text.match(/(?:in|at|for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (locationMatch) {
      slots.push({
        name: 'location',
        type: 'location',
        value: locationMatch[1],
        span: [locationMatch.index! + locationMatch[0].indexOf(locationMatch[1]), locationMatch.index! + locationMatch[0].length],
        confidence: 0.8,
      });
    }
    return slots;
  },

  datetime: (text) => {
    const slots: Slot[] = [];
    const lower = text.toLowerCase();

    // Relative time
    if (/tomorrow/.test(lower)) {
      slots.push({ name: 'datetime', type: 'datetime', value: 'tomorrow', span: [lower.indexOf('tomorrow'), lower.indexOf('tomorrow') + 8], confidence: 0.95 });
    }
    if (/today/.test(lower)) {
      slots.push({ name: 'datetime', type: 'datetime', value: 'today', span: [lower.indexOf('today'), lower.indexOf('today') + 5], confidence: 0.95 });
    }

    // Time patterns
    const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      slots.push({
        name: 'time',
        type: 'datetime',
        value: timeMatch[1],
        span: [timeMatch.index!, timeMatch.index! + timeMatch[0].length],
        confidence: 0.9,
      });
    }

    // Day of week
    const dayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
      slots.push({
        name: 'day',
        type: 'datetime',
        value: dayMatch[1],
        span: [dayMatch.index!, dayMatch.index! + dayMatch[0].length],
        confidence: 0.9,
      });
    }

    return slots;
  },

  duration: (text) => {
    const slots: Slot[] = [];
    const durationMatch = text.match(/(\d+)\s*(minute|hour|second|min|hr|sec)s?/i);
    if (durationMatch) {
      slots.push({
        name: 'duration',
        type: 'duration',
        value: `${durationMatch[1]} ${durationMatch[2]}`,
        span: [durationMatch.index!, durationMatch.index! + durationMatch[0].length],
        confidence: 0.95,
      });
    }
    return slots;
  },

  number: (text) => {
    const slots: Slot[] = [];
    const numMatch = text.match(/\d+/);
    if (numMatch) {
      slots.push({
        name: 'number',
        type: 'number',
        value: numMatch[0],
        span: [numMatch.index!, numMatch.index! + numMatch[0].length],
        confidence: 0.95,
      });
    }
    return slots;
  },

  genre: (text) => {
    const slots: Slot[] = [];
    const genres = ['jazz', 'rock', 'pop', 'classical', 'hip hop', 'country', 'electronic', 'r&b', 'folk', 'indie', 'metal', 'punk', 'soul', 'reggae', 'blues'];
    const lower = text.toLowerCase();

    for (const genre of genres) {
      if (lower.includes(genre)) {
        const idx = lower.indexOf(genre);
        slots.push({
          name: 'genre',
          type: 'genre',
          value: genre,
          span: [idx, idx + genre.length],
          confidence: 0.95,
        });
        break;
      }
    }
    return slots;
  },

  mood: (text) => {
    const slots: Slot[] = [];
    const moods = ['happy', 'sad', 'relaxing', 'energetic', 'focus', 'calm', 'upbeat', 'chill', 'motivating', 'peaceful', 'melancholy'];
    const lower = text.toLowerCase();

    for (const mood of moods) {
      if (lower.includes(mood)) {
        const idx = lower.indexOf(mood);
        slots.push({
          name: 'mood',
          type: 'mood',
          value: mood,
          span: [idx, idx + mood.length],
          confidence: 0.9,
        });
        break;
      }
    }
    return slots;
  },

  contact: (text) => {
    return SLOT_EXTRACTORS.person(text).map((s) => ({ ...s, type: 'contact' as SlotType }));
  },

  query: (text) => {
    // Everything after key phrases
    const slots: Slot[] = [];
    const queryPatterns = [
      /(?:remind\s+me\s+(?:to|about)\s+)(.+)/i,
      /(?:search\s+(?:for\s+)?)(.+)/i,
      /(?:look\s+up\s+)(.+)/i,
      /(?:find\s+)(.+)/i,
    ];

    for (const pattern of queryPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        slots.push({
          name: 'query',
          type: 'query',
          value: match[1].trim(),
          span: [match.index! + match[0].indexOf(match[1]), match.index! + match[0].length],
          confidence: 0.85,
        });
        break;
      }
    }
    return slots;
  },

  custom: () => [],
};

// ============================================================================
// INTENT CLASSIFIER
// ============================================================================

export class IntentClassifier {
  private config: IntentClassifierConfig;
  private intents: Intent[] = [];
  private cache = new Map<string, ClassificationResult>();
  private learnedPatterns = new Map<string, { pattern: RegExp; intentId: string }>();

  constructor(config: Partial<IntentClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.intents = [...BUILT_IN_INTENTS];
  }

  /**
   * Register additional intents (added at the beginning for higher priority matching)
   */
  registerIntents(intents: Intent[]): void {
    // Prepend to ensure custom intents are matched before built-in ones
    this.intents = [...intents, ...this.intents];
    log.info({ count: intents.length }, 'Registered additional intents');
  }

  /**
   * Classify user input
   */
  classify(input: string): ClassificationResult {
    const startTime = performance.now();
    const normalized = input.trim();

    // Check cache
    if (this.cache.has(normalized)) {
      const cached = this.cache.get(normalized)!;
      return { ...cached, latencyMs: performance.now() - startTime, source: 'cache' };
    }

    // Try pattern matching first (fastest)
    const patternResult = this.classifyByPattern(normalized);
    if (patternResult && patternResult.confidence >= this.config.minConfidence) {
      return this.finalizeResult(patternResult, normalized, startTime, 'pattern');
    }

    // Try learned patterns
    const learnedResult = this.classifyByLearned(normalized);
    if (learnedResult && learnedResult.confidence >= this.config.minConfidence) {
      return this.finalizeResult(learnedResult, normalized, startTime, 'pattern');
    }

    // Try keyword matching
    const keywordResult = this.classifyByKeyword(normalized);
    if (keywordResult && keywordResult.confidence >= this.config.minConfidence) {
      return this.finalizeResult(keywordResult, normalized, startTime, 'keyword');
    }

    // Fallback: no intent matched
    return this.finalizeResult(
      {
        intent: null,
        confidence: 0,
        slots: this.extractAllSlots(normalized),
        alternatives: this.getTopKeywordMatches(normalized, 3),
      },
      normalized,
      startTime,
      'fallback'
    );
  }

  /**
   * Classify using regex patterns
   */
  private classifyByPattern(input: string): { intent: Intent; confidence: number; slots: Slot[]; alternatives: Array<{ intent: Intent; confidence: number }> } | null {
    const matches: Array<{ intent: Intent; confidence: number }> = [];

    for (const intent of this.intents) {
      for (const pattern of intent.patterns) {
        if (pattern.test(input)) {
          matches.push({ intent, confidence: 0.9 });
          break;
        }
      }
    }

    if (matches.length === 0) return null;

    // Sort by priority then confidence
    matches.sort((a, b) => {
      const priorityDiff = b.intent.priority - a.intent.priority;
      return priorityDiff !== 0 ? priorityDiff : b.confidence - a.confidence;
    });

    const top = matches[0];
    return {
      intent: top.intent,
      confidence: top.confidence,
      slots: this.extractSlots(input, top.intent),
      alternatives: matches.slice(1, 4),
    };
  }

  /**
   * Classify using learned patterns
   */
  private classifyByLearned(input: string): { intent: Intent; confidence: number; slots: Slot[]; alternatives: Array<{ intent: Intent; confidence: number }> } | null {
    for (const [, learned] of this.learnedPatterns) {
      if (learned.pattern.test(input)) {
        const intent = this.intents.find((i) => i.id === learned.intentId);
        if (intent) {
          return {
            intent,
            confidence: 0.85,
            slots: this.extractSlots(input, intent),
            alternatives: [],
          };
        }
      }
    }
    return null;
  }

  /**
   * Classify using keywords
   */
  private classifyByKeyword(input: string): { intent: Intent; confidence: number; slots: Slot[]; alternatives: Array<{ intent: Intent; confidence: number }> } | null {
    const words = new Set(input.toLowerCase().split(/\s+/));
    const scores: Array<{ intent: Intent; score: number }> = [];

    for (const intent of this.intents) {
      let matchCount = 0;
      for (const keyword of intent.keywords) {
        if (words.has(keyword.toLowerCase())) {
          matchCount++;
        }
        // Fuzzy matching
        if (this.config.fuzzyMatching) {
          for (const word of words) {
            if (this.levenshteinDistance(word, keyword.toLowerCase()) <= 1 && word.length > 3) {
              matchCount += 0.5;
              break;
            }
          }
        }
      }

      if (matchCount > 0) {
        const score = (matchCount / intent.keywords.length) * intent.priority / 10;
        scores.push({ intent, score });
      }
    }

    if (scores.length === 0) return null;

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];

    return {
      intent: top.intent,
      confidence: Math.min(0.8, top.score),
      slots: this.extractSlots(input, top.intent),
      alternatives: scores.slice(1, 4).map((s) => ({ intent: s.intent, confidence: Math.min(0.7, s.score) })),
    };
  }

  /**
   * Get top keyword matches without full classification
   */
  private getTopKeywordMatches(input: string, limit: number): Array<{ intent: Intent; confidence: number }> {
    const result = this.classifyByKeyword(input);
    if (!result) return [];
    return [{ intent: result.intent, confidence: result.confidence }, ...result.alternatives].slice(0, limit);
  }

  /**
   * Extract slots for an intent
   */
  private extractSlots(input: string, intent: Intent): Slot[] {
    const slots: Slot[] = [];
    const allSlotTypes = [...intent.requiredSlots, ...intent.optionalSlots] as SlotType[];

    for (const slotType of allSlotTypes) {
      const extractor = SLOT_EXTRACTORS[slotType];
      if (extractor) {
        slots.push(...extractor(input));
      }
    }

    return slots;
  }

  /**
   * Extract all possible slots
   */
  private extractAllSlots(input: string): Slot[] {
    const slots: Slot[] = [];
    for (const [, extractor] of Object.entries(SLOT_EXTRACTORS)) {
      slots.push(...extractor(input));
    }
    return slots;
  }

  /**
   * Finalize and cache result
   */
  private finalizeResult(
    partial: { intent: Intent | null; confidence: number; slots: Slot[]; alternatives: Array<{ intent: Intent; confidence: number }> },
    input: string,
    startTime: number,
    source: ClassificationResult['source']
  ): ClassificationResult {
    const result: ClassificationResult = {
      ...partial,
      latencyMs: performance.now() - startTime,
      source,
      toolId: partial.intent?.toolId === '__conversation__' ? null : partial.intent?.toolId || null,
      args: this.slotsToArgs(partial.slots),
    };

    // Cache
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(input, result);

    return result;
  }

  /**
   * Convert slots to tool arguments
   */
  private slotsToArgs(slots: Slot[]): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    for (const slot of slots) {
      args[slot.name] = slot.value;
    }
    return args;
  }

  /**
   * Learn a new pattern from correction
   */
  learnPattern(input: string, correctIntentId: string): void {
    if (!this.config.enableLearning) return;

    const intent = this.intents.find((i) => i.id === correctIntentId);
    if (!intent) {
      log.warn({ intentId: correctIntentId }, 'Cannot learn: unknown intent');
      return;
    }

    // Create pattern from input
    const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}$`, 'i');

    this.learnedPatterns.set(input, { pattern, intentId: correctIntentId });
    log.info({ input: input.slice(0, 50), intentId: correctIntentId }, 'Learned new pattern');
  }

  /**
   * Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Get all registered intents
   */
  getIntents(): Intent[] {
    return this.intents;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let classifierInstance: IntentClassifier | null = null;

export function getIntentClassifier(): IntentClassifier {
  if (!classifierInstance) {
    classifierInstance = new IntentClassifier();
  }
  return classifierInstance;
}

export function initializeIntentClassifier(
  config?: Partial<IntentClassifierConfig>,
  additionalIntents?: Intent[]
): IntentClassifier {
  classifierInstance = new IntentClassifier(config);

  if (additionalIntents) {
    classifierInstance.registerIntents(additionalIntents);
  }

  return classifierInstance;
}

