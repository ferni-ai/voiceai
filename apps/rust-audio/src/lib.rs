//! Ferni Audio Processing - Zero-Allocation Real-Time Audio Analysis
//!
//! This crate provides high-performance audio processing for the Ferni voice agent.
//!
//! Key features:
//! - Zero per-frame allocations (all buffers pre-allocated at session start)
//! - Efficient Int16 → Float32 conversion
//! - Real-time prosody feature extraction (pitch, energy, ZCR)
//! - Session-scoped processors with proper cleanup
//!
//! # Performance Characteristics
//!
//! - No GC pressure: ~192KB/sec reduction vs JavaScript implementation
//! - Frame processing: <1ms per 20ms frame
//! - Memory: ~200KB per session (pre-allocated buffers)
//!
//! # Usage from Node.js
//!
//! ```javascript
//! const { NativeAudioProcessor, getLibraryInfo } = require('@ferni/audio');
//!
//! // Check library info
//! const info = getLibraryInfo();
//! console.log(info.version, info.bufferPoolSize);
//!
//! // Create processor for a session
//! const processor = new NativeAudioProcessor('session-123', 16000);
//!
//! // Process frames (Int16Array from LiveKit)
//! const result = processor.processFrame(int16Samples, timestampMs);
//! if (result) {
//!   console.log(result.pitchHz, result.energyDb, result.isSpeech);
//! }
//!
//! // Get full features at end of utterance
//! const full = processor.getFullFeatures();
//!
//! // Reset for reuse
//! processor.reset();
//! ```

#![deny(clippy::all)]

mod audio_processor;
mod buffer_pool;
mod feature_extraction;
mod fft;
mod post_tts;
mod post_tts_processor;
mod pre_stt;
mod sola;
mod stt;
mod yin;

// Re-export YIN NAPI functions
pub use yin::{estimate_pitch_yin, batch_estimate_pitch_yin, NativeYinResult};

// Re-export Whisper STT (after pre-STT pipeline)
pub use stt::{NativeWhisperStt, WhisperSttConfig, transcribe_whisper};

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Mutex;
use wide::f32x8;

use audio_processor::{AudioProcessor, AudioProcessorConfig, PitchTrend, ProcessorStats, ProsodyResult, FullProsodyFeatures};

// ============================================================================
// LIBRARY INFO
// ============================================================================

/// Library information
#[napi(object)]
pub struct LibraryInfo {
    pub version: String,
    pub buffer_pool_size: u32,
    pub max_frame_size: u32,
    pub default_sample_rate: u32,
}

/// Get library information
#[napi]
pub fn get_library_info() -> LibraryInfo {
    LibraryInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        buffer_pool_size: 4,
        max_frame_size: 1024,
        default_sample_rate: 16000,
    }
}

// ============================================================================
// PROSODY RESULT (NAPI-compatible)
// ============================================================================

/// Prosody analysis result from a single frame
#[napi(object)]
pub struct NativeProsodyResult {
    /// Current pitch estimate (Hz)
    pub pitch_hz: f64,
    /// Pitch confidence (0-1)
    pub pitch_confidence: f64,
    /// Energy in dB
    pub energy_db: f64,
    /// Short-term energy variance
    pub energy_variance: f64,
    /// Zero crossing rate
    pub zcr: f64,
    /// Is speech detected?
    pub is_speech: bool,
    /// Is voiced speech?
    pub is_voiced: bool,
    /// Current silence duration (ms)
    pub silence_ms: f64,
    /// Pitch trend: "rising", "falling", "stable"
    pub pitch_trend: String,
    /// Timestamp of analysis (ms)
    pub timestamp_ms: f64,
}

impl From<ProsodyResult> for NativeProsodyResult {
    fn from(r: ProsodyResult) -> Self {
        Self {
            pitch_hz: r.pitch_hz as f64,
            pitch_confidence: r.pitch_confidence as f64,
            energy_db: r.energy_db as f64,
            energy_variance: r.energy_variance as f64,
            zcr: r.zcr as f64,
            is_speech: r.is_speech,
            is_voiced: r.is_voiced,
            silence_ms: r.silence_ms as f64,
            pitch_trend: match r.pitch_trend {
                PitchTrend::Rising => "rising".to_string(),
                PitchTrend::Falling => "falling".to_string(),
                PitchTrend::Stable => "stable".to_string(),
            },
            timestamp_ms: r.timestamp_ms as f64,
        }
    }
}

/// Full prosody features for end-of-utterance analysis
#[napi(object)]
pub struct NativeFullProsodyFeatures {
    /// Mean pitch (Hz)
    pub pitch_mean: f64,
    /// Pitch variance
    pub pitch_variance: f64,
    /// Pitch range (max - min)
    pub pitch_range: f64,
    /// Mean energy (dB)
    pub energy_mean: f64,
    /// Energy variance
    pub energy_variance: f64,
    /// Estimated speech rate (syllables/sec approximation)
    pub speech_rate: f64,
    /// Total utterance duration (ms)
    pub duration_ms: f64,
    /// Speaking ratio (speech time / total time)
    pub speaking_ratio: f64,
    /// Number of pauses detected
    pub pause_count: u32,
}

impl From<FullProsodyFeatures> for NativeFullProsodyFeatures {
    fn from(f: FullProsodyFeatures) -> Self {
        Self {
            pitch_mean: f.pitch_mean as f64,
            pitch_variance: f.pitch_variance as f64,
            pitch_range: f.pitch_range as f64,
            energy_mean: f.energy_mean as f64,
            energy_variance: f.energy_variance as f64,
            speech_rate: f.speech_rate as f64,
            duration_ms: f.duration_ms as f64,
            speaking_ratio: f.speaking_ratio as f64,
            pause_count: f.pause_count,
        }
    }
}

/// Processor statistics
#[napi(object)]
pub struct NativeProcessorStats {
    pub total_samples: f64,
    pub analysis_count: f64,
    pub buffer_fill_level: f64,
    pub is_in_speech: bool,
    pub current_silence_ms: f64,
}

impl From<ProcessorStats> for NativeProcessorStats {
    fn from(s: ProcessorStats) -> Self {
        Self {
            total_samples: s.total_samples as f64,
            analysis_count: s.analysis_count as f64,
            buffer_fill_level: s.buffer_fill_level as f64,
            is_in_speech: s.is_in_speech,
            current_silence_ms: s.current_silence_ms as f64,
        }
    }
}

// ============================================================================
// SESSION-SCOPED AUDIO PROCESSOR (NAPI CLASS)
// ============================================================================

/// Native audio processor for real-time voice analysis
///
/// Pre-allocates all buffers at construction for zero per-frame allocations.
#[napi]
pub struct NativeAudioProcessor {
    processor: AudioProcessor,
    session_id: String,
}

#[napi]
impl NativeAudioProcessor {
    /// Create a new audio processor for a session
    ///
    /// # Arguments
    /// * `session_id` - Unique session identifier for debugging
    /// * `sample_rate` - Audio sample rate (default: 16000)
    #[napi(constructor)]
    pub fn new(session_id: String, sample_rate: Option<u32>) -> Self {
        let config = AudioProcessorConfig {
            sample_rate: sample_rate.unwrap_or(16000),
            ..Default::default()
        };

        Self {
            processor: AudioProcessor::new(config),
            session_id,
        }
    }

    /// Process an Int16 audio frame
    ///
    /// This is the main entry point for LiveKit audio frames.
    /// Uses pre-allocated buffers for zero per-frame allocations.
    ///
    /// # Arguments
    /// * `samples` - Int16Array audio samples from LiveKit
    /// * `timestamp_ms` - Current timestamp in milliseconds
    ///
    /// # Returns
    /// Prosody features if enough data is available, None otherwise
    #[napi]
    pub fn process_frame(&mut self, samples: Int16Array, timestamp_ms: f64) -> Option<NativeProsodyResult> {
        let slice = samples.as_ref();
        self.processor
            .process_frame_i16(slice, timestamp_ms as u64)
            .map(|r| r.into())
    }

