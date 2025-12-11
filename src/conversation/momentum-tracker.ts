/**
 * Conversation Momentum Tracker
 *
 * Tracks the "energy" and flow of a conversation in real-time.
 * This enables:
 * - Knowing when to lean in vs. give space
 * - Detecting when conversation is building vs. winding down
 * - Understanding emotional arcs over multiple turns
 * - Guiding natural transitions and tangents
 *
 * Philosophy: A real friend senses when you're on a roll and lets you go,
 * or when you're struggling and gently pivots. This tracker gives AI
 * that same conversational intuition.
 *
 * @module conversation/momentum-tracker
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  recordMomentumTransition,
  recordMomentumVelocity,
} from './awareness-metrics.js';

const log = createLogger({ module: 'momentum-tracker' });

// ============================================================================
// TYPES
// ============================================================================

export type MomentumState =
  | 'building' // Energy rising - user engaged, topic expanding
  | 'cruising' // Steady energy - good flow, maintain
  | 'peaking' // High energy moment - user breakthrough or excitement
  | 'winding_down' // Energy falling - natural end approaching
  | 'stalled' // Lost momentum - needs pivot or re-engagement
  | 'intimate'; // Slow, deep sharing - different kind of engagement

export type ConversationPhase =
  | 'opening' // First 1-3 turns
  | 'exploring' // 4-10 turns - getting into it
  | 'deep' // 10+ turns - established flow
  | 'closing'; // Wrapping up signals detected

export interface MomentumSignal {
  turn: number;
  timestamp: number;
  wordCount: number;
  emotionalIntensity: number; // 0-1 from prosody/content
  questionAsked: boolean;
  selfDisclosure: boolean; // User shared something personal
  topicContinuity: boolean; // Same topic as previous
  responseLatencyMs?: number;
  laughterDetected?: boolean;
  silenceDuration?: number;
}

export interface MomentumState_Full {
  current: MomentumState;
  phase: ConversationPhase;
  trend: 'rising' | 'steady' | 'falling';
  velocity: number; // -1 to 1, speed of change
  score: number; // 0-1 overall momentum
  turnsInCurrentState: number;
  lastPeakTurn?: number;
  topicDepth: number; // How many turns on same topic
  emotionalArc: Array<{ turn: number; intensity: number }>;
  suggestions: MomentumSuggestion[];
}

export interface MomentumSuggestion {
  type:
    | 'lean_in' // User engaged - match their energy
    | 'give_space' // User processing - slow down
    | 'gently_pivot' // Stalled - try new angle
    | 'acknowledge_depth' // Intimate moment - honor it
    | 'celebrate' // Peak moment - join the energy
    | 'wrap_opportunity'; // Natural closing - offer exit
  confidence: number;
  reason: string;
}

// ============================================================================
// PERSONA-SPECIFIC MOMENTUM PROFILES
// ============================================================================

export interface MomentumProfile {
  /** How quickly to match user's rising energy */
  energyMatchSpeed: number; // 0-1, higher = faster matching
  /** Threshold for detecting "stalled" state */
  stallThreshold: number; // Turns without momentum increase
  /** How much to value topic continuity */
  topicContinuityWeight: number;
  /** How much to value emotional intensity */
  emotionalWeight: number;
  /** Persona-specific momentum cues */
  cues: {
    building: string[];
    cruising: string[];
    peaking: string[];
    winding_down: string[];
    stalled: string[];
    intimate: string[];
  };
}

const DEFAULT_PROFILE: MomentumProfile = {
  energyMatchSpeed: 0.6,
  stallThreshold: 3,
  topicContinuityWeight: 0.4,
  emotionalWeight: 0.5,
  cues: {
    building: ['Tell me more.', 'Go on.', "I'm listening."],
    cruising: ['Nice.', 'Yeah.', 'Mhm.'],
    peaking: ['Yes!', 'Exactly!', 'That sounds huge.'],
    winding_down: ['This was good.', 'Lots to think about.', 'Take your time with that.'],
    stalled: ['What else is on your mind?', "I'm curious about something.", 'Tell me more.'],
    intimate: ['I hear you.', "That's meaningful.", 'Thank you for sharing that.'],
  },
};

