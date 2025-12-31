/**
 * Voice Signal Detection for Anticipatory Questions
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module detects voice signals that indicate emotional state:
 * - Voice dropped or slowed
 * - Long pause before speaking
 * - Short answers after longer ones
 * - Energy level changes
 * - Speech pace changes
 *
 * These signals enable Ferni to ask anticipatory questions:
 * "Your voice dropped. What shifted?"
 * "You got quiet. That usually means something."
 */

import { getLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';

const log = getLogger();
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSignals {
  pauseBeforeSpeaking: boolean;
  pauseDurationMs?: number;
  voiceDropped: boolean;
  voiceEnergyChange?: 'increased' | 'decreased' | 'stable';
  shortAnswers: boolean;
  answerLengthTrend?: 'getting_shorter' | 'getting_longer' | 'stable';
  changedSubject: boolean;
  speechPace?: 'faster' | 'slower' | 'stable';
  repeatedPerson?: string;
}

export interface SignalContext {
  currentTranscript: string;
  previousTranscript?: string;
  currentTopic?: string;
  previousTopic?: string;
  pauseBeforeSpeakingMs?: number;
  currentEnergy?: number;
  previousEnergy?: number;
  recentAnswerLengths?: number[];
  mentionedPeople?: string[];
  previousMentionedPeople?: string[];
}

export interface AnticipatedNeed {
  signal: string;
  anticipated: string;
  checkQuestion: string;
  confidence: number;
  ifConfirmed: string;
  ifDenied: string;
}

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

/**
 * Analyze voice signals from context
 */
export function analyzeVoiceSignals(context: SignalContext): VoiceSignals {
  const signals: VoiceSignals = {
    pauseBeforeSpeaking: false,
    voiceDropped: false,
    shortAnswers: false,
    changedSubject: false,
  };

  // Pause before speaking (> 2 seconds is significant)
  if (context.pauseBeforeSpeakingMs && context.pauseBeforeSpeakingMs > 2000) {
    signals.pauseBeforeSpeaking = true;
    signals.pauseDurationMs = context.pauseBeforeSpeakingMs;
    log.debug({ pauseMs: context.pauseBeforeSpeakingMs }, 'Voice signal: Long pause detected');
  }

  // Voice energy dropped
  if (context.currentEnergy !== undefined && context.previousEnergy !== undefined) {
    const energyDelta = context.currentEnergy - context.previousEnergy;
    if (energyDelta < -0.2) {
      signals.voiceDropped = true;
      signals.voiceEnergyChange = 'decreased';
      log.debug({ delta: energyDelta }, 'Voice signal: Energy dropped');
    } else if (energyDelta > 0.2) {
      signals.voiceEnergyChange = 'increased';
    } else {
      signals.voiceEnergyChange = 'stable';
    }
  }

  // Short answers trend
  if (context.recentAnswerLengths && context.recentAnswerLengths.length >= 3) {
    const recent = context.recentAnswerLengths.slice(-3);
    const avgLength = recent.reduce((a, b) => a + b, 0) / recent.length;
    const currentLength = context.currentTranscript.split(' ').length;

    if (currentLength < avgLength * 0.5 && currentLength < 10) {
      signals.shortAnswers = true;
      signals.answerLengthTrend = 'getting_shorter';
      log.debug({ currentLength, avgLength }, 'Voice signal: Short answers detected');
    } else if (currentLength > avgLength * 1.5) {
      signals.answerLengthTrend = 'getting_longer';
    } else {
      signals.answerLengthTrend = 'stable';
    }
  }

  // Changed subject quickly
  if (context.currentTopic && context.previousTopic) {
    const topicSimilarity = calculateTopicSimilarity(context.currentTopic, context.previousTopic);
    if (topicSimilarity < 0.3) {
      signals.changedSubject = true;
      log.debug(
        { current: context.currentTopic, previous: context.previousTopic },
        'Voice signal: Topic change detected'
      );
    }
  }

  // Repeated person mentions
  if (context.mentionedPeople && context.mentionedPeople.length > 0) {
    const previousPeople = context.previousMentionedPeople || [];
    for (const person of context.mentionedPeople) {
      if (previousPeople.includes(person)) {
        signals.repeatedPerson = person;
        log.debug({ person }, 'Voice signal: Repeated person mention');
        break;
      }
    }
  }

  // Speech pace from transcript (rough heuristic based on word density)
  if (context.currentTranscript && context.previousTranscript) {
    const currentWordCount = context.currentTranscript.split(' ').length;
    const previousWordCount = context.previousTranscript.split(' ').length;

    // If significantly shorter with same topic, might indicate slowing down
    if (currentWordCount < previousWordCount * 0.6) {
      signals.speechPace = 'slower';
    } else if (currentWordCount > previousWordCount * 1.4) {
      signals.speechPace = 'faster';
    } else {
      signals.speechPace = 'stable';
    }
  }

  return signals;
}

/**
 * Calculate simple topic similarity
 */
function calculateTopicSimilarity(topic1: string, topic2: string): number {
  const words1 = new Set(topic1.toLowerCase().split(/\s+/));
  const words2 = new Set(topic2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Get anticipated need based on signals
 */
export function getAnticipatedNeed(signals: VoiceSignals): AnticipatedNeed | null {
  const needs: AnticipatedNeed[] = [];

  if (signals.pauseBeforeSpeaking && signals.pauseDurationMs && signals.pauseDurationMs > 3000) {
    needs.push({
      signal: 'Long pause before speaking',
      anticipated: 'Something difficult to say',
      checkQuestion: "There's something you're weighing whether to say. Am I reading that right?",
      confidence: 0.7,
      ifConfirmed: 'Create safety for them to share',
      ifDenied: 'Accept and move on without pressure',
    });
  }

  if (signals.voiceDropped && signals.voiceEnergyChange === 'decreased') {
    needs.push({
      signal: 'Voice energy dropped',
      anticipated: 'Entering emotional territory',
      checkQuestion: 'You sound different than you did a minute ago. What shifted?',
      confidence: 0.8,
      ifConfirmed: 'Slow down, hold space',
      ifDenied: 'Trust their read, stay present',
    });
  }

  if (signals.shortAnswers && signals.answerLengthTrend === 'getting_shorter') {
    needs.push({
      signal: 'Answers getting shorter',
      anticipated: 'Pulling back or tired',
      checkQuestion: "I notice you're being more brief. Should we pause here?",
      confidence: 0.6,
      ifConfirmed: 'Offer to hold space or end',
      ifDenied: 'Check if something specific',
    });
  }

  if (signals.changedSubject) {
    needs.push({
      signal: 'Changed subject quickly',
      anticipated: 'Topic was uncomfortable',
      checkQuestion: 'We moved away from something. Should we go back to it, or leave it?',
      confidence: 0.65,
      ifConfirmed: 'Gently return',
      ifDenied: 'Respect the boundary',
    });
  }

  if (signals.repeatedPerson) {
    needs.push({
      signal: `Mentioned ${signals.repeatedPerson} repeatedly`,
      anticipated: `Unresolved feelings about ${signals.repeatedPerson}`,
      checkQuestion: `${signals.repeatedPerson} keeps coming up. What is it about them that's on your mind?`,
      confidence: 0.75,
      ifConfirmed: 'Explore the relationship',
      ifDenied: 'Note for future reference',
    });
  }

  // Return highest confidence need
  if (needs.length === 0) return null;
  return needs.sort((a, b) => b.confidence - a.confidence)[0];
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

interface SessionVoiceHistory {
  answerLengths: number[];
  energyLevels: number[];
  pauseLengths: number[];
  topics: string[];
  mentionedPeople: string[];
  lastTranscript?: string;
  lastTopic?: string;
  lastEnergy?: number;
}

const sessionHistory = new Map<string, SessionVoiceHistory>();

/**
 * Initialize session tracking
 */
export function initializeVoiceTracking(sessionId: string): void {
  sessionHistory.set(sessionId, {
    answerLengths: [],
    energyLevels: [],
    pauseLengths: [],
    topics: [],
    mentionedPeople: [],
  });
}

/**
 * Record a turn for voice tracking
 */
export function recordVoiceTurn(
  sessionId: string,
  transcript: string,
  options: {
    topic?: string;
    energy?: number;
    pauseBeforeMs?: number;
    mentionedPeople?: string[];
  } = {}
): void {
  let history = sessionHistory.get(sessionId);
  if (!history) {
    initializeVoiceTracking(sessionId);
    history = sessionHistory.get(sessionId)!;
  }

  // Record answer length
  // 🦀 Rust-accelerated word counting
  const wordCount = RUST_COUNTING_AVAILABLE
    ? countWordsRust(transcript)
    : transcript.split(/\s+/).length;
  history.answerLengths.push(wordCount);
  if (history.answerLengths.length > 10) {
    history.answerLengths.shift();
  }

  // Record energy
  if (options.energy !== undefined) {
    history.energyLevels.push(options.energy);
    if (history.energyLevels.length > 10) {
      history.energyLevels.shift();
    }
  }

  // Record pause
  if (options.pauseBeforeMs) {
    history.pauseLengths.push(options.pauseBeforeMs);
    if (history.pauseLengths.length > 10) {
      history.pauseLengths.shift();
    }
  }

  // Record topic
  if (options.topic) {
    history.topics.push(options.topic);
    if (history.topics.length > 10) {
      history.topics.shift();
    }
  }

  // Record mentioned people
  if (options.mentionedPeople && options.mentionedPeople.length > 0) {
    history.mentionedPeople.push(...options.mentionedPeople);
  }

  // Update last values
  history.lastTranscript = transcript;
  history.lastTopic = options.topic;
  history.lastEnergy = options.energy;
}

/**
 * Build signal context from session history
 */
export function buildSignalContext(
  sessionId: string,
  currentTranscript: string,
  options: {
    currentTopic?: string;
    currentEnergy?: number;
    pauseBeforeSpeakingMs?: number;
    currentMentionedPeople?: string[];
  } = {}
): SignalContext {
  const history = sessionHistory.get(sessionId);

  return {
    currentTranscript,
    previousTranscript: history?.lastTranscript,
    currentTopic: options.currentTopic,
    previousTopic: history?.lastTopic,
    pauseBeforeSpeakingMs: options.pauseBeforeSpeakingMs,
    currentEnergy: options.currentEnergy,
    previousEnergy: history?.lastEnergy,
    recentAnswerLengths: history?.answerLengths || [],
    mentionedPeople: options.currentMentionedPeople || [],
    previousMentionedPeople: history?.mentionedPeople || [],
  };
}

/**
 * Get voice signals for current turn
 */
export function getVoiceSignalsForTurn(
  sessionId: string,
  currentTranscript: string,
  options: {
    currentTopic?: string;
    currentEnergy?: number;
    pauseBeforeSpeakingMs?: number;
    currentMentionedPeople?: string[];
  } = {}
): VoiceSignals {
  const context = buildSignalContext(sessionId, currentTranscript, options);
  return analyzeVoiceSignals(context);
}

/**
 * Clear session history
 */
export function clearVoiceHistory(sessionId: string): void {
  sessionHistory.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeVoiceSignals,
  getAnticipatedNeed,
  initializeVoiceTracking,
  recordVoiceTurn,
  buildSignalContext,
  getVoiceSignalsForTurn,
  clearVoiceHistory,
};
