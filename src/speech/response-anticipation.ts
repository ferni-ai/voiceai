/**
 * Response Anticipation Cache
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Workaround for LiveKit's inability to support preemptive LLM generation.
 * Instead of generating responses before turn-end, we:
 *
 * 1. **Pattern Caching**: Pre-cache likely responses for common patterns
 * 2. **Intent Prediction**: Predict user intent from partial transcript
 * 3. **Warm Response Templates**: Keep templates ready for quick customization
 * 4. **Semantic Prefetch**: Preload relevant context for faster LLM response
 *
 * This reduces perceived latency by ~100-200ms on cache hits.
 *
 * @module ResponseAnticipation
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'ResponseAnticipation' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Anticipated response
 */
export interface AnticipatedResponse {
  /** Intent category */
  intent: IntentCategory;
  /** Confidence (0-1) */
  confidence: number;
  /** Cached response template */
  template: string;
  /** Template variables to fill */
  variables: string[];
  /** Is this a complete response or needs LLM? */
  isComplete: boolean;
  /** Context to prepend to LLM prompt */
  contextHint: string;
  /** Suggested SSML wrapper */
  ssmlHint?: string;
}

/**
 * Intent categories for anticipation
 */
export type IntentCategory =
  | 'greeting'
  | 'farewell'
  | 'affirmation'
  | 'negation'
  | 'gratitude'
  | 'apology'
  | 'question_about_self'
  | 'question_about_user'
  | 'request_clarification'
  | 'emotional_disclosure'
  | 'task_request'
  | 'continuation'
  | 'unknown';

/**
 * Cached pattern entry
 */
interface CachedPattern {
  pattern: RegExp;
  intent: IntentCategory;
  templates: string[];
  variables: string[];
  contextHint: string;
}

/**
 * Usage stats for optimization
 */
interface CacheStats {
  hits: number;
  misses: number;
  avgHitLatencyMs: number;
  mostFrequentIntents: Array<{ intent: IntentCategory; count: number }>;
}

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

/**
 * Patterns for common user inputs (ordered by specificity)
 */