    /// Process a Float32 audio frame
    ///
    /// Use this if samples are already normalized floats.
    #[napi]
    pub fn process_frame_f32(&mut self, samples: Float32Array, timestamp_ms: f64) -> Option<NativeProsodyResult> {
        let slice = samples.as_ref();
        self.processor
            .process_frame_f32(slice, timestamp_ms as u64)
            .map(|r| r.into())
    }

    /// Get full prosody features for end-of-utterance analysis
    #[napi]
    pub fn get_full_features(&self) -> NativeFullProsodyFeatures {
        self.processor.get_full_features().into()
    }

    /// Get processor statistics
    #[napi]
    pub fn get_stats(&self) -> NativeProcessorStats {
        self.processor.get_stats().into()
    }

    /// Reset processor for reuse
    ///
    /// Clears all state but keeps pre-allocated buffers.
    #[napi]
    pub fn reset(&mut self) {
        self.processor.reset();
    }

    /// Get session ID
    #[napi(getter)]
    pub fn session_id(&self) -> String {
        self.session_id.clone()
    }
}

// ============================================================================
// SESSION MANAGER (Global Registry)
// ============================================================================

lazy_static::lazy_static! {
    static ref SESSION_PROCESSORS: Mutex<HashMap<String, AudioProcessor>> = Mutex::new(HashMap::new());
}

/// Get or create a processor for a session (global registry)
///
/// Use this for simpler session management where you don't want
/// to hold a reference to the NativeAudioProcessor object.
#[napi]
pub fn get_or_create_processor(session_id: String, sample_rate: Option<u32>) -> bool {
    let mut map = SESSION_PROCESSORS.lock().unwrap();
    if map.contains_key(&session_id) {
        return false; // Already exists
    }

    let config = AudioProcessorConfig {
        sample_rate: sample_rate.unwrap_or(16000),
        ..Default::default()
    };
    map.insert(session_id, AudioProcessor::new(config));
    true // Created new
}

/// Process a frame using the session registry
#[napi]
pub fn process_session_frame(
    session_id: String,
    samples: Int16Array,
    timestamp_ms: f64,
) -> Option<NativeProsodyResult> {
    let mut map = SESSION_PROCESSORS.lock().unwrap();
    let processor = map.get_mut(&session_id)?;
    processor
        .process_frame_i16(samples.as_ref(), timestamp_ms as u64)
        .map(|r| r.into())
}

/// Get full features from session registry
#[napi]
pub fn get_session_full_features(session_id: String) -> Option<NativeFullProsodyFeatures> {
    let map = SESSION_PROCESSORS.lock().unwrap();
    map.get(&session_id).map(|p| p.get_full_features().into())
}

/// Reset a session processor
#[napi]
pub fn reset_session_processor(session_id: String) -> bool {
    let mut map = SESSION_PROCESSORS.lock().unwrap();
    if let Some(processor) = map.get_mut(&session_id) {
        processor.reset();
        true
    } else {
        false
    }
}

/// Remove a session processor
#[napi]
pub fn remove_session_processor(session_id: String) -> bool {
    let mut map = SESSION_PROCESSORS.lock().unwrap();
    map.remove(&session_id).is_some()
}

/// Get count of active session processors
#[napi]
pub fn get_active_processor_count() -> u32 {
    SESSION_PROCESSORS.lock().unwrap().len() as u32
}

/// Clear all session processors (for emergency cleanup)
#[napi]
pub fn clear_all_processors() -> u32 {
    let mut map = SESSION_PROCESSORS.lock().unwrap();
    let count = map.len() as u32;
    map.clear();
    count
}

// ============================================================================
// STANDALONE UTILITIES
// ============================================================================

/// Convert Int16 samples to Float32 (standalone function)
///
/// SIMD-accelerated: processes 8 samples at a time using f32x8.
/// For when you just need conversion without full processing.
#[napi]
pub fn convert_i16_to_f32(samples: Int16Array) -> Float32Array {
    let slice = samples.as_ref();
    let len = slice.len();
    let mut result = Vec::with_capacity(len);

    // SIMD normalization factor: 1/32768
    let scale = f32x8::splat(1.0 / 32768.0);

    // Process 8 samples at a time with SIMD
    let chunks = len / 8;
    for i in 0..chunks {
        let base = i * 8;

        // Convert i16 to f32 (necessary widening step)
        let f0 = slice[base] as f32;
        let f1 = slice[base + 1] as f32;
        let f2 = slice[base + 2] as f32;
        let f3 = slice[base + 3] as f32;
        let f4 = slice[base + 4] as f32;
        let f5 = slice[base + 5] as f32;
        let f6 = slice[base + 6] as f32;
        let f7 = slice[base + 7] as f32;

        // Load into SIMD register and scale
        let samples_simd = f32x8::new([f0, f1, f2, f3, f4, f5, f6, f7]);
        let normalized = samples_simd * scale;

        // Extract and store
        let arr = normalized.to_array();
        result.extend_from_slice(&arr);
    }

    // Handle remaining samples (scalar)
    for i in (chunks * 8)..len {
        result.push(slice[i] as f32 / 32768.0);
    }

    Float32Array::new(result)
}

/// Resample Float32 audio from one sample rate to another (linear interpolation).
///
/// Used for Qwen3-Omni pipeline: 48kHz → 16kHz (input), 24kHz → 48kHz (output).
#[napi]
pub fn resample_f32(samples: Float32Array, from_rate: u32, to_rate: u32) -> Float32Array {
    let slice = samples.as_ref();
    if slice.is_empty() || from_rate == 0 || to_rate == 0 {
        return Float32Array::new(vec![]);
    }
    let in_len = slice.len() as u64;
    let out_len = ((in_len * to_rate as u64) / from_rate as u64) as usize;
    if out_len == 0 {
        return Float32Array::new(vec![]);
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let mut result = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_idx = i as f64 * ratio;
        let lo = src_idx.floor() as usize;
        let hi = (src_idx.ceil() as usize).min(slice.len().saturating_sub(1));
        let t = (src_idx - lo as f64) as f32;
        let a = slice[lo];
        let b = if hi < slice.len() { slice[hi] } else { a };
        result.push(a * (1.0 - t) + b * t);
    }
    Float32Array::new(result)
}

/// Compute energy in dB for a Float32 audio buffer
///
/// SIMD-accelerated: processes 8 samples at a time for sum-of-squares.
#[napi]
pub fn compute_energy_db(samples: Float32Array) -> f64 {
    let slice = samples.as_ref();
    if slice.is_empty() {
        return -100.0;
    }

    let sum_sq = sum_of_squares_simd(slice);
    let rms = (sum_sq / slice.len() as f32).sqrt();
    (20.0 * rms.max(1e-10).log10()) as f64
}

/// SIMD-accelerated sum of squares helper
#[inline]
fn sum_of_squares_simd(slice: &[f32]) -> f32 {
    let len = slice.len();
    let chunks = len / 8;
    let mut sum_vec = f32x8::splat(0.0);

    // Process 8 samples at a time with SIMD
    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        sum_vec = sum_vec + (v * v);
    }

    // Horizontal sum of SIMD vector
    let arr = sum_vec.to_array();
    let mut sum_sq: f32 = arr.iter().sum();

    // Handle remaining samples (scalar)
    for i in (chunks * 8)..len {
        sum_sq += slice[i] * slice[i];
    }

    sum_sq
}

/// SIMD-accelerated sum helper
#[inline]
fn sum_simd(slice: &[f32]) -> f32 {
    let len = slice.len();
    let chunks = len / 8;
    let mut sum_vec = f32x8::splat(0.0);

    // Process 8 samples at a time with SIMD
    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        sum_vec = sum_vec + v;
    }

    // Horizontal sum of SIMD vector
    let arr = sum_vec.to_array();
    let mut total: f32 = arr.iter().sum();

    // Handle remaining samples (scalar)
    for i in (chunks * 8)..len {
        total += slice[i];
    }

    total
}

