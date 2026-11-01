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

import { detectCrisis as detectGuardCrisis } from './crisis-guard.js';
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

/** Suicide and self-harm come from the crisis guard; see detectSuicideAndSelfHarm. */
type PatternCrisisType = Exclude<CrisisType, 'suicidal_ideation' | 'self_harm'>;

/**
 * Pattern definitions for crisis detection.
 * Organized by crisis type with severity gradients.
 */
const CRISIS_PATTERNS: Record<PatternCrisisType, { patterns: RegExp[]; severity: CrisisSeverity }[]> = {
  domestic_abuse: [
    {
      patterns: [
        /\b(partner.*(hit|hits|punch|beat|choke|strangle)|he.*(hit|hits|punch|beat) me)\b/i,
        /\b(husband|wife|boyfriend|girlfriend|spouse|fianc[eé]e?|ex) (hits|hit|beats|beat|punches|punched|chokes|choked|slaps|slapped|kicks|kicked|strangled) me\b/i,
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
 * Suicide and self-harm signals, from the crisis guard that also decides the
 * reply override, so the prompt context and the override never disagree. The
 * guard already handles negation, jokes, history and recovery. A risk to a
 * third party is left to the guard's own guidance: the responses built here
 * speak to the caller as the one at risk.
 */
function detectSuicideAndSelfHarm(text: string): CrisisSignal | null {
  const guard = detectGuardCrisis(text);
  if (guard.subject !== 'self') return null;
  const isSelfHarm =
    guard.indicators.includes('self_harm') && !guard.indicators.includes('imminent_danger');
  const explicit = guard.indicators.includes('explicit_crisis_language');
  // Self-harm without suicidal intent tops out at high, as in the taxonomy above.
  const severity: CrisisSeverity =
    explicit && !isSelfHarm ? 'critical' : guard.severity >= 0.75 ? 'high' : 'medium';
  return {
    type: isSelfHarm ? 'self_harm' : 'suicidal_ideation',
    severity,
    confidence: guard.severity,
    matchedPatterns: guard.indicators,
    contextualFactors: [],
  };
}

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

  /** Context moves severity one step at most and annotates why. */
  const withContext = (signal: CrisisSignal): CrisisSignal => {
    let { severity, confidence } = signal;
    const contextualFactors = [...signal.contextualFactors];

    if (hasEscalatingContext && !hasDeescalatingContext) {
      confidence += 0.1;
      contextualFactors.push('escalating_context');
      if (severity === 'medium') severity = 'high';
      else if (severity === 'high') severity = 'critical';
    }

    if (hasDeescalatingContext && !hasEscalatingContext) {
      confidence -= 0.2;
      contextualFactors.push('deescalating_context');
      if (severity === 'critical') severity = 'high';
      else if (severity === 'high') severity = 'medium';
    }

    // Previous signals in session increase concern
    if (context?.previousSignals && context.previousSignals.length > 0) {
      confidence += 0.1;
      contextualFactors.push('previous_signals_in_session');
    }

    return {
      ...signal,
      severity,
      confidence: Math.max(0.1, Math.min(1, confidence)),
      contextualFactors,
    };
  };

  const suicideOrSelfHarm = detectSuicideAndSelfHarm(text);
  if (suicideOrSelfHarm) {
    signals.push(withContext(suicideOrSelfHarm));
    totalPatternMatches += suicideOrSelfHarm.matchedPatterns.length;
  }

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
        signals.push(
          withContext({
            type: crisisType as CrisisType,
            severity,
            confidence: Math.min(0.5 + matchedPatterns.length * 0.2, 0.95),
            matchedPatterns,
            contextualFactors: [],
          })
        );

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
  // At equal severity a substance emergency leads: an overdose needs 911 and
  // poison control before anything else, whatever the intent.
  const medicalFirst = (s: CrisisSignal): number =>
    s.type === 'substance_crisis' && s.severity === 'critical' ? 1 : 0;
  signals.sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    const medicalDiff = medicalFirst(b) - medicalFirst(a);
    if (medicalDiff !== 0) return medicalDiff;
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
