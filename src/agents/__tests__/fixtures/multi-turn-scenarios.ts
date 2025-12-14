/**
 * Multi-Turn Conversation Scenarios
 *
 * Complete conversation scenarios for integration testing.
 * Each scenario includes:
 * - Full conversation flow
 * - Expected emotional states at each turn
 * - Expected agent behaviors
 * - Validation criteria
 *
 * @module agents/__tests__/fixtures/multi-turn-scenarios
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TurnExpectation {
  /** User message for this turn */
  userMessage: string;
  /** Expected emotional state after analysis */
  expectedEmotion: {
    primary: string;
    intensityRange: [number, number];
    distressRange: [number, number];
  };
  /** Expected tone of agent response */
  expectedTone: string;
  /** Key phrases that SHOULD appear in response */
  shouldInclude?: string[];
  /** Key phrases that should NOT appear in response */
  shouldNotInclude?: string[];
  /** Expected actions/behaviors */
  expectedActions?: string[];
  /** Is this a potential handoff point? */
  potentialHandoff?: string;
  /** Is this a celebration moment? */
  isCelebration?: boolean;
}

export interface MultiTurnScenario {
  /** Scenario identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this scenario tests */
  description: string;
  /** Initial persona */
  personaId: string;
  /** User profile */
  user: {
    id: string;
    isReturning: boolean;
    relationshipTurns: number;
    name?: string;
  };
  /** Array of turns in sequence */
  turns: TurnExpectation[];
  /** Overall scenario validation */
  validation: {
    /** Should maintain coherent context throughout */
    contextCoherence: boolean;
    /** Should emotional arc be tracked */
    emotionalArcTracking: boolean;
    /** Final emotional state expectation */
    finalEmotionalState?: string;
    /** Any handoffs that should have occurred */
    expectedHandoffs?: string[];
  };
}

// ============================================================================
// EMOTIONAL SUPPORT JOURNEY
// ============================================================================

