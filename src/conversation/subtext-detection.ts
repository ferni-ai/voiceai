/**
 * Subtext Detection Engine
 *
 * > "We hear what you're not saying."
 *
 * Reads between the lines to detect what users really mean:
 *
 * - **Deflection**: "I'm fine" when they're not
 * - **Minimizing**: "It's not a big deal" when it IS
 * - **Testing Waters**: Gauging safety before revealing
 * - **Hidden Asks**: Wanting something but not saying it directly
 * - **Protective Denial**: Protecting themselves from vulnerability
 * - **Seeking Permission**: Wanting to talk but needing invitation
 *
 * This is SUPERHUMAN: detecting emotional truth beneath words.
 *
 * @module @ferni/subtext-detection
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'SubtextDetection' });

// ============================================================================
// TYPES
// ============================================================================

export type SubtextType =
  | 'deflection' // Redirecting away from something
  | 'minimizing' // Downplaying significance
  | 'testing_waters' // Gauging safety before revealing
  | 'hidden_ask' // Wanting something indirectly
  | 'protective_denial' // Self-protection
  | 'seeking_permission' // Wanting invitation to share
  | 'masked_emotion' // Hiding true feeling
  | 'indirect_admission' // Admitting without saying directly
  | 'rhetorical_distance' // Using "someone" when meaning self
  | 'none';

export interface SubtextDetection {
  /** Type of subtext detected */
  type: SubtextType;

  /** Confidence in detection (0-1) */
  confidence: number;

  /** What we think they really mean */
  inferredMeaning: string;

  /** Evidence that led to detection */
  evidence: string[];

  /** Suggested gentle probe */
  gentleProbe: string | null;

  /** Whether to act on this detection */
  shouldAct: boolean;
}