const CACHED_PATTERNS: CachedPattern[] = [
  // Greetings
  {
    pattern: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/i,
    intent: 'greeting',
    templates: [
      'Hey! Great to hear from you.',
      'Hi there! How are you doing?',
      "Hello! What's on your mind today?",
    ],
    variables: [],
    contextHint: 'User is greeting. Respond warmly and transition to their needs.',
  },

  // Farewells
  {
    pattern: /^(bye|goodbye|see\s*you|talk\s*later|gotta\s*go|have\s*to\s*go)\b/i,
    intent: 'farewell',
    templates: [
      'Take care! Looking forward to our next chat.',
      "Bye for now. Remember, I'm here whenever you need me.",
      'See you soon! Have a great {{timeOfDay}}.',
    ],
    variables: ['timeOfDay'],
    contextHint: 'User is ending conversation. Give warm closure with continuity.',
  },

  // Affirmations
  {
    pattern: /^(yes|yeah|yep|yup|sure|okay|ok|absolutely|definitely|correct|right)\b/i,
    intent: 'affirmation',
    templates: [],
    variables: [],
    contextHint: 'User affirmed previous point. Continue with the natural next step.',
  },

  // Negations
  {
    pattern: /^(no|nope|not\s*really|i\s*don't\s*think\s*so|negative)\b/i,
    intent: 'negation',
    templates: [],
    variables: [],
    contextHint: 'User disagreed or declined. Acknowledge and offer alternative.',
  },

  // Gratitude
  {
    pattern: /^(thanks?|thank\s*you|appreciate|grateful)\b/i,
    intent: 'gratitude',
    templates: ["You're so welcome.", "Anytime! That's what I'm here for.", 'Happy to help.'],
    variables: [],
    contextHint: 'User expressed gratitude. Acknowledge warmly and check if they need more.',
  },

  // Apology
  {
    pattern: /^(sorry|my\s*bad|apologize|i\s*messed\s*up)\b/i,
    intent: 'apology',
    templates: ['No worries at all.', "It's completely fine.", "Don't worry about it."],
    variables: [],
    contextHint: 'User apologized. Reassure them and maintain positive tone.',
  },

  // Questions about Ferni
  {
    pattern:
      /^(who\s*are\s*you|what\s*are\s*you|tell\s*me\s*about\s*yourself|what\s*do\s*you\s*do)\b/i,
    intent: 'question_about_self',
    templates: [
      "I'm Ferni, your AI life coach. I'm here to help you think through things, set goals, and grow.",
    ],
    variables: [],
    contextHint: 'User asking about the agent. Give brief intro then redirect to them.',
  },

  // Questions about user
  {
    pattern: /^(how\s*are\s*you|how\s*do\s*you\s*feel|are\s*you\s*okay)\b/i,
    intent: 'question_about_user',
    templates: [
      "I'm doing well, thanks for asking! But I'm more curious about you - how are YOU doing?",
    ],
    variables: [],
    contextHint: 'User asked how agent is. Thank them and redirect focus to user.',
  },

  // Request clarification
  {
    pattern:
      /^(what\s*do\s*you\s*mean|i\s*don't\s*understand|can\s*you\s*explain|say\s*that\s*again|huh\?*|what\?*)\b/i,
    intent: 'request_clarification',
    templates: [],
    variables: [],
    contextHint: 'User needs clarification. Rephrase previous point more clearly.',
  },

  // Emotional disclosure indicators
  {
    pattern:
      /^(i\s*feel|i'm\s*(feeling|so|really)|it's\s*been\s*(hard|tough|difficult)|i've\s*been\s*(struggling|stressed|anxious|worried))\b/i,
    intent: 'emotional_disclosure',
    templates: [],
    variables: [],
    contextHint: 'User sharing emotions. Listen deeply, validate, do not rush to fix.',
  },

  // Task requests
  {
    pattern: /^(can\s*you|could\s*you|would\s*you|help\s*me|i\s*need\s*(you\s*to|help))/i,
    intent: 'task_request',
    templates: [],
    variables: [],
    contextHint: 'User making a request. Clarify the task and confirm before acting.',
  },

  // Continuation signals
  {
    pattern: /^(and|also|plus|another\s*thing|oh\s*and|by\s*the\s*way)\b/i,
    intent: 'continuation',
    templates: [],
    variables: [],
    contextHint: "User continuing previous thought. Keep listening, don't interrupt.",
  },
];

// ============================================================================
// INTENT PREDICTION
// ============================================================================

/**
 * Predict intent from partial transcript
 */
export function predictIntent(partialTranscript: string): {
  intent: IntentCategory;
  confidence: number;
  pattern?: CachedPattern;
} {
  const trimmed = partialTranscript.trim().toLowerCase();

  if (trimmed.length < 2) {
    return { intent: 'unknown', confidence: 0 };
  }

  // Check against cached patterns
  for (const pattern of CACHED_PATTERNS) {
    if (pattern.pattern.test(trimmed)) {
      // Confidence based on match length vs total
      const match = trimmed.match(pattern.pattern);
      const matchLength = match ? match[0].length : 0;
      const confidence = Math.min(0.9, 0.5 + (matchLength / trimmed.length) * 0.4);

      return {
        intent: pattern.intent,
        confidence,
        pattern,
      };
    }
  }

  return { intent: 'unknown', confidence: 0 };
}

// ============================================================================
// RESPONSE ANTICIPATION SERVICE
// ============================================================================

export class ResponseAnticipationService {
  private stats: CacheStats;
  private intentCounts: Map<IntentCategory, number>;
  private lastAnticipation: AnticipatedResponse | null = null;
  private personaId = 'ferni';

  constructor(private sessionId: string) {
    this.stats = {
      hits: 0,
      misses: 0,
      avgHitLatencyMs: 0,
      mostFrequentIntents: [],
    };
    this.intentCounts = new Map();
    log.debug({ sessionId }, '🎯 Response anticipation service initialized');
  }

  /**
   * Configure persona for template selection
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Anticipate response from partial transcript
   * Call this while user is still speaking
   */
  anticipate(partialTranscript: string): AnticipatedResponse | null {
    const startTime = Date.now();

    const prediction = predictIntent(partialTranscript);

    if (prediction.confidence < 0.5 || prediction.intent === 'unknown') {
      this.lastAnticipation = null;
      return null;
    }

    // Build anticipated response
    const { pattern } = prediction;
    let template = '';
    let isComplete = false;

    if (pattern && pattern.templates.length > 0) {
      // Select random template for variety
      const templateIdx = Math.floor(Math.random() * pattern.templates.length);
      template = pattern.templates[templateIdx];
      isComplete = pattern.variables.length === 0;

      // Fill simple variables
      template = this.fillVariables(template, pattern.variables);
    }

    const anticipation: AnticipatedResponse = {
      intent: prediction.intent,
      confidence: prediction.confidence,
      template,
      variables: pattern?.variables || [],
      isComplete,
      contextHint: pattern?.contextHint || '',
      ssmlHint: this.getSsmlHintForIntent(prediction.intent),
    };

    this.lastAnticipation = anticipation;

    // Update stats
    const latency = Date.now() - startTime;
    if (isComplete) {
      this.stats.hits++;
      this.stats.avgHitLatencyMs =
        (this.stats.avgHitLatencyMs * (this.stats.hits - 1) + latency) / this.stats.hits;
    }

    // Track intent frequency
    const count = (this.intentCounts.get(prediction.intent) || 0) + 1;
    this.intentCounts.set(prediction.intent, count);

    log.debug(
      {
        intent: prediction.intent,
        confidence: prediction.confidence.toFixed(2),
        isComplete,
        latencyMs: latency,
      },
      '🎯 Response anticipated'
    );

    return anticipation;
  }

  /**
   * Get context hint for LLM if no complete response
   */
  getContextHintForLLM(finalTranscript: string): string | null {
    // Try to get anticipation for final transcript
    const anticipation = this.anticipate(finalTranscript);

    if (anticipation && anticipation.contextHint) {
      return `[Hint: ${anticipation.contextHint}]`;
    }

    return null;
  }

  /**
   * Get complete response if available
   */
  getCompleteResponse(): { response: string; ssml: string } | null {
    if (!this.lastAnticipation || !this.lastAnticipation.isComplete) {
      return null;
    }

    const response = this.lastAnticipation.template;
    let ssml = response;

    if (this.lastAnticipation.ssmlHint) {
      ssml = this.lastAnticipation.ssmlHint.replace('{{TEXT}}', response);
    }

    return { response, ssml };
  }

  /**
   * Fill template variables
   */
  private fillVariables(template: string, variables: string[]): string {
    let result = template;

    for (const variable of variables) {
      switch (variable) {
        case 'timeOfDay': {
          const hour = new Date().getHours();
          const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
          result = result.replace(`{{${variable}}}`, tod);
          break;
        }

        case 'userName':
          result = result.replace(`{{${variable}}}`, 'there'); // Fallback
          break;

        default:
          // Leave unknown variables as-is
          break;
      }
    }

    return result;
  }

  /**
   * Get SSML hint for intent
   */
  private getSsmlHintForIntent(intent: IntentCategory): string | undefined {
    switch (intent) {
      case 'greeting':
        return '<prosody pitch="+5%" rate="105%">{{TEXT}}</prosody>';

      case 'farewell':
        return '<prosody pitch="-3%" rate="95%">{{TEXT}}</prosody>';

      case 'gratitude':
        return '<prosody volume="soft" rate="95%">{{TEXT}}</prosody>';

      case 'emotional_disclosure':
        return '<prosody volume="soft" rate="90%"><break time="300ms"/>{{TEXT}}</prosody>';

      default:
        return undefined;
    }
  }

  /**
   * Report if last anticipation was correct (for learning)
   */
  reportAccuracy(wasCorrect: boolean): void {
    if (!wasCorrect) {
      this.stats.misses++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    // Build most frequent intents list
    const sorted = Array.from(this.intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    return {
      ...this.stats,
      mostFrequentIntents: sorted,
    };
  }

  /**
   * Get hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Clear last anticipation (after response sent)
   */
  clearAnticipation(): void {
    this.lastAnticipation = null;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      avgHitLatencyMs: 0,
      mostFrequentIntents: [],
    };
    this.intentCounts.clear();
    this.lastAnticipation = null;
  }
}

// ============================================================================
// SEMANTIC PREFETCH
// ============================================================================

/**
 * Prefetch context hints for faster LLM response
 */
export interface PrefetchContext {
  /** Relevant user history to include */
  userHistoryHint: string;
  /** Recent topics to reference */
  recentTopics: string[];
  /** Emotional state hint */
  emotionalHint: string;
  /** Suggested persona mode */
  suggestedMode: string;
}

/**
 * Generate prefetch context based on conversation state
 */
export function generatePrefetchContext(
  recentUserMessages: string[],
  emotionalState: string | null,
  currentTopic: string | null
): PrefetchContext {
  // Analyze recent messages for patterns
  const allText = recentUserMessages.join(' ').toLowerCase();

  // Extract potential topics
  const topicIndicators = [
    { pattern: /\b(work|job|career|boss|colleague)\b/i, topic: 'work' },
    { pattern: /\b(family|parent|child|sibling|spouse|partner)\b/i, topic: 'relationships' },
    { pattern: /\b(health|exercise|sleep|eat|diet)\b/i, topic: 'health' },
    { pattern: /\b(money|budget|save|spend|financial)\b/i, topic: 'finances' },
    { pattern: /\b(goal|plan|future|dream|aspir)\b/i, topic: 'goals' },
    { pattern: /\b(stress|anxious|worried|overwhelm|burnout)\b/i, topic: 'stress' },
  ];

  const topics: string[] = [];
  for (const indicator of topicIndicators) {
    if (indicator.pattern.test(allText)) {
      topics.push(indicator.topic);
    }
  }
  if (currentTopic && !topics.includes(currentTopic)) {
    topics.unshift(currentTopic);
  }

  // Build user history hint
  let userHistoryHint = '';
  if (topics.length > 0) {
    userHistoryHint = `Recent topics: ${topics.slice(0, 3).join(', ')}.`;
  }

  // Build emotional hint
  let emotionalHint = 'Neutral emotional state.';
  if (emotionalState) {
    const emotionGuides: Record<string, string> = {
      stressed: 'User seems stressed. Validate feelings before problem-solving.',
      sad: 'User seems sad. Listen actively, offer presence.',
      anxious: 'User seems anxious. Grounding techniques may help.',
      happy: 'User seems happy. Mirror their positive energy.',
      frustrated: 'User seems frustrated. Acknowledge the frustration.',
    };
    emotionalHint = emotionGuides[emotionalState] || `User seems ${emotionalState}.`;
  }

  // Suggest mode based on context
  let suggestedMode = 'conversational';
  if (topics.includes('stress') || emotionalState === 'stressed') {
    suggestedMode = 'supportive';
  } else if (topics.includes('goals')) {
    suggestedMode = 'coaching';
  }

  return {
    userHistoryHint,
    recentTopics: topics.slice(0, 5),
    emotionalHint,
    suggestedMode,
  };
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const instances = new Map<string, ResponseAnticipationService>();

export function getResponseAnticipationService(sessionId: string): ResponseAnticipationService {
  let instance = instances.get(sessionId);
  if (!instance) {
    instance = new ResponseAnticipationService(sessionId);
    instances.set(sessionId, instance);
  }
  return instance;
}

export function resetResponseAnticipationService(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
    log.debug({ sessionId }, '🎯 Response anticipation service reset');
  }
}
