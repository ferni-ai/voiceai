/**
 * Verbal Self-Soothing Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects phrases people say to themselves, not to the listener:
 * - "It's okay" / "It's fine" / "I'm fine"
 * - "It doesn't matter" / "Whatever"
 * - "It'll be fine" / "I'll be okay"
 *
 * When detected, the user may be:
 * - Minimizing their real feelings
 * - Self-soothing through anxiety
 * - Convincing themselves of something
 * - Protecting themselves from vulnerability
 *
 * The agent should notice without directly challenging, creating
 * space for the user to share more if they want.
 *
 * @module SelfSoothingDetection
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'SelfSoothing' });

// ============================================================================
// TYPES
// ============================================================================

export type SelfSoothingCategory =
  | 'reassurance' // "It'll be fine", "I'll be okay"
  | 'minimizing' // "It doesn't matter", "It's nothing"
  | 'dismissive' // "Whatever", "Anyway"
  | 'normalizing' // "It's normal", "Everyone does"
  | 'deflecting' // "It's not a big deal"
  | 'convincing'; // "I'm sure it's fine"

export interface SelfSoothingInstance {
  /** The phrase detected */
  phrase: string;

  /** Category of self-soothing */
  category: SelfSoothingCategory;

  /** Position in text */
  position: number;

  /** Context around the phrase */
  context: string;

  /** Likely emotional state being managed */
  underlyingState: string;
}

export interface SelfSoothingResult {
  /** Was self-soothing detected? */
  detected: boolean;

  /** Instances found */
  instances: SelfSoothingInstance[];

  /** Dominant category */
  dominantCategory: SelfSoothingCategory | null;

  /** Likely underlying emotional state */
  underlyingEmotionalState: string;

  /** Is user possibly in distress? */
  possibleDistress: boolean;

  /** Interpretation */
  interpretation: string;

  /** Suggested approach (don't challenge directly) */
  suggestedApproach: string;