export interface SubtextContext {
  userMessage: string;
  turnCount: number;
  recentTopics?: string[];
  previousSubtexts?: SubtextType[];
  emotionalState?: string;
  relationshipDepth: 'new' | 'developing' | 'established' | 'deep';
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Deflection patterns - redirecting away from feelings */
const DEFLECTION_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  // Single "fine" statements
  { pattern: /^(i'?m |i am )?(fine|okay|good|alright)\.?$/i, strength: 0.85 },
  { pattern: /^(it'?s |it is )?(fine|okay|whatever)\.?$/i, strength: 0.8 },
  // Repeated reassurance = stronger deflection signal
  { pattern: /(i'?m |i am )?(fine|okay|good).*everything'?s? (fine|okay|good)/i, strength: 0.95 },
  { pattern: /(fine|okay|good).*\. *(i'?m |i am )?(fine|okay|good)/i, strength: 0.9 },
  { pattern: /everything'?s? (fine|okay|good|alright)/i, strength: 0.75 },
  // Topic changes
  { pattern: /anyway,? (so|what|how|let'?s)/i, strength: 0.7 },
  { pattern: /but (anyway|enough about|let'?s not)/i, strength: 0.75 },
  { pattern: /doesn'?t matter\.?$/i, strength: 0.8 },
  { pattern: /forget (i said|it|about it)/i, strength: 0.85 },
  { pattern: /never ?mind/i, strength: 0.9 },
  { pattern: /it'?s not (important|worth|a big)/i, strength: 0.75 },
  { pattern: /i don'?t (want to|wanna) (talk|think) about/i, strength: 0.65 },
  { pattern: /can we (just|please)? (change|talk about something)/i, strength: 0.6 },
];

/** Minimizing patterns - downplaying significance */
const MINIMIZING_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /not (a |that )?big (of a )?deal/i, strength: 0.85 },
  { pattern: /it'?s (nothing|no big|not much)/i, strength: 0.8 },
  { pattern: /i'?m (probably |just )?(over ?reacting|being dramatic)/i, strength: 0.9 },
  { pattern: /i shouldn'?t (complain|feel|be)/i, strength: 0.85 },
  { pattern: /other (people|folks) have it worse/i, strength: 0.9 },
  { pattern: /i know i (should|shouldn'?t)/i, strength: 0.6 },
  { pattern: /it'?s (stupid|silly|dumb),? but/i, strength: 0.85 },
  { pattern: /i (just|only) (wanted|needed) to/i, strength: 0.5 },
  { pattern: /it'?s (probably|maybe) (nothing|just me)/i, strength: 0.8 },
  { pattern: /sorry,? (i know |this is |it'?s )?(stupid|silly|dumb)/i, strength: 0.85 },
];

/** Testing waters - gauging safety before revealing */
const TESTING_WATERS_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /can i (tell|ask|share|say) (you )?(something|a thing)/i, strength: 0.9 },
  { pattern: /this (might|may) (sound|seem|be) (weird|crazy|strange)/i, strength: 0.85 },
  { pattern: /i'?ve never (told|said|shared) (anyone|this)/i, strength: 0.95 },
  { pattern: /promise (you won'?t|not to)/i, strength: 0.9 },
  { pattern: /you'?re (not )?going to (think|judge|laugh)/i, strength: 0.85 },
  { pattern: /don'?t (think|judge|laugh)/i, strength: 0.7 },
  { pattern: /is it (okay|ok|alright) (if i|to)/i, strength: 0.75 },
  { pattern: /i (don'?t know|'?m not sure) (if i should|how to)/i, strength: 0.6 },
  { pattern: /can i be (honest|real|frank)/i, strength: 0.85 },
  { pattern: /between (us|you and me)/i, strength: 0.8 },
];

/** Hidden ask patterns - wanting something indirectly */
const HIDDEN_ASK_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /i (wish|wanted|hoped) (someone|i had someone)/i, strength: 0.8 },
  { pattern: /it would be nice (if|to)/i, strength: 0.7 },
  { pattern: /i (just )?need(ed)? to (talk|vent|share)/i, strength: 0.75 },
  { pattern: /i don'?t (know|have) (anyone|who) (to|i can)/i, strength: 0.85 },
  { pattern: /i'?ve been (wanting|meaning|trying) to/i, strength: 0.6 },
  { pattern: /do you (think|ever)/i, strength: 0.4 },
  { pattern: /what would you (do|think|say)/i, strength: 0.5 },
  { pattern: /i'?m (not sure|curious) (if|what|how)/i, strength: 0.45 },
];

/** Seeking permission patterns - wanting invitation to share */
const SEEKING_PERMISSION_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /i (don'?t|do not) (want to|wanna) (burden|bother|bore)/i, strength: 0.9 },
  { pattern: /you (probably |don'?t )?(don'?t )?want to hear/i, strength: 0.85 },
  { pattern: /i (shouldn'?t|should not) (dump|unload|burden)/i, strength: 0.85 },
  { pattern: /it'?s (probably |not )?(not )?interesting/i, strength: 0.7 },
  { pattern: /you (must be|'?re probably) (busy|tired)/i, strength: 0.75 },
  { pattern: /i know (you'?re|this is)/i, strength: 0.5 },
  { pattern: /if you (have|don'?t mind|'?re okay)/i, strength: 0.6 },
  { pattern: /only if you (want|have time)/i, strength: 0.7 },
];

/** Masked emotion patterns - hiding true feelings */
const MASKED_EMOTION_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /i'?m (not )?(even )?(mad|angry|upset),? (just|i'?m)/i, strength: 0.85 },
  { pattern: /(ha(ha)?|lol|lmao).*(but|actually|honestly)/i, strength: 0.7 },
  { pattern: /it'?s (kind of |sort of )?(funny|ironic|whatever)/i, strength: 0.6 },
  { pattern: /i (guess|suppose) i'?m (a little|kind of|sort of)/i, strength: 0.75 },
  { pattern: /i mean,? i'?m (fine|okay|good),? (but|just|it'?s)/i, strength: 0.8 },
  { pattern: /whatever,? (i guess|it'?s fine|i don'?t care)/i, strength: 0.85 },
];

/** Rhetorical distance - using "someone" when meaning self */
const RHETORICAL_DISTANCE_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /asking for a friend/i, strength: 0.95 },
  { pattern: /someone i know/i, strength: 0.7 },
  { pattern: /hypothetically/i, strength: 0.8 },
  { pattern: /what if (someone|a person)/i, strength: 0.75 },
  { pattern: /let'?s say (someone|a person|you)/i, strength: 0.7 },
  { pattern: /i (have|know) (this |a )?friend (who|that)/i, strength: 0.6 },
];

/** Indirect admission patterns */
const INDIRECT_ADMISSION_PATTERNS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /i (might|may) have/i, strength: 0.6 },
  { pattern: /there'?s (a chance|possibility)/i, strength: 0.65 },
  { pattern: /i'?m not (saying|admitting),? but/i, strength: 0.85 },
  { pattern: /not that i (would|did|am),? but/i, strength: 0.8 },
  { pattern: /i mean,? maybe/i, strength: 0.6 },
  { pattern: /i (guess|suppose) (you could say|maybe)/i, strength: 0.7 },
];

// ============================================================================
// GENTLE PROBES
// ============================================================================

const GENTLE_PROBES: Record<SubtextType, string[]> = {
  deflection: [
    "I hear you saying you're fine, but something in your voice tells me there might be more there.",
    "You can change the subject if you want—but if there's something underneath, I'm here.",
    "That felt like a quick pivot. No pressure, but I'm curious what was happening there.",
    "You don't have to talk about it, but I noticed you moved away from that pretty fast.",
  ],
  minimizing: [
    "You say it's not a big deal, but the fact that you brought it up tells me it matters.",
    "Even 'small' things can feel heavy. What's this one weighing on you?",
    "I noticed you downplaying this. What would you say if you weren't filtering?",
    "Other people having it worse doesn't mean what you're feeling isn't real.",
    "You don't have to earn the right to feel this way. What's actually going on?",
  ],
  testing_waters: [
    "You can tell me anything. I'm not going anywhere.",
    "Take your time. Whatever it is, I'm here.",
    "This feels important. I'm listening—no judgment.",
    "You're safe here. What's on your mind?",
  ],
  hidden_ask: [
    'It sounds like you might need something right now. What would help?',
    "I'm hearing between the lines. What do you actually need?",
    "Is there something you're hoping I'll offer?",
    'What would feel supportive right now?',
  ],
  protective_denial: [
    "Sometimes we protect ourselves from feeling things. That's okay.",
    "It's okay to not be okay about this.",
    'What would you feel if you let yourself?',
  ],
  seeking_permission: [
    "You're not a burden. I want to hear this.",
    "Please, I'm here for exactly this. Tell me.",
    'I have all the time in the world for you. What is it?',
    "You don't need permission to share with me. I'm listening.",
  ],
  masked_emotion: [
    "Something tells me there's more beneath that laugh.",
    "What's the feeling you're trying to hide from?",
    "You're allowed to actually feel this, you know.",
    "I hear you saying you're not upset, but I wonder if that's the whole story.",
  ],
  indirect_admission: [
    "Sounds like maybe this is closer to home than you're letting on.",
    "I'm getting the sense this isn't just hypothetical.",
    'Is this actually about you?',
  ],
  rhetorical_distance: [
    "Tell me more about this 'friend' of yours.",
    'We can talk about your friend... or about you, if that feels safer.',
    "I'm wondering if this friend might be a little closer to home.",
  ],
  none: [],
};

// ============================================================================
// SUBTEXT DETECTION ENGINE
// ============================================================================

export class SubtextDetectionEngine {
  private detectionHistory: Array<{
    type: SubtextType;
    turn: number;
    acted: boolean;
  }> = [];

  private lastDetectionTurn = 0;
  private consecutiveDeflections = 0;

  constructor() {
    logger.debug('SubtextDetectionEngine initialized');
  }

  /**
   * Analyze a message for subtext
   *
   * @param context - Current conversation context
   * @returns Detection result with confidence and suggested response
   */
  detect(context: SubtextContext): SubtextDetection {
    const { userMessage, turnCount, relationshipDepth } = context;
    const normalizedMessage = userMessage.trim().toLowerCase();

    // Check each subtext type
    const detections: Array<{
      type: SubtextType;
      confidence: number;
      evidence: string[];
    }> = [];

    // Deflection
    const deflectionResult = this.checkPatterns(normalizedMessage, DEFLECTION_PATTERNS);
    if (deflectionResult.confidence > 0) {
      detections.push({
        type: 'deflection',
        confidence: deflectionResult.confidence,
        evidence: deflectionResult.evidence,
      });
    }

    // Minimizing
    const minimizingResult = this.checkPatterns(normalizedMessage, MINIMIZING_PATTERNS);
    if (minimizingResult.confidence > 0) {
      detections.push({
        type: 'minimizing',
        confidence: minimizingResult.confidence,
        evidence: minimizingResult.evidence,
      });
    }

    // Testing waters
    const testingResult = this.checkPatterns(normalizedMessage, TESTING_WATERS_PATTERNS);
    if (testingResult.confidence > 0) {
      detections.push({
        type: 'testing_waters',
        confidence: testingResult.confidence,
        evidence: testingResult.evidence,
      });
    }

    // Hidden ask
    const hiddenAskResult = this.checkPatterns(normalizedMessage, HIDDEN_ASK_PATTERNS);
    if (hiddenAskResult.confidence > 0) {
      detections.push({
        type: 'hidden_ask',
        confidence: hiddenAskResult.confidence,
        evidence: hiddenAskResult.evidence,
      });
    }

    // Seeking permission
    const permissionResult = this.checkPatterns(normalizedMessage, SEEKING_PERMISSION_PATTERNS);
    if (permissionResult.confidence > 0) {
      detections.push({
        type: 'seeking_permission',
        confidence: permissionResult.confidence,
        evidence: permissionResult.evidence,
      });
    }

    // Masked emotion
    const maskedResult = this.checkPatterns(normalizedMessage, MASKED_EMOTION_PATTERNS);
    if (maskedResult.confidence > 0) {
      detections.push({
        type: 'masked_emotion',
        confidence: maskedResult.confidence,
        evidence: maskedResult.evidence,
      });
    }

    // Rhetorical distance
    const distanceResult = this.checkPatterns(normalizedMessage, RHETORICAL_DISTANCE_PATTERNS);
    if (distanceResult.confidence > 0) {
      detections.push({
        type: 'rhetorical_distance',
        confidence: distanceResult.confidence,
        evidence: distanceResult.evidence,
      });
    }

    // Indirect admission
    const indirectResult = this.checkPatterns(normalizedMessage, INDIRECT_ADMISSION_PATTERNS);
    if (indirectResult.confidence > 0) {
      detections.push({
        type: 'indirect_admission',
        confidence: indirectResult.confidence,
        evidence: indirectResult.evidence,
      });
    }

    // No subtext detected
    if (detections.length === 0) {
      this.consecutiveDeflections = 0;
      return {
        type: 'none',
        confidence: 0,
        inferredMeaning: '',
        evidence: [],
        gentleProbe: null,
        shouldAct: false,
      };
    }

    // Get highest confidence detection
    const bestDetection = detections.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    // Track consecutive deflections (important pattern)
    if (bestDetection.type === 'deflection') {
      this.consecutiveDeflections++;
    } else {
      this.consecutiveDeflections = 0;
    }

    // Determine if we should act on this detection
    const shouldAct = this.shouldActOnDetection(
      bestDetection.type,
      bestDetection.confidence,
      turnCount,
      relationshipDepth
    );

    // Get gentle probe
    const probes = GENTLE_PROBES[bestDetection.type];
    const gentleProbe =
      shouldAct && probes.length > 0 ? probes[Math.floor(Math.random() * probes.length)] : null;

    // Generate inferred meaning
    const inferredMeaning = this.generateInferredMeaning(bestDetection.type, userMessage);

    // Record detection
    this.detectionHistory.push({
      type: bestDetection.type,
      turn: turnCount,
      acted: shouldAct,
    });
    this.lastDetectionTurn = turnCount;

    // Emit signal for frontend EQ
    if (shouldAct && bestDetection.confidence > 0.7) {
      void humanizationSignalEmitter.emit({
        signalType: 'subtext_detected',
        intensity: bestDetection.confidence,
        observationType: 'emotional',
        observationContent: bestDetection.type,
      });
    }

    logger.debug(
      {
        type: bestDetection.type,
        confidence: bestDetection.confidence.toFixed(2),
        shouldAct,
        turnCount,
      },
      '👁️ Subtext detected'
    );

    return {
      type: bestDetection.type,
      confidence: bestDetection.confidence,
      inferredMeaning,
      evidence: bestDetection.evidence,
      gentleProbe,
      shouldAct,
    };
  }

  /**
   * Check message against pattern set
   */
  private checkPatterns(
    message: string,
    patterns: Array<{ pattern: RegExp; strength: number }>
  ): { confidence: number; evidence: string[] } {
    const matches: Array<{ pattern: string; strength: number }> = [];

    for (const { pattern, strength } of patterns) {
      if (pattern.test(message)) {
        matches.push({
          pattern: pattern.source,
          strength,
        });
      }
    }

    if (matches.length === 0) {
      return { confidence: 0, evidence: [] };
    }

    // Use highest match strength, boosted slightly by multiple matches
    const maxStrength = Math.max(...matches.map((m) => m.strength));
    const multipleMatchBoost = Math.min(0.1, (matches.length - 1) * 0.03);

    return {
      confidence: Math.min(1, maxStrength + multipleMatchBoost),
      evidence: matches.map((m) => `Pattern: ${m.pattern.slice(0, 30)}...`),
    };
  }

  /**
   * Determine if we should act on a detection
   */
  private shouldActOnDetection(
    type: SubtextType,
    confidence: number,
    turnCount: number,
    relationshipDepth: string
  ): boolean {
    // Testing waters always deserves response (they're asking for safety)
    if (type === 'testing_waters' && confidence > 0.6) {
      return true;
    }

    // Seeking permission always deserves response
    if (type === 'seeking_permission' && confidence > 0.6) {
      return true;
    }

    // High confidence detections
    if (confidence > 0.8) {
      return true;
    }

    // Multiple consecutive deflections = definitely address it
    if (this.consecutiveDeflections >= 2 && type === 'deflection') {
      return true;
    }

    // Don't call out subtext too early in relationship
    if (relationshipDepth === 'new' && confidence < 0.85) {
      return false;
    }

    // Moderate confidence in established relationship
    if (
      (relationshipDepth === 'established' || relationshipDepth === 'deep') &&
      confidence > 0.65
    ) {
      return true;
    }

    // Don't act too frequently
    if (turnCount - this.lastDetectionTurn < 3) {
      return false;
    }

    // Default threshold
    return confidence > 0.75;
  }

  /**
   * Generate inferred meaning based on subtext type
   */
  private generateInferredMeaning(type: SubtextType, originalMessage: string): string {
    switch (type) {
      case 'deflection':
        return "They may be avoiding something difficult. 'Fine' often means 'I don't want to talk about it.'";
      case 'minimizing':
        return "This matters more than they're letting on. They may feel undeserving of attention.";
      case 'testing_waters':
        return "They want to share something vulnerable but need to know it's safe first.";
      case 'hidden_ask':
        return 'They want something specific but are afraid to ask directly.';
      case 'protective_denial':
        return "They're protecting themselves from a feeling that feels too big.";
      case 'seeking_permission':
        return 'They want to share but feel like a burden. They need explicit invitation.';
      case 'masked_emotion':
        return "There's a real emotion underneath the surface presentation.";
      case 'indirect_admission':
        return "They're admitting something without fully committing to it.";
      case 'rhetorical_distance':
        return 'The "friend" or "hypothetical" is likely them. They need distance to approach it.';
      default:
        return '';
    }
  }

  /**
   * Get detection statistics
   */
  getStats(): {
    totalDetections: number;
    actedCount: number;
    typeBreakdown: Record<SubtextType, number>;
  } {
    const typeBreakdown = {} as Record<SubtextType, number>;
    let actedCount = 0;

    for (const detection of this.detectionHistory) {
      typeBreakdown[detection.type] = (typeBreakdown[detection.type] || 0) + 1;
      if (detection.acted) actedCount++;
    }

    return {
      totalDetections: this.detectionHistory.length,
      actedCount,
      typeBreakdown,
    };
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.detectionHistory = [];
    this.lastDetectionTurn = 0;
    this.consecutiveDeflections = 0;
    logger.debug('SubtextDetectionEngine reset');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, SubtextDetectionEngine>();

export function getSubtextDetectionEngine(sessionId: string): SubtextDetectionEngine {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new SubtextDetectionEngine());
  }
  return instances.get(sessionId)!;
}

export function resetSubtextDetectionEngine(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
  }
}

export function clearSubtextDetectionEngine(sessionId: string): void {
  instances.delete(sessionId);
}

export default SubtextDetectionEngine;
