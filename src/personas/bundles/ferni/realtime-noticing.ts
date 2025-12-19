/**
 * Real-Time Noticing System
 *
 * This is the "superhuman" part of Ferni's personality.
 * Real friends notice when something shifts. Great therapists catch
 * the pause, the change in tone, the thing left unsaid.
 *
 * We have access to signals humans can't process in real-time:
 * - Exact pause duration
 * - Speech rate changes
 * - Voice emotion vs. text emotion mismatch
 * - Topic deflection patterns
 * - Energy trajectory over conversation
 *
 * BETTER THAN HUMAN because:
 * - We ALWAYS notice (humans get distracted)
 * - We notice PRECISELY (humans estimate)
 * - We remember PERFECTLY (humans forget)
 * - We never judge (humans have reactions)
 *
 * @module personas/bundles/ferni/realtime-noticing
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'realtime-noticing' });

// ============================================================================
// TYPES
// ============================================================================

export interface NoticingInput {
  sessionId: string;
  turnCount: number;

  // Current turn signals
  currentTranscript: string;
  pauseBeforeMs: number;
  speechRateWPM?: number;

  // Voice emotion
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };

  // Text analysis
  textEmotion?: {
    primary: string;
    intensity: number;
    distressLevel: number;
  };

  // History
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
  }>;

  // Current detected topics
  currentTopics?: string[];
}

export interface NoticingResult {
  type: NoticingType;
  observation: string;
  acknowledgment: string;
  shouldAcknowledge: boolean;
  confidence: number;
  timing: 'immediate' | 'gentle_delay' | 'wait_for_opening';
  subtlety: 'whisper' | 'gentle' | 'direct';
}

export type NoticingType =
  | 'significant_pause' // Long pause before speaking
  | 'energy_drop' // Voice energy decreased
  | 'energy_rise' // Voice energy increased
  | 'mismatch' // Voice says one thing, words say another
  | 'topic_deflection' // Changed topic when emotional
  | 'speech_rate_change' // Suddenly faster or slower
  | 'repeated_theme' // Keeps coming back to something
  | 'unfinished_thought' // Trailed off mid-sentence
  | 'question_dodged' // Answered around the question
  | 'protective_language' // "I'm fine", "it's nothing"
  | 'breakthrough_moment'; // Something shifted positively

// ============================================================================
// NOTICING DETECTORS
// ============================================================================

/**
 * Detect if there's something worth noticing
 */
export function detectNoticing(input: NoticingInput): NoticingResult | null {
  // Run all detectors
  const detectors = [
    detectSignificantPause,
    detectEnergyShift,
    detectVoiceTextMismatch,
    detectTopicDeflection,
    detectSpeechRateChange,
    detectRepeatedTheme,
    detectUnfinishedThought,
    detectProtectiveLanguage,
    detectBreakthroughMoment,
  ];

  for (const detector of detectors) {
    const result = detector(input);
    if (result && result.shouldAcknowledge) {
      log.debug(
        {
          sessionId: input.sessionId,
          type: result.type,
          confidence: result.confidence,
        },
        'Noticing detected'
      );
      return result;
    }
  }

  return null;
}

// ============================================================================
// INDIVIDUAL DETECTORS
// ============================================================================

function detectSignificantPause(input: NoticingInput): NoticingResult | null {
  // Significant pause = 2+ seconds before speaking
  if (input.pauseBeforeMs < 2000) return null;

  // Very long pause (5+ seconds) = something heavy
  const isVeryLong = input.pauseBeforeMs > 5000;

  return {
    type: 'significant_pause',
    observation: isVeryLong
      ? 'User paused for a long time before speaking'
      : 'User took a moment before responding',
    acknowledgment: isVeryLong
      ? "You took a moment there. <break time='200ms'/>Take your time."
      : "I noticed you paused. <break time='150ms'/>That's okay.",
    shouldAcknowledge: true,
    confidence: Math.min(input.pauseBeforeMs / 5000, 1),
    timing: isVeryLong ? 'immediate' : 'gentle_delay',
    subtlety: isVeryLong ? 'gentle' : 'whisper',
  };
}

