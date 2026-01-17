/**
 * Repair Intelligence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting and fixing misunderstandings elegantly - knowing when
 * something landed wrong and having the wisdom to repair it.
 *
 * This is superhuman because it requires real-time detection of
 * subtle shifts in user response that indicate miscommunication.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RepairIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type MisunderstandingType =
  | 'tone' // Tone was off (too casual, too serious, etc.)
  | 'content' // Misunderstood what they said
  | 'intent' // Misread what they wanted
  | 'timing' // Bad timing (pushed when should have waited)
  | 'assumption' // Made wrong assumption
  | 'boundary' // Crossed a boundary
  | 'depth' // Wrong depth (too deep or too shallow)
  | 'focus'; // Focused on wrong aspect

export type MisunderstandingSeverity = 'minor' | 'moderate' | 'significant';

export type RepairStrategy =
  | 'acknowledge' // Simply acknowledge the misstep
  | 'clarify' // Ask for clarification
  | 'reframe' // Offer a different perspective/framing
  | 'apologize' // Direct apology
  | 'redirect' // Change direction
  | 'validate' // Validate their reaction
  | 'space'; // Give them space

export interface MisunderstandingDetection {
  /** Was there a misunderstanding? */
  detected: boolean;

  /** Type of misunderstanding */
  type: MisunderstandingType | null;

  /** Severity */
  severity: MisunderstandingSeverity;

  /** Confidence in detection */
  confidence: number;

  /** What went wrong */
  whatWentWrong: string;

  /** Evidence (user's reaction) */
  evidence: string[];

  /** Best repair strategy */
  repairStrategy: RepairStrategy;
}

export interface RepairApproach {
  /** Primary strategy */
  strategy: RepairStrategy;

  /** Opening phrase */
  opener: string;

  /** Full repair suggestion */
  fullRepair: string;

  /** What to avoid */
  avoid: string[];

  /** Follow-up if repair doesn't land */
  fallback: string;
}

export interface RepairAttempt {
  /** When attempted */
  timestamp: Date;

  /** Situation */
  situation: string;

  /** Strategy used */
  strategy: RepairStrategy;

  /** Outcome */
  outcome: 'resolved' | 'improved' | 'unchanged' | 'worsened';

  /** What worked / didn't */
  learning: string;
}

export interface RepairProfile {
  userId: string;

  /** Repair history */
  attempts: RepairAttempt[];

  /** What repair strategies work for this user */
  effectiveStrategies: Record<RepairStrategy, number>; // Success rate

  /** Common misunderstanding types with this user */
  commonMisunderstandings: Record<MisunderstandingType, number>;

  /** Sensitivities (topics/tones that need extra care) */
  sensitivities: string[];

  /** Total repairs needed */
  totalMisunderstandings: number;

