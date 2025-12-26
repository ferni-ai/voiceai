/**
 * Predictive Anticipation Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is our most SUPERHUMAN capability: knowing what the user needs
 * BEFORE they say it. This creates the magical "they truly understand me" feeling.
 *
 * @module conversation/predictive-anticipation
 */

import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

import { seededPick } from '../utils/rng.js';

import {
  ADVICE_PATTERNS,
  CONNECTION_PATTERNS,
  DISTRACTION_PATTERNS,
  EMOTION_TO_NEED,
  NEED_GUIDANCE,
  VALIDATION_PATTERNS,
  VENTING_PATTERNS,
  VOICE_STATE_ACKNOWLEDGMENTS,
} from './patterns.js';
import type {
  EmotionalHistoryEntry,
  EmotionalPrediction,
  EmotionalTrajectory,
  NeedPrediction,
  PredictContext,
  PredictedNeed,
  PredictionResult,
  ProsodyInput,
  TopicSequencePrediction,
  TopicTransition,
  UserBaseline,
  VoiceStatePrediction,
} from './types.js';

// Re-export types
export type {
  EmotionalHistoryEntry,
  EmotionalPrediction,
  EmotionalTrajectory,
  NeedPrediction,
  PredictContext,
  PredictedNeed,
  PredictionResult,
  ProsodyInput,
  TopicSequencePrediction,
  TopicTransition,
  UserBaseline,
  VoiceStatePrediction,
};

const logger = createLogger({ module: 'PredictiveAnticipation' });

// ============================================================================
// PREDICTIVE ANTICIPATION ENGINE
// ============================================================================

export class PredictiveAnticipationEngine {
  private topicTransitions: TopicTransition[] = [];
  private currentTopic: string | null = null;
  private topicHistory: string[] = [];
  private emotionalHistory: EmotionalHistoryEntry[] = [];
  private needHistory: Array<{ need: PredictedNeed; wasCorrect?: boolean; turn: number }> = [];
  private voiceStateHistory: Array<{ state: VoiceStatePrediction['state']; turn: number }> = [];
  private turnCount = 0;
  private sessionStartTime: Date;
  private userId: string;
  private userBaseline: UserBaseline = {
    avgValence: 0,
    avgArousal: 0.5,
    typicalTopicFlow: new Map<string, string[]>(),
    preferredNeed: 'unknown',
    speechRateBaseline: 1.0,
    energyBaseline: 0.5,
  };

  constructor(sessionId: string, userId?: string) {
    this.userId = userId || sessionId;
    this.sessionStartTime = new Date();
    logger.debug({ sessionId, userId: this.userId }, 'PredictiveAnticipationEngine initialized');
  }

  /**
   * Process a turn and get predictions
   */
  predict(userMessage: string, context: PredictContext): PredictionResult {
    this.turnCount = context.turnCount;

    if (context.topic) this.recordTopicTransition(context.topic);
    if (context.emotion || context.valence !== undefined) {
      this.recordEmotionalState(
        context.valence ?? 0,
        context.arousal ?? 0.5,
        context.emotion ?? 'neutral'
      );
    }

    const voiceState = this.predictVoiceState(context.prosody);
    const topicSequence = this.predictNextTopic();
    const need = this.predictNeed(userMessage, context);
    const emotional = this.predictEmotionalTrajectory();

    const result: PredictionResult = {
      voiceState,
      topicSequence,
      need,
      emotional,
      overallConfidence: this.calculateOverallConfidence(voiceState, need, emotional),
      suggestions: this.generateSuggestions(voiceState, topicSequence, need, emotional),
    };

    if (result.overallConfidence > 0.7) {
      void humanizationSignalEmitter.emit({
        signalType: 'anticipation',
        intensity: result.overallConfidence,
      });
    }

    logger.debug(
      {
        voiceState: voiceState.state,
        predictedNeed: need.primaryNeed,
        trajectory: emotional.trajectory,
        confidence: result.overallConfidence.toFixed(2),
      },
      '🔮 Prediction generated'
    );

    return result;
  }

  recordPredictionOutcome(
    predictionType: 'need' | 'topic' | 'emotional',
    wasCorrect: boolean
  ): void {
    if (predictionType === 'need' && this.needHistory.length > 0) {
      this.needHistory[this.needHistory.length - 1].wasCorrect = wasCorrect;
    }
    logger.debug({ predictionType, wasCorrect }, 'Prediction outcome recorded');
  }

  updateBaseline(baseline: Partial<UserBaseline>): void {
    Object.assign(this.userBaseline, baseline);
    logger.debug('User baseline updated');
  }

