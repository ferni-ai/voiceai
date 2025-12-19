/**
 * Unified Intelligence Analyzer
 *
 * Single entry point for all message analysis, combining:
 * - Text emotion detection
 * - Voice emotion analysis (prosody)
 * - Intent classification
 * - Topic tracking
 * - Conversation state
 * - Behavioral signals
 *
 * @module intelligence/unified-analyzer
 */

import { createLogger } from '../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../speech/audio-prosody.js';
import type { UserProfile } from '../types/user-profile.js';

// Core analyzers
import { getEmotionDetector, type EmotionResult, type PrimaryEmotion } from './emotion-detector.js';
import { getIntentClassifier, type IntentResult } from './intent-classifier.js';
import { getTopicTracker, type TopicExtractionResult } from './topic-tracker.js';
import {
  getStateMachine,
  type ConversationState,
  type PhaseGuidance,
} from './conversation-state.js';

// Distress levels
import { DISTRESS, getDistressCategory, type DistressLevel } from './distress-levels.js';

const log = createLogger({ module: 'UnifiedAnalyzer' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedAnalysisInput {
  message: string;
  userId?: string;
  sessionId?: string;
  voiceEmotion?: VoiceEmotionResult;
  userProfile?: UserProfile | null;
  isReturningUser?: boolean;
  turnNumber?: number;
  sessionMinutes?: number;
  previousAIResponse?: string;
  silenceDurationMs?: number;
  llmCaller?: (prompt: string) => Promise<string>;
}

export interface CombinedEmotion {
  primary: PrimaryEmotion;
  secondary?: PrimaryEmotion;
  confidence: number;
  valence: number;
  intensity: number;
  distressLevel: number;
  distressCategory: DistressLevel;
  suggestedTone: string;
  textAnalysis: EmotionResult;
  voiceAnalysis?: VoiceEmotionResult;
  hasMismatch: boolean;
  mismatchDetails?: {
    textEmotion: string;
    voiceEmotion: string;
    insight: string;
  };
}

export interface BehavioralSignals {
  isRushed: boolean;
  isRelaxed: boolean;
  wasInterruption: boolean;
  needsSupport: boolean;
  isPersonalSharing: boolean;
  seekingAdvice: boolean;
  isVenting: boolean;
  madeDecision: boolean;
  isWrappingUp: boolean;
  possibleContradiction: boolean;
  markers: string[];
}

export interface DeepUnderstandingInsights {
  hasSilenceInsights: boolean;
  hasRhythmPredictions: boolean;
  hasTensions: boolean;
  hasResistance: boolean;
  energyLevel?: 'low' | 'normal' | 'high';
  hasSubconsciousInsights: boolean;
  recommendedDepth?: 'surface' | 'moderate' | 'deep';
  needsRepair: boolean;
  hopeDirection?: 'improving' | 'stable' | 'declining';
  lifeChapter?: string;
  summary: string[];
}

export interface ResponseGuidance {
  responseLength: { min: number; max: number };
  currentTopic: string | null;
  phase: string;
  phaseGuidance: PhaseGuidance;
  guidelines: string[];
  priorityFocus: string;
  approach: 'empathy_first' | 'direct' | 'exploratory' | 'supportive' | 'celebratory';
}

export interface UnifiedAnalysisResult {
  emotion: CombinedEmotion;
  intent: IntentResult;
  topics: TopicExtractionResult;
  state: ConversationState;
  signals: BehavioralSignals;
  deepInsights: DeepUnderstandingInsights;
  guidance: ResponseGuidance;
  contextForPrompt: string;
  processingTimeMs: number;
  timestamp: Date;
  useHighEmotionMode: boolean;
}

// ============================================================================
// VOICE EMOTION MAPPING
// ============================================================================

const VOICE_TO_TEXT_EMOTION: Record<string, PrimaryEmotion> = {
  happy: 'joy',
  sad: 'sadness',
  angry: 'anger',
  fearful: 'fear',
  anxious: 'anxiety',
  excited: 'anticipation',
  stressed: 'anxiety',
  neutral: 'neutral',
  calm: 'neutral',
  surprised: 'surprise',
  disgusted: 'disgust',
};

// ============================================================================
// BEHAVIORAL PATTERNS
// ============================================================================

const BEHAVIORAL_PATTERNS = {
  rushed:
    /\b(gotta go|quick question|running late|no time|hurry|briefly|short on time|real quick)\b/i,
  relaxed: /\b(anyway|so tell me|just wanted to|wondering|been thinking|you know)\b/i,
  personal:
    /\b(my (wife|husband|kid|child|mom|dad|family|friend|partner)|i feel|makes me|i've been|i'm worried|i'm scared|never told anyone|between us)\b/i,
  advice:
    /\b(what (should|would|do you think)|how (should|can|do)|advice|recommend|suggest|opinion)\b/i,
  venting:
    /\b(just need to|had to tell|can you believe|so frustrating|can't stand|ugh|argh|seriously)\b/i,
  decision: /\b(i('ve| have) decided|going to|made up my mind|i'm going|i will|i chose)\b/i,
  wrapping:
    /\b(gotta go|have to go|need to go|i should go|bye|goodbye|see you|talk later|later|that's all|that's it|i'm done|thanks for)\b/i,
};

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function combineEmotions(
  textEmotion: EmotionResult,
  voiceEmotion?: VoiceEmotionResult
): CombinedEmotion {
  let { primary } = textEmotion;
  let { confidence } = textEmotion;
  let valence =
    textEmotion.valence === 'positive' ? 0.5 : textEmotion.valence === 'negative' ? -0.5 : 0;
  let { intensity } = textEmotion;
  let { distressLevel } = textEmotion;

  let hasMismatch = false;
  let mismatchDetails: CombinedEmotion['mismatchDetails'];

  if (voiceEmotion && voiceEmotion.confidence > 0.3) {
    const textWeight = 0.4;
    const voiceWeight = 0.6;

    confidence = textEmotion.confidence * textWeight + voiceEmotion.confidence * voiceWeight;
    valence = valence * textWeight + voiceEmotion.valence * voiceWeight;
    intensity = intensity * textWeight + voiceEmotion.arousal * voiceWeight;
    distressLevel = Math.max(distressLevel, voiceEmotion.stressLevel || 0);

    if (voiceEmotion.confidence > textEmotion.confidence) {
      const mappedEmotion = VOICE_TO_TEXT_EMOTION[voiceEmotion.primary];
      if (mappedEmotion) {
        primary = mappedEmotion;
      }
    }

    const textValencePositive = textEmotion.valence === 'positive';
    const voiceValencePositive = voiceEmotion.valence > 0.2;
    const textValenceNegative = textEmotion.valence === 'negative';
    const voiceValenceNegative = voiceEmotion.valence < -0.2;

    if (
      (textValencePositive && voiceValenceNegative) ||
      (textValenceNegative && voiceValencePositive)
    ) {
      hasMismatch = true;
      mismatchDetails = {
        textEmotion: textEmotion.primary,
        voiceEmotion: voiceEmotion.primary,
        insight:
          textValencePositive && voiceValenceNegative
            ? 'Words say fine but voice suggests distress - check in gently'
            : 'Words negative but voice calm - may be processing or exaggerating for effect',
      };
    }
  }

  const distressCategory = getDistressCategory(distressLevel);
  let { suggestedTone } = textEmotion;
  if (distressLevel >= DISTRESS.HIGH) {
    suggestedTone = 'gentle';
  } else if (hasMismatch) {
    suggestedTone = 'warm';
  } else if (valence > 0.3) {
    suggestedTone = 'enthusiastic';
  }

  return {
    primary,
    secondary: textEmotion.secondary,
    confidence,
    valence,
    intensity: Math.min(1, intensity),
    distressLevel,
    distressCategory,
    suggestedTone,
    textAnalysis: textEmotion,
    voiceAnalysis: voiceEmotion,
    hasMismatch,
    mismatchDetails,
  };
}

function detectBehavioralSignals(
  message: string,
  emotion: CombinedEmotion,
  intent: IntentResult
): BehavioralSignals {
  const markers: string[] = [];
  const wordCount = message.split(/\s+/).length;

  const isRushed = BEHAVIORAL_PATTERNS.rushed.test(message);
  if (isRushed) markers.push('rushed');

  const isRelaxed = BEHAVIORAL_PATTERNS.relaxed.test(message) || wordCount > 40;
  if (isRelaxed) markers.push('relaxed');

  const isPersonalSharing =
    BEHAVIORAL_PATTERNS.personal.test(message) || emotion.distressLevel > 0.5;
  if (isPersonalSharing) markers.push('personal');

  const seekingAdvice =
    BEHAVIORAL_PATTERNS.advice.test(message) || intent.primary === 'seeking_advice';
  if (seekingAdvice) markers.push('advice-seeking');

  const isVenting = BEHAVIORAL_PATTERNS.venting.test(message) && emotion.valence < 0;
  if (isVenting) markers.push('venting');

  const madeDecision = BEHAVIORAL_PATTERNS.decision.test(message);
  if (madeDecision) markers.push('decision');

  const isWrappingUp = BEHAVIORAL_PATTERNS.wrapping.test(message) || intent.primary === 'farewell';
  if (isWrappingUp) markers.push('wrapping-up');

  return {
    isRushed,
    isRelaxed,
    wasInterruption: false,
    needsSupport: emotion.distressLevel > 0.4 || intent.requiresEmpathy,
    isPersonalSharing,
    seekingAdvice,
    isVenting,
    madeDecision,
    isWrappingUp,
    possibleContradiction: false,
    markers,
  };
}

async function gatherDeepInsights(
  userId: string | undefined,
  _message: string,
  silenceDurationMs?: number
): Promise<DeepUnderstandingInsights> {
  if (!userId) {
    return {
      hasSilenceInsights: false,
      hasRhythmPredictions: false,
      hasTensions: false,
      hasResistance: false,
      hasSubconsciousInsights: false,
      needsRepair: false,
      summary: [],
    };
  }

  const summary: string[] = [];
  const hasSilenceInsights = silenceDurationMs !== undefined && silenceDurationMs > 2000;
  if (hasSilenceInsights) {
    summary.push('Notable silence detected - may indicate processing or emotional moment');
  }

  return {
    hasSilenceInsights,
    hasRhythmPredictions: false,
    hasTensions: false,
    hasResistance: false,
    hasSubconsciousInsights: false,
    needsRepair: false,
    summary,
  };
}

function buildResponseGuidance(
  topics: TopicExtractionResult,
  state: ConversationState,
  signals: BehavioralSignals,
  emotion: CombinedEmotion,
  deepInsights: DeepUnderstandingInsights,
  _userProfile?: UserProfile | null
): ResponseGuidance {
  const guidelines: string[] = [];
  const phaseGuidance = getStateMachine(false).getGuidance();

  let responseLength = { min: 25, max: 70 };
  if (signals.isRushed) {
    responseLength = { min: 10, max: 30 };
    guidelines.push('User is rushed - be brief and direct');
  } else if (signals.isRelaxed) {
    responseLength = { min: 40, max: 100 };
    guidelines.push('User is relaxed - can be more conversational');
  }

  if (signals.needsSupport) {
    guidelines.push('User needs emotional support - prioritize empathy over advice');
  }
  if (signals.isVenting) {
    guidelines.push("User is venting - listen and validate, don't problem-solve yet");
  }
  if (signals.madeDecision) {
    guidelines.push("User made a decision - affirm and support, don't second-guess");
  }
  if (emotion.hasMismatch && emotion.mismatchDetails) {
    guidelines.push(`MISMATCH: ${emotion.mismatchDetails.insight}`);
  }

  if (deepInsights.summary.length > 0) {
    guidelines.push(...deepInsights.summary.map((s) => `[INSIGHT] ${s}`));
  }

  if (deepInsights.recommendedDepth === 'surface') {
    guidelines.push('Keep response light - user signaling surface conversation');
  } else if (deepInsights.recommendedDepth === 'deep') {
    guidelines.push('User open to going deeper - can explore underlying feelings');
  }

  if (deepInsights.needsRepair) {
    guidelines.push('May need to clarify/repair - check understanding');
  }

  let approach: ResponseGuidance['approach'] = 'supportive';
  if (emotion.distressLevel >= DISTRESS.HIGH) {
    approach = 'empathy_first';
  } else if (signals.seekingAdvice && !signals.isVenting) {
    approach = 'direct';
  } else if (
    emotion.valence > 0.3 &&
    (signals.madeDecision || topics.detected.includes('celebration'))
  ) {
    approach = 'celebratory';
  } else if (state.phase === 'exploring') {
    approach = 'exploratory';
  }

  let priorityFocus = 'Listen and respond naturally';
  if (signals.needsSupport) {
    priorityFocus = 'Provide emotional support - acknowledge feelings first';
  } else if (signals.isVenting) {
    priorityFocus = "Validate feelings - don't fix yet";
  } else if (signals.madeDecision) {
    priorityFocus = 'Affirm their decision';
  } else if (emotion.hasMismatch) {
    priorityFocus = 'Gently check in on how they really feel';
  } else {
    priorityFocus = phaseGuidance.focus;
  }

  return {
    responseLength,
    currentTopic: topics.detected[0] || null,
    phase: state.phase,
    phaseGuidance,
    guidelines,
    priorityFocus,
    approach,
  };
}

function buildContextForPrompt(
  emotion: CombinedEmotion,
  intent: IntentResult,
  topics: TopicExtractionResult,
  state: ConversationState,
  guidance: ResponseGuidance,
  deepInsights: DeepUnderstandingInsights
): string {
  const sections: string[] = [];

  if (emotion.distressLevel >= DISTRESS.HIGH) {
    sections.push(
      `[PRIORITY] User appears distressed (${emotion.primary}, distress: ${emotion.distressLevel.toFixed(2)}). Focus on emotional support first.`
    );
  } else if (emotion.hasMismatch && emotion.mismatchDetails) {
    sections.push(`[MISMATCH] ${emotion.mismatchDetails.insight}`);
  } else if (emotion.valence > 0.3) {
    sections.push(`[MOOD] User seems ${emotion.primary}. Match their energy.`);
  }

  if (intent.requiresEmpathy) {
    sections.push(`[APPROACH] ${intent.suggestedApproach}`);
  }

  sections.push(`[PHASE] ${state.phase} - ${guidance.priorityFocus}`);

  if (topics.isTopicShift) {
    sections.push(`[TOPIC SHIFT] User is changing subjects. Acknowledge and follow.`);
  }
  if (state.topicsToCircleBack.length > 0 && state.turnCount % 5 === 0) {
    sections.push(`[CIRCLE BACK] Consider returning to: ${state.topicsToCircleBack[0]}`);
  }

  if (deepInsights.recommendedDepth) {
    sections.push(`[DEPTH] Recommended conversation depth: ${deepInsights.recommendedDepth}`);
  }
  if (deepInsights.needsRepair) {
    sections.push(`[REPAIR] Possible misunderstanding - clarify gently`);
  }
  if (deepInsights.energyLevel === 'low') {
    sections.push(
      `[ENERGY] User seems low energy - be gentle and warm, don't overwhelm but stay present`
    );
  } else if (deepInsights.energyLevel === 'high') {
    sections.push(`[ENERGY] User has high energy - match it! Be dynamic and engaged`);
  }

  return sections.join('\n');
}

// ============================================================================
// MAIN ANALYZER
// ============================================================================

export async function analyze(input: UnifiedAnalysisInput): Promise<UnifiedAnalysisResult> {
  const startTime = Date.now();

  const {
    message,
    userId,
    voiceEmotion,
    userProfile,
    isReturningUser = false,
    silenceDurationMs,
    llmCaller,
  } = input;

  const emotionDetector = getEmotionDetector();
  const intentClassifier = getIntentClassifier();
  const topicTracker = getTopicTracker();
  const stateMachine = getStateMachine(isReturningUser);

  let textEmotion = emotionDetector.detect(message);

  if (llmCaller && textEmotion.confidence < 0.5) {
    try {
      textEmotion = await emotionDetector.detectWithLLM(message, llmCaller);
    } catch {
      // Use keyword result if LLM fails
    }
  }

  const intent = intentClassifier.classify(message);
  const topics = topicTracker.extract(message);

  const state = stateMachine.processTurn({
    userMessage: message,
    emotion: textEmotion,
    intent,
    topics: topics.detected,
    userName: userProfile?.name,
  });

  const emotion = combineEmotions(textEmotion, voiceEmotion);
  const signals = detectBehavioralSignals(message, emotion, intent);
  const deepInsights = await gatherDeepInsights(userId, message, silenceDurationMs);

  const guidance = buildResponseGuidance(
    topics,
    state,
    signals,
    emotion,
    deepInsights,
    userProfile
  );

  const contextForPrompt = buildContextForPrompt(
    emotion,
    intent,
    topics,
    state,
    guidance,
    deepInsights
  );

  const useHighEmotionMode = Boolean(
    emotion.distressLevel >= DISTRESS.HIGH ||
    emotion.intensity > 0.8 ||
    signals.needsSupport ||
    emotion.hasMismatch
  );

  const processingTimeMs = Date.now() - startTime;

  log.debug(
    {
      emotion: emotion.primary,
      intent: intent.primary,
      topic: topics.detected[0],
      phase: state.phase,
      signals: signals.markers,
      deepInsightCount: deepInsights.summary.length,
      useHighEmotionMode,
      processingTimeMs,
    },
    'Unified analysis complete'
  );

  return {
    emotion,
    intent,
    topics,
    state,
    signals,
    deepInsights,
    guidance,
    contextForPrompt,
    processingTimeMs,
    timestamp: new Date(),
    useHighEmotionMode,
  };
}

export function analyzeSync(input: {
  message: string;
  voiceEmotion?: VoiceEmotionResult;
  isReturningUser?: boolean;
  userName?: string;
}): {
  emotion: CombinedEmotion;
  intent: IntentResult;
  topics: TopicExtractionResult;
  state: ConversationState;
  signals: BehavioralSignals;
} {
  const { message, voiceEmotion, isReturningUser = false, userName } = input;

  const emotionDetector = getEmotionDetector();
  const intentClassifier = getIntentClassifier();
  const topicTracker = getTopicTracker();
  const stateMachine = getStateMachine(isReturningUser);

  const textEmotion = emotionDetector.detect(message);
  const intent = intentClassifier.classify(message);
  const topics = topicTracker.extract(message);

  const state = stateMachine.processTurn({
    userMessage: message,
    emotion: textEmotion,
    intent,
    topics: topics.detected,
    userName,
  });

  const emotion = combineEmotions(textEmotion, voiceEmotion);
  const signals = detectBehavioralSignals(message, emotion, intent);

  return { emotion, intent, topics, state, signals };
}

export default analyze;
