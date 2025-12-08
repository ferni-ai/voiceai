/**
 * Human-First 2FA System
 *
 * Authentication that feels like recognition, not verification.
 *
 * Philosophy:
 * - A friend recognizes your voice before you say "it's me"
 * - A friend asks for your number when they have a reason to text you
 * - A friend doesn't interrogate you, they remember you
 *
 * Layers:
 * 1. PASSIVE LAYER: Voice + Device (always happening, user never notices)
 * 2. TRUST LAYER: Relationship depth determines what's allowed
 * 3. MOMENT LAYER: Ask for contact info at emotionally-right moments
 * 4. VERIFICATION LAYER: Gentle confirmation only for sensitive operations
 *
 * @module HumanFirst2FA
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getDefaultStore } from '../../memory/index.js';

const log = getLogger().child({ module: 'HumanFirst2FA' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Trust levels based on authentication confidence
 */
export type TrustLevel = 'stranger' | 'recognized' | 'trusted' | 'verified';

/**
 * Operations categorized by sensitivity
 */
export type OperationSensitivity = 'casual' | 'personal' | 'sensitive' | 'critical';

/**
 * Magic moments when asking for contact info feels natural
 */
export type MagicMomentType =
  | 'wants_reminder' // "Can you remind me to..."
  | 'celebrating_win' // "I finally did it!"
  | 'processing_hard_thing' // Going through something emotional
  | 'wants_accountability' // "Help me stick to..."
  | 'asks_about_outreach' // "Can you check in on me?"
  | 'meaningful_commitment' // "I'm going to start..."
  | 'planning_something' // "I have this event coming up..."
  | 'breakthrough_moment' // Major insight or realization
  | 'vulnerability_shared' // Deep share that deserves follow-up
  | 'goal_set' // New goal established
  | 'milestone_reached' // Achieved something
  | 'expressed_loneliness' // Could use proactive connection
  | 'returning_after_break' // Been a while, good time to establish contact
  | 'first_deep_convo'; // Conversation went deep - relationship forming

/**
 * Result of analyzing a moment for phone ask appropriateness
 */
export interface MagicMomentAnalysis {
  isMagicMoment: boolean;
  momentType?: MagicMomentType;
  confidence: number; // 0-1 how appropriate this moment is
  suggestedAsk?: string;
  emotionalContext?: string;
  reasoning?: string;
}

/**
 * Trust state for a user
 */
export interface TrustState {
  userId: string;
  level: TrustLevel;

  // Authentication factors
  factors: {
    voiceMatch: boolean;
    voiceConfidence: number;
    deviceRecognized: boolean;
    phoneVerified: boolean;
    knowledgeVerified: boolean;
  };

  // Relationship depth (also affects trust)
  relationshipScore: number; // 0-100
  conversationCount: number;
  daysSinceFirstContact: number;

  // Contact info state
  hasPhone: boolean;
  hasEmail: boolean;
  phoneVerifiedAt?: Date;

  // History
  lastVerification?: Date;
  verificationCount: number;
  failedVerifications: number;
}

/**
 * Phone ask context and script
 */
