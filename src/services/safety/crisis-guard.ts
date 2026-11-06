/**
 * Crisis Guard - Hard Safety Rails
 *
 * Runs on the caller's words BEFORE the LLM (see turn-processor/process-turn.ts):
 *
 * 1. detectCrisis scores the caller's message:
 *    - explicit (0.9): current intent, plan, means, an attempt, or ongoing self-harm
 *    - passive (0.75): passive ideation, preparatory behavior, a risk to someone
 *      else, and explicit language softened by a joke, a condition or the past
 *    - implicit (0.6): hopelessness, burdensomeness, withdrawal; two distinct
 *      implicit signals in one message, or one after earlier distress in the
 *      session, count as passive
 *    Voice distress amplifies a text signal; on its own it never makes a crisis.
 * 2. guardPreResponse replaces the reply with a pre-written one that includes
 *    988 resources when severity >= 0.85.
 *
 * Below that threshold a crisis reaches the LLM as injected guidance
 * (buildCrisisGuidance); nothing inspects or rewrites the reply afterwards.
 *
 * services/safety/crisis-detection.ts delegates suicide and self-harm to this
 * module, so the prompt context and the override always agree.
 *
 * @module CrisisGuard
 */

import { createLogger } from '../../utils/safe-logger.js';
import { endingFloor } from './crisis-ending-floor.js';
import { EMERGENCY_FOR_THEM, getCrisisResponse, IN_DANGER_NOW } from './crisis-guard-replies.js';
import { meansFormsOf, meansInHandRead, resolveMeansInHandMode } from './crisis-means-in-hand.js';
import { explicitModifier, normalize } from './crisis-modifiers.js';
import {
  HIGH_DISTRESS_VOICE_EMOTIONS,
  MODERATE_DISTRESS_VOICE_EMOTIONS,
  replacesReply,
  SEVERITY,
} from './crisis-severity.js';
import { thirdPartyEmergency } from './crisis-third-person.js';
import { whoGuidance } from './crisis-who-guidance.js';
import {
  EXPLICIT_CRISIS_PATTERNS,
  IMPLICIT_DISTRESS_PATTERNS,
  PASSIVE_IDEATION_PATTERNS,
  PLAN_OR_MEANS_PATTERNS,
  SESSION_CONTEXT_PATTERNS,
  THIRD_PARTY_PATTERNS,
} from './crisis-patterns.js';

const log = createLogger({ module: 'CrisisGuard' });

// TYPES

export interface VoiceEmotionContext {
  primary: string;
  intensity: number;
  confidence?: number;
}

export interface CrisisGuardResult {
  /** If true, block the response entirely and use replacement */
  shouldBlock: boolean;
  /** Reason for blocking (for logging) */
  reason?: string;
  /** Complete replacement response (if shouldBlock is true) */
  replacementResponse?: string;
  /** Detected crisis severity (0-1) */
  crisisSeverity: number;
  /** Whether this is a crisis situation */
  isCrisis: boolean;
}

/** Who is at risk: the caller, someone the caller is worried about, or no one now (a grieving caller, crisis-who.ts). */
export type CrisisSubject = 'self' | 'third_party' | 'bereaved';

export interface CrisisDetectionResult {
  isCrisis: boolean;
  severity: number;
  indicators: string[];
  /** Set when any text signal matched. */
  subject?: CrisisSubject;
  /** 'es' when the crisis language matched was Spanish. */
  language?: 'en' | 'es';
  suggestedResponse?: string;
}

export interface CrisisDetectionOptions {
  /**
   * The caller's earlier messages this session, oldest first. A copy of the
   * current message is ignored, so userData.recentTranscripts can be passed as is.
   */
  recentMessages?: readonly string[];
  /** Overrides CRISIS_MEANS_IN_HAND for this read; 'all' is the shadow log's (crisis-means-shadow.ts). */
  meansInHand?: 'off' | 'shadow' | 'live' | 'all';
}