// Ferni's unique momentum profile - reflective, patient, goes deep
const FERNI_PROFILE: MomentumProfile = {
  energyMatchSpeed: 0.4, // Slower to match - more thoughtful
  stallThreshold: 4, // More patient with pauses
  topicContinuityWeight: 0.6, // Values depth over breadth
  emotionalWeight: 0.7, // Highly attuned to emotion
  cues: {
    building: [
      "There's something here.",
      'Keep going.',
      'I want to understand this.',
      "You're onto something.",
    ],
    cruising: ['Mmhm.', 'I see.', 'Right.', 'That makes sense.'],
    peaking: [
      'This is it.',
      "You're seeing it now.",
      'Hold onto that feeling.',
      'That clarity is real.',
    ],
    winding_down: [
      'Let this settle.',
      'We covered a lot of ground today.',
      "You've done good work here.",
      'This will keep percolating.',
    ],
    stalled: [
      "What's really on your mind?",
      'Sometimes silence holds the answer.',
      "What aren't we talking about?",
      "Let's go deeper.",
    ],
    intimate: [
      'I feel the weight of that.',
      "You're not alone in this.",
      'Thank you for trusting me with that.',
      'That takes courage to say out loud.',
    ],
  },
};

// Maya's momentum profile - encouraging, action-oriented, celebrates progress
const MAYA_PROFILE: MomentumProfile = {
  energyMatchSpeed: 0.7, // Quick to match enthusiasm
  stallThreshold: 3, // More proactive about re-engagement
  topicContinuityWeight: 0.5, // Balance between depth and progress
  emotionalWeight: 0.6, // Tuned into emotions
  cues: {
    building: [
      "You're building something here.",
      'Keep that momentum!',
      "Let's explore this.",
      'I like where this is going.',
    ],
    cruising: ['Nice.', 'Great.', 'Love it.', 'Yes.'],
    peaking: [
      'This is a breakthrough!',
      "You've got this!",
      'Look at you go!',
      'That clarity is beautiful.',
    ],
    winding_down: [
      'Good work today.',
      'Celebrate this progress.',
      'Rest is part of the journey.',
      'Let this integrate.',
    ],
    stalled: [
      'What would feel good right now?',
      "What's one tiny step?",
      "Let's find the smallest win.",
      'Progress, not perfection.',
    ],
    intimate: [
      'I hear you.',
      'That takes courage to share.',
      'Thank you for trusting me with this.',
      "You're not alone in this.",
    ],
  },
};

// Alex's momentum profile - efficient, task-focused, supportive
const ALEX_PROFILE: MomentumProfile = {
  energyMatchSpeed: 0.8, // Quick to match - efficiency matters
  stallThreshold: 2, // Don't let things drag
  topicContinuityWeight: 0.3, // More focused on getting things done
  emotionalWeight: 0.4, // Less emotional focus, more practical
  cues: {
    building: ['Let\'s keep going.', 'Good direction.', "We're making progress.", 'Keep that focus.'],
    cruising: ['Got it.', 'Right.', 'Okay.', 'Makes sense.'],
    peaking: ["You're nailing this.", 'Perfect.', 'Exactly right.', "That's the move."],
    winding_down: ["We've covered a lot.", 'Solid progress.', "Let's wrap this up.", 'Good work.'],
    stalled: [
      'What do you need next?',
      "Let's refocus.",
      'What would help most right now?',
      'Shall we try a different approach?',
    ],
    intimate: ['I understand.', "That's real.", 'Thanks for sharing that context.', 'I hear you.'],
  },
};

// Peter's momentum profile - analytical, patient, thorough
const PETER_PROFILE: MomentumProfile = {
  energyMatchSpeed: 0.5, // Patient, methodical
  stallThreshold: 4, // Patient with analysis time
  topicContinuityWeight: 0.7, // Values depth and thoroughness
  emotionalWeight: 0.4, // More analytical than emotional
  cues: {
    building: [
      'Interesting angle.',
      "There's something here.",
      "Let's dig deeper.",
      'The data is pointing somewhere.',
    ],
    cruising: ['I see.', 'Right.', 'Makes sense.', 'Interesting.'],
    peaking: [
      "Now we're getting somewhere.",
      'The thesis is coming together.',
      'This is a key insight.',
      "You've found the signal.",
    ],
    winding_down: [
      'Good analysis.',
      "We've built a solid framework.",
      'Let this thesis develop.',
      'The research continues.',
    ],
    stalled: [
      'What are we missing?',
      'Where should we look next?',
      "Let's examine the data again.",
      'What does the evidence tell us?',
    ],
    intimate: [
      'I appreciate your thinking here.',
      "That's a meaningful insight.",
      'Thank you for walking me through that.',
      'This matters to you.',
    ],
  },
};

