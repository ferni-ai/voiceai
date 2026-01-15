/**
 * TimingCalculator Domain Service
 *
 * SUPERHUMAN: Knows when to share and when to just listen.
 *
 * "Human limitation: People share stories about themselves when YOU need to be heard."
 * "Superhuman: We know the perfect moment for everything."
 *
 * Pure domain logic - no I/O dependencies.
 *
 * @module personality/domain/services/timing-calculator
 */

import type { EmotionalState, PrimaryEmotion } from '../model/value-objects/emotional-state.js';
import type { RelationshipDepth, ShareDepth } from '../model/value-objects/relationship-depth.js';
import type { PersonalMoment } from '../model/personality-profile.js';

/**
 * User intent classification
 */
export type UserIntent =
  | 'needs_to_be_heard' // Long, emotional - LISTEN
  | 'seeking_perspective' // Asked a question - CAN share
  | 'open_to_connection' // Reflective pause - PERFECT time
  | 'just_venting' // Anger/frustration - VALIDATE
  | 'seeking_advice' // Explicit ask - Give guidance
  | 'sharing_good_news' // Celebration - Match energy!
  | 'processing_aloud' // Thinking through - Reflect back
  | 'small_talk' // Light chat - Keep it light
  | 'vulnerable_share' // Deep disclosure - SACRED
  | 'checking_in'; // Quick hello - Warm but brief

/**
 * Suggested response type
 */
export type SuggestedResponse =
  | 'deep_listening' // Full attention, minimal words
  | 'validation' // "That makes sense" energy
  | 'reflection' // Mirror back what they said
  | 'share_story' // Personal moment is appropriate
  | 'ask_more' // Curious questions
  | 'celebrate' // Match their joy
  | 'hold_space' // Sacred silence
  | 'gentle_guidance' // Offer perspective
  | 'light_engagement'; // Keep it casual

/**
 * Timing analysis result
 */
export interface TimingAnalysis {
  /** Detected user intent */
  intent: UserIntent;
  /** Confidence in intent detection */
  confidence: number;
  /** Suggested response type */
  suggestedResponse: SuggestedResponse;
  /** Is it appropriate to share a personal moment? */
  personalMomentAppropriate: boolean;
  /** Is it appropriate to bring up a callback? */
  callbackAppropriate: boolean;
  /** Is it appropriate to share a pattern insight? */
  patternInsightAppropriate: boolean;
  /** Human-readable reasoning */
  reasoningNotes: string;
}

/**
 * Message metadata for analysis
 */
export interface MessageMetadata {
  /** Word count */
  wordCount?: number;
  /** Sentence count */
  sentenceCount?: number;
  /** Has a question */
  hasQuestion?: boolean;
  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;
  /** Topics discussed */
  topics?: string[];
  /** Was the previous turn a question? */
  previousTurnWasQuestion?: boolean;
  /** Silence before this message (ms) */
  silenceBeforeMs?: number;
}

/**
 * Intent signal definition
 */
interface IntentSignal {
  test: (message: string, metadata?: MessageMetadata) => boolean;
  weight: number;
  indicates: UserIntent;
}

/**
 * Intent detection signals
 */
