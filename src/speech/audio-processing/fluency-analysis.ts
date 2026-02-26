/**
 * Speech Fluency Analysis
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Analyzes speech fluency patterns to understand the user's inner state.
 * Stammering, self-corrections, and repetitions reveal emotional blocks,
 * uncertainty, or difficulty finding words.
 *
 * Real humans notice when someone is struggling to express themselves.
 * This module gives Ferni that same awareness.
 *
 * @module FluencyAnalysis
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'FluencyAnalysis' });

// ============================================================================
// TYPES
// ============================================================================

export type DisfluencyType =
  | 'repetition' // "the the the"
  | 'prolongation' // "soooo"
  | 'block' // sudden stop mid-word (inferred from text patterns)
  | 'revision' // "he— she said"
  | 'interjection' // "um", "uh", "like"
  | 'restart' // "I was— I mean, I went—"
  | 'trailing'; // Sentence trails off "and then..."

export type FluencyPattern =
  | 'word_finding' // Searching for right word
  | 'emotional_block' // Emotion interfering with speech
  | 'rushing' // Speaking too fast, tripping over words
  | 'careful' // Speaking slowly, choosing words carefully
  | 'normal'; // Normal conversational fluency

export interface Disfluency {
  type: DisfluencyType;
  text: string;
  position: number; // Character position in text
  context: string; // Surrounding text
}

export interface DisfluencyCounts {
  repetitions: number;
  prolongations: number;
  blocks: number;
  revisions: number;
  interjections: number;
  restarts: number;
  trailing: number;
}

export interface FluencyAnalysisResult {
  /** Overall fluency score (0-1, higher = more fluent) */
  overallFluency: number;

  /** Breakdown of disfluency types */
  disfluencies: DisfluencyCounts;

  /** Total disfluencies detected */
  totalDisfluencies: number;

  /** Disfluencies per 100 words */
  disfluencyRate: number;

  /** Detected pattern */
  pattern: FluencyPattern;

  /** What this pattern might indicate */
  interpretation: string;

  /** Specific disfluencies found */
  instances: Disfluency[];

  /** Confidence in analysis (0-1) */
  confidence: number;

  /** Guidance for agent response */
  guidance: string;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Word repetitions: "the the", "I I I" */
const REPETITION_PATTERNS = [
  /\b(\w+)\s+\1\b/gi, // Simple word repetition
  /\b(\w+)\s+\1\s+\1\b/gi, // Triple repetition
  /\b(I)\s+(I)\s+(I)\b/gi, // Common "I I I" pattern
];

/** Prolongations: "sooo", "welllll", "ummm" */
const PROLONGATION_PATTERN = /\b(\w)\1{2,}\b/gi; // 3+ repeated letters

/** Revisions/corrections: "he— she", "I was— I mean" */
const REVISION_PATTERNS = [
  /\b(\w+)—\s*(\w+)\b/gi, // Word—word pattern
  /\b(\w+)\s*[-–—]\s*(?:no|wait|I mean|actually)\s*/gi, // Correction markers
  /\b(he|she|they|it)\s*[-–—]\s*(he|she|they|it)\b/gi, // Pronoun switches
];

/** Interjections */
const INTERJECTION_PATTERN = /\b(um|uh|er|ah|eh|hmm|hm|erm|uhh|umm)\b/gi;

/** Restarts: "I was— I went—", "The thing— What I mean—" */
const RESTART_PATTERNS = [
  /\b(I\s+\w+)—\s*I\s+/gi, // "I was— I"
  /\b(The\s+\w+)—\s*(The|What|It)\s+/gi, // Sentence restarts
  /\b(\w+\s+\w+)—\s*\1/gi, // Phrase repetition with break
];

/** Trailing off: "and then...", "so...", "but..." */
const TRAILING_PATTERNS = [
  /\.\.\.\s*$/,
  /\b(and|so|but|because|then)\s*\.{2,}\s*$/gi,
  /\b(and|so|but|because|then)\s*$/gi,
];

/** Filler words (subset of interjections, used for pattern detection) */
const FILLER_WORDS = ['like', 'you know', 'I mean', 'basically', 'literally', 'kind of', 'sort of'];

// ============================================================================
// FLUENCY ANALYZER
// ============================================================================

export class FluencyAnalyzer {
  private history: FluencyAnalysisResult[] = [];
  private readonly maxHistory = 15;

  constructor() {
    log.debug('FluencyAnalyzer initialized');
  }

