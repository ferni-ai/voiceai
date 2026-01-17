/**
 * Phase 3: Fast Intent Classifier
 *
 * Ultra-fast intent classification that runs in <5ms.
 * This provides immediate context enrichment without blocking.
 *
 * Intent types:
 * - tool_request: User wants to use a tool
 * - conversation: User wants to chat
 * - clarification: User needs something explained
 * - confirmation: User is confirming/denying
 * - correction: User is correcting a mistake
 * - emotional: User is expressing emotions
 * - greeting: User is greeting/parting
 * - meta: User is asking about Ferni itself
 *
 * @module intelligence/semantic-intelligence/intent-classifier
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticIntelligence.IntentClassifier' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * High-level intent types
 */
export type IntentType =
  | 'tool_request' // User wants to execute a tool
  | 'conversation' // User wants to chat
  | 'clarification' // User wants explanation
  | 'confirmation' // User confirming (yes/no)
  | 'correction' // User correcting mistake
  | 'emotional' // User expressing emotions
  | 'greeting' // Greetings and partings
  | 'meta' // Asking about the assistant
  | 'unknown'; // Can't determine

/**
 * Detailed intent classification result
 */
export interface IntentClassification {
  /** Primary intent type */
  type: IntentType;

  /** Confidence in classification (0-1) */
  confidence: number;

  /** Secondary possible intent */
  secondaryType?: IntentType;

  /** Mood of the request */
  mood: 'command' | 'question' | 'statement' | 'exclamation';

  /** Urgency level */
  urgency: 'low' | 'normal' | 'high' | 'critical';

  /** Is this a compound request (multiple intents)? */
  isCompound: boolean;

  /** Detected sentiment */
  sentiment: 'positive' | 'neutral' | 'negative';

  /** Processing time in ms */
  processingTimeMs: number;

  /** Patterns that matched */
  matchedPatterns: string[];
}

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

/**
 * Pattern matchers for each intent type
 * These run in order, first match wins for tie-breaking
 */
