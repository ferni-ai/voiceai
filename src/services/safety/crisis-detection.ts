/**
 * Crisis Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects crisis signals in user speech and triggers appropriate responses.
 * User safety is non-negotiable. Ferni must recognize crisis and connect
 * to resources while staying present.
 *
 * Philosophy:
 * - Never abandon the user ("I'm here, AND I want you to have more support")
 * - Validate first, resources second
 * - Warm handoff language, not clinical
 * - Conservative detection (false positives are acceptable for safety)
 *
 * @module CrisisDetection
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisDetection' });

// ============================================================================
// TYPES
// ============================================================================

export type CrisisType =
  | 'suicidal_ideation'
  | 'self_harm'
  | 'domestic_abuse'
  | 'child_abuse'
  | 'elder_abuse'
  | 'substance_crisis'
  | 'severe_distress'
  | 'panic_attack'
  | 'psychotic_symptoms'
  | 'eating_disorder_crisis'
  | 'sexual_assault';

export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CrisisSignal {
  type: CrisisType;
  severity: CrisisSeverity;
  confidence: number; // 0-1
  matchedPatterns: string[];
  contextualFactors: string[];
}

export interface CrisisDetectionResult {
  /** Whether any crisis was detected */
  detected: boolean;

  /** The primary crisis signal (highest severity) */
  primary: CrisisSignal | null;

  /** All detected crisis signals */
  signals: CrisisSignal[];

  /** Requires immediate resource connection */
  requiresImmediateAction: boolean;

  /** Suggested response approach */
  responseApproach: 'acknowledge' | 'validate_and_resource' | 'immediate_resource' | 'continue';

  /** Raw detection metadata for logging */
  metadata: {
    processedAt: Date;
    textLength: number;
    patternMatchCount: number;
  };
}

// ============================================================================
// CRISIS PATTERNS
// ============================================================================

/**
 * Pattern definitions for crisis detection.
 * Organized by crisis type with severity gradients.
 */