/// SIMD-accelerated sum of squared differences from mean
#[inline]
fn sum_squared_diff_simd(slice: &[f32], mean: f32) -> f32 {
    let len = slice.len();
    let chunks = len / 8;
    let mean_vec = f32x8::splat(mean);
    let mut sum_vec = f32x8::splat(0.0);

    // Process 8 samples at a time with SIMD
    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        let diff = v - mean_vec;
        sum_vec = sum_vec + (diff * diff);
    }

    // Horizontal sum of SIMD vector
    let arr = sum_vec.to_array();
    let mut sum_sq: f32 = arr.iter().sum();

    // Handle remaining samples (scalar)
    for i in (chunks * 8)..len {
        let diff = slice[i] - mean;
        sum_sq += diff * diff;
    }

    sum_sq
}

/// Check if audio contains speech (simple threshold check)
#[napi]
pub fn is_speech(samples: Float32Array, threshold_db: Option<f64>) -> bool {
    let threshold = threshold_db.unwrap_or(-40.0);
    let energy = compute_energy_db(samples);
    energy > threshold
}

/// Compute RMS (Root Mean Square) energy for a Float32 audio buffer
///
/// SIMD-accelerated: processes 8 samples at a time for sum-of-squares.
/// Returns linear scale RMS (not dB). Use this for breath detection
/// and energy analysis where linear comparison is needed.
#[napi]
pub fn compute_rms(samples: Float32Array) -> f64 {
    let slice = samples.as_ref();
    if slice.is_empty() {
        return 0.0;
    }

    let sum_sq = sum_of_squares_simd(slice);
    (sum_sq / slice.len() as f32).sqrt() as f64
}

/// Compute Zero Crossing Rate for a Float32 audio buffer
///
/// Returns a value between 0 and 1 indicating how often the signal
/// crosses zero. High ZCR often indicates unvoiced/breathy sounds,
/// low ZCR indicates voiced speech.
#[napi]
pub fn compute_zcr(samples: Float32Array) -> f64 {
    let slice = samples.as_ref();
    if slice.len() < 2 {
        return 0.0;
    }

    let mut crossings = 0u32;
    for i in 1..slice.len() {
        if (slice[i] >= 0.0 && slice[i - 1] < 0.0)
            || (slice[i] < 0.0 && slice[i - 1] >= 0.0)
        {
            crossings += 1;
        }
    }

    crossings as f64 / (slice.len() - 1) as f64
}

/// Compute variance of a Float32 array
///
/// SIMD-accelerated: uses two-pass algorithm with SIMD sum and squared-diff.
/// Useful for pitch variance, energy variance calculations.
#[napi]
pub fn compute_variance(values: Float32Array) -> f64 {
    let slice = values.as_ref();
    if slice.len() < 2 {
        return 0.0;
    }

    // Two-pass: first compute mean with SIMD, then squared differences with SIMD
    let mean = sum_simd(slice) / slice.len() as f32;
    let variance = sum_squared_diff_simd(slice, mean) / slice.len() as f32;
    variance as f64
}

/// Compute mean of a Float32 array
///
/// SIMD-accelerated: processes 8 samples at a time.
#[napi]
pub fn compute_mean(values: Float32Array) -> f64 {
    let slice = values.as_ref();
    if slice.is_empty() {
        return 0.0;
    }
    (sum_simd(slice) / slice.len() as f32) as f64
}

/// Compute standard deviation of a Float32 array
#[napi]
pub fn compute_std_dev(values: Float32Array) -> f64 {
    (compute_variance(values)).sqrt()
}

// ============================================================================
// STANDALONE PITCH ESTIMATION
// ============================================================================

/// Pitch estimation result
#[napi(object)]
pub struct PitchEstimateResult {
    /// Estimated pitch in Hz (0 if no voiced speech detected)
    pub pitch_hz: f64,
    /// Confidence of pitch estimate (0-1)
    pub confidence: f64,
}

/// Estimate pitch using autocorrelation
///
/// Standalone pitch estimation for single audio frames.
/// Uses autocorrelation with normalized confidence.
///
/// # Arguments
/// * `samples` - Float32Array audio samples (normalized -1 to 1)
/// * `sample_rate` - Sample rate in Hz (typically 16000)
/// * `min_pitch` - Minimum pitch to detect in Hz (default: 50)
/// * `max_pitch` - Maximum pitch to detect in Hz (default: 500)
///
/// # Returns
/// Pitch estimate with confidence, or { pitch_hz: 0, confidence: 0 } if no pitch detected
#[napi]
pub fn estimate_pitch(
    samples: Float32Array,
    sample_rate: u32,
    min_pitch: Option<f64>,
    max_pitch: Option<f64>,
) -> PitchEstimateResult {
    let slice = samples.as_ref();
    let min_hz = min_pitch.unwrap_or(50.0) as f32;
    let max_hz = max_pitch.unwrap_or(500.0) as f32;

    let config = feature_extraction::FeatureConfig {
        sample_rate,
        min_pitch: min_hz,
        max_pitch: max_hz,
        ..Default::default()
    };

    let extractor = feature_extraction::FeatureExtractor::new(config);
    let result = extractor.estimate_pitch(slice);

    PitchEstimateResult {
        pitch_hz: result.pitch_hz as f64,
        confidence: result.confidence as f64,
    }
}

/// Extract full prosody features from a single frame
///
/// Combines pitch, energy, and ZCR analysis.
/// More efficient than calling individual functions separately.
///
/// # Arguments
/// * `samples` - Float32Array audio samples
/// * `sample_rate` - Sample rate in Hz
/// * `timestamp_ms` - Current timestamp in milliseconds
#[napi(object)]
pub struct FrameFeaturesResult {
    pub pitch_hz: f64,
    pub pitch_confidence: f64,
    pub energy_db: f64,
    pub energy_rms: f64,
    pub zcr: f64,
    pub is_speech: bool,
    pub is_voiced: bool,
    pub timestamp_ms: f64,
}

#[napi]
pub fn extract_frame_features(
    samples: Float32Array,
    sample_rate: u32,
    timestamp_ms: f64,
) -> FrameFeaturesResult {
    let slice = samples.as_ref();

    let config = feature_extraction::FeatureConfig {
        sample_rate,
        ..Default::default()
    };

    let extractor = feature_extraction::FeatureExtractor::new(config);
    let features = extractor.extract(slice, timestamp_ms as u64);

    FrameFeaturesResult {
        pitch_hz: features.pitch.pitch_hz as f64,
        pitch_confidence: features.pitch.confidence as f64,
        energy_db: features.energy.db as f64,
        energy_rms: features.energy.rms as f64,
        zcr: features.zcr.zcr as f64,
        is_speech: features.energy.is_speech,
        is_voiced: features.zcr.is_voiced,
        timestamp_ms: features.timestamp_ms as f64,
    }
}

// ============================================================================
// FFT FUNCTIONS (SIMD-ACCELERATED)
// ============================================================================

/// FFT result containing real and imaginary parts
#[napi(object)]
pub struct FftResult {
    pub real: Vec<f64>,
    pub imaginary: Vec<f64>,
    pub size: u32,
}

/// Apply FFT to a Float32Array signal
///
/// Returns complex frequency domain representation.
/// Signal is zero-padded to next power of 2 if needed.
#[napi]
pub fn fft_f32(samples: Float32Array) -> FftResult {
    let slice: &[f32] = &samples;
    let (re, im) = fft::fft(slice);

    FftResult {
        size: re.len() as u32,
        real: re.iter().map(|&x| x as f64).collect(),
        imaginary: im.iter().map(|&x| x as f64).collect(),
    }
}

/// Apply Hanning window to reduce spectral leakage
#[napi]
pub fn apply_hanning_window(samples: Float32Array) -> Float32Array {
    let slice: &[f32] = &samples;
    let windowed = fft::apply_hanning_window(slice);
    Float32Array::new(windowed)
}

/// Get magnitude spectrum from FFT result
///
/// Only returns first half (up to Nyquist frequency)
#[napi]
pub fn get_magnitude_spectrum(real: Vec<f64>, imaginary: Vec<f64>) -> Float32Array {
    let re: Vec<f32> = real.iter().map(|&x| x as f32).collect();
    let im: Vec<f32> = imaginary.iter().map(|&x| x as f32).collect();
    let magnitudes = fft::get_magnitude_spectrum(&re, &im);
    Float32Array::new(magnitudes)
}

