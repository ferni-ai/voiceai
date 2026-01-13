/**
 * Audio Prosody Module
 *
 * Voice-based emotion detection through audio analysis.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice.
 *
 * @module audio-prosody
 */
export type { AudioBuffer, EmotionClassification, EmotionalDimensions, EnergyAnalysis, MetricsState, PauseAnalysis, PitchAnalysis, ProsodyFeatures, ProsodyMetrics, VoiceEmotion, VoiceEmotionResult, VoiceQualityMetrics, } from './types.js';
export { AudioProsodyAnalyzer, default } from './analyzer.js';
export { clearProsodyMetrics, getProsodyMetrics, getSessionAudioProsodyAnalyzer, recordProsodyAnalysis, resetSessionAudioProsodyAnalyzer, } from './session-management.js';
export { analyzePauses, analyzeVoiceQuality, autocorrelationPitch, calculateEnergy, convertToFloat32, estimatePitch, estimateSpeechRate, extractProsodyFeatures, mergeBuffers, } from './feature-extraction.js';
export { calculateStressLevel, classifyEmotion, detectAnxietyMarkers, mapToEmotionalDimensions, smoothFeatures, } from './emotion-mapping.js';
export { DEFAULT_REALTIME_CONFIG, RealTimeAudioAnalyzer, getActiveRealTimeAnalyzerCount, getRealTimeAnalyzer, resetAllRealTimeAnalyzers, resetRealTimeAnalyzer, type AnalyzerState, type PartialProsodyFeatures, type RealTimeAnalyzerConfig, } from './real-time-analyzer.js';
export { isNativeAudioAvailable, getNativeLibraryInfo, getNativeLoadError, createNativeProcessor, getOrCreateNativeProcessor, processNativeFrame, getNativeFullFeatures, resetNativeProcessor, removeNativeProcessor, getActiveNativeProcessorCount, clearAllNativeProcessors, convertI16ToF32, computeEnergyDb, isSpeechNative, createUnifiedAnalyzer, getSessionUnifiedAnalyzer, resetSessionUnifiedAnalyzer, getActiveUnifiedAnalyzerCount, clearAllUnifiedAnalyzers, type NativeProsodyResult, type NativeFullProsodyFeatures, type NativeProcessorStats, type NativeLibraryInfo, type UnifiedAudioAnalyzer, } from './native-analyzer.js';
//# sourceMappingURL=index.d.ts.map