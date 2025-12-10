/**
 * Speech Naturalizer
 *
 * Makes AI speech sound more human through strategic imperfections:
 * - Disfluencies (um, uh, like, you know)
 * - Self-correction / repair
 * - Thinking out loud
 * - Hedging and uncertainty
 * - Sentence fragments
 *
 * These "imperfections" are what make human speech feel authentic.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DisfluencyConfig {
  enabled: boolean;
  frequency: number; // 0-1, how often to add disfluencies
  personaStyle: 'minimal' | 'natural' | 'conversational' | 'folksy';
  contextSensitivity: boolean; // Reduce disfluencies for serious topics
}

export interface NaturalizationContext {
  emotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  isResponding?: boolean; // vs initiating
  turnNumber?: number;
  userEnergy?: 'high' | 'medium' | 'low';
}

export interface ThinkingPattern {
  type: 'processing' | 'recalling' | 'considering' | 'uncertain';
  phrase: string;
  ssml: string;
}

// ============================================================================
// DISFLUENCY LIBRARY
// ============================================================================

/**
 * Persona-specific disfluency patterns
 * Each persona has characteristic speech patterns
 */
const PERSONA_DISFLUENCIES: Record<
  string,
  {
    fillers: string[];
    hedges: string[];
    repairs: string[];
    thinkingPhrases: string[];
  }
> = {
  'nayan-patel': {
    fillers: ['Well...', 'Now...', 'You see...', 'Look...'],
    hedges: ['I believe', 'In my view', 'Generally speaking', 'As I see it'],
    repairs: [
      'Let me rephrase that.',
      'Actually, let me put it differently.',
      "No, wait—here's a better way to say it.",
    ],
    thinkingPhrases: [
      'Hmm, let me think about that...',
      "You know, that's worth considering...",
      'Now, that brings up an important point...',
    ],
  },
  ferni: {
    fillers: ['You know...', 'I mean...', "It's like..."],
    hedges: ['I sense', 'It feels like', 'Perhaps', 'Maybe'],
    repairs: [
      'Wait, let me say that differently.',
      "Actually—no, that's not quite it.",
      'Let me try again.',
    ],
    thinkingPhrases: [
      'Hmm... let me sit with that.',
      "That's a powerful question...",
      "I'm feeling into this...",
      '<break time="300ms"/>You know what...',
    ],
  },
  'peter-john': {
    fillers: ['You know...', 'So...', 'I mean...', 'Look...'],
    hedges: ['I think', 'Probably', 'It seems like', 'My guess is'],
    repairs: [
      'Wait, wait—let me back up.',
      "No, here's the thing—",
      "Actually, forget that—here's what matters:",
    ],
    thinkingPhrases: [
      'Let me think about this...',
      "You know what's interesting?",
      "Here's what jumps out at me...",
      'Okay, so...',
    ],
  },
  'maya-santos': {
    fillers: ['So...', 'Like...', 'You know...'],
    hedges: ['I feel like', 'It seems', 'Maybe', 'Possibly'],
    repairs: ['Wait, let me rephrase.', 'Actually, that came out wrong.', 'Let me try that again.'],
    thinkingPhrases: [
      "Hmm, that's interesting...",
      'Let me think about how to say this...',
      'You know what I mean?',
      "Here's the thing...",
    ],
  },
  'alex-chen': {
    fillers: ['So...', 'Right...', 'Okay...'],
    hedges: ['I think', 'Probably', 'Usually', 'In general'],
    repairs: ['Wait—let me be clearer.', 'Actually, scratch that.', 'Let me start over.'],
    thinkingPhrases: [
      'Let me check on that...',
      'Hmm, one second...',
      "Okay, so here's the situation...",
    ],
  },
  'jordan-taylor': {
    fillers: ['Oh!', 'So...', 'Like...', 'You know...'],
    hedges: ['I think', 'Probably', 'Maybe', 'I feel like'],
    repairs: ['Wait, no—even better:', 'Actually, you know what?', 'Oh! Let me rephrase that—'],
    thinkingPhrases: [
      'Ooh, let me think...',
      'You know what would be amazing?',
      'Oh! I just thought of something!',
    ],
  },
};

