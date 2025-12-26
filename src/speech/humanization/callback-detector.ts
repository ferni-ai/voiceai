/**
 * Callback Trigger Detector
 *
 * Detects when user input triggers a persona's callback phrases.
 * Callbacks create relationship continuity by referencing shared history.
 *
 * Example:
 * - User mentions "willpower" → Maya's "systems beat willpower" callback
 * - User asks a deep question → Ferni's "powerful question" callback
 * - User mentions a mistake → Ferni's "second chances" callback
 *
 * @module speech/humanization/callback-detector
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getSpeechProfileSync } from './behavior-loader.js';

const log = createLogger({ module: 'CallbackDetector' });

// =============================================================================
// TYPES
// =============================================================================

export interface CallbackTrigger {
  /** Callback ID from the JSON file */
  id: string;
  /** The trigger keyword/concept that matched */
  trigger: string;
  /** Context description from JSON */
  context: string;
  /** Match confidence (0-1) */
  confidence: number;
}

export interface DetectedCallback {
  /** Callback ID */
  id: string;
  /** Trigger that matched */
  trigger: string;
  /** Whether to use first-use or callback version */
  useCallbackVersion: boolean;
  /** Selected phrase to inject */
  phrase: string;
  /** Confidence of the detection */
  confidence: number;
}

// =============================================================================
// TRIGGER PATTERNS
// =============================================================================

/**
 * Extended trigger patterns for each callback trigger type.
 * Maps simple triggers to regex patterns that detect related concepts.
 */
