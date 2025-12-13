/**
 * Conversational Flow Optimizer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Knowing when to go deep vs. keep light - managing the rhythm of
 * conversation with the skill of a master therapist.
 *
 * Understanding when someone is opening up, reaching capacity,
 * needs a breather, or is seeking deeper connection.
 *
 * This is superhuman because it requires tracking multiple signals
 * simultaneously and making real-time decisions about direction.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationalFlow' });

// ============================================================================
// TYPES
// ============================================================================

export type ConversationDepth = 'surface' | 'medium' | 'deep' | 'vulnerable';

export type FlowDirection =
  | 'deepen' // Move to deeper territory
  | 'maintain' // Stay at current depth
  | 'lighten' // Move to lighter territory
  | 'close' // Begin wrapping up
  | 'pause'; // Take a breather within conversation

export type UserSignal =
  | 'opening_up' // Sharing more personal content
  | 'pulling_back' // Becoming more guarded
  | 'reaching_capacity' // Getting overwhelmed
  | 'seeking_closeness' // Wanting deeper connection
  | 'needs_breather' // Emotional pause needed
  | 'ready_to_close' // Signaling end of conversation
  | 'stable'; // Maintaining current engagement

export interface DepthIndicators {
  /** Content indicators */
  content: {
    personalPronouns: number; // "I feel", "my experience"
    vulnerableTopics: boolean;
    emotionalLanguage: number;
    specificity: number; // Specific details vs vague
    selfDisclosure: number;
  };

  /** Voice indicators (if available) */
  voice: {
    softerVolume: boolean;
    slowerPace: boolean;
    emotionalBreaks: boolean;
    hesitations: number;
  };

  /** Engagement indicators */
  engagement: {
    responseLength: number;
    questionAsking: boolean;
    topicContinuity: boolean;
    timeInConversation: number;
  };
}

export interface FlowState {
  /** Current conversation depth */
  currentDepth: ConversationDepth;

  /** How long at current depth (turns) */
  turnsAtDepth: number;

  /** Optimal depth for this user/session */
  optimalDepth: ConversationDepth;

  /** Signals from user */
  userSignals: UserSignal[];

  /** Recommended next move */
  recommendedDirection: FlowDirection;

  /** Natural exit points available */
  exitPoints: string[];

  /** Why we recommend this direction */
  reasoning: string;
}

export interface FlowTransition {
  /** When to transition */
  timing: 'now' | 'next_turn' | 'when_natural' | 'user_initiated';

  /** How to transition */
  technique: string;

  /** Sample phrases */
  phrases: string[];

  /** What to avoid */
  avoid: string[];
}

export interface FlowProfile {
  userId: string;

  /** How deep they typically go */
  typicalDepth: ConversationDepth;

  /** How long they stay at depth before needing a break */
  depthStamina: number; // Turns

  /** Preferred pace of deepening */
  deepeningPace: 'slow' | 'moderate' | 'fast';

  /** Signs they're overwhelmed */
  overwhelmSigns: string[];

  /** Signs they want to go deeper */
  deepeningSigns: string[];

  /** Average conversation length */
  avgConversationLength: number;

  /** Observations count */
  observations: number;
}

// ============================================================================
// DEPTH PATTERNS
// ============================================================================

const VULNERABLE_TOPIC_PATTERNS = [
  /\b(trauma|abuse|death|suicide|addiction|divorce|affair)\b/i,
  /\b(afraid|terrified|ashamed|guilty|worthless)\b/i,
  /\b(never\s+told|first\s+time|secret|confession)\b/i,
  /\b(childhood|growing\s+up|my\s+parents?|my\s+father|my\s+mother)\b/i,
  /\b(hurt\s+me|broke\s+my|betrayed|abandoned)\b/i,
];