  /** Optional gentle probe question */
  probeQuestion?: string;

  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// SELF-SOOTHING PATTERNS
// ============================================================================

const SELF_SOOTHING_PATTERNS: Array<{
  pattern: RegExp;
  category: SelfSoothingCategory;
  underlyingState: string;
}> = [
  // Reassurance
  {
    pattern: /\b(it'll be fine|it will be fine)\b/gi,
    category: 'reassurance',
    underlyingState: 'anxiety about outcome',
  },
  {
    pattern: /\b(I'll be fine|I will be fine)\b/gi,
    category: 'reassurance',
    underlyingState: 'uncertainty or fear',
  },
  {
    pattern: /\b(it's gonna be okay|it's going to be okay)\b/gi,
    category: 'reassurance',
    underlyingState: 'worry',
  },
  {
    pattern: /\b(I'll be okay|I will be okay)\b/gi,
    category: 'reassurance',
    underlyingState: 'self-doubt',
  },
  {
    pattern: /\b(it's okay|that's okay)\b/gi,
    category: 'reassurance',
    underlyingState: 'discomfort',
  },
  { pattern: /\b(I'm okay|I'm alright)\b/gi, category: 'reassurance', underlyingState: 'masking' },
  { pattern: /\b(I'm fine)\b/gi, category: 'reassurance', underlyingState: 'possible distress' },
  {
    pattern: /\b(it's all good|all good)\b/gi,
    category: 'reassurance',
    underlyingState: 'minimizing concern',
  },

  // Minimizing
  {
    pattern: /\b(it doesn't matter|doesn't matter)\b/gi,
    category: 'minimizing',
    underlyingState: 'hurt or disappointment',
  },
  {
    pattern: /\b(it's nothing|it's not anything)\b/gi,
    category: 'minimizing',
    underlyingState: 'avoidance',
  },
  {
    pattern: /\b(it's not important)\b/gi,
    category: 'minimizing',
    underlyingState: 'feeling unheard',
  },
  {
    pattern: /\b(I don't care)\b/gi,
    category: 'minimizing',
    underlyingState: 'protective detachment',
  },
  { pattern: /\b(who cares)\b/gi, category: 'minimizing', underlyingState: 'hurt feelings' },

  // Dismissive
  {
    pattern: /\b(whatever)\b/gi,
    category: 'dismissive',
    underlyingState: 'frustration or resignation',
  },
  {
    pattern: /\b(anyway)\b(?:\s*[,\.]|\s*$)/gi,
    category: 'dismissive',
    underlyingState: 'moving past discomfort',
  },
  {
    pattern: /\b(forget it|forget I said)\b/gi,
    category: 'dismissive',
    underlyingState: 'regret sharing',
  },
  {
    pattern: /\b(never mind|nevermind)\b/gi,
    category: 'dismissive',
    underlyingState: 'withdrawing',
  },
  { pattern: /\b(it is what it is)\b/gi, category: 'dismissive', underlyingState: 'resignation' },

  // Normalizing
  {
    pattern: /\b(it's normal)\b/gi,
    category: 'normalizing',
    underlyingState: 'seeking validation',
  },
  {
    pattern: /\b(everyone does|everyone feels)\b/gi,
    category: 'normalizing',
    underlyingState: 'feeling alone',
  },
  {
    pattern: /\b(it happens|these things happen)\b/gi,
    category: 'normalizing',
    underlyingState: 'processing difficulty',
  },
  {
    pattern: /\b(that's life|such is life)\b/gi,
    category: 'normalizing',
    underlyingState: 'acceptance struggle',
  },
  {
    pattern: /\b(could be worse)\b/gi,
    category: 'normalizing',
    underlyingState: 'minimizing pain',
  },

  // Deflecting
  {
    pattern: /\b(it's not a big deal|no big deal)\b/gi,
    category: 'deflecting',
    underlyingState: 'protecting self',
  },
  {
    pattern: /\b(it's not that bad)\b/gi,
    category: 'deflecting',
    underlyingState: 'downplaying impact',
  },
  {
    pattern: /\b(I shouldn't complain)\b/gi,
    category: 'deflecting',
    underlyingState: 'self-silencing',
  },
  {
    pattern: /\b(I know it's silly|I know it's stupid)\b/gi,
    category: 'deflecting',
    underlyingState: 'fear of judgment',
  },
  {
    pattern: /\b(sorry for|sorry to)\s+(bother|burden|dump)/gi,
    category: 'deflecting',
    underlyingState: 'shame',
  },

  // Convincing (self-talk)
  { pattern: /\b(I'm sure it's fine)\b/gi, category: 'convincing', underlyingState: 'uncertainty' },
  { pattern: /\b(I'm sure it'll work out)\b/gi, category: 'convincing', underlyingState: 'worry' },
  {
    pattern: /\b(I'm probably overreacting)\b/gi,
    category: 'convincing',
    underlyingState: 'self-doubt',
  },
  {
    pattern: /\b(I'm being ridiculous)\b/gi,
    category: 'convincing',
    underlyingState: 'self-judgment',
  },
  {
    pattern: /\b(I just need to)\s+(calm|relax|breathe)/gi,
    category: 'convincing',
    underlyingState: 'anxiety',
  },
];

// Probe questions based on category
const PROBE_QUESTIONS: Record<SelfSoothingCategory, string[]> = {
  reassurance: [
    "You said it'll be fine... but how are you actually feeling about it?",
    "I hear you saying you're okay. And if you're not, that's okay too.",
    "What would it look like if it wasn't fine?",
  ],
  minimizing: [
    "You said it doesn't matter, but it seems like it might. What's there?",
    "Sometimes the things we say don't matter, actually do. Is that true here?",
    'I noticed you brushed past that. Would you like to go back to it?',
  ],
  dismissive: [
    'You moved on from that pretty quick. Is there more there?',
    "You said 'whatever' - is that frustration, or something else?",
    "You said to forget it, but I'm here if you want to share.",
  ],
  normalizing: [
    "Even if it's 'normal,' that doesn't mean it's not hard. Is it hard?",
    "Normalizing something doesn't mean you have to feel okay about it.",
    "Other people feeling this too doesn't make your experience less valid.",
  ],
  deflecting: [
    "You said it's not a big deal. But what if it is?",
    "You don't have to minimize this for me. What's really going on?",
    "I'm not bothered. What did you want to share?",
  ],
  convincing: [
    "You're trying to convince yourself. What does the unconvinced part of you think?",
    "What if you're not overreacting? What would that mean?",
    "You said you're being ridiculous. I don't think you are.",
  ],
};

// ============================================================================
// SELF-SOOTHING DETECTOR
// ============================================================================

export class SelfSoothingDetector {
  private history: SelfSoothingResult[] = [];
  private readonly maxHistory = 15;

  constructor() {
    log.debug('SelfSoothingDetector initialized');
  }

  /**
   * Detect self-soothing language in text
   */
  analyze(text: string): SelfSoothingResult {
    const instances = this.detectInstances(text);

    // Find dominant category
    const dominantCategory = this.findDominantCategory(instances);

    // Determine underlying emotional state
    const underlyingEmotionalState = this.determineUnderlyingState(instances, dominantCategory);

    // Check for possible distress
    const possibleDistress = this.checkDistress(instances);

    // Generate interpretation
    const interpretation = this.generateInterpretation(
      instances,
      dominantCategory,
      possibleDistress
    );

    // Generate suggested approach
    const suggestedApproach = this.generateApproach(dominantCategory, possibleDistress);

    // Generate probe question
    const probeQuestion = dominantCategory ? this.getProbeQuestion(dominantCategory) : undefined;

    // Confidence
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const confidence = Math.min(1, words.length / 10) * (instances.length > 0 ? 0.8 : 0.3);

    const result: SelfSoothingResult = {
      detected: instances.length > 0,
      instances,
      dominantCategory,
      underlyingEmotionalState,
      possibleDistress,
      interpretation,
      suggestedApproach,
      probeQuestion,
      confidence,
    };

    // Store in history
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (instances.length > 0) {
      log.debug(
        {
          category: dominantCategory,
          distress: possibleDistress,
          instances: instances.length,
        },
        '🤗 Self-soothing detected'
      );
    }

    return result;
  }

  /**
   * Get patterns across recent interactions
   */
  getPatterns(): {
    frequency: 'rare' | 'occasional' | 'frequent';
    dominantCategory: SelfSoothingCategory | null;
    concernLevel: 'low' | 'moderate' | 'high';
  } {
    const detectedCount = this.history.filter((r) => r.detected).length;
    const frequency: 'rare' | 'occasional' | 'frequent' =
      detectedCount < 2 ? 'rare' : detectedCount < 5 ? 'occasional' : 'frequent';

    // Find overall dominant category
    const categoryCounts = new Map<SelfSoothingCategory, number>();
    for (const r of this.history) {
      if (r.dominantCategory) {
        categoryCounts.set(r.dominantCategory, (categoryCounts.get(r.dominantCategory) || 0) + 1);
      }
    }

    let dominantCategory: SelfSoothingCategory | null = null;
    let maxCount = 0;
    categoryCounts.forEach((count, cat) => {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = cat;
      }
    });

    // Concern level
    const distressCount = this.history.filter((r) => r.possibleDistress).length;
    const concernLevel: 'low' | 'moderate' | 'high' =
      distressCount >= 3 ? 'high' : distressCount >= 1 ? 'moderate' : 'low';

    return { frequency, dominantCategory, concernLevel };
  }

  /**
   * Build context for LLM prompt
   */
  buildContextForPrompt(): string | null {
    if (this.history.length === 0) return null;

    const recent = this.history[this.history.length - 1];
    if (!recent.detected) return null;

    const patterns = this.getPatterns();

    const lines: string[] = [];
    lines.push(
      `[SELF-SOOTHING DETECTED] User is saying things like "${recent.instances[0]?.phrase}"`
    );
    lines.push(`This may indicate: ${recent.underlyingEmotionalState}`);

    if (recent.possibleDistress) {
      lines.push('⚠️ Possible distress - approach with extra care');
    }

    lines.push(`Approach: ${recent.suggestedApproach}`);

    if (recent.probeQuestion) {
      lines.push(`If appropriate, you might gently ask: "${recent.probeQuestion}"`);
    }

    if (patterns.frequency === 'frequent') {
      lines.push('Note: User has been doing this frequently - pattern of minimizing');
    }

    return lines.join('\n');
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.history = [];
    log.debug('SelfSoothingDetector reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private detectInstances(text: string): SelfSoothingInstance[] {
    const instances: SelfSoothingInstance[] = [];

    for (const patternDef of SELF_SOOTHING_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const position = match.index || 0;
        instances.push({
          phrase: match[0],
          category: patternDef.category,
          position,
          context: this.getContext(text, position),
          underlyingState: patternDef.underlyingState,
        });
      }
    }

    // Sort by position
    instances.sort((a, b) => a.position - b.position);

    // Deduplicate (same position, different patterns)
    const deduped: SelfSoothingInstance[] = [];
    for (const inst of instances) {
      if (!deduped.some((d) => Math.abs(d.position - inst.position) < 5)) {
        deduped.push(inst);
      }
    }

    return deduped;
  }

  private getContext(text: string, position: number, radius = 30): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.slice(start, end);
  }

  private findDominantCategory(instances: SelfSoothingInstance[]): SelfSoothingCategory | null {
    if (instances.length === 0) return null;

    const counts = new Map<SelfSoothingCategory, number>();
    for (const inst of instances) {
      counts.set(inst.category, (counts.get(inst.category) || 0) + 1);
    }

    let dominant: SelfSoothingCategory | null = null;
    let maxCount = 0;
    counts.forEach((count, cat) => {
      if (count > maxCount) {
        maxCount = count;
        dominant = cat;
      }
    });

    return dominant;
  }

  private determineUnderlyingState(
    instances: SelfSoothingInstance[],
    dominant: SelfSoothingCategory | null
  ): string {
    if (instances.length === 0) {
      return 'No self-soothing detected';
    }

    // If multiple instances, combine states
    if (instances.length >= 2) {
      const statesSet = new Set<string>();
      instances.forEach((i) => statesSet.add(i.underlyingState));
      const states = Array.from(statesSet);
      return states.slice(0, 2).join(' and possibly ');
    }

    return instances[0].underlyingState;
  }

  private checkDistress(instances: SelfSoothingInstance[]): boolean {
    // Multiple self-soothing phrases suggest distress
    if (instances.length >= 2) return true;

    // Certain phrases are stronger indicators
    const distressIndicators = [
      "I'm fine",
      "I'm okay",
      "it doesn't matter",
      'forget it',
      'never mind',
    ];
    return instances.some((i) =>
      distressIndicators.some((d) => i.phrase.toLowerCase().includes(d.toLowerCase()))
    );
  }

  private generateInterpretation(
    instances: SelfSoothingInstance[],
    dominant: SelfSoothingCategory | null,
    distress: boolean
  ): string {
    if (instances.length === 0) {
      return 'No self-soothing language detected.';
    }

    const categoryDescriptions: Record<SelfSoothingCategory, string> = {
      reassurance: 'User is reassuring themselves, possibly managing anxiety or uncertainty.',
      minimizing: 'User is minimizing something, possibly protecting themselves from feeling hurt.',
      dismissive:
        'User is being dismissive, possibly avoiding vulnerability or expressing frustration.',
      normalizing: 'User is trying to normalize their experience, possibly feeling alone in it.',
      deflecting: 'User is deflecting, possibly feeling unworthy of attention or support.',
      convincing: 'User is trying to convince themselves, suggesting internal conflict.',
    };

    let base = dominant ? categoryDescriptions[dominant] : 'User is using self-soothing language.';

    if (distress) {
      base += ' Multiple signals suggest they may be in some distress.';
    }

    return base;
  }

  private generateApproach(dominant: SelfSoothingCategory | null, distress: boolean): string {
    if (!dominant) {
      return 'Continue listening attentively.';
    }

    const approaches: Record<SelfSoothingCategory, string> = {
      reassurance:
        "Don't challenge their reassurance directly. Create space: 'How are you really feeling about this?'",
      minimizing:
        "Gently acknowledge what they're minimizing without pushing: 'That sounds like it might be meaningful.'",
      dismissive:
        "Don't chase what they dismissed, but leave the door open: 'I'm here if you want to come back to that.'",
      normalizing:
        "Validate their experience even if it's common: 'Even if others feel this, your experience matters.'",
      deflecting:
        "Don't accept the deflection but don't push: 'I don't see it as a big deal that you're sharing.'",
      convincing:
        "Notice the self-talk: 'You're working hard to convince yourself. What's the other voice saying?'",
    };

    let approach = approaches[dominant];

    if (distress) {
      approach += ' Be extra gentle - they may be close to something difficult.';
    }

    return approach;
  }

  private getProbeQuestion(category: SelfSoothingCategory): string {
    const questions = PROBE_QUESTIONS[category];
    return questions[Math.floor(Math.random() * questions.length)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

const selfSoothingRegistry = createSessionRegistry(
  (sessionId: string) => new SelfSoothingDetector(),
  { name: 'SelfSoothing', cleanup: (detector) => detector.reset(), verbose: false }
);

registerGlobalRegistry(selfSoothingRegistry);

export function getSelfSoothingDetector(sessionId: string): SelfSoothingDetector {
  return selfSoothingRegistry.get(sessionId);
}

export function resetSelfSoothingDetector(sessionId: string): void {
  selfSoothingRegistry.reset(sessionId);
}

export function resetAllSelfSoothingDetectors(): void {
  selfSoothingRegistry.resetAll();
}

export function getActiveSelfSoothingCount(): number {
  return selfSoothingRegistry.getActiveCount();
}

export default SelfSoothingDetector;