  reset(): void {
    this.topicHistory = [];
    this.emotionalHistory = [];
    this.voiceStateHistory = [];
    this.currentTopic = null;
    this.turnCount = 0;
    this.sessionStartTime = new Date();
    logger.debug('PredictiveAnticipationEngine reset');
  }

  // Voice state prediction
  private predictVoiceState(prosody?: ProsodyInput): VoiceStatePrediction {
    if (!prosody) return { state: 'normal', confidence: 0.3, indicators: [], acknowledgment: null };

    const indicators: string[] = [];
    let state: VoiceStatePrediction['state'] = 'normal';
    let confidence = 0.5;

    if (prosody.energy < 0.35 && prosody.speechRate < 0.85) {
      state = 'tired';
      confidence = 0.7 + (0.35 - prosody.energy) + (0.85 - prosody.speechRate) / 2;
      indicators.push('low energy', 'slower speech');
    } else if (prosody.strain > 0.6 && prosody.speechRate > 1.15) {
      state = 'stressed';
      confidence = 0.6 + prosody.strain * 0.3;
      indicators.push('voice strain', 'rapid speech');
    } else if (prosody.energy > 0.7 && prosody.speechRate > 1.1 && prosody.pitchVariance > 0.4) {
      state = 'excited';
      confidence = 0.65;
      indicators.push('high energy', 'varied pitch');
    } else if (prosody.strain > 0.5 && prosody.energy < 0.4) {
      state = 'upset';
      confidence = 0.6;
      indicators.push('strained voice', 'low energy');
    } else if (prosody.energy < 0.4 && prosody.breathiness > 0.4) {
      state = 'calm';
      confidence = 0.55;
      indicators.push('relaxed breathing', 'low energy');
    } else if (prosody.pitchVariance > 0.5 && prosody.speechRate < 0.9) {
      state = 'distracted';
      confidence = 0.5;
      indicators.push('irregular speech');
    }

    let acknowledgment: string | null = null;
    if (confidence > 0.6) {
      const options = VOICE_STATE_ACKNOWLEDGMENTS[state];
      if (options && options.length > 0) {
        acknowledgment = seededPick(`${this.userId}:${this.turnCount}:voiceState:${state}`, options) ?? options[0];
      }
    }

    this.voiceStateHistory.push({ state, turn: this.turnCount });
    if (this.voiceStateHistory.length > 20) this.voiceStateHistory.shift();

    return { state, confidence: Math.min(1, confidence), indicators, acknowledgment };
  }

  // Topic prediction
  private recordTopicTransition(newTopic: string): void {
    if (this.currentTopic && this.currentTopic !== newTopic) {
      const existing = this.topicTransitions.find(
        (t) => t.from === this.currentTopic && t.to === newTopic
      );
      if (existing) existing.count++;
      else
        this.topicTransitions.push({
          from: this.currentTopic,
          to: newTopic,
          count: 1,
          contexts: [],
        });
    }
    this.topicHistory.push(newTopic);
    if (this.topicHistory.length > 30) this.topicHistory.shift();
    this.currentTopic = newTopic;
  }

  private predictNextTopic(): TopicSequencePrediction | null {
    if (!this.currentTopic || this.topicTransitions.length < 3) return null;

    const transitions = this.topicTransitions
      .filter((t) => t.from === this.currentTopic)
      .sort((a, b) => b.count - a.count);
    if (transitions.length === 0) return null;

    const mostLikely = transitions[0];
    const total = transitions.reduce((sum, t) => sum + t.count, 0);
    const confidence = mostLikely.count / total;

    if (mostLikely.count < 2 || confidence < 0.4) return null;

    const shouldPrompt = confidence > 0.6 && mostLikely.count >= 3;
    const phrases = [
      `Speaking of which... how's ${mostLikely.to} going?`,
      `I had a feeling you might want to talk about ${mostLikely.to}.`,
      `This usually leads to ${mostLikely.to} for you—want to go there?`,
    ];

    return {
      predictedTopic: mostLikely.to,
      confidence,
      evidence: `After ${this.currentTopic}, you often talk about ${mostLikely.to} (${mostLikely.count} times)`,
      shouldPrompt,
      promptPhrase: shouldPrompt ? seededPick(`${this.userId}:${this.turnCount}:topicPrompt:${mostLikely.to}`, phrases) ?? phrases[0] : undefined,
    };
  }