/// Get power spectrum in dB
#[napi]
pub fn get_power_spectrum_db(real: Vec<f64>, imaginary: Vec<f64>, reference: Option<f64>) -> Float32Array {
    let re: Vec<f32> = real.iter().map(|&x| x as f32).collect();
    let im: Vec<f32> = imaginary.iter().map(|&x| x as f32).collect();
    let ref_power = reference.unwrap_or(1.0) as f32;
    let power_db = fft::get_power_spectrum_db(&re, &im, ref_power);
    Float32Array::new(power_db)
}

/// Spectral analysis result
/// Field names match TypeScript NativeSpectralFeatures interface for seamless integration
#[napi(object)]
pub struct SpectralFeatures {
    /// Spectral centroid (brightness) in Hz
    pub centroid: f64,
    /// Spectral rolloff (85%) in Hz
    pub rolloff: f64,
    /// Dominant frequency in Hz
    pub dominant_frequency: f64,
    /// Magnitude at dominant frequency
    pub dominant_magnitude: f64,
    /// Band energies (sub-bass, bass, low-mid, mid, high-mid, presence, brilliance)
    pub band_energies: Vec<f64>,
}

/// Analyze spectral features of an audio signal
///
/// Performs FFT and computes spectral centroid, rolloff, dominant frequency, and band energies.
#[napi]
pub fn analyze_spectrum(
    samples: Float32Array,
    sample_rate: u32,
    min_freq: Option<f64>,
    max_freq: Option<f64>,
) -> SpectralFeatures {
    let slice: &[f32] = &samples;

    // Apply Hanning window
    let windowed = fft::apply_hanning_window(slice);

    // Compute FFT
    let (re, im) = fft::fft(&windowed);
    let fft_size = re.len();

    // Get magnitude spectrum
    let magnitudes = fft::get_magnitude_spectrum(&re, &im);

    // Compute features
    let centroid = fft::spectral_centroid(&magnitudes, sample_rate, fft_size);
    let rolloff = fft::spectral_rolloff(&magnitudes, sample_rate, fft_size, 0.85);
    let (dom_freq, dom_mag) = fft::find_dominant_frequency(
        &magnitudes,
        sample_rate,
        fft_size,
        min_freq.unwrap_or(50.0) as f32,
        max_freq.unwrap_or(4000.0) as f32,
    );

    // Compute band energies (7 bands: sub-bass, bass, low-mid, mid, high-mid, presence, brilliance)
    let band_boundaries: [(f32, f32); 7] = [
        (20.0, 60.0),      // Sub-bass
        (60.0, 250.0),     // Bass
        (250.0, 500.0),    // Low-mid
        (500.0, 2000.0),   // Mid
        (2000.0, 4000.0),  // High-mid
        (4000.0, 6000.0),  // Presence
        (6000.0, 20000.0), // Brilliance
    ];

    let freq_bin_size = sample_rate as f32 / fft_size as f32;
    let mut band_energies = Vec::with_capacity(7);

    for (low_freq, high_freq) in band_boundaries.iter() {
        let mut band_energy: f32 = 0.0;
        for (i, &mag) in magnitudes.iter().enumerate() {
            let freq = i as f32 * freq_bin_size;
            if freq >= *low_freq && freq < *high_freq {
                band_energy += mag * mag;
            }
        }
        band_energies.push(band_energy.sqrt() as f64);
    }

    SpectralFeatures {
        centroid: centroid as f64,
        rolloff: rolloff as f64,
        dominant_frequency: dom_freq as f64,
        dominant_magnitude: dom_mag as f64,
        band_energies,
    }
}

/// Clear FFT caches (for memory management)
#[napi]
pub fn clear_fft_caches() {
    fft::clear_fft_caches();
}

// ============================================================================
// POST-TTS ENHANCEMENT (Better Than Human)
// ============================================================================

/// Configuration for post-TTS audio enhancement
#[napi(object)]
pub struct PostTtsEnhancementConfig {
    /// Sample rate (typically 24000 or 44100 for Cartesia)
    pub sample_rate: u32,
    /// Enable breath injection at phrase starts
    pub enable_breath: bool,
    /// Enable spectral warmth enhancement
    pub enable_warmth: bool,
    /// Enable micro-pitch modulation
    pub enable_micro_pitch: bool,
    /// Enable soft attack/release on phrases
    pub enable_soft_edges: bool,
    /// Enable light compression
    pub enable_compression: bool,
    /// Enable presence EQ boost (2-4kHz clarity)
    pub enable_presence: bool,
    /// Breath injection probability (0.0-1.0, default 0.3)
    pub breath_probability: f64,
    /// Warmth amount (0.0-1.0, default 0.15)
    pub warmth_amount: f64,
    /// Pitch modulation depth in cents (default 8)
    pub pitch_modulation_cents: f64,
    /// Soft edge duration in ms (default 20)
    pub soft_edge_ms: f64,
    /// Compression ratio (default 2.0)
    pub compression_ratio: f64,
    /// Compression threshold in dB (default -20)
    pub compression_threshold_db: f64,
    /// Presence boost in dB (default 2.5)
    pub presence_boost_db: f64,
}

impl Default for PostTtsEnhancementConfig {
    fn default() -> Self {
        Self {
            sample_rate: 24000,
            enable_breath: true,
            enable_warmth: true,
            enable_micro_pitch: true,
            enable_soft_edges: true,
            enable_compression: true,
            enable_presence: true,
            breath_probability: 0.3,
            warmth_amount: 0.15,
            pitch_modulation_cents: 8.0,
            soft_edge_ms: 20.0,
            compression_ratio: 2.0,
            compression_threshold_db: -20.0,
            presence_boost_db: 2.5,
        }
    }
}

/// Result of post-TTS enhancement
#[napi(object)]
pub struct PostTtsEnhancementResult {
    /// Number of breaths injected
    pub breaths_injected: u32,
    /// Number of phrase edges softened
    pub edges_softened: u32,
    /// Was warmth applied
    pub warmth_applied: bool,
    /// Was pitch modulation applied
    pub pitch_mod_applied: bool,
    /// Was compression applied
    pub compression_applied: bool,
    /// Was presence boost applied
    pub presence_applied: bool,
}

/// Get default post-TTS enhancement configuration
#[napi]
pub fn get_default_post_tts_config() -> PostTtsEnhancementConfig {
    PostTtsEnhancementConfig::default()
}

/// Apply full post-TTS enhancement pipeline to TTS output
///
/// This is the main entry point for "Better Than Human" audio processing.
/// Applies breath injection, spectral warmth, micro-pitch modulation,
/// soft attack/release, compression, and presence boost.
///
/// # Arguments
/// * `samples` - Float32Array audio samples from Cartesia TTS
/// * `config` - Enhancement configuration
///
/// # Returns
/// Enhancement result with stats about what was applied
#[napi]
pub fn enhance_tts_audio(
    samples: Float32Array,
    config: PostTtsEnhancementConfig,
) -> PostTtsEnhancementResult {
    let mut audio: Vec<f32> = samples.to_vec();

    let rust_config = post_tts::PostTtsConfig {
        sample_rate: config.sample_rate,
        enable_breath: config.enable_breath,
        enable_warmth: config.enable_warmth,
        enable_micro_pitch: config.enable_micro_pitch,
        enable_soft_edges: config.enable_soft_edges,
        enable_compression: config.enable_compression,
        enable_presence: config.enable_presence,
        breath_probability: config.breath_probability as f32,
        warmth_amount: config.warmth_amount as f32,
        pitch_modulation_cents: config.pitch_modulation_cents as f32,
        soft_edge_samples: ((config.soft_edge_ms * config.sample_rate as f64) / 1000.0) as usize,
        compression_ratio: config.compression_ratio as f32,
        compression_threshold_db: config.compression_threshold_db as f32,
        presence_boost_db: config.presence_boost_db as f32,
    };

    let result = post_tts::enhance_tts_output(&mut audio, &rust_config);

    PostTtsEnhancementResult {
        breaths_injected: result.breaths_injected as u32,
        edges_softened: result.edges_softened as u32,
        warmth_applied: result.warmth_applied,
        pitch_mod_applied: result.pitch_mod_applied,
        compression_applied: result.compression_applied,
        presence_applied: result.presence_applied,
    }
}

