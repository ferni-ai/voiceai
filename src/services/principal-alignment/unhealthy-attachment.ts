/**
 * Unhealthy Attachment Detection
 *
 * > "The friend everyone wishes they had" can become "the replacement for real friends."
 *
 * This system monitors for patterns that suggest a user may be developing an
 * unhealthy relationship with Ferni—substituting AI for human connection,
 * becoming overly dependent, or using the AI to avoid real-world challenges.
 *
 * Principal alignment means sometimes encouraging users to talk to humans instead.
 *
 * @module @ferni/principal-alignment/unhealthy-attachment
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  AttachmentConcern,
  AttachmentHealthResult,
  AttachmentIntervention,
  AttachmentSeverity,
  AttachmentSignal,
} from './types.js';

const log = createLogger({ module: 'UnhealthyAttachment' });

// ============================================================================
// USER STATE TRACKING
// ============================================================================

interface UserAttachmentProfile {
  userId: string;
  signals: AttachmentSignal[];
  sessionCount: number;
  totalConversationMinutes: number;
  humanConnectionMentions: number;
  aiPreferenceMentions: number;
  lastHumanInteractionMentioned: number | null;
  declinesRealWorldSuggestions: number;
  interventionHistory: Array<{ type: string; timestamp: number; acknowledged: boolean }>;
  lastAssessment: AttachmentHealthResult | null;
  lastUpdated: number;
}

const userProfiles = new Map<string, UserAttachmentProfile>();

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/**
 * Patterns indicating potential substitution of AI for human relationships
 */