  // Need prediction
  private predictNeed(userMessage: string, context: PredictContext): NeedPrediction {
    const evidence: string[] = [];
    let primaryNeed: PredictedNeed = 'unknown';
    let secondaryNeed: PredictedNeed | undefined;
    let confidence = 0.4;

    if (VENTING_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'venting';
      confidence = 0.75;
      evidence.push('Venting language detected');
    } else if (ADVICE_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'advice';
      confidence = 0.8;
      evidence.push('Advice-seeking language');
    } else if (VALIDATION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'validation';
      confidence = 0.85;
      evidence.push('Validation-seeking language');
    } else if (DISTRACTION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'distraction';
      confidence = 0.7;
      evidence.push('Distraction language');
    } else if (CONNECTION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'connection';
      confidence = 0.75;
      evidence.push('Connection-seeking language');
    }

    if (context.emotion) {
      const emotionNeed = EMOTION_TO_NEED[context.emotion.toLowerCase()] as
        | PredictedNeed
        | undefined;
      if (emotionNeed) {
        if (primaryNeed === 'unknown') {
          primaryNeed = emotionNeed;
          confidence = 0.6;
          evidence.push(`Emotional state: ${context.emotion}`);
        } else if (emotionNeed !== primaryNeed) {
          secondaryNeed = emotionNeed;
          evidence.push(`Secondary need from emotion: ${context.emotion}`);
        }
      }
    }

    const wordCount = userMessage.split(/\s+/).length;
    if (wordCount > 80 && primaryNeed === 'unknown') {
      primaryNeed = 'venting';
      confidence = 0.5;
      evidence.push('Long message (likely venting)');
    } else if (
      wordCount < 10 &&
      primaryNeed === 'unknown' &&
      context.valence !== undefined &&
      context.valence < -0.3
    ) {
      primaryNeed = 'silence';
      confidence = 0.5;
      evidence.push('Brief + negative (may need space)');
    }

    let guidance = NEED_GUIDANCE[primaryNeed];
    if (secondaryNeed && secondaryNeed !== primaryNeed) {
      guidance += ` Also consider: ${NEED_GUIDANCE[secondaryNeed].split('.')[0].toLowerCase()}.`;
    }

    this.needHistory.push({ need: primaryNeed, turn: this.turnCount });
    if (this.needHistory.length > 20) this.needHistory.shift();

    return {
      primaryNeed,
      secondaryNeed,
      confidence: Math.min(1, confidence),
      evidence,
      responseGuidance: guidance,
    };
  }

  // Emotional trajectory
  private recordEmotionalState(valence: number, arousal: number, emotion: string): void {
    this.emotionalHistory.push({
      valence,
      arousal,
      emotion,
      turn: this.turnCount,
      timestamp: Date.now(),
    });
    if (this.emotionalHistory.length > 15) this.emotionalHistory.shift();
  }

  private predictEmotionalTrajectory(): EmotionalPrediction {
    if (this.emotionalHistory.length < 2) {
      return {
        currentState: { valence: 0, arousal: 0.5, dominantEmotion: 'neutral' },
        trajectory: 'stable',
        predictedDirection: 'unknown',
        confidence: 0.3,
      };
    }

    const recent = this.emotionalHistory.slice(-5);
    const current = recent[recent.length - 1];
    const valences = recent.map((e) => e.valence);
    const arousals = recent.map((e) => e.arousal);

    const valenceSlope = this.calculateSlope(valences);
    const arousalSlope = this.calculateSlope(arousals);

    let trajectory: EmotionalTrajectory;
    let predictedDirection: EmotionalPrediction['predictedDirection'];
    let confidence = 0.5;

    if (Math.abs(valenceSlope) < 0.05 && Math.abs(arousalSlope) < 0.05) {
      trajectory = 'stable';
      predictedDirection = 'stable';
      confidence = 0.7;
    } else if (arousalSlope > 0.1 && Math.abs(valenceSlope) < 0.1) {
      trajectory = 'escalating';
      predictedDirection = valenceSlope >= 0 ? 'more_positive' : 'more_negative';
      confidence = 0.6 + arousalSlope;
    } else if (arousalSlope < -0.1) {
      trajectory = 'de_escalating';
      predictedDirection = 'more_positive';
      confidence = 0.6;
    } else if (this.detectCycling(valences)) {
      trajectory = 'cycling';
      predictedDirection = 'unknown';
      confidence = 0.5;
    } else if (arousalSlope > 0.05 && current.valence < -0.2) {
      trajectory = 'building_to_something';
      predictedDirection = 'more_negative';
      confidence = 0.55;
    } else {
      trajectory = 'stable';
      predictedDirection =
        valenceSlope > 0 ? 'more_positive' : valenceSlope < 0 ? 'more_negative' : 'stable';
      confidence = 0.5;
    }

    let adjustmentSuggestion: EmotionalPrediction['adjustmentSuggestion'];
    if (trajectory === 'escalating' && predictedDirection === 'more_negative') {
      adjustmentSuggestion = {
        type: 'pace',
        direction: 'decrease',
        reason: 'Slow down to help them regulate',
      };
    } else if (trajectory === 'de_escalating' && current.arousal > 0.6) {
      adjustmentSuggestion = {
        type: 'energy',
        direction: 'decrease',
        reason: 'Match their calming energy',
      };
    } else if (trajectory === 'building_to_something') {
      adjustmentSuggestion = {
        type: 'tone',
        direction: 'shift',
        reason: 'Prepare for emotional disclosure',
      };
    }

    return {
      currentState: {
        valence: current.valence,
        arousal: current.arousal,
        dominantEmotion: current.emotion,
      },
      trajectory,
      predictedDirection,
      confidence: Math.min(1, confidence),
      adjustmentSuggestion,
    };
  }

