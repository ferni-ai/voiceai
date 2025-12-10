/**
 * Hedging Language Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects hedging language patterns that reveal uncertainty, self-protection,
 * or minimization. When someone says "kind of", "maybe", "I guess", they're
 * often protecting themselves from vulnerability or expressing doubt.
 *
 * Real humans pick up on these signals and can gently probe:
 * "You said 'probably nothing' — but is it?"
 *
 * @module HedgingDetection
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'HedgingDetection' });

// ============================================================================
// TYPES
// ============================================================================

export type HedgingCategory =
  | 'uncertainty' // "maybe", "I think", "I guess"
  | 'minimizing' // "just", "only", "a little"
  | 'distancing' // "they said", "supposedly"
  | 'protecting' // "I don't know", "it's probably nothing"
  | 'qualifying' // "kind of", "sort of"
  | 'softening'; // "might", "could", "possibly"

export interface HedgingInstance {
  /** The hedging phrase detected */
  phrase: string;
  /** Category of hedging */
  category: HedgingCategory;
  /** Position in text */
  position: number;
  /** Surrounding context */
  context: string;
  /** What it might indicate */
  indicates: string;
}

export interface HedgingAnalysisResult {
  /** Total hedging instances */
  totalHedges: number;

  /** Hedges per 100 words */
  hedgingDensity: number;

  /** Is this significantly more hedging than normal? */
  elevated: boolean;

  /** Breakdown by category */
  byCategory: Record<HedgingCategory, number>;

  /** Dominant hedging style */
  dominantCategory: HedgingCategory | null;

  /** Specific instances */
  instances: HedgingInstance[];

  /** Overall interpretation */
  interpretation: string;

  /** Should agent gently probe? */
  shouldProbe: boolean;