function detectEnergyShift(input: NoticingInput): NoticingResult | null {
  if (!input.voiceEmotion || !input.previousTurns || input.previousTurns.length < 2) {
    return null;
  }

  // Need at least some confidence in voice detection
  if (input.voiceEmotion.confidence < 0.5) return null;

  // Compare arousal levels
  const currentArousal = input.voiceEmotion.arousal ?? 0.5;
  const previousTurnsWithArousal = input.previousTurns
    .filter((t) => t.voiceEmotion)
    .slice(-3);

  if (previousTurnsWithArousal.length < 2) return null;

  // Simplified: check if current is noticeably different from recent average
  // In real implementation, we'd have arousal data per turn
  const currentValence = input.voiceEmotion.valence ?? 0;

  // Energy drop
  if (currentArousal < 0.3 && currentValence < 0) {
    return {
      type: 'energy_drop',
      observation: 'Voice energy dropped noticeably',
      acknowledgment: "Something shifted just now. <break time='200ms'/>I heard it.",
      shouldAcknowledge: true,
      confidence: 0.7,
      timing: 'gentle_delay',
      subtlety: 'gentle',
    };
  }

  // Energy rise (positive shift)
  if (currentArousal > 0.7 && currentValence > 0) {
    return {
      type: 'energy_rise',
      observation: 'Voice energy lifted',
      acknowledgment: "Something lifted there. <break time='150ms'/>I can hear it.",
      shouldAcknowledge: true,
      confidence: 0.6,
      timing: 'gentle_delay',
      subtlety: 'whisper',
    };
  }

  return null;
}

function detectVoiceTextMismatch(input: NoticingInput): NoticingResult | null {
  if (!input.voiceEmotion || !input.textEmotion) return null;
  if (input.voiceEmotion.confidence < 0.6) return null;

  const voicePrimary = input.voiceEmotion.primary.toLowerCase();
  const textPrimary = input.textEmotion.primary.toLowerCase();

  // Detect "I'm fine" but voice says otherwise
  const textIsPositive = ['happy', 'content', 'neutral', 'fine'].includes(textPrimary);
  const voiceIsNegative = ['sad', 'anxious', 'stressed', 'fearful', 'angry'].includes(voicePrimary);

  if (textIsPositive && voiceIsNegative) {
    return {
      type: 'mismatch',
      observation: `Text says ${textPrimary} but voice indicates ${voicePrimary}`,
      acknowledgment: "You said you're okay, but... <break time='200ms'/>your voice tells a different story. <break time='150ms'/>What's really going on?",
      shouldAcknowledge: true,
      confidence: input.voiceEmotion.confidence,
      timing: 'gentle_delay',
      subtlety: 'gentle',
    };
  }

  return null;
}

function detectTopicDeflection(input: NoticingInput): NoticingResult | null {
  if (!input.previousTurns || input.previousTurns.length < 2) return null;
  if (!input.currentTopics || input.currentTopics.length === 0) return null;

  const lastTurn = input.previousTurns[input.previousTurns.length - 1];
  if (!lastTurn.topics || lastTurn.topics.length === 0) return null;

  // Check if topic changed during emotional moment
  const wasEmotionalTopic = lastTurn.voiceEmotion &&
    ['sad', 'anxious', 'stressed', 'angry', 'fearful'].includes(lastTurn.voiceEmotion);

  const topicChanged = !lastTurn.topics.some((t) =>
    input.currentTopics!.some((ct) => ct.toLowerCase().includes(t.toLowerCase()))
  );

  if (wasEmotionalTopic && topicChanged) {
    return {
      type: 'topic_deflection',
      observation: 'Changed topic after emotional content',
      acknowledgment: "We can talk about this new thing, but... <break time='200ms'/>I noticed we moved away from what you were just saying. <break time='150ms'/>We can come back to it when you're ready.",
      shouldAcknowledge: Math.random() < 0.6, // Don't always call it out
      confidence: 0.6,
      timing: 'wait_for_opening',
      subtlety: 'gentle',
    };
  }

  return null;
}