  /**
   * Analyze text for fluency patterns
   */
  analyze(text: string): FluencyAnalysisResult {
    const instances: Disfluency[] = [];
    const counts: DisfluencyCounts = {
      repetitions: 0,
      prolongations: 0,
      blocks: 0,
      revisions: 0,
      interjections: 0,
      restarts: 0,
      trailing: 0,
    };

    // Count words for rate calculation
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Detect repetitions
    for (const pattern of REPETITION_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        counts.repetitions++;
        instances.push({
          type: 'repetition',
          text: match[0],
          position: match.index || 0,
          context: this.getContext(text, match.index || 0),
        });
      }
    }

    // Detect prolongations
    let prolongMatch: RegExpExecArray | null;
    const prolongRegex = new RegExp(PROLONGATION_PATTERN.source, PROLONGATION_PATTERN.flags);
    while ((prolongMatch = prolongRegex.exec(text)) !== null) {
      // Filter out intentional emphasis words
      if (
        !['yeah', 'nooo', 'wooo', 'yay'].some((w) => prolongMatch![0].toLowerCase().includes(w))
      ) {
        counts.prolongations++;
        instances.push({
          type: 'prolongation',
          text: prolongMatch[0],
          position: prolongMatch.index || 0,
          context: this.getContext(text, prolongMatch.index || 0),
        });
      }
    }

