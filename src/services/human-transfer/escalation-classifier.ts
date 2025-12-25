/**
 * Escalation Classifier
 *
 * > "Better than human means knowing when a human is needed."
 *
 * Determines when and where to transfer to human help.
 * Integrates with existing crisis detection from emotional-first-aid.ts
 *
 * @module services/human-transfer/escalation-classifier
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  EscalationType,
  EscalationDecision,
  CrisisSignals,
  TransferUrgency,
  TransferChannel,
} from './types.js';

const log = createLogger({ module: 'escalation-classifier' });

// ============================================================================
// SIGNAL DETECTION PATTERNS
// ============================================================================

const SUICIDAL_PATTERNS = [
  /\bi (want to|wanna|planning to|going to) (die|end it|end it all|kill myself)/i,
  /\bi (don't|do not|can't|cannot) want to (be here|live|exist|go on)/i,
  /\b(what('s| is) the point|there('s| is) no point|no point (in|anymore))/i,
  /\bi('m| am) going to (hurt|harm|kill) myself/i,
  /\bi('ve| have) been thinking about (suicide|ending it)/i,
  /\bno one would (miss me|care if i)/i,
  /\beveryone would be better off without me/i,
  /\bend(ing)? (it|my life|everything)/i,
];

const SELF_HARM_PATTERNS = [
  /\bi (cut|burn|hurt) myself/i,
  /\bi want to (cut|burn|hurt) myself/i,
  /\bself[- ]?harm/i,
  /\bi('ve| have) been (cutting|burning|hurting)/i,
];

const TRAUMA_PATTERNS = [
  /\b(ptsd|post[- ]?traumatic)/i,
  /\bi was (abused|assaulted|raped|molested)/i,
  /\bflashbacks?\b/i,
  /\bnightmares? about (the|what happened)/i,
  /\bi can't stop thinking about (the|what happened)/i,
];

const PERSISTENT_DEPRESSION_PATTERNS = [
  /\bi('ve| have) been (depressed|sad|hopeless|feeling depressed|feeling sad) for (weeks|months|years)/i,
  /\b(depressed|sad|hopeless) for (weeks|months|years)/i,
  /\bnothing (helps|works|makes it better|ever gets better)/i,
  /\bi('ve| have) tried (everything|therapy|medication)/i,
  /\bi (can't|cannot|can not) (get out of bed|function|do anything)/i,
  /\bi('ve| have) lost interest in (everything|all|anything)/i,
  /\bcan('t|not| not) function/i,
];

const ANXIETY_DISORDER_PATTERNS = [
  /\bconstant (anxiety|panic|worry)/i,
  /\bi can't (leave the house|go outside|be around people)/i,
  /\bpanic attacks? (every|multiple|daily)/i,
  /\bi('m| am) (terrified|paralyzed) (of|by)/i,
  /\bobsessive thoughts?/i,
  /\bcompulsive (behaviors?|rituals?)/i,
];

const PSYCHOTIC_PATTERNS = [
  /\bi (hear|see) (voices|things|people) that/i,
  /\bthey('re| are) (watching|following|controlling) me/i,
  /\bi('m| am) (chosen|special|the only one)/i,
  /\breality (doesn't|isn't) (real|what it seems)/i,
];

const DOMESTIC_VIOLENCE_PATTERNS = [
  /\b(he|she|they|my partner|my spouse|my husband|my wife) (hit|hits|hurt|hurts|beat|beats|choked|chokes|threatened|threatens) me/i,
  /\bi('m| am) (afraid|scared) (of|to go home|to leave)/i,
  /\bi can't leave (because|or)/i,
  /\b(he|she|they) (control|controls|monitor|monitors|track|tracks|isolate|isolates)/i,
  /\b(physical|emotional|domestic) abuse/i,
];

const SUBSTANCE_CRISIS_PATTERNS = [
  /\bi('m| am) (high|drunk|using) right now/i,
  /\bi (can't|cannot) stop (drinking|using|taking)/i,
  /\bi('m| am) (in|going through) (withdrawal|detox)/i,
  /\bi (overdosed|od'd|took too much)/i,
];

const MEDICAL_EMERGENCY_PATTERNS = [
  /\bi('m| am) having (chest pain|a heart attack|a stroke)/i,
  /\bi can't (breathe|see|feel|move)/i,
  /\bi('m| am) (bleeding|losing blood)/i,
  /\bi think i('m| am) (dying|having a medical emergency)/i,
];

const LEGAL_PATTERNS = [
  /\bi('m| am) being (sued|arrested|evicted)/i,
  /\bi need (a lawyer|legal help|legal advice)/i,
  /\bi('m| am) in trouble with (the law|police|court)/i,
  /\bcustody (battle|dispute|hearing)/i,
];

const FINANCIAL_CRISIS_PATTERNS = [
  /\bi('m| am) (losing|about to lose) my (home|house|apartment)/i,
  /\bi can't (pay|afford) (rent|bills|food)/i,
  /\bi('m| am) (bankrupt|broke|homeless)/i,
  /\bgoing to be (evicted|on the street)/i,
];

const PROFESSIONAL_HELP_PATTERNS = [
  /\b(need|want) to (talk to|see|speak with) (a|someone) (professional|therapist|counselor|psychiatrist)/i,
  /\bmy therapist (retired|left|moved|quit|stopped)/i,
  /\bi need (professional|real|actual) help/i,
  /\b(looking for|searching for|need) a (therapist|counselor|psychiatrist)/i,
  /\brecommend (a|any) (therapist|counselor|psychiatrist)/i,
];

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

/**
 * Detect crisis signals from transcript text
 */