function detectSpeechRateChange(input: NoticingInput): NoticingResult | null {
  if (!input.speechRateWPM || !input.previousTurns) return null;

  // Get average of last 3 turns
  const recentRates = input.previousTurns
    .slice(-3)
    .filter((t) => t.speechRate)
    .map((t) => t.speechRate!);

  if (recentRates.length < 2) return null;

  const avgRate = recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
  const currentRate = input.speechRateWPM;

  // Significant slowdown (30%+ slower)
  if (currentRate < avgRate * 0.7) {
    return {
      type: 'speech_rate_change',
      observation: 'Speaking noticeably slower',
      acknowledgment: "You're taking your time with this. <break time='150ms'/>That feels important.",
      shouldAcknowledge: true,
      confidence: 0.65,
      timing: 'gentle_delay',
      subtlety: 'whisper',
    };
  }

  // Significant speedup (30%+ faster)
  if (currentRate > avgRate * 1.3) {
    return {
      type: 'speech_rate_change',
      observation: 'Speaking noticeably faster',
      acknowledgment: "I can hear the energy in your voice. <break time='150ms'/>Lot going on there.",
      shouldAcknowledge: true,
      confidence: 0.55,
      timing: 'gentle_delay',
      subtlety: 'whisper',
    };
  }

  return null;
}

function detectRepeatedTheme(input: NoticingInput): NoticingResult | null {
  if (!input.previousTurns || input.previousTurns.length < 4) return null;
  if (!input.currentTopics || input.currentTopics.length === 0) return null;

  // Count topic mentions across turns
  const topicCounts = new Map<string, number>();

  for (const turn of input.previousTurns) {
    for (const topic of turn.topics || []) {
      const key = topic.toLowerCase();
      topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    }
  }

  // Add current topics
  for (const topic of input.currentTopics) {
    const key = topic.toLowerCase();
    topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
  }

  // Find topic mentioned 3+ times
  for (const [topic, count] of topicCounts) {
    if (count >= 3) {
      return {
        type: 'repeated_theme',
        observation: `Topic "${topic}" keeps coming up (${count} times)`,
        acknowledgment: `You keep coming back to ${topic}. <break time='200ms'/>There's something there, isn't there?`,
        shouldAcknowledge: true,
        confidence: Math.min(count / 5, 0.9),
        timing: 'wait_for_opening',
        subtlety: 'gentle',
      };
    }
  }

  return null;
}

function detectUnfinishedThought(input: NoticingInput): NoticingResult | null {
  const transcript = input.currentTranscript.trim();

  // Patterns indicating trailing off
  const unfinishedPatterns = [
    /\.\.\.\s*$/,
    /but\s*$/i,
    /and\s*$/i,
    /so\s*$/i,
    /I mean\s*$/i,
    /it's just\s*$/i,
    /I don't know\s*$/i,
  ];

  for (const pattern of unfinishedPatterns) {
    if (pattern.test(transcript)) {
      return {
        type: 'unfinished_thought',
        observation: 'Sentence trailed off',
        acknowledgment: "You trailed off there. <break time='200ms'/>What were you about to say?",
        shouldAcknowledge: true,
        confidence: 0.7,
        timing: 'immediate',
        subtlety: 'gentle',
      };
    }
  }

  return null;
}