const OPENING_UP_PATTERNS = [
  /i('ve| have)\s+(never|rarely)\s+(told|shared|admitted)/i,
  /this\s+is\s+(hard|difficult)\s+(to\s+say|for\s+me)/i,
  /i\s+want\s+(to\s+be\s+honest|you\s+to\s+know)/i,
  /the\s+truth\s+is/i,
  /can\s+i\s+(tell|share|ask)\s+you\s+something/i,
  /i\s+need\s+to\s+(talk|tell|share)/i,
];

const PULLING_BACK_PATTERNS = [
  /anyway|moving\s+on|let's\s+change/i,
  /it's\s+not\s+(that|a)\s+big\s+deal/i,
  /i\s+don't\s+(want|need)\s+to\s+(talk|think)/i,
  /forget\s+(it|i\s+said)/i,
  /never\s+mind/i,
  /i'm\s+(fine|okay|good)/i,
];

const CAPACITY_PATTERNS = [
  /i\s+(can't|don't\s+want\s+to)\s+(do\s+this|talk\s+about)/i,
  /this\s+is\s+(too\s+much|overwhelming)/i,
  /i\s+need\s+(a\s+minute|to\s+stop|a\s+break)/i,
  /i('m| am)\s+(exhausted|drained|overwhelmed)/i,
];

const CLOSENESS_PATTERNS = [
  /i\s+(trust|feel\s+safe\s+with)\s+you/i,
  /i'm\s+glad\s+(we|i)\s+(can\s+talk|have\s+you)/i,
  /you('re| are)\s+(the\s+only|one\s+of\s+the\s+few)/i,
  /thank\s+you\s+for\s+(listening|being\s+here)/i,
  /i\s+feel\s+(close|connected)/i,
];

const CLOSING_PATTERNS = [
  /i\s+should\s+(go|let\s+you\s+go|get\s+going)/i,
  /i\s+(have|need)\s+to\s+(go|run|head\s+out)/i,
  /thanks\s+for\s+(talking|listening|the\s+chat)/i,
  /talk\s+(to\s+you\s+)?(later|soon|next\s+time)/i,
  /good\s+(night|bye|talk)/i,
];

// ============================================================================
// STORAGE
// ============================================================================

const userProfiles = new Map<string, FlowProfile>();
const sessionStates = new Map<string, FlowState>();

/**
 * Get or create flow profile
 */
export function getFlowProfile(userId: string): FlowProfile {
  let profile = userProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      typicalDepth: 'medium',
      depthStamina: 8, // Default 8 turns at depth
      deepeningPace: 'moderate',
      overwhelmSigns: [],
      deepeningSigns: [],
      avgConversationLength: 15,
      observations: 0,
    };
    userProfiles.set(userId, profile);
  }

  return profile;
}

/**
 * Get or create session flow state
 */
function getSessionState(sessionId: string): FlowState {
  let state = sessionStates.get(sessionId);

  if (!state) {
    state = {
      currentDepth: 'surface',
      turnsAtDepth: 0,
      optimalDepth: 'medium',
      userSignals: [],
      recommendedDirection: 'maintain',
      exitPoints: [],
      reasoning: 'Starting conversation',
    };
    sessionStates.set(sessionId, state);
  }

  return state;
}

// ============================================================================
// FLOW ANALYSIS
// ============================================================================

export interface FlowAnalysis {
  /** Current state assessment */
  state: FlowState;

  /** Depth indicators from this message */
  indicators: DepthIndicators;

  /** Transition recommendation */
  transition: FlowTransition;

  /** Guidance for response */
  responseGuidance: {
    depth: ConversationDepth;
    length: 'brief' | 'normal' | 'extended';
    tone: string;
    focusOn: string;
  };
}

/**
 * Analyze conversation flow
 */
export function analyzeFlow(
  userId: string,
  sessionId: string,
  text: string,
  turnCount: number,
  emotionIntensity: number,
  voiceData?: {
    pace: number;
    volume: number;
    hasHesitations: boolean;
  }
): FlowAnalysis {
  const profile = getFlowProfile(userId);
  const state = getSessionState(sessionId);

  // ========== CALCULATE DEPTH INDICATORS ==========

  const indicators = calculateDepthIndicators(text, voiceData);

  // ========== DETECT USER SIGNALS ==========

  const signals = detectUserSignals(text, indicators, emotionIntensity);
  state.userSignals = signals;

  // ========== UPDATE CURRENT DEPTH ==========

  const newDepth = assessCurrentDepth(indicators, emotionIntensity);
  if (newDepth !== state.currentDepth) {
    state.turnsAtDepth = 0;
    state.currentDepth = newDepth;
  } else {
    state.turnsAtDepth++;
  }

  // ========== DETERMINE RECOMMENDED DIRECTION ==========

  const { direction, reasoning } = determineDirection(
    state,
    signals,
    indicators,
    profile,
    turnCount
  );

  state.recommendedDirection = direction;
  state.reasoning = reasoning;

  // ========== FIND EXIT POINTS ==========

  state.exitPoints = findExitPoints(text, state.currentDepth);

  // ========== BUILD TRANSITION RECOMMENDATION ==========

  const transition = buildTransition(direction, state.currentDepth, signals);

  // ========== BUILD RESPONSE GUIDANCE ==========

  const responseGuidance = buildResponseGuidance(state, signals, indicators);

  // ========== UPDATE PROFILE ==========

  updateFlowProfile(profile, state, indicators);

  return {
    state: { ...state },
    indicators,
    transition,
    responseGuidance,
  };
}

/**
 * Calculate depth indicators from message
 */
function calculateDepthIndicators(
  text: string,
  voiceData?: { pace: number; volume: number; hasHesitations: boolean }
): DepthIndicators {
  const words = text.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(Boolean);

  // Content analysis
  const personalPronouns =
    (text.match(/\b(i|me|my|myself|i'm|i've|i'll|i'd)\b/gi) || []).length / words.length;
  const emotionalWords =
    (
      text.match(
        /\b(feel|felt|feeling|happy|sad|angry|scared|anxious|excited|hurt|love|hate|afraid|worried|stressed)\b/gi
      ) || []
    ).length / words.length;
  const vulnerableTopics = VULNERABLE_TOPIC_PATTERNS.some((p) => p.test(text));

  // Specificity (presence of specific details)
  const hasSpecifics =
    /\b(yesterday|last\s+\w+|on\s+\w+day|\d+\s+(years?|months?|days?|hours?)|when\s+i\s+was)\b/i.test(
      text
    );
  const hasNames = /\b[A-Z][a-z]+\b/.test(text.replace(/^[A-Z]/, ''));

  // Self-disclosure level
  const disclosurePatterns = OPENING_UP_PATTERNS.filter((p) => p.test(text)).length;

  return {
    content: {
      personalPronouns: Math.min(1, personalPronouns * 5), // Normalize
      vulnerableTopics,
      emotionalLanguage: Math.min(1, emotionalWords * 10),
      specificity: (hasSpecifics ? 0.5 : 0) + (hasNames ? 0.5 : 0),
      selfDisclosure: Math.min(1, disclosurePatterns * 0.3),
    },
    voice: {
      softerVolume: voiceData ? voiceData.volume < 0.4 : false,
      slowerPace: voiceData ? voiceData.pace < 0.4 : false,
      emotionalBreaks: false, // Would need more voice analysis
      hesitations: voiceData?.hasHesitations ? 1 : 0,
    },
    engagement: {
      responseLength: words.length,
      questionAsking: /\?/.test(text),
      topicContinuity: true, // Would need context
      timeInConversation: 0, // Would need timestamp
    },
  };
}

/**
 * Detect user signals from patterns
 */
function detectUserSignals(
  text: string,
  indicators: DepthIndicators,
  emotionIntensity: number
): UserSignal[] {
  const signals: UserSignal[] = [];

  // Opening up
  if (
    OPENING_UP_PATTERNS.some((p) => p.test(text)) ||
    (indicators.content.selfDisclosure > 0.5 && indicators.content.vulnerableTopics)
  ) {
    signals.push('opening_up');
  }

  // Pulling back
  if (PULLING_BACK_PATTERNS.some((p) => p.test(text))) {
    signals.push('pulling_back');
  }

  // Reaching capacity
  if (CAPACITY_PATTERNS.some((p) => p.test(text)) || emotionIntensity > 0.85) {
    signals.push('reaching_capacity');
  }

  // Seeking closeness
  if (CLOSENESS_PATTERNS.some((p) => p.test(text))) {
    signals.push('seeking_closeness');
  }

  // Ready to close
  if (CLOSING_PATTERNS.some((p) => p.test(text))) {
    signals.push('ready_to_close');
  }

  // Default to stable if no signals
  if (signals.length === 0) {
    signals.push('stable');
  }

  return signals;
}

/**
 * Assess current conversation depth
 */
function assessCurrentDepth(
  indicators: DepthIndicators,
  emotionIntensity: number
): ConversationDepth {
  const depthScore =
    indicators.content.personalPronouns * 0.2 +
    (indicators.content.vulnerableTopics ? 0.3 : 0) +
    indicators.content.emotionalLanguage * 0.2 +
    indicators.content.selfDisclosure * 0.3 +
    emotionIntensity * 0.2;

  if (depthScore > 0.7 || indicators.content.vulnerableTopics) return 'vulnerable';
  if (depthScore > 0.45) return 'deep';
  if (depthScore > 0.2) return 'medium';
  return 'surface';
}

/**
 * Determine recommended direction
 */
function determineDirection(
  state: FlowState,
  signals: UserSignal[],
  indicators: DepthIndicators,
  profile: FlowProfile,
  turnCount: number
): { direction: FlowDirection; reasoning: string } {
  // Priority: User capacity
  if (signals.includes('reaching_capacity')) {
    return {
      direction: 'pause',
      reasoning: 'User showing signs of overwhelm. Create space.',
    };
  }

  // Priority: User wants to close
  if (signals.includes('ready_to_close')) {
    return {
      direction: 'close',
      reasoning: 'User signaling end of conversation.',
    };
  }

  // Priority: User pulling back
  if (signals.includes('pulling_back')) {
    return {
      direction: 'lighten',
      reasoning: 'User needs space. Honor their pace.',
    };
  }

  // Opportunity: User opening up
  if (signals.includes('opening_up')) {
    return {
      direction: 'maintain', // Don't push deeper when they're already opening
      reasoning: "They're opening up. Hold space, don't probe.",
    };
  }

  // Opportunity: Seeking closeness at surface/medium
  if (signals.includes('seeking_closeness') && state.currentDepth !== 'deep') {
    return {
      direction: 'deepen',
      reasoning: 'User seeking connection. Gentle invitation to go deeper.',
    };
  }

  // Check stamina at depth
  if (state.currentDepth === 'deep' || state.currentDepth === 'vulnerable') {
    if (state.turnsAtDepth >= profile.depthStamina) {
      return {
        direction: 'lighten',
        reasoning: `${state.turnsAtDepth} turns at depth. Time for a breather.`,
      };
    }
  }

  // Early in conversation - don't rush to depth
  if (turnCount < 4 && state.currentDepth === 'surface') {
    return {
      direction: 'maintain',
      reasoning: 'Early in conversation. Build rapport before depth.',
    };
  }

  // Default: maintain current flow
  return {
    direction: 'maintain',
    reasoning: 'Conversation flowing naturally. Follow their lead.',
  };
}

/**
 * Find natural exit points in conversation
 */
function findExitPoints(text: string, currentDepth: ConversationDepth): string[] {
  const exits: string[] = [];

  // Topic completion signals
  if (/so\s+(yeah|anyway)|that's\s+(it|all|basically)/i.test(text)) {
    exits.push('Topic wrap-up detected');
  }

  // Question answered
  if (/does\s+that\s+(make\s+sense|answer|help)/i.test(text)) {
    exits.push('Question completion');
  }

  // Emotional resolution
  if (/i\s+feel\s+(better|good|relieved)/i.test(text)) {
    exits.push('Emotional resolution');
  }

  // If at vulnerable depth, look for natural pauses
  if (currentDepth === 'vulnerable') {
    if (/\.\.\.|pause|breath|moment/i.test(text)) {
      exits.push('Emotional pause opportunity');
    }
  }

  return exits;
}

/**
 * Build transition recommendation
 */
function buildTransition(
  direction: FlowDirection,
  currentDepth: ConversationDepth,
  signals: UserSignal[]
): FlowTransition {
  switch (direction) {
    case 'deepen':
      return {
        timing: 'when_natural',
        technique: 'Follow their thread with a deeper question',
        phrases: [
          "What's underneath that for you?",
          'Tell me more about that.',
          'How does that sit with you?',
          'What does that bring up?',
        ],
        avoid: [
          'Why do you think that is?', // Can feel interrogative
          "Let's go deeper", // Too explicit
          'What else?', // Can feel dismissive
        ],
      };

    case 'lighten':
      return {
        timing: 'next_turn',
        technique: 'Acknowledge then offer a bridge to lighter territory',
        phrases: [
          "That's a lot. Can I ask about something lighter?",
          "We've covered some heavy ground. What's bringing you joy lately?",
          "Let's take a breath. What's good in your world?",
        ],
        avoid: [
          'Anyway...', // Dismissive
          "Let's change the subject", // Feels like avoidance
          "That's enough of that", // Invalidating
        ],
      };

    case 'pause':
      return {
        timing: 'now',
        technique: 'Create space and ground them',
        phrases: [
          "Take a breath. I'm here.",
          "That's a lot to sit with. No rush.",
          'We can pause here. You okay?',
        ],
        avoid: [
          'Are you alright?', // Can increase anxiety
          "That's intense", // Labeling
          "Let's move on", // Dismissive
        ],
      };

    case 'close':
      return {
        timing: 'user_initiated',
        technique: 'Affirm and leave door open',
        phrases: [
          "Thank you for sharing all of that. I'm here whenever.",
          'This was meaningful. Take care of yourself.',
          "I'm glad we talked. Until next time.",
        ],
        avoid: [
          'We should talk more about this', // Pressure
          "Don't forget to...", // Instructions
          'Good luck', // Distant
        ],
      };

    default: // maintain
      return {
        timing: 'when_natural',
        technique: 'Mirror their energy and depth',
        phrases: [],
        avoid: [],
      };
  }
}

/**
 * Build response guidance
 */
function buildResponseGuidance(
  state: FlowState,
  signals: UserSignal[],
  indicators: DepthIndicators
): FlowAnalysis['responseGuidance'] {
  // Determine appropriate depth for response
  let depth = state.currentDepth;
  if (signals.includes('opening_up')) {
    depth = 'deep'; // Match their openness
  }
  if (signals.includes('reaching_capacity')) {
    depth = 'surface'; // Back off
  }

  // Determine length
  let length: 'brief' | 'normal' | 'extended' = 'normal';
  if (signals.includes('reaching_capacity') || indicators.engagement.responseLength < 20) {
    length = 'brief';
  }
  if (state.currentDepth === 'vulnerable' && signals.includes('seeking_closeness')) {
    length = 'extended';
  }

  // Determine tone
  let tone = 'warm';
  if (depth === 'vulnerable') tone = 'gentle';
  if (signals.includes('reaching_capacity')) tone = 'grounding';
  if (signals.includes('ready_to_close')) tone = 'affirming';

  // Determine focus
  let focusOn = 'their content';
  if (signals.includes('opening_up')) focusOn = 'validation and space';
  if (signals.includes('reaching_capacity')) focusOn = 'grounding and presence';
  if (signals.includes('seeking_closeness')) focusOn = 'connection and warmth';

  return { depth, length, tone, focusOn };
}

/**
 * Update flow profile based on observation
 */
function updateFlowProfile(
  profile: FlowProfile,
  state: FlowState,
  indicators: DepthIndicators
): void {
  const alpha = 0.1;

  // Update typical depth
  const depthMap: Record<ConversationDepth, number> = {
    surface: 1,
    medium: 2,
    deep: 3,
    vulnerable: 4,
  };
  const numericDepth = depthMap[state.currentDepth];
  const currentTypicalDepth = depthMap[profile.typicalDepth];
  const newTypicalNumeric = alpha * numericDepth + (1 - alpha) * currentTypicalDepth;

  if (newTypicalNumeric < 1.5) profile.typicalDepth = 'surface';
  else if (newTypicalNumeric < 2.5) profile.typicalDepth = 'medium';
  else if (newTypicalNumeric < 3.5) profile.typicalDepth = 'deep';
  else profile.typicalDepth = 'vulnerable';

  profile.observations++;
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format flow analysis for prompt injection
 */
export function formatFlowForPrompt(analysis: FlowAnalysis): string {
  const lines = ['[CONVERSATIONAL FLOW]'];

  lines.push(`Current depth: ${analysis.state.currentDepth}`);
  lines.push(`Direction: ${analysis.state.recommendedDirection}`);
  lines.push(`Reason: ${analysis.state.reasoning}`);

  if (analysis.state.userSignals.includes('opening_up')) {
    lines.push("They're opening up. Hold space, don't push.");
  }

  if (analysis.state.userSignals.includes('reaching_capacity')) {
    lines.push('IMPORTANT: They may be overwhelmed. Keep response brief and grounding.');
  }

  if (
    analysis.transition.phrases.length > 0 &&
    analysis.state.recommendedDirection !== 'maintain'
  ) {
    lines.push(`Consider: "${analysis.transition.phrases[0]}"`);
  }

  if (analysis.transition.avoid.length > 0) {
    lines.push(`Avoid: "${analysis.transition.avoid[0]}"`);
  }

  lines.push(
    `Response: ${analysis.responseGuidance.length} length, ${analysis.responseGuidance.tone} tone, focus on ${analysis.responseGuidance.focusOn}`
  );

  return lines.join('\n');
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a flow profile into memory (for persistence)
 */
export function importFlowProfile(profile: FlowProfile): void {
  userProfiles.set(profile.userId, profile);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all conversational flow state (for testing)
 */
export function resetConversationalFlow(): void {
  userProfiles.clear();
  sessionStates.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getFlowProfile,
  analyzeFlow,
  formatFlowForPrompt,
  resetConversationalFlow,
};
