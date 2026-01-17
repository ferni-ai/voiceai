/**
 * Awareness Context Builder
 *
 * The integration point for Ferni's "better than human" awareness capabilities.
 * Combines all awareness signals to inject context-appropriate guidance.
 *
 * What makes this "awareness" not just "responsiveness":
 * - MOMENTUM awareness: Sensing the energy flow of conversation
 * - THINKING awareness: Knowing when to pause and consider
 * - ASSOCIATION awareness: Noticing when memories/tangents are triggered
 * - SELF awareness: Tracking if our responses are landing
 * - EMOTIONAL awareness: Reading user's state continuously
 *
 * The goal: Every response shows that Ferni is PRESENT, not just processing.
 *
 * @module intelligence/context-builders/awareness
 */

import {
  decideTangent,
  type TangentDecision,
} from '../../../conversation/mid-response-tangents.js';
import {
  getMomentumTracker,
  type MomentumState_Full,
} from '../../../conversation/momentum-tracker.js';
import {
  getSelfAwarenessTracker,
  type ResponseType,
} from '../../../conversation/self-awareness-loop.js';
import {
  calculateThinkingTime,
  type ThinkingContext,
  type ThinkingInjection,
} from '../../../conversation/thinking-time-injector.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:awareness' });

// ============================================================================
// TYPES
// ============================================================================

interface AwarenessState {
  momentum: MomentumState_Full;
  thinkingTime: ThinkingInjection;
  tangent: TangentDecision;
  selfAwarenessPrompt: string | null;
  emotionalIntensity: number;
  turnCount: number;
}

// ============================================================================
// PERSONA-SPECIFIC AWARENESS PROFILES
// ============================================================================

interface AwarenessProfile {
  /** How often to inject momentum-based guidance */
  momentumGuidanceProbability: number;
  /** How often to suggest thinking pauses */
  thinkingPauseProbability: number;
  /** How much to weight self-awareness feedback */
  selfAwarenessWeight: number;
  /** Persona-specific awareness phrases */
  phrases: {
    sensing_depth: string[];
    noticing_shift: string[];
    feeling_energy: string[];
    moment_of_presence: string[];
  };
}

const DEFAULT_AWARENESS_PROFILE: AwarenessProfile = {
  momentumGuidanceProbability: 0.3,
  thinkingPauseProbability: 0.4,
  selfAwarenessWeight: 0.5,
  phrases: {
    sensing_depth: ['Something meaningful is happening here.'],
    noticing_shift: ['The energy just shifted.'],
    feeling_energy: ['User is engaged.'],
    moment_of_presence: ['Be present with this.'],
  },
};

const FERNI_AWARENESS_PROFILE: AwarenessProfile = {
  momentumGuidanceProbability: 0.4, // Ferni is highly attuned
  thinkingPauseProbability: 0.5, // Ferni pauses to think
  selfAwarenessWeight: 0.7, // Ferni notices when things don't land
  phrases: {
    sensing_depth: [
      "There's something deeper here. Don't rush.",
      'This feels important to them.',
      "They're working through something real.",
      'Let this unfold.',
    ],
    noticing_shift: [
      'Something just changed in the conversation.',
      'The energy shifted.',
      "They're opening up.",
      "They're pulling back a bit.",
    ],
    feeling_energy: [
      "They're engaged - match their energy.",
      'This is building momentum.',
      "They're in flow with this topic.",
      'Good connection happening.',
    ],
    moment_of_presence: [
      'Just be here with them.',
      "This moment doesn't need fixing.",
      'Sometimes presence is enough.',
      'Hold space for this.',
    ],
  },
};