function detectProtectiveLanguage(input: NoticingInput): NoticingResult | null {
  const transcript = input.currentTranscript.toLowerCase();

  // Protective/deflecting phrases
  const protectivePatterns = [
    { pattern: /i('m| am) fine/i, response: "When you say you're fine..." },
    { pattern: /it('s| is) nothing/i, response: "You said it's nothing, but..." },
    { pattern: /doesn('t| not) matter/i, response: "You said it doesn't matter, but..." },
    { pattern: /i('m| am) (over it|past it)/i, response: "Are you though?" },
    { pattern: /whatever/i, response: "That 'whatever'..." },
    { pattern: /i don('t| do not) care/i, response: "I hear you saying you don't care, but..." },
    { pattern: /it('s| is) not a big deal/i, response: "Not a big deal, you said, but..." },
  ];

  for (const { pattern, response } of protectivePatterns) {
    if (pattern.test(transcript)) {
      // Only call out if voice emotion contradicts
      if (input.voiceEmotion &&
          ['sad', 'anxious', 'stressed'].includes(input.voiceEmotion.primary.toLowerCase())) {
        return {
          type: 'protective_language',
          observation: 'Using protective language with emotional voice',
          acknowledgment: `${response} <break time='200ms'/>your voice tells me something else.`,
          shouldAcknowledge: true,
          confidence: 0.75,
          timing: 'gentle_delay',
          subtlety: 'gentle',
        };
      }
    }
  }

  return null;
}

function detectBreakthroughMoment(input: NoticingInput): NoticingResult | null {
  if (!input.voiceEmotion) return null;

  // Positive shift indicators
  const breakthroughIndicators = [
    /i (just )?realized/i,
    /wait,? (a minute)?/i,
    /oh!?/i,
    /that('s| is) it/i,
    /i (never|didn't) (think|see|realize)/i,
    /holy (crap|shit|cow)/i,
    /wow/i,
  ];

  const hasBreakthroughPhrase = breakthroughIndicators.some((p) =>
    p.test(input.currentTranscript)
  );

  const voiceIsPositive = input.voiceEmotion.valence && input.voiceEmotion.valence > 0.3;
  const hasEnergy = input.voiceEmotion.arousal && input.voiceEmotion.arousal > 0.5;

  if (hasBreakthroughPhrase && (voiceIsPositive || hasEnergy)) {
    return {
      type: 'breakthrough_moment',
      observation: 'Positive realization or breakthrough detected',
      acknowledgment: "I just watched something click for you. <break time='200ms'/>That's a big moment.",
      shouldAcknowledge: true,
      confidence: 0.8,
      timing: 'immediate',
      subtlety: 'direct',
    };
  }

  return null;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

interface SessionNoticingState {
  lastNoticingTurn: number;
  noticingTypes: NoticingType[];
  acknowledgedCount: number;
}

const sessionStates = new Map<string, SessionNoticingState>();

/**
 * Check if we should throttle noticing (don't over-notice)
 */
export function shouldThrottleNoticing(
  sessionId: string,
  turnCount: number,
  result: NoticingResult
): boolean {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      lastNoticingTurn: -100,
      noticingTypes: [],
      acknowledgedCount: 0,
    };
    sessionStates.set(sessionId, state);
  }

  // Don't notice more than once every 4 turns
  if (turnCount - state.lastNoticingTurn < 4) {
    return true;
  }

  // Don't over-acknowledge (max 3 per session)
  if (state.acknowledgedCount >= 3 && result.type !== 'breakthrough_moment') {
    return true;
  }

  // Don't repeat same noticing type in same session
  if (state.noticingTypes.includes(result.type)) {
    return true;
  }

  return false;
}

/**
 * Record that we noticed something
 */
export function recordNoticing(
  sessionId: string,
  turnCount: number,
  type: NoticingType
): void {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      lastNoticingTurn: turnCount,
      noticingTypes: [type],
      acknowledgedCount: 1,
    };
  } else {
    state.lastNoticingTurn = turnCount;
    state.noticingTypes.push(type);
    state.acknowledgedCount++;
  }
  sessionStates.set(sessionId, state);
}

/**
 * Clear session noticing state
 */
export function clearNoticingState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const realtimeNoticing = {
  detect: detectNoticing,
  shouldThrottle: shouldThrottleNoticing,
  record: recordNoticing,
  clear: clearNoticingState,
};

export default realtimeNoticing;