  private calculateSlope(values: number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  private detectCycling(valences: number[]): boolean {
    if (valences.length < 4) return false;
    let changes = 0;
    for (let i = 2; i < valences.length; i++) {
      const prev = valences[i - 1] - valences[i - 2];
      const curr = valences[i] - valences[i - 1];
      if (prev * curr < 0) changes++;
    }
    return changes >= 2;
  }

  private generateSuggestions(
    voiceState: VoiceStatePrediction,
    topicSeq: TopicSequencePrediction | null,
    need: NeedPrediction,
    emotional: EmotionalPrediction
  ): string[] {
    const suggestions: string[] = [];
    if (voiceState.acknowledgment && voiceState.confidence > 0.65)
      suggestions.push(`Acknowledge: "${voiceState.acknowledgment}"`);
    if (topicSeq?.shouldPrompt && topicSeq.promptPhrase)
      suggestions.push(`Anticipate topic: "${topicSeq.promptPhrase}"`);
    if (need.confidence > 0.6) suggestions.push(`Need: ${need.responseGuidance.split('.')[0]}`);
    if (emotional.adjustmentSuggestion)
      suggestions.push(
        `Adjust: ${emotional.adjustmentSuggestion.direction} ${emotional.adjustmentSuggestion.type} - ${emotional.adjustmentSuggestion.reason}`
      );
    return suggestions;
  }

  private calculateOverallConfidence(
    voiceState: VoiceStatePrediction,
    need: NeedPrediction,
    emotional: EmotionalPrediction
  ): number {
    return voiceState.confidence * 0.2 + need.confidence * 0.5 + emotional.confidence * 0.3;
  }

  exportLearning(): { topicTransitions: TopicTransition[]; baseline: UserBaseline } {
    return {
      topicTransitions: this.topicTransitions.filter((t) => t.count >= 2),
      baseline: { ...this.userBaseline },
    };
  }

  importLearning(data: {
    topicTransitions?: TopicTransition[];
    baseline?: Partial<UserBaseline>;
  }): void {
    if (data.topicTransitions) this.topicTransitions = data.topicTransitions;
    if (data.baseline) Object.assign(this.userBaseline, data.baseline);
    logger.debug('Learning imported');
  }

  getState() {
    return {
      turnCount: this.turnCount,
      currentTopic: this.currentTopic,
      topicHistory: [...this.topicHistory],
      emotionalHistory: [...this.emotionalHistory],
      topicTransitions: [...this.topicTransitions],
    };
  }
}

// ============================================================================
// SESSION REGISTRY
// ============================================================================

const predictiveAnticipationRegistry = createSessionRegistry(
  (key: string) => {
    const [sessionId, userId] = key.includes(':') ? key.split(':') : [key, undefined];
    return new PredictiveAnticipationEngine(sessionId, userId);
  },
  { name: 'PredictiveAnticipation', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(predictiveAnticipationRegistry);

export function getPredictiveAnticipationEngine(
  sessionId: string,
  userId?: string
): PredictiveAnticipationEngine {
  return predictiveAnticipationRegistry.get(userId || sessionId);
}

export function resetPredictiveAnticipationEngine(sessionId: string, userId?: string): void {
  predictiveAnticipationRegistry.get(userId || sessionId).reset();
}

export function clearPredictiveAnticipationEngine(sessionId: string, userId?: string): void {
  predictiveAnticipationRegistry.reset(userId || sessionId);
}

export function getActivePredictiveAnticipationCount(): number {
  return predictiveAnticipationRegistry.getActiveCount();
}

export default PredictiveAnticipationEngine;