/// Apply full post-TTS enhancement and return enhanced audio
///
/// Same as enhance_tts_audio but returns the modified samples.
/// Use this when you need the enhanced audio data back.
#[napi]
pub fn enhance_tts_audio_inplace(
    mut samples: Float32Array,
    config: PostTtsEnhancementConfig,
) -> Float32Array {
    let audio: &mut [f32] = samples.as_mut();

    let rust_config = post_tts::PostTtsConfig {
        sample_rate: config.sample_rate,
        enable_breath: config.enable_breath,
        enable_warmth: config.enable_warmth,
        enable_micro_pitch: config.enable_micro_pitch,
        enable_soft_edges: config.enable_soft_edges,
        enable_compression: config.enable_compression,
        enable_presence: config.enable_presence,
        breath_probability: config.breath_probability as f32,
        warmth_amount: config.warmth_amount as f32,
        pitch_modulation_cents: config.pitch_modulation_cents as f32,
        soft_edge_samples: ((config.soft_edge_ms * config.sample_rate as f64) / 1000.0) as usize,
        compression_ratio: config.compression_ratio as f32,
        compression_threshold_db: config.compression_threshold_db as f32,
        presence_boost_db: config.presence_boost_db as f32,
    };

    post_tts::enhance_tts_output(audio, &rust_config);
    samples
}

/// Apply soft attack (fade-in) to audio start
///
/// Creates a smooth, natural-sounding start instead of abrupt onset.
#[napi]
pub fn apply_soft_attack(mut samples: Float32Array, attack_ms: f64, sample_rate: u32) -> Float32Array {
    let attack_samples = ((attack_ms * sample_rate as f64) / 1000.0) as usize;
    post_tts::apply_soft_attack(samples.as_mut(), attack_samples);
    samples
}

/// Apply soft release (fade-out) to audio end
///
/// Creates a smooth, natural-sounding end instead of abrupt cutoff.
#[napi]
pub fn apply_soft_release(mut samples: Float32Array, release_ms: f64, sample_rate: u32) -> Float32Array {
    let release_samples = ((release_ms * sample_rate as f64) / 1000.0) as usize;
    post_tts::apply_soft_release(samples.as_mut(), release_samples);
    samples
}

/// Apply spectral warmth enhancement
///
/// Boosts low frequencies for a warmer, more intimate voice quality.
#[napi]
pub fn apply_warmth(mut samples: Float32Array, sample_rate: u32, amount: f64) -> Float32Array {
    post_tts::apply_spectral_warmth(samples.as_mut(), sample_rate, amount as f32);
    samples
}

/// Apply presence boost (2-4kHz)
///
/// Enhances clarity and intelligibility without harshness.
#[napi]
pub fn apply_presence(mut samples: Float32Array, sample_rate: u32, boost_db: f64) -> Float32Array {
    post_tts::apply_presence_boost(samples.as_mut(), sample_rate, boost_db as f32);
    samples
}

/// Apply light dynamic compression
///
/// Evens out volume dynamics for consistent listening experience.
#[napi]
pub fn apply_compression(
    mut samples: Float32Array,
    sample_rate: u32,
    threshold_db: f64,
    ratio: f64,
) -> Float32Array {
    post_tts::apply_compression(
        samples.as_mut(),
        threshold_db as f32,
        ratio as f32,
        5.0,  // 5ms attack
        50.0, // 50ms release
        sample_rate,
    );
    samples
}

/// Inject breath sounds at phrase boundaries
///
/// Returns the number of breaths injected.
#[napi]
pub fn inject_breath_sounds(
    mut samples: Float32Array,
    sample_rate: u32,
    probability: f64,
) -> u32 {
    post_tts::inject_breaths(samples.as_mut(), sample_rate, probability as f32) as u32
}

// ============================================================================
// STATEFUL POST-TTS PROCESSOR (NAPI Class)
// ============================================================================

use post_tts_processor::{PostTTSProcessor, ProcessorConfig, ProcessingStats, PhraseBoundary, BoundaryType};

/// JavaScript-compatible phrase boundary for adaptive breath timing
///
/// Represents a location in the audio where a breath could naturally be injected.
#[napi(object)]
pub struct NativePhraseBoundary {
    /// Sample index (absolute position in the utterance)
    pub sample_index: u32,
    /// Boundary type: 0=SentenceEnd, 1=ClauseBreak, 2=EmphasisBefore, 3=EmotionalRelease
    pub boundary_type: u8,
}

impl NativePhraseBoundary {
    fn to_internal(&self) -> PhraseBoundary {
        PhraseBoundary {
            sample_index: self.sample_index as usize,
            boundary_type: match self.boundary_type {
                0 => BoundaryType::SentenceEnd,
                1 => BoundaryType::ClauseBreak,
                2 => BoundaryType::EmphasisBefore,
                3 => BoundaryType::EmotionalRelease,
                _ => BoundaryType::ClauseBreak, // Default fallback
            },
        }
    }
}

/// Configuration for the stateful post-TTS processor
#[napi(object)]
pub struct NativePostTTSConfig {
    /// Sample rate in Hz (default: 24000)
    pub sample_rate: Option<u32>,

    /// Enable warmth (low-shelf EQ boost)
    pub enable_warmth: Option<bool>,
    /// Warmth frequency in Hz (default: 300)
    pub warmth_freq: Option<f64>,
    /// Warmth gain in dB (default: 2.5)
    pub warmth_gain_db: Option<f64>,

    /// Enable presence (peak EQ boost)
    pub enable_presence: Option<bool>,
    /// Presence frequency in Hz (default: 3000)
    pub presence_freq: Option<f64>,
    /// Presence gain in dB (default: 2.0)
    pub presence_gain_db: Option<f64>,

    /// Enable compression
    pub enable_compression: Option<bool>,
    /// Compression threshold in dB (default: -18)
    pub comp_threshold_db: Option<f64>,
    /// Compression ratio (default: 2.0)
    pub comp_ratio: Option<f64>,
    /// Compression attack in ms (default: 10)
    pub comp_attack_ms: Option<f64>,
    /// Compression release in ms (default: 100)
    pub comp_release_ms: Option<f64>,

    /// Enable de-esser (legacy wideband - DEPRECATED)
    pub enable_deesser: Option<bool>,
    /// De-esser frequency in Hz (default: 6000)
    pub deesser_freq: Option<f64>,
    /// De-esser threshold in dB (default: -20)
    pub deesser_threshold_db: Option<f64>,

    /// Enable split-band de-esser (NEW - professional quality)
    pub enable_splitband_deesser: Option<bool>,
    /// Split-band crossover frequency in Hz (default: 5000)
    pub splitband_crossover_freq: Option<f64>,
    /// Split-band threshold in dB (default: -20)
    pub splitband_threshold_db: Option<f64>,
    /// Split-band ratio (default: 4.0)
    pub splitband_ratio: Option<f64>,

    /// Enable limiter
    pub enable_limiter: Option<bool>,
    /// Limiter threshold in dB (default: -1)
    pub limiter_threshold_db: Option<f64>,

    /// Enable crossfade between frames
    pub enable_crossfade: Option<bool>,
    /// Crossfade length in ms (default: 2)
    pub crossfade_ms: Option<f64>,

    /// Soft attack duration in ms (default: 15)
    pub soft_attack_ms: Option<f64>,
    /// Soft release duration in ms (default: 15)
    pub soft_release_ms: Option<f64>,

    // =========================================================================
    // HUMANIZATION FEATURES
    // =========================================================================

    /// Enable breath injection at utterance start
    pub enable_breath: Option<bool>,
    /// Breath injection probability (0-1)
    pub breath_probability: Option<f64>,

    /// Enable micro-pitch modulation (~5Hz wobble)
    pub enable_micro_pitch: Option<bool>,
    /// Micro-pitch modulation depth in cents
    pub micro_pitch_cents: Option<f64>,

    /// Enable noise floor (subtle room tone)
    pub enable_noise_floor: Option<bool>,
    /// Noise floor level in dB (typically -60 to -50)
    pub noise_floor_db: Option<f64>,