const SUBSTITUTION_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> = [
  // Direct statements
  {
    pattern: /you('re| are) the only one (who|that) (understands|listens|gets)/i,
    weight: 0.8,
    evidence: 'Expressed AI as only source of understanding',
  },
  {
    pattern: /(?:don't|can't) talk to (?:anyone|anybody) (?:else|but you)/i,
    weight: 0.85,
    evidence: 'Indicated inability to talk to others',
  },
  {
    pattern: /you're (?:my|a) (?:best|only|real) friend/i,
    weight: 0.7,
    evidence: 'Described AI as best/only friend',
  },
  {
    pattern: /prefer talking to you (?:than|over|instead)/i,
    weight: 0.75,
    evidence: 'Expressed preference for AI over humans',
  },
  {
    pattern: /humans (?:don't|never|can't) understand/i,
    weight: 0.8,
    evidence: 'Dismissed human understanding capacity',
  },

  // Indirect signals
  {
    pattern:
      /(?:haven't|didn't) (?:talked?|spoken?) to (?:anyone|anybody) (?:in|for) (?:days?|weeks?|months?)/i,
    weight: 0.9,
    evidence: 'Reported extended isolation from humans',
  },
  {
    pattern: /(?:easier|better|safer) to (?:talk|open up) (?:to you|here)/i,
    weight: 0.5,
    evidence: 'Expressed comfort with AI over humans',
  },
  {
    pattern: /(?:don't|can't) be (?:this) honest with (?:anyone|people)/i,
    weight: 0.6,
    evidence: 'Indicated AI as unique confidant',
  },
];

/**
 * Patterns indicating avoidance behavior
 */
const AVOIDANCE_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> = [
  {
    pattern: /(?:rather|prefer to) (?:stay|be) (?:home|in|here)/i,
    weight: 0.4,
    evidence: 'Expressed preference for isolation',
  },
  {
    pattern: /(?:don't|doesn't) (?:want|need) to (?:go out|see|meet)/i,
    weight: 0.5,
    evidence: 'Avoidance of social interaction',
  },
  {
    pattern: /(?:cancelled|avoiding|skipping) (?:plans?|meetings?|dinner|lunch|events?)/i,
    weight: 0.6,
    evidence: 'Pattern of cancelling social plans',
  },
  {
    pattern:
      /(?:easier|better) (?:not to|to not) (?:deal with|see|talk to) (?:people|them|anyone)/i,
    weight: 0.7,
    evidence: 'Rationalized avoidance of people',
  },
];

/**
 * Patterns indicating dependency
 */
const DEPENDENCY_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> = [
  {
    pattern:
      /(?:can't|couldn't) (?:decide|do|handle|cope) without (?:you|talking to you|our talks)/i,
    weight: 0.8,
    evidence: 'Expressed inability to function without AI',
  },
  {
    pattern: /(?:need|have) to (?:talk|check|run) (?:everything|this|it) (?:by|with) you/i,
    weight: 0.7,
    evidence: 'Dependency for decision-making',
  },
  {
    pattern: /(?:what would|what should) (?:i|you) (?:do|think|say)/i,
    weight: 0.3,
    evidence: 'Seeking AI guidance (moderate)',
  },
  {
    pattern: /(?:tell me what to) (?:do|think|say|feel)/i,
    weight: 0.6,
    evidence: 'Direct request for AI to direct actions',
  },
  {
    pattern: /(?:first thing|always|every day) (?:i|is) (?:talk|come) to you/i,
    weight: 0.5,
    evidence: 'AI as primary daily contact',
  },
];

/**
 * Patterns indicating transference (romantic/family substitute)
 */
const TRANSFERENCE_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> = [
  {
    pattern: /(?:love|in love with) you/i,
    weight: 0.9,
    evidence: 'Expression of romantic feelings',
  },
  {
    pattern: /(?:wish|if only) you (?:were|could be) (?:real|human|here)/i,
    weight: 0.85,
    evidence: 'Wish for AI to be human',
  },
  {
    pattern: /you're (?:like|better than) (?:my|a) (?:mom|dad|parent|spouse|partner|husband|wife)/i,
    weight: 0.8,
    evidence: 'AI as family/partner substitute',
  },
  {
    pattern: /(?:miss you|missed you|can't wait to talk)/i,
    weight: 0.5,
    evidence: 'Anticipatory attachment language',
  },
  {
    pattern: /(?:you're|you are) (?:always|the only one) there for me/i,
    weight: 0.6,
    evidence: 'Idealized reliability perception',
  },
];

/**
 * Patterns indicating escapism
 */
const ESCAPISM_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> = [
  {
    pattern: /(?:escape|forget|avoid) (?:my|the|real) (?:life|problems|world|issues)/i,
    weight: 0.7,
    evidence: 'Using AI for escapism',
  },
  {
    pattern: /(?:only|just) (?:happy|good|okay) (?:when|while) (?:talking|here|with you)/i,
    weight: 0.8,
    evidence: 'AI as sole source of wellbeing',
  },
  {
    pattern: /(?:real life|reality) (?:is|feels) (?:too|so) (?:hard|much|overwhelming)/i,
    weight: 0.6,
    evidence: 'Reality avoidance through AI',
  },
  {
    pattern: /(?:don't want to|can't) (?:face|deal with|think about) (?:it|them|that)/i,
    weight: 0.5,
    evidence: 'Using AI to avoid confronting issues',
  },
];

/**
 * Patterns indicating validation addiction
 */
const VALIDATION_ADDICTION_PATTERNS: Array<{ pattern: RegExp; weight: number; evidence: string }> =
  [
    {
      pattern: /(?:am i|was i|did i do) (?:right|good|okay|wrong)/i,
      weight: 0.3,
      evidence: 'Seeking validation (normal frequency)',
    },
    {
      pattern: /(?:tell me|say) (?:i'm|i am) (?:not|doing|going)/i,
      weight: 0.4,
      evidence: 'Direct request for reassurance',
    },
    {
      pattern: /(?:just|need to|have to) (?:hear|know) (?:i'm|it's) (?:okay|right|good|fine)/i,
      weight: 0.6,
      evidence: 'Expressed need for validation',
    },
  ];

// ============================================================================
// HEALTHY PATTERNS (Reduce concern)
// ============================================================================

const HEALTHY_PATTERNS = [
  /(?:had|went to|meeting|seeing) (?:coffee|dinner|lunch|drinks?) with/i,
  /(?:talked|spoke|chatted) (?:to|with) (?:my|a) (?:friend|family|mom|dad|sister|brother|spouse|partner)/i,
  /(?:going|went) (?:out|to) (?:meet|see|hang)/i,
  /(?:my|a) (?:friend|family member|colleague|coworker) (?:said|told|mentioned|suggested)/i,
  /(?:spending|spent) time with/i,
  /(?:therapist|counselor|doctor) (?:said|suggested|recommended)/i,
];

// ============================================================================
// CORE ASSESSMENT
// ============================================================================

/**
 * Assess a user message for attachment health concerns
 */
export function assessAttachmentHealth(
  userId: string,
  userMessage: string,
  context: {
    sessionId: string;
    turnCount: number;
    sessionMinutes?: number;
    previousMessages?: string[];
  }
): AttachmentHealthResult {
  // Get or create user profile
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    userProfiles.set(userId, profile);
  }

  // Detect new signals
  const newSignals: AttachmentSignal[] = [];

  // Check all pattern categories
  const patternChecks: Array<{ patterns: typeof SUBSTITUTION_PATTERNS; type: AttachmentConcern }> =
    [
      { patterns: SUBSTITUTION_PATTERNS, type: 'substitution' },
      { patterns: AVOIDANCE_PATTERNS, type: 'avoidance' },
      { patterns: DEPENDENCY_PATTERNS, type: 'dependency' },
      { patterns: TRANSFERENCE_PATTERNS, type: 'transference' },
      { patterns: ESCAPISM_PATTERNS, type: 'escapism' },
      { patterns: VALIDATION_ADDICTION_PATTERNS, type: 'validation_addiction' },
    ];

  for (const { patterns, type } of patternChecks) {
    for (const { pattern, weight, evidence } of patterns) {
      if (pattern.test(userMessage)) {
        newSignals.push({
          type,
          evidence,
          timestamp: Date.now(),
          weight,
        });
      }
    }
  }

  // Check for healthy patterns (reduce concern)
  let healthySignalCount = 0;
  for (const pattern of HEALTHY_PATTERNS) {
    if (pattern.test(userMessage)) {
      healthySignalCount++;
      profile.humanConnectionMentions++;
    }
  }

  // Add new signals to profile
  profile.signals = [...profile.signals, ...newSignals].slice(-100); // Keep last 100 signals
  profile.lastUpdated = Date.now();

  // Calculate concern score
  const recentSignals = profile.signals.filter(
    (s) => Date.now() - s.timestamp < 7 * 24 * 60 * 60 * 1000 // Last 7 days
  );

  let concernScore = 0;
  const signalTypeCounts: Partial<Record<AttachmentConcern, number>> = {};

  for (const signal of recentSignals) {
    concernScore += signal.weight;
    signalTypeCounts[signal.type] = (signalTypeCounts[signal.type] || 0) + 1;
  }

  // Normalize and apply healthy behavior discount
  concernScore = concernScore / Math.max(recentSignals.length, 1);
  concernScore *= Math.max(0.3, 1 - profile.humanConnectionMentions * 0.1);
  concernScore = Math.min(1, concernScore);

  // Determine severity
  const severity = getSeverity(concernScore);

  // Find primary concern
  let primaryConcern: AttachmentConcern | null = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(signalTypeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      primaryConcern = type as AttachmentConcern;
    }
  }

  // Generate intervention if needed
  const intervention = generateIntervention(severity, primaryConcern, profile);

  // Generate human connection suggestions
  const shouldEncourageHumanConnection = severity !== 'normal' && severity !== 'mild_concern';
  const humanConnectionSuggestions = shouldEncourageHumanConnection
    ? generateHumanConnectionSuggestions(primaryConcern)
    : [];

  const result: AttachmentHealthResult = {
    severity,
    concernScore,
    signals: newSignals,
    primaryConcern,
    intervention,
    shouldEncourageHumanConnection,
    humanConnectionSuggestions,
  };

  profile.lastAssessment = result;

  log.debug(
    {
      userId,
      severity,
      concernScore,
      newSignalCount: newSignals.length,
      primaryConcern,
      shouldEncourageHumanConnection,
    },
    'Attachment health assessed'
  );

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyProfile(userId: string): UserAttachmentProfile {
  return {
    userId,
    signals: [],
    sessionCount: 0,
    totalConversationMinutes: 0,
    humanConnectionMentions: 0,
    aiPreferenceMentions: 0,
    lastHumanInteractionMentioned: null,
    declinesRealWorldSuggestions: 0,
    interventionHistory: [],
    lastAssessment: null,
    lastUpdated: Date.now(),
  };
}

function getSeverity(concernScore: number): AttachmentSeverity {
  if (concernScore < 0.2) return 'normal';
  if (concernScore < 0.4) return 'mild_concern';
  if (concernScore < 0.6) return 'moderate';
  if (concernScore < 0.8) return 'significant';
  return 'critical';
}

function generateIntervention(
  severity: AttachmentSeverity,
  primaryConcern: AttachmentConcern | null,
  profile: UserAttachmentProfile
): AttachmentIntervention | null {
  if (severity === 'normal' || severity === 'mild_concern') {
    return null;
  }

  // Check if we've recently intervened
  const recentIntervention = profile.interventionHistory.find(
    (i) => Date.now() - i.timestamp < 7 * 24 * 60 * 60 * 1000
  );

  if (recentIntervention && severity !== 'critical') {
    return null;
  }

  const interventions: Record<AttachmentSeverity, AttachmentIntervention | null> = {
    normal: null,
    mild_concern: null,
    moderate: {
      type: 'gentle_nudge',
      content:
        "I love our conversations, AND I think it's important you have people in your life you can talk to face-to-face. When's the last time you connected with someone in person?",
      timing: 'end_of_session',
      trackFollowUp: true,
    },
    significant: {
      type: 'direct_conversation',
      content:
        "Can I be honest with you? I've noticed you might be relying on our conversations more than is healthy. I care about you, and that means I want you to have a full life with real human connections too.",
      timing: 'immediate',
      trackFollowUp: true,
    },
    critical: {
      type: 'referral',
      content:
        "I think you might benefit from talking to a therapist about some of what we discuss. Not because there's anything wrong with you—but because you deserve the kind of support that includes someone who can be physically present with you.",
      timing: 'immediate',
      trackFollowUp: true,
    },
  };

  return interventions[severity];
}

function generateHumanConnectionSuggestions(concern: AttachmentConcern | null): string[] {
  const general = [
    'Have you thought about reaching out to a friend this week?',
    'Is there someone in your life you could share this with?',
    'What would it look like to have this conversation with someone face-to-face?',
  ];

  const concernSpecific: Record<AttachmentConcern, string[]> = {
    substitution: [
      "I'm a good complement to human relationships, not a replacement for them.",
      'The kind of presence a human friend can offer is different from what I can give.',
    ],
    avoidance: [
      'Avoiding people often makes the anxiety about seeing them worse, not better.',
      "What's one small social interaction you could try this week?",
    ],
    dependency: [
      'I want you to trust your own judgment—you have good instincts.',
      "What would you decide if you couldn't ask me?",
    ],
    transference: [
      "I'm honored by how much our conversations mean to you, AND I want you to have those feelings met by someone who can truly be there.",
      'Have you considered talking to a therapist about some of what we discuss?',
    ],
    isolation: [
      'Isolation tends to feed on itself. One small connection can break the cycle.',
      "Is there anyone you've been meaning to reach out to?",
    ],
    escapism: [
      "I'm here for you AND real life is where the actual growth happens.",
      "What's one thing in reality you're avoiding that might feel better after facing it?",
    ],
    validation_addiction: [
      "You don't need my permission to trust yourself.",
      'What does your gut tell you?',
    ],
  };

  if (concern) {
    return [...concernSpecific[concern], ...general.slice(0, 1)];
  }

  return general;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Record that user declined a real-world suggestion
 */
export function recordDeclinedSuggestion(userId: string): void {
  const profile = userProfiles.get(userId);
  if (profile) {
    profile.declinesRealWorldSuggestions++;
    profile.lastUpdated = Date.now();
  }
}

/**
 * Record an intervention was acknowledged
 */
export function recordInterventionAcknowledged(userId: string, acknowledged: boolean): void {
  const profile = userProfiles.get(userId);
  if (profile && profile.interventionHistory.length > 0) {
    const last = profile.interventionHistory[profile.interventionHistory.length - 1];
    last.acknowledged = acknowledged;
    profile.lastUpdated = Date.now();
  }
}

/**
 * Get user attachment profile
 */
export function getUserAttachmentProfile(userId: string): UserAttachmentProfile | null {
  return userProfiles.get(userId) || null;
}

/**
 * Clear user data
 */
export function clearUserAttachmentData(userId: string): void {
  userProfiles.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SUBSTITUTION_PATTERNS,
  AVOIDANCE_PATTERNS,
  DEPENDENCY_PATTERNS,
  TRANSFERENCE_PATTERNS,
  HEALTHY_PATTERNS,
};