    // Detect revisions
    for (const pattern of REVISION_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        counts.revisions++;
        instances.push({
          type: 'revision',
          text: match[0],
          position: match.index || 0,
          context: this.getContext(text, match.index || 0),
        });
      }
    }

    // Detect interjections
    let interjectionMatch: RegExpExecArray | null;
    const interjectionRegex = new RegExp(INTERJECTION_PATTERN.source, INTERJECTION_PATTERN.flags);
    while ((interjectionMatch = interjectionRegex.exec(text)) !== null) {
      counts.interjections++;
      instances.push({
        type: 'interjection',
        text: interjectionMatch[0],
        position: interjectionMatch.index || 0,
        context: this.getContext(text, interjectionMatch.index || 0),
      });
    }

    // Detect restarts
    for (const pattern of RESTART_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        counts.restarts++;
        instances.push({
          type: 'restart',
          text: match[0],
          position: match.index || 0,
          context: this.getContext(text, match.index || 0),
        });
      }
    }

    // Detect trailing
    for (const pattern of TRAILING_PATTERNS) {
      if (pattern.test(text)) {
        counts.trailing++;
        const match = text.match(pattern);
        if (match) {
          instances.push({
            type: 'trailing',
            text: match[0],
            position: text.lastIndexOf(match[0]),
            context: text.slice(-50),
          });
        }
        break; // Only count once per utterance
      }
    }

    // Calculate totals
    const totalDisfluencies =
      counts.repetitions +
      counts.prolongations +
      counts.blocks +
      counts.revisions +
      counts.interjections +
      counts.restarts +
      counts.trailing;

    // Disfluency rate per 100 words
    const disfluencyRate = wordCount > 0 ? (totalDisfluencies / wordCount) * 100 : 0;

    // Overall fluency (inverse of disfluency rate, normalized)
    // Normal speech has ~2-4 disfluencies per 100 words
    const overallFluency = Math.max(0, Math.min(1, 1 - disfluencyRate / 15));

    // Determine pattern
    const pattern = this.determinePattern(counts, wordCount);

    // Generate interpretation
    const interpretation = this.generateInterpretation(pattern, counts);

    // Generate guidance
    const guidance = this.generateGuidance(pattern, overallFluency);

    // Confidence based on word count
    const confidence = Math.min(1, wordCount / 20);

    const result: FluencyAnalysisResult = {
      overallFluency,
      disfluencies: counts,
      totalDisfluencies,
      disfluencyRate,
      pattern,
      interpretation,
      instances,
      confidence,
      guidance,
    };

    // Store in history
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (pattern !== 'normal') {
      log.debug(
        { pattern, fluency: overallFluency.toFixed(2), disfluencyRate: disfluencyRate.toFixed(1) },
        '🗣️ Fluency pattern detected'
      );
    }

    return result;
  }

  /**
   * Get trend across recent utterances
   */
  getTrend(): {
    trend: 'improving' | 'declining' | 'stable';
    avgFluency: number;
    dominantPattern: FluencyPattern;
  } {
    if (this.history.length < 3) {
      return { trend: 'stable', avgFluency: 0.8, dominantPattern: 'normal' };
    }

    const recent = this.history.slice(-5);
    const avgFluency = recent.reduce((sum, r) => sum + r.overallFluency, 0) / recent.length;

    // Determine trend
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const firstAvg = firstHalf.reduce((sum, r) => sum + r.overallFluency, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.overallFluency, 0) / secondHalf.length;

    let trend: 'improving' | 'declining' | 'stable';
    if (secondAvg > firstAvg + 0.1) {
      trend = 'improving';
    } else if (secondAvg < firstAvg - 0.1) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    // Dominant pattern
    const patternCounts = new Map<FluencyPattern, number>();
    for (const r of recent) {
      patternCounts.set(r.pattern, (patternCounts.get(r.pattern) || 0) + 1);
    }
    let dominantPattern: FluencyPattern = 'normal';
    let maxCount = 0;
    patternCounts.forEach((count, pattern) => {
      if (count > maxCount) {
        maxCount = count;
        dominantPattern = pattern;
      }
    });

    return { trend, avgFluency, dominantPattern };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.history = [];
    log.debug('FluencyAnalyzer reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private getContext(text: string, position: number, radius = 20): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.slice(start, end);
  }

  private determinePattern(counts: DisfluencyCounts, wordCount: number): FluencyPattern {
    const rate = wordCount > 0 ? Object.values(counts).reduce((a, b) => a + b, 0) / wordCount : 0;

    // Very low disfluency = normal
    if (rate < 0.03) {
      return 'normal';
    }

    // High interjections + prolongations = word finding
    if (counts.interjections >= 2 && counts.prolongations >= 1) {
      return 'word_finding';
    }

    // High repetitions/restarts + revisions = emotional block
    if (counts.repetitions >= 2 || (counts.restarts >= 1 && counts.revisions >= 1)) {
      return 'emotional_block';
    }

    // High rate with many interjections = rushing
    if (rate > 0.1 && counts.interjections >= 3) {
      return 'rushing';
    }

    // Low rate with some prolongations = careful
    if (rate < 0.08 && counts.prolongations >= 1) {
      return 'careful';
    }

    // Many trailing instances = emotional block
    if (counts.trailing >= 2) {
      return 'emotional_block';
    }

    return 'normal';
  }

  private generateInterpretation(pattern: FluencyPattern, counts: DisfluencyCounts): string {
    switch (pattern) {
      case 'word_finding':
        return 'User is searching for the right words. They may be processing complex thoughts or emotions.';
      case 'emotional_block':
        return 'User is experiencing difficulty expressing themselves, possibly due to strong emotions or painful content.';
      case 'rushing':
        return 'User is speaking quickly and tripping over words. They may be anxious, excited, or trying to get everything out.';
      case 'careful':
        return 'User is choosing words carefully, possibly weighing what to share or how to phrase sensitive content.';
      case 'normal':
      default:
        return 'Speech fluency is within normal range.';
    }
  }

  private generateGuidance(pattern: FluencyPattern, fluency: number): string {
    switch (pattern) {
      case 'word_finding':
        return "Be patient. Don't rush to fill silences. You might gently offer: 'Take your time.'";
      case 'emotional_block':
        return 'Something difficult is being expressed. Provide space, validate the difficulty, avoid interrupting.';
      case 'rushing':
        return "User seems pressured. Stay calm, respond at moderate pace, you might say: 'No rush, I'm here.'";
      case 'careful':
        return "User is being deliberate. Respect the care they're taking. Mirror their thoughtful pace.";
      case 'normal':
      default:
        return 'Conversation can flow naturally.';
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

const fluencyAnalyzerRegistry = createSessionRegistry(
  (sessionId: string) => new FluencyAnalyzer(),
  { name: 'FluencyAnalyzer', cleanup: (analyzer) => analyzer.reset(), verbose: false }
);

registerGlobalRegistry(fluencyAnalyzerRegistry);

export function getFluencyAnalyzer(sessionId: string): FluencyAnalyzer {
  return fluencyAnalyzerRegistry.get(sessionId);
}

export function resetFluencyAnalyzer(sessionId: string): void {
  fluencyAnalyzerRegistry.reset(sessionId);
}

export function resetAllFluencyAnalyzers(): void {
  fluencyAnalyzerRegistry.resetAll();
}

export function getActiveFluencyAnalyzerCount(): number {
  return fluencyAnalyzerRegistry.getActiveCount();
}

export default FluencyAnalyzer;
