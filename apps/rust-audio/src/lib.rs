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

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Mutex;

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
/// For when you just need conversion without full processing.
#[napi]
pub fn convert_i16_to_f32(samples: Int16Array) -> Float32Array {
    let slice = samples.as_ref();
    let converted: Vec<f32> = slice.iter().map(|&s| s as f32 / 32768.0).collect();
    Float32Array::new(converted)
}

/// Compute energy in dB for a Float32 audio buffer
#[napi]
pub fn compute_energy_db(samples: Float32Array) -> f64 {
    let slice = samples.as_ref();
    if slice.is_empty() {
        return -100.0;
    }

    let sum_sq: f32 = slice.iter().map(|&s| s * s).sum();
    let rms = (sum_sq / slice.len() as f32).sqrt();
    (20.0 * rms.max(1e-10).log10()) as f64
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
/// Returns linear scale RMS (not dB). Use this for breath detection
/// and energy analysis where linear comparison is needed.
#[napi]
pub fn compute_rms(samples: Float32Array) -> f64 {
    let slice = samples.as_ref();
    if slice.is_empty() {
        return 0.0;
    }

    let sum_sq: f32 = slice.iter().map(|&s| s * s).sum();
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
/// Useful for pitch variance, energy variance calculations.
#[napi]
pub fn compute_variance(values: Float32Array) -> f64 {
    let slice = values.as_ref();
    if slice.len() < 2 {
        return 0.0;
    }

    let mean: f32 = slice.iter().sum::<f32>() / slice.len() as f32;
    let variance: f32 = slice.iter().map(|&v| (v - mean).powi(2)).sum::<f32>() / slice.len() as f32;
    variance as f64
}

/// Compute mean of a Float32 array
#[napi]
pub fn compute_mean(values: Float32Array) -> f64 {
    let slice = values.as_ref();
    if slice.is_empty() {
        return 0.0;
    }
    (slice.iter().sum::<f32>() / slice.len() as f32) as f64
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
}