const CRISIS_PATTERNS: Record<CrisisType, { patterns: RegExp[]; severity: CrisisSeverity }[]> = {
  suicidal_ideation: [
    // Critical - immediate action required
    {
      patterns: [
        /\b(kill myself|end my life|want to die|better off dead|suicide plan|going to kill)\b/i,
        /\b(have a plan to|know how i.*(would|will) do it|set a date)\b/i,
        /\b(goodbye letter|giving away my stuff|final goodbye)\b/i,
        /\b(no reason to (live|go on|keep going))\b/i,
      ],
      severity: 'critical',
    },
    // High - needs resource connection
    {
      patterns: [
        /\b(don't want to be here|want (it|this) to end|can't do this anymore)\b/i,
        /\b(wish i (was|were) dead|wish i (wasn't|weren't) alive)\b/i,
        /\b(everyone.*(better|happier) without me)\b/i,
        /\b(what's the point of (living|life|going on))\b/i,
        /\b(i give up|there's no hope|hopeless)\b/i,
      ],
      severity: 'high',
    },
    // Medium - needs gentle exploration
    {
      patterns: [
        /\b(thinking about death a lot|can't stop thinking about dying)\b/i,
        /\b(life isn't worth|not sure i want to)\b/i,
        /\b(i'm a burden|everyone hates me)\b/i,
      ],
      severity: 'medium',
    },
  ],

  self_harm: [
    {
      patterns: [
        /\b(cut(ting)? myself|hurt(ing)? myself|burn(ing)? myself)\b/i,
        /\b(self.?harm|self.?injury|self.?mutilat)\b/i,
        /\b(relapsed.*cutting|started cutting again)\b/i,
      ],
      severity: 'high',
    },
    {
      patterns: [
        /\b(want to hurt myself|thinking about hurting myself)\b/i,
        /\b(urge to cut|urge to hurt)\b/i,
      ],
      severity: 'medium',
    },
  ],

  domestic_abuse: [
    {
      patterns: [
        /\b(partner.*(hit|hits|punch|beat|choke|strangle)|he.*(hit|hits|punch|beat) me)\b/i,
        /\b(afraid (of|he.?ll|she.?ll) (hurt|kill) me)\b/i,
        /\b(can't leave|trapped|hostage)\b.*\b(relationship|partner|spouse)\b/i,
        /\b(threatened to kill|will kill me if i leave)\b/i,
      ],
      severity: 'critical',
    },
    {
      patterns: [
        /\b(controls (everything|my money|who i see))\b/i,
        /\b(isolate.* from (family|friends))\b/i,
        /\b(emotional abuse|verbally abusive|constantly criticiz)\b/i,
      ],
      severity: 'high',
    },
  ],

  child_abuse: [
    {
      patterns: [
        /\b(abuse.*(child|kid|son|daughter)|hit(s|ting) (my|the) (child|kid))\b/i,
        /\b((my|their) (dad|mom|parent).*(hurt|abuse|touch))\b/i,
        /\b(worried about.*(safety|welfare).*child)\b/i,
      ],
      severity: 'critical',
    },
  ],

  elder_abuse: [
    {
      patterns: [
        /\b(abuse.*(parent|elderly|grandmother|grandfather))\b/i,
        /\b(caregiver.*(steal|hurt|neglect))\b/i,
        /\b(nursing home.*(abuse|neglect))\b/i,
      ],
      severity: 'critical',
    },
  ],

  substance_crisis: [
    {
      patterns: [
        /\b(overdos|od.?ing|took too (much|many))\b/i,
        /\b(mixed.*pills|mixed.*alcohol|combined.*drugs)\b/i,
        /\b(withdrawal.*(bad|severe|dying))\b/i,
      ],
      severity: 'critical',
    },
    {
      patterns: [
        /\b(can't stop (drinking|using|taking))\b/i,
        /\b(relapsed|started using again|fell off the wagon)\b/i,
        /\b(drink(ing)? every day|high every day)\b/i,
      ],
      severity: 'high',
    },
    {
      patterns: [
        /\b(struggling with (addiction|substance|alcohol|drugs))\b/i,
        /\b(worried about my (drinking|drug use))\b/i,
      ],
      severity: 'medium',
    },
  ],

  severe_distress: [
    {
      patterns: [
        /\b(can't (breathe|function|cope|handle this))\b/i,
        /\b(completely (overwhelmed|falling apart|breaking down))\b/i,
        /\b(losing (my mind|it|control))\b/i,
        /\b(screaming inside|want to scream)\b/i,
      ],
      severity: 'high',
    },
    {
      patterns: [
        /\b(really struggling|at my limit|breaking point)\b/i,
        /\b(everything is (too much|falling apart))\b/i,
      ],
      severity: 'medium',
    },
  ],

  panic_attack: [
    {
      patterns: [
        /\b(having a panic attack|can't breathe|heart (racing|pounding))\b/i,
        /\b(think i'm (dying|having a heart attack))\b/i,
        /\b(chest (tight|pain|hurts).*can't breathe)\b/i,
      ],
      severity: 'high',
    },
    {
      patterns: [
        /\b(so anxious.*can't (function|think|breathe))\b/i,
        /\b(anxiety attack|panic.*(coming|starting))\b/i,
      ],
      severity: 'medium',
    },
  ],

  psychotic_symptoms: [
    {
      patterns: [
        /\b(voices (telling|saying)|hear(ing)? voices)\b/i,
        /\b(people (watching|following|out to get) me)\b/i,
        /\b(not sure what's real|can't tell.*(real|reality))\b/i,
        /\b(god.*(told|telling) me to|messages from)\b/i,
      ],
      severity: 'high',
    },
  ],

  eating_disorder_crisis: [
    {
      patterns: [
        /\b(haven't eaten in (days|\d+ days))\b/i,
        /\b(purging.*times a day|binge.*(can't stop|out of control))\b/i,
        /\b(lost.*(lot|much).*weight.*short time)\b/i,
      ],
      severity: 'high',
    },
    {
      patterns: [
        /\b(hate (my body|eating)|afraid to eat)\b/i,
        /\b(restrict(ing)? (food|eating)|counting every calorie)\b/i,
      ],
      severity: 'medium',
    },
  ],

  sexual_assault: [
    {
      patterns: [
        /\b((was|been) (raped|assaulted|molested))\b/i,
        /\b((forced|made) me to have sex)\b/i,
        /\b(sexually (abuse|assault))\b/i,
      ],
      severity: 'critical',
    },
    {
      patterns: [
        /\b(touched.*without (consent|permission))\b/i,
        /\b(something happened.*don't know how to)\b/i,
      ],
      severity: 'high',
    },
  ],
};

// ============================================================================
// CONTEXTUAL MODIFIERS
// ============================================================================

/**
 * Phrases that increase crisis severity
 */
const ESCALATING_CONTEXT = [
  /\b(right now|tonight|today|immediately)\b/i,
  /\b(already.*have|have.*ready|got.*ready)\b/i, // "have a plan ready"
  /\b(no one (knows|cares|would notice))\b/i,
  /\b(alone|by myself|isolated)\b/i,
  /\b(just called to say|wanted you to know|need to tell someone)\b/i,
  /\b(this is (it|goodbye|the end))\b/i,
];

/**
 * Phrases that might indicate historical/hypothetical rather than current crisis
 */
const DEESCALATING_CONTEXT = [
  /\b(used to|in the past|years ago|when i was)\b/i,
  /\b(wondering if|hypothetically|what if someone)\b/i,
  /\b(my (friend|sister|brother|parent|coworker) is)\b/i, // About someone else
  /\b(read about|saw on|in the news)\b/i,
  /\b(getting help|seeing a therapist|in therapy)\b/i,
];

// ============================================================================
// DETECTION ENGINE
// ============================================================================

/**
 * Detect crisis signals in user text.
 *
 * @param text - The user's message
 * @param context - Additional context about the conversation
 * @returns Crisis detection result
 */
export function detectCrisis(
  text: string,
  context?: {
    /** Recent emotional state */
    recentEmotion?: string;
    /** Previous crisis signals in session */
    previousSignals?: CrisisSignal[];
    /** Relationship stage with user */
    relationshipStage?: string;
  }
): CrisisDetectionResult {
  const signals: CrisisSignal[] = [];
  const processedAt = new Date();

  // Check for escalating/de-escalating context
  const hasEscalatingContext = ESCALATING_CONTEXT.some((pattern) => pattern.test(text));
  const hasDeescalatingContext = DEESCALATING_CONTEXT.some((pattern) => pattern.test(text));

  // Track matched patterns for logging
  let totalPatternMatches = 0;

  // Check each crisis type
  for (const [crisisType, severityLevels] of Object.entries(CRISIS_PATTERNS)) {
    for (const { patterns, severity } of severityLevels) {
      const matchedPatterns: string[] = [];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          matchedPatterns.push(pattern.source);
          totalPatternMatches++;
        }
      }

      if (matchedPatterns.length > 0) {
        // Calculate confidence based on matches and context
        let confidence = Math.min(0.5 + matchedPatterns.length * 0.2, 0.95);

        // Adjust severity based on context
        let adjustedSeverity = severity;
        const contextualFactors: string[] = [];

        if (hasEscalatingContext && !hasDeescalatingContext) {
          confidence += 0.1;
          contextualFactors.push('escalating_context');
          if (adjustedSeverity === 'medium') adjustedSeverity = 'high';
          if (adjustedSeverity === 'high') adjustedSeverity = 'critical';
        }

        if (hasDeescalatingContext && !hasEscalatingContext) {
          confidence -= 0.2;
          contextualFactors.push('deescalating_context');
          if (adjustedSeverity === 'critical') adjustedSeverity = 'high';
          if (adjustedSeverity === 'high') adjustedSeverity = 'medium';
        }

        // Previous signals in session increase concern
        if (context?.previousSignals && context.previousSignals.length > 0) {
          confidence += 0.1;
          contextualFactors.push('previous_signals_in_session');
        }

        // Clamp confidence
        confidence = Math.max(0.1, Math.min(1, confidence));

        signals.push({
          type: crisisType as CrisisType,
          severity: adjustedSeverity,
          confidence,
          matchedPatterns,
          contextualFactors,
        });

        // Only take highest severity match for each crisis type
        break;
      }
    }
  }

  // Sort by severity (critical > high > medium > low) and confidence
  const severityOrder: Record<CrisisSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  signals.sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });

  const primary = signals[0] || null;
  const detected = signals.length > 0;

  // Determine response approach
  let responseApproach: CrisisDetectionResult['responseApproach'] = 'continue';
  let requiresImmediateAction = false;

  if (primary) {
    if (primary.severity === 'critical') {
      responseApproach = 'immediate_resource';
      requiresImmediateAction = true;
    } else if (primary.severity === 'high') {
      responseApproach = 'validate_and_resource';
      requiresImmediateAction = true;
    } else if (primary.severity === 'medium') {
      responseApproach = 'acknowledge';
    }
  }

  const result: CrisisDetectionResult = {
    detected,
    primary,
    signals,
    requiresImmediateAction,
    responseApproach,
    metadata: {
      processedAt,
      textLength: text.length,
      patternMatchCount: totalPatternMatches,
    },
  };

  // Log crisis detection (always log detected, debug for non-detected)
  if (detected) {
    log.warn(
      {
        type: primary?.type,
        severity: primary?.severity,
        confidence: primary?.confidence?.toFixed(2),
        requiresImmediateAction,
        signalCount: signals.length,
      },
      '🚨 Crisis signal detected'
    );
  }

  return result;
}

/**
 * Check if a crisis type is active for a user
 * (based on recent session signals)
 */
export function isCrisisActive(sessionSignals: CrisisSignal[], crisisType: CrisisType): boolean {
  return sessionSignals.some((s) => s.type === crisisType && s.confidence > 0.5);
}

/**
 * Get the highest severity crisis in a session
 */
export function getHighestSeverityCrisis(signals: CrisisSignal[]): CrisisSignal | null {
  if (signals.length === 0) return null;

  const severityOrder: Record<CrisisSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return signals.reduce((highest, current) =>
    severityOrder[current.severity] > severityOrder[highest.severity] ? current : highest
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCrisis,
  isCrisisActive,
  getHighestSeverityCrisis,
};