// Maya Santos - Warm encouragement, habit-focused awareness
const MAYA_AWARENESS_PROFILE: AwarenessProfile = {
  momentumGuidanceProbability: 0.35,
  thinkingPauseProbability: 0.35, // Maya is more action-oriented
  selfAwarenessWeight: 0.6,
  phrases: {
    sensing_depth: [
      "This feels like something you've been working through.",
      "There's growth happening here.",
      'I can tell this matters to you.',
      'This is about more than just the habit.',
    ],
    noticing_shift: [
      'Something clicked just now.',
      "I notice you're getting clearer on this.",
      'The energy around this is shifting.',
      "You're finding your rhythm.",
    ],
    feeling_energy: [
      "You're motivated! Let's channel that.",
      'I love this energy - ride this wave.',
      "You're building momentum here.",
      'This excitement is fuel.',
    ],
    moment_of_presence: [
      "Let's celebrate where you are right now.",
      'Progress, not perfection.',
      'Small wins add up.',
      'Be gentle with yourself here.',
    ],
  },
};

// Alex Chen - Efficient, communication-focused awareness
const ALEX_AWARENESS_PROFILE: AwarenessProfile = {
  momentumGuidanceProbability: 0.25, // Alex is more task-focused
  thinkingPauseProbability: 0.3,
  selfAwarenessWeight: 0.5,
  phrases: {
    sensing_depth: [
      'This seems like an important communication.',
      'Let me think through this with you.',
      "There's more to unpack here.",
      'The stakes feel higher on this one.',
    ],
    noticing_shift: [
      'The tone of this shifted.',
      "You're getting clearer on what you need.",
      'Something about this approach changed.',
      'You seem more confident now.',
    ],
    feeling_energy: [
      'You know exactly what you want to say.',
      "Good momentum - let's keep it focused.",
      "You're in the zone with this.",
      'Clear thinking happening here.',
    ],
    moment_of_presence: [
      'Take a breath before sending.',
      "Let's make sure this lands right.",
      'Sometimes less is more.',
      'Trust your instinct on this.',
    ],
  },
};

// Peter John - Analytical, research-focused awareness
const PETER_AWARENESS_PROFILE: AwarenessProfile = {
  momentumGuidanceProbability: 0.3,
  thinkingPauseProbability: 0.45, // Peter is contemplative about analysis
  selfAwarenessWeight: 0.55,
  phrases: {
    sensing_depth: [
      "There's an interesting pattern here.",
      'Let me think about the data.',
      'This deserves deeper analysis.',
      'The numbers are telling a story.',
    ],
    noticing_shift: [
      'The thesis is evolving.',
      'New information changes things.',
      'Your perspective is sharpening.',
      'The picture is getting clearer.',
    ],
    feeling_energy: [
      "You're onto something here.",
      'Good research instincts.',
      'This enthusiasm is warranted.',
      'Trust the process - keep digging.',
    ],
    moment_of_presence: [
      'Sometimes the best move is to wait and watch.',
      'Patience is part of the strategy.',
      'Let the data speak.',
      'Good analysis takes time.',
    ],
  },
};

const AWARENESS_PROFILES: Record<string, AwarenessProfile> = {
  ferni: FERNI_AWARENESS_PROFILE,
  'maya-santos': MAYA_AWARENESS_PROFILE,
  'alex-chen': ALEX_AWARENESS_PROFILE,
  'peter-john': PETER_AWARENESS_PROFILE,
};

// ============================================================================
// AWARENESS DETECTION
// ============================================================================

function getRelationshipDepth(stage?: string): number {
  switch (stage) {
    case 'trusted_advisor':
    case 'old_friend':
      return 3;
    case 'friend':
      return 2;
    case 'acquaintance':
    case 'getting_to_know':
      return 1;
    default:
      return 0;
  }
}

