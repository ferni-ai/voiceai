/**
 * Unified Intelligence Analysis Pipeline
 * 
 * Combines all intelligence modules into a single, coherent analysis flow.
 * This provides a clean entry point for understanding user messages with:
 * - Text emotion (keyword + LLM enhanced)
 * - Voice emotion (prosody)
 * - Intent classification
 * - Topic tracking
 * - State management
 * - Behavioral signals
 * 
 * Benefits:
 * - Single call for complete analysis
 * - Consistent results structure
 * - Optional LLM enhancement
 * - Easy to test and debug
 * - Clear data flow
 * 
 * @module intelligence/analysis-pipeline
 */

import { getLogger } from '../utils/safe-logger.js';
import type { EmotionResult } from './emotion-detector.js';
import type { IntentResult } from './intent-classifier.js';
import type { TopicExtractionResult } from './topic-tracker.js';
import type { ConversationState } from './conversation-state.js';
import type { VoiceEmotionResult } from '../speech/audio-prosody.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for the analysis pipeline
 */
export interface AnalysisInput {
  /** The user's message text */
  message: string;
  
  /** Optional voice emotion from prosody analysis */
  voiceEmotion?: VoiceEmotionResult;
  
  /** User's profile for context */
  userProfile?: UserProfile | null;
  
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  
  /** Optional LLM caller for enhanced analysis */
  llmCaller?: (prompt: string) => Promise<string>;
  
  /** Turn number in conversation */
  turnNumber?: number;
  
  /** Session duration in minutes */
  sessionMinutes?: number;
}

/**
 * Combined emotion analysis from text and voice
 */
export interface CombinedEmotionAnalysis {
  /** Primary emotion (text + voice combined) */
  primary: string;
  
  /** Confidence in the combined analysis */
  confidence: number;
  
  /** Emotional valence (-1 to 1) */
  valence: number;
  
  /** Distress level requiring support (0-1) */
  distressLevel: number;
  
  /** Intensity of the emotion (0-1) */
  intensity: number;
  
  /** Text-based analysis */
  text: EmotionResult;
  
  /** Voice-based analysis (if available) */
  voice?: VoiceEmotionResult;
  
  /** Was the analysis enhanced by LLM? */
  llmEnhanced: boolean;
  
  /** Suggested response tone */
  suggestedTone: string;
}

/**
 * Behavioral signals detected in the message
 */
export interface BehavioralSignals {
  /** User is rushing */
  isRushed: boolean;
  
  /** User is relaxed and conversational */
  isRelaxed: boolean;
  
  /** User interrupted */
  wasInterruption: boolean;
  
  /** User needs emotional support */
  needsSupport: boolean;
  
  /** User is sharing something personal */
  isPersonalSharing: boolean;
  
  /** User is asking for advice */
  seekingAdvice: boolean;
  
  /** User is venting (needs to be heard) */
  isVenting: boolean;
  
  /** User made a decision */
  madeDecision: boolean;
  
  /** User contradicted something from profile */
  possibleContradiction: boolean;
  
  /** Keywords that triggered detection */
  markers: string[];
}

/**
 * Context for response generation
 */
export interface ResponseContext {
  /** Suggested response length (words) */
  responseLength: { min: number; max: number };
  
  /** Topic being discussed */
  currentTopic: string | null;
  
  /** Previous topic (if changed) */
  previousTopic?: string;
  
  /** Topic transition phrase if needed */
  transitionPhrase?: string;
  
  /** Conversation phase */
  phase: string;
  
  /** Relationship stage with user */
  relationshipStage: string;
  
  /** Key guidance for response */
  guidance: string[];
}

/**
 * Complete analysis result
 */
export interface AnalysisResult {
  /** Combined emotion analysis */
  emotion: CombinedEmotionAnalysis;
  
  /** Intent classification */
  intent: IntentResult;
  
  /** Topics extracted */
  topics: TopicExtractionResult;
  
  /** Conversation state */
  state: ConversationState;
  
  /** Behavioral signals */
  signals: BehavioralSignals;
  
  /** Response generation context */
  responseContext: ResponseContext;
  
  /** Processing time in ms */
  processingTimeMs: number;
  