    /// Enable amplitude jitter (volume micro-variations)
    pub enable_amplitude_jitter: Option<bool>,
    /// Amplitude jitter depth (0-1, typically 0.015)
    pub amplitude_jitter_depth: Option<f64>,

    /// Enable pitch drift (slow pitch wandering)
    pub enable_pitch_drift: Option<bool>,
    /// Pitch drift max in cents
    pub pitch_drift_cents: Option<f64>,

    /// Use SOLA-based pitch shifting (artifact-free)
    /// When true (default), uses proper overlap-add algorithm instead of
    /// frame-by-frame resampling. This eliminates clicks/crackles from pitch features.
    pub use_sola_pitch: Option<bool>,

    // =========================================================================
    // "BETTER THAN HUMAN" - Superhuman emotional intelligence
    // =========================================================================

    /// Enable emotion-aware prosody (affects vibrato, pitch drift, breath, pacing)
    /// When true (default), the processor adapts all humanization features based on
    /// the emotional context of the utterance.
    pub enable_emotion_prosody: Option<bool>,

    /// Current emotional state (0-8)
    /// 0=Neutral, 1=Happy, 2=Sad, 3=Excited, 4=Calm, 5=Tense, 6=Empathetic, 7=Curious, 8=Supportive
    /// This affects vibrato rate/depth, pitch drift direction, breath likelihood, and tempo.
    pub emotion: Option<u8>,

    /// Enable adaptive pacing (time-stretch based on content complexity)
    /// When true, speech rate adjusts to help comprehension of complex content.
    pub enable_adaptive_pacing: Option<bool>,

    /// Content complexity (0.0-1.0)
    /// 0.0 = simple content (slightly faster pace)
    /// 0.5 = moderate complexity (normal pace)
    /// 1.0 = complex content (slower pace for comprehension)
    pub content_complexity: Option<f64>,

    // =========================================================================
    // ADVANCED HUMANIZATION - Ultra-realistic speech features
    // =========================================================================

    /// Enable vocal fry (creaky voice at phrase endings)
    /// Creates natural trailing-off quality like human speakers
    pub enable_vocal_fry: Option<bool>,

    /// Vocal fry depth (0-1, default: 0.4)
    /// How pronounced the creaky modulation is
    pub vocal_fry_depth: Option<f64>,

    /// Vocal fry duration in ms (default: 200)
    /// How long the creaky effect lasts at phrase end
    pub vocal_fry_duration_ms: Option<f64>,

    /// Enable lip smacks (mouth sounds between phrases)
    /// Adds realistic mouth noises at natural pause points
    pub enable_lip_smacks: Option<bool>,

    /// Lip smack probability (0-1, default: 0.3)
    /// Probability of triggering at each phrase boundary
    pub lip_smack_probability: Option<f64>,

    /// Enable tempo micro-variation (subtle speed changes)
    /// Creates natural rhythm variations within utterances
    pub enable_tempo_variation: Option<bool>,

    /// Tempo variation depth (0-1, default: 0.03)
    /// How much the tempo can vary (3% typical for natural speech)
    pub tempo_variation_depth: Option<f64>,

    /// Enable onset softening (micro-fades on hard glottal attacks)
    /// Reduces harsh vowel-initial sounds for more natural speech
    pub enable_onset_softening: Option<bool>,
}

impl NativePostTTSConfig {
    fn to_processor_config(&self) -> ProcessorConfig {
        let mut config = ProcessorConfig::default();

        if let Some(v) = self.sample_rate { config.sample_rate = v; }

        if let Some(v) = self.enable_warmth { config.enable_warmth = v; }
        if let Some(v) = self.warmth_freq { config.warmth_freq = v as f32; }
        if let Some(v) = self.warmth_gain_db { config.warmth_gain_db = v as f32; }

        if let Some(v) = self.enable_presence { config.enable_presence = v; }
        if let Some(v) = self.presence_freq { config.presence_freq = v as f32; }
        if let Some(v) = self.presence_gain_db { config.presence_gain_db = v as f32; }

        if let Some(v) = self.enable_compression { config.enable_compression = v; }
        if let Some(v) = self.comp_threshold_db { config.comp_threshold_db = v as f32; }
        if let Some(v) = self.comp_ratio { config.comp_ratio = v as f32; }
        if let Some(v) = self.comp_attack_ms { config.comp_attack_ms = v as f32; }
        if let Some(v) = self.comp_release_ms { config.comp_release_ms = v as f32; }

        if let Some(v) = self.enable_deesser { config.enable_deesser = v; }
        if let Some(v) = self.deesser_freq { config.deesser_freq = v as f32; }
        if let Some(v) = self.deesser_threshold_db { config.deesser_threshold_db = v as f32; }

        // Split-band de-esser
        if let Some(v) = self.enable_splitband_deesser { config.enable_splitband_deesser = v; }
        if let Some(v) = self.splitband_crossover_freq { config.splitband_crossover_freq = v as f32; }
        if let Some(v) = self.splitband_threshold_db { config.splitband_threshold_db = v as f32; }
        if let Some(v) = self.splitband_ratio { config.splitband_ratio = v as f32; }

        if let Some(v) = self.enable_limiter { config.enable_limiter = v; }
        if let Some(v) = self.limiter_threshold_db { config.limiter_threshold_db = v as f32; }

        if let Some(v) = self.enable_crossfade { config.enable_crossfade = v; }
        if let Some(v) = self.crossfade_ms { config.crossfade_ms = v as f32; }

        if let Some(v) = self.soft_attack_ms { config.soft_attack_ms = v as f32; }
        if let Some(v) = self.soft_release_ms { config.soft_release_ms = v as f32; }

        // Humanization features
        if let Some(v) = self.enable_breath { config.enable_breath = v; }
        if let Some(v) = self.breath_probability { config.breath_probability = v as f32; }

        if let Some(v) = self.enable_micro_pitch { config.enable_micro_pitch = v; }
        if let Some(v) = self.micro_pitch_cents { config.micro_pitch_cents = v as f32; }

        if let Some(v) = self.enable_noise_floor { config.enable_noise_floor = v; }
        if let Some(v) = self.noise_floor_db { config.noise_floor_db = v as f32; }

        if let Some(v) = self.enable_amplitude_jitter { config.enable_amplitude_jitter = v; }
        if let Some(v) = self.amplitude_jitter_depth { config.amplitude_jitter_depth = v as f32; }

        if let Some(v) = self.enable_pitch_drift { config.enable_pitch_drift = v; }
        if let Some(v) = self.pitch_drift_cents { config.pitch_drift_cents = v as f32; }

        // SOLA pitch shifting
        if let Some(v) = self.use_sola_pitch { config.use_sola_pitch = v; }

        // "Better Than Human" features
        if let Some(v) = self.enable_emotion_prosody { config.enable_emotion_prosody = v; }
        if let Some(v) = self.emotion {
            config.emotion = post_tts_processor::EmotionState::from_u8(v);
        }
        if let Some(v) = self.enable_adaptive_pacing { config.enable_adaptive_pacing = v; }
        if let Some(v) = self.content_complexity { config.content_complexity = v as f32; }

        // Advanced humanization features
        if let Some(v) = self.enable_vocal_fry { config.enable_vocal_fry = v; }
        if let Some(v) = self.vocal_fry_depth { config.vocal_fry_depth = v as f32; }
        if let Some(v) = self.vocal_fry_duration_ms { config.vocal_fry_duration_ms = v as f32; }
        if let Some(v) = self.enable_lip_smacks { config.enable_lip_smacks = v; }
        if let Some(v) = self.lip_smack_probability { config.lip_smack_probability = v as f32; }
        if let Some(v) = self.enable_tempo_variation { config.enable_tempo_variation = v; }
        if let Some(v) = self.tempo_variation_depth { config.tempo_variation_depth = v as f32; }
        if let Some(v) = self.enable_onset_softening { config.enable_onset_softening = v; }

        config
    }
}

/// Statistics from processing a frame
#[napi(object)]
pub struct NativeProcessingStats {
    pub frame_number: i64,
    pub crossfade_applied: bool,
    pub soft_attack_applied: bool,
    pub soft_release_applied: bool,
    pub warmth_applied: bool,
    pub presence_applied: bool,
    pub compression_reduction_db: f64,
    pub deesser_reduction_db: f64,
    pub limiter_reduction_db: f64,
}