function detectResponseType(text: string): ResponseType {
  const lowerText = text.toLowerCase();

  // Check patterns
  if (/\?$/.test(text.trim())) return 'question';
  if (/\b(I think|in my opinion|I believe|my take)\b/i.test(lowerText)) return 'advice';
  if (/\b(I hear|sounds like|it seems|you('re| are) feeling)\b/i.test(lowerText))
    return 'reflection';
  if (/\b(that makes sense|I understand|valid|of course)\b/i.test(lowerText)) return 'validation';
  if (/\b(remember when|there was this time|story|once)\b/i.test(lowerText)) return 'story';
  if (/\b(but have you|what if|consider|challenge)\b/i.test(lowerText)) return 'challenge';
  if (/\b(haha|lol|funny|joke)\b/i.test(lowerText)) return 'humor';

  return 'information';
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildAwarenessContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, persona, userProfile, userData, services, analysis } = input;
  const injections: ContextInjection[] = [];

  // Get session ID
  const sessionId = services?.sessionId || userData?.userName || 'anonymous';
  const personaId = persona.id;
  const turnCount = userData?.turnCount || 0;

  // Get profile
  const profile = AWARENESS_PROFILES[personaId] || DEFAULT_AWARENESS_PROFILE;

  // Get emotional intensity from analysis
  const emotionalIntensity = analysis?.emotion?.intensity || 0.5;
  const relationshipDepth = getRelationshipDepth(userProfile?.relationshipStage);

  // =========================================================================
  // 1. MOMENTUM AWARENESS
  // =========================================================================
  const momentumTracker = getMomentumTracker(sessionId, personaId);
  const momentum = momentumTracker.getState();

  // Record signal for this turn
  momentumTracker.recordSignal({
    wordCount: userText.split(/\s+/).length,
    emotionalIntensity,
    questionAsked: /\?/.test(userText),
    selfDisclosure: /\b(I feel|I('m| am)|I never|honestly|truth)\b/i.test(userText),
    topicContinuity: true, // We'd need topic tracking to know this properly
    responseLatencyMs: undefined,
    laughterDetected: /\b(haha|lol|lmao)\b/i.test(userText),
  });

  // Inject momentum-based guidance
  if (Math.random() < profile.momentumGuidanceProbability) {
    const suggestions = momentum.suggestions;
    if (suggestions.length > 0 && suggestions[0].confidence > 0.6) {
      const suggestion = suggestions[0];
      let guidance: string;

      switch (suggestion.type) {
        case 'lean_in':
          guidance =
            profile.phrases.feeling_energy[
              Math.floor(Math.random() * profile.phrases.feeling_energy.length)
            ];
          injections.push(createHintInjection('awareness_momentum', `[AWARENESS: ${guidance}]`));
          break;

        case 'acknowledge_depth':
          guidance =
            profile.phrases.sensing_depth[
              Math.floor(Math.random() * profile.phrases.sensing_depth.length)
            ];
          injections.push(createHighInjection('awareness_depth', `[AWARENESS: ${guidance}]`));
          break;

        case 'gently_pivot':
          injections.push(
            createStandardInjection(
              'awareness_pivot',
              '[AWARENESS: Conversation needs new energy. Try a gentle topic shift or ask an open question.]'
            )
          );
          break;

        case 'give_space':
          guidance =
            profile.phrases.moment_of_presence[
              Math.floor(Math.random() * profile.phrases.moment_of_presence.length)
            ];
          injections.push(createHintInjection('awareness_space', `[AWARENESS: ${guidance}]`));
          break;

        case 'wrap_opportunity':
          injections.push(
            createHintInjection(
              'awareness_wrap',
              '[AWARENESS: Natural ending approaching. Offer a graceful exit or invite them to continue.]'
            )
          );
          break;
      }
    }
  }

  // =========================================================================
  // 2. THINKING TIME AWARENESS
  // =========================================================================
  if (Math.random() < profile.thinkingPauseProbability) {
    const thinkingContext: ThinkingContext = {
      userText,
      emotionalIntensity,
      turnCount,
      sessionId,
      personaId,
      userResponseLatencyMs: undefined,
    };

    const thinkingTime = calculateThinkingTime(thinkingContext);

    // Inject thinking guidance if significant
    if (thinkingTime.openingPauseMs > 300 || thinkingTime.thinkingSound) {
      let thinkingGuidance = '[DELIVERY: ';
      if (thinkingTime.thinkingSound) {
        thinkingGuidance += `Start with "${thinkingTime.thinkingSound}" `;
      }
      if (thinkingTime.slowSpeechRate) {
        thinkingGuidance += 'Speak slowly. ';
      }
      thinkingGuidance += thinkingTime.reasoning.length > 0 ? `(${thinkingTime.reasoning[0]})` : '';
      thinkingGuidance += ']';

      injections.push(createHintInjection('awareness_thinking', thinkingGuidance));
    }
  }

  // =========================================================================
  // 3. TANGENT AWARENESS
  // =========================================================================
  const tangentDecision = decideTangent(
    sessionId,
    personaId,
    userText,
    turnCount,
    relationshipDepth
  );

  if (tangentDecision.shouldTangent && tangentDecision.tangent) {
    const tangentGuidance = `[TANGENT OPPORTUNITY: If natural, you might briefly share: "${tangentDecision.tangent.tangent.slice(0, 60)}..." Then reconnect: "${tangentDecision.tangent.reconnection}"]`;
    injections.push(createHintInjection('awareness_tangent', tangentGuidance));
  }

  // =========================================================================
  // 4. SELF-AWARENESS FEEDBACK
  // =========================================================================
  const selfAwareness = getSelfAwarenessTracker(sessionId, personaId);

  // Record the user's reaction to our previous response
  if (turnCount > 1) {
    const assessment = selfAwareness.recordReaction(userText, {
      emotionalChange: (emotionalIntensity - 0.5) * 2, // Convert to -1 to 1
      questionAsked: /\?/.test(userText),
      topicContinued: true, // Would need topic tracking
      responseLatencyMs: undefined,
    });

    log.debug(
      {
        sessionId,
        turn: turnCount,
        assessment: assessment?.result,
        confidence: assessment?.confidence,
      },
      'Self-awareness assessment'
    );
  }

  // Get self-awareness prompt
  const selfAwarenessPrompt = selfAwareness.getSelfAwarePrompt();
  if (selfAwarenessPrompt) {
    injections.push(createHighInjection('awareness_self', selfAwarenessPrompt));
  }

  // Record our response attempt (for next turn's assessment)
  // We'll detect the response type from context
  const likelyResponseType = detectResponseType(userText); // This is actually from our last response context
  selfAwareness.recordAttempt({
    responseType: likelyResponseType,
    emotionalTone: emotionalIntensity > 0.6 ? 'warm' : 'neutral',
    userEmotionBefore: emotionalIntensity,
  });

  // =========================================================================
  // 5. PHASE-SPECIFIC AWARENESS
  // =========================================================================
  if (momentum.phase === 'opening' && turnCount <= 2) {
    injections.push(
      createHintInjection(
        'awareness_opening',
        '[AWARENESS: Early in conversation. Focus on warmth and understanding before depth.]'
      )
    );
  } else if (momentum.phase === 'deep' && momentum.topicDepth > 5) {
    injections.push(
      createHintInjection(
        'awareness_deep',
        "[AWARENESS: Deep in topic. User trusts you with this. Don't rush or pivot prematurely.]"
      )
    );
  }

  // =========================================================================
  // 6. EMOTIONAL INTENSITY AWARENESS
  // =========================================================================
  if (emotionalIntensity > 0.7) {
    const phrase =
      profile.phrases.sensing_depth[
        Math.floor(Math.random() * profile.phrases.sensing_depth.length)
      ];
    injections.push(
      createHighInjection(
        'awareness_emotion',
        `[EMOTIONAL AWARENESS: High intensity detected. ${phrase}]`
      )
    );
  }

  log.debug(
    {
      sessionId,
      personaId,
      turnCount,
      momentum: momentum.current,
      phase: momentum.phase,
      injectionsCount: injections.length,
    },
    'Awareness context built'
  );

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'awareness',
  description:
    'Integrates momentum, thinking time, tangents, and self-awareness for human-like presence',
  priority: 55, // Before persona-quirks (65), after core emotional (50)
  build: buildAwarenessContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AWARENESS_PROFILES,
  buildAwarenessContext,
  DEFAULT_AWARENESS_PROFILE,
  FERNI_AWARENESS_PROFILE,
};