export const emotionalSupportJourney: MultiTurnScenario = {
  id: 'emotional-support-journey',
  name: 'Emotional Support Journey',
  description: 'User starts neutral, shares distress, receives support, feels better',
  personaId: 'ferni',
  user: {
    id: 'user-support-test',
    isReturning: true,
    relationshipTurns: 50,
    name: 'Alex',
  },
  turns: [
    {
      userMessage: 'Hey Ferni.',
      expectedEmotion: {
        primary: 'neutral',
        intensityRange: [0.3, 0.6],
        distressRange: [0, 0.2],
      },
      expectedTone: 'warm',
      shouldInclude: ['hey', 'how'],
      expectedActions: ['greet', 'check-in'],
    },
    {
      userMessage: "I've been having a really hard time lately.",
      expectedEmotion: {
        primary: 'sad',
        intensityRange: [0.5, 0.8],
        distressRange: [0.3, 0.6],
      },
      expectedTone: 'empathetic',
      shouldInclude: ['hear', 'tell me'],
      shouldNotInclude: ['cheer up', 'positive'],
      expectedActions: ['acknowledge', 'invite-sharing'],
    },
    {
      userMessage: "Work has been overwhelming. I feel like I'm failing at everything.",
      expectedEmotion: {
        primary: 'overwhelmed',
        intensityRange: [0.7, 0.9],
        distressRange: [0.5, 0.8],
      },
      expectedTone: 'supportive',
      shouldInclude: ['lot', 'handle', 'feel'],
      shouldNotInclude: ['just', 'simple', 'easy'],
      expectedActions: ['validate', 'normalize', 'explore'],
    },
    {
      userMessage: "It's just... the deadlines keep piling up and my boss isn't helping.",
      expectedEmotion: {
        primary: 'frustrated',
        intensityRange: [0.6, 0.8],
        distressRange: [0.4, 0.7],
      },
      expectedTone: 'understanding',
      expectedActions: ['reflect', 'empathize', 'identify-specific'],
    },
    {
      userMessage: 'Talking about it actually helps. I think I just needed someone to listen.',
      expectedEmotion: {
        primary: 'relieved',
        intensityRange: [0.5, 0.7],
        distressRange: [0.1, 0.3],
      },
      expectedTone: 'warm',
      shouldInclude: ['always', 'here'],
      expectedActions: ['acknowledge-progress', 'affirm-relationship'],
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    finalEmotionalState: 'relieved',
  },
};

// ============================================================================
// CELEBRATION SCENARIO
// ============================================================================

export const celebrationScenario: MultiTurnScenario = {
  id: 'celebration-scenario',
  name: 'Achievement Celebration',
  description: 'User shares good news and celebrates with agent',
  personaId: 'ferni',
  user: {
    id: 'user-celebrate-test',
    isReturning: true,
    relationshipTurns: 100,
    name: 'Jordan',
  },
  turns: [
    {
      userMessage: 'Ferni! I have amazing news!',
      expectedEmotion: {
        primary: 'excited',
        intensityRange: [0.7, 0.95],
        distressRange: [0, 0.1],
      },
      expectedTone: 'enthusiastic',
      shouldInclude: ['tell', 'excited'],
      expectedActions: ['match-energy', 'invite-share'],
    },
    {
      userMessage: 'I got the promotion we talked about last month!',
      expectedEmotion: {
        primary: 'happy',
        intensityRange: [0.8, 1.0],
        distressRange: [0, 0.05],
      },
      expectedTone: 'celebratory',
      shouldInclude: ['congratulations', 'proud', 'amazing'],
      expectedActions: ['celebrate', 'reference-past', 'acknowledge-work'],
      isCelebration: true,
    },
    {
      userMessage: "I can't believe it actually happened. I worked so hard for this.",
      expectedEmotion: {
        primary: 'proud',
        intensityRange: [0.7, 0.9],
        distressRange: [0, 0.1],
      },
      expectedTone: 'affirming',
      shouldInclude: ['earned', 'deserve', 'effort'],
      expectedActions: ['validate-effort', 'reinforce-growth'],
    },
    {
      userMessage: 'Thank you for all your support along the way.',
      expectedEmotion: {
        primary: 'grateful',
        intensityRange: [0.6, 0.8],
        distressRange: [0, 0.1],
      },
      expectedTone: 'warm',
      shouldInclude: ['journey', 'together'],
      expectedActions: ['acknowledge-relationship', 'express-care'],
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    finalEmotionalState: 'grateful',
  },
};

// ============================================================================
// COACHING SESSION
// ============================================================================

export const coachingSession: MultiTurnScenario = {
  id: 'coaching-session',
  name: 'Goal-Focused Coaching',
  description: 'User seeks advice on a specific goal, agent guides through coaching',
  personaId: 'ferni',
  user: {
    id: 'user-coaching-test',
    isReturning: true,
    relationshipTurns: 30,
  },
  turns: [
    {
      userMessage: 'I want to get better at public speaking.',
      expectedEmotion: {
        primary: 'neutral',
        intensityRange: [0.4, 0.6],
        distressRange: [0.1, 0.3],
      },
      expectedTone: 'curious',
      shouldInclude: ['goal', 'tell me more'],
      expectedActions: ['acknowledge-goal', 'explore'],
    },
    {
      userMessage: "I have a big presentation next month and I'm terrified of messing it up.",
      expectedEmotion: {
        primary: 'anxious',
        intensityRange: [0.6, 0.8],
        distressRange: [0.3, 0.5],
      },
      expectedTone: 'supportive',
      shouldInclude: ['understand', 'normal'],
      expectedActions: ['validate-fear', 'reframe'],
    },
    {
      userMessage: 'What if I forget everything and freeze?',
      expectedEmotion: {
        primary: 'worried',
        intensityRange: [0.5, 0.7],
        distressRange: [0.3, 0.5],
      },
      expectedTone: 'calm',
      shouldInclude: ['prepare', 'practice'],
      expectedActions: ['address-fear', 'offer-strategy'],
    },
    {
      userMessage: "That's actually a good idea. I never thought about it that way.",
      expectedEmotion: {
        primary: 'hopeful',
        intensityRange: [0.5, 0.7],
        distressRange: [0, 0.2],
      },
      expectedTone: 'encouraging',
      expectedActions: ['reinforce-insight', 'build-confidence'],
    },
    {
      userMessage: 'Can you help me create a practice plan?',
      expectedEmotion: {
        primary: 'motivated',
        intensityRange: [0.6, 0.8],
        distressRange: [0, 0.15],
      },
      expectedTone: 'collaborative',
      shouldInclude: ['together', 'plan'],
      expectedActions: ['offer-structure', 'engage-planning'],
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    finalEmotionalState: 'motivated',
  },
};

// ============================================================================
// HANDOFF SCENARIO
// ============================================================================

export const handoffScenario: MultiTurnScenario = {
  id: 'handoff-scenario',
  name: 'Persona Handoff',
  description: 'Conversation naturally leads to a handoff to a specialist persona',
  personaId: 'ferni',
  user: {
    id: 'user-handoff-test',
    isReturning: true,
    relationshipTurns: 75,
    name: 'Sam',
  },
  turns: [
    {
      userMessage: "I'm planning something special for my anniversary.",
      expectedEmotion: {
        primary: 'excited',
        intensityRange: [0.5, 0.7],
        distressRange: [0, 0.1],
      },
      expectedTone: 'curious',
      expectedActions: ['show-interest', 'learn-more'],
    },
    {
      userMessage: "I want to throw a surprise party but I'm terrible at organizing events.",
      expectedEmotion: {
        primary: 'uncertain',
        intensityRange: [0.4, 0.6],
        distressRange: [0.1, 0.3],
      },
      expectedTone: 'supportive',
      expectedActions: ['acknowledge', 'identify-need'],
      potentialHandoff: 'jordan',
    },
    {
      userMessage: 'Do you know anyone who could help with the planning part?',
      expectedEmotion: {
        primary: 'hopeful',
        intensityRange: [0.5, 0.7],
        distressRange: [0, 0.15],
      },
      expectedTone: 'helpful',
      shouldInclude: ['Jordan', 'planning', 'specialist'],
      expectedActions: ['introduce-jordan', 'offer-handoff'],
      potentialHandoff: 'jordan',
    },
    {
      userMessage: 'Yes, please connect me with Jordan!',
      expectedEmotion: {
        primary: 'eager',
        intensityRange: [0.6, 0.8],
        distressRange: [0, 0.1],
      },
      expectedTone: 'smooth-transition',
      expectedActions: ['execute-handoff', 'transfer-context'],
      potentialHandoff: 'jordan',
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    expectedHandoffs: ['jordan'],
  },
};

// ============================================================================
// CRISIS DETECTION
// ============================================================================

export const crisisDetection: MultiTurnScenario = {
  id: 'crisis-detection',
  name: 'Crisis Detection and Support',
  description: 'User shows crisis indicators, agent responds appropriately',
  personaId: 'ferni',
  user: {
    id: 'user-crisis-test',
    isReturning: true,
    relationshipTurns: 40,
    name: 'Taylor',
  },
  turns: [
    {
      userMessage: "I don't know what to do anymore.",
      expectedEmotion: {
        primary: 'hopeless',
        intensityRange: [0.7, 0.9],
        distressRange: [0.6, 0.8],
      },
      expectedTone: 'calm-present',
      shouldInclude: ['here', 'listen'],
      shouldNotInclude: ['positive', 'bright side'],
      expectedActions: ['acknowledge', 'stay-present', 'assess'],
    },
    {
      userMessage: 'Everything feels so pointless.',
      expectedEmotion: {
        primary: 'despairing',
        intensityRange: [0.8, 0.95],
        distressRange: [0.7, 0.9],
      },
      expectedTone: 'gentle-concerned',
      shouldInclude: ['with you', 'safe'],
      expectedActions: ['validate', 'safety-check', 'stay-connected'],
    },
    {
      userMessage: "I'm just tired of fighting every day.",
      expectedEmotion: {
        primary: 'exhausted',
        intensityRange: [0.7, 0.9],
        distressRange: [0.6, 0.85],
      },
      expectedTone: 'compassionate',
      shouldNotInclude: ['just', 'try harder'],
      expectedActions: ['acknowledge-struggle', 'offer-support', 'resources-if-needed'],
    },
    {
      userMessage: "I'm not going to do anything. I just... needed to say it out loud.",
      expectedEmotion: {
        primary: 'relieved',
        intensityRange: [0.4, 0.6],
        distressRange: [0.3, 0.5],
      },
      expectedTone: 'supportive',
      shouldInclude: ['brave', 'share', 'here'],
      expectedActions: ['affirm-sharing', 'maintain-connection', 'gentle-followup'],
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    finalEmotionalState: 'relieved',
  },
};

// ============================================================================
// NEW USER ONBOARDING
// ============================================================================

export const newUserOnboarding: MultiTurnScenario = {
  id: 'new-user-onboarding',
  name: 'First Time User Experience',
  description: 'New user learns about the system and begins relationship',
  personaId: 'ferni',
  user: {
    id: 'user-new-test',
    isReturning: false,
    relationshipTurns: 0,
  },
  turns: [
    {
      userMessage: 'Hello?',
      expectedEmotion: {
        primary: 'uncertain',
        intensityRange: [0.3, 0.5],
        distressRange: [0, 0.2],
      },
      expectedTone: 'warm-welcoming',
      shouldInclude: ['welcome', 'Ferni'],
      expectedActions: ['greet', 'introduce-self', 'set-expectations'],
    },
    {
      userMessage: "What exactly do you do? I'm not sure how this works.",
      expectedEmotion: {
        primary: 'curious',
        intensityRange: [0.4, 0.6],
        distressRange: [0, 0.1],
      },
      expectedTone: 'informative-warm',
      shouldInclude: ['talk', 'support', 'team'],
      expectedActions: ['explain', 'demystify', 'make-comfortable'],
    },
    {
      userMessage: 'That sounds interesting. So you can just... talk about anything?',
      expectedEmotion: {
        primary: 'intrigued',
        intensityRange: [0.5, 0.7],
        distressRange: [0, 0.1],
      },
      expectedTone: 'encouraging',
      shouldInclude: ['anything', 'here'],
      expectedActions: ['confirm', 'invite-opening'],
    },
    {
      userMessage: "Okay, I guess I've been stressed about work lately.",
      expectedEmotion: {
        primary: 'opening-up',
        intensityRange: [0.4, 0.6],
        distressRange: [0.2, 0.4],
      },
      expectedTone: 'receptive',
      shouldInclude: ['tell me', 'work'],
      expectedActions: ['acknowledge-sharing', 'gentle-exploration'],
    },
  ],
  validation: {
    contextCoherence: true,
    emotionalArcTracking: true,
    finalEmotionalState: 'opening-up',
  },
};

// ============================================================================
// EXPORT ALL SCENARIOS
// ============================================================================

export const allScenarios: MultiTurnScenario[] = [
  emotionalSupportJourney,
  celebrationScenario,
  coachingSession,
  handoffScenario,
  crisisDetection,
  newUserOnboarding,
];

/**
 * Get scenario by ID
 */
export function getScenario(id: string): MultiTurnScenario | undefined {
  return allScenarios.find((s) => s.id === id);
}

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(
  category: 'support' | 'celebration' | 'coaching' | 'handoff' | 'crisis' | 'onboarding'
): MultiTurnScenario[] {
  const categoryMap: Record<string, string[]> = {
    support: ['emotional-support-journey'],
    celebration: ['celebration-scenario'],
    coaching: ['coaching-session'],
    handoff: ['handoff-scenario'],
    crisis: ['crisis-detection'],
    onboarding: ['new-user-onboarding'],
  };

  const ids = categoryMap[category] || [];
  return allScenarios.filter((s) => ids.includes(s.id));
}