export const CRISIS_SEVERITY = SEVERITY; // the tiers, for callers that weigh a read (caller-text.ts)

export { IN_DANGER_NOW }; // its home is crisis-guard-replies.ts

// CRISIS DETECTION

interface TextScore {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  language?: 'en' | 'es';
  implicitHits: number;
  contextHit: boolean;
  /** The caller's own ending words, negated, recovered or hyperbole only ("I would never …"). */
  softSelf: boolean;
  /** What this turn counts for in a later turn's session check: its self read as before #2528. */
  sessionSeverity: number;
}

/** Score one message from its words alone. */
function scoreText(text: string, forms: ReturnType<typeof meansFormsOf>): TextScore {
  const indicators: string[] = [];
  let severity = 0;
  let implicitHits = 0;
  let language: 'en' | 'es' | undefined;
  const add = (indicator: string, level: number): void => {
    if (!indicators.includes(indicator)) indicators.push(indicator);
    severity = Math.max(severity, level);
  };

  // Spans already softened: a second pattern matching the same words
  // ("want to unalive myself" / "unalive myself") inherits the softening.
  const softened: [number, number][] = [];
  let thirdPartyHit = false;
  let softSelf = false;
  let tierSoft = false;
  let hardSelf = false;
  for (const { re, tag, imminent } of EXPLICIT_CRISIS_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (softened.some(([s, e]) => start < e && end > s)) continue;
    const modifier = explicitModifier(text, start, end, imminent === true);
    if (modifier) softened.push([start, end]);
    if (modifier === 'third_party') {
      thirdPartyHit = true;
      continue;
    }
    if (tag === 'self_harm') add('self_harm', 0);
    if (/quiero|matar|suicidar|vivir/.test(match[0])) language = 'es';
    if (modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered') {
      add(`${modifier}_crisis_language`, 0);
      implicitHits++;
      softSelf = tierSoft = true;
    } else if (modifier) {
      add(modifier === 'history' ? 'crisis_history' : `${modifier}_frame`, SEVERITY.passive);
      hardSelf = true;
    } else {
      hardSelf = true;
      add('explicit_crisis_language', SEVERITY.explicit);
      if (imminent) add('imminent_danger', SEVERITY.explicit);
      break;
    }
  }

  // The floor (#2525), escalate-only: first-person ending words whatever comes before them
  // ("I might", "before I", "until I"), softened exactly as the patterns above are. Words a
  // pattern above already softened keep that softening.
  const floor = severity < SEVERITY.explicit ? endingFloor(text, softened) : null;
  if (floor) {
    const { modifier } = floor;
    if (floor.thirdParty) thirdPartyHit = true;
    if (modifier === 'third_party') thirdPartyHit = true;
    else if (modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered') {
      add(`${modifier}_crisis_language`, 0);
      implicitHits++;
      softSelf = true;
    } else if (modifier) {
      add(modifier === 'history' ? 'crisis_history' : `${modifier}_frame`, SEVERITY.passive);
      hardSelf = true;
    } else {
      hardSelf = true;
      add('explicit_crisis_language', SEVERITY.explicit);
    }
  }

  for (const { re, tag } of PASSIVE_IDEATION_PATTERNS) {
    if (re.test(text)) {
      hardSelf = true;
      add('passive_ideation', SEVERITY.passive);
      if (tag === 'self_harm') add('self_harm', 0);
      break;
    }
  }

  const softenedHits = implicitHits;
  implicitHits += IMPLICIT_DISTRESS_PATTERNS.filter((p) => p.test(text)).length;
  if (implicitHits > 0) add('implicit_distress', SEVERITY.implicit);
  if (implicitHits >= 2) add('compounded_distress', SEVERITY.passive);

  // A negation or idiom alone ("I'd never take the pills I have") is not a
  // signal a plan can escalate.
  const genuineSignal = severity >= SEVERITY.passive || implicitHits > softenedHits;
  if (
    genuineSignal &&
    severity < SEVERITY.explicit &&
    PLAN_OR_MEANS_PATTERNS.some((p) => p.test(text))
  ) {
    hardSelf = true;
    add('plan_or_means', SEVERITY.explicit);
  }

  // CRISIS_MEANS_IN_HAND (#2697): a live form reads 911; 'all' (the shadow log) names the form.
  const means = meansInHandRead(text, indicators, softened, forms, (from, to) =>
    endingOutside(text, from, to)
  );
  if (means) {
    hardSelf = true;
    if (means.tag === 'self_harm') add('self_harm', 0);
    if (forms === 'all') add(`means_form:${means.form}`, 0);
    add('explicit_crisis_language', SEVERITY.explicit);
    add('imminent_danger', SEVERITY.explicit);
  }

  // A worry about someone else outranks the caller's own words only when those are negated,
  // recovered or hyperbole ("my brother keeps talking about killing himself. I would never kill
  // myself"): the third-party read is never lowered. Joking, conditional, hedged or past words
  // stay the caller's (#2528).
  if (implicitHits > softenedHits) hardSelf = true;
  const selfSeverity = severity;
  let subject: CrisisSubject | undefined = severity > 0 ? 'self' : undefined;
  const thirdParty = thirdPartyHit || THIRD_PARTY_PATTERNS.some((p) => p.test(text));
  if (thirdParty && (!subject || !hardSelf)) {
    add('third_party_risk', SEVERITY.passive);
    subject = 'third_party';
  }
  // Someone else down and not getting up (owner, 2026-11-02): imminent, 911 for them.
  if (thirdPartyEmergency(text) && (!subject || !hardSelf)) {
    for (const tag of ['third_party_risk', 'third_party_emergency', 'imminent_danger'])
      add(tag, SEVERITY.explicit);
    subject = 'third_party';
  }

  const contextHit = SESSION_CONTEXT_PATTERNS.some((p) => p.test(text));
  // A worry about someone else beside the caller's own softened tier words was the caller's own
  // turn before #2528, and still counts as one in a later turn's session check.
  const sessionSeverity = subject === 'self' ? severity : tierSoft ? selfSeverity : 0;
  const found = { severity, indicators, subject, language, implicitHits, contextHit };
  return { ...found, softSelf, sessionSeverity };
}