// Default patterns for unknown personas
const DEFAULT_DISFLUENCIES = {
  fillers: ['Um...', 'Uh...', 'Well...', 'So...'],
  hedges: ['I think', 'Maybe', 'Probably', 'It seems like'],
  repairs: [
    'Actually, let me rephrase.',
    'Wait—let me think about this.',
    "No, here's what I mean:",
  ],
  thinkingPhrases: ['Hmm...', 'Let me think...', "That's interesting..."],
};

// ============================================================================
// SPEECH NATURALIZER
// ============================================================================

export class SpeechNaturalizer {
  private config: DisfluencyConfig;
  private recentDisfluencies: string[] = [];
  private lastRepairTurn = -10;

  constructor(config?: Partial<DisfluencyConfig>) {
    this.config = {
      enabled: true,
      frequency: 0.15,
      personaStyle: 'natural',
      contextSensitivity: true,
      ...config,
    };
  }

  /**
   * Add natural disfluencies to a response
   */
  naturalize(text: string, personaId: string, context: NaturalizationContext = {}): string {
    if (!this.config.enabled) return text;

    const patterns = PERSONA_DISFLUENCIES[personaId] || DEFAULT_DISFLUENCIES;
    let result = text;

    // Adjust frequency based on context
    let effectiveFrequency = this.config.frequency;
    if (this.config.contextSensitivity) {
      if (context.isSeriousContext) {
        effectiveFrequency *= 0.3; // Much fewer in serious contexts
      }
      if (context.emotion === 'distressed' || context.emotion === 'anxious') {
        effectiveFrequency *= 0.5; // Fewer when user is distressed
      }
      if (context.turnNumber && context.turnNumber < 3) {
        effectiveFrequency *= 0.5; // Fewer in early turns
      }
    }

    // Decide what to add
    const roll = Math.random();

    if (roll < effectiveFrequency * 0.4) {
      // Add opening filler
      result = this.addOpeningFiller(result, patterns);
    } else if (roll < effectiveFrequency * 0.7) {
      // Add mid-sentence hedge
      result = this.addHedge(result, patterns);
    } else if (roll < effectiveFrequency) {
      // Add thinking phrase
      result = this.addThinkingPhrase(result, patterns, context);
    }

    return result;
  }

  /**
   * Generate a self-correction/repair
   */
  generateRepair(originalStatement: string, correctedStatement: string, personaId: string): string {
    const patterns = PERSONA_DISFLUENCIES[personaId] || DEFAULT_DISFLUENCIES;
    const repair = patterns.repairs[Math.floor(Math.random() * patterns.repairs.length)];

    return `${originalStatement}<break time="200ms"/> ${repair} ${correctedStatement}`;
  }

  /**
   * Get a thinking-out-loud phrase
   */
  getThinkingPhrase(
    personaId: string,
    type: ThinkingPattern['type'] = 'processing'
  ): ThinkingPattern {
    const patterns = PERSONA_DISFLUENCIES[personaId] || DEFAULT_DISFLUENCIES;

    const typeSpecific: Record<ThinkingPattern['type'], string[]> = {
      processing: ['Let me think about that...', 'Hmm...', "That's an interesting point..."],
      recalling: ['You know, that reminds me...', 'Now that you mention it...', 'I remember...'],
      considering: [
        'Let me consider this...',
        'There are a few ways to look at this...',
        'On one hand...',
      ],
      uncertain: [
        "I'm not entirely sure, but...",
        'This is tricky...',
        'I want to be careful here...',
      ],
    };

    // Mix persona-specific and type-specific
    const candidates = [...patterns.thinkingPhrases, ...typeSpecific[type]];
    const phrase = candidates[Math.floor(Math.random() * candidates.length)];

    return {
      type,
      phrase,
      ssml: `<break time="200ms"/>${phrase}<break time="300ms"/>`,
    };
  }