  /** Analysis timestamp */
  timestamp: Date;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Detect behavioral signals in the message
 */
function detectBehavioralSignals(
  message: string,
  emotion: EmotionResult,
  intent: IntentResult
): BehavioralSignals {
  const lower = message.toLowerCase();
  const markers: string[] = [];
  
  // Rushing signals
  const rushPatterns = /\b(gotta go|quick question|running late|no time|hurry|briefly|short on time)\b/;
  const isRushed = rushPatterns.test(lower);
  if (isRushed) markers.push('rushed');
  
  // Relaxed signals
  const relaxedPatterns = /\b(anyway|so tell me|just wanted to|wondering|been thinking)\b/;
  const wordCount = message.split(/\s+/).length;
  const isRelaxed = relaxedPatterns.test(lower) || wordCount > 40;
  if (isRelaxed) markers.push('relaxed');
  
  // Personal sharing signals
  const personalPatterns = /\b(my (wife|husband|kid|child|mom|dad|family|friend)|i feel|makes me|i've been|i'm worried|i'm scared|never told anyone)\b/;
  const isPersonalSharing = personalPatterns.test(lower) || emotion.distressLevel > 0.5;
  if (isPersonalSharing) markers.push('personal');
  
  // Advice seeking
  const advicePatterns = /\b(what (should|would|do you think)|how (should|can|do)|advice|recommend|suggest|opinion)\b/;
  const seekingAdvice = advicePatterns.test(lower) || intent.primary === 'seeking_advice';
  if (seekingAdvice) markers.push('advice-seeking');
  
  // Venting (needs to be heard, not solved)
  const ventingPatterns = /\b(just need to|had to tell|can you believe|so frustrating|can't stand|ugh|argh)\b/;
  const isVenting = ventingPatterns.test(lower) && emotion.valence === 'negative';
  if (isVenting) markers.push('venting');
  
  // Decision making
  const decisionPatterns = /\b(i('ve| have) decided|going to|made up my mind|i'm going|i will)\b/;
  const madeDecision = decisionPatterns.test(lower);
  if (madeDecision) markers.push('decision');
  
  return {
    isRushed,
    isRelaxed,
    wasInterruption: false, // Would need audio timing
    needsSupport: emotion.distressLevel > 0.4,
    isPersonalSharing,
    seekingAdvice,
    isVenting,
    madeDecision,
    possibleContradiction: false, // Checked separately with profile
    markers,
  };
}

/**
 * Combine text and voice emotion analysis
 */
function combineEmotionAnalysis(
  textEmotion: EmotionResult,
  voiceEmotion?: VoiceEmotionResult,
  llmEnhanced: boolean = false
): CombinedEmotionAnalysis {
  // If no voice emotion, use text only
  if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
    return {
      primary: textEmotion.primary,
      confidence: textEmotion.confidence,
      valence: textEmotion.valence === 'positive' ? 0.5 : textEmotion.valence === 'negative' ? -0.5 : 0,
      distressLevel: textEmotion.distressLevel,
      intensity: textEmotion.intensity,
      text: textEmotion,
      voice: voiceEmotion,
      llmEnhanced,
      suggestedTone: textEmotion.suggestedTone,
    };
  }
  
  // Weight voice emotion higher for emotional content (prosody is often more honest)
  const textWeight = 0.4;
  const voiceWeight = 0.6;
  
  // Map voice emotions to text emotions
  const voiceToTextMap: Record<string, string> = {
    happy: 'joy',
    sad: 'sadness',
    angry: 'anger',
    fearful: 'fear',
    anxious: 'anxiety',
    excited: 'anticipation',
    stressed: 'anxiety',
    neutral: 'neutral',
  };
  
  // Determine primary - use voice if high confidence, otherwise text
  let primary: string = textEmotion.primary;
  if (voiceEmotion.confidence > textEmotion.confidence) {
    const mapped = voiceToTextMap[voiceEmotion.primary];
    if (mapped) primary = mapped;
  }
  
  // Combine metrics
  const combinedConfidence = 
    textEmotion.confidence * textWeight + voiceEmotion.confidence * voiceWeight;
  const combinedValence = 
    (textEmotion.valence === 'positive' ? 0.5 : textEmotion.valence === 'negative' ? -0.5 : 0) * textWeight +
    voiceEmotion.valence * voiceWeight;
  const combinedDistress = Math.max(
    textEmotion.distressLevel,
    voiceEmotion.stressLevel || 0
  );
  const combinedIntensity = 
    textEmotion.intensity * textWeight + voiceEmotion.arousal * voiceWeight;
  
  // Determine tone based on combined analysis
  let suggestedTone = textEmotion.suggestedTone;
  if (combinedDistress > 0.6) {
    suggestedTone = 'gentle';
  } else if (combinedValence > 0.3) {
    suggestedTone = 'warm';
  }
  
  return {
    primary,
    confidence: combinedConfidence,
    valence: combinedValence,
    distressLevel: combinedDistress,
    intensity: Math.min(1, combinedIntensity),
    text: textEmotion,
    voice: voiceEmotion,
    llmEnhanced,
    suggestedTone,
  };
}

/**
 * Build response context from analysis
 */
function buildResponseContext(
  topics: TopicExtractionResult,
  state: ConversationState,
  signals: BehavioralSignals,
  userProfile?: UserProfile | null
): ResponseContext {
  const guidance: string[] = [];
  
  // Response length based on signals
  let responseLength = { min: 25, max: 70 };
  if (signals.isRushed) {
    responseLength = { min: 10, max: 30 };
    guidance.push('User is rushed - be brief and direct');
  } else if (signals.isRelaxed) {
    responseLength = { min: 40, max: 100 };
    guidance.push('User is relaxed - can be more conversational');
  }
  
  // Emotional guidance
  if (signals.needsSupport) {
    guidance.push('User needs emotional support - prioritize empathy over advice');
  }
  if (signals.isVenting) {
    guidance.push('User is venting - listen and validate, don\'t problem-solve yet');
  }
  if (signals.madeDecision) {
    guidance.push('User made a decision - affirm and support, don\'t second-guess');
  }
  
  // Topic guidance
  const currentTopic = topics.detected[0] || null;
  let transitionPhrase: string | undefined;
  
  if (topics.isTopicShift && topics.suggestedTransition) {
    transitionPhrase = topics.suggestedTransition;
    guidance.push(`Topic shifting - use transition: "${transitionPhrase}"`);
  }
  
  // Relationship stage
  const relationshipStage = userProfile?.relationshipStage || 'stranger';
  
  return {
    responseLength,
    currentTopic,
    previousTopic: topics.isTopicShift ? undefined : (currentTopic || undefined),
    transitionPhrase,
    phase: state.phase,
    relationshipStage,
    guidance,
  };
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Run the complete analysis pipeline
 * 
 * This is the recommended entry point for message analysis.
 * It combines all intelligence modules and provides consistent results.
 */
export async function analyzeUserMessage(input: AnalysisInput): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  // Import modules dynamically to avoid circular dependencies
  const { getEmotionDetector } = await import('./emotion-detector.js');
  const { getIntentClassifier } = await import('./intent-classifier.js');
  const { getTopicTracker } = await import('./topic-tracker.js');
  const { getStateMachine } = await import('./conversation-state.js');
  
  // Run base analyses in parallel
  const emotionDetector = getEmotionDetector();
  const intentClassifier = getIntentClassifier();
  const topicTracker = getTopicTracker();
  const stateMachine = getStateMachine(input.isReturningUser);
  
  // Base text analysis
  let textEmotion = emotionDetector.detect(input.message);
  const intent = intentClassifier.classify(input.message);
  const topics = topicTracker.extract(input.message);
  
  // LLM enhancement for low-confidence emotion detection
  let llmEnhanced = false;
  if (input.llmCaller && textEmotion.confidence < 0.5) {
    try {
      textEmotion = await emotionDetector.detectWithLLM(input.message, input.llmCaller);
      llmEnhanced = textEmotion.markers.includes('[llm-enhanced]');
    } catch {
      // Use keyword result if LLM fails
    }
  }
  
  // Update conversation state
  const state = stateMachine.processTurn({
    userMessage: input.message,
    emotion: textEmotion,
    intent,
    topics: topics.detected,
    userName: input.userProfile?.name,
  });
  
  // Combine text and voice emotion
  const combinedEmotion = combineEmotionAnalysis(
    textEmotion,
    input.voiceEmotion,
    llmEnhanced
  );
  
  // Detect behavioral signals
  const signals = detectBehavioralSignals(input.message, textEmotion, intent);
  
  // Build response context
  const responseContext = buildResponseContext(
    topics,
    state,
    signals,
    input.userProfile
  );
  
  const processingTimeMs = Date.now() - startTime;
  
  getLogger().debug({
    emotion: combinedEmotion.primary,
    intent: intent.primary,
    topic: topics.detected[0],
    phase: state.phase,
    signals: signals.markers,
    processingTimeMs,
  }, 'Analysis pipeline complete');
  
  return {
    emotion: combinedEmotion,
    intent,
    topics,
    state,
    signals,
    responseContext,
    processingTimeMs,
    timestamp: new Date(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  detectBehavioralSignals,
  combineEmotionAnalysis,
  buildResponseContext,
};

export default analyzeUserMessage;