  /** If probing, suggested approach */
  probeApproach?: string;

  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// HEDGING PATTERNS
// ============================================================================

const HEDGING_PATTERNS: Record<HedgingCategory, Array<{ pattern: RegExp; indicates: string }>> = {
  uncertainty: [
    { pattern: /\b(maybe)\b/gi, indicates: 'Uncertainty about facts or decisions' },
    { pattern: /\b(I think)\b/gi, indicates: 'Presenting opinion as tentative' },
    { pattern: /\b(I guess)\b/gi, indicates: 'Reluctant or uncertain agreement' },
    { pattern: /\b(possibly)\b/gi, indicates: 'Acknowledging alternatives' },
    { pattern: /\b(perhaps)\b/gi, indicates: 'Gentle uncertainty' },
    { pattern: /\b(I suppose)\b/gi, indicates: 'Reluctant agreement or uncertainty' },
    { pattern: /\b(I believe)\b/gi, indicates: 'Presenting belief as uncertain' },
    { pattern: /\b(probably)\b/gi, indicates: 'Hedged prediction' },
    { pattern: /\b(I'm not sure)\b/gi, indicates: 'Explicit uncertainty' },
    { pattern: /\b(I don't know)\b/gi, indicates: 'Claiming ignorance (may be protective)' },
  ],

  minimizing: [
    { pattern: /\b(just)\b(?!\s+(?:now|then|so))/gi, indicates: 'Downplaying importance' },
    { pattern: /\b(only)\b/gi, indicates: 'Minimizing scope or impact' },
    { pattern: /\b(a little)\b/gi, indicates: 'Understating degree' },
    { pattern: /\b(a bit)\b/gi, indicates: 'Understating degree' },
    { pattern: /\b(slightly)\b/gi, indicates: 'Minimizing' },
    { pattern: /\b(not that)\s+(big|bad|important|serious)/gi, indicates: 'Active minimization' },
    { pattern: /\b(no big deal)\b/gi, indicates: 'Dismissing significance' },
    { pattern: /\b(it's fine|i'm fine)\b/gi, indicates: 'Possibly masking true feelings' },
    { pattern: /\b(whatever)\b/gi, indicates: 'Dismissive minimization' },
  ],

  distancing: [
    { pattern: /\b(they said|he said|she said)\b/gi, indicates: 'Attributing to others' },
    { pattern: /\b(supposedly)\b/gi, indicates: 'Distancing from claim' },
    { pattern: /\b(apparently)\b/gi, indicates: 'Not taking ownership' },
    { pattern: /\b(someone told me)\b/gi, indicates: 'Third-party attribution' },
    { pattern: /\b(I heard)\b/gi, indicates: 'Indirect knowledge claim' },
    { pattern: /\b(people say)\b/gi, indicates: 'Vague attribution' },
    { pattern: /\b(it seems)\b/gi, indicates: 'Observational distancing' },
    { pattern: /\b(from what I understand)\b/gi, indicates: 'Hedged understanding' },
  ],

  protecting: [
    { pattern: /\b(it's probably nothing)\b/gi, indicates: 'Pre-emptive self-dismissal' },
    { pattern: /\b(I shouldn't complain)\b/gi, indicates: 'Self-silencing' },
    { pattern: /\b(it doesn't matter)\b/gi, indicates: 'Dismissing own needs' },
    { pattern: /\b(forget I said)\b/gi, indicates: 'Retracting vulnerability' },
    { pattern: /\b(never mind)\b/gi, indicates: 'Withdrawing' },
    { pattern: /\b(it's stupid|it's dumb)\b/gi, indicates: 'Pre-emptive self-criticism' },
    { pattern: /\b(you'll think I'm)\b/gi, indicates: 'Fear of judgment' },
    { pattern: /\b(this is silly but)\b/gi, indicates: 'Apologizing for feelings' },
    { pattern: /\b(I know it's not a big deal)\b/gi, indicates: 'Minimizing own experience' },
  ],

  qualifying: [
    { pattern: /\b(kind of|kinda)\b/gi, indicates: 'Softening assertion' },
    { pattern: /\b(sort of|sorta)\b/gi, indicates: 'Approximating' },
    { pattern: /\b(more or less)\b/gi, indicates: 'Imprecise qualification' },
    { pattern: /\b(in a way)\b/gi, indicates: 'Partial truth' },
    { pattern: /\b(to some extent)\b/gi, indicates: 'Limited commitment' },
    { pattern: /\b(somewhat)\b/gi, indicates: 'Degree softening' },
    { pattern: /\b(fairly)\b/gi, indicates: 'Moderate qualification' },
    { pattern: /\b(rather)\b/gi, indicates: 'Softening intensity' },
  ],

  softening: [
    { pattern: /\b(might)\b/gi, indicates: 'Possibility rather than certainty' },
    { pattern: /\b(could)\b/gi, indicates: 'Potential rather than actual' },
    { pattern: /\b(would)\b/gi, indicates: 'Conditional framing' },
    { pattern: /\b(may)\b/gi, indicates: 'Permission or possibility' },
    { pattern: /\b(can)\b(?!\s+(?:I|you|we))/gi, indicates: 'Ability hedging' },
    { pattern: /\b(tend to)\b/gi, indicates: 'Habitual softening' },
    { pattern: /\b(seems like)\b/gi, indicates: 'Appearance not certainty' },
  ],
};

// Probe suggestions based on hedging patterns
const PROBE_SUGGESTIONS: Record<HedgingCategory, string[]> = {
  uncertainty: [
    "You said 'maybe' — what would help you feel more certain?",
    "I hear some uncertainty. What's making this unclear?",
    'What would need to be true for you to feel confident about this?',
  ],
  minimizing: [
    "You said it's 'just' something — but I want to hear more about it.",
    "You're downplaying this, but it seems like it matters to you.",
    'You said it\'s "not a big deal" — but is it?',
  ],
  distancing: [
    'What do *you* think about that, not what others say?',
    "I'm curious what your own take is on this.",
    'Setting aside what others think — how does this land for you?',
  ],
  protecting: [
    "It's not stupid at all. Tell me more.",
    "There's no need to apologize for how you feel. What's really going on?",
    "You said 'never mind' — but I'd like to hear it if you want to share.",
  ],
  qualifying: [
    "You said 'kind of' — can you be more specific about what you mean?",
    "I'm picking up on some hedging. What's underneath that?",
    'Help me understand what you mean more precisely.',
  ],
  softening: [
    "You're using a lot of conditional language. What would make this more definite?",
    "I notice you said 'might' — what's holding you back from being more direct?",
    "What's the bolder version of what you're trying to say?",
  ],
};

// ============================================================================
// HEDGING DETECTOR
// ============================================================================

export class HedgingDetector {
  private history: HedgingAnalysisResult[] = [];
  private readonly maxHistory = 15;

  constructor() {
    log.debug('HedgingDetector initialized');
  }

  /**
   * Analyze text for hedging patterns
   */
  analyze(text: string): HedgingAnalysisResult {
    const instances: HedgingInstance[] = [];
    const byCategory: Record<HedgingCategory, number> = {
      uncertainty: 0,
      minimizing: 0,
      distancing: 0,
      protecting: 0,
      qualifying: 0,
      softening: 0,
    };

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Scan for each category
    for (const [category, patterns] of Object.entries(HEDGING_PATTERNS) as Array<
      [HedgingCategory, Array<{ pattern: RegExp; indicates: string }>]
    >) {
      for (const { pattern, indicates } of patterns) {
        let match: RegExpExecArray | null;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(text)) !== null) {
          byCategory[category]++;
          instances.push({
            phrase: match[0],
            category,
            position: match.index || 0,
            context: this.getContext(text, match.index || 0),
            indicates,
          });
        }
      }
    }

    // Calculate totals
    const totalHedges = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const hedgingDensity = wordCount > 0 ? (totalHedges / wordCount) * 100 : 0;

    // Normal conversation has ~3-5 hedges per 100 words
    const elevated = hedgingDensity > 8;

    // Find dominant category
    let dominantCategory: HedgingCategory | null = null;
    let maxCount = 0;
    (Object.entries(byCategory) as Array<[HedgingCategory, number]>).forEach(([cat, count]) => {
      if (count > maxCount && count > 0) {
        maxCount = count;
        dominantCategory = cat;
      }
    });

    // Generate interpretation
    const interpretation = this.generateInterpretation(byCategory, elevated, dominantCategory);

    // Determine if we should probe
    const shouldProbe =
      elevated || (dominantCategory === 'protecting' && byCategory.protecting >= 1);

    // Generate probe approach if needed
    let probeApproach: string | undefined;
    if (shouldProbe && dominantCategory !== null) {
      const category: HedgingCategory = dominantCategory;
      const suggestions: string[] = PROBE_SUGGESTIONS[category];
      // Find a suggestion that matches something in the text
      const relevantInstance = instances.find((i) => i.category === category);
      if (relevantInstance && suggestions.length > 0) {
        probeApproach = suggestions[Math.floor(Math.random() * suggestions.length)];
      }
    }

    // Confidence based on word count
    const confidence = Math.min(1, wordCount / 15);

    const result: HedgingAnalysisResult = {
      totalHedges,
      hedgingDensity,
      elevated,
      byCategory,
      dominantCategory,
      instances,
      interpretation,
      shouldProbe,
      probeApproach,
      confidence,
    };

    // Store in history
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (elevated || shouldProbe) {
      log.debug(
        {
          density: hedgingDensity.toFixed(1),
          dominant: dominantCategory,
          shouldProbe,
        },
        '🛡️ Hedging detected'
      );
    }

    return result;
  }

  /**
   * Get hedging trend across recent messages
   */
  getTrend(): {
    trend: 'increasing' | 'decreasing' | 'stable';
    avgDensity: number;
    consistentCategory: HedgingCategory | null;
  } {
    if (this.history.length < 3) {
      return { trend: 'stable', avgDensity: 0, consistentCategory: null };
    }

    const recent = this.history.slice(-5);
    const densities = recent.map((r) => r.hedgingDensity);
    const avgDensity = densities.reduce((a, b) => a + b, 0) / densities.length;

    // Trend
    const firstHalf = densities.slice(0, Math.floor(densities.length / 2));
    const secondHalf = densities.slice(Math.floor(densities.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (secondAvg > firstAvg + 2) {
      trend = 'increasing';
    } else if (secondAvg < firstAvg - 2) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    // Consistent category
    const categoryCounts = new Map<HedgingCategory, number>();
    for (const r of recent) {
      if (r.dominantCategory) {
        categoryCounts.set(r.dominantCategory, (categoryCounts.get(r.dominantCategory) || 0) + 1);
      }
    }
    let consistentCategory: HedgingCategory | null = null;
    const threshold = Math.ceil(recent.length / 2);
    categoryCounts.forEach((count, cat) => {
      if (count >= threshold && consistentCategory === null) {
        consistentCategory = cat;
      }
    });

    return { trend, avgDensity, consistentCategory };
  }

  /**
   * Build context for LLM prompt
   */
  buildContextForPrompt(): string | null {
    const trend = this.getTrend();
    if (!this.history.length || trend.avgDensity < 5) {
      return null;
    }

    const recent = this.history[this.history.length - 1];
    const lines: string[] = [];

    if (recent.elevated) {
      lines.push('[HEDGING DETECTED] User is using significant hedging language.');
    }

    if (recent.dominantCategory) {
      const categoryDescriptions: Record<HedgingCategory, string> = {
        uncertainty: 'expressing uncertainty',
        minimizing: 'minimizing their feelings/experiences',
        distancing: 'distancing themselves from statements',
        protecting: 'protecting themselves from vulnerability',
        qualifying: 'heavily qualifying their statements',
        softening: 'softening their assertions',
      };
      lines.push(`Pattern: ${categoryDescriptions[recent.dominantCategory]}`);
    }

    if (recent.probeApproach) {
      lines.push(`Consider gently probing: "${recent.probeApproach}"`);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.history = [];
    log.debug('HedgingDetector reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private getContext(text: string, position: number, radius = 25): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.slice(start, end);
  }

  private generateInterpretation(
    byCategory: Record<HedgingCategory, number>,
    elevated: boolean,
    dominant: HedgingCategory | null
  ): string {
    if (!elevated && !dominant) {
      return 'Hedging within normal conversational range.';
    }

    const interpretations: Record<HedgingCategory, string> = {
      uncertainty:
        'User is expressing significant uncertainty. They may need help clarifying their thoughts or feelings.',
      minimizing:
        'User is consistently minimizing. They may be downplaying something important or protecting themselves.',
      distancing:
        'User is distancing from their statements. They may be uncertain or avoiding ownership of feelings.',
      protecting:
        'User is using protective language. They may be afraid of judgment or vulnerability.',
      qualifying:
        'User is heavily qualifying statements. They may be unsure or reluctant to commit to their position.',
      softening:
        'User is softening their language. They may be more certain than they sound but hesitant to be direct.',
    };

    if (dominant) {
      return interpretations[dominant];
    }

    if (elevated) {
      return 'User is using elevated hedging language across multiple categories, suggesting general uncertainty or self-protection.';
    }

    return 'Mixed hedging patterns detected.';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, HedgingDetector>();

export function getHedgingDetector(sessionId: string): HedgingDetector {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new HedgingDetector());
  }
  return instances.get(sessionId)!;
}

export function resetHedgingDetector(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

export function resetAllHedgingDetectors(): void {
  instances.clear();
}

export default HedgingDetector;