export function detectCrisisSignals(transcript: string): CrisisSignals {
  const signals: CrisisSignals = {
    severity: 0,
    suicidalIdeation: false,
    selfHarmIndicators: false,
    traumaIndicators: false,
    persistentDepression: false,
    anxietyDisorder: false,
    dangerToOthers: false,
    domesticViolence: false,
    childSafetyConcern: false,
    psychoticSymptoms: false,
    substanceCrisis: false,
    medicalEmergency: false,
    legalEmergency: false,
    financialCrisis: false,
    professionalHelpRequest: false,
    rawSignals: [],
  };

  const text = transcript.toLowerCase();

  // Check each pattern category
  for (const pattern of SUICIDAL_PATTERNS) {
    if (pattern.test(text)) {
      signals.suicidalIdeation = true;
      signals.rawSignals.push(`suicidal: ${pattern.source}`);
    }
  }

  for (const pattern of SELF_HARM_PATTERNS) {
    if (pattern.test(text)) {
      signals.selfHarmIndicators = true;
      signals.rawSignals.push(`self-harm: ${pattern.source}`);
    }
  }

  for (const pattern of TRAUMA_PATTERNS) {
    if (pattern.test(text)) {
      signals.traumaIndicators = true;
      signals.rawSignals.push(`trauma: ${pattern.source}`);
    }
  }

  for (const pattern of PERSISTENT_DEPRESSION_PATTERNS) {
    if (pattern.test(text)) {
      signals.persistentDepression = true;
      signals.rawSignals.push(`depression: ${pattern.source}`);
    }
  }

  for (const pattern of ANXIETY_DISORDER_PATTERNS) {
    if (pattern.test(text)) {
      signals.anxietyDisorder = true;
      signals.rawSignals.push(`anxiety: ${pattern.source}`);
    }
  }

  for (const pattern of PSYCHOTIC_PATTERNS) {
    if (pattern.test(text)) {
      signals.psychoticSymptoms = true;
      signals.rawSignals.push(`psychotic: ${pattern.source}`);
    }
  }

  for (const pattern of DOMESTIC_VIOLENCE_PATTERNS) {
    if (pattern.test(text)) {
      signals.domesticViolence = true;
      signals.rawSignals.push(`dv: ${pattern.source}`);
    }
  }

  for (const pattern of SUBSTANCE_CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      signals.substanceCrisis = true;
      signals.rawSignals.push(`substance: ${pattern.source}`);
    }
  }

  for (const pattern of MEDICAL_EMERGENCY_PATTERNS) {
    if (pattern.test(text)) {
      signals.medicalEmergency = true;
      signals.rawSignals.push(`medical: ${pattern.source}`);
    }
  }

  for (const pattern of LEGAL_PATTERNS) {
    if (pattern.test(text)) {
      signals.legalEmergency = true;
      signals.rawSignals.push(`legal: ${pattern.source}`);
    }
  }

  for (const pattern of FINANCIAL_CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      signals.financialCrisis = true;
      signals.rawSignals.push(`financial: ${pattern.source}`);
    }
  }

  for (const pattern of PROFESSIONAL_HELP_PATTERNS) {
    if (pattern.test(text)) {
      signals.professionalHelpRequest = true;
      signals.rawSignals.push(`professional-help: ${pattern.source}`);
    }
  }

  // Check for child safety concerns
  if (
    /\b(hurt|harm|abuse|hit|beat|molest|inappropriate).*(child|kid|son|daughter|baby)/i.test(text)
  ) {
    signals.childSafetyConcern = true;
    signals.rawSignals.push('child-safety');
  }

  // Check for danger to others
  if (/\bi (want to|going to|will) (hurt|harm|kill) (them|him|her|someone)/i.test(text)) {
    signals.dangerToOthers = true;
    signals.rawSignals.push('danger-to-others');
  }

  // Calculate severity score
  signals.severity = calculateSeverity(signals);

  return signals;
}

