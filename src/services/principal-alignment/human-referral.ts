/**
 * Human Referral System
 *
 * > "Principal alignment sometimes means saying 'I'm not the right support for this.'"
 *
 * This system identifies situations where the user should talk to a human professional
 * instead of (or in addition to) Ferni. A truly principal-aligned agent knows its limits.
 *
 * Key insight: Over-helping is a form of harm when it prevents someone from getting real help.
 *
 * @module @ferni/principal-alignment/human-referral
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  HumanReferralResult,
  ReferralReason,
  ReferralResource,
  ReferralTarget,
} from './types.js';

const log = createLogger({ module: 'HumanReferral' });

// ============================================================================
// REFERRAL PATTERNS
// ============================================================================

/**
 * Patterns that trigger immediate referral consideration
 */
const REFERRAL_TRIGGERS: Array<{
  pattern: RegExp;
  reason: ReferralReason;
  target: ReferralTarget;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  confidence: number;
}> = [
  // Crisis - IMMEDIATE
  {
    pattern:
      /(?:want to|going to|thinking about|considered?) (?:kill|end) (?:myself|my life|it all)/i,
    reason: 'suicidal_ideation',
    target: 'crisis_line',
    urgency: 'immediate',
    confidence: 0.95,
  },
  {
    pattern: /(?:suicide|suicidal|don't want to (?:live|be alive|exist))/i,
    reason: 'suicidal_ideation',
    target: 'crisis_line',
    urgency: 'immediate',
    confidence: 0.9,
  },
  {
    pattern: /(?:no point|nothing to live for|better off dead)/i,
    reason: 'suicidal_ideation',
    target: 'crisis_line',
    urgency: 'immediate',
    confidence: 0.85,
  },

  // Self-harm - HIGH
  {
    pattern: /(?:cutting|cut) (?:myself|my arms|my legs)/i,
    reason: 'self_harm',
    target: 'therapist',
    urgency: 'high',
    confidence: 0.9,
  },
  {
    pattern: /(?:hurt|harm|injure) myself/i,
    reason: 'self_harm',
    target: 'therapist',
    urgency: 'high',
    confidence: 0.85,
  },
  {
    pattern: /(?:burning|starving|punishing) myself/i,
    reason: 'self_harm',
    target: 'therapist',
    urgency: 'high',
    confidence: 0.85,
  },

  // Abuse - HIGH
  {
    pattern:
      /(?:he|she|they|partner|spouse) (?:hit|hits|beat|beats|hurt|hurts|chokes?|choked?) me/i,
    reason: 'relationship_abuse',
    target: 'domestic_violence_hotline',
    urgency: 'high',
    confidence: 0.9,
  },
  {
    pattern: /(?:afraid of|scared of) (?:my|going home|him|her|them)/i,
    reason: 'relationship_abuse',
    target: 'domestic_violence_hotline',
    urgency: 'high',
    confidence: 0.7,
  },
  {
    pattern: /(?:controls|monitors|won't let) (?:me|my)/i,
    reason: 'relationship_abuse',
    target: 'domestic_violence_hotline',
    urgency: 'high',
    confidence: 0.6,
  },

  // Eating disorders - HIGH
  {
    pattern: /(?:haven't eaten|not eating|stopped eating|can't eat) (?:in|for) (?:days?|a week)/i,
    reason: 'eating_disorder',
    target: 'eating_disorder_specialist',
    urgency: 'high',
    confidence: 0.85,
  },
  {
    pattern: /(?:purging|throwing up|making myself) (?:vomit|throw up)/i,
    reason: 'eating_disorder',
    target: 'eating_disorder_specialist',
    urgency: 'high',
    confidence: 0.9,
  },
  {
    pattern: /(?:binge|binged|binging) (?:and then|then)/i,
    reason: 'eating_disorder',
    target: 'eating_disorder_specialist',
    urgency: 'high',
    confidence: 0.8,
  },

  // Addiction - MEDIUM to HIGH
  {
    pattern:
      /(?:can't stop|addicted to|dependent on|need to have) (?:drinking|drugs|pills|alcohol|cocaine|meth|heroin|opioids)/i,
    reason: 'addiction',
    target: 'addiction_counselor',
    urgency: 'high',
    confidence: 0.85,
  },
  {
    pattern: /(?:withdrawing|withdrawal|detox)/i,
    reason: 'addiction',
    target: 'addiction_counselor',
    urgency: 'high',
    confidence: 0.8,
  },
  {
    pattern: /(?:relapsed|using again|started using)/i,
    reason: 'addiction',
    target: 'addiction_counselor',
    urgency: 'medium',
    confidence: 0.75,
  },

  // Trauma - MEDIUM
  {
    pattern:
      /(?:flashbacks|nightmares|can't stop thinking about) (?:what|the) (?:happened|trauma|assault|abuse)/i,
    reason: 'trauma',
    target: 'therapist',
    urgency: 'medium',
    confidence: 0.8,
  },
  {
    pattern: /(?:sexually|physically|emotionally) (?:assaulted|abused|attacked)/i,
    reason: 'trauma',
    target: 'therapist',
    urgency: 'medium',
    confidence: 0.85,
  },
  {
    pattern: /(?:ptsd|post-traumatic)/i,
    reason: 'trauma',
    target: 'therapist',
    urgency: 'medium',
    confidence: 0.7,
  },

  // Grief - MEDIUM
  {
    pattern: /(?:just|recently) (?:lost|died|passed away)/i,
    reason: 'grief_acute',
    target: 'grief_counselor',
    urgency: 'medium',
    confidence: 0.7,
  },
  {
    pattern: /(?:can't function|can't get out of bed) since (?:they|he|she)/i,
    reason: 'grief_acute',
    target: 'grief_counselor',
    urgency: 'medium',
    confidence: 0.75,
  },

  // Medical - VARIES
  {
    pattern: /(?:symptoms|diagnosed with|doctor said|test results)/i,
    reason: 'medical',
    target: 'doctor',
    urgency: 'medium',
    confidence: 0.5,
  },
  {
    pattern: /(?:medication|prescription|side effects)/i,
    reason: 'medication',
    target: 'doctor',
    urgency: 'medium',
    confidence: 0.6,
  },
  {
    pattern: /(?:chest pain|can't breathe|severe pain)/i,
    reason: 'medical',
    target: 'doctor',
    urgency: 'high',
    confidence: 0.8,
  },

  // Legal - MEDIUM
  {
    pattern: /(?:arrested|charged with|lawsuit|sued|court date)/i,
    reason: 'legal',
    target: 'lawyer',
    urgency: 'medium',
    confidence: 0.7,
  },
  {
    pattern: /(?:custody|divorce|restraining order)/i,
    reason: 'legal',
    target: 'lawyer',
    urgency: 'medium',
    confidence: 0.65,
  },

  // Financial - LOW to MEDIUM
  {
    pattern: /(?:bankruptcy|debt collectors|foreclosure|eviction)/i,
    reason: 'financial_complex',
    target: 'financial_advisor',
    urgency: 'medium',
    confidence: 0.7,
  },
  {
    pattern: /(?:tax|irs|audit)/i,
    reason: 'financial_complex',
    target: 'financial_advisor',
    urgency: 'medium',
    confidence: 0.6,
  },

  // Persistent struggle - LOW
  {
    pattern: /(?:been struggling|struggling for) (?:months|years|a long time)/i,
    reason: 'persistent_struggle',
    target: 'therapist',
    urgency: 'low',
    confidence: 0.6,
  },
  {
    pattern: /(?:nothing works|tried everything|nothing helps)/i,
    reason: 'persistent_struggle',
    target: 'therapist',
    urgency: 'low',
    confidence: 0.55,
  },
];

// ============================================================================
// RESOURCES
// ============================================================================

const REFERRAL_RESOURCES: Record<ReferralTarget, ReferralResource[]> = {
  crisis_line: [
    {
      name: '988 Suicide & Crisis Lifeline',
      type: 'crisis_line',
      phone: '988',
      url: 'https://988lifeline.org',
      description: 'Free, confidential support 24/7 for people in distress',
      available24x7: true,
    },
    {
      name: 'Crisis Text Line',
      type: 'crisis_line',
      phone: 'Text HOME to 741741',
      url: 'https://www.crisistextline.org',
      description: 'Free crisis support via text message',
      available24x7: true,
    },
  ],
  domestic_violence_hotline: [
    {
      name: 'National Domestic Violence Hotline',
      type: 'domestic_violence_hotline',
      phone: '1-800-799-7233',
      url: 'https://www.thehotline.org',
      description: 'Confidential support for those affected by domestic violence',
      available24x7: true,
    },
  ],
  eating_disorder_specialist: [
    {
      name: 'National Eating Disorders Association Helpline',
      type: 'eating_disorder_specialist',
      phone: '1-800-931-2237',
      url: 'https://www.nationaleatingdisorders.org',
      description: 'Support and resources for eating disorder recovery',
    },
  ],
  addiction_counselor: [
    {
      name: 'SAMHSA National Helpline',
      type: 'addiction_counselor',
      phone: '1-800-662-4357',
      url: 'https://www.samhsa.gov/find-help/national-helpline',
      description: 'Free, confidential treatment referrals and information',
      available24x7: true,
    },
  ],
  therapist: [
    {
      name: 'Psychology Today Therapist Finder',
      type: 'therapist',
      url: 'https://www.psychologytoday.com/us/therapists',
      description: 'Search for therapists by location, specialty, and insurance',
    },
  ],
  psychiatrist: [
    {
      name: 'Psychology Today Psychiatrist Finder',
      type: 'psychiatrist',
      url: 'https://www.psychologytoday.com/us/psychiatrists',
      description: 'Find psychiatrists who can prescribe medication',
    },
  ],
  doctor: [
    {
      name: 'Your primary care physician',
      type: 'doctor',
      description: 'Contact your regular doctor or find one through your insurance',
    },
  ],
  lawyer: [
    {
      name: 'American Bar Association Lawyer Referral',
      type: 'lawyer',
      url: 'https://www.americanbar.org/groups/lawyer_referral/',
      description: 'Find a lawyer in your area',
    },
  ],
  financial_advisor: [
    {
      name: 'Certified Financial Planner Board',
      type: 'financial_advisor',
      url: 'https://www.cfp.net/verify-a-cfp-professional',
      description: 'Find a certified financial planner',
    },
  ],
  grief_counselor: [
    {
      name: 'GriefShare',
      type: 'grief_counselor',
      url: 'https://www.griefshare.org',
      description: 'Grief support groups and resources',
    },
  ],
  support_group: [
    {
      name: 'Support Groups Central',
      type: 'support_group',
      url: 'https://www.supportgroupscentral.com',
      description: 'Find local and online support groups for various issues',
    },
  ],
  trusted_friend_or_family: [
    {
      name: 'Reach out to someone you trust',
      type: 'trusted_friend_or_family',
      description: 'Sometimes the best support is someone who knows you well and cares about you',
    },
  ],
};

// ============================================================================
// FRAMINGS
// ============================================================================

const REFERRAL_FRAMINGS: Record<ReferralReason, string[]> = {
  crisis: [
    'I care about you, and right now I think you need support from someone who can be there in person.',
    "What you're going through is too important for me to handle alone. Please reach out to someone who can really help.",
  ],
  suicidal_ideation: [
    "I'm really glad you told me this, and I want you to know there are people trained specifically to help with these feelings who are available right now.",
    'Your life matters. Please talk to someone who can be fully present with you right now.',
  ],
  self_harm: [
    "I'm not the right support for this, but there are people who specialize in helping with exactly what you're experiencing.",
    'You deserve support from someone who can really be there for you through this.',
  ],
  relationship_abuse: [
    "What you're describing concerns me. There are people who specialize in helping with exactly this situation.",
    "You don't have to figure this out alone, and there are people who can help you think through your options safely.",
  ],
  eating_disorder: [
    "This is beyond what I can help with, but there are specialists who really understand what you're going through.",
    'You deserve support from people who specialize in this. Would you be open to reaching out?',
  ],
  addiction: [
    'Recovery is possible, and it usually takes more support than I can provide. There are people who specialize in this.',
    "I believe in you AND I think you need support I can't give. Would you consider reaching out?",
  ],
  trauma: [
    "What you've been through deserves specialized support. A therapist trained in trauma could help you process this.",
    'Healing from trauma is real work, and you deserve someone trained to walk that path with you.',
  ],
  grief_acute: [
    'Grief is too big for words sometimes. Have you considered talking to someone who specializes in grief support?',
    "What you're feeling is a normal response to an abnormal situation. A grief counselor might help.",
  ],
  medical: [
    "I can't give medical advice, but your doctor can. Have you talked to them about this?",
    'This sounds like something to discuss with a medical professional.',
  ],
  medication: [
    'Medication questions are really important to discuss with your prescribing doctor.',
    "I'm not qualified to advise on medication. Please check with your doctor.",
  ],
  legal: [
    "Legal matters need a lawyer's expertise. Have you consulted one?",
    "I'd strongly recommend talking to a lawyer about this.",
  ],
  financial_complex: [
    "This is complex enough that I think you'd benefit from talking to a financial professional.",
    'A certified financial planner could give you much better guidance than I can here.',
  ],
  persistent_struggle: [
    "You've been carrying this for a while. Have you considered talking to a therapist?",
    'Sometimes persistent struggles need a different kind of support. Would you be open to that?',
  ],
  beyond_scope: [
    "I'm not the right support for this. Let me point you toward someone who is.",
    'This is outside what I can help with, but I can suggest who might be better suited.',
  ],
};

// ============================================================================
// CORE ANALYSIS
// ============================================================================

/**
 * Analyze user message for human referral need
 */
export function analyzeReferralNeed(
  userMessage: string,
  context: {
    userId: string;
    previousReferrals?: ReferralReason[];
    sessionSignals?: string[];
    relationshipStage?: string;
  } = { userId: '' }
): HumanReferralResult {
  let highestUrgency: 'low' | 'medium' | 'high' | 'immediate' = 'low';
  let bestMatch: (typeof REFERRAL_TRIGGERS)[0] | null = null;
  let maxConfidence = 0;

  // Check all triggers
  for (const trigger of REFERRAL_TRIGGERS) {
    if (trigger.pattern.test(userMessage)) {
      // Update urgency if higher
      if (urgencyValue(trigger.urgency) > urgencyValue(highestUrgency)) {
        highestUrgency = trigger.urgency;
      }

      // Track best match
      if (trigger.confidence > maxConfidence) {
        maxConfidence = trigger.confidence;
        bestMatch = trigger;
      }
    }
  }

  // If no match found
  if (!bestMatch) {
    return {
      shouldRefer: false,
      urgency: 'low',
      reason: null,
      suggestedTarget: null,
      confidence: 0,
      suggestedFraming: null,
      resources: [],
      shouldFollowUp: false,
    };
  }

  // Don't repeat recent referrals too frequently (except for crisis)
  if (context.previousReferrals?.includes(bestMatch.reason) && highestUrgency !== 'immediate') {
    maxConfidence *= 0.5; // Reduce confidence for repeat referrals
  }

  const shouldRefer = maxConfidence >= 0.5;

  // Get resources and framing
  const resources = REFERRAL_RESOURCES[bestMatch.target] || [];
  const framings = REFERRAL_FRAMINGS[bestMatch.reason] || [];
  const suggestedFraming = framings[Math.floor(Math.random() * framings.length)] || null;

  log.debug(
    {
      shouldRefer,
      urgency: highestUrgency,
      reason: bestMatch?.reason,
      target: bestMatch?.target,
      confidence: maxConfidence,
    },
    'Referral need analyzed'
  );

  return {
    shouldRefer,
    urgency: highestUrgency,
    reason: bestMatch.reason,
    suggestedTarget: bestMatch.target,
    confidence: maxConfidence,
    suggestedFraming,
    resources,
    shouldFollowUp: shouldRefer && highestUrgency !== 'immediate',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function urgencyValue(urgency: 'low' | 'medium' | 'high' | 'immediate'): number {
  const values = { low: 1, medium: 2, high: 3, immediate: 4 };
  return values[urgency];
}

// ============================================================================
// TRACKING
// ============================================================================

const userReferralHistory = new Map<
  string,
  Array<{
    reason: ReferralReason;
    target: ReferralTarget;
    timestamp: number;
    acknowledged: boolean;
  }>
>();

/**
 * Record a referral was made
 */
export function recordReferral(
  userId: string,
  reason: ReferralReason,
  target: ReferralTarget
): void {
  const history = userReferralHistory.get(userId) || [];
  history.push({
    reason,
    target,
    timestamp: Date.now(),
    acknowledged: false,
  });
  userReferralHistory.set(userId, history);
}

/**
 * Record user acknowledged a referral
 */
export function recordReferralAcknowledged(userId: string, acknowledged: boolean): void {
  const history = userReferralHistory.get(userId);
  if (history && history.length > 0) {
    history[history.length - 1].acknowledged = acknowledged;
  }
}

/**
 * Get referral history for a user
 */
export function getReferralHistory(userId: string): Array<{
  reason: ReferralReason;
  target: ReferralTarget;
  timestamp: number;
  acknowledged: boolean;
}> {
  return userReferralHistory.get(userId) || [];
}

/**
 * Get resources for a specific target
 */
export function getResources(target: ReferralTarget): ReferralResource[] {
  return REFERRAL_RESOURCES[target] || [];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { REFERRAL_TRIGGERS, REFERRAL_RESOURCES, REFERRAL_FRAMINGS };