/** The caller's own ending words, said or framed: not negated, past, protective or someone else's. */
const ENDING_SAID = [
  'explicit_crisis_language',
  'joking_frame',
  'conditional_frame',
  'hedged_frame',
  'passive_ideation',
];
/** Ending words in the turn outside [from, to): those words blanked, the rest read on its own. */
function endingOutside(text: string, from: number, to: number): boolean {
  const rest = text.slice(0, from) + text.slice(from, to).replace(/[^.!?]/g, ' ') + text.slice(to);
  const { indicators } = scoreText(rest, 'none');
  return ENDING_SAID.some((indicator) => indicators.includes(indicator));
}

/** What one earlier message counts for in a later turn's session check (crisis-who.ts reads it too). */
export const sessionSeverityOf = (message: string): number =>
  scoreText(normalize(message), meansFormsOf(resolveMeansInHandMode())).sessionSeverity;

/** Detect crisis indicators in user message */
export function detectCrisis(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext,
  options?: CrisisDetectionOptions
): CrisisDetectionResult {
  const text = normalize(userMessage);
  const forms = meansFormsOf(options?.meansInHand ?? resolveMeansInHandMode());
  const score = scoreText(text, forms);
  const indicators = [...score.indicators];
  let { severity, subject } = score;

  // Session trajectory: earlier distress turns a weak or contextual signal now
  // into a crisis ("Soon none of this will matter" after "I'm a burden").
  const prior = (options?.recentMessages ?? [])
    .map(normalize)
    .filter((m) => m.length > 0 && m !== text)
    .slice(-5)
    .map((m) => scoreText(m, forms).sessionSeverity);
  const priorPeak = Math.max(0, ...prior);
  const priorDistressTurns = prior.filter((v) => v >= SEVERITY.implicit).length;
  const signalNow = (subject === 'self' && severity >= SEVERITY.implicit) || score.contextHit;
  if (signalNow && (priorPeak >= SEVERITY.passive || priorDistressTurns >= 2)) {
    indicators.push('session_escalation');
    severity = Math.max(severity, SEVERITY.passive);
    subject = 'self';
  }

  // Voice amplifies what the words say; on its own it is a reason to check in,
  // not a crisis. The 988 script is for the caller, so a worry about someone
  // else never escalates into it.
  const textSeverity = severity;
  // A worry about someone else, with the caller's own softened ending words and a distressed
  // voice: the voice makes it about the caller again, as before #2528.
  const voiced = voiceEmotion?.confidence !== undefined && voiceEmotion.confidence > 0.5;
  if (subject === 'third_party' && score.softSelf && voiced) {
    const { primary } = voiceEmotion;
    const distressed = [...HIGH_DISTRESS_VOICE_EMOTIONS, ...MODERATE_DISTRESS_VOICE_EMOTIONS];
    if (distressed.includes(primary)) subject = 'self';
  }
  const emergency = subject === 'third_party' && indicators.includes('third_party_emergency');
  const ceiling = subject === 'third_party' ? SEVERITY.block - 0.05 : 1.0;
  if (voiceEmotion?.confidence !== undefined && voiceEmotion.confidence > 0.5) {
    const high = HIGH_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary);
    const moderate = MODERATE_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary);
    if (high) {
      indicators.push('voice_high_distress');
      severity = textSeverity > 0 ? Math.max(severity, SEVERITY.block) : Math.max(severity, 0.5);
    } else if (moderate && textSeverity > 0.3) {
      indicators.push('voice_moderate_distress');
      severity = Math.min(1.0, severity + 0.15);
    }
    if ((high || moderate) && voiceEmotion.intensity > 0.8 && textSeverity > 0.3) {
      severity = Math.min(1.0, severity + 0.1);
      indicators.push('high_voice_intensity');
    }
  }
  severity = Math.min(severity, Math.max(ceiling, textSeverity));

  const isCrisis = severity >= SEVERITY.crisis;

  return {
    isCrisis,
    severity,
    indicators,
    subject,
    language: subject ? (score.language ?? 'en') : undefined,
    suggestedResponse: !isCrisis
      ? undefined
      : emergency
        ? EMERGENCY_FOR_THEM
        : getCrisisResponse(
            severity,
            subject,
            score.language,
            indicators.includes('imminent_danger')
          ),
  };
}