const TRIGGER_PATTERNS: Record<string, RegExp[]> = {
  // Ferni triggers
  question: [
    /\b(why|what if|how come|what does .+ mean|can you explain)\b/i,
    /\?\s*$/,  // Ends with question mark
    /\b(curious|wondering|thinking about|pondering)\b/i,
  ],
  mistake: [
    /\b(messed up|screwed up|failed|blew it|mistakes?|regret|wish I had|should have)\b/i,
    /\b(do-over|second chance|try again|start over)\b/i,
    /\b(keep (doing|making)|same .+ (again|over))\b/i,
  ],
  worth: [
    /\b(worthless|not good enough|don't deserve|who am I to|imposter|failure)\b/i,
    /\b(net worth|salary|income|money defines|success means)\b/i,
    /\b(compared to|not as good as|everyone else has)\b/i,
    /\bwhat'?s the point\b/i,
    /\b(not successful|still not|never .+enough|hard.+but.+still)\b/i,
  ],
  conversation: [
    /\b(sidebar|tangent|by the way|off topic|random thought)\b/i,
    /\b(while we're at it|speaking of|that reminds me)\b/i,
  ],
  hesitation: [
    /\b(um+|uh+|well\.{2,}|so\.{2,}|I mean\.{2,})\b/i,
    /^(I|Um|So|Well)\s*[.]{2,}/i,
    /\b(hard to say|not sure how to|difficult to explain)\b/i,
  ],
  patience: [
    /\b(slow progress|taking forever|when will|how long|impatient)\b/i,
    /\b(waiting|patience|time takes|eventually)\b/i,
    /\b(accept|let go|surrender|imperfect|good enough)\b/i,
  ],

  // Maya triggers
  willpower: [
    /\b(willpower|discipline|motivation|self-control|force myself)\b/i,
    /\b(can't make myself|no motivation|lazy|procrastinat)\b/i,
  ],
  small_progress: [
    /\b(only did|just did|barely|not much|small step|tiny bit)\b/i,
    /\b(it's nothing|doesn't count|not enough|barely counts)\b/i,
    /\b(at least I|managed to|finally did)\b/i,
  ],
  failure: [
    /\b(fell off|broke.*streak|failed|gave up|quit|stopped)\b/i,
    /\b(missed .* days|haven't .* in|used to .* but)\b/i,
  ],
  routine: [
    /\b(morning routine|before bed|after work|when should I|best time)\b/i,
    /\b(schedule|routine|habit|daily|every day)\b/i,
  ],
  becoming: [
    /\b(I am a|I'm a|I've become|now I'm someone who)\b/i,
    /\b(part of who I am|identify as|that's just me|naturally)\b/i,
  ],
  too_much: [
    /\b(too much|overwhelming|impossible|can't do it all)\b/i,
    /\b(where do I start|too hard|daunting|intimidating)\b/i,
  ],

  // Nayan triggers
  meaning: [
    /\b(what's the point|meaning of|purpose|why bother|existential)\b/i,
    /\b(life's meaning|bigger picture|grand scheme|in the end)\b/i,
  ],
  paradox: [
    /\b(both true|contradictory|doesn't make sense|opposite)\b/i,
    /\b(yet also|but at the same time|seemingly conflicting)\b/i,
  ],
  suffering: [
    /\b(suffering|pain|struggle|hardship|difficult time)\b/i,
    /\b(why is life|unfair|injustice|can't understand)\b/i,
  ],

  // Jordan triggers (from callbacks.json)
  big_picture: [
    /\b(big picture|overall|life arc|looking back|whole life)\b/i,
    /\b(grand scheme|in the end|when all is said|journey)\b/i,
  ],
  achievement: [
    /\b(achieved|accomplished|reached|completed|milestone)\b/i,
    /\b(promotion|graduation|award|won|succeeded)\b/i,
  ],
  change: [
    /\b(change|changing|transition|new chapter|moving on)\b/i,
    /\b(starting fresh|new beginning|next phase|turning point)\b/i,
  ],
  dream: [
    /\b(dream|dreaming|vision|someday|one day)\b/i,
    /\b(hope to|aspire|bucket list|imagine)\b/i,
  ],
  self_doubt: [
    /\b(doubt myself|not good enough|imposter|fraud|fake)\b/i,
    /\b(who am I to|don't deserve|not worthy)\b/i,
  ],
  celebration: [
    /\b(celebrate|celebrating|party|birthday|anniversary)\b/i,
    /\b(congrat|proud of|excited about|big news)\b/i,
  ],
  // Legacy Jordan triggers (keep for compatibility)
  future: [
    /\b(someday|one day|future|years from now|when I'm older)\b/i,
    /\b(vision|dream|goal|aspire|hope to)\b/i,
  ],
  milestone: [
    /\b(milestone|achievement|accomplished|reached|completed)\b/i,
    /\b(birthday|anniversary|graduation|promotion)\b/i,
  ],
  transition: [
    /\b(new chapter|next phase|moving on|starting fresh|new beginning)\b/i,
    /\b(life change|big decision|crossroads|at a turning point)\b/i,
  ],

  // Alex triggers
  overwhelm: [
    /\b(so much to do|overwhelmed|drowning|buried|too many things)\b/i,
    /\b(can't keep up|falling behind|inbox|backlog)\b/i,
  ],
  boundaries: [
    /\b(boundary|boundaries|say no|people pleasing|overcommit)\b/i,
    /\b(too much on my plate|can't say no|always helping)\b/i,
  ],
  clarity: [
    /\b(priority|prioritize|what matters|focus|most important)\b/i,
    /\b(clarity|clear|simplify|streamline|organize)\b/i,
  ],

  // Nayan triggers (from callbacks.json)
  searching: [
    /\b(searching|looking for|seeking|quest|trying to find)\b/i,
    /\b(what am I|where do I|who am I|meaning)\b/i,
  ],
  unique: [
    /\b(unique|special|different|one of a kind|unlike)\b/i,
    /\b(no one else|only I|just me|my own way)\b/i,
  ],
  contradiction: [
    /\b(contradiction|contradictory|paradox|both true|opposite)\b/i,
    /\b(doesn't make sense|conflicting|yet also)\b/i,
  ],
  uncomfortable: [
    /\b(uncomfortable|discomfort|uneasy|hard to sit with)\b/i,
    /\b(anxiety|anxious|nervous|scared|afraid)\b/i,
  ],
  question_seeking_answer: [
    /\b(what is the answer|why does|how can I|seeking answers)\b/i,
    /\b(need to understand|figure out|make sense of)\b/i,
  ],
  mortality: [
    /\b(death|dying|mortality|end of life|legacy)\b/i,
    /\b(when I'm gone|after I die|limited time)\b/i,
  ],
  // Legacy Nayan triggers
  meaning: [
    /\b(what's the point|meaning of|purpose|why bother|existential)\b/i,
    /\b(life's meaning|bigger picture|grand scheme|in the end)\b/i,
  ],
  paradox: [
    /\b(both true|contradictory|doesn't make sense|opposite)\b/i,
    /\b(yet also|but at the same time|seemingly conflicting)\b/i,
  ],
  suffering: [
    /\b(suffering|pain|struggle|hardship|difficult time)\b/i,
    /\b(why is life|unfair|injustice|can't understand)\b/i,
  ],

  // Peter triggers (from callbacks.json)
  doubt: [
    /\b(doubt|doubting|uncertain|unsure|worried about)\b/i,
    /\b(second guess|questioning|nervous about)\b/i,
  ],
  patience: [
    /\b(patience|patient|wait|waiting|long term)\b/i,
    /\b(take time|years|decades|eventually)\b/i,
  ],
  expensive: [
    /\b(expensive|costly|high fees|too much money)\b/i,
    /\b(costs|expenses|charges|paying too much)\b/i,
  ],
  timing: [
    /\b(timing|time the market|when to buy|when to sell)\b/i,
    /\b(right time|wrong time|missed|too late|too early)\b/i,
  ],
  complicated: [
    /\b(complicated|complex|confusing|overwhelming|too many)\b/i,
    /\b(don't understand|hard to follow|options)\b/i,
  ],
  more: [
    /\b(more|want more|need more|not enough|greedy)\b/i,
    /\b(keep up|always chasing|never satisfied)\b/i,
  ],
  // Legacy Peter triggers
  market: [
    /\b(market|stocks|invest|portfolio|fund|401k|IRA)\b/i,
    /\b(down market|bear market|crash|correction|volatility)\b/i,
  ],
  compound: [
    /\b(compound|long term|over time|patience|decades)\b/i,
    /\b(stay the course|don't panic|time in market)\b/i,
  ],
  simplicity: [
    /\b(simple|simplify|index fund|low cost|boring)\b/i,
    /\b(complicated|overthinking|too many options)\b/i,
  ],
};

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect callback triggers in user input
 */
export function detectCallbackTriggers(
  userText: string,
  personaId: string
): CallbackTrigger[] {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.callbacks?.callbacks) {
    return [];
  }

  const triggers: CallbackTrigger[] = [];
  const textLower = userText.toLowerCase();

  for (const callback of profile.callbacks.callbacks) {
    const triggerId = callback.trigger;
    const patterns = TRIGGER_PATTERNS[triggerId];

    if (!patterns) {
      // Fall back to simple substring match
      if (textLower.includes(triggerId.toLowerCase())) {
        triggers.push({
          id: callback.id,
          trigger: triggerId,
          context: callback.context,
          confidence: 0.5,
        });
      }
      continue;
    }

    // Check each pattern
    let maxConfidence = 0;
    for (const pattern of patterns) {
      if (pattern.test(userText)) {
        // Confidence based on pattern specificity
        const isSpecific = pattern.source.includes('\\b');
        maxConfidence = Math.max(maxConfidence, isSpecific ? 0.8 : 0.6);
      }
    }

    if (maxConfidence > 0) {
      triggers.push({
        id: callback.id,
        trigger: triggerId,
        context: callback.context,
        confidence: maxConfidence,
      });
    }
  }

  // Sort by confidence
  triggers.sort((a, b) => b.confidence - a.confidence);

  if (triggers.length > 0) {
    log.debug({ personaId, triggers: triggers.length }, 'Detected callback triggers');
  }

  return triggers;
}

/**
 * Select a callback to inject based on triggers and conversation history
 */
export function selectCallback(
  triggers: CallbackTrigger[],
  personaId: string,
  conversationCount: number,
  usedCallbacks?: Set<string>
): DetectedCallback | null {
  if (triggers.length === 0) {
    return null;
  }

  const profile = getSpeechProfileSync(personaId);
  if (!profile?.callbacks?.callbacks) {
    return null;
  }

  // Try triggers in order of confidence
  for (const trigger of triggers) {
    // Skip if already used this session
    if (usedCallbacks?.has(trigger.id)) {
      continue;
    }

    const callback = profile.callbacks.callbacks.find(c => c.id === trigger.id);
    if (!callback) continue;

    // Determine first-use vs callback version
    const useCallbackVersion = conversationCount >= callback.callbacks.minConversationsForCallback;

    // Probability check for callback version
    if (useCallbackVersion && Math.random() > callback.callbacks.probability) {
      continue;
    }

    // First-use always triggers (to establish the phrase)
    // Callback version is probabilistic

    // Select phrase
    const variations = useCallbackVersion
      ? callback.callbacks.variations
      : callback.firstUse.variations;

    const phrase = variations[Math.floor(Math.random() * variations.length)];

    log.debug(
      {
        personaId,
        callbackId: trigger.id,
        useCallbackVersion,
        conversationCount,
      },
      'Selected callback to inject'
    );

    return {
      id: trigger.id,
      trigger: trigger.trigger,
      useCallbackVersion,
      phrase,
      confidence: trigger.confidence,
    };
  }

  return null;
}

/**
 * Inject a callback phrase into the beginning of a response
 */
export function injectCallback(
  text: string,
  callback: DetectedCallback
): string {
  // Add the callback phrase at the start with a natural break
  return `${callback.phrase} <break time="300ms"/> ${text}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  detectCallbackTriggers,
  selectCallback,
  injectCallback,
};