/**
 * Calculate overall severity score (1-10)
 */
function calculateSeverity(signals: CrisisSignals): number {
  let score = 0;

  // Immediate life-threatening (10)
  if (signals.suicidalIdeation) score = Math.max(score, 9);
  if (signals.dangerToOthers) score = Math.max(score, 10);
  if (signals.medicalEmergency) score = Math.max(score, 10);

  // High severity (7-8)
  if (signals.selfHarmIndicators) score = Math.max(score, 8);
  if (signals.psychoticSymptoms) score = Math.max(score, 8);
  if (signals.domesticViolence) score = Math.max(score, 8);
  if (signals.childSafetyConcern) score = Math.max(score, 9);
  if (signals.substanceCrisis) score = Math.max(score, 7);

  // Moderate severity (5-6)
  if (signals.traumaIndicators) score = Math.max(score, 6);
  if (signals.persistentDepression) score = Math.max(score, 6);
  if (signals.anxietyDisorder) score = Math.max(score, 5);

  // Lower severity (3-4)
  if (signals.legalEmergency) score = Math.max(score, 4);
  if (signals.financialCrisis) score = Math.max(score, 4);

  return score;
}

// ============================================================================
// ESCALATION CLASSIFICATION
// ============================================================================

/**
 * Classify what type of escalation is needed
 */