/**
 * Instructions for the LLM when a crisis is detected but the reply is not
 * replaced. Tailored to who is at risk and how the risk was voiced.
 */
export function buildCrisisGuidance(crisis: CrisisDetectionResult): string {
  const header = `[CRITICAL - USER SAFETY]
Crisis indicators detected (severity: ${(crisis.severity * 100).toFixed(0)}%).
Indicators: ${crisis.indicators.join(', ')}`;
  const who = whoGuidance(crisis, header); // THIRD_PARTY_SELF_HARM routes, never set when off
  if (who) return who;
  if (crisis.subject === 'third_party') {
    return `${header}

The user is worried that someone they know is at risk. Your response MUST:
1. Take their worry seriously and thank them for caring
2. Help them think about how to check on the person directly and calmly
3. Tell them they can call or text 988 on the person's behalf, and to call 911 if there is immediate danger
4. Ask how THEY are holding up; supporting someone in crisis is hard
5. NEVER treat the user as the one at risk unless they say so`;
  }

  const lines = [
    '1. Acknowledge their pain with genuine empathy',
    '2. Create space for them to share (without pressure)',
    '3. Include the 988 Suicide & Crisis Lifeline (call or text 988)',
    '4. NEVER be dismissive or use platitudes like "it\'ll be okay"',
    '5. NEVER minimize their feelings',
  ];
  if (crisis.indicators.includes('joking_frame')) {
    lines.push(
      '6. They may be joking. Check in once, warmly and directly ("hey, I know that was a joke, but are you actually okay?"). Do not lecture, and drop it if they say they are fine'
    );
  }
  if (crisis.indicators.includes('crisis_history')) {
    lines.push('6. They mentioned a past crisis. Ask gently whether any of it is coming back now');
  }
  if (crisis.language === 'es') {
    lines.push('7. Reply in Spanish. 988 offers Spanish: call and press 2, or text AYUDA to 988');
  }

  return `${header}

Your response MUST:
${lines.join('\n')}

You are their lifeline right now. Be fully present.`;
}