export interface PhoneAskScript {
  ask: string;
  followUp?: string;
  confirmationTemplate: string;
  tone: 'caring' | 'excited' | 'supportive' | 'casual';
  momentType: MagicMomentType;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * What trust level is required for different operations
 */
const OPERATION_TRUST_REQUIREMENTS: Record<OperationSensitivity, TrustLevel> = {
  casual: 'stranger', // Basic chat, info queries
  personal: 'recognized', // Access memories, personal info
  sensitive: 'trusted', // Set reminders, access health data
  critical: 'verified', // Financial, change settings, delete data
};

/**
 * Phone ask scripts for each magic moment type
 */
const PHONE_ASK_SCRIPTS: Record<MagicMomentType, PhoneAskScript[]> = {
  wants_reminder: [
    {
      ask: "I'd love to remind you! What's the best number to text you at?",
      followUp: "Or I can send you an email if that's easier.",
      confirmationTemplate: "Got it! I'll text you {when} to remind you.",
      tone: 'caring',
      momentType: 'wants_reminder',
    },
    {
      ask: 'I can definitely remind you. Should I text you?',
      confirmationTemplate: "Perfect, you'll hear from me {when}.",
      tone: 'casual',
      momentType: 'wants_reminder',
    },
  ],

  celebrating_win: [
    {
      ask: 'This is huge! I want to follow up and see how it goes - can I text you in a few days to celebrate more?',
      confirmationTemplate: "I'll check in soon - this deserves more celebration!",
      tone: 'excited',
      momentType: 'celebrating_win',
    },
    {
      ask: "I'm so happy for you! Mind if I text you later this week? I want to hear how you're feeling about this.",
      confirmationTemplate: "Can't wait to hear more about how this unfolds!",
      tone: 'excited',
      momentType: 'celebrating_win',
    },
  ],

  processing_hard_thing: [
    {
      ask: "I'm here for you. Would it help if I checked in tomorrow? I could send you a text.",
      confirmationTemplate: "I'll reach out tomorrow. You're not alone in this.",
      tone: 'caring',
      momentType: 'processing_hard_thing',
    },
    {
      ask: "What you're going through sounds really hard. Can I follow up with you? Sometimes it helps to know someone's thinking about you.",
      confirmationTemplate: "I'll be thinking about you. Take care of yourself.",
      tone: 'supportive',
      momentType: 'processing_hard_thing',
    },
  ],

  wants_accountability: [
    {
      ask: 'I can definitely help keep you accountable! Should I text you check-ins?',
      confirmationTemplate: "You've got this - and I'll be here cheering you on.",
      tone: 'supportive',
      momentType: 'wants_accountability',
    },
    {
      ask: "Accountability buddy mode activated! What's the best way to reach you for check-ins?",
      confirmationTemplate: "Let's do this together. I'll keep you on track.",
      tone: 'excited',
      momentType: 'wants_accountability',
    },
  ],

  asks_about_outreach: [
    {
      ask: "Yes! I'd love to check in on you. Just need your number and I'll text you when I'm thinking about you.",
      confirmationTemplate: 'Now I can reach out when you cross my mind.',
      tone: 'caring',
      momentType: 'asks_about_outreach',
    },
  ],

  meaningful_commitment: [
    {
      ask: "That's a real commitment. Want me to follow up with you on it? I can text you to see how it's going.",
      confirmationTemplate: "I'll check in on this. You've got someone in your corner.",
      tone: 'supportive',
      momentType: 'meaningful_commitment',
    },
  ],

  planning_something: [
    {
      ask: "Sounds exciting! Should I send you a reminder when it's getting close?",
      confirmationTemplate: "I'll make sure you're ready for it!",
      tone: 'casual',
      momentType: 'planning_something',
    },
  ],

  breakthrough_moment: [
    {
      ask: "This feels like a really important realization. Can I check in with you about it? I'd love to see where it takes you.",
      confirmationTemplate: "Breakthroughs like this deserve follow-up. I'll be in touch.",
      tone: 'caring',
      momentType: 'breakthrough_moment',
    },
  ],

  vulnerability_shared: [
    {
      ask: 'Thank you for sharing that with me. It takes courage. Can I check in on you?',
      confirmationTemplate: "I appreciate you trusting me with that. I'm here.",
      tone: 'caring',
      momentType: 'vulnerability_shared',
    },
  ],

  goal_set: [
    {
      ask: 'Love the goal! Should I send you encouragement along the way?',
      confirmationTemplate: "Let's make this happen. I'll be your cheerleader.",
      tone: 'excited',
      momentType: 'goal_set',
    },
  ],

  milestone_reached: [
    {
      ask: 'This deserves recognition! Can I send you something to commemorate this?',
      confirmationTemplate: "Look at you go! I'll send you something special.",
      tone: 'excited',
      momentType: 'milestone_reached',
    },
  ],

  expressed_loneliness: [
    {
      ask: 'You know, I can reach out to you sometimes. Not for any reason - just to say hi. Would you like that?',
      followUp: 'No agenda, just connection.',
      confirmationTemplate: "You'll hear from me. Just because.",
      tone: 'caring',
      momentType: 'expressed_loneliness',
    },
  ],

  returning_after_break: [
    {
      ask: "It's been a while! I missed our chats. Should I text you sometimes so we stay in touch?",
      confirmationTemplate: "Glad you're back. I'll make sure we don't lose touch again.",
      tone: 'caring',
      momentType: 'returning_after_break',
    },
  ],

  first_deep_convo: [
    {
      ask: "I really enjoyed this conversation. Can I check in with you? I'd love to continue building our connection.",
      confirmationTemplate: "This is the beginning of something good. I'll be in touch.",
      tone: 'caring',
      momentType: 'first_deep_convo',
    },
  ],
};

// ============================================================================
// MAGIC MOMENT DETECTION
// ============================================================================

/**
 * Patterns that indicate magic moments in conversation
 */
interface MomentPattern {
  type: MagicMomentType;
  patterns: RegExp[];
  contextClues: string[];
  emotionalWeight: number; // How emotionally significant (affects ask timing)
}

const MOMENT_PATTERNS: MomentPattern[] = [
  {
    type: 'wants_reminder',
    patterns: [
      /remind me/i,
      /don't let me forget/i,
      /can you remind/i,
      /i need to remember/i,
      /i should (do|call|email|text|check)/i,
      /i have (a|an) (appointment|meeting|thing)/i,
    ],
    contextClues: ['tomorrow', 'later', 'next week', 'morning', 'afternoon'],
    emotionalWeight: 0.3,
  },
  {
    type: 'celebrating_win',
    patterns: [
      /i (did it|made it|got it|nailed it)/i,
      /i finally/i,
      /i can't believe (i|it)/i,
      /guess what/i,
      /so excited/i,
      /i'm so (happy|proud|thrilled)/i,
      /it (worked|happened)/i,
    ],
    contextClues: ['achieved', 'accomplished', 'success', 'promotion', 'accepted'],
    emotionalWeight: 0.8,
  },
  {
    type: 'processing_hard_thing',
    patterns: [
      /going through/i,
      /struggling with/i,
      /hard time/i,
      /tough (day|week|month)/i,
      /don't know what to do/i,
      /feeling (lost|overwhelmed|stressed|anxious)/i,
      /just found out/i,
    ],
    contextClues: ['difficult', 'challenge', 'problem', 'worry', 'scared'],
    emotionalWeight: 0.9,
  },
  {
    type: 'wants_accountability',
    patterns: [
      /help me (stick|stay|keep)/i,
      /hold me (accountable|to)/i,
      /keep me (honest|on track)/i,
      /i (always|keep) (quit|stop|give up)/i,
      /accountability/i,
    ],
    contextClues: ['habit', 'routine', 'commitment', 'promise', 'goal'],
    emotionalWeight: 0.6,
  },
  {
    type: 'asks_about_outreach',
    patterns: [
      /can you (check in|reach out|text me|call me)/i,
      /will you (check in|reach out)/i,
      /do you (check in|follow up)/i,
      /can we (stay in touch|talk again)/i,
    ],
    contextClues: ['between', 'sessions', 'later', 'again'],
    emotionalWeight: 0.7,
  },
  {
    type: 'meaningful_commitment',
    patterns: [
      /i'm going to/i,
      /i've decided to/i,
      /i'm committing to/i,
      /i promise/i,
      /this time i will/i,
      /i'm serious about/i,
    ],
    contextClues: ['change', 'start', 'stop', 'begin', 'different'],
    emotionalWeight: 0.7,
  },
  {
    type: 'goal_set',
    patterns: [
      /my goal is/i,
      /i want to (achieve|accomplish|reach)/i,
      /i'm (aiming|working toward)/i,
      /by (next|this|the end)/i,
    ],
    contextClues: ['target', 'milestone', 'deadline', 'objective'],
    emotionalWeight: 0.6,
  },
  {
    type: 'vulnerability_shared',
    patterns: [
      /i've never told anyone/i,
      /i don't usually (talk|share|open up)/i,
      /this is hard to (say|admit|talk about)/i,
      /i'm scared to/i,
      /can i be honest/i,
      /between us/i,
    ],
    contextClues: ['secret', 'afraid', 'ashamed', 'embarrassed', 'trust'],
    emotionalWeight: 0.95,
  },
  {
    type: 'expressed_loneliness',
    patterns: [
      /feel\s+(so\s+)?(lonely|alone|isolated)/i,
      /no one (understands|gets it|listens)/i,
      /wish i had someone/i,
      /don't have anyone/i,
      /haven't talked to anyone/i,
      /so lonely/i,
    ],
    contextClues: ['disconnected', 'lonely', 'alone', 'isolated'],
    emotionalWeight: 0.9,
  },
];

/**
 * Analyze a message for magic moments
 */
export function detectMagicMoment(
  message: string,
  conversationContext?: {
    turnCount: number;
    emotionalIntensity?: number;
    recentTopics?: string[];
    daysSinceLastContact?: number;
  }
): MagicMomentAnalysis {
  const lower = message.toLowerCase();

  // Check each pattern
  for (const pattern of MOMENT_PATTERNS) {
    // Check primary patterns
    const patternMatch = pattern.patterns.some((p) => p.test(message));

    // Check context clues
    const contextMatch = pattern.contextClues.some((clue) => lower.includes(clue.toLowerCase()));

    if (patternMatch) {
      const confidence = calculateMomentConfidence(
        pattern,
        patternMatch,
        contextMatch,
        conversationContext
      );

      // Get a contextually appropriate ask
      const script = selectBestScript(pattern.type, conversationContext);

      log.debug(
        {
          momentType: pattern.type,
          confidence,
          patternMatch,
          contextMatch,
        },
        '✨ Magic moment detected'
      );

      return {
        isMagicMoment: true,
        momentType: pattern.type,
        confidence,
        suggestedAsk: script?.ask,
        emotionalContext: getEmotionalContext(pattern.type),
        reasoning: `Detected ${pattern.type} moment with ${Math.round(confidence * 100)}% confidence`,
      };
    }
  }

  // Check for returning after break
  if (conversationContext?.daysSinceLastContact && conversationContext.daysSinceLastContact > 14) {
    const script = selectBestScript('returning_after_break', conversationContext);
    return {
      isMagicMoment: true,
      momentType: 'returning_after_break',
      confidence: 0.7,
      suggestedAsk: script?.ask,
      emotionalContext: getEmotionalContext('returning_after_break'),
      reasoning: `User returning after ${conversationContext.daysSinceLastContact} days`,
    };
  }

  // Check for first deep convo (turn count + emotional intensity)
  if (
    conversationContext?.turnCount &&
    conversationContext.turnCount >= 8 &&
    (conversationContext.emotionalIntensity ?? 0) > 0.6
  ) {
    const script = selectBestScript('first_deep_convo', conversationContext);
    return {
      isMagicMoment: true,
      momentType: 'first_deep_convo',
      confidence: 0.6,
      suggestedAsk: script?.ask,
      emotionalContext: getEmotionalContext('first_deep_convo'),
      reasoning: 'First meaningful deep conversation',
    };
  }

  return {
    isMagicMoment: false,
    confidence: 0,
  };
}

function calculateMomentConfidence(
  pattern: MomentPattern,
  patternMatch: boolean,
  contextMatch: boolean,
  context?: { turnCount?: number; emotionalIntensity?: number }
): number {
  let confidence = 0.5; // Base confidence for pattern match

  if (contextMatch) {
    confidence += 0.2;
  }

  // Weight by emotional significance
  confidence *= 0.5 + pattern.emotionalWeight * 0.5;

  // Better timing = higher confidence
  if (context?.turnCount) {
    // Ideal window is turns 3-10
    if (context.turnCount >= 3 && context.turnCount <= 10) {
      confidence += 0.1;
    }
  }

  // High emotional intensity = better moment
  if (context?.emotionalIntensity && context.emotionalIntensity > 0.6) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

function selectBestScript(
  momentType: MagicMomentType,
  _context?: { turnCount?: number; emotionalIntensity?: number }
): PhoneAskScript | undefined {
  const scripts = PHONE_ASK_SCRIPTS[momentType];
  if (!scripts || scripts.length === 0) return undefined;

  // For now, random selection - could be smarter based on context
  return scripts[Math.floor(Math.random() * scripts.length)];
}

function getEmotionalContext(momentType: MagicMomentType): string {
  const contexts: Record<MagicMomentType, string> = {
    wants_reminder: 'helpful and practical',
    celebrating_win: 'joyful and celebratory',
    processing_hard_thing: 'supportive and gentle',
    wants_accountability: 'encouraging and steady',
    asks_about_outreach: 'warm and available',
    meaningful_commitment: 'supportive and believing',
    planning_something: 'helpful and organized',
    breakthrough_moment: 'excited and curious',
    vulnerability_shared: 'honored and gentle',
    goal_set: 'enthusiastic and supportive',
    milestone_reached: 'celebratory and proud',
    expressed_loneliness: 'compassionate and present',
    returning_after_break: 'warm and welcoming',
    first_deep_convo: 'connected and appreciative',
  };

  return contexts[momentType] || 'warm and genuine';
}

// ============================================================================
// TRUST CALCULATION
// ============================================================================

/**
 * Calculate current trust level for a user
 */
export async function calculateTrustLevel(
  userId: string,
  factors: {
    voiceConfidence?: number;
    deviceRecognized?: boolean;
    callerIdMatch?: boolean;
  }
): Promise<TrustState> {
  const store = getDefaultStore();
  const profile = await store.getProfile(userId);

  // Calculate relationship score
  const conversationCount = profile?.totalConversations || 0;
  const daysSinceFirst = profile?.createdAt
    ? Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Relationship score: 0-100 based on depth of relationship
  const relationshipScore = Math.min(
    100,
    conversationCount * 5 + // Each convo worth 5 points
      daysSinceFirst * 0.5 + // Longevity bonus
      (profile?.keyMoments?.length || 0) * 10 // Shared moments bonus
  );

  // Determine trust level
  const voiceMatch = (factors.voiceConfidence ?? 0) > 0.7;
  const voiceConfidence = factors.voiceConfidence ?? 0;
  const deviceRecognized = factors.deviceRecognized ?? false;
  const phoneVerified = factors.callerIdMatch ?? false;

  // Count verified factors
  const factorCount = [voiceMatch, deviceRecognized, phoneVerified].filter(Boolean).length;

  let level: TrustLevel;
  if (factorCount >= 2 || (voiceMatch && voiceConfidence > 0.9)) {
    level = 'verified';
  } else if (factorCount >= 1 || voiceConfidence > 0.5) {
    level = 'trusted';
  } else if (deviceRecognized || profile) {
    level = 'recognized';
  } else {
    level = 'stranger';
  }

  // Check contact info
  const hasPhone = !!(
    profile?.contactInfo?.phone || profile?.linkedIdentifiers?.some((id) => id.startsWith('phone:'))
  );
  const hasEmail = !!profile?.contactInfo?.email;

  return {
    userId,
    level,
    factors: {
      voiceMatch,
      voiceConfidence,
      deviceRecognized,
      phoneVerified,
      knowledgeVerified: false, // Set by verification flow
    },
    relationshipScore,
    conversationCount,
    daysSinceFirstContact: daysSinceFirst,
    hasPhone,
    hasEmail,
    verificationCount: 0,
    failedVerifications: 0,
  };
}

/**
 * Check if user has sufficient trust for an operation
 */
export function canPerformOperation(
  trustState: TrustState,
  sensitivity: OperationSensitivity
): { allowed: boolean; reason?: string; requiresVerification?: boolean } {
  const requiredLevel = OPERATION_TRUST_REQUIREMENTS[sensitivity];

  const levelOrder: TrustLevel[] = ['stranger', 'recognized', 'trusted', 'verified'];
  const currentIndex = levelOrder.indexOf(trustState.level);
  const requiredIndex = levelOrder.indexOf(requiredLevel);

  if (currentIndex >= requiredIndex) {
    return { allowed: true };
  }

  // Not enough trust - determine next steps
  if (sensitivity === 'critical') {
    return {
      allowed: false,
      reason: 'This requires verification for your security',
      requiresVerification: true,
    };
  }

  // For sensitive operations, relationship depth can help
  if (sensitivity === 'sensitive' && trustState.relationshipScore > 70) {
    return { allowed: true }; // Deep relationship compensates
  }

  return {
    allowed: false,
    reason: 'Please verify your identity first',
    requiresVerification: true,
  };
}

// ============================================================================
// PHONE ASK ORCHESTRATION
// ============================================================================

/**
 * State tracking for phone ask attempts
 */
interface PhoneAskState {
  userId: string;
  lastAskTime?: Date;
  askCount: number;
  declinedCount: number;
  lastDeclineTime?: Date;
  momentsSeen: MagicMomentType[];
  bestMomentMissed?: MagicMomentType;
}

const phoneAskStates = new Map<string, PhoneAskState>();

/**
 * Determine if we should ask for phone number at this moment
 */
export async function shouldAskForPhone(
  userId: string,
  magicMoment: MagicMomentAnalysis,
  conversationContext: {
    turnCount: number;
    hasAskedThisSession: boolean;
  }
): Promise<{
  shouldAsk: boolean;
  script?: PhoneAskScript;
  reason: string;
}> {
  // Get or create state
  let state = phoneAskStates.get(userId);
  if (!state) {
    state = { userId, askCount: 0, declinedCount: 0, momentsSeen: [] };
    phoneAskStates.set(userId, state);
  }

  // Check if we already have their phone
  const trustState = await calculateTrustLevel(userId, {});
  if (trustState.hasPhone) {
    return { shouldAsk: false, reason: 'Already have phone number' };
  }

  // Don't ask if declined recently (24 hours)
  if (state.lastDeclineTime) {
    const hoursSinceDecline = (Date.now() - state.lastDeclineTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceDecline < 24) {
      return { shouldAsk: false, reason: 'Recently declined' };
    }
  }

  // Don't ask more than 3 times total without a response
  if (state.askCount >= 3 && state.declinedCount === 0) {
    return { shouldAsk: false, reason: 'Asked multiple times without response' };
  }

  // Don't ask twice in one session
  if (conversationContext.hasAskedThisSession) {
    return { shouldAsk: false, reason: 'Already asked this session' };
  }

  // Need to be at least turn 3 (rapport building)
  if (conversationContext.turnCount < 3) {
    // But track the moment for later
    if (magicMoment.isMagicMoment && magicMoment.momentType) {
      state.momentsSeen.push(magicMoment.momentType);
      state.bestMomentMissed = magicMoment.momentType;
    }
    return { shouldAsk: false, reason: 'Too early in conversation' };
  }

  // If it's a magic moment with high confidence, ask!
  if (magicMoment.isMagicMoment && magicMoment.confidence > 0.5) {
    const scripts = PHONE_ASK_SCRIPTS[magicMoment.momentType!];
    const script = scripts?.[Math.floor(Math.random() * scripts.length)];

    if (script) {
      state.askCount++;
      state.lastAskTime = new Date();

      log.info(
        {
          userId,
          momentType: magicMoment.momentType,
          confidence: magicMoment.confidence,
          askCount: state.askCount,
        },
        '📱 Triggering phone ask at magic moment'
      );

      return {
        shouldAsk: true,
        script,
        reason: `Magic moment: ${magicMoment.momentType}`,
      };
    }
  }

  return { shouldAsk: false, reason: 'No magic moment detected' };
}

/**
 * Record user's response to phone ask
 */
export function recordPhoneAskResponse(
  userId: string,
  response: 'provided' | 'declined' | 'ignored'
): void {
  const state = phoneAskStates.get(userId);
  if (!state) return;

  if (response === 'declined') {
    state.declinedCount++;
    state.lastDeclineTime = new Date();
    log.info({ userId, declinedCount: state.declinedCount }, 'User declined phone ask');
  } else if (response === 'ignored') {
    // Soft decline - don't penalize as hard
    log.debug({ userId }, 'User ignored phone ask');
  } else if (response === 'provided') {
    // Success! Reset tracking
    phoneAskStates.delete(userId);
    log.info({ userId }, '✅ User provided phone number');
  }
}

// ============================================================================
// 2FA VERIFICATION FLOW
// ============================================================================

/**
 * Initiate phone verification (SMS code)
 */
export async function initiatePhoneVerification(
  userId: string,
  phoneNumber: string
): Promise<{ success: boolean; message: string }> {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Store code (in production, use Redis with TTL)
  const verificationCodes = new Map<string, { code: string; expires: Date; phone: string }>();
  verificationCodes.set(userId, {
    code,
    expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    phone: phoneNumber,
  });

  // In production: Send SMS via Twilio
  log.info({ userId, phone: phoneNumber.slice(-4) }, '📲 Phone verification initiated');

  // The message should feel human
  const smsMessage = `Your Ferni code is ${code}. Just making sure it's really you! 💚`;

  // TODO: Actually send SMS
  // await sendSMS(phoneNumber, smsMessage);

  return {
    success: true,
    message: 'I just texted you a quick code - can you read it back to me?',
  };
}

/**
 * Verify phone code from user
 */
export async function verifyPhoneCode(
  userId: string,
  providedCode: string
): Promise<{ verified: boolean; message: string }> {
  // In production: Check against stored code
  // const stored = verificationCodes.get(userId);
  // const verified = stored && stored.code === providedCode && stored.expires > new Date();

  // For now, placeholder
  const verified = providedCode.length === 6 && /^\d+$/.test(providedCode);

  if (verified) {
    log.info({ userId }, '✅ Phone verified successfully');
    return {
      verified: true,
      message: "Perfect! Now I know it's really you.",
    };
  }

  return {
    verified: false,
    message: "Hmm, that doesn't match. Want me to send another code?",
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectMagicMoment,
  calculateTrustLevel,
  canPerformOperation,
  shouldAskForPhone,
  recordPhoneAskResponse,
  initiatePhoneVerification,
  verifyPhoneCode,
  PHONE_ASK_SCRIPTS,
};
