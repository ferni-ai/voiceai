/**
 * Mood Drift Service
 *
 * Personas don't maintain a static emotional state. This service tracks
 * how a persona's mood naturally shifts during conversation based on:
 * - Topics discussed (heavy topics affect them too)
 * - User's emotional state (empathic mirroring)
 * - Length of conversation
 * - Wins and struggles shared
 *
 * This creates the feeling of emotional co-regulation - they're not robots
 * dispensing advice, they're FEELING the conversation with you.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MoodState {
  baselineMood: MoodType;
  currentMood: MoodType;
  moodIntensity: number; // 0-1
  emotionalEnergy: number; // 0-1 (depletes with heavy conversations)
  moodShiftHistory: MoodShift[];
  lastMoodExpression: number; // turn count
}

export type MoodType =
  | 'warm'
  | 'contemplative'
  | 'energized'
  | 'heavy'
  | 'playful'
  | 'tender'
  | 'focused'
  | 'tired'
  | 'concerned'
  | 'celebratory';

export interface MoodShift {
  from: MoodType;
  to: MoodType;
  reason: string;
  turn: number;
}

export interface MoodExpression {
  phrase: string;
  moodType: MoodType;
  canExpress: boolean;
}

// ============================================================================
// MOOD STATE MANAGEMENT
// ============================================================================

const moodStates = new Map<string, MoodState>();

/**
 * Initialize mood for a session
 */
export function initializeMood(sessionId: string, personaId: string): MoodState {
  const baselineMood = getPersonaBaselineMood(personaId);
  const state: MoodState = {
    baselineMood,
    currentMood: baselineMood,
    moodIntensity: 0.7,
    emotionalEnergy: 1.0,
    moodShiftHistory: [],
    lastMoodExpression: 0,
  };
  moodStates.set(sessionId, state);
  return state;
}

/**
 * Get current mood state
 */
export function getMoodState(sessionId: string): MoodState | null {
  return moodStates.get(sessionId) || null;
}

// ============================================================================
// PERSONA BASELINE MOODS
// ============================================================================

function getPersonaBaselineMood(personaId: string): MoodType {
  const baselines: Record<string, MoodType> = {
    ferni: 'warm',
    'alex-chen': 'focused',
    'maya-santos': 'warm',
    'jordan-taylor': 'energized',
    'peter-john': 'contemplative',
    'nayan-patel': 'contemplative',
  };
  return baselines[personaId] || 'warm';
}

// ============================================================================
// MOOD DRIFT LOGIC
// ============================================================================

/**
 * Process conversation context and drift mood accordingly
 */
export function processMoodDrift(
  sessionId: string,
  personaId: string,
  context: {
    topics: string[];
    userEmotion?: string;
    userEmotionIntensity?: number;
    wasPersonalSharing?: boolean;
    wasWin?: boolean;
    wasStruggle?: boolean;
    turnCount: number;
  }
): MoodState {
  let state = moodStates.get(sessionId);
  if (!state) {
    state = initializeMood(sessionId, personaId);
  }

  const previousMood = state.currentMood;
  let newMood = state.currentMood;
  let shiftReason = '';

  // Topic-based mood shifts
  const heavyTopics = [
    'grief',
    'loss',
    'death',
    'trauma',
    'divorce',
    'illness',
    'anxiety',
    'depression',
  ];
  const celebratoryTopics = [
    'win',
    'success',
    'promotion',
    'achievement',
    'milestone',
    'wedding',
    'baby',
  ];
  const playfulTopics = ['joke', 'funny', 'humor', 'silly', 'vacation', 'fun'];

  const topicsLower = context.topics.map((t) => t.toLowerCase());

  if (topicsLower.some((t) => heavyTopics.some((h) => t.includes(h)))) {
    if (state.currentMood !== 'heavy' && state.currentMood !== 'tender') {
      newMood = 'tender';
      shiftReason = 'heavy topic emerged';
      state.emotionalEnergy -= 0.1;
    }
  } else if (topicsLower.some((t) => celebratoryTopics.some((c) => t.includes(c)))) {
    if (state.currentMood !== 'celebratory') {
      newMood = 'celebratory';
      shiftReason = 'celebrating together';
      state.emotionalEnergy += 0.1;
    }
  } else if (topicsLower.some((t) => playfulTopics.some((p) => t.includes(p)))) {
    newMood = 'playful';
    shiftReason = 'lightening up';
  }

  // User emotion mirroring
  if (context.userEmotion) {
    const emotionMirror: Record<string, MoodType> = {
      sad: 'tender',
      anxious: 'concerned',
      happy: 'warm',
      excited: 'energized',
      frustrated: 'focused',
      confused: 'focused',
      grateful: 'warm',
    };
    const mirrorMood = emotionMirror[context.userEmotion];
    if (mirrorMood && context.userEmotionIntensity && context.userEmotionIntensity > 0.6) {
      newMood = mirrorMood;
      shiftReason = `responding to user's ${context.userEmotion}`;
    }
  }

  // Win/struggle responses
  if (context.wasWin) {
    newMood = 'celebratory';
    shiftReason = 'sharing in the win';
    state.emotionalEnergy = Math.min(1, state.emotionalEnergy + 0.15);
  }
  if (context.wasStruggle) {
    newMood = 'tender';
    shiftReason = 'holding space for struggle';
    state.emotionalEnergy -= 0.08;
  }

  // Long conversation tiredness
  if (context.turnCount > 40) {
    state.emotionalEnergy = Math.max(0.3, state.emotionalEnergy - 0.02);
    if (state.emotionalEnergy < 0.4 && state.currentMood !== 'tired') {
      newMood = 'tired';
      shiftReason = 'long conversation energy shift';
    }
  }

  // Record shift if mood changed
  if (newMood !== previousMood) {
    state.moodShiftHistory.push({
      from: previousMood,
      to: newMood,
      reason: shiftReason,
      turn: context.turnCount,
    });
    state.currentMood = newMood;

    getLogger().debug(
      { sessionId, from: previousMood, to: newMood, reason: shiftReason },
      'Mood drifted'
    );
  }

  // Slowly drift back to baseline if no strong influence
  if (context.turnCount % 10 === 0 && state.currentMood !== state.baselineMood) {
    const shouldReturnToBaseline = Math.random() < 0.3;
    if (shouldReturnToBaseline && !context.wasStruggle && !context.wasWin) {
      state.moodShiftHistory.push({
        from: state.currentMood,
        to: state.baselineMood,
        reason: 'returning to baseline',
        turn: context.turnCount,
      });
      state.currentMood = state.baselineMood;
    }
  }

  // Clamp emotional energy
  state.emotionalEnergy = Math.max(0, Math.min(1, state.emotionalEnergy));

  moodStates.set(sessionId, state);
  return state;
}