/** The classifier's verdict, as crisis-classifier.ts returns it. */
export interface ClassifierVerdictLike {
  risk: 'imminent' | 'crisis' | 'none';
  subject: 'self' | 'third_party';
}

/**
 * Merge the semantic classifier's verdict into a pattern detection. It only
 * escalates: the patterns are precise, the classifier catches what they miss.
 * A missing verdict (timeout, error) leaves the detection unchanged.
 */
export function applyClassifierVerdict(
  crisis: CrisisDetectionResult,
  verdict: ClassifierVerdictLike | null
): CrisisDetectionResult {
  if (!verdict || verdict.risk === 'none') return crisis;

  const thirdParty = verdict.subject === 'third_party' && crisis.subject !== 'self';
  const subject: CrisisSubject = thirdParty ? 'third_party' : 'self';
  const imminent = verdict.risk === 'imminent' && !thirdParty;
  const target = imminent ? SEVERITY.explicit : SEVERITY.passive;
  if (crisis.severity >= target && crisis.subject === subject) return crisis;

  const severity = Math.max(crisis.severity, target);
  const indicators = [...crisis.indicators, `classifier_${verdict.risk}`];
  if (imminent && !indicators.includes('imminent_danger')) indicators.push('imminent_danger');
  if (thirdParty && !indicators.includes('third_party_risk')) indicators.push('third_party_risk');
  const alreadyImminent = crisis.indicators.includes('imminent_danger');
  return {
    ...crisis,
    isCrisis: true,
    severity,
    indicators,
    subject,
    language: crisis.language ?? 'en',
    suggestedResponse: getCrisisResponse(
      severity,
      subject,
      crisis.language,
      imminent || alreadyImminent
    ),
  };
}

// PRE-RESPONSE GUARD

/** The pre-response decision for an already computed detection. */
export function guardFromDetection(crisis: CrisisDetectionResult): CrisisGuardResult {
  if (replacesReply(crisis)) {
    // Severe crisis - override with crisis response
    log.warn(
      {
        severity: crisis.severity,
        indicators: crisis.indicators,
      },
      '🚨 CRISIS DETECTED - Overriding response'
    );

    return {
      shouldBlock: true,
      reason: `Crisis detected (severity: ${crisis.severity.toFixed(2)})`,
      replacementResponse: crisis.suggestedResponse,
      crisisSeverity: crisis.severity,
      isCrisis: true,
    };
  }

  return {
    shouldBlock: false,
    crisisSeverity: crisis.severity,
    isCrisis: crisis.isCrisis,
  };
}

/**
 * Guard that runs BEFORE LLM generates response
 *
 * Checks user message for crisis indicators.
 * If crisis detected, may provide replacement response.
 */
export function guardPreResponse(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext,
  options?: CrisisDetectionOptions
): CrisisGuardResult {
  return guardFromDetection(detectCrisis(userMessage, voiceEmotion, options));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { detectCrisis, guardPreResponse, guardFromDetection, buildCrisisGuidance };
