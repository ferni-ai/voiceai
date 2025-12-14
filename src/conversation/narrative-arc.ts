/**
 * Narrative Arc Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects narrative structure in user's speech to understand:
 * - Is the user building to a point?
 * - Are they meandering or circling?
 * - Have they reached the core of what they're trying to say?
 * - Are they digressing or avoiding?
 *
 * This helps the agent know when to listen vs. when to gently guide,
 * and when to validate that a climax/core message has been reached.
 *
 * @module NarrativeArc
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'NarrativeArc' });

// ============================================================================
// TYPES
// ============================================================================

export type NarrativeStructure =
  | 'building_to_point' // Clear buildup toward a climax
  | 'meandering' // No clear direction, wandering
  | 'circular' // Keeps returning to same topic/concern
  | 'digressing' // Started somewhere but went off track
  | 'direct' // Making point clearly and efficiently
  | 'exploratory'; // Thinking out loud, discovery mode

export type InterventionType =
  | 'wait' // Let them continue
  | 'guide_back' // Gently redirect
  | 'validate_climax' // Acknowledge they've reached the point
  | 'explore_digression' // Digression might be important
  | 'reflect_back' // Mirror what they've said
  | 'check_in'; // Ask if there's more

export interface NarrativePoint {
  /** Position in conversation (turn number) */
  turn: number;
  /** Key content/topic at this point */
  content: string;
  /** Emotional weight at this point */
  emotionalWeight: number;
  /** Is this related to previous points? */
  connectedness: number;
}

export interface NarrativeArcResult {
  /** Detected narrative structure */
  structure: NarrativeStructure;

  /** Is climax approaching or reached? */
  climaxApproaching: boolean;

  /** Has user reached the core of what they want to say? */
  hasReachedCore: boolean;

  /** Key themes detected */
  themes: string[];

  /** Number of times main concern was referenced */
  mainConcernReferences: number;

  /** Suggested intervention */
  suggestedIntervention: InterventionType;

  /** Specific intervention guidance */
  interventionGuidance: string;

  /** Confidence (0-1) */
  confidence: number;
}

export interface NarrativeContext {
  /** Recent utterance */
  text: string;
  /** Turn number */
  turn: number;
  /** Detected emotion */
  emotion?: string;
  /** Emotional intensity */
  emotionalIntensity?: number;
}

// ============================================================================
// NARRATIVE PATTERNS
// ============================================================================