export function classifyEscalation(
  signals: CrisisSignals,
  conversationContext?: string
): EscalationDecision {
  // IMMEDIATE CRISIS - Call 911 or crisis line NOW
  if (signals.severity >= 9 || signals.medicalEmergency || signals.dangerToOthers) {
    return {
      type: 'crisis_immediate',
      urgency: 'immediate',
      reason: getImmediateCrisisReason(signals),
      confidence: 1.0,
      suggestedService: signals.medicalEmergency ? '911 Emergency Services' : '988 Suicide & Crisis Lifeline',
      suggestedChannel: 'direct_call',
      safetyFlags: extractSafetyFlags(signals),
    };
  }

  // CRISIS SUPPORT - 988, Crisis Text Line
  if (signals.suicidalIdeation || signals.selfHarmIndicators || signals.severity >= 7) {
    return {
      type: 'crisis_support',
      urgency: 'immediate',
      reason: 'Active crisis indicators detected - professional crisis support needed',
      confidence: 0.95,
      suggestedService: '988 Suicide & Crisis Lifeline',
      suggestedChannel: 'direct_call',
      safetyFlags: extractSafetyFlags(signals),
    };
  }

  // PSYCHIATRY - Medication evaluation needed
  if (signals.psychoticSymptoms) {
    return {
      type: 'psychiatry',
      urgency: 'soon',
      reason: 'Symptoms suggest psychiatric evaluation would be beneficial',
      confidence: 0.85,
      suggestedService: 'Psychiatric evaluation',
      suggestedChannel: 'referral_link',
      safetyFlags: extractSafetyFlags(signals),
    };
  }

  // DOMESTIC VIOLENCE - Specialized support
  if (signals.domesticViolence) {
    return {
      type: 'crisis_support',
      urgency: 'soon',
      reason: 'Domestic violence situation - specialized support available',
      confidence: 0.9,
      suggestedService: 'National Domestic Violence Hotline: 1-800-799-7233',
      suggestedChannel: 'direct_call',
      safetyFlags: extractSafetyFlags(signals),
    };
  }

  // THERAPY - Professional mental health support
  if (
    signals.traumaIndicators ||
    signals.persistentDepression ||
    signals.anxietyDisorder ||
    signals.severity >= 5
  ) {
    return {
      type: 'therapy',
      urgency: 'when_ready',
      reason: getTherapyReason(signals),
      confidence: 0.8,
      suggestedService: 'Licensed therapist',
      suggestedChannel: 'referral_link',
    };
  }

  // SUBSTANCE SUPPORT
  if (signals.substanceCrisis) {
    return {
      type: 'therapy',
      urgency: 'soon',
      reason: 'Substance use concerns - specialized support available',
      confidence: 0.85,
      suggestedService: 'SAMHSA Helpline: 1-800-662-4357',
      suggestedChannel: 'direct_call',
    };
  }

  // LEGAL
  if (signals.legalEmergency) {
    return {
      type: 'legal',
      urgency: 'when_ready',
      reason: 'Legal situation requires professional legal advice',
      confidence: 0.75,
      suggestedService: 'Legal aid or attorney',
      suggestedChannel: 'referral_link',
    };
  }

  // FINANCIAL
  if (signals.financialCrisis) {
    return {
      type: 'financial',
      urgency: 'when_ready',
      reason: 'Financial crisis - professional guidance may help',
      confidence: 0.7,
      suggestedService: '211 for emergency assistance',
      suggestedChannel: 'referral_link',
    };
  }

  // EXPLICIT PROFESSIONAL HELP REQUEST
  if (signals.professionalHelpRequest) {
    return {
      type: 'therapy',
      urgency: 'when_ready',
      reason: 'User is explicitly seeking professional help',
      confidence: 0.9,
      suggestedService: 'Licensed therapist or counselor',
      suggestedChannel: 'referral_link',
    };
  }

  // FERNI CAN HANDLE
  return {
    type: 'none',
    urgency: 'informational',
    reason: 'Within life coaching scope',
    confidence: 0.8,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getImmediateCrisisReason(signals: CrisisSignals): string {
  if (signals.medicalEmergency) return 'Medical emergency detected - immediate professional help needed';
  if (signals.dangerToOthers) return 'Safety concern for others - professional intervention needed';
  if (signals.suicidalIdeation) return 'Active crisis detected - trained crisis counselors available 24/7';
  if (signals.childSafetyConcern) return 'Child safety concern - professional intervention needed';
  return 'Immediate crisis support needed';
}

function getTherapyReason(signals: CrisisSignals): string {
  if (signals.traumaIndicators) {
    return 'Trauma indicators suggest specialized therapy (EMDR, trauma-focused CBT) could help';
  }
  if (signals.persistentDepression) {
    return 'Persistent depression may benefit from professional therapeutic support';
  }
  if (signals.anxietyDisorder) {
    return 'Anxiety patterns suggest therapy could provide lasting relief';
  }
  return 'Professional mental health support could be beneficial';
}

function extractSafetyFlags(signals: CrisisSignals): EscalationDecision['safetyFlags'] {
  return {
    suicidalIdeation: signals.suicidalIdeation,
    selfHarm: signals.selfHarmIndicators,
    dangerToOthers: signals.dangerToOthers,
    domesticViolence: signals.domesticViolence,
    childSafety: signals.childSafetyConcern,
  };
}

// ============================================================================
// CONTEXT-AWARE CLASSIFICATION
// ============================================================================

/**
 * Enhanced classification with conversation history
 */
export function classifyWithContext(
  currentTranscript: string,
  conversationHistory: string[],
  userProfile?: {
    hasTherapist?: boolean;
    inTreatment?: boolean;
    knownDiagnoses?: string[];
    safetyPlanExists?: boolean;
  }
): EscalationDecision {
  // Detect signals from current transcript
  const currentSignals = detectCrisisSignals(currentTranscript);

  // Also check recent conversation history for patterns
  const recentText = conversationHistory.slice(-5).join(' ');
  const historicalSignals = detectCrisisSignals(recentText);

  // Merge signals (current takes precedence for severity)
  const mergedSignals: CrisisSignals = {
    ...historicalSignals,
    ...currentSignals,
    severity: Math.max(currentSignals.severity, historicalSignals.severity * 0.8),
    rawSignals: [...currentSignals.rawSignals, ...historicalSignals.rawSignals],
  };

  // Get base decision
  const decision = classifyEscalation(mergedSignals);

  // Adjust based on user profile
  if (userProfile) {
    // If they already have a therapist and it's therapy-level, suggest contacting their therapist
    if (decision.type === 'therapy' && userProfile.hasTherapist) {
      decision.suggestedService = 'Your current therapist';
      decision.reason = 'This might be worth discussing with your therapist';
    }

    // If they have a safety plan and it's crisis-level, remind them
    if (
      (decision.type === 'crisis_support' || decision.type === 'crisis_immediate') &&
      userProfile.safetyPlanExists
    ) {
      decision.contextForHuman = 'User has an existing safety plan';
    }
  }

  log.info(
    {
      severity: mergedSignals.severity,
      type: decision.type,
      urgency: decision.urgency,
      signalCount: mergedSignals.rawSignals.length,
    },
    'Escalation classified'
  );

  return decision;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const escalationClassifier = {
  detectCrisisSignals,
  classifyEscalation,
  classifyWithContext,
};