const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  // Tool requests - action verbs + objects
  tool_request: [
    /^(play|search|find|get|show|check|set|create|schedule|send|call|text|remind|add|delete|remove|cancel|book|order|start|stop|pause|resume)\b/i,
    /\b(weather|calendar|music|news|stocks|reminder|alarm|timer|event|appointment|message|email)\b/i,
    /\b(what's|what is) (the )?(weather|time|date|news|forecast)\b/i,
    /^(can you|could you|would you|will you|please)\s+(play|search|find|get|check|set)/i,
    /\b(transfer|hand off|connect me|talk to|speak with)\s+(to\s+)?\w+/i,
  ],

  // Conversation - chat starters, opinions, stories
  conversation: [
    /^(tell me|i think|i feel|i believe|in my opinion|you know|so anyway|speaking of)/i,
    /^(what do you think|how do you feel|do you believe)\b/i,
    /\b(chat|talk|discuss|conversation|story|experience)\b/i,
    /^(let me tell you|i want to share|can we talk)\b/i,
    /^(so|anyway|well|actually|honestly|frankly)\s+\w+/i,
  ],

  // Clarification - explaining requests
  clarification: [
    /^(what|how|why|when|where|who|which)\s+(do|does|is|are|was|were|would|should|can|could)\b/i,
    /^(can you explain|help me understand|what does .* mean|i don't understand)/i,
    /\b(mean|meaning|definition|explain|clarify)\b/i,
    /^(i'm confused|i don't get|not sure what)\b/i,
  ],

  // Confirmation - yes/no responses
  confirmation: [
    /^(yes|yeah|yep|yup|sure|ok|okay|alright|absolutely|definitely|correct|right|exactly|affirmative|uh-?huh)\b/i,
    /^(no|nope|nah|not really|negative|wrong|incorrect)\b/i,
    /^(that's right|that's correct|that's wrong|not quite)\b/i,
    /^(go ahead|do it|proceed|confirm|approved)\b/i,
    /^(stop|cancel|nevermind|forget it|don't)\b/i,
  ],

  // Correction - fixing mistakes
  correction: [
    /^(no|actually|wait|sorry),?\s+(i meant|i said|i want|that's not)/i,
    /\b(not that|wrong one|different|instead|meant to say)\b/i,
    /^(i didn't mean|that's not what i|correction:)\b/i,
    /^(no no|wait wait|hold on)\b/i,
  ],

  // Emotional - expressing feelings
  emotional: [
    /^(i'm|i am)\s+(so\s+)?(happy|sad|angry|frustrated|excited|worried|anxious|stressed|tired|exhausted)\b/i,
    /\b(feel|feeling)\s+(so\s+)?(good|bad|great|terrible|awful|amazing|wonderful|horrible)\b/i,
    /^(ugh|argh|wow|yay|omg|oh no|damn|shit|fuck)\b/i,
    /\b(crying|tears|upset|devastated|ecstatic|thrilled)\b/i,
    /\b(love|hate|adore|despise|can't stand)\s+(this|that|it|you)\b/i,
  ],

  // Greeting - hellos and goodbyes
  greeting: [
    /^(hi|hey|hello|howdy|greetings|good\s+(morning|afternoon|evening|night)|yo|sup)\b/i,
    /^(bye|goodbye|see you|later|take care|good night|gotta go|have to go)\b/i,
    /^(how are you|how's it going|what's up|how've you been)\b/i,
    /^(nice to (meet|see) you|welcome back)\b/i,
  ],

  // Meta - asking about the assistant
  meta: [
    /^(who|what) are you\b/i,
    /^(can you|do you|are you)\s+(help|do|know|understand|learn|feel|think)\b/i,
    /\b(your name|your purpose|about yourself|your creator|anthropic|ai|assistant)\b/i,
    /^(what can you do|what are your capabilities|how do you work)\b/i,
  ],

  // Unknown - fallback
  unknown: [],
};

/**
 * Mood detection patterns
 */
const MOOD_PATTERNS: Record<IntentClassification['mood'], RegExp[]> = {
  command: [
    /^(play|set|create|send|call|add|delete|start|stop|do)\b/i,
    /^(i want|i need|give me|get me)\b/i,
  ],
  question: [
    /\?$/,
    /^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)\b/i,
  ],
  exclamation: [/!$/, /^(wow|omg|oh|yay|ugh|argh)\b/i],
  statement: [], // Default
};

/**
 * Urgency patterns
 */
const URGENCY_PATTERNS: Record<IntentClassification['urgency'], RegExp[]> = {
  critical: [
    /\b(emergency|urgent|asap|immediately|right now|help me|crisis|911|danger)\b/i,
    /\b(hurting myself|want to die|suicidal|kill myself)\b/i,
  ],
  high: [
    /\b(urgent|asap|quickly|hurry|fast|right away|soon as possible)\b/i,
    /\b(important|crucial|critical)\b/i,
  ],
  normal: [],
  low: [/\b(whenever|no rush|take your time|later|eventually|at some point)\b/i],
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Classify intent from user input
 *
 * This is designed to be FAST (<5ms) for real-time use.
 *
 * @example
 * ```typescript
 * const result = classifyIntent('play some jazz music');
 * // Result:
 * // {
 * //   type: 'tool_request',
 * //   confidence: 0.95,
 * //   mood: 'command',
 * //   urgency: 'normal',
 * //   isCompound: false,
 * //   sentiment: 'neutral',
 * // }
 * ```
 */
export function classifyIntent(inputText: string): IntentClassification {
  const startTime = performance.now();
  const normalizedInput = inputText.trim();
  const matchedPatterns: string[] = [];

  // 1. Classify intent type
  let primaryType: IntentType = 'unknown';
  let primaryConfidence = 0;
  let secondaryType: IntentType | undefined;

  for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS) as [
    IntentType,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        const confidence = calculatePatternConfidence(pattern, normalizedInput);
        matchedPatterns.push(`${intentType}:${pattern.source.substring(0, 30)}`);

        if (confidence > primaryConfidence) {
          secondaryType = primaryType !== 'unknown' ? primaryType : undefined;
          primaryType = intentType;
          primaryConfidence = confidence;
        } else if (confidence > 0.5 && !secondaryType) {
          secondaryType = intentType;
        }
      }
    }
  }

  // 2. Detect mood
  const mood = detectMood(normalizedInput);

  // 3. Detect urgency
  const urgency = detectUrgency(normalizedInput);

  // 4. Detect sentiment
  const sentiment = detectSentiment(normalizedInput);

  // 5. Check for compound intent
  const isCompound = checkCompoundIntent(normalizedInput);

  const processingTimeMs = performance.now() - startTime;

  log.debug(
    {
      inputText: normalizedInput.substring(0, 50),
      type: primaryType,
      confidence: primaryConfidence,
      mood,
      urgency,
      processingTimeMs,
    },
    'Classified intent'
  );

  return {
    type: primaryType,
    confidence: primaryConfidence || 0.5, // Default confidence for unknown
    secondaryType,
    mood,
    urgency,
    isCompound,
    sentiment,
    processingTimeMs,
    matchedPatterns,
  };
}

/**
 * Quick intent type check
 *
 * Even faster than full classification when you just need the type.
 */
export function getIntentType(inputText: string): IntentType {
  const normalizedInput = inputText.trim();

  for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS) as [
    IntentType,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        return intentType;
      }
    }
  }

  return 'unknown';
}

/**
 * Check if input is likely a tool request
 */
export function isToolRequest(inputText: string): boolean {
  const classification = classifyIntent(inputText);
  return classification.type === 'tool_request' && classification.confidence > 0.6;
}

/**
 * Check if input needs crisis support
 */
export function needsCrisisSupport(inputText: string): boolean {
  const classification = classifyIntent(inputText);
  return classification.urgency === 'critical';
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Calculate confidence based on pattern match quality
 */
function calculatePatternConfidence(pattern: RegExp, input: string): number {
  const match = input.match(pattern);
  if (!match) return 0;

  // Longer matches = higher confidence
  const matchLength = match[0]?.length ?? 0;
  const inputLength = input.length;

  // Match at start of input = higher confidence
  const startsAtBeginning = match.index === 0;

  // Base confidence
  let confidence = 0.7;

  // Boost for match coverage
  confidence += (matchLength / inputLength) * 0.2;

  // Boost for starting match
  if (startsAtBeginning) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Detect the mood of the input
 */
function detectMood(input: string): IntentClassification['mood'] {
  for (const [mood, patterns] of Object.entries(MOOD_PATTERNS) as [
    IntentClassification['mood'],
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return mood;
      }
    }
  }
  return 'statement';
}

/**
 * Detect urgency level
 */
function detectUrgency(input: string): IntentClassification['urgency'] {
  for (const [urgency, patterns] of Object.entries(URGENCY_PATTERNS) as [
    IntentClassification['urgency'],
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return urgency;
      }
    }
  }
  return 'normal';
}

/**
 * Detect sentiment (simple approach)
 */
function detectSentiment(input: string): IntentClassification['sentiment'] {
  const positiveWords =
    /\b(love|great|awesome|amazing|wonderful|happy|excited|good|nice|thanks|thank you|please)\b/i;
  const negativeWords =
    /\b(hate|terrible|awful|horrible|bad|angry|frustrated|annoyed|sad|disappointed|ugh|damn)\b/i;

  const hasPositive = positiveWords.test(input);
  const hasNegative = negativeWords.test(input);

  if (hasPositive && !hasNegative) return 'positive';
  if (hasNegative && !hasPositive) return 'negative';
  return 'neutral';
}

/**
 * Check if input contains multiple intents
 */
function checkCompoundIntent(input: string): boolean {
  // Check for conjunctions that suggest multiple requests
  const compoundPatterns = [
    /\band\s+(then|also|after that)\b/i,
    /\b(first|then|next|finally)\b.*\b(first|then|next|finally)\b/i,
    /[,;]\s*(and|then|also)/i,
    /\b(also|too|as well)\b.*\b(play|set|create|send|check)\b/i,
  ];

  return compoundPatterns.some((pattern) => pattern.test(input));
}
