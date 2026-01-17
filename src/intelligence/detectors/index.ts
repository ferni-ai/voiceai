/**
 * Detectors Module
 *
 * Pure detection functions for analyzing user input.
 * These are stateless and have no side effects.
 *
 * @module intelligence/detectors
 */

// Emotion Detection
export {
  detectEmotion,
  EmotionDetector,
  getEmotionDetector,
  type EmotionResult,
  type PrimaryEmotion,
  type Valence,
} from './emotion.js';

// Intent Classification
export {
  classifyIntent,
  getIntentClassifier,
  IntentClassifier,
  type Intent,
  type IntentResult,
} from './intent.js';

// Topic Tracking
export {
  extractTopics,
  getTopicTracker,
  TopicTracker,
  type Topic,
  type TopicCategory,
  type TopicExtractionResult,
} from './topic.js';

// Distress Level Detection
export {
  DISTRESS,
  DISTRESS_GUIDANCE,
  formatDistressForPrompt,
  getDistressCategory,
  getDistressGuidance,
  getSuggestedTone,
  isCrisis,
  needsEmotionalSupport,
  shouldBeGentle,
  type DistressGuidance,
  type DistressLevel,
} from './distress.js';

// Hedging Language Detection
export {
  getHedgingDetector,
  HedgingDetector,
  resetAllHedgingDetectors,
  resetHedgingDetector,
  type HedgingAnalysisResult,
  type HedgingCategory,
  type HedgingInstance,
} from './hedging.js';

// Self-Soothing Detection
export {
  getSelfSoothingDetector,
  resetAllSelfSoothingDetectors,
  resetSelfSoothingDetector,
  SelfSoothingDetector,
  type SelfSoothingCategory,
  type SelfSoothingInstance,
  type SelfSoothingResult,
} from './self-soothing.js';

// Cognitive Load Detection
export {
  CognitiveLoadDetector,
  getCognitiveLoadDetector,
  resetAllCognitiveLoadDetectors,
  resetCognitiveLoadDetector,
  type CognitiveLoadIndicators,
  type CognitiveLoadLevel,
  type CognitiveLoadObservation,
  type CognitiveLoadState,
} from './cognitive-load.js';

// Voice-Text Mismatch Detection
export {
  detectMismatch,
  recordMismatchInsight,
  buildMismatchGuidance,
  type MismatchResult,
  type MismatchType,
} from './voice-mismatch.js';