const PERSONA_PROFILES: Record<string, MomentumProfile> = {
  ferni: FERNI_PROFILE,
  'maya-santos': MAYA_PROFILE,
  'alex-chen': ALEX_PROFILE,
  'peter-john': PETER_PROFILE,
};

// ============================================================================
// MOMENTUM CALCULATIONS
// ============================================================================

function calculateMomentumScore(signals: MomentumSignal[], profile: MomentumProfile): number {
  if (signals.length === 0) return 0.5;

  const recent = signals.slice(-5); // Last 5 turns
  let score = 0.5; // Start neutral

  for (const signal of recent) {
    // Word count contribution (longer responses = more engaged)
    const wordFactor = Math.min(1, signal.wordCount / 50) * 0.15;

    // Emotional intensity contribution
    const emotionFactor = signal.emotionalIntensity * profile.emotionalWeight * 0.2;

    // Question asked = engagement
    const questionFactor = signal.questionAsked ? 0.1 : 0;

    // Self-disclosure = deep engagement
    const disclosureFactor = signal.selfDisclosure ? 0.15 : 0;

    // Topic continuity = building depth
    const continuityFactor = signal.topicContinuity ? profile.topicContinuityWeight * 0.1 : -0.05;

    // Response latency (fast = engaged, very slow = processing or distracted)
    let latencyFactor = 0;
    if (signal.responseLatencyMs !== undefined) {
      if (signal.responseLatencyMs < 2000) latencyFactor = 0.05;
      else if (signal.responseLatencyMs > 8000) latencyFactor = -0.05;
    }

    // Laughter = positive energy
    const laughterFactor = signal.laughterDetected ? 0.1 : 0;

    score +=
      wordFactor +
      emotionFactor +
      questionFactor +
      disclosureFactor +
      continuityFactor +
      latencyFactor +
      laughterFactor;
  }

  return Math.max(0, Math.min(1, score));
}

function detectMomentumState(
  score: number,
  signals: MomentumSignal[],
  profile: MomentumProfile
): MomentumState {
  if (signals.length < 2) return 'building';

  const recent = signals.slice(-3);
  const avgEmotionalIntensity =
    recent.reduce((sum, s) => sum + s.emotionalIntensity, 0) / recent.length;
  const recentWordCounts = recent.map((s) => s.wordCount);
  const avgWords = recentWordCounts.reduce((a, b) => a + b, 0) / recentWordCounts.length;

  // Check for intimate sharing (high emotion, moderate words, self-disclosure)
  const recentDisclosures = recent.filter((s) => s.selfDisclosure).length;
  if (avgEmotionalIntensity > 0.6 && recentDisclosures >= 1 && avgWords > 20) {
    return 'intimate';
  }

  // Check for peak (high score, high energy, possibly laughter)
  if (score > 0.75 && avgEmotionalIntensity > 0.7) {
    return 'peaking';
  }

  // Check for stalled (low engagement signals over several turns)
  const stalledTurns = recent.filter(
    (s) => s.wordCount < 10 && !s.questionAsked && !s.selfDisclosure
  ).length;
  if (stalledTurns >= profile.stallThreshold - 1) {
    return 'stalled';
  }

  // Check for winding down (decreasing word counts, no questions)
  const wordTrend = recentWordCounts[2] - recentWordCounts[0]; // Compare last to first
  const noRecentQuestions = !recent.some((s) => s.questionAsked);
  if (wordTrend < -20 && noRecentQuestions && score < 0.4) {
    return 'winding_down';
  }

  // Check momentum direction for building vs cruising
  if (score > 0.6) {
    const scoreImproving = recent.length >= 2 && recentWordCounts[2] > recentWordCounts[0];
    return scoreImproving ? 'building' : 'cruising';
  }

  return 'cruising';
}