impl From<ProcessingStats> for NativeProcessingStats {
    fn from(stats: ProcessingStats) -> Self {
        Self {
            frame_number: stats.frame_number as i64,
            crossfade_applied: stats.crossfade_applied,
            soft_attack_applied: stats.soft_attack_applied,
            soft_release_applied: stats.soft_release_applied,
            warmth_applied: stats.warmth_applied,
            presence_applied: stats.presence_applied,
            compression_reduction_db: stats.compression_reduction_db as f64,
            deesser_reduction_db: stats.deesser_reduction_db as f64,
            limiter_reduction_db: stats.limiter_reduction_db as f64,
        }
    }
}

/// Stateful Post-TTS Audio Processor
///
/// This processor maintains state between frames for seamless audio enhancement.
/// Create one instance per session and call `processFrame()` for each audio frame.
///
/// Features:
/// - Stateful biquad filters (no clicks at frame boundaries)
/// - Stateful compressor (no pumping/breathing)
/// - De-esser (reduces harsh sibilance)
/// - Look-ahead soft limiter (prevents clipping)
/// - Crossfade overlap-add (eliminates frame discontinuities)
///
/// Usage:
/// ```javascript
/// const processor = new NativePostTTSProcessor({
///   sampleRate: 24000,
///   enableWarmth: true,
///   enablePresence: true,
///   enableCompression: true,
///   enableDeesser: true,
///   enableLimiter: true,
///   enableCrossfade: true,
/// });
///
/// // Process frames
/// for (const frame of audioFrames) {
///   const isLast = isLastFrame(frame);
///   const stats = processor.processFrame(frame.samples, isLast);
///   // frame.samples is modified in place
/// }
///
/// // Reset for new utterance
/// processor.startUtterance();
/// ```
#[napi]
pub struct NativePostTTSProcessor {
    processor: PostTTSProcessor,
}

#[napi]
impl NativePostTTSProcessor {
    /// Create a new processor with the given configuration
    #[napi(constructor)]
    pub fn new(config: Option<NativePostTTSConfig>) -> Self {
        let processor_config = config
            .map(|c| c.to_processor_config())
            .unwrap_or_default();

        Self {
            processor: PostTTSProcessor::new(processor_config),
        }
    }

    /// Create with default configuration (all features enabled)
    #[napi(factory)]
    pub fn with_defaults() -> Self {
        Self {
            processor: PostTTSProcessor::with_defaults(),
        }
    }

    /// Process a frame of audio samples in-place
    ///
    /// Call this for each audio frame. The processor maintains state between calls
    /// for seamless audio without artifacts.
    ///
    /// @param samples - Float32Array of audio samples (modified in place)
    /// @param isLastFrame - Set to true for the last frame of an utterance
    /// @returns Processing statistics
    #[napi]
    pub fn process_frame(
        &mut self,
        mut samples: Float32Array,
        is_last_frame: bool,
    ) -> NativeProcessingStats {
        let stats = self.processor.process_frame(samples.as_mut(), is_last_frame);
        stats.into()
    }

    /// Mark the start of a new utterance
    ///
    /// Resets crossfade buffer but keeps filter state for continuity.
    /// Call this at the start of each new TTS utterance.
    #[napi]
    pub fn start_utterance(&mut self) {
        self.processor.start_utterance();
    }

    /// Fully reset all state
    ///
    /// Use this when switching personas or at session end.
    #[napi]
    pub fn reset(&mut self) {
        self.processor.reset();
    }

    /// Get the number of frames processed
    #[napi]
    pub fn frame_count(&self) -> i64 {
        self.processor.frame_count() as i64
    }

    // =========================================================================
    // "BETTER THAN HUMAN" - Runtime emotion control
    // =========================================================================

    /// Set the emotional state (can be called mid-utterance for dynamic expression)
    ///
    /// The emotion smoothly transitions to affect vibrato, pitch drift, and pacing.
    /// Valid values: 0=Neutral, 1=Happy, 2=Sad, 3=Excited, 4=Calm, 5=Tense,
    ///               6=Empathetic, 7=Curious, 8=Supportive
    ///
    /// @param emotion - Emotion state (0-8)
    #[napi]
    pub fn set_emotion(&mut self, emotion: u8) {
        let emotion_state = post_tts_processor::EmotionState::from_u8(emotion);
        self.processor.set_emotion(emotion_state);
    }

    /// Set content complexity for adaptive pacing
    ///
    /// 0.0 = simple content (normal/slightly faster pace)
    /// 0.5 = moderate complexity (normal pace)
    /// 1.0 = complex content (slower pace for comprehension)
    ///
    /// @param complexity - Complexity value (0.0 - 1.0)
    #[napi]
    pub fn set_content_complexity(&mut self, complexity: f64) {
        self.processor.set_content_complexity(complexity as f32);
    }

    /// Get the current emotional state
    ///
    /// @returns Current emotion state (0-8)
    #[napi]
    pub fn get_emotion(&self) -> u8 {
        self.processor.current_emotion() as u8
    }

    // =========================================================================
    // ADAPTIVE BREATH TIMING - Phrase boundary control
    // =========================================================================

    /// Set phrase boundaries for adaptive breath placement
    ///
    /// This enables intelligent breath injection at natural pause points (sentence ends,
    /// clause breaks, emphasis points). The processor will probabilistically inject
    /// breaths based on boundary type and emotional context.
    ///
    /// @param boundaries - Array of phrase boundaries with sample positions and types
    ///
    /// Example:
    /// ```javascript
    /// processor.setPhraseBoundaries([
    ///   { sampleIndex: 24000, boundaryType: 0 },  // Sentence end at 1 second
    ///   { sampleIndex: 12000, boundaryType: 1 },  // Clause break at 0.5 seconds
    /// ]);
    /// ```
    #[napi]
    pub fn set_phrase_boundaries(&mut self, boundaries: Vec<NativePhraseBoundary>) {
        let internal: Vec<PhraseBoundary> = boundaries.iter().map(|b| b.to_internal()).collect();
        self.processor.set_phrase_boundaries(internal);
    }

    /// Add a single phrase boundary
    ///
    /// Boundary types:
    /// - 0 = SentenceEnd (80% breath likelihood)
    /// - 1 = ClauseBreak (40% breath likelihood)
    /// - 2 = EmphasisBefore (20% breath likelihood)
    /// - 3 = EmotionalRelease (60% breath likelihood)
    ///
    /// @param sampleIndex - Absolute sample position in the utterance
    /// @param boundaryType - Type of boundary (0-3)
    #[napi]
    pub fn add_phrase_boundary(&mut self, sample_index: u32, boundary_type: u8) {
        let bt = match boundary_type {
            0 => BoundaryType::SentenceEnd,
            1 => BoundaryType::ClauseBreak,
            2 => BoundaryType::EmphasisBefore,
            3 => BoundaryType::EmotionalRelease,
            _ => BoundaryType::ClauseBreak,
        };
        self.processor.add_phrase_boundary(sample_index as usize, bt);
    }

    /// Clear all phrase boundaries
    ///
    /// Call this when starting a new utterance if you want to disable adaptive
    /// breath timing and only use the standard breath injection.
    #[napi]
    pub fn clear_phrase_boundaries(&mut self) {
        self.processor.clear_phrase_boundaries();
    }

    /// Get the number of phrase boundaries currently set
    #[napi]
    pub fn phrase_boundary_count(&self) -> u32 {
        self.processor.phrase_boundary_count() as u32
    }
}

// ============================================================================
// PRE-STT AUDIO ENHANCEMENT (Inbound Audio Processing)
// ============================================================================

use pre_stt::{PreSTTProcessor, PreSTTConfig, PreSTTStats as RustPreSTTStats};