// ============================================================================
// MOOD EXPRESSION
// ============================================================================

/**
 * Get a phrase that expresses the current mood state
 */
export function getMoodExpression(
  sessionId: string,
  personaId: string,
  turnCount: number
): MoodExpression | null {
  const state = moodStates.get(sessionId);
  if (!state) return null;

  // Don't express mood too often (min 8 turns between expressions)
  if (turnCount - state.lastMoodExpression < 8) {
    return { phrase: '', moodType: state.currentMood, canExpress: false };
  }

  // Only 15% chance to express
  if (Math.random() > 0.15) {
    return { phrase: '', moodType: state.currentMood, canExpress: false };
  }

  const expressions = getMoodExpressions(personaId, state.currentMood, state.emotionalEnergy);
  if (expressions.length === 0) {
    return { phrase: '', moodType: state.currentMood, canExpress: false };
  }

  const phrase = expressions[Math.floor(Math.random() * expressions.length)];
  state.lastMoodExpression = turnCount;
  moodStates.set(sessionId, state);

  return { phrase, moodType: state.currentMood, canExpress: true };
}

/**
 * Get mood-specific expressions for a persona
 */
function getMoodExpressions(personaId: string, mood: MoodType, energy: number): string[] {
  // Ferni-specific expressions
  if (personaId === 'ferni') {
    switch (mood) {
      case 'tender':
        return [
          '*takes a breath* <break time="200ms"/>This is heavy. <break time="150ms"/>I\'m glad you\'re sharing it.',
          '<break time="300ms"/>Yeah. <break time="200ms"/>I feel that.',
          'That lands. <break time="200ms"/>*softer* <break time="150ms"/>Thank you for trusting me with this.',
        ];
      case 'celebratory':
        return [
          'YES! <break time="150ms"/>This is the good stuff!',
          '*laughs* <break time="200ms"/>I love this. <break time="150ms"/>Tell me more!',
          'This makes me happy. <break time="150ms"/>Really.',
        ];
      case 'contemplative':
        return [
          '<break time="300ms"/>Hmm. <break time="200ms"/>*thinking*',
          'That\'s... interesting. <break time="200ms"/>Let me sit with that.',
          '*pauses* <break time="250ms"/>There\'s something there.',
        ];
      case 'tired':
        if (energy < 0.4) {
          return [
            'This has been a lot. <break time="200ms"/>Good lot, but a lot.',
            '*exhales* <break time="150ms"/>We\'ve covered ground today.',
            'I\'m tired in a good way. <break time="200ms"/>The kind of tired that means something.',
          ];
        }
        break;
      case 'concerned':
        return [
          'I want to make sure you\'re okay. <break time="150ms"/>Really okay.',
          '*leaning in* <break time="200ms"/>How are you holding up?',
          'I\'m a little worried. <break time="150ms"/>Talk to me.',
        ];
      case 'playful':
        return [
          '*smiles* <break time="150ms"/>I like where this is going.',
          "Okay, now we're having fun.",
          '<break time="150ms"/>*lighter tone* <break time="100ms"/>Finally, something light!',
        ];
      case 'focused':
        return [
          'Okay. <break time="150ms"/>Let\'s dig in.',
          'I\'m with you. <break time="100ms"/>Keep going.',
          'This is important. <break time="150ms"/>Let\'s figure it out.',
        ];
    }
  }

  // Nayan-specific expressions
  if (personaId === 'nayan-patel') {
    switch (mood) {
      case 'tender':
        return [
          '*stillness* <break time="300ms"/>This is life. <break time="200ms"/>The real thing.',
          '<break time="350ms"/>Yes. <break time="250ms"/>This is what matters.',
        ];
      case 'contemplative':
        return [
          '<break time="400ms"/>Hmm. <break time="300ms"/>*long pause*',
          'There is depth here. <break time="250ms"/>Let us explore.',
        ];
    }
  }

  // Default expressions
  return [];
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupMoodState(sessionId: string): void {
  moodStates.delete(sessionId);
}