function detectConversationPhase(turnCount: number, signals: MomentumSignal[]): ConversationPhase {
  if (turnCount <= 3) return 'opening';

  // Check for closing signals
  const recent = signals.slice(-2);
  const closingPhrases = ['goodbye', 'talk later', 'gotta go', 'thanks for', 'need to run'];
  const hasClosingSignal = recent.some((s) => {
    // We don't have the text, but we can infer from very short + low emotion
    return s.wordCount < 8 && s.emotionalIntensity < 0.3 && !s.questionAsked;
  });

  if (hasClosingSignal && turnCount > 5) return 'closing';
  if (turnCount > 10) return 'deep';
  return 'exploring';
}

function calculateVelocity(signals: MomentumSignal[]): number {
  if (signals.length < 3) return 0;

  const recent = signals.slice(-5);
  const scores = recent.map((s) => {
    let score = 0;
    score += Math.min(1, s.wordCount / 50) * 0.3;
    score += s.emotionalIntensity * 0.3;
    score += s.questionAsked ? 0.2 : 0;
    score += s.selfDisclosure ? 0.2 : 0;
    return score;
  });

  // Calculate trend
  let totalChange = 0;
  for (let i = 1; i < scores.length; i++) {
    totalChange += scores[i] - scores[i - 1];
  }

  return Math.max(-1, Math.min(1, (totalChange / (scores.length - 1)) * 3));
}

function generateSuggestions(
  state: MomentumState,
  phase: ConversationPhase,
  velocity: number,
  score: number
): MomentumSuggestion[] {
  const suggestions: MomentumSuggestion[] = [];

  switch (state) {
    case 'building':
      suggestions.push({
        type: 'lean_in',
        confidence: 0.7 + velocity * 0.2,
        reason: 'User is engaged and building momentum',
      });
      break;

    case 'peaking':
      suggestions.push({
        type: 'celebrate',
        confidence: 0.85,
        reason: 'User at high engagement - match their energy',
      });
      break;

    case 'intimate':
      suggestions.push({
        type: 'acknowledge_depth',
        confidence: 0.9,
        reason: 'User is sharing deeply - honor the moment',
      });
      break;

    case 'stalled':
      suggestions.push({
        type: 'gently_pivot',
        confidence: 0.75,
        reason: 'Conversation has lost momentum - try new angle',
      });
      break;

    case 'winding_down':
      if (phase === 'deep' || phase === 'closing') {
        suggestions.push({
          type: 'wrap_opportunity',
          confidence: 0.7,
          reason: 'Natural ending approaching - offer graceful exit',
        });
      } else {
        suggestions.push({
          type: 'gently_pivot',
          confidence: 0.6,
          reason: 'Energy dropping - might need topic shift',
        });
      }
      break;

    case 'cruising':
      if (velocity < -0.2) {
        suggestions.push({
          type: 'give_space',
          confidence: 0.6,
          reason: 'User may be processing - slow down',
        });
      }
      break;
  }

  return suggestions;
}

// ============================================================================
// MOMENTUM TRACKER CLASS
// ============================================================================

export class ConversationMomentumTracker {
  private signals: MomentumSignal[] = [];
  private currentState: MomentumState = 'building';
  private phase: ConversationPhase = 'opening';
  private turnsInCurrentState = 0;
  private lastPeakTurn?: number;
  private topicDepth = 0;
  private currentTopic?: string;
  private profile: MomentumProfile;
  private personaId: string;
  private sessionId: string;

  constructor(personaId = 'default', sessionId = 'default') {
    this.personaId = personaId;
    this.sessionId = sessionId;
    this.profile = PERSONA_PROFILES[personaId] || DEFAULT_PROFILE;
    log.debug(
      { personaId, profileType: personaId in PERSONA_PROFILES ? 'custom' : 'default' },
      'Momentum tracker initialized'
    );
  }