/** Phrases that indicate building toward something */
const BUILDUP_INDICATORS = [
  /\b(and then|and so|which led to|because of that|that's when)\b/gi,
  /\b(the thing is|the point is|what I'm trying to say|what I mean is)\b/gi,
  /\b(but here's the thing|the real issue|the bigger picture)\b/gi,
  /\b(leading up to|getting to|building to)\b/gi,
];

/** Phrases that indicate reaching a climax/point */
const CLIMAX_INDICATORS = [
  /\b(and that's when|that's why|so basically|the bottom line|ultimately)\b/gi,
  /\b(I realized|it hit me|I finally understood|I knew)\b/gi,
  /\b(the truth is|honestly|I have to admit|I need to tell you)\b/gi,
  /\b(the real reason|what I'm really saying|what I actually mean)\b/gi,
];

/** Phrases that indicate digression */
const DIGRESSION_INDICATORS = [
  /\b(anyway|but that's another story|I'm getting off track|where was I)\b/gi,
  /\b(speaking of|that reminds me|oh and also|by the way)\b/gi,
  /\b(sorry, tangent|I'm rambling|back to what I was saying)\b/gi,
];

/** Phrases that indicate circularity */
const CIRCULAR_INDICATORS = [
  /\b(like I said|as I mentioned|I keep coming back to|again)\b/gi,
  /\b(I know I said this but|I can't stop thinking about)\b/gi,
];

/** Phrases that suggest exploration/discovery */
const EXPLORATORY_INDICATORS = [
  /\b(I wonder|maybe it's|could it be|I'm not sure but)\b/gi,
  /\b(now that I think about it|I'm just realizing|huh)\b/gi,
  /\b(let me think|I haven't thought about|it's interesting)\b/gi,
];

// ============================================================================
// NARRATIVE ARC TRACKER
// ============================================================================

export class NarrativeArcTracker {
  private points: NarrativePoint[] = [];
  private themes = new Map<string, number>();
  private mainConcernWords: string[] = [];
  private turnCount = 0;
  private readonly maxPoints = 20;

  constructor() {
    log.debug('NarrativeArcTracker initialized');
  }

  /**
   * Analyze a new utterance in the narrative
   */
  analyzeUtterance(context: NarrativeContext): NarrativeArcResult {
    this.turnCount = context.turn;

    // Extract narrative point
    const point = this.extractPoint(context);
    this.points.push(point);

    // Keep bounded history
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    // Update themes
    this.updateThemes(context.text);

    // Detect structure
    const structure = this.detectStructure(context.text);

    // Detect climax approach
    const climaxApproaching = this.detectClimaxApproaching(context.text);

    // Detect if core has been reached
    const hasReachedCore = this.detectCoreReached(context);

    // Get main concern references
    const mainConcernReferences = this.countMainConcernReferences();

    // Determine intervention
    const { intervention, guidance } = this.determineIntervention(
      structure,
      climaxApproaching,
      hasReachedCore
    );

    // Confidence based on data
    const confidence = Math.min(1, this.points.length / 5);

    const result: NarrativeArcResult = {
      structure,
      climaxApproaching,
      hasReachedCore,
      themes: this.getTopThemes(3),
      mainConcernReferences,
      suggestedIntervention: intervention,
      interventionGuidance: guidance,
      confidence,
    };

    if (structure !== 'direct' || climaxApproaching || hasReachedCore) {
      log.debug(
        {
          structure,
          climaxApproaching,
          hasReachedCore,
          intervention,
        },
        '📖 Narrative arc analyzed'
      );
    }

    return result;
  }

  /**
   * Get narrative summary
   */
  getNarrativeSummary(): {
    totalTurns: number;
    dominantStructure: NarrativeStructure;
    topThemes: string[];
    emotionalArc: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  } {
    const structures = this.points.map((p) => this.inferStructureFromPoint(p));
    const structureCounts = new Map<NarrativeStructure, number>();
    for (const s of structures) {
      structureCounts.set(s, (structureCounts.get(s) || 0) + 1);
    }

    let dominantStructure: NarrativeStructure = 'direct';
    let maxCount = 0;
    structureCounts.forEach((count, s) => {
      if (count > maxCount) {
        maxCount = count;
        dominantStructure = s;
      }
    });

    // Emotional arc
    const weights = this.points.map((p) => p.emotionalWeight);
    let emotionalArc: 'increasing' | 'decreasing' | 'stable' | 'volatile' = 'stable';
    if (weights.length >= 3) {
      const firstHalf = weights.slice(0, Math.floor(weights.length / 2));
      const secondHalf = weights.slice(Math.floor(weights.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const variance =
        weights.reduce((sum, w) => sum + (w - (firstAvg + secondAvg) / 2) ** 2, 0) / weights.length;

      if (variance > 0.2) emotionalArc = 'volatile';
      else if (secondAvg > firstAvg + 0.15) emotionalArc = 'increasing';
      else if (secondAvg < firstAvg - 0.15) emotionalArc = 'decreasing';
    }

    return {
      totalTurns: this.turnCount,
      dominantStructure,
      topThemes: this.getTopThemes(3),
      emotionalArc,
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.points = [];
    this.themes.clear();
    this.mainConcernWords = [];
    this.turnCount = 0;
    log.debug('NarrativeArcTracker reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private extractPoint(context: NarrativeContext): NarrativePoint {
    // Calculate emotional weight
    const emotionalWeight = context.emotionalIntensity ?? 0.5;

    // Calculate connectedness to previous points
    let connectedness = 0;
    if (this.points.length > 0) {
      const prevContent = this.points[this.points.length - 1].content;
      const commonWords = this.getContentOverlap(prevContent, context.text);
      connectedness = Math.min(1, commonWords / 5);
    }

    return {
      turn: context.turn,
      content: context.text.slice(0, 100), // Store snippet
      emotionalWeight,
      connectedness,
    };
  }

  private updateThemes(text: string): void {
    // Extract potential theme words (nouns, key phrases)
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'this',
      'that',
      'these',
      'those',
      'and',
      'but',
      'or',
      'so',
      'just',
      'really',
      'very',
      'like',
      'know',
      'think',
      'want',
      'going',
      'get',
      'got',
    ]);

    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        this.themes.set(word, (this.themes.get(word) || 0) + 1);

        // Track main concern (first few mentions become tracked)
        if (this.mainConcernWords.length < 3 && !this.mainConcernWords.includes(word)) {
          const count = this.themes.get(word) || 0;
          if (count >= 2) {
            this.mainConcernWords.push(word);
          }
        }
      }
    }
  }

  private detectStructure(text: string): NarrativeStructure {
    // Check for explicit structural indicators
    let buildupScore = 0;
    let digressionScore = 0;
    let circularScore = 0;
    let exploratoryScore = 0;

    for (const pattern of BUILDUP_INDICATORS) {
      if (pattern.test(text)) buildupScore++;
    }
    for (const pattern of DIGRESSION_INDICATORS) {
      if (pattern.test(text)) digressionScore++;
    }
    for (const pattern of CIRCULAR_INDICATORS) {
      if (pattern.test(text)) circularScore++;
    }
    for (const pattern of EXPLORATORY_INDICATORS) {
      if (pattern.test(text)) exploratoryScore++;
    }

    // Check for theme repetition (circularity)
    if (this.mainConcernWords.length > 0) {
      const lower = text.toLowerCase();
      const mainRefs = this.mainConcernWords.filter((w) => lower.includes(w)).length;
      if (mainRefs >= 2) circularScore++;
    }

    // Check connectedness trend (meandering = low connectedness)
    if (this.points.length >= 3) {
      const recentConnectedness = this.points.slice(-3).map((p) => p.connectedness);
      const avgConnectedness =
        recentConnectedness.reduce((a, b) => a + b, 0) / recentConnectedness.length;
      if (avgConnectedness < 0.3) {
        // Low connectedness could be meandering or digressing
        if (digressionScore > 0) return 'digressing';
        return 'meandering';
      }
    }

    // Determine structure
    if (buildupScore >= 2) return 'building_to_point';
    if (circularScore >= 2) return 'circular';
    if (digressionScore >= 1) return 'digressing';
    if (exploratoryScore >= 2) return 'exploratory';

    return 'direct';
  }

  private detectClimaxApproaching(text: string): boolean {
    let climaxScore = 0;

    for (const pattern of CLIMAX_INDICATORS) {
      if (pattern.test(text)) climaxScore++;
    }

    // Emotional weight increasing + buildup language
    if (this.points.length >= 2) {
      const recent = this.points.slice(-2);
      if (recent[1].emotionalWeight > recent[0].emotionalWeight + 0.2) {
        climaxScore++;
      }
    }

    return climaxScore >= 1;
  }

  private detectCoreReached(context: NarrativeContext): boolean {
    const { text } = context;

    // Climax indicators present
    let climaxIndicators = 0;
    for (const pattern of CLIMAX_INDICATORS) {
      if (pattern.test(text)) climaxIndicators++;
    }

    // High emotional intensity with climax language
    if (climaxIndicators >= 1 && (context.emotionalIntensity ?? 0.5) > 0.6) {
      return true;
    }

    // Multiple main concern references in a short utterance
    if (this.mainConcernWords.length > 0) {
      const lower = text.toLowerCase();
      const refs = this.mainConcernWords.filter((w) => lower.includes(w)).length;
      if (refs >= 2 && climaxIndicators >= 1) {
        return true;
      }
    }

    // Resolution language
    const resolutionPatterns = [
      /\b(I've decided|I need to|I'm going to|I have to)\b/gi,
      /\b(that's it|that's all|so yeah|anyway)\b/gi,
    ];
    for (const pattern of resolutionPatterns) {
      if (pattern.test(text) && (context.emotionalIntensity ?? 0.5) > 0.5) {
        return true;
      }
    }

    return false;
  }

  private countMainConcernReferences(): number {
    if (this.mainConcernWords.length === 0) return 0;

    let count = 0;
    for (const point of this.points) {
      const lower = point.content.toLowerCase();
      for (const word of this.mainConcernWords) {
        if (lower.includes(word)) count++;
      }
    }
    return count;
  }

  private determineIntervention(
    structure: NarrativeStructure,
    climaxApproaching: boolean,
    hasReachedCore: boolean
  ): { intervention: InterventionType; guidance: string } {
    if (hasReachedCore) {
      return {
        intervention: 'validate_climax',
        guidance: "User has reached their point. Acknowledge and validate what they've shared.",
      };
    }

    if (climaxApproaching) {
      return {
        intervention: 'wait',
        guidance: 'User is building to something. Be patient and let them get there.',
      };
    }

    switch (structure) {
      case 'building_to_point':
        return {
          intervention: 'wait',
          guidance: 'User is building toward their point. Listen actively without interrupting.',
        };

      case 'circular':
        return {
          intervention: 'reflect_back',
          guidance:
            'User keeps returning to same concern. Reflect it back: "I notice you keep coming back to..."',
        };

      case 'meandering':
        return {
          intervention: 'check_in',
          guidance: 'Narrative is wandering. Gently check in: "What feels most important here?"',
        };

      case 'digressing':
        return {
          intervention: 'explore_digression',
          guidance:
            'User digressed - this might be avoidance or might be important. Briefly acknowledge, then: "Would you like to explore that, or come back to...?"',
        };

      case 'exploratory':
        return {
          intervention: 'wait',
          guidance: 'User is thinking out loud. Give them space to discover.',
        };

      case 'direct':
      default:
        return {
          intervention: 'wait',
          guidance: 'User is communicating clearly. Respond naturally.',
        };
    }
  }

  private getTopThemes(n: number): string[] {
    return Array.from(this.themes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([theme]) => theme);
  }

  private getContentOverlap(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    let overlap = 0;
    words1.forEach((word) => {
      if (words2.has(word)) overlap++;
    });
    return overlap;
  }

  private inferStructureFromPoint(point: NarrativePoint): NarrativeStructure {
    if (point.emotionalWeight > 0.7) return 'building_to_point';
    if (point.connectedness > 0.7) return 'direct';
    if (point.connectedness < 0.3) return 'meandering';
    return 'direct';
  }
}

// ============================================================================
// SESSION REGISTRY
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

/**
 * Session registry for narrative arc trackers.
 * Provides automatic cleanup and lifecycle management.
 */
const narrativeArcRegistry = createSessionRegistry(
  (sessionId: string) => new NarrativeArcTracker(),
  {
    name: 'NarrativeArc',
    cleanup: (tracker) => tracker.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(narrativeArcRegistry);

export function getNarrativeArcTracker(sessionId: string): NarrativeArcTracker {
  return narrativeArcRegistry.get(sessionId);
}

export function resetNarrativeArcTracker(sessionId: string): void {
  narrativeArcRegistry.reset(sessionId);
}

export function resetAllNarrativeArcTrackers(): void {
  narrativeArcRegistry.resetAll();
}

export function hasNarrativeArcTracker(sessionId: string): boolean {
  return narrativeArcRegistry.has(sessionId);
}

export function getActiveNarrativeArcCount(): number {
  return narrativeArcRegistry.getActiveCount();
}

export default NarrativeArcTracker;