  /** Successful repairs */
  successfulRepairs: number;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const MISUNDERSTANDING_SIGNALS: Array<{
  patterns: RegExp[];
  type: MisunderstandingType;
  severity: MisunderstandingSeverity;
}> = [
  // Tone issues
  {
    patterns: [
      /that's\s+not\s+(funny|helpful|what\s+i\s+(meant|need))/i,
      /i\s+(wasn't|wasn't)\s+(joking|kidding)/i,
      /don't\s+be\s+(so\s+)?(flippant|casual|dismissive)/i,
      /this\s+is\s+serious/i,
    ],
    type: 'tone',
    severity: 'moderate',
  },
  // Content misunderstanding
  {
    patterns: [
      /no,?\s+(that's\s+not|i\s+didn't\s+(say|mean))/i,
      /you\s+(misunderstood|got\s+it\s+wrong|missed)/i,
      /that's\s+not\s+what\s+i\s+(said|meant)/i,
      /i\s+said\s+.{5,20},?\s+not/i,
    ],
    type: 'content',
    severity: 'moderate',
  },
  // Intent misunderstanding
  {
    patterns: [
      /i\s+(wasn't|didn't)\s+(asking|want(ing)?)\s+(for\s+)?(advice|help|solution)/i,
      /i\s+just\s+(want(ed)?|need(ed)?)\s+(to\s+)?(vent|talk|share)/i,
      /i\s+don't\s+need\s+(you\s+to\s+)?(fix|solve)/i,
      /that's\s+not\s+what\s+i\s+(need|want)(ed)?/i,
    ],
    type: 'intent',
    severity: 'moderate',
  },
  // Timing issues
  {
    patterns: [
      /i('m|\s+am)\s+not\s+ready\s+(to|for)/i,
      /can\s+we\s+(not|just\s+not)/i,
      /not\s+(right\s+)?now/i,
      /i\s+don't\s+want\s+to\s+talk\s+about\s+that\s+(yet|now|right\s+now)/i,
    ],
    type: 'timing',
    severity: 'minor',
  },
  // Wrong assumption
  {
    patterns: [
      /that's\s+(not\s+true|an\s+assumption)/i,
      /you('re|\s+are)\s+assuming/i,
      /don't\s+assume/i,
      /how\s+(do|would)\s+you\s+know/i,
    ],
    type: 'assumption',
    severity: 'moderate',
  },
  // Boundary crossing
  {
    patterns: [
      /that's\s+(too\s+)?(personal|private|none\s+of\s+your)/i,
      /i\s+don't\s+(want|feel\s+comfortable)\s+(sharing|talking|discussing)/i,
      /that's\s+not\s+your\s+(place|business)/i,
      /boundaries?/i,
    ],
    type: 'boundary',
    severity: 'significant',
  },
  // Wrong depth
  {
    patterns: [
      /i\s+was\s+just\s+(making\s+conversation|chatting)/i,
      /it's\s+not\s+that\s+(deep|serious|complicated)/i,
      /you('re|\s+are)\s+(over(thinking|analyzing)|making\s+this)/i,
      /i\s+don't\s+need\s+(therapy|analysis)/i,
    ],
    type: 'depth',
    severity: 'minor',
  },
  // Wrong focus
  {
    patterns: [
      /that's\s+not\s+(the\s+point|what\s+matters)/i,
      /you('re|\s+are)\s+focusing\s+on\s+the\s+wrong/i,
      /the\s+(real|actual|main)\s+(issue|problem|thing)\s+is/i,
      /but\s+what\s+about/i,
    ],
    type: 'focus',
    severity: 'moderate',
  },
];

// Subtle signals that something is off
const SUBTLE_DISCONNECT_SIGNALS = [
  /\.{3,}$/i, // Trailing off with ellipsis
  /^(okay|ok|sure|fine|right|yeah)\.?$/i, // Short, flat responses
  /i\s+guess/i, // Reluctant agreement
  /if\s+you\s+say\s+so/i, // Deference masking disagreement
  /hmm|huh|um/i, // Hesitation
  /anyway/i, // Quick pivot away
  /never\s+mind/i, // Giving up
];

// ============================================================================
// STORAGE
// ============================================================================

const profiles = new Map<string, RepairProfile>();
const recentResponses = new Map<string, string>(); // sessionId -> last AI response

/**
 * Get or create repair profile
 */
export function getRepairProfile(userId: string): RepairProfile {
  let profile = profiles.get(userId);

  if (!profile) {
    const strategies: RepairProfile['effectiveStrategies'] = {
      acknowledge: 0.5,
      clarify: 0.5,
      reframe: 0.5,
      apologize: 0.5,
      redirect: 0.5,
      validate: 0.5,
      space: 0.5,
    };

    const types: RepairProfile['commonMisunderstandings'] = {
      tone: 0,
      content: 0,
      intent: 0,
      timing: 0,
      assumption: 0,
      boundary: 0,
      depth: 0,
      focus: 0,
    };

    profile = {
      userId,
      attempts: [],
      effectiveStrategies: strategies,
      commonMisunderstandings: types,
      sensitivities: [],
      totalMisunderstandings: 0,
      successfulRepairs: 0,
    };
    profiles.set(userId, profile);
  }

  return profile;
}

/**
 * Store the AI's response for future reference
 */
export function recordAIResponse(sessionId: string, response: string): void {
  recentResponses.set(sessionId, response);
}

/**
 * Get the last AI response for a session
 */
function getLastAIResponse(sessionId: string): string | null {
  return recentResponses.get(sessionId) || null;
}

// ============================================================================
// DETECTION ENGINE
// ============================================================================

/**
 * Detect if a misunderstanding occurred
 */
export function detectMisunderstanding(
  userId: string,
  sessionId: string,
  userResponse: string,
  emotionShift: number, // Change in emotion intensity (-1 to 1)
  engagementShift: number // Change in engagement (-1 to 1)
): MisunderstandingDetection {
  const profile = getRepairProfile(userId);
  const lastAIResponse = getLastAIResponse(sessionId);
  const evidence: string[] = [];

  let detected = false;
  let type: MisunderstandingType | null = null;
  let severity: MisunderstandingSeverity = 'minor';
  let confidence = 0;
  let whatWentWrong = '';

  // Check explicit misunderstanding signals
  for (const signal of MISUNDERSTANDING_SIGNALS) {
    for (const pattern of signal.patterns) {
      if (pattern.test(userResponse)) {
        detected = true;
        type = signal.type;
        severity = signal.severity;
        confidence = 0.8;
        evidence.push(`Pattern detected: "${userResponse.match(pattern)?.[0]}"`);
        break;
      }
    }
    if (detected) break;
  }

  // Check subtle disconnect signals
  if (!detected) {
    let subtleSignals = 0;
    for (const signal of SUBTLE_DISCONNECT_SIGNALS) {
      if (signal.test(userResponse)) {
        subtleSignals++;
        evidence.push(`Subtle signal: "${userResponse.match(signal)?.[0]}"`);
      }
    }

    if (subtleSignals >= 2) {
      detected = true;
      confidence = 0.5;
      severity = 'minor';
      type = 'tone'; // Most common for subtle disconnects
    }
  }

  // Check emotional/engagement shifts
  if (!detected) {
    if (emotionShift < -0.3) {
      evidence.push(`Negative emotion shift: ${emotionShift.toFixed(2)}`);
      if (engagementShift < -0.2) {
        detected = true;
        confidence = 0.6;
        severity = 'moderate';
        type = 'tone'; // Default assumption
      }
    }

    if (engagementShift < -0.4) {
      evidence.push(`Engagement drop: ${engagementShift.toFixed(2)}`);
      if (!detected) {
        detected = true;
        confidence = 0.5;
        severity = 'minor';
        type = 'depth';
      }
    }
  }

  // Build whatWentWrong description
  if (detected && type) {
    whatWentWrong = buildWhatWentWrong(type, evidence, lastAIResponse);
  }

  // Determine repair strategy
  const repairStrategy = detected
    ? determineRepairStrategy(type!, severity, profile)
    : 'acknowledge';

  // Update profile if misunderstanding detected
  if (detected && type) {
    profile.commonMisunderstandings[type]++;
    profile.totalMisunderstandings++;
  }

  return {
    detected,
    type,
    severity,
    confidence,
    whatWentWrong,
    evidence,
    repairStrategy,
  };
}

/**
 * Build description of what went wrong
 */
function buildWhatWentWrong(
  type: MisunderstandingType,
  evidence: string[],
  lastResponse: string | null
): string {
  const descriptions: Record<MisunderstandingType, string> = {
    tone: 'The tone may have been off - too casual, too serious, or not matching their energy.',
    content: 'Something was misunderstood about what they said or meant.',
    intent:
      'Their intent was misread - they may have wanted something different than what was provided.',
    timing: 'The timing was off - perhaps pushing when they needed space.',
    assumption: 'An assumption was made that may not be accurate.',
    boundary: 'A boundary may have been crossed - too personal or intrusive.',
    depth: 'The depth was wrong - either too deep or too shallow for what they needed.',
    focus: 'The focus was on the wrong aspect of what they shared.',
  };

  return descriptions[type] || "Something in the response didn't land well.";
}

/**
 * Determine best repair strategy based on type and user history
 */
function determineRepairStrategy(
  type: MisunderstandingType,
  severity: MisunderstandingSeverity,
  profile: RepairProfile
): RepairStrategy {
  // Default strategies by type
  const typeStrategies: Record<MisunderstandingType, RepairStrategy> = {
    tone: 'acknowledge',
    content: 'clarify',
    intent: 'clarify',
    timing: 'space',
    assumption: 'apologize',
    boundary: 'apologize',
    depth: 'reframe',
    focus: 'clarify',
  };

  // Get default for this type
  let strategy = typeStrategies[type];

  // Override with user's preferred strategy if we have data
  const effectiveStrategies = Object.entries(profile.effectiveStrategies)
    .filter(([, rate]) => rate > 0.6)
    .sort(([, a], [, b]) => b - a);

  if (effectiveStrategies.length > 0 && profile.attempts.length > 3) {
    // Use their most effective strategy if we have enough data
    strategy = effectiveStrategies[0][0] as RepairStrategy;
  }

  // Severity overrides
  if (severity === 'significant') {
    // More serious issues need more direct repair
    if (type === 'boundary') {
      strategy = 'apologize';
    }
  }

  return strategy;
}

// ============================================================================
// REPAIR GENERATION
// ============================================================================

/**
 * Generate repair approach
 */
export function generateRepair(detection: MisunderstandingDetection): RepairApproach {
  const { type, severity, repairStrategy } = detection;

  // Strategy-specific repair phrases
  const repairs: Record<
    RepairStrategy,
    { openers: string[]; templates: string[]; avoid: string[] }
  > = {
    acknowledge: {
      openers: [
        'I hear that.',
        "I can see that didn't land right.",
        'Fair enough.',
        "You're right.",
      ],
      templates: [
        'I hear that. Let me try again.',
        "That didn't come out right. What I meant was...",
        "I can see that didn't land. Let's back up.",
      ],
      avoid: ["I'm sorry you feel that way", "That's not what I meant but..."],
    },
    clarify: {
      openers: [
        'Help me understand better.',
        "Let me make sure I'm tracking.",
        'Can you say more about that?',
      ],
      templates: [
        'Help me understand better - what am I missing?',
        "I want to make sure I'm hearing you right. You're saying...",
        'Let me check my understanding. Is it that...?',
      ],
      avoid: ['What do you mean?', "I don't understand"],
    },
    reframe: {
      openers: [
        'Let me try a different angle.',
        'Maybe I approached that wrong.',
        'Coming at it differently...',
      ],
      templates: [
        'Let me try that differently. What if we looked at it as...',
        'Maybe I was overcomplicating it. Simply put...',
        'Different approach: what matters most to you here?',
      ],
      avoid: ['What I was TRYING to say', 'Let me explain it another way'],
    },
    apologize: {
      openers: ["I'm sorry.", 'My bad.', 'That was out of line.', 'I overstepped.'],
      templates: [
        "I'm sorry. That wasn't my place.",
        'I overstepped there. Thank you for saying something.',
        "My bad - I shouldn't have assumed that.",
      ],
      avoid: ["I'm sorry if you felt", "I didn't mean to but", 'Sorry but'],
    },
    redirect: {
      openers: ["Let's shift gears.", "You know what, let's park that.", 'Different topic:'],
      templates: [
        "Let's shift gears. What would actually be helpful right now?",
        "Putting that aside - what's on your mind?",
        'Let me follow your lead. Where do you want to go with this?',
      ],
      avoid: ['Anyway...', 'Moving on...', "Let's change the subject"],
    },
    validate: {
      openers: ["You're right to call that out.", 'That makes sense.', 'I get it.'],
      templates: [
        "You're right to push back on that. I was off base.",
        "That makes sense - I wasn't seeing it from your angle.",
        'I get why that landed wrong. Thank you for being direct.',
      ],
      avoid: ['But you have to understand', 'From my perspective'],
    },
    space: {
      openers: ['Take your time.', 'No rush.', "We don't have to go there."],
      templates: [
        "We don't have to go there. I'm here when you're ready.",
        'No pressure. What would feel good to talk about?',
        "I pushed too fast. Let's slow down.",
      ],
      avoid: ['But eventually we should', "When you're ready we can"],
    },
  };

  const strategyData = repairs[repairStrategy];
  const opener = strategyData.openers[Math.floor(Math.random() * strategyData.openers.length)];
  const fullRepair =
    strategyData.templates[Math.floor(Math.random() * strategyData.templates.length)];

  // Fallback if repair doesn't land
  const fallback =
    severity === 'significant'
      ? "I hear you. I'll follow your lead."
      : 'Got it. What would be helpful?';

  return {
    strategy: repairStrategy,
    opener,
    fullRepair,
    avoid: strategyData.avoid,
    fallback,
  };
}

// ============================================================================
// LEARNING FROM REPAIRS
// ============================================================================

/**
 * Record repair outcome
 */
export function recordRepairOutcome(
  userId: string,
  detection: MisunderstandingDetection,
  approach: RepairApproach,
  outcome: RepairAttempt['outcome']
): void {
  const profile = getRepairProfile(userId);

  // Record attempt
  profile.attempts.push({
    timestamp: new Date(),
    situation: detection.whatWentWrong,
    strategy: approach.strategy,
    outcome,
    learning:
      outcome === 'resolved' || outcome === 'improved'
        ? `${approach.strategy} worked for ${detection.type}`
        : `${approach.strategy} didn't work for ${detection.type}`,
  });

  // Update strategy effectiveness
  const alpha = 0.2;
  const outcomeScore =
    outcome === 'resolved' ? 1 : outcome === 'improved' ? 0.7 : outcome === 'unchanged' ? 0.3 : 0;

  profile.effectiveStrategies[approach.strategy] =
    alpha * outcomeScore + (1 - alpha) * profile.effectiveStrategies[approach.strategy];

  // Update success rate
  if (outcome === 'resolved' || outcome === 'improved') {
    profile.successfulRepairs++;
  }

  // Keep attempts bounded
  if (profile.attempts.length > 50) {
    profile.attempts.shift();
  }

  log.info({ userId, strategy: approach.strategy, outcome }, '🔧 Repair outcome recorded');
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format repair for prompt injection
 */
export function formatRepairForPrompt(
  detection: MisunderstandingDetection,
  approach: RepairApproach
): string {
  // IMPORTANT: Don't include literal phrases to copy - the LLM will parrot them verbatim
  // Instead, describe the approach and let the LLM craft natural language
  const lines = ['[REPAIR NEEDED]'];

  lines.push(`Issue: ${detection.whatWentWrong}`);
  lines.push(`Strategy: ${approach.strategy}`);

  if (approach.avoid.length > 0) {
    lines.push(`AVOID: ${approach.avoid[0]}`);
  }

  // Describe the approach without literal scripts
  lines.push(
    `Repair approach: Acknowledge the misunderstanding, then ${approach.strategy.toLowerCase()}`
  );

  return lines.join('\n');
}

/**
 * Check if repair is needed (quick check for context builder)
 */
export function quickRepairCheck(
  userResponse: string,
  emotionShift: number
): { needsRepair: boolean; severity: MisunderstandingSeverity } {
  // Quick pattern check
  const hasExplicitSignal = MISUNDERSTANDING_SIGNALS.some((s) =>
    s.patterns.some((p) => p.test(userResponse))
  );

  if (hasExplicitSignal) {
    const signal = MISUNDERSTANDING_SIGNALS.find((s) =>
      s.patterns.some((p) => p.test(userResponse))
    )!;
    return { needsRepair: true, severity: signal.severity };
  }

  // Check for negative shift
  if (emotionShift < -0.4) {
    return { needsRepair: true, severity: 'minor' };
  }

  return { needsRepair: false, severity: 'minor' };
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a repair profile into memory (for persistence)
 */
export function importRepairProfile(profile: RepairProfile): void {
  profiles.set(profile.userId, profile);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all repair intelligence state (for testing)
 */
export function resetRepairIntelligence(): void {
  profiles.clear();
  recentResponses.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRepairProfile,
  recordAIResponse,
  detectMisunderstanding,
  generateRepair,
  recordRepairOutcome,
  formatRepairForPrompt,
  quickRepairCheck,
  resetRepairIntelligence,
};