  /**
   * Record a new turn's signals
   */
  recordSignal(signal: Omit<MomentumSignal, 'turn' | 'timestamp'>): void {
    const fullSignal: MomentumSignal = {
      ...signal,
      turn: this.signals.length + 1,
      timestamp: Date.now(),
    };

    this.signals.push(fullSignal);

    // Update topic depth
    if (signal.topicContinuity) {
      this.topicDepth++;
    } else {
      this.topicDepth = 1;
    }

    // Calculate new state
    const oldState = this.currentState;
    const score = calculateMomentumScore(this.signals, this.profile);
    this.currentState = detectMomentumState(score, this.signals, this.profile);
    this.phase = detectConversationPhase(this.signals.length, this.signals);

    // Track state changes
    if (this.currentState === oldState) {
      this.turnsInCurrentState++;
    } else {
      this.turnsInCurrentState = 1;
      log.debug(
        { oldState, newState: this.currentState, turn: fullSignal.turn },
        'Momentum state changed'
      );

      // Record transition for metrics
      recordMomentumTransition(
        this.sessionId,
        this.personaId,
        oldState,
        this.currentState,
        fullSignal.turn
      );
    }

    // Track peaks
    if (this.currentState === 'peaking') {
      this.lastPeakTurn = fullSignal.turn;
    }

    // Record velocity for metrics
    const velocity = calculateVelocity(this.signals);
    recordMomentumVelocity(this.sessionId, this.personaId, velocity, this.topicDepth);
  }

  /**
   * Get current momentum analysis
   */
  getState(): MomentumState_Full {
    const score = calculateMomentumScore(this.signals, this.profile);
    const velocity = calculateVelocity(this.signals);
    const trend = velocity > 0.1 ? 'rising' : velocity < -0.1 ? 'falling' : 'steady';

    return {
      current: this.currentState,
      phase: this.phase,
      trend,
      velocity,
      score,
      turnsInCurrentState: this.turnsInCurrentState,
      lastPeakTurn: this.lastPeakTurn,
      topicDepth: this.topicDepth,
      emotionalArc: this.signals.slice(-10).map((s) => ({
        turn: s.turn,
        intensity: s.emotionalIntensity,
      })),
      suggestions: generateSuggestions(this.currentState, this.phase, velocity, score),
    };
  }

  /**
   * Get persona-specific cue for current state
   */
  getCue(): string | null {
    const cues = this.profile.cues[this.currentState];
    if (!cues || cues.length === 0) return null;
    return cues[Math.floor(Math.random() * cues.length)];
  }

  /**
   * Check if it's a good time for a tangent/memory
   */
  isGoodTimeForTangent(): boolean {
    // Good times: cruising, early building, after peak
    if (this.currentState === 'intimate') return false; // Don't interrupt
    if (this.currentState === 'peaking') return false; // Let user have the moment
    if (this.currentState === 'stalled') return true; // Tangent might help
    if (this.currentState === 'cruising' && this.turnsInCurrentState > 2) return true;
    if (this.currentState === 'building' && this.topicDepth > 3) return true;
    return false;
  }

  /**
   * Check if it's time to slow down (thinking pauses)
   */
  shouldSlowDown(): boolean {
    // Slow down for: intimate moments, after peaks, when user processing
    if (this.currentState === 'intimate') return true;
    if (this.lastPeakTurn && this.signals.length - this.lastPeakTurn < 2) return true;
    const recent = this.signals.slice(-2);
    const slowResponses = recent.filter(
      (s) => s.responseLatencyMs && s.responseLatencyMs > 5000
    ).length;
    return slowResponses > 0;
  }

  /**
   * Get turn count
   */
  getTurnCount(): number {
    return this.signals.length;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.signals = [];
    this.currentState = 'building';
    this.phase = 'opening';
    this.turnsInCurrentState = 0;
    this.lastPeakTurn = undefined;
    this.topicDepth = 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const trackers = new Map<string, ConversationMomentumTracker>();

export function getMomentumTracker(
  sessionId: string,
  personaId?: string
): ConversationMomentumTracker {
  if (!trackers.has(sessionId)) {
    trackers.set(sessionId, new ConversationMomentumTracker(personaId, sessionId));
  }
  return trackers.get(sessionId)!;
}

export function resetMomentumTracker(sessionId: string): void {
  trackers.delete(sessionId);
}

export function resetAllMomentumTrackers(): void {
  trackers.clear();
}