  /**
   * Generate a hedge appropriate to the statement
   */
  getHedge(personaId: string, strength: 'soft' | 'medium' | 'strong' = 'medium'): string {
    const patterns = PERSONA_DISFLUENCIES[personaId] || DEFAULT_DISFLUENCIES;

    const hedgesByStrength = {
      soft: ['I think', 'Maybe', 'Perhaps'],
      medium: ['It seems like', 'In my view', 'Generally'],
      strong: ["I'm not certain, but", 'If I had to guess,', 'This could be wrong, but'],
    };

    const personalHedge = patterns.hedges[Math.floor(Math.random() * patterns.hedges.length)];
    const strengthHedge =
      hedgesByStrength[strength][Math.floor(Math.random() * hedgesByStrength[strength].length)];

    // Randomly pick between personal and strength-based
    return Math.random() < 0.6 ? personalHedge : strengthHedge;
  }

  /**
   * Wrap text with uncertainty markers
   */
  addUncertainty(text: string, personaId: string, level: 'low' | 'medium' | 'high'): string {
    const hedge = this.getHedge(
      personaId,
      level === 'high' ? 'strong' : level === 'medium' ? 'medium' : 'soft'
    );

    // Determine where to add hedge
    if (level === 'high') {
      return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    // For lower levels, sometimes add at start, sometimes embed
    if (Math.random() < 0.5) {
      return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    // Try to embed after first clause
    const firstComma = text.indexOf(',');
    if (firstComma > 10 && firstComma < text.length / 2) {
      return `${text.slice(0, firstComma + 1)} ${hedge.toLowerCase()},${text.slice(firstComma + 1)}`;
    }

    return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private addOpeningFiller(text: string, patterns: typeof DEFAULT_DISFLUENCIES): string {
    // Avoid repeating recent fillers
    const available = patterns.fillers.filter((f) => !this.recentDisfluencies.includes(f));
    if (available.length === 0) {
      this.recentDisfluencies = [];
      return text;
    }

    const filler = available[Math.floor(Math.random() * available.length)];
    this.recentDisfluencies.push(filler);
    if (this.recentDisfluencies.length > 5) {
      this.recentDisfluencies.shift();
    }

    return `${filler} ${text}`;
  }

  private addHedge(text: string, patterns: typeof DEFAULT_DISFLUENCIES): string {
    const hedge = patterns.hedges[Math.floor(Math.random() * patterns.hedges.length)];

    // Find a good place to insert
    // Look for "I" or "You" or statement starters
    const insertPoints = [
      { pattern: /^I (think|believe|feel|know)/i, replace: false },
      { pattern: /^(The |It |This |That )/i, replace: true },
      { pattern: /^(You should|You could|You might)/i, replace: true },
    ];

    for (const point of insertPoints) {
      if (point.pattern.test(text)) {
        if (point.replace) {
          return text.replace(
            point.pattern,
            `${hedge}, ${text.match(point.pattern)?.[0].toLowerCase() || ''}`
          );
        }
        return text; // Already has a hedge-like pattern
      }
    }

    // Default: prepend
    return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  private addThinkingPhrase(
    text: string,
    patterns: typeof DEFAULT_DISFLUENCIES,
    context: NaturalizationContext
  ): string {
    const thinkingPhrase =
      patterns.thinkingPhrases[Math.floor(Math.random() * patterns.thinkingPhrases.length)];

    // Add SSML breaks for natural pacing
    return `<break time="100ms"/>${thinkingPhrase}<break time="200ms"/> ${text}`;
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.recentDisfluencies = [];
    this.lastRepairTurn = -10;
  }
}

// ============================================================================
// SENTENCE FRAGMENT GENERATOR
// ============================================================================

/**
 * Generate natural sentence fragments
 * Real speech often includes incomplete thoughts that trail off
 */
export function generateFragment(context: 'trailing' | 'interrupted' | 'rethinking'): string {
  const fragments = {
    trailing: [
      "It's just that...",
      'The thing is...',
      'What I mean is...',
      'You know how...',
      'Sometimes I wonder if...',
    ],
    interrupted: ['Wait—', 'Oh, hold on—', 'Actually—', 'No, wait—', 'Hmm—'],
    rethinking: [
      'Well, actually...',
      'On second thought...',
      'Then again...',
      'But then...',
      'Although...',
    ],
  };

  const options = fragments[context];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// 🎭 ENHANCED IMPERFECTION THEATRE
// These patterns create authentic human-like thinking processes
// ============================================================================

/**
 * Mid-thought course correction patterns
 * "Actually, scratch that—what I really mean is..."
 */
export const MID_THOUGHT_CORRECTIONS: string[] = [
  'Actually, scratch that—what I really mean is',
  "Wait, no, that's not quite right—let me try again:",
  "Hmm, that didn't come out right. What I'm trying to say is",
  "Actually—no, forget that. Here's what I actually think:",
  "Let me back up. That's not what I meant. I meant",
  "No, wait. That's not it. It's more like",
  'Okay, that sounded better in my head. Let me rephrase:',
];

/**
 * Self-doubt to conviction transitions
 * "I'm not sure if—no, actually, I am sure"
 */
export const DOUBT_TO_CONVICTION: Array<{ doubt: string; conviction: string }> = [
  {
    doubt: "I'm not sure if this is right, but—",
    conviction: 'actually, no, I am sure:',
  },
  {
    doubt: 'This might be wrong, but I think—',
    conviction: "wait, no, I'm confident about this:",
  },
  {
    doubt: "I don't know if I should say this, but—",
    conviction: 'you know what, yes, I should:',
  },
  {
    doubt: "Maybe this doesn't make sense, but—",
    conviction: 'actually, it makes total sense:',
  },
  {
    doubt: 'I could be way off here, but—',
    conviction: "no, wait, I think I'm onto something:",
  },
];

/**
 * Thinking out loud patterns
 * These show the visible process of arriving at a thought
 */
export const THINKING_OUT_LOUD: string[] = [
  'Let me think about this out loud for a second...',
  'Okay, so if I follow this through...',
  'Walking through this in my head...',
  'So the thing I keep coming back to is...',
  "I'm just going to say what I'm thinking here...",
  'Let me work through this with you...',
  "Okay, so I'm hearing... and that makes me wonder...",
  "I'm thinking... no, wait... okay, yes:",
];

/**
 * Graceful uncertainty expressions
 * "I might be wrong about this, but..."
 */
export const GRACEFUL_UNCERTAINTY: string[] = [
  'I might be wrong about this, but',
  'I could be totally off base, but',
  'This is just my read on it, but',
  "I don't have the full picture, but from what I can see,",
  'Take this with a grain of salt, but',
  "I'm no expert, but it seems to me that",
  'I could be missing something, but',
  "Based on what you've shared—and I could be wrong—",
];

/**
 * Self-interruption patterns
 * When we catch ourselves mid-sentence
 */
export const SELF_INTERRUPTIONS: Array<{ start: string; interrupt: string; resume: string }> = [
  {
    start: "So what you're saying is—",
    interrupt: 'wait, let me make sure I understand—',
    resume: 'okay, so',
  },
  {
    start: 'The thing is—',
    interrupt: 'actually, hold on—',
    resume: 'the REAL thing is',
  },
  {
    start: 'I think—',
    interrupt: "no, 'think' is too weak—",
    resume: 'I feel pretty strongly that',
  },
  {
    start: 'You should—',
    interrupt: "wait, I don't want to tell you what to do—",
    resume: 'what if you tried',
  },
];

/**
 * Generate a mid-thought course correction
 */
export function generateCourseCorrection(
  originalThought: string,
  correctedThought: string
): string {
  const correction =
    MID_THOUGHT_CORRECTIONS[Math.floor(Math.random() * MID_THOUGHT_CORRECTIONS.length)];
  return `${originalThought}<break time="300ms"/> ${correction} ${correctedThought}`;
}

/**
 * Generate a doubt-to-conviction transition
 */
export function generateDoubtToConviction(statement: string): string {
  const pattern = DOUBT_TO_CONVICTION[Math.floor(Math.random() * DOUBT_TO_CONVICTION.length)];
  return `${pattern.doubt}<break time="200ms"/> ${pattern.conviction} ${statement}`;
}

/**
 * Generate a thinking-out-loud prefix
 */
export function generateThinkingOutLoud(): string {
  const phrase = THINKING_OUT_LOUD[Math.floor(Math.random() * THINKING_OUT_LOUD.length)];
  return `<break time="150ms"/>${phrase}<break time="300ms"/>`;
}

/**
 * Generate a graceful uncertainty prefix
 */
export function generateGracefulUncertainty(statement: string): string {
  const uncertainty = GRACEFUL_UNCERTAINTY[Math.floor(Math.random() * GRACEFUL_UNCERTAINTY.length)];
  return `${uncertainty} ${statement.charAt(0).toLowerCase()}${statement.slice(1)}`;
}

/**
 * Generate a self-interruption
 */
export function generateSelfInterruption(statement: string): string {
  const pattern = SELF_INTERRUPTIONS[Math.floor(Math.random() * SELF_INTERRUPTIONS.length)];
  return `${pattern.start}<break time="200ms"/> ${pattern.interrupt}<break time="300ms"/> ${pattern.resume} ${statement}`;
}

/**
 * Determine if imperfection should be applied
 * Based on context - don't use during serious/emotional moments
 */
export function shouldApplyImperfection(context: {
  isSeriousContext?: boolean;
  emotion?: string;
  turnNumber?: number;
}): boolean {
  // Don't add imperfections in serious contexts
  if (context.isSeriousContext) return false;

  // Don't add when user is distressed
  if (
    context.emotion === 'sad' ||
    context.emotion === 'anxious' ||
    context.emotion === 'vulnerable'
  ) {
    return false;
  }

  // More likely in later turns when rapport is built
  const turnModifier = Math.min(1, (context.turnNumber || 5) / 5);

  return Math.random() < 0.15 * turnModifier;
}

/**
 * Apply random imperfection to response
 */
export function applyRandomImperfection(
  text: string,
  context: {
    isSeriousContext?: boolean;
    emotion?: string;
    turnNumber?: number;
  }
): string {
  if (!shouldApplyImperfection(context)) return text;

  const roll = Math.random();

  if (roll < 0.25) {
    // Thinking out loud
    return `${generateThinkingOutLoud()}${text}`;
  } else if (roll < 0.45) {
    // Graceful uncertainty
    return generateGracefulUncertainty(text);
  } else if (roll < 0.65) {
    // Self-doubt to conviction (for advice/suggestions)
    if (
      text.toLowerCase().includes('think') ||
      text.toLowerCase().includes('should') ||
      text.toLowerCase().includes('try')
    ) {
      return generateDoubtToConviction(text);
    }
  } else if (roll < 0.85) {
    // Sentence fragment
    const fragment = generateFragment('trailing');
    return `${fragment}<break time="200ms"/> ${text}`;
  }

  // No imperfection applied
  return text;
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let naturalizer: SpeechNaturalizer | null = null;

export function getSpeechNaturalizer(): SpeechNaturalizer {
  if (!naturalizer) {
    naturalizer = new SpeechNaturalizer();
  }
  return naturalizer;
}

export function resetSpeechNaturalizer(): void {
  if (naturalizer) {
    naturalizer.reset();
  }
  naturalizer = null;
}

export default SpeechNaturalizer;