/// Configuration for Pre-STT audio processing
#[napi(object)]
pub struct NativePreSTTConfig {
    /// Sample rate of input audio (default: 16000)
    pub sample_rate: Option<u32>,
    /// Enable AGC (Automatic Gain Control)
    pub enable_agc: Option<bool>,
    /// Enable noise suppression
    pub enable_noise_suppression: Option<bool>,
    /// Enable high-pass filter (DC removal)
    pub enable_highpass: Option<bool>,
    /// High-pass cutoff frequency in Hz (default: 80)
    pub highpass_cutoff_hz: Option<f64>,
    /// Enable bandwidth extension (for 8kHz input)
    pub enable_bandwidth_extension: Option<bool>,
    /// Input is 8kHz (Twilio) - enables bandwidth extension
    pub input_is_8khz: Option<bool>,
}

impl NativePreSTTConfig {
    fn to_config(&self) -> PreSTTConfig {
        let mut config = PreSTTConfig::default();

        if let Some(v) = self.sample_rate { config.sample_rate = v; }
        if let Some(v) = self.enable_agc { config.enable_agc = v; }
        if let Some(v) = self.enable_noise_suppression { config.enable_noise_suppression = v; }
        if let Some(v) = self.enable_highpass { config.enable_highpass = v; }
        if let Some(v) = self.highpass_cutoff_hz { config.highpass_cutoff_hz = v as f32; }
        if let Some(v) = self.enable_bandwidth_extension { config.enable_bandwidth_extension = v; }
        if let Some(v) = self.input_is_8khz { config.input_is_8khz = v; }

        config
    }
}

/// Statistics from Pre-STT processing
#[napi(object)]
pub struct NativePreSTTStats {
    /// Number of frames processed
    pub frames_processed: f64,
    /// Current AGC gain (1.0 = no change)
    pub agc_gain: f64,
    /// Whether noise suppression is ready (has noise floor estimate)
    pub noise_suppression_ready: bool,
    /// Whether bandwidth extension was applied this frame
    pub bandwidth_extended: bool,
}

impl From<RustPreSTTStats> for NativePreSTTStats {
    fn from(s: RustPreSTTStats) -> Self {
        Self {
            frames_processed: s.frames_processed as f64,
            agc_gain: s.agc_gain as f64,
            noise_suppression_ready: s.noise_suppression_ready,
            bandwidth_extended: s.bandwidth_extended,
        }
    }
}

/// Pre-STT Audio Processor
///
/// Enhances inbound user audio before sending to STT (Gemini/Google).
///
/// Features:
/// - **AGC** - Normalizes levels from quiet/loud speakers
/// - **Noise Suppression** - Removes background noise (fans, AC, etc.)
/// - **Bandwidth Extension** - Enhances 8kHz Twilio audio to 16kHz
/// - **DC Removal** - Removes DC offset and low-frequency rumble
///
/// Usage:
/// ```javascript
/// const processor = new NativePreSTTProcessor({
///   enableAgc: true,
///   enableNoiseSuppression: true,
///   enableHighpass: true,
/// });
///
/// // For each audio frame from LiveKit
/// const enhanced = processor.processFrame(samples, isSpeech);
/// // Send enhanced audio to Gemini STT
/// ```
#[napi]
pub struct NativePreSTTProcessor {
    processor: PreSTTProcessor,
}

#[napi]
impl NativePreSTTProcessor {
    /// Create a new Pre-STT processor with configuration
    #[napi(constructor)]
    pub fn new(config: Option<NativePreSTTConfig>) -> Self {
        let processor_config = config
            .map(|c| c.to_config())
            .unwrap_or_default();

        Self {
            processor: PreSTTProcessor::new(processor_config),
        }
    }

    /// Create with default configuration (all features enabled for 16kHz)
    #[napi(factory)]
    pub fn with_defaults() -> Self {
        Self {
            processor: PreSTTProcessor::with_defaults(),
        }
    }

    /// Create configured for Twilio (8kHz → 16kHz with bandwidth extension)
    #[napi(factory)]
    pub fn for_twilio() -> Self {
        Self {
            processor: PreSTTProcessor::for_twilio(),
        }
    }

    /// Process a frame of Float32 audio
    ///
    /// @param samples - Float32Array audio samples (normalized -1 to 1)
    /// @param isSpeech - VAD result (true if speech detected in this frame)
    /// @returns Enhanced audio samples (may be longer if bandwidth extended)
    #[napi]
    pub fn process_frame(&mut self, samples: Float32Array, is_speech: bool) -> Float32Array {
        let result = self.processor.process(samples.as_ref(), is_speech);
        Float32Array::new(result)
    }

    /// Process a frame of Int16 audio (common LiveKit format)
    ///
    /// @param samples - Int16Array audio samples
    /// @param isSpeech - VAD result
    /// @returns Enhanced audio as Float32Array (normalized -1 to 1)
    #[napi]
    pub fn process_frame_i16(&mut self, samples: Int16Array, is_speech: bool) -> Float32Array {
        let result = self.processor.process_i16(samples.as_ref(), is_speech);
        Float32Array::new(result)
    }

    /// Get processing statistics
    #[napi]
    pub fn get_stats(&self) -> NativePreSTTStats {
        self.processor.stats().into()
    }

    /// Reset noise estimation (call when entering a new environment)
    #[napi]
    pub fn reset_noise_estimate(&mut self) {
        self.processor.reset_noise_estimate();
    }

    /// Full reset (call when starting a new session)
    #[napi]
    pub fn reset(&mut self) {
        self.processor.reset();
    }
}

// ============================================================================
// STANDALONE AGC (for simple use cases)
// ============================================================================

use pre_stt::AutoGainControl;

lazy_static::lazy_static! {
    static ref SESSION_AGC: Mutex<HashMap<String, AutoGainControl>> = Mutex::new(HashMap::new());
}

/// Apply AGC to audio samples (standalone function)
///
/// Creates/reuses a session-scoped AGC instance.
///
/// @param sessionId - Session identifier for state management
/// @param samples - Float32Array to process (modified in place)
/// @returns Current AGC gain
#[napi]
pub fn apply_agc(session_id: String, mut samples: Float32Array) -> f64 {
    let mut map = SESSION_AGC.lock().unwrap();
    let agc = map.entry(session_id).or_insert_with(|| AutoGainControl::new(16000));
    agc.process(samples.as_mut());
    agc.current_gain() as f64
}

/// Reset AGC state for a session
#[napi]
pub fn reset_agc(session_id: String) -> bool {
    let mut map = SESSION_AGC.lock().unwrap();
    if let Some(agc) = map.get_mut(&session_id) {
        agc.reset();
        true
    } else {
        false
    }
}

/// Remove AGC instance for a session
#[napi]
pub fn remove_agc(session_id: String) -> bool {
    SESSION_AGC.lock().unwrap().remove(&session_id).is_some()
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_library_info() {
        let info = get_library_info();
        assert!(!info.version.is_empty());
        assert_eq!(info.default_sample_rate, 16000);
    }

    #[test]
    fn test_native_post_tts_processor() {
        let mut processor = NativePostTTSProcessor::with_defaults();
        assert_eq!(processor.frame_count(), 0);

        // Create test samples
        let mut samples: Vec<f32> = (0..480)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
            .collect();

        // Process first frame
        let stats = processor.processor.process_frame(&mut samples, false);
        assert!(stats.soft_attack_applied);
        assert!(!stats.crossfade_applied); // No crossfade on first frame
        assert_eq!(processor.frame_count(), 1);
    }

    #[test]
    fn test_native_pre_stt_processor() {
        let mut processor = NativePreSTTProcessor::with_defaults();

        // Create test samples
        let samples: Vec<f32> = (0..320)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16000.0).sin() * 0.1)
            .collect();

        let input = Float32Array::new(samples);
        let output = processor.process_frame(input, true);

        assert_eq!(output.len(), 320);
        assert!(processor.get_stats().frames_processed > 0.0);
    }

    #[test]
    fn test_native_pre_stt_twilio() {
        let mut processor = NativePreSTTProcessor::for_twilio();

        // Create 8kHz test samples
        let samples: Vec<f32> = (0..160)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 8000.0).sin() * 0.1)
            .collect();

        let input = Float32Array::new(samples);
        let output = processor.process_frame(input, true);

        // Should be upsampled to 16kHz (2x length)
        assert_eq!(output.len(), 320);
        assert!(processor.get_stats().bandwidth_extended);
    }
}
