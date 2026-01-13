/**
 * Audio DSP Module
 *
 * Unified interface for Rust-accelerated audio processing.
 *
 * @module speech/audio-dsp
 */
export { type PitchResult, type VadResult, type PreSttConfig, type PreSttStats, type FrameAnalysis, type VadConfig, type PreSttProcessor, type AudioDspProcessor, isNativeAudioDspAvailable, getNativeLoadError, detectPitch, detectPitchBatch, calculateRms, calculateEnergyDb, calculateZcr, calculateMean, calculateVariance, calculateStdDev, detectVoiceActivity, analyzeFrame, createPreSttProcessor, createTwilioPreSttProcessor, applyAgc, resetAgc, removeAgc, convertI16ToF32, createAudioDspProcessor, } from './native-audio-dsp.js';
//# sourceMappingURL=index.d.ts.map