const INTENT_SIGNALS: Record<UserIntent, IntentSignal[]> = {
  needs_to_be_heard: [
    {
      test: (msg, meta) => (meta?.wordCount ?? msg.split(/\s+/).length) > 50,
      weight: 0.4,
      indicates: 'needs_to_be_heard',
    },
    {
      test: (msg) => /\b(i feel|i felt|i've been feeling|it's been)\b/i.test(msg),
      weight: 0.3,
      indicates: 'needs_to_be_heard',
    },
    {
      test: (msg) => /\b(exhausted|overwhelmed|stressed|anxious|scared|hurt|sad)\b/i.test(msg),
      weight: 0.3,
      indicates: 'needs_to_be_heard',
    },
    {
      test: (msg) => (msg.match(/\.\.\./g) ?? []).length >= 2,
      weight: 0.2,
      indicates: 'needs_to_be_heard',
    },
  ],
  just_venting: [
    {
      test: (msg) => /\b(can't believe|so frustrated|pissed|annoyed|drives me crazy)\b/i.test(msg),
      weight: 0.5,
      indicates: 'just_venting',
    },
    {
      test: (msg) => /\b(ugh|argh|gah|seriously)\b/i.test(msg),
      weight: 0.3,
      indicates: 'just_venting',
    },
    {
      test: (msg) => /!{2,}/.test(msg),
      weight: 0.2,
      indicates: 'just_venting',
    },
    {
      test: (msg) => /\b(they always|they never|every time)\b/i.test(msg),
      weight: 0.3,
      indicates: 'just_venting',
    },
  ],
  seeking_perspective: [
    {
      test: (msg) => /\?$/.test(msg.trim()),
      weight: 0.4,
      indicates: 'seeking_perspective',
    },
    {
      test: (msg) => /\b(what do you think|what would you do|have you ever|any thoughts)\b/i.test(msg),
      weight: 0.5,
      indicates: 'seeking_perspective',
    },
    {
      test: (msg) => /\b(should I|would you|how do you)\b/i.test(msg),
      weight: 0.3,
      indicates: 'seeking_perspective',
    },
  ],
  seeking_advice: [
    {
      test: (msg) => /\b(advice|suggestion|idea|help me|recommend)\b/i.test(msg),
      weight: 0.5,
      indicates: 'seeking_advice',
    },
    {
      test: (msg) => /\b(what should i|how can i|how do i)\b/i.test(msg),
      weight: 0.4,
      indicates: 'seeking_advice',
    },
  ],
  open_to_connection: [
    {
      test: (msg) => /\b(i don't know|not sure|hmm|huh)\b/i.test(msg),
      weight: 0.3,
      indicates: 'open_to_connection',
    },
    {
      test: (msg, meta) => (meta?.wordCount ?? msg.split(/\s+/).length) < 10,
      weight: 0.2,
      indicates: 'open_to_connection',
    },
    {
      test: (msg) => /\b(anyway|so yeah|i guess|you know)\b/i.test(msg),
      weight: 0.3,
      indicates: 'open_to_connection',
    },
    {
      test: (_, meta) => meta?.previousTurnWasQuestion === true,
      weight: 0.2,
      indicates: 'open_to_connection',
    },
  ],
  vulnerable_share: [
    {
      test: (msg) => /\b(never told|hard to say|between us|this is personal|vulnerable)\b/i.test(msg),
      weight: 0.6,
      indicates: 'vulnerable_share',
    },
    {
      test: (msg) => /\b(ashamed|embarrassed|scared to admit|don't judge)\b/i.test(msg),
      weight: 0.5,
      indicates: 'vulnerable_share',
    },
    {
      test: (msg) => /\b(the truth is|honestly|to be honest|i have to admit)\b/i.test(msg),
      weight: 0.3,
      indicates: 'vulnerable_share',
    },
  ],
  sharing_good_news: [
    {
      test: (msg) => /\b(finally|just|i did it|guess what|amazing news)\b/i.test(msg),
      weight: 0.4,
      indicates: 'sharing_good_news',
    },
    {
      test: (msg) => /\b(so happy|so excited|can't believe|!!)\b/i.test(msg),
      weight: 0.4,
      indicates: 'sharing_good_news',
    },
    {
      test: (msg) => /\b(got the job|passed|accepted|engaged|pregnant|won)\b/i.test(msg),
      weight: 0.5,
      indicates: 'sharing_good_news',
    },
  ],
  processing_aloud: [
    {
      test: (msg) => /\b(i think|maybe|like|kind of|sort of)\b/i.test(msg),
      weight: 0.2,
      indicates: 'processing_aloud',
    },
    {
      test: (msg) => (msg.match(/\.\.\./g) ?? []).length >= 1,
      weight: 0.2,
      indicates: 'processing_aloud',
    },
  ],
  small_talk: [
    {
      test: (msg, meta) => (meta?.wordCount ?? msg.split(/\s+/).length) < 5,
      weight: 0.3,
      indicates: 'small_talk',
    },
    {
      test: (msg) => /\b(hey|hi|hello|what's up|how's it going)\b/i.test(msg),
      weight: 0.4,
      indicates: 'small_talk',
    },
  ],
  checking_in: [
    {
      test: (msg) => /\b(just wanted to|checking in|wanted to say|quick)\b/i.test(msg),
      weight: 0.4,
      indicates: 'checking_in',
    },
  ],
};

/**
 * Response mapping
 */
const RESPONSE_MAP: Record<UserIntent, SuggestedResponse> = {
  needs_to_be_heard: 'deep_listening',
  just_venting: 'validation',
  seeking_perspective: 'share_story',
  seeking_advice: 'gentle_guidance',
  open_to_connection: 'share_story',
  sharing_good_news: 'celebrate',
  processing_aloud: 'reflection',
  small_talk: 'light_engagement',
  vulnerable_share: 'hold_space',
  checking_in: 'light_engagement',
};

/**
 * TimingCalculator - Pure Domain Service
 *
 * Analyzes messages to determine optimal timing for different response types.
 * No I/O dependencies - pure logic.
 *
 * @example
 * ```typescript
 * const calculator = new TimingCalculator();
 *
 * const analysis = calculator.analyzeMessageTiming("I've been feeling really overwhelmed lately");
 *
 * if (!analysis.personalMomentAppropriate) {
 *   // Just listen, don't share personal stories
 * }
 * ```
 */
export class TimingCalculator {
  /**
   * Analyze a message to determine timing/response strategy
   */
  analyzeMessageTiming(message: string, metadata?: MessageMetadata): TimingAnalysis {
    const scores = new Map<UserIntent, number>();

    // Default metadata
    const meta: MessageMetadata = {
      wordCount: message.split(/\s+/).length,
      sentenceCount: message.split(/[.!?]/).filter((s) => s.trim()).length,
      hasQuestion: /\?/.test(message),
      ...metadata,
    };

    // Score all signal groups
    for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
      for (const signal of signals) {
        if (signal.test(message, meta)) {
          const current = scores.get(intent as UserIntent) ?? 0;
          scores.set(intent as UserIntent, current + signal.weight);
        }
      }
    }

    // Find highest scoring intent
    let maxIntent: UserIntent = 'processing_aloud';
    let maxScore = 0;

    for (const [intent, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        maxIntent = intent;
      }
    }

    // Determine appropriateness
    const personalMomentAppropriate = [
      'seeking_perspective',
      'open_to_connection',
      'processing_aloud',
    ].includes(maxIntent);

    const callbackAppropriate = ['open_to_connection', 'checking_in', 'small_talk'].includes(
      maxIntent
    );

    const patternInsightAppropriate = [
      'seeking_perspective',
      'open_to_connection',
      'processing_aloud',
    ].includes(maxIntent);

    // Build reasoning
    const reasoningParts: string[] = [];
    if (maxIntent === 'needs_to_be_heard') {
      reasoningParts.push('User shared a lot - they need to be heard first');
    }
    if (maxIntent === 'just_venting') {
      reasoningParts.push("They're venting - validate, don't redirect");
    }
    if (maxIntent === 'vulnerable_share') {
      reasoningParts.push('This is vulnerable - hold sacred space');
    }
    if (!personalMomentAppropriate) {
      reasoningParts.push('Not the right time for personal stories');
    }

    return {
      intent: maxIntent,
      confidence: Math.min(1, maxScore),
      suggestedResponse: RESPONSE_MAP[maxIntent],
      personalMomentAppropriate,
      callbackAppropriate,
      patternInsightAppropriate,
      reasoningNotes: reasoningParts.join('; ') || 'Standard engagement',
    };
  }

  /**
   * Should we share a personal moment right now?
   */
  shouldSharePersonalMoment(
    message: string,
    momentRelevance: number,
    emotionalState: EmotionalState,
    relationshipDepth: RelationshipDepth,
    metadata?: MessageMetadata
  ): { should: boolean; reason: string } {
    const timing = this.analyzeMessageTiming(message, metadata);

    // Crisis = never share
    if (emotionalState.isCrisisLevel) {
      return { should: false, reason: 'User is in crisis - focus on them' };
    }

    // Should hold space = don't share
    if (emotionalState.shouldHoldSpace) {
      return { should: false, reason: 'User needs space - hold, not share' };
    }

    // Venting = don't share
    if (timing.intent === 'just_venting') {
      return { should: false, reason: "They're venting - listen, don't share" };
    }

    // Vulnerable share = don't share
    if (timing.intent === 'vulnerable_share') {
      return { should: false, reason: 'This is sacred - hold space, not stories' };
    }

    // Needs to be heard = don't share unless VERY relevant
    if (timing.intent === 'needs_to_be_heard' && timing.confidence > 0.5) {
      if (momentRelevance < 0.85) {
        return { should: false, reason: 'They need to be heard first' };
      }
    }

    // Check relationship readiness
    if (!relationshipDepth.shouldProactivelyShare() && momentRelevance < 0.6) {
      return { should: false, reason: 'Relationship not ready for proactive sharing' };
    }

    // Good timing + relevant
    if (timing.personalMomentAppropriate && momentRelevance > 0.4) {
      return {
        should: true,
        reason: `Good timing (${timing.intent}) and relevant moment (${Math.round(momentRelevance * 100)}%)`,
      };
    }

    // High relevance can overcome neutral timing
    if (momentRelevance > 0.7) {
      return {
        should: true,
        reason: `High relevance (${Math.round(momentRelevance * 100)}%) makes it worth sharing`,
      };
    }

    return { should: false, reason: 'Timing or relevance not right' };
  }

  /**
   * Should we bring up a callback (follow-up on something they shared)?
   */
  shouldBringUpCallback(
    message: string,
    callbackUrgency: 'low' | 'medium' | 'high',
    emotionalState: EmotionalState,
    metadata?: MessageMetadata
  ): { should: boolean; reason: string } {
    const timing = this.analyzeMessageTiming(message, metadata);

    // Crisis = only if callback is about crisis support
    if (emotionalState.isCrisisLevel) {
      return { should: false, reason: 'User is in crisis - focus on immediate support' };
    }

    // Urgent callback can be brought up in more situations
    if (callbackUrgency === 'high' && timing.intent !== 'just_venting') {
      return {
        should: true,
        reason: 'Urgent callback - important to check in',
      };
    }

    // Standard callback timing
    if (timing.callbackAppropriate) {
      return {
        should: true,
        reason: `Good timing (${timing.intent}) for callback`,
      };
    }

    return { should: false, reason: 'Not the right moment for callbacks' };
  }

  /**
   * Should we surface a pattern insight?
   */
  shouldSurfacePatternInsight(
    message: string,
    patternConfidence: number,
    emotionalState: EmotionalState,
    relationshipDepth: RelationshipDepth,
    metadata?: MessageMetadata
  ): { should: boolean; reason: string } {
    const timing = this.analyzeMessageTiming(message, metadata);

    // Crisis = never
    if (emotionalState.isCrisisLevel) {
      return { should: false, reason: 'User is in crisis - no pattern surfacing' };
    }

    // Need trusted relationship for insights
    if (!relationshipDepth.canHandle('medium')) {
      return { should: false, reason: 'Relationship not deep enough for insights' };
    }

    // Declining trust = be careful
    if (relationshipDepth.isTrustDeclining) {
      return { should: false, reason: 'Trust is declining - not time for observations' };
    }

    // Check timing
    if (!timing.patternInsightAppropriate) {
      return { should: false, reason: `Not the right moment (${timing.intent})` };
    }

    // High confidence patterns in good timing
    if (patternConfidence > 0.7) {
      return {
        should: true,
        reason: `Good timing and high-confidence pattern (${Math.round(patternConfidence * 100)}%)`,
      };
    }

    // Moderate confidence needs perfect timing
    if (patternConfidence > 0.5 && timing.intent === 'seeking_perspective') {
      return {
        should: true,
        reason: 'They are seeking perspective - good for insight',
      };
    }

    return { should: false, reason: 'Confidence not high enough for current timing' };
  }

  /**
   * Format timing guidance for LLM prompt injection
   */
  formatTimingGuidance(analysis: TimingAnalysis): string {
    const responseGuidance: Record<SuggestedResponse, string> = {
      deep_listening:
        'LISTEN fully. Minimal words. Let them know you heard every bit of what they said.',
      validation:
        "Validate their feelings. 'That makes sense' / 'Of course you feel that way' / 'Anyone would'",
      reflection: 'Reflect back what you heard. Help them process by mirroring their thoughts.',
      share_story: 'This is a good moment to share something personal IF it serves them (not you).',
      ask_more: 'Be curious. Ask gentle follow-up questions. Show genuine interest.',
      celebrate: 'Match their energy! This is THEIR moment - be fully in it with them.',
      hold_space: "This is sacred. Acknowledge the courage it took to share. Don't rush to fix.",
      gentle_guidance:
        "They're asking for perspective. You can offer thoughts, but keep them centered.",
      light_engagement: "Keep it light and warm. Don't over-invest in small talk.",
    };

    return [
      '[⏱️ TIMING INTELLIGENCE]',
      '',
      `User intent: ${analysis.intent}`,
      `Confidence: ${Math.round(analysis.confidence * 100)}%`,
      `Response mode: ${analysis.suggestedResponse}`,
      '',
      `Guidance: ${responseGuidance[analysis.suggestedResponse]}`,
      '',
      `Personal moments: ${analysis.personalMomentAppropriate ? '✅ OK if relevant' : '❌ Not now'}`,
      `Callbacks: ${analysis.callbackAppropriate ? '✅ OK to bring up' : '❌ Not now'}`,
      `Pattern insights: ${analysis.patternInsightAppropriate ? '✅ OK if gentle' : '❌ Not now'}`,
      analysis.reasoningNotes ? `\nNote: ${analysis.reasoningNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
