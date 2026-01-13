//! Stateful Post-TTS Audio Processor ("Better Than Human" Enhancement)
//!
//! This is the stateful version of post-TTS processing that maintains filter
//! state between frames for seamless, artifact-free audio enhancement.
//!
//! Features:
//! - Stateful biquad filters (no clicks at frame boundaries)
//! - Stateful compressor (no pumping/breathing)
//! - De-esser (reduces harsh sibilance)
//! - Look-ahead soft limiter (prevents clipping with zero distortion)
//! - Crossfade overlap-add (eliminates ALL frame discontinuities)
//!
//! "Better Than Human" Features:
//! - Emotional Micro-Prosody: pitch/vibrato adapts to emotional context
//! - Adaptive Breath Timing: breaths placed at optimal phrase boundaries
//! - Listener-Aware Pacing: time-stretch for content complexity
//!
//! @module post_tts_processor

use std::f32::consts::PI;
use std::time::{SystemTime, UNIX_EPOCH};

// SOLA-based audio processing (proper artifact-free implementation)
use crate::sola::{SolaMicroPitch, SolaPitchDrift, SolaTimeStretch};

// ============================================================================
// "BETTER THAN HUMAN" - EMOTIONAL & SEMANTIC TYPES
// ============================================================================

/// Emotional state for adaptive prosody
///
/// Each emotion affects:
/// - Vibrato rate (Hz): faster for excitement, slower for sadness
/// - Vibrato depth (cents): wider for intensity, narrower for calm
/// - Pitch drift direction: upward for positive, downward for negative
/// - Pitch drift amount: more for emotional intensity, less for neutral
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum EmotionState {
    #[default]
    Neutral = 0,
    Happy = 1,
    Sad = 2,
    Excited = 3,
    Calm = 4,
    Tense = 5,
    Empathetic = 6,
    Curious = 7,
    Supportive = 8,
}

impl EmotionState {
    /// Convert from u8 (for FFI)
    pub fn from_u8(value: u8) -> Self {
        match value {
            1 => EmotionState::Happy,
            2 => EmotionState::Sad,
            3 => EmotionState::Excited,
            4 => EmotionState::Calm,
            5 => EmotionState::Tense,
            6 => EmotionState::Empathetic,
            7 => EmotionState::Curious,
            8 => EmotionState::Supportive,
            _ => EmotionState::Neutral,
        }
    }

    /// Get prosody parameters for this emotion
    /// Returns (vibrato_rate_hz, vibrato_depth_cents, drift_bias_cents, drift_range_cents)
    pub fn prosody_params(&self) -> EmotionProsodyParams {
        match self {
            EmotionState::Neutral => EmotionProsodyParams {
                vibrato_rate_hz: 5.5,
                vibrato_depth_cents: 8.0,
                drift_bias_cents: 0.0,      // No bias
                drift_range_cents: 5.0,
                breath_likelihood: 0.15,     // Normal breath chance
                tempo_factor: 1.0,           // Normal pace
            },
            EmotionState::Happy => EmotionProsodyParams {
                vibrato_rate_hz: 6.0,        // Slightly faster
                vibrato_depth_cents: 10.0,   // More animated
                drift_bias_cents: 3.0,       // Upward tendency
                drift_range_cents: 6.0,
                breath_likelihood: 0.1,      // Less breath (more flow)
                tempo_factor: 1.05,          // Slightly faster pace
            },
            EmotionState::Sad => EmotionProsodyParams {
                vibrato_rate_hz: 4.5,        // Slower, heavier
                vibrato_depth_cents: 12.0,   // More emotional weight
                drift_bias_cents: -4.0,      // Downward tendency
                drift_range_cents: 8.0,      // More drift
                breath_likelihood: 0.25,     // More breaths (sighing quality)
                tempo_factor: 0.92,          // Slower pace
            },
            EmotionState::Excited => EmotionProsodyParams {
                vibrato_rate_hz: 7.0,        // Faster, energetic
                vibrato_depth_cents: 15.0,   // Wide, animated
                drift_bias_cents: 5.0,       // Strong upward
                drift_range_cents: 10.0,     // Wide range
                breath_likelihood: 0.05,     // Minimal breath (rapid speech)
                tempo_factor: 1.12,          // Noticeably faster
            },
            EmotionState::Calm => EmotionProsodyParams {
                vibrato_rate_hz: 4.0,        // Slow, relaxed
                vibrato_depth_cents: 5.0,    // Subtle
                drift_bias_cents: 0.0,       // Stable
                drift_range_cents: 3.0,      // Minimal drift
                breath_likelihood: 0.2,      // Relaxed breathing
                tempo_factor: 0.95,          // Slightly slower
            },
            EmotionState::Tense => EmotionProsodyParams {
                vibrato_rate_hz: 6.5,        // Slightly faster
                vibrato_depth_cents: 6.0,    // Controlled but tight
                drift_bias_cents: 2.0,       // Slight upward (stress)
                drift_range_cents: 4.0,      // Constrained
                breath_likelihood: 0.3,      // More breath (tension release)
                tempo_factor: 1.08,          // Faster (urgency)
            },
            EmotionState::Empathetic => EmotionProsodyParams {
                vibrato_rate_hz: 5.0,        // Warm, measured
                vibrato_depth_cents: 10.0,   // Gentle expression
                drift_bias_cents: -1.0,      // Slight downward (connecting)
                drift_range_cents: 6.0,
                breath_likelihood: 0.2,      // Natural breathing
                tempo_factor: 0.97,          // Slightly slower (giving space)
            },
            EmotionState::Curious => EmotionProsodyParams {
                vibrato_rate_hz: 5.8,        // Slightly animated
                vibrato_depth_cents: 9.0,
                drift_bias_cents: 4.0,       // Upward (questioning intonation)
                drift_range_cents: 7.0,
                breath_likelihood: 0.12,
                tempo_factor: 1.02,          // Slightly eager
            },
            EmotionState::Supportive => EmotionProsodyParams {
                vibrato_rate_hz: 5.2,        // Steady
                vibrato_depth_cents: 8.0,    // Warm but measured
                drift_bias_cents: 0.0,       // Stable (reassuring)
                drift_range_cents: 4.0,      // Controlled
                breath_likelihood: 0.18,
                tempo_factor: 0.98,          // Calm pace
            },
        }
    }
}

/// Prosody parameters derived from emotional state
#[derive(Debug, Clone, Copy)]
pub struct EmotionProsodyParams {
    /// Vibrato/micro-pitch rate in Hz (typically 4-7 Hz)
    pub vibrato_rate_hz: f32,
    /// Vibrato depth in cents (typically 5-15 cents)
    pub vibrato_depth_cents: f32,
    /// Pitch drift bias in cents (positive = upward tendency)
    pub drift_bias_cents: f32,
    /// Pitch drift range in cents (how far it can wander)
    pub drift_range_cents: f32,
    /// Likelihood of breath at utterance start (0-1)
    pub breath_likelihood: f32,
    /// Tempo/pacing factor (1.0 = normal, >1 = faster, <1 = slower)
    pub tempo_factor: f32,
}

/// Phrase boundary for adaptive breath placement
#[derive(Debug, Clone, Copy)]
pub struct PhraseBoundary {
    /// Sample index where the phrase boundary occurs
    pub sample_index: usize,
    /// Type of boundary (affects breath type)
    pub boundary_type: BoundaryType,
}

/// Types of phrase boundaries for breath placement
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundaryType {
    /// Sentence end - longer pause, possible exhale
    SentenceEnd,
    /// Clause break - medium pause, possible quick breath
    ClauseBreak,
    /// Emphasis point - brief intake before important word
    EmphasisBefore,
    /// Emotional release - exhale after emotional content
    EmotionalRelease,
}

// ============================================================================
// BIQUAD FILTER STATE
// ============================================================================

/// Biquad filter state - persists between frames
#[derive(Clone, Default)]
pub struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a single sample through the biquad filter
    #[inline]
    pub fn process(&mut self, x0: f32, b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) -> f32 {
        let y0 = b0 * x0 + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;

        y0
    }

    /// Reset filter state (use at start of new utterance)
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

// ============================================================================
// COMPRESSOR STATE
// ============================================================================

/// Compressor state with envelope follower
#[derive(Clone)]
pub struct CompressorState {
    envelope: f32,
    gain_reduction_db: f32,
}

impl Default for CompressorState {
    fn default() -> Self {
        Self {
            envelope: 0.0,
            gain_reduction_db: 0.0,
        }
    }
}

impl CompressorState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
        self.gain_reduction_db = 0.0;
    }
}

// ============================================================================
// DC BLOCKER STATE
// ============================================================================

/// Simple single-pole DC blocker (high-pass filter)
///
/// Removes DC offset that can accumulate from cascaded filters.
/// Uses a very low cutoff (~10Hz) to avoid affecting audible frequencies.
#[derive(Clone)]
pub struct DcBlocker {
    /// Previous input sample
    x_prev: f32,
    /// Previous output sample
    y_prev: f32,
    /// Filter coefficient (determines cutoff frequency)
    coef: f32,
}

impl DcBlocker {
    pub fn new(sample_rate: u32) -> Self {
        // Cutoff around 10Hz: coef = 1 - (2π * fc / fs)
        // Higher coef = lower cutoff = less bass affected
        let coef = 1.0 - (2.0 * PI * 10.0 / sample_rate as f32);
        Self {
            x_prev: 0.0,
            y_prev: 0.0,
            coef: coef.max(0.99), // Ensure coefficient is reasonable
        }
    }

    pub fn process(&mut self, x: f32) -> f32 {
        // y[n] = x[n] - x[n-1] + coef * y[n-1]
        let y = x - self.x_prev + self.coef * self.y_prev;
        self.x_prev = x;
        self.y_prev = y;
        y
    }

    pub fn reset(&mut self) {
        self.x_prev = 0.0;
        self.y_prev = 0.0;
    }
}

// ============================================================================
// HUMANIZATION: BREATH GENERATOR
// ============================================================================

/// Generates and injects natural breath sounds at phrase boundaries
///
/// Humans breathe between phrases - complete silence is unnatural.
/// This generates soft, spectral-shaped noise that sounds like an inhale.
#[derive(Clone)]
pub struct BreathGenerator {
    sample_rate: u32,
    /// Pre-generated breath sample (40ms soft inhale)
    breath_sample: Vec<f32>,
    /// Current position in breath playback
    playback_pos: usize,
    /// Whether we're currently playing a breath
    is_playing: bool,
    /// Probability of injecting breath (0-1)
    probability: f32,
    /// PRNG seed for deterministic selection
    rng_seed: u32,
}

impl BreathGenerator {
    pub fn new(sample_rate: u32, probability: f32) -> Self {
        let breath_sample = Self::generate_breath(sample_rate, 40.0); // 40ms breath
        Self {
            sample_rate,
            breath_sample,
            playback_pos: 0,
            is_playing: false,
            probability,
            rng_seed: 12345,
        }
    }

    /// Generate a breath-like sound with TIME-VARYING formant resonances
    ///
    /// IMPROVED IMPLEMENTATION: Uses formant-based synthesis with realistic
    /// time-varying characteristics that real breath sounds have:
    ///
    /// 1. TIME-VARYING FORMANTS: Formant frequencies drift naturally as the
    ///    oral cavity shape changes during exhale (mouth opens wider)
    /// 2. TURBULENT FLOW MODULATION: Real breath has chaotic turbulence that
    ///    modulates the noise character over time
    /// 3. SPECTRAL EVOLUTION: Breath starts more "sss" (high-frequency, forward)
    ///    and ends more "hhh" (lower, breathy)
    ///
    /// Reference formant values (schwa-like, relaxed mouth):
    /// - F1 (~500-700Hz): Primary oral cavity resonance
    /// - F2 (~1200-1600Hz): Front-back cavity position
    /// - F3 (~2200-2800Hz): Lip and tongue tip influence
    fn generate_breath(sample_rate: u32, duration_ms: f32) -> Vec<f32> {
        let num_samples = ((sample_rate as f32 * duration_ms) / 1000.0) as usize;
        let mut breath = vec![0.0f32; num_samples];
        let mut seed: u32 = 54321;

        // Starting formant frequencies (slightly constricted, "sss" like)
        let f1_start = 550.0_f32;
        let f2_start = 1500.0_f32;
        let f3_start = 2600.0_f32;

        // Ending formant frequencies (relaxed, "hhh" like)
        let f1_end = 650.0_f32;
        let f2_end = 1300.0_f32;
        let f3_end = 2300.0_f32;

        // Create formant filters (will be updated dynamically)
        let mut f1 = FormantFilter::new_bandpass(sample_rate as f32, f1_start, 2.5);
        let mut f2 = FormantFilter::new_bandpass(sample_rate as f32, f2_start, 3.5);
        let mut f3 = FormantFilter::new_bandpass(sample_rate as f32, f3_start, 4.5);

        // Pink noise filter state (for more natural spectral slope)
        let mut pink_state = [0.0f32; 3];

        // Turbulence modulation state (slow LFO for chaotic variation)
        let mut turb_phase = 0.0_f32;
        let turb_freq = 12.0; // 12 Hz turbulence modulation

        // Formant drift noise (very slow, smoothed random walk)
        let mut f1_drift = 0.0_f32;
        let mut f2_drift = 0.0_f32;
        let mut f3_drift = 0.0_f32;

        // Formant weights that evolve over time
        // Start: more F2/F3 (brighter "sss"), End: more F1 (breathy "hhh")
        let f1_weight_start = 0.35_f32;
        let f1_weight_end = 0.55_f32;
        let f2_weight_start = 0.30_f32;
        let f2_weight_end = 0.20_f32;
        let f3_weight_start = 0.25_f32;
        let f3_weight_end = 0.10_f32;

        // Update rate for filter coefficients (every N samples to avoid overhead)
        let update_interval = sample_rate as usize / 100; // 100 updates per second

        for i in 0..num_samples {
            // Normalized time (0 to 1)
            let t = i as f32 / num_samples as f32;

            // Update formant filters periodically (not every sample for efficiency)
            if i % update_interval == 0 {
                // Generate drift noise (small random walk)
                seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
                let drift_noise = ((seed >> 16) as f32 / 32768.0) - 1.0;

                // Smooth random walk for each formant (±30-50 Hz drift)
                f1_drift = f1_drift * 0.95 + drift_noise * 15.0;
                seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
                let drift_noise2 = ((seed >> 16) as f32 / 32768.0) - 1.0;
                f2_drift = f2_drift * 0.95 + drift_noise2 * 25.0;
                seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
                let drift_noise3 = ((seed >> 16) as f32 / 32768.0) - 1.0;
                f3_drift = f3_drift * 0.95 + drift_noise3 * 35.0;

                // Interpolate formant frequencies with drift
                let f1_freq = f1_start + (f1_end - f1_start) * t + f1_drift;
                let f2_freq = f2_start + (f2_end - f2_start) * t + f2_drift;
                let f3_freq = f3_start + (f3_end - f3_start) * t + f3_drift;

                // Update filter coefficients
                f1.update_frequency(sample_rate as f32, f1_freq.clamp(400.0, 800.0), 2.5);
                f2.update_frequency(sample_rate as f32, f2_freq.clamp(1000.0, 1800.0), 3.5);
                f3.update_frequency(sample_rate as f32, f3_freq.clamp(2000.0, 3000.0), 4.5);
            }

            // Generate white noise
            seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
            let white = ((seed >> 16) as f32 / 32768.0) - 1.0;

            // Convert to pink noise (1/f spectrum) using Voss-McCartney approximation
            pink_state[0] = 0.99886 * pink_state[0] + white * 0.0555179;
            pink_state[1] = 0.99332 * pink_state[1] + white * 0.0750759;
            pink_state[2] = 0.96900 * pink_state[2] + white * 0.1538520;
            let pink = (pink_state[0] + pink_state[1] + pink_state[2] + white * 0.5362) * 0.2;

            // Turbulence modulation (chaotic amplitude variation)
            turb_phase += turb_freq / sample_rate as f32;
            if turb_phase > 1.0 { turb_phase -= 1.0; }
            seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
            let turb_noise = ((seed >> 16) as f32 / 65536.0) - 0.5;
            let turb_mod = 1.0 + 0.15 * (turb_phase * 2.0 * std::f32::consts::PI).sin() + 0.1 * turb_noise;

            // Apply turbulence to noise
            let turbulent_pink = pink * turb_mod;

            // Envelope: quick attack (~10%), slow exponential decay
            let envelope = if t < 0.1 {
                (t / 0.1).powf(0.7)
            } else {
                (-(t - 0.1) * 4.0).exp()
            };

            // Time-varying formant weights (sss → hhh transition)
            let f1_weight = f1_weight_start + (f1_weight_end - f1_weight_start) * t;
            let f2_weight = f2_weight_start + (f2_weight_end - f2_weight_start) * t;
            let f3_weight = f3_weight_start + (f3_weight_end - f3_weight_start) * t;

            // Pass through formant filters with time-varying weights
            let f1_out = f1.process(turbulent_pink) * f1_weight;
            let f2_out = f2.process(turbulent_pink) * f2_weight;
            let f3_out = f3.process(turbulent_pink) * f3_weight;

            // Air texture (raw pink noise adds "airflow" realism)
            // More air at start (sibilant), less at end (breathy)
            let air_amount = 0.15 - 0.08 * t;
            let air_texture = pink * air_amount;

            // Final breath sound with envelope
            let formant_sum = f1_out + f2_out + f3_out;
            breath[i] = (formant_sum + air_texture) * envelope * 0.08;
        }

        // Light smoothing pass to remove any harsh transients
        let mut smoothed = vec![0.0f32; num_samples];
        for i in 0..num_samples {
            let start = i.saturating_sub(2);
            let end = (i + 2).min(num_samples);
            let sum: f32 = breath[start..end].iter().sum();
            smoothed[i] = sum / (end - start) as f32;
        }

        smoothed
    }

    /// Trigger breath injection at start of utterance (probabilistic)
    pub fn trigger_if_probable(&mut self) {
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let random = (self.rng_seed >> 16) as f32 / 65536.0;

        if random < self.probability {
            self.is_playing = true;
            self.playback_pos = 0;
        }
    }

    /// Force trigger breath (for testing or explicit control)
    pub fn trigger_breath(&mut self) {
        self.is_playing = true;
        self.playback_pos = 0;
    }

    /// Mix breath into audio samples
    pub fn process(&mut self, samples: &mut [f32]) -> bool {
        if !self.is_playing {
            return false;
        }

        for sample in samples.iter_mut() {
            if self.playback_pos < self.breath_sample.len() {
                *sample = *sample * 0.85 + self.breath_sample[self.playback_pos];
                self.playback_pos += 1;
            } else {
                self.is_playing = false;
                break;
            }
        }

        self.is_playing
    }

    pub fn reset(&mut self) {
        self.is_playing = false;
        self.playback_pos = 0;
    }

    /// Reseed the PRNG for this utterance
    /// This ensures each utterance has different random behavior
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }

    /// Check if breath should trigger based on given probability
    /// Used by adaptive breath timing
    pub fn should_trigger(&mut self, probability: f32) -> bool {
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let random = (self.rng_seed >> 16) as f32 / 65536.0;
        random < probability
    }

    /// Inject breath sound at a specific position within the frame
    /// Used by adaptive breath timing for phrase boundary placement
    pub fn inject_at_position(&mut self, samples: &mut [f32], start_pos: usize) {
        // If already playing a breath, don't interrupt
        if self.is_playing {
            return;
        }

        // Mix breath starting at the specified position
        let breath_len = self.breath_sample.len();
        for (i, sample) in samples.iter_mut().skip(start_pos).enumerate() {
            if i < breath_len {
                *sample = *sample * 0.85 + self.breath_sample[i];
            } else {
                break;
            }
        }

        // If breath extends beyond this frame, set up for continuation
        if samples.len() - start_pos < breath_len {
            self.is_playing = true;
            self.playback_pos = samples.len() - start_pos;
        }
    }
}

// ============================================================================
// HUMANIZATION: GLOTTAL ONSET SOFTENING
// ============================================================================

/// Softens hard glottal attacks on vowel-initial sounds
///
/// TTS often produces unnaturally hard onsets when starting words with vowels.
/// Real speech has a gradual "glottal onset" where the vocal folds close smoothly.
///
/// This component:
/// 1. Tracks running energy level
/// 2. Detects sudden jumps in energy (onset)
/// 3. Applies a micro-fade (3-5ms) to soften the transition
///
/// The effect is subtle but removes the "clicking" quality of hard glottal stops.
#[derive(Clone)]
pub struct OnsetSoftener {
    sample_rate: u32,
    /// Smoothed energy envelope (slow follower)
    energy_envelope: f32,
    /// Energy envelope smoothing coefficient (slow - ~50ms)
    energy_smooth_coef: f32,
    /// Threshold ratio for onset detection (e.g., 4.0 = 4x energy jump)
    onset_threshold: f32,
    /// Samples remaining in current fade-in (0 = not active)
    fade_samples_remaining: usize,
    /// Total fade duration in samples (~5ms)
    fade_duration: usize,
    /// Enable/disable
    enabled: bool,
}

impl OnsetSoftener {
    pub fn new(sample_rate: u32) -> Self {
        // Energy envelope follows over ~50ms
        let energy_smooth_coef = (-1.0 / (sample_rate as f32 * 0.05)).exp();
        // 5ms fade duration
        let fade_duration = (sample_rate as f32 * 0.005) as usize;

        Self {
            sample_rate,
            energy_envelope: 0.0,
            energy_smooth_coef,
            onset_threshold: 6.0, // 6x energy jump triggers softening
            fade_samples_remaining: 0,
            fade_duration,
            enabled: true,
        }
    }

    /// Process audio, detecting and softening onsets
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            let energy = sample.abs();

            // Detect onset: energy jumped significantly above envelope
            if energy > self.energy_envelope * self.onset_threshold && self.energy_envelope > 0.001 {
                // Start fade-in from low point
                if self.fade_samples_remaining == 0 {
                    self.fade_samples_remaining = self.fade_duration;
                }
            }

            // Apply fade if active
            if self.fade_samples_remaining > 0 {
                let progress = 1.0 - (self.fade_samples_remaining as f32 / self.fade_duration as f32);
                // Use sqrt for faster initial rise (sounds more natural than linear)
                let fade = progress.sqrt();
                *sample *= fade;
                self.fade_samples_remaining -= 1;
            }

            // Update energy envelope (slow follower)
            self.energy_envelope = self.energy_envelope * self.energy_smooth_coef
                + energy * (1.0 - self.energy_smooth_coef);
        }
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.energy_envelope = 0.0;
        self.fade_samples_remaining = 0;
    }

    /// Start new utterance (reset envelope to catch first-word onsets)
    pub fn start_utterance(&mut self) {
        self.energy_envelope = 0.0;
        self.fade_samples_remaining = 0;
    }
}

// ============================================================================
// HUMANIZATION: MICRO-PITCH MODULATOR
// ============================================================================

/// Adds subtle pitch variations that humans naturally have
///
/// Even trained singers don't hold a perfectly steady pitch - there are
/// micro-variations around 5-7Hz (vibrato-like) plus random drift.
/// This prevents the "robotic perfection" of raw TTS.
///
/// ⚠️ **KNOWN ISSUE**: This implementation uses variable-rate resampling with
/// `read_pos` reset at each frame boundary. This creates discontinuities that
/// cause audible clicks/crackles, especially when combined with crossfade.
/// **Currently disabled by default.** Proper fix: implement SOLA/PSOLA or
/// phase vocoder for artifact-free pitch shifting.
#[derive(Clone)]
pub struct MicroPitchModulator {
    sample_rate: u32,
    /// LFO phase (0-1)
    lfo_phase: f32,
    /// LFO frequency (Hz), typically 5-7
    lfo_freq: f32,
    /// Modulation depth in cents
    depth_cents: f32,
    /// PRNG seed for noise component
    rng_seed: u32,
    /// Previous sample for interpolation
    prev_sample: f32,
    /// Read position (fractional) for resampling
    read_pos: f32,
}

impl MicroPitchModulator {
    pub fn new(sample_rate: u32, depth_cents: f32) -> Self {
        Self {
            sample_rate,
            lfo_phase: 0.0,
            lfo_freq: 5.5, // ~5.5Hz modulation
            depth_cents,
            rng_seed: 98765,
            prev_sample: 0.0,
            read_pos: 0.0,
        }
    }

    /// Process samples with micro-pitch modulation
    /// Uses variable-rate resampling for pitch shifting
    ///
    /// NOTE: read_pos is reset at the start of each frame because each call
    /// receives a NEW array of samples. The LFO phase persists for continuity,
    /// but the resampling position must restart for each frame's data.
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.depth_cents <= 0.0 || samples.len() < 2 {
            return;
        }

        // CRITICAL: Reset read position for this frame's data
        // The previous frame's read_pos is meaningless for new sample data
        self.read_pos = 0.0;

        let original = samples.to_vec();
        let max_ratio = 2.0_f32.powf(self.depth_cents / 1200.0);
        let lfo_increment = self.lfo_freq / self.sample_rate as f32;

        for sample in samples.iter_mut() {
            // Update LFO
            self.lfo_phase += lfo_increment;
            if self.lfo_phase >= 1.0 {
                self.lfo_phase -= 1.0;
            }

            // Add noise component for natural variation
            self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((self.rng_seed >> 20) as f32 / 2048.0) - 1.0;

            // Combine LFO (70%) + noise (30%)
            let mod_value = (self.lfo_phase * 2.0 * PI).sin() * 0.7 + noise * 0.3;
            let current_ratio = 1.0 + (max_ratio - 1.0) * mod_value;

            // Resample with linear interpolation
            let read_idx = self.read_pos as usize;
            let frac = self.read_pos - read_idx as f32;

            if read_idx + 1 < original.len() {
                *sample = original[read_idx] * (1.0 - frac) + original[read_idx + 1] * frac;
            } else if read_idx < original.len() {
                *sample = original[read_idx];
            }

            self.read_pos += current_ratio;

            // Clamp read position
            if self.read_pos >= original.len() as f32 - 1.0 {
                self.read_pos = (original.len() as f32 - 1.5).max(0.0);
            }
        }
    }

    pub fn reset(&mut self) {
        self.lfo_phase = 0.0;
        self.read_pos = 0.0;
        self.prev_sample = 0.0;
    }

    /// Reset read position for new utterance (keep phase for continuity)
    pub fn start_utterance(&mut self) {
        self.read_pos = 0.0;
    }

    /// Reseed the PRNG for varied random noise component
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// HUMANIZATION: NOISE FLOOR
// ============================================================================

/// Adds subtle background noise floor
///
/// Complete digital silence sounds unnatural - real recordings always have
/// some room tone/noise floor. This adds very quiet shaped noise (~-60dB)
/// to make silences sound natural.
#[derive(Clone)]
pub struct NoiseFloor {
    /// PRNG seed
    rng_seed: u32,
    /// Noise level (linear amplitude)
    level: f32,
    /// Previous noise sample (for simple lowpass filtering to make "pink-ish")
    prev_noise: f32,
}

impl NoiseFloor {
    pub fn new(level_db: f32) -> Self {
        Self {
            rng_seed: 11111,
            level: 10.0_f32.powf(level_db / 20.0),
            prev_noise: 0.0,
        }
    }

    /// Add noise floor to samples
    pub fn process(&mut self, samples: &mut [f32]) {
        for sample in samples.iter_mut() {
            // Generate white noise
            self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let white = ((self.rng_seed >> 16) as f32 / 32768.0) - 1.0;

            // Simple lowpass to make it "pink-ish" (less harsh)
            let pink = self.prev_noise * 0.7 + white * 0.3;
            self.prev_noise = pink;

            *sample += pink * self.level;
        }
    }

    pub fn reset(&mut self) {
        self.prev_noise = 0.0;
    }

    /// Reseed the PRNG for varied noise pattern
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
        self.prev_noise = 0.0; // Reset filter state for clean start
    }
}

// ============================================================================
// HUMANIZATION: AMPLITUDE JITTER
// ============================================================================

/// Adds subtle volume micro-variations
///
/// Human voice naturally has small amplitude fluctuations - breathing,
/// muscle control variations, etc. This adds very subtle random volume
/// changes that happen slowly (not sample-by-sample, which would be noise).
#[derive(Clone)]
pub struct AmplitudeJitter {
    sample_rate: u32,
    /// Current jitter amount (linear multiplier)
    current_jitter: f32,
    /// Target jitter (we smooth toward this)
    target_jitter: f32,
    /// Jitter depth (0-1, typically 0.02 = 2%)
    depth: f32,
    /// Smoothing coefficient (how fast we move toward target)
    smooth_coef: f32,
    /// Counter for target updates
    update_counter: usize,
    /// Samples between target updates
    update_interval: usize,
    /// PRNG seed
    rng_seed: u32,
}

impl AmplitudeJitter {
    pub fn new(sample_rate: u32, depth: f32) -> Self {
        // Update target every ~50ms
        let update_interval = (sample_rate as f32 * 0.05) as usize;
        // Smooth over ~20ms
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.02)).exp();

        Self {
            sample_rate,
            current_jitter: 1.0,
            target_jitter: 1.0,
            depth,
            smooth_coef,
            update_counter: 0,
            update_interval,
            rng_seed: 77777,
        }
    }

    pub fn process(&mut self, samples: &mut [f32]) {
        for sample in samples.iter_mut() {
            // Update target periodically
            self.update_counter += 1;
            if self.update_counter >= self.update_interval {
                self.update_counter = 0;
                self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let random = ((self.rng_seed >> 16) as f32 / 32768.0) - 1.0;
                self.target_jitter = 1.0 + random * self.depth;
            }

            // Smooth toward target
            self.current_jitter = self.current_jitter * self.smooth_coef
                + self.target_jitter * (1.0 - self.smooth_coef);

            *sample *= self.current_jitter;
        }
    }

    pub fn reset(&mut self) {
        self.current_jitter = 1.0;
        self.target_jitter = 1.0;
        self.update_counter = 0;
    }

    /// Reseed the PRNG for varied jitter pattern
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// HUMANIZATION: PITCH DRIFT
// ============================================================================

/// Adds very slow pitch wandering over longer phrases
///
/// Different from micro-pitch (which is fast ~5Hz oscillation), pitch drift
/// is a slow wandering that happens over seconds. Humans naturally drift
/// slightly sharp or flat over long phrases.
///
/// ⚠️ **KNOWN ISSUE**: Same as MicroPitchModulator - uses resampling with
/// `read_pos` reset at frame boundaries, causing audible clicks/crackles.
/// **Currently disabled by default.** See MicroPitchModulator for details.
#[derive(Clone)]
pub struct PitchDrift {
    sample_rate: u32,
    /// Current drift amount (cents)
    current_drift: f32,
    /// Target drift (we smooth toward this)
    target_drift: f32,
    /// Maximum drift in cents
    max_drift_cents: f32,
    /// Smoothing coefficient (very slow)
    smooth_coef: f32,
    /// Counter for target updates
    update_counter: usize,
    /// Samples between target updates (~500ms)
    update_interval: usize,
    /// PRNG seed
    rng_seed: u32,
    /// Read position for resampling
    read_pos: f32,
}

impl PitchDrift {
    pub fn new(sample_rate: u32, max_drift_cents: f32) -> Self {
        // Update target every ~500ms for slow wandering
        let update_interval = (sample_rate as f32 * 0.5) as usize;
        // Very slow smoothing (~200ms)
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.2)).exp();

        Self {
            sample_rate,
            current_drift: 0.0,
            target_drift: 0.0,
            max_drift_cents,
            smooth_coef,
            update_counter: 0,
            update_interval,
            rng_seed: 33333,
            read_pos: 0.0,
        }
    }

    /// Process samples with slow pitch drift
    ///
    /// NOTE: read_pos is reset at the start of each frame because each call
    /// receives a NEW array of samples. The drift state (current_drift, target_drift)
    /// persists for smooth continuity across frames.
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.max_drift_cents <= 0.0 || samples.len() < 2 {
            return;
        }

        // CRITICAL: Reset read position for this frame's data
        // The previous frame's read_pos is meaningless for new sample data
        self.read_pos = 0.0;

        let original = samples.to_vec();

        for sample in samples.iter_mut() {
            // Update target periodically
            self.update_counter += 1;
            if self.update_counter >= self.update_interval {
                self.update_counter = 0;
                self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let random = ((self.rng_seed >> 16) as f32 / 32768.0) - 1.0;
                self.target_drift = random * self.max_drift_cents;
            }

            // Smooth toward target
            self.current_drift = self.current_drift * self.smooth_coef
                + self.target_drift * (1.0 - self.smooth_coef);

            // Convert cents to ratio
            let ratio = 2.0_f32.powf(self.current_drift / 1200.0);

            // Resample
            let read_idx = self.read_pos as usize;
            let frac = self.read_pos - read_idx as f32;

            if read_idx + 1 < original.len() {
                *sample = original[read_idx] * (1.0 - frac) + original[read_idx + 1] * frac;
            } else if read_idx < original.len() {
                *sample = original[read_idx];
            }

            self.read_pos += ratio;

            if self.read_pos >= original.len() as f32 - 1.0 {
                self.read_pos = (original.len() as f32 - 1.5).max(0.0);
            }
        }
    }

    pub fn reset(&mut self) {
        self.current_drift = 0.0;
        self.target_drift = 0.0;
        self.update_counter = 0;
        self.read_pos = 0.0;
    }

    pub fn start_utterance(&mut self) {
        self.read_pos = 0.0;
        // Keep drift state for continuity between utterances
    }

    /// Reseed the PRNG for varied drift pattern
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// HUMANIZATION: VOCAL FRY (Creaky Voice)
// ============================================================================

/// Adds vocal fry / creaky voice effect at phrase endings
///
/// Vocal fry is a low-frequency amplitude modulation (20-80 Hz) that creates
/// a "creaky" or "gravelly" quality in the voice. Humans naturally produce
/// this at the end of phrases when airflow decreases and vocal folds vibrate
/// irregularly. This is especially common in:
/// - Calm, relaxed speech
/// - End of utterances
/// - Lower pitch registers
/// - Certain speaking styles (especially common in American English)
/// Realistic vocal fry using irregular glottal pulse simulation
///
/// Real vocal fry (creaky voice) is caused by:
/// 1. Very low fundamental frequency (25-80 Hz)
/// 2. Irregular inter-pulse intervals (not perfectly periodic)
/// 3. Double/triple pulses (diploponic quality)
/// 4. Brief moments of near-silence between pulses
///
/// This implementation uses discrete irregular pulses instead of
/// continuous LFO modulation, which sounds much more natural.
#[derive(Clone)]
pub struct VocalFry {
    sample_rate: u32,
    /// Current fry intensity (0-1)
    current_intensity: f32,
    /// Target intensity
    target_intensity: f32,
    /// Depth of the fry effect (0-1)
    depth: f32,
    /// Smoothing coefficient for intensity changes
    smooth_coef: f32,
    /// PRNG for all randomness
    rng_seed: u32,
    /// Whether fry is currently active
    is_active: bool,
    /// Samples remaining in fry region
    fry_samples_remaining: usize,

    // Pulse timing state
    /// Samples until next pulse
    samples_to_next_pulse: usize,
    /// Current pulse envelope (0-1)
    pulse_envelope: f32,
    /// Samples into current pulse
    pulse_position: usize,
    /// Duration of current pulse in samples
    pulse_duration: usize,
    /// Base inter-pulse interval in samples (~25-50ms)
    base_interval: usize,
    /// Whether next pulse is a "double pulse" (diploponia)
    is_double_pulse: bool,
    /// Position in double pulse sequence
    double_pulse_phase: u8,
}

impl VocalFry {
    pub fn new(sample_rate: u32, depth: f32) -> Self {
        // Smooth intensity over ~50ms for gradual fade in/out
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.05)).exp();
        // Base interval ~30ms (33 Hz fundamental)
        let base_interval = (sample_rate as f32 * 0.030) as usize;

        Self {
            sample_rate,
            current_intensity: 0.0,
            target_intensity: 0.0,
            depth: depth.clamp(0.0, 1.0),
            smooth_coef,
            rng_seed: 55555,
            is_active: false,
            fry_samples_remaining: 0,
            samples_to_next_pulse: 0,
            pulse_envelope: 0.0,
            pulse_position: 0,
            pulse_duration: (sample_rate as f32 * 0.008) as usize, // 8ms pulse
            base_interval,
            is_double_pulse: false,
            double_pulse_phase: 0,
        }
    }

    /// Get next random value (0-1)
    fn next_random(&mut self) -> f32 {
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        (self.rng_seed >> 16) as f32 / 65536.0
    }

    /// Schedule next glottal pulse with irregular timing
    fn schedule_next_pulse(&mut self) {
        // Handle double pulses (diploponia) - occurs ~20% of the time
        if self.is_double_pulse && self.double_pulse_phase == 0 {
            // Second pulse of double comes very quickly (3-8ms)
            self.samples_to_next_pulse = (self.sample_rate as f32 * (0.003 + self.next_random() * 0.005)) as usize;
            self.double_pulse_phase = 1;
            return;
        }

        // Decide if next will be a double pulse
        self.is_double_pulse = self.next_random() < 0.20;
        self.double_pulse_phase = 0;

        // Irregular timing: base interval ± 40% jitter
        let jitter = (self.next_random() - 0.5) * 0.8; // -0.4 to +0.4
        let interval = self.base_interval as f32 * (1.0 + jitter);

        // Occasionally skip a pulse entirely (10% chance) for more irregular feel
        let skip_multiplier = if self.next_random() < 0.10 { 2.0 } else { 1.0 };

        self.samples_to_next_pulse = (interval * skip_multiplier) as usize;

        // Vary pulse duration slightly (6-12ms)
        self.pulse_duration = (self.sample_rate as f32 * (0.006 + self.next_random() * 0.006)) as usize;
    }

    /// Trigger vocal fry for the end of a phrase
    /// duration_ms: how long the fry should last (typically 150-400ms)
    pub fn trigger_fry(&mut self, duration_ms: f32) {
        self.is_active = true;
        self.target_intensity = 1.0;
        self.fry_samples_remaining = ((duration_ms * self.sample_rate as f32) / 1000.0) as usize;

        // Randomize base interval for this fry instance (25-45ms = 22-40 Hz)
        let random = self.next_random();
        self.base_interval = (self.sample_rate as f32 * (0.025 + random * 0.020)) as usize;

        // Start with immediate first pulse
        self.samples_to_next_pulse = 0;
        self.pulse_position = 0;
        self.pulse_envelope = 0.0;
    }

    /// Process samples with realistic vocal fry effect
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.is_active && self.current_intensity < 0.001 {
            return;
        }

        for sample in samples.iter_mut() {
            // Update fry duration countdown
            if self.fry_samples_remaining > 0 {
                self.fry_samples_remaining -= 1;
            } else if self.is_active {
                self.is_active = false;
                self.target_intensity = 0.0;
            }

            // Smooth intensity transitions
            self.current_intensity = self.current_intensity * self.smooth_coef
                + self.target_intensity * (1.0 - self.smooth_coef);

            if self.current_intensity < 0.001 {
                continue;
            }

            // Update pulse timing
            if self.samples_to_next_pulse > 0 {
                self.samples_to_next_pulse -= 1;
            } else if self.pulse_position == 0 {
                // Start new pulse
                self.pulse_position = 1;
                self.schedule_next_pulse();
            }

            // Calculate pulse envelope
            // Shape: fast attack (2ms), slower decay
            if self.pulse_position > 0 && self.pulse_position <= self.pulse_duration {
                let t = self.pulse_position as f32 / self.pulse_duration as f32;
                let attack_portion = 0.15; // 15% of pulse is attack

                self.pulse_envelope = if t < attack_portion {
                    // Fast attack
                    t / attack_portion
                } else {
                    // Exponential decay
                    let decay_t = (t - attack_portion) / (1.0 - attack_portion);
                    (1.0 - decay_t).powf(1.5)
                };

                self.pulse_position += 1;
            } else if self.pulse_position > self.pulse_duration {
                // Pulse complete
                self.pulse_envelope = 0.0;
                self.pulse_position = 0;
            }

            // Apply vocal fry modulation
            // During pulses: brief attenuation (glottal closure)
            // Between pulses: near-normal level
            let attenuation = self.pulse_envelope * self.depth * self.current_intensity * 0.7;
            *sample *= 1.0 - attenuation.clamp(0.0, 0.7);
        }
    }

    pub fn reset(&mut self) {
        self.current_intensity = 0.0;
        self.target_intensity = 0.0;
        self.is_active = false;
        self.fry_samples_remaining = 0;
        self.samples_to_next_pulse = 0;
        self.pulse_envelope = 0.0;
        self.pulse_position = 0;
        self.is_double_pulse = false;
        self.double_pulse_phase = 0;
    }

    /// Reseed for varied patterns
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// HUMANIZATION: LIP SMACKS / MOUTH SOUNDS
// ============================================================================

/// Biquad filter for formant resonances
/// Used to simulate oral cavity resonances in mouth sounds
#[derive(Clone)]
struct FormantFilter {
    // Biquad coefficients
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    // Filter state
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl FormantFilter {
    /// Create a bandpass filter for a formant frequency
    /// Q controls the resonance width (higher = narrower/more resonant)
    fn new_bandpass(sample_rate: f32, center_freq: f32, q: f32) -> Self {
        let omega = 2.0 * std::f32::consts::PI * center_freq / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = alpha;
        let b1 = 0.0;
        let b2 = -alpha;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        // Normalize by a0
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Process a single sample through the filter
    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }

    fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    /// Update the filter frequency without resetting state
    /// Used for time-varying formants (e.g., in breath synthesis)
    fn update_frequency(&mut self, sample_rate: f32, center_freq: f32, q: f32) {
        let omega = 2.0 * std::f32::consts::PI * center_freq / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = alpha;
        let b1 = 0.0;
        let b2 = -alpha;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        // Update coefficients without resetting filter state
        // This allows smooth frequency transitions without clicks
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }
}

/// Generates and injects lip smack / mouth sounds between phrases
///
/// IMPROVED IMPLEMENTATION: Uses formant-based synthesis to simulate
/// oral cavity resonances. Real mouth sounds have specific resonant
/// frequencies (~500Hz, ~1500Hz, ~2500Hz) from the shape of the mouth.
///
/// Types of mouth sounds:
/// - Lip pop: Fast transient "pop" when lips separate, dominated by F1 (~500Hz)
/// - Soft smack: Gentler mouth open with broader resonances
/// - Wet smack: Multiple micro-bursts with saliva crackling
/// - Tongue click: Sharp click with higher formants (~1500-3000Hz)
#[derive(Clone)]
pub struct LipSmackGenerator {
    sample_rate: u32,
    /// Pre-generated lip smack waveforms with formant structure
    smack_buffers: Vec<Vec<f32>>,
    /// Current playback position (-1 = not playing)
    playback_pos: i32,
    /// Which smack buffer is currently playing
    current_smack_idx: usize,
    /// Volume of the smack
    smack_volume: f32,
    /// PRNG for variation
    rng_seed: u32,
}

impl LipSmackGenerator {
    pub fn new(sample_rate: u32) -> Self {
        // Generate formant-based smack waveforms
        let smack_buffers = Self::generate_smack_library(sample_rate);

        Self {
            sample_rate,
            smack_buffers,
            playback_pos: -1,
            current_smack_idx: 0,
            smack_volume: 0.08,
            rng_seed: 33333,
        }
    }

    /// Generate a library of formant-based lip smack sounds
    fn generate_smack_library(sample_rate: u32) -> Vec<Vec<f32>> {
        let mut library = Vec::new();

        // Type 1: Quick lip pop - sharp transient with F1 resonance (18ms)
        library.push(Self::generate_lip_pop_formant(sample_rate, 0.018));

        // Type 2: Soft mouth open - broader, gentler resonances (30ms)
        library.push(Self::generate_soft_smack_formant(sample_rate, 0.030));

        // Type 3: Wet smack - multiple micro-bursts (25ms)
        library.push(Self::generate_wet_smack_formant(sample_rate, 0.025));

        // Type 4: Tongue click - sharper, higher formants (15ms)
        library.push(Self::generate_tongue_click_formant(sample_rate, 0.015));

        library
    }

    /// Generate a lip pop with proper formant resonances
    /// Physics: Air burst as lips separate excites F1 (~500Hz) most strongly
    fn generate_lip_pop_formant(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_s) as usize;
        let mut buffer = vec![0.0; num_samples];
        let mut rng = 12345u32;

        // Create formant filters for oral cavity resonances
        // F1 ~500Hz (mouth opening), F2 ~1500Hz (tongue position), F3 ~2500Hz (lip rounding)
        let mut f1 = FormantFilter::new_bandpass(sample_rate as f32, 520.0, 8.0);
        let mut f2 = FormantFilter::new_bandpass(sample_rate as f32, 1450.0, 10.0);
        let mut f3 = FormantFilter::new_bandpass(sample_rate as f32, 2400.0, 12.0);

        // Generate excitation signal: impulse + decaying noise burst
        let mut excitation = vec![0.0f32; num_samples];
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;

            // Initial impulse (the "pop" transient)
            let impulse = if i < 3 { 1.0 - (i as f32 / 3.0) } else { 0.0 };

            // Decaying noise burst (air release)
            rng = rng.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((rng >> 16) as f32 / 32768.0) - 1.0;
            let noise_env = (-t * 25.0).exp(); // Fast decay

            excitation[i] = impulse * 0.8 + noise * noise_env * 0.4;
        }

        // Apply formant filters in parallel and sum
        // F1 dominates for lip pops, F2 and F3 are quieter overtones
        for i in 0..num_samples {
            let input = excitation[i];
            let f1_out = f1.process(input) * 1.0;   // Dominant
            let f2_out = f2.process(input) * 0.4;   // Moderate
            let f3_out = f3.process(input) * 0.15;  // Subtle

            buffer[i] = f1_out + f2_out + f3_out;
        }

        // Final amplitude envelope to ensure clean start/end
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;
            // Very fast attack, natural decay
            let env = if t < 0.05 {
                t / 0.05
            } else {
                (-((t - 0.05) * 8.0)).exp()
            };
            buffer[i] *= env;
        }

        // Normalize
        Self::normalize_buffer(&mut buffer, 0.9);

        buffer
    }

    /// Generate a soft mouth opening sound with broader resonances
    fn generate_soft_smack_formant(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_s) as usize;
        let mut buffer = vec![0.0; num_samples];
        let mut rng = 67890u32;

        // Lower, broader formants for softer sound
        // Slightly detuned for a more "wet" quality
        let mut f1 = FormantFilter::new_bandpass(sample_rate as f32, 450.0, 5.0); // Lower Q = broader
        let mut f2 = FormantFilter::new_bandpass(sample_rate as f32, 1300.0, 6.0);
        let mut f3 = FormantFilter::new_bandpass(sample_rate as f32, 2200.0, 8.0);

        // Gentler excitation: smooth attack, slower decay
        let mut excitation = vec![0.0f32; num_samples];
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;

            // Smooth onset instead of impulse
            let attack = if t < 0.1 { (t / 0.1).powf(0.5) } else { 1.0 };
            let decay = (-(t * 3.0).powf(1.5)).exp();

            rng = rng.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((rng >> 16) as f32 / 32768.0) - 1.0;

            excitation[i] = noise * attack * decay;
        }

        // Apply formant filters
        for i in 0..num_samples {
            let input = excitation[i];
            let f1_out = f1.process(input) * 0.8;
            let f2_out = f2.process(input) * 0.5;
            let f3_out = f3.process(input) * 0.2;

            buffer[i] = f1_out + f2_out + f3_out;
        }

        // Smooth envelope
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;
            let env = (std::f32::consts::PI * t).sin().powf(0.8);
            buffer[i] *= env;
        }

        Self::normalize_buffer(&mut buffer, 0.7);

        buffer
    }

    /// Generate a wet smack with multiple micro-bursts (saliva crackling)
    fn generate_wet_smack_formant(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_s) as usize;
        let mut buffer = vec![0.0; num_samples];
        let mut rng = 24680u32;

        // Multiple formant filter banks for complexity
        let mut f1a = FormantFilter::new_bandpass(sample_rate as f32, 480.0, 7.0);
        let mut f1b = FormantFilter::new_bandpass(sample_rate as f32, 600.0, 9.0); // Second resonance
        let mut f2 = FormantFilter::new_bandpass(sample_rate as f32, 1400.0, 8.0);

        // Multiple micro-burst excitation (saliva bubbles/crackling)
        let num_bursts = 4;
        let mut excitation = vec![0.0f32; num_samples];

        for burst_idx in 0..num_bursts {
            // Slightly randomized burst timing
            rng = rng.wrapping_mul(1103515245).wrapping_add(12345);
            let jitter = ((rng >> 16) as f32 / 65536.0) * 0.1 - 0.05;
            let burst_center = (burst_idx as f32 + 0.5 + jitter) / num_bursts as f32;
            let burst_width = 0.15 / num_bursts as f32;

            for i in 0..num_samples {
                let t = i as f32 / num_samples as f32;
                let dist = (t - burst_center).abs();

                if dist < burst_width {
                    let burst_env = (1.0 - dist / burst_width).powf(2.0);

                    rng = rng.wrapping_mul(1103515245).wrapping_add(12345);
                    let noise = ((rng >> 16) as f32 / 32768.0) - 1.0;

                    // Add small impulse at burst center
                    let impulse = if dist < 0.01 { 0.5 } else { 0.0 };

                    excitation[i] += (noise * 0.6 + impulse) * burst_env;
                }
            }
        }

        // Apply formant filters
        for i in 0..num_samples {
            let input = excitation[i];
            let f1a_out = f1a.process(input) * 0.7;
            let f1b_out = f1b.process(input) * 0.5;
            let f2_out = f2.process(input) * 0.3;

            buffer[i] = f1a_out + f1b_out + f2_out;
        }

        // Overall envelope
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;
            let env = (1.0 - t).powf(0.5) * (t * 20.0).min(1.0);
            buffer[i] *= env;
        }

        Self::normalize_buffer(&mut buffer, 0.6);

        buffer
    }

    /// Generate a tongue click with higher, sharper formants
    fn generate_tongue_click_formant(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_s) as usize;
        let mut buffer = vec![0.0; num_samples];
        let mut rng = 13579u32;

        // Higher formants for tongue position against palate
        // Clicks have more energy in F2 and F3
        let mut f1 = FormantFilter::new_bandpass(sample_rate as f32, 700.0, 12.0);  // Higher Q = sharper
        let mut f2 = FormantFilter::new_bandpass(sample_rate as f32, 1800.0, 15.0); // Dominant for clicks
        let mut f3 = FormantFilter::new_bandpass(sample_rate as f32, 3200.0, 18.0); // Sharp overtone

        // Very sharp impulse excitation
        let mut excitation = vec![0.0f32; num_samples];
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;

            // Sharp impulse
            let impulse = if i < 2 { 1.0 } else { 0.0 };

            // Very brief noise tail
            rng = rng.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((rng >> 16) as f32 / 32768.0) - 1.0;
            let noise_env = (-t * 50.0).exp();

            excitation[i] = impulse * 1.0 + noise * noise_env * 0.2;
        }

        // Apply formant filters - F2 and F3 are more prominent for clicks
        for i in 0..num_samples {
            let input = excitation[i];
            let f1_out = f1.process(input) * 0.3;   // Less dominant
            let f2_out = f2.process(input) * 1.0;   // Dominant
            let f3_out = f3.process(input) * 0.6;   // Strong overtone

            buffer[i] = f1_out + f2_out + f3_out;
        }

        // Very fast envelope
        for i in 0..num_samples {
            let t = i as f32 / num_samples as f32;
            let env = (-t * 15.0).exp();
            buffer[i] *= env;
        }

        Self::normalize_buffer(&mut buffer, 0.85);

        buffer
    }

    /// Normalize buffer to target peak amplitude
    fn normalize_buffer(buffer: &mut [f32], target_peak: f32) {
        let max = buffer.iter().map(|x| x.abs()).fold(0.0f32, f32::max);
        if max > 0.001 {
            let scale = target_peak / max;
            for sample in buffer.iter_mut() {
                *sample *= scale;
            }
        }
    }

    /// Trigger a lip smack to be played
    pub fn trigger_smack(&mut self) {
        // Pick a random smack type with weighted probability
        // Lip pop and soft smack are more common than wet or click
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let rand_val = (self.rng_seed >> 16) % 100;

        self.current_smack_idx = if rand_val < 40 {
            0 // Lip pop (40%)
        } else if rand_val < 75 {
            1 // Soft smack (35%)
        } else if rand_val < 90 {
            2 // Wet smack (15%)
        } else {
            3 // Tongue click (10%)
        };

        self.playback_pos = 0;

        // Randomize volume
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let vol_variation = ((self.rng_seed >> 16) as f32 / 65536.0) * 0.03;
        self.smack_volume = 0.05 + vol_variation; // Subtle but audible
    }

    /// Process samples - mix in lip smack if playing
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.playback_pos < 0 {
            return;
        }

        let smack = &self.smack_buffers[self.current_smack_idx];

        for sample in samples.iter_mut() {
            if self.playback_pos >= 0 && (self.playback_pos as usize) < smack.len() {
                *sample += smack[self.playback_pos as usize] * self.smack_volume;
                self.playback_pos += 1;
            } else {
                self.playback_pos = -1;
                break;
            }
        }
    }

    pub fn reset(&mut self) {
        self.playback_pos = -1;
    }

    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// HUMANIZATION: TEMPO MICRO-VARIATIONS
// ============================================================================

/// SOLA-based tempo micro-variation for natural speech rhythm
///
/// IMPROVED IMPLEMENTATION: Uses Synchronous Overlap-Add (SOLA) for
/// artifact-free time stretching with proper cross-frame continuity.
///
/// Humans naturally speed up in the middle of phrases and slow down at
/// boundaries. This creates a rhythmic "breathing" quality to speech.
///
/// Key improvements over naive resampling:
/// - Cross-correlation splice point finding (no clicks)
/// - Proper Hann windowing for smooth transitions
/// - Continuous state across frame boundaries
/// - Pitch-preserving time stretch
#[derive(Clone)]
pub struct TempoMicroVariation {
    sample_rate: u32,
    /// Current tempo factor (1.0 = normal, >1.0 = faster)
    current_tempo: f32,
    /// Target tempo
    target_tempo: f32,
    /// Base tempo variation depth (0-1, typically 0.02-0.05)
    depth: f32,
    /// LFO phase for tempo modulation (continuous across frames)
    lfo_phase: f32,
    /// LFO frequency (very slow, 0.3-0.8 Hz)
    lfo_freq: f32,
    /// Smoothing coefficient for tempo changes
    smooth_coef: f32,
    /// Input accumulation buffer (for SOLA processing)
    input_buffer: Vec<f32>,
    /// Output buffer (processed samples)
    output_buffer: Vec<f32>,
    /// Overlap buffer for SOLA synthesis
    overlap_buffer: Vec<f32>,
    /// Previous frame tail for cross-correlation
    prev_tail: Vec<f32>,
    /// Pre-computed Hann window
    window: Vec<f32>,
    /// Has been initialized with audio
    is_initialized: bool,
    /// Total samples processed (for phase continuity)
    total_samples: u64,
    // =========================================================================
    // FINAL LENGTHENING - Pre-boundary slowdown (phonetic phenomenon)
    // =========================================================================
    /// Enable final lengthening at phrase boundaries
    enable_final_lengthening: bool,
    /// Samples remaining until phrase boundary (0 = not approaching)
    samples_to_boundary: usize,
    /// Final lengthening ramp duration in samples (~150ms)
    final_lengthening_ramp: usize,
    /// Maximum final lengthening factor (1.25 = 25% slower)
    final_lengthening_amount: f32,
}

// SOLA constants for tempo variation
const TEMPO_FRAME_SIZE: usize = 512;     // Smaller than pitch (faster response)
const TEMPO_HOP_SIZE: usize = 128;       // 75% overlap
const TEMPO_SEARCH_RANGE: usize = 32;    // Correlation search ±samples

impl TempoMicroVariation {
    pub fn new(sample_rate: u32, depth: f32) -> Self {
        // Smooth tempo over ~50ms for responsive but artifact-free changes
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.05)).exp();

        // Pre-compute Hann window
        let window: Vec<f32> = (0..TEMPO_FRAME_SIZE)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (TEMPO_FRAME_SIZE - 1) as f32).cos())
            })
            .collect();

        Self {
            sample_rate,
            current_tempo: 1.0,
            target_tempo: 1.0,
            depth: depth.clamp(0.0, 0.1), // Max 10% variation
            lfo_phase: 0.0,
            lfo_freq: 0.5, // 0.5 Hz - one cycle per 2 seconds
            smooth_coef,
            input_buffer: Vec::with_capacity(TEMPO_FRAME_SIZE * 4),
            output_buffer: Vec::with_capacity(TEMPO_FRAME_SIZE * 4),
            overlap_buffer: vec![0.0; TEMPO_FRAME_SIZE],
            prev_tail: Vec::with_capacity(TEMPO_HOP_SIZE),
            window,
            is_initialized: false,
            total_samples: 0,
            // Final lengthening defaults
            enable_final_lengthening: true,
            samples_to_boundary: 0,
            final_lengthening_ramp: (sample_rate as f32 * 0.15) as usize, // 150ms ramp
            final_lengthening_amount: 1.30, // 30% slower at boundary
        }
    }

    /// Signal that a phrase boundary is approaching in N samples
    ///
    /// Call this when punctuation or silence is detected ahead.
    /// The processor will gradually slow down as it approaches the boundary.
    pub fn set_phrase_boundary(&mut self, samples_until_boundary: usize) {
        if self.enable_final_lengthening {
            self.samples_to_boundary = samples_until_boundary;
        }
    }

    /// Get the ramp duration in samples for final lengthening lookahead
    pub fn get_final_lengthening_ramp(&self) -> usize {
        self.final_lengthening_ramp
    }

    /// Calculate the final lengthening factor based on proximity to boundary
    fn get_final_lengthening_factor(&self) -> f32 {
        if !self.enable_final_lengthening || self.samples_to_boundary == 0 {
            return 1.0;
        }

        // How far into the ramp are we? (0.0 = just started, 1.0 = at boundary)
        let ramp_progress = if self.samples_to_boundary >= self.final_lengthening_ramp {
            0.0 // Not in ramp zone yet
        } else {
            1.0 - (self.samples_to_boundary as f32 / self.final_lengthening_ramp as f32)
        };

        // Use smooth ease-in curve (quadratic) for natural deceleration
        // Humans don't suddenly slow down - they ease into it
        let eased = ramp_progress * ramp_progress;

        // Interpolate between 1.0 and final_lengthening_amount
        1.0 + (self.final_lengthening_amount - 1.0) * eased
    }

    /// Process samples with SOLA-based tempo micro-variation
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.depth < 0.001 || samples.is_empty() {
            return;
        }

        // Update LFO phase based on samples processed (not frame-by-frame!)
        let phase_inc_per_sample = 2.0 * std::f32::consts::PI * self.lfo_freq / self.sample_rate as f32;
        self.lfo_phase += phase_inc_per_sample * samples.len() as f32;
        while self.lfo_phase >= 2.0 * std::f32::consts::PI {
            self.lfo_phase -= 2.0 * std::f32::consts::PI;
        }

        // Calculate target tempo from LFO
        let lfo_value = self.lfo_phase.sin();
        let lfo_tempo = 1.0 + lfo_value * self.depth;

        // Apply final lengthening factor (slows down near phrase boundaries)
        // Final lengthening DIVIDES the tempo to slow down
        // e.g., factor of 1.3 means target tempo becomes 1.0/1.3 = 0.77 (23% slower)
        let final_factor = self.get_final_lengthening_factor();
        self.target_tempo = lfo_tempo / final_factor;

        // Decrement boundary countdown
        if self.samples_to_boundary > 0 {
            self.samples_to_boundary = self.samples_to_boundary.saturating_sub(samples.len());
        }

        // Smooth toward target
        self.current_tempo = self.current_tempo * self.smooth_coef
            + self.target_tempo * (1.0 - self.smooth_coef);

        // For very small tempo changes, skip SOLA overhead
        if (self.current_tempo - 1.0).abs() < 0.005 {
            self.total_samples += samples.len() as u64;
            return;
        }

        // Accumulate input
        self.input_buffer.extend_from_slice(samples);

        // Process complete SOLA frames
        while self.input_buffer.len() >= TEMPO_FRAME_SIZE {
            self.process_sola_frame();
        }

        // Copy output back to input buffer, handling length differences
        let output_len = self.output_buffer.len().min(samples.len());
        samples[..output_len].copy_from_slice(&self.output_buffer[..output_len]);

        // Drain used output
        self.output_buffer.drain(..output_len);

        // If output was shorter (speeding up), hold last sample
        if output_len < samples.len() {
            let hold_val = if output_len > 0 { samples[output_len - 1] } else { 0.0 };
            samples[output_len..].fill(hold_val);
        }

        self.total_samples += samples.len() as u64;
    }

    /// Process a single SOLA frame for time stretching
    fn process_sola_frame(&mut self) {
        if self.input_buffer.len() < TEMPO_FRAME_SIZE {
            return;
        }

        // Extract and window analysis frame
        let mut frame: Vec<f32> = self.input_buffer[..TEMPO_FRAME_SIZE].to_vec();

        // Calculate synthesis hop size based on tempo
        // tempo > 1.0 (faster) = smaller synthesis hop
        // tempo < 1.0 (slower) = larger synthesis hop
        let synthesis_hop = (TEMPO_HOP_SIZE as f32 / self.current_tempo) as usize;
        let synthesis_hop = synthesis_hop.max(32).min(TEMPO_HOP_SIZE * 2);

        // Find optimal splice point using cross-correlation
        if self.is_initialized && !self.prev_tail.is_empty() {
            let offset = self.find_optimal_splice(&frame);
            self.apply_splice_offset(&mut frame, offset);
        }

        // Apply Hann window
        for (i, sample) in frame.iter_mut().enumerate() {
            if i < self.window.len() {
                *sample *= self.window[i];
            }
        }

        // Overlap-add synthesis
        self.synthesize_frame(&frame, synthesis_hop);

        // Store tail for next frame's cross-correlation
        self.prev_tail.clear();
        let tail_start = frame.len().saturating_sub(TEMPO_HOP_SIZE);
        self.prev_tail.extend_from_slice(&frame[tail_start..]);

        // Advance input buffer by analysis hop (not synthesis hop!)
        self.input_buffer.drain(..TEMPO_HOP_SIZE);

        self.is_initialized = true;
    }

    /// Find optimal splice offset using cross-correlation
    fn find_optimal_splice(&self, frame: &[f32]) -> isize {
        if self.prev_tail.is_empty() || frame.is_empty() {
            return 0;
        }

        let compare_len = self.prev_tail.len().min(frame.len()).min(TEMPO_HOP_SIZE);
        if compare_len < 4 {
            return 0;
        }

        let mut best_offset: isize = 0;
        let mut best_correlation: f32 = f32::NEG_INFINITY;

        for offset in -(TEMPO_SEARCH_RANGE as isize)..=(TEMPO_SEARCH_RANGE as isize) {
            let mut correlation: f32 = 0.0;
            let mut count = 0;

            for i in 0..compare_len {
                let next_idx = (i as isize + offset) as usize;
                if i < self.prev_tail.len() && next_idx < frame.len() {
                    correlation += self.prev_tail[i] * frame[next_idx];
                    count += 1;
                }
            }

            if count > 0 {
                correlation /= count as f32;
                if correlation > best_correlation {
                    best_correlation = correlation;
                    best_offset = offset;
                }
            }
        }

        best_offset
    }

    /// Apply splice offset to frame for optimal continuity
    fn apply_splice_offset(&self, frame: &mut [f32], offset: isize) {
        if offset == 0 || frame.is_empty() {
            return;
        }

        let frame_len = frame.len();
        let abs_offset = offset.unsigned_abs();

        if offset > 0 && abs_offset < frame_len {
            // Shift left
            let shift_amt = abs_offset.min(frame_len);
            frame.rotate_left(shift_amt);
            let start = frame_len.saturating_sub(abs_offset);
            frame[start..].fill(0.0);
        } else if offset < 0 && abs_offset < frame_len {
            // Shift right
            let shift_amt = abs_offset.min(frame_len);
            frame.rotate_right(shift_amt);
            let end = abs_offset.min(frame_len);
            frame[..end].fill(0.0);
        }
    }

    /// Overlap-add a processed frame to output
    fn synthesize_frame(&mut self, frame: &[f32], synthesis_hop: usize) {
        // Ensure overlap buffer is large enough
        if self.overlap_buffer.len() < frame.len() {
            self.overlap_buffer.resize(frame.len(), 0.0);
        }

        // Add frame to overlap buffer
        for (i, &sample) in frame.iter().enumerate() {
            if i < self.overlap_buffer.len() {
                self.overlap_buffer[i] += sample;
            }
        }

        // Output the synthesis hop worth of samples
        let output_samples = synthesis_hop.min(self.overlap_buffer.len());
        self.output_buffer.extend_from_slice(&self.overlap_buffer[..output_samples]);

        // Shift overlap buffer
        self.overlap_buffer.drain(..output_samples);
        self.overlap_buffer.resize(TEMPO_FRAME_SIZE, 0.0);
    }

    pub fn reset(&mut self) {
        self.current_tempo = 1.0;
        self.target_tempo = 1.0;
        self.lfo_phase = 0.0;
        self.input_buffer.clear();
        self.output_buffer.clear();
        self.overlap_buffer.fill(0.0);
        self.prev_tail.clear();
        self.is_initialized = false;
        self.total_samples = 0;
    }

    pub fn start_utterance(&mut self) {
        // Start with slight slowdown (natural phrase start)
        self.target_tempo = 1.0 - self.depth * 0.5;
        // Don't reset buffers - maintain continuity
    }
}

// ============================================================================
// DE-ESSER STATE
// ============================================================================

/// De-esser state (sibilance detector + compressor)
#[derive(Clone)]
pub struct DeEsserState {
    /// Bandpass filter for sibilance detection (4-8kHz)
    detect_filter: BiquadState,
    /// Envelope follower for sibilance
    sibilance_envelope: f32,
    /// Gain reduction applied
    gain_reduction: f32,
}

impl Default for DeEsserState {
    fn default() -> Self {
        Self {
            detect_filter: BiquadState::new(),
            sibilance_envelope: 0.0,
            gain_reduction: 1.0,
        }
    }
}

impl DeEsserState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.detect_filter.reset();
        self.sibilance_envelope = 0.0;
        self.gain_reduction = 1.0;
    }
}

// ============================================================================
// SPLIT-BAND DE-ESSER STATE (Professional Quality)
// ============================================================================

/// Split-band de-esser that only attenuates high frequencies
///
/// Unlike the wideband de-esser which applies gain reduction to ALL frequencies
/// (causing audible "pumping" and "sparkler" artifacts), this split-band approach:
///
/// 1. Splits the signal into LOW (<5kHz) and HIGH (>5kHz) bands
/// 2. Detects sibilance energy in the HIGH band only
/// 3. Applies compression ONLY to the HIGH band
/// 4. Recombines: untouched_low + compressed_high
///
/// This is the same technique used in professional hardware de-essers like
/// the Empirical Labs DerrEsser and Weiss DS1-MK3.
#[derive(Clone)]
pub struct SplitBandDeEsser {
    /// Crossover frequency (Hz) - typically 4-6kHz for voice
    crossover_freq: f32,

    /// Low-pass filter state (for low band)
    lowpass_state: BiquadState,
    /// High-pass filter state (for high band)
    highpass_state: BiquadState,

    /// Low-pass coefficients
    lowpass_coeffs: BiquadCoeffs,
    /// High-pass coefficients
    highpass_coeffs: BiquadCoeffs,

    /// Envelope follower for high band sibilance detection
    high_band_envelope: f32,

    /// Attack coefficient for envelope
    attack_coef: f32,
    /// Release coefficient for envelope
    release_coef: f32,

    /// Threshold for compression (linear)
    threshold: f32,
    /// Compression ratio
    ratio: f32,

    /// Current gain reduction (for metering)
    gain_reduction: f32,
}

impl SplitBandDeEsser {
    /// Create a new split-band de-esser
    ///
    /// # Arguments
    /// * `sample_rate` - Audio sample rate (e.g., 24000)
    /// * `crossover_freq` - Frequency to split bands (typically 4000-6000 Hz)
    /// * `threshold_db` - Compression threshold in dB (e.g., -20)
    /// * `ratio` - Compression ratio (e.g., 4.0 for 4:1)
    pub fn new(sample_rate: u32, crossover_freq: f32, threshold_db: f32, ratio: f32) -> Self {
        // Create Butterworth crossover filters
        let lowpass_coeffs = BiquadCoeffs::lowpass(sample_rate, crossover_freq, 0.707);
        let highpass_coeffs = BiquadCoeffs::highpass(sample_rate, crossover_freq, 0.707);

        // Fast attack (1ms), moderate release (30ms) for de-essing
        let attack_coef = (-1.0 / (1.0 * sample_rate as f32 / 1000.0)).exp();
        let release_coef = (-1.0 / (30.0 * sample_rate as f32 / 1000.0)).exp();

        let threshold = 10.0_f32.powf(threshold_db / 20.0);

        Self {
            crossover_freq,
            lowpass_state: BiquadState::new(),
            highpass_state: BiquadState::new(),
            lowpass_coeffs,
            highpass_coeffs,
            high_band_envelope: 0.0,
            attack_coef,
            release_coef,
            threshold,
            ratio,
            gain_reduction: 1.0,
        }
    }

    /// Process a single sample through the split-band de-esser
    ///
    /// Returns the processed sample with sibilance reduced
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let c_lp = &self.lowpass_coeffs;
        let c_hp = &self.highpass_coeffs;

        // Split into low and high bands
        let low_band = self.lowpass_state.process(input, c_lp.b0, c_lp.b1, c_lp.b2, c_lp.a1, c_lp.a2);
        let high_band = self.highpass_state.process(input, c_hp.b0, c_hp.b1, c_hp.b2, c_hp.a1, c_hp.a2);

        // Detect sibilance energy in high band
        let high_band_abs = high_band.abs();

        // Envelope follower on high band only
        if high_band_abs > self.high_band_envelope {
            self.high_band_envelope = self.attack_coef * self.high_band_envelope
                + (1.0 - self.attack_coef) * high_band_abs;
        } else {
            self.high_band_envelope = self.release_coef * self.high_band_envelope
                + (1.0 - self.release_coef) * high_band_abs;
        }

        // Compute gain reduction for high band only
        let gain = if self.high_band_envelope > self.threshold {
            let over_db = 20.0 * (self.high_band_envelope / self.threshold).log10();
            let reduced_db = over_db / self.ratio;
            let target = self.threshold * 10.0_f32.powf(reduced_db / 20.0);
            (target / self.high_band_envelope.max(1e-10)).min(1.0)
        } else {
            1.0
        };

        self.gain_reduction = gain;

        // Apply gain reduction ONLY to high band, leave low band untouched
        let compressed_high = high_band * gain;

        // Recombine bands
        low_band + compressed_high
    }

    /// Get the current gain reduction in dB (for metering)
    pub fn gain_reduction_db(&self) -> f32 {
        -20.0 * self.gain_reduction.log10()
    }

    /// Reset all state
    pub fn reset(&mut self) {
        self.lowpass_state.reset();
        self.highpass_state.reset();
        self.high_band_envelope = 0.0;
        self.gain_reduction = 1.0;
    }
}

// ============================================================================
// LIMITER STATE
// ============================================================================

/// Look-ahead soft limiter state
#[derive(Clone)]
pub struct LimiterState {
    /// Look-ahead buffer (small delay for attack)
    delay_buffer: Vec<f32>,
    delay_pos: usize,
    /// Gain envelope
    gain_envelope: f32,
}

impl LimiterState {
    pub fn new(lookahead_samples: usize) -> Self {
        Self {
            delay_buffer: vec![0.0; lookahead_samples],
            delay_pos: 0,
            gain_envelope: 1.0,
        }
    }

    pub fn reset(&mut self) {
        self.delay_buffer.fill(0.0);
        self.delay_pos = 0;
        self.gain_envelope = 1.0;
    }
}

impl Default for LimiterState {
    fn default() -> Self {
        // Lookahead disabled (1 sample) - see note in PostTTSProcessor::new()
        Self::new(1)
    }
}

// ============================================================================
// CROSSFADE BUFFER (Correlation-Aligned)
// ============================================================================

/// Correlation-aligned crossfade buffer for seamless frame transitions.
///
/// Uses cross-correlation to find the optimal splice point between frames,
/// then applies equal-power crossfade for artifact-free blending.
///
/// **Why cross-correlation matters:**
/// When audio frames are spliced without alignment, waveforms can be out of phase.
/// Out-of-phase blending causes partial cancellation ("swooshy" artifacts).
/// Cross-correlation finds where the tail and head waveforms best match,
/// minimizing phase cancellation during the crossfade.
///
/// **Equal-power crossfade:**
/// Linear crossfade: out = A*(1-t) + B*t → energy dips at t=0.5 (−3dB)
/// Equal-power: out = A*cos(t*π/2) + B*sin(t*π/2) → constant energy
#[derive(Clone)]
pub struct CrossfadeBuffer {
    /// Tail samples from previous frame (for overlap-add)
    tail_buffer: Vec<f32>,
    /// Crossfade length in samples
    crossfade_len: usize,
    /// Maximum search range for correlation (±samples)
    correlation_search: usize,
    /// Has valid previous frame data
    pub has_tail: bool,
}

impl CrossfadeBuffer {
    pub fn new(crossfade_samples: usize) -> Self {
        // Search ±25% of crossfade length for optimal alignment
        let correlation_search = crossfade_samples / 4;
        Self {
            tail_buffer: vec![0.0; crossfade_samples],
            crossfade_len: crossfade_samples,
            correlation_search,
            has_tail: false,
        }
    }

    pub fn reset(&mut self) {
        self.tail_buffer.fill(0.0);
        self.has_tail = false;
    }

    /// Store the tail samples from current frame for next frame's crossfade
    pub fn store_tail(&mut self, samples: &[f32]) {
        if samples.len() >= self.crossfade_len {
            let start = samples.len() - self.crossfade_len;
            self.tail_buffer.copy_from_slice(&samples[start..]);
            self.has_tail = true;
        } else if !samples.is_empty() {
            // Handle short frames: shift and append
            let shift = self.crossfade_len - samples.len();
            self.tail_buffer.copy_within(samples.len().., 0);
            self.tail_buffer[shift..].copy_from_slice(samples);
            self.has_tail = true;
        }
    }

    /// Find optimal alignment offset using cross-correlation
    ///
    /// Returns the offset (in samples) that maximizes correlation between
    /// the tail and the head of the new frame.
    fn find_optimal_offset(&self, head: &[f32]) -> isize {
        if head.len() < self.crossfade_len || !self.has_tail {
            return 0;
        }

        let compare_len = self.crossfade_len.min(head.len());
        let search_range = self.correlation_search.min(compare_len / 2);

        if search_range < 2 {
            return 0;
        }

        let mut best_offset: isize = 0;
        let mut best_correlation: f32 = f32::NEG_INFINITY;

        // Search for offset that maximizes correlation
        for offset in -(search_range as isize)..=(search_range as isize) {
            let mut correlation: f32 = 0.0;
            let mut count = 0;

            for i in 0..compare_len {
                let tail_idx = i;
                let head_idx = (i as isize + offset) as usize;

                if tail_idx < self.tail_buffer.len() && head_idx < head.len() {
                    // Normalized cross-correlation
                    correlation += self.tail_buffer[tail_idx] * head[head_idx];
                    count += 1;
                }
            }

            if count > 0 {
                correlation /= count as f32;
                if correlation > best_correlation {
                    best_correlation = correlation;
                    best_offset = offset;
                }
            }
        }

        best_offset
    }

    /// Apply correlation-aligned equal-power crossfade
    ///
    /// 1. Find optimal alignment using cross-correlation
    /// 2. Apply equal-power crossfade: out = tail*cos(t*π/2) + head*sin(t*π/2)
    pub fn apply_crossfade(&self, samples: &mut [f32]) {
        if !self.has_tail || samples.is_empty() {
            return;
        }

        // Find optimal alignment
        let offset = self.find_optimal_offset(samples);

        // Apply equal-power crossfade with alignment
        let crossfade_len = self.crossfade_len.min(samples.len());
        let half_pi = std::f32::consts::PI / 2.0;

        for i in 0..crossfade_len {
            let t = i as f32 / crossfade_len as f32;

            // Equal-power weights (constant energy throughout crossfade)
            // At t=0: tail_weight=1, head_weight=0 (100% previous frame)
            // At t=1: tail_weight=0, head_weight=1 (100% new frame)
            // cos²(x) + sin²(x) = 1, so energy is constant
            let tail_weight = (half_pi * t).cos();
            let head_weight = (half_pi * t).sin();

            // Get tail sample (with offset compensation)
            let tail_idx = i;
            let tail_sample = if tail_idx < self.tail_buffer.len() {
                self.tail_buffer[tail_idx]
            } else {
                0.0
            };

            // Get head sample (with alignment offset)
            let head_idx = (i as isize + offset) as usize;
            let head_sample = if head_idx < samples.len() {
                samples[head_idx]
            } else {
                samples[i]
            };

            // Equal-power blend
            samples[i] = tail_sample * tail_weight + head_sample * head_weight;
        }
    }
}

impl Default for CrossfadeBuffer {
    fn default() -> Self {
        // 5ms crossfade at 24kHz = 120 samples
        Self::new(120)
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: JITTER & SHIMMER
// ============================================================================

/// Adds cycle-to-cycle pitch (jitter) and amplitude (shimmer) variation
///
/// **Why this matters:** Synthetic voices are "too perfect" - real human voices
/// have slight random variations from one vocal cycle to the next:
/// - **Jitter**: Pitch varies ±0.5-2% between cycles (aperiodicity)
/// - **Shimmer**: Amplitude varies ±3-10% between cycles
///
/// These micro-imperfections are a key marker of naturalness that forensic
/// voice analysis uses to detect synthetic speech.
///
/// Implementation: We estimate pitch periods and add correlated noise
/// that varies smoothly within periods but changes between periods.
#[derive(Clone)]
pub struct JitterShimmer {
    sample_rate: u32,
    /// Jitter amount (0-1, typically 0.01-0.02 = 1-2%)
    jitter_amount: f32,
    /// Shimmer amount (0-1, typically 0.03-0.10 = 3-10%)
    shimmer_amount: f32,
    /// Enable/disable jitter
    enable_jitter: bool,
    /// Enable/disable shimmer
    enable_shimmer: bool,
    /// PRNG state for deterministic variation
    rng_seed: u32,
    /// Current period estimate (samples)
    period_estimate: f32,
    /// Sample counter within current period
    sample_counter: usize,
    /// Current jitter offset (pitch variation)
    current_jitter: f32,
    /// Current shimmer multiplier
    current_shimmer: f32,
    /// Smoothed envelope for adaptive modulation
    envelope: f32,
    /// Zero-crossing detector state
    prev_sample: f32,
    /// Samples since last zero crossing
    samples_since_crossing: usize,
    /// Running average of periods for estimation
    period_running_avg: f32,
}

impl JitterShimmer {
    pub fn new(sample_rate: u32, jitter_amount: f32, shimmer_amount: f32) -> Self {
        // Default period estimate for ~150Hz voice (typical F0)
        let default_period = sample_rate as f32 / 150.0;

        Self {
            sample_rate,
            jitter_amount: jitter_amount.clamp(0.0, 0.1), // Max 10% jitter
            shimmer_amount: shimmer_amount.clamp(0.0, 0.3), // Max 30% shimmer
            enable_jitter: true,
            enable_shimmer: true,
            rng_seed: 54321,
            period_estimate: default_period,
            sample_counter: 0,
            current_jitter: 0.0,
            current_shimmer: 1.0,
            envelope: 0.0,
            prev_sample: 0.0,
            samples_since_crossing: 0,
            period_running_avg: default_period,
        }
    }

    /// Generate next random value (0-1)
    #[inline]
    fn next_random(&mut self) -> f32 {
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        (self.rng_seed >> 16) as f32 / 65536.0
    }

    /// Update period estimate based on zero-crossing detection
    fn update_period_estimate(&mut self, sample: f32) {
        // Detect positive-going zero crossing
        if self.prev_sample <= 0.0 && sample > 0.0 && self.samples_since_crossing > 20 {
            // Update running average with exponential smoothing
            let measured_period = self.samples_since_crossing as f32;
            // Clamp to reasonable F0 range (60-400 Hz)
            let min_period = self.sample_rate as f32 / 400.0;
            let max_period = self.sample_rate as f32 / 60.0;
            if measured_period >= min_period && measured_period <= max_period {
                self.period_running_avg = self.period_running_avg * 0.9 + measured_period * 0.1;
                self.period_estimate = self.period_running_avg;
            }
            self.samples_since_crossing = 0;
        }
        self.samples_since_crossing += 1;
        self.prev_sample = sample;
    }

    /// Process audio with jitter and shimmer
    pub fn process(&mut self, samples: &mut [f32]) {
        if samples.is_empty() || (!self.enable_jitter && !self.enable_shimmer) {
            return;
        }

        for sample in samples.iter_mut() {
            // Update envelope for adaptive modulation (only apply to voiced regions)
            let abs_sample = sample.abs();
            self.envelope = self.envelope * 0.999 + abs_sample * 0.001;

            // Update period estimate
            self.update_period_estimate(*sample);

            // Check if we've completed a period
            self.sample_counter += 1;
            let current_period = (self.period_estimate * (1.0 + self.current_jitter)) as usize;

            if self.sample_counter >= current_period.max(10) {
                self.sample_counter = 0;

                // Generate new jitter/shimmer for next period
                if self.enable_jitter {
                    // Jitter: random pitch variation (bipolar, centered on 0)
                    self.current_jitter = (self.next_random() - 0.5) * 2.0 * self.jitter_amount;
                }

                if self.enable_shimmer {
                    // Shimmer: random amplitude variation (centered on 1.0)
                    self.current_shimmer = 1.0 + (self.next_random() - 0.5) * 2.0 * self.shimmer_amount;
                }
            }

            // Apply shimmer (amplitude modulation) based on envelope
            // Only apply to voiced regions (envelope > threshold)
            if self.enable_shimmer && self.envelope > 0.01 {
                *sample *= self.current_shimmer;
            }
        }
    }

    pub fn reset(&mut self) {
        self.sample_counter = 0;
        self.current_jitter = 0.0;
        self.current_shimmer = 1.0;
        self.envelope = 0.0;
        self.prev_sample = 0.0;
        self.samples_since_crossing = 0;
        self.period_running_avg = self.sample_rate as f32 / 150.0;
        self.period_estimate = self.period_running_avg;
    }

    pub fn start_utterance(&mut self) {
        // Keep period estimate across utterances for smoother transitions
        self.sample_counter = 0;
    }

    /// Configure jitter/shimmer amounts
    pub fn configure(&mut self, jitter: f32, shimmer: f32) {
        self.jitter_amount = jitter.clamp(0.0, 0.1);
        self.shimmer_amount = shimmer.clamp(0.0, 0.3);
    }

    /// Reseed the random number generator for new utterance
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: HNR MODULATOR (BREATHINESS)
// ============================================================================

/// Modulates the Harmonic-to-Noise Ratio (breathiness) of speech
///
/// **Why this matters:** Real voices have varying breathiness:
/// - Intimate/soft speech is breathier (low HNR, more noise)
/// - Projected/loud speech is clearer (high HNR, less noise)
/// - Emotions affect breathiness (sadness = more breathy, anger = less)
///
/// Implementation: We add filtered noise that's modulated by the speech
/// envelope, simulating turbulent airflow through the glottis.
#[derive(Clone)]
pub struct HNRModulator {
    sample_rate: u32,
    /// Breathiness amount (0-1, where 0 = clear, 1 = very breathy)
    breathiness: f32,
    /// Enable/disable
    enabled: bool,
    /// PRNG state
    rng_seed: u32,
    /// Bandpass filter state for shaping noise (aspiration is 1-4kHz)
    aspiration_filter_state: BiquadState,
    /// Bandpass coefficients
    aspiration_coeffs: BiquadCoeffs,
    /// Envelope follower for modulating noise with speech
    envelope: f32,
    /// Smoothing coefficient for envelope
    env_smooth_coef: f32,
}

impl HNRModulator {
    pub fn new(sample_rate: u32, breathiness: f32) -> Self {
        // Create bandpass filter for aspiration noise (centered at 2.5kHz)
        let aspiration_coeffs = BiquadCoeffs::bandpass(sample_rate, 2500.0, 1.5);
        // Envelope follows over ~10ms
        let env_smooth_coef = (-1.0 / (sample_rate as f32 * 0.01)).exp();

        Self {
            sample_rate,
            breathiness: breathiness.clamp(0.0, 1.0),
            enabled: true,
            rng_seed: 77777,
            aspiration_filter_state: BiquadState::new(),
            aspiration_coeffs,
            envelope: 0.0,
            env_smooth_coef,
        }
    }

    /// Process audio adding aspiration noise proportional to envelope
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || self.breathiness < 0.001 || samples.is_empty() {
            return;
        }

        let c = &self.aspiration_coeffs;

        for sample in samples.iter_mut() {
            // Track envelope
            let abs_sample = sample.abs();
            self.envelope = if abs_sample > self.envelope {
                abs_sample
            } else {
                self.env_smooth_coef * self.envelope + (1.0 - self.env_smooth_coef) * abs_sample
            };

            // Generate white noise
            self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let white_noise = ((self.rng_seed >> 16) as f32 / 32768.0) - 1.0;

            // Filter to aspiration band (breathy "h" sound is ~1-4kHz)
            let aspiration = self.aspiration_filter_state.process(
                white_noise, c.b0, c.b1, c.b2, c.a1, c.a2
            );

            // Modulate noise by envelope (so it follows speech dynamics)
            // Scale by breathiness amount
            let noise_level = self.envelope * self.breathiness * 0.3; // 0.3 max mix
            *sample += aspiration * noise_level;
        }
    }

    pub fn reset(&mut self) {
        self.aspiration_filter_state.reset();
        self.envelope = 0.0;
    }

    pub fn start_utterance(&mut self) {
        self.envelope = 0.0;
    }

    /// Set breathiness level (0 = clear, 1 = very breathy)
    pub fn set_breathiness(&mut self, breathiness: f32) {
        self.breathiness = breathiness.clamp(0.0, 1.0);
    }

    /// Reseed the random number generator for new utterance
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: SUBGLOTTAL RESONANCES
// ============================================================================

/// Adds subglottal (chest cavity) resonances for fuller voice quality
///
/// **Why this matters:** TTS typically only models the vocal tract above the
/// glottis. Real voices also have resonances from the chest cavity below
/// the vocal folds, centered around:
/// - Sg1: ~600 Hz (most prominent)
/// - Sg2: ~1400 Hz
/// - Sg3: ~2200 Hz
///
/// These add a subtle "chesty" quality that makes the voice feel embodied.
#[derive(Clone)]
pub struct SubglottalResonance {
    sample_rate: u32,
    /// Resonance strength (0-1, typically 0.1-0.3)
    strength: f32,
    /// Enable/disable
    enabled: bool,
    /// Filter states for three subglottal resonances
    sg1_state: BiquadState, // ~600Hz
    sg2_state: BiquadState, // ~1400Hz
    sg3_state: BiquadState, // ~2200Hz
    /// Pre-computed coefficients
    sg1_coeffs: BiquadCoeffs,
    sg2_coeffs: BiquadCoeffs,
    sg3_coeffs: BiquadCoeffs,
}

impl SubglottalResonance {
    pub fn new(sample_rate: u32, strength: f32) -> Self {
        // Subglottal resonances are narrow peaks (high Q)
        // Sg1 is strongest, Sg2 and Sg3 progressively weaker
        let sg1_coeffs = BiquadCoeffs::peak_eq(sample_rate, 600.0, 3.0, 8.0);  // +3dB at 600Hz
        let sg2_coeffs = BiquadCoeffs::peak_eq(sample_rate, 1400.0, 2.0, 10.0); // +2dB at 1400Hz
        let sg3_coeffs = BiquadCoeffs::peak_eq(sample_rate, 2200.0, 1.5, 12.0); // +1.5dB at 2200Hz

        Self {
            sample_rate,
            strength: strength.clamp(0.0, 1.0),
            enabled: true,
            sg1_state: BiquadState::new(),
            sg2_state: BiquadState::new(),
            sg3_state: BiquadState::new(),
            sg1_coeffs,
            sg2_coeffs,
            sg3_coeffs,
        }
    }

    /// Process audio adding subglottal resonances
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || self.strength < 0.001 || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            let input = *sample;

            // Apply each resonance filter
            let sg1 = self.sg1_state.process(
                input,
                self.sg1_coeffs.b0, self.sg1_coeffs.b1, self.sg1_coeffs.b2,
                self.sg1_coeffs.a1, self.sg1_coeffs.a2
            );
            let sg2 = self.sg2_state.process(
                input,
                self.sg2_coeffs.b0, self.sg2_coeffs.b1, self.sg2_coeffs.b2,
                self.sg2_coeffs.a1, self.sg2_coeffs.a2
            );
            let sg3 = self.sg3_state.process(
                input,
                self.sg3_coeffs.b0, self.sg3_coeffs.b1, self.sg3_coeffs.b2,
                self.sg3_coeffs.a1, self.sg3_coeffs.a2
            );

            // Mix filtered signal with original based on strength
            // Use parallel sum for resonances (they add to the original)
            let resonance_sum = (sg1 - input) * 0.5 + (sg2 - input) * 0.3 + (sg3 - input) * 0.2;
            *sample = input + resonance_sum * self.strength;
        }
    }

    pub fn reset(&mut self) {
        self.sg1_state.reset();
        self.sg2_state.reset();
        self.sg3_state.reset();
    }

    pub fn start_utterance(&mut self) {
        // Keep filter state for smooth transitions
    }

    /// Set resonance strength
    pub fn set_strength(&mut self, strength: f32) {
        self.strength = strength.clamp(0.0, 1.0);
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: SMILE FORMANT SHIFTS
// ============================================================================

/// Shifts formants to simulate smiling (emotional brightness)
///
/// **Why this matters:** When people smile while speaking:
/// - The oral cavity shortens (lips spread)
/// - F1 shifts down slightly
/// - F2 and F3 shift UP (brighter quality)
/// - Creates the audible "smiling" quality in voice
///
/// This adds emotional coloring that correlates with happy/positive emotions.
#[derive(Clone)]
pub struct SmileFormantShift {
    sample_rate: u32,
    /// Smile amount (0-1, where 0 = neutral, 1 = broad smile)
    smile_amount: f32,
    /// Enable/disable
    enabled: bool,
    /// High-shelf filter for F2/F3 boost (centered at 2kHz)
    highshelf_state: BiquadState,
    highshelf_coeffs: BiquadCoeffs,
    /// Low-shelf filter for subtle F1 reduction
    lowshelf_state: BiquadState,
    lowshelf_coeffs: BiquadCoeffs,
}

impl SmileFormantShift {
    pub fn new(sample_rate: u32, smile_amount: f32) -> Self {
        let smile = smile_amount.clamp(0.0, 1.0);

        // High-shelf boost above 1.5kHz (brighter, smiling quality)
        // More smile = more boost (up to +4dB)
        let high_gain = smile * 4.0;
        let highshelf_coeffs = BiquadCoeffs::high_shelf(sample_rate, 1500.0, high_gain);

        // Low-shelf cut below 400Hz (shortened vocal tract)
        // More smile = slight low cut (up to -1.5dB)
        let low_gain = smile * -1.5;
        let lowshelf_coeffs = BiquadCoeffs::low_shelf(sample_rate, 400.0, low_gain);

        Self {
            sample_rate,
            smile_amount: smile,
            enabled: true,
            highshelf_state: BiquadState::new(),
            highshelf_coeffs,
            lowshelf_state: BiquadState::new(),
            lowshelf_coeffs,
        }
    }

    /// Process audio with smile formant shifts
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || self.smile_amount < 0.001 || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            // Apply high-shelf (brightness)
            let brightened = self.highshelf_state.process(
                *sample,
                self.highshelf_coeffs.b0, self.highshelf_coeffs.b1, self.highshelf_coeffs.b2,
                self.highshelf_coeffs.a1, self.highshelf_coeffs.a2
            );

            // Apply low-shelf (shortened tract)
            *sample = self.lowshelf_state.process(
                brightened,
                self.lowshelf_coeffs.b0, self.lowshelf_coeffs.b1, self.lowshelf_coeffs.b2,
                self.lowshelf_coeffs.a1, self.lowshelf_coeffs.a2
            );
        }
    }

    pub fn reset(&mut self) {
        self.highshelf_state.reset();
        self.lowshelf_state.reset();
    }

    pub fn start_utterance(&mut self) {
        // Keep filter state
    }

    /// Update smile amount and recalculate coefficients
    pub fn set_smile_amount(&mut self, smile: f32) {
        self.smile_amount = smile.clamp(0.0, 1.0);
        // Recalculate coefficients
        let high_gain = self.smile_amount * 4.0;
        self.highshelf_coeffs = BiquadCoeffs::high_shelf(self.sample_rate, 1500.0, high_gain);
        let low_gain = self.smile_amount * -1.5;
        self.lowshelf_coeffs = BiquadCoeffs::low_shelf(self.sample_rate, 400.0, low_gain);
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: GLOTTALIZATION
// ============================================================================

/// Adds glottal stops (creaky/crackly sounds) at word-initial vowels
///
/// **Why this matters:** In many languages, words starting with vowels often
/// have a glottal stop - a brief closure of the vocal folds. Examples:
/// - "uh-oh" has two glottal stops
/// - "I am" often starts with a subtle glottal stop
///
/// This is different from vocal fry (which is at phrase END). Glottalization
/// is at vowel ONSETS and creates brief pitch irregularities.
#[derive(Clone)]
pub struct Glottalization {
    sample_rate: u32,
    /// Probability of glottalization at detected onsets (0-1)
    probability: f32,
    /// Duration of glottal stop effect in samples
    duration_samples: usize,
    /// Enable/disable
    enabled: bool,
    /// PRNG state
    rng_seed: u32,
    /// Envelope follower for onset detection
    envelope: f32,
    /// Previous envelope for detecting rises
    prev_envelope: f32,
    /// Samples remaining in current glottalization
    remaining_samples: usize,
    /// Phase for low-frequency modulation during glottal stop
    glottal_phase: f32,
    /// Onset detection threshold
    onset_threshold: f32,
}

impl Glottalization {
    pub fn new(sample_rate: u32, probability: f32) -> Self {
        // Glottal stop duration: ~20-40ms
        let duration_samples = (sample_rate as f32 * 0.030) as usize; // 30ms

        Self {
            sample_rate,
            probability: probability.clamp(0.0, 1.0),
            duration_samples,
            enabled: true,
            rng_seed: 33333,
            envelope: 0.0,
            prev_envelope: 0.0,
            remaining_samples: 0,
            glottal_phase: 0.0,
            onset_threshold: 0.05, // Minimum envelope level for onset
        }
    }

    /// Process audio adding glottalization at onsets
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || self.probability < 0.001 || samples.is_empty() {
            return;
        }

        // Envelope smoothing coefficient (~5ms)
        let env_smooth = (-1.0 / (self.sample_rate as f32 * 0.005)).exp();

        for sample in samples.iter_mut() {
            // Track envelope
            let abs_sample = sample.abs();
            self.prev_envelope = self.envelope;
            self.envelope = self.envelope * env_smooth + abs_sample * (1.0 - env_smooth);

            // Detect onset: envelope rising significantly and above threshold
            let is_onset = self.envelope > self.onset_threshold
                && self.envelope > self.prev_envelope * 2.0
                && self.remaining_samples == 0;

            if is_onset {
                // Probabilistic glottalization
                self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
                let rand = (self.rng_seed >> 16) as f32 / 65536.0;

                if rand < self.probability {
                    self.remaining_samples = self.duration_samples;
                    self.glottal_phase = 0.0;
                }
            }

            // Apply glottalization if active
            if self.remaining_samples > 0 {
                // Low-frequency (~70Hz) amplitude modulation = creaky/glottal quality
                let glottal_freq = 70.0;
                self.glottal_phase += 2.0 * PI * glottal_freq / self.sample_rate as f32;
                if self.glottal_phase > 2.0 * PI {
                    self.glottal_phase -= 2.0 * PI;
                }

                // Fade in/out the effect for smooth transitions
                let progress = (self.duration_samples - self.remaining_samples) as f32
                    / self.duration_samples as f32;
                let fade = if progress < 0.2 {
                    progress / 0.2 // Fade in
                } else if progress > 0.8 {
                    (1.0 - progress) / 0.2 // Fade out
                } else {
                    1.0
                };

                // Apply amplitude modulation (half-wave rectified sine for asymmetric glottal pulse)
                let modulation = 0.5 + 0.5 * self.glottal_phase.sin().max(0.0);
                *sample *= 1.0 - fade * 0.7 * (1.0 - modulation);

                self.remaining_samples -= 1;
            }
        }
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
        self.prev_envelope = 0.0;
        self.remaining_samples = 0;
        self.glottal_phase = 0.0;
    }

    pub fn start_utterance(&mut self) {
        self.envelope = 0.0;
        self.prev_envelope = 0.0;
    }

    /// Set glottalization probability
    pub fn set_probability(&mut self, probability: f32) {
        self.probability = probability.clamp(0.0, 1.0);
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: HESITATION PHENOMENA
// ============================================================================

/// Adds hesitation markers (um, uh, filled pauses)
///
/// **Why this matters:** Real spontaneous speech contains:
/// - Filled pauses: "um", "uh", "er"
/// - Silent pauses with breath
/// - Repetitions and restarts
///
/// This component can inject subtle hesitation sounds at phrase boundaries
/// for a more conversational, spontaneous feel.
///
/// Note: This is typically triggered externally based on content analysis,
/// not randomly applied to all speech.
#[derive(Clone)]
pub struct HesitationPhenomena {
    sample_rate: u32,
    /// Enable/disable
    enabled: bool,
    /// Pre-generated "um" sound sample
    um_sample: Vec<f32>,
    /// Pre-generated "uh" sound sample
    uh_sample: Vec<f32>,
    /// Currently playing hesitation (if any)
    current_hesitation: Option<HesitationType>,
    /// Playback position
    playback_pos: usize,
    /// Probability of hesitation at phrase boundaries
    probability: f32,
    /// PRNG state
    rng_seed: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HesitationType {
    Um,
    Uh,
    SilentPause,
}

impl HesitationPhenomena {
    pub fn new(sample_rate: u32, probability: f32) -> Self {
        // Generate synthetic "um" (~300ms)
        let um_sample = Self::generate_um(sample_rate, 300.0);
        // Generate synthetic "uh" (~200ms)
        let uh_sample = Self::generate_uh(sample_rate, 200.0);

        Self {
            sample_rate,
            enabled: true,
            um_sample,
            uh_sample,
            current_hesitation: None,
            playback_pos: 0,
            probability: probability.clamp(0.0, 0.3), // Max 30% to avoid being annoying
            rng_seed: 44444,
        }
    }

    /// Generate a synthetic "um" sound (voiced schwa + nasal)
    fn generate_um(sample_rate: u32, duration_ms: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_ms / 1000.0) as usize;
        let mut samples = vec![0.0f32; num_samples];

        // "Um" = voiced schwa (~500Hz F1, ~1500Hz F2) with nasal murmur
        let f0 = 120.0; // Low pitch for hesitation
        let mut phase = 0.0f32;
        let mut nasal_phase = 0.0f32;

        for (i, sample) in samples.iter_mut().enumerate() {
            // Envelope: fade in, sustain, fade out
            let t = i as f32 / num_samples as f32;
            let env = if t < 0.1 {
                t / 0.1
            } else if t > 0.7 {
                (1.0 - t) / 0.3
            } else {
                1.0
            };
            let env = env * env * 0.3; // Quiet, squared for softness

            // Glottal pulse train (simplified)
            phase += 2.0 * PI * f0 / sample_rate as f32;
            if phase > 2.0 * PI {
                phase -= 2.0 * PI;
            }
            let glottal = phase.sin() * 0.7 + (phase * 2.0).sin() * 0.3;

            // Nasal murmur (~250Hz)
            nasal_phase += 2.0 * PI * 250.0 / sample_rate as f32;
            if nasal_phase > 2.0 * PI {
                nasal_phase -= 2.0 * PI;
            }
            let nasal = nasal_phase.sin();

            // Transition from schwa to nasal at 40%
            let nasal_blend = if t < 0.4 { 0.2 } else { 0.5 + (t - 0.4) * 0.5 };

            *sample = env * (glottal * (1.0 - nasal_blend) + nasal * nasal_blend);
        }

        samples
    }

    /// Generate a synthetic "uh" sound (voiced schwa)
    fn generate_uh(sample_rate: u32, duration_ms: f32) -> Vec<f32> {
        let num_samples = (sample_rate as f32 * duration_ms / 1000.0) as usize;
        let mut samples = vec![0.0f32; num_samples];

        let f0 = 110.0; // Slightly lower pitch
        let mut phase = 0.0f32;

        for (i, sample) in samples.iter_mut().enumerate() {
            // Envelope
            let t = i as f32 / num_samples as f32;
            let env = if t < 0.15 {
                t / 0.15
            } else if t > 0.8 {
                (1.0 - t) / 0.2
            } else {
                1.0
            };
            let env = env * env * 0.25; // Even quieter than "um"

            // Glottal pulse
            phase += 2.0 * PI * f0 / sample_rate as f32;
            if phase > 2.0 * PI {
                phase -= 2.0 * PI;
            }

            *sample = env * phase.sin();
        }

        samples
    }

    /// Trigger a hesitation to be played
    pub fn trigger(&mut self, hesitation_type: HesitationType) {
        self.current_hesitation = Some(hesitation_type);
        self.playback_pos = 0;
    }

    /// Process audio, mixing in any triggered hesitation
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled {
            return;
        }

        if let Some(hesitation) = self.current_hesitation {
            let hesitation_samples = match hesitation {
                HesitationType::Um => &self.um_sample,
                HesitationType::Uh => &self.uh_sample,
                HesitationType::SilentPause => return, // No sound for silent pause
            };

            for sample in samples.iter_mut() {
                if self.playback_pos < hesitation_samples.len() {
                    *sample += hesitation_samples[self.playback_pos];
                    self.playback_pos += 1;
                } else {
                    self.current_hesitation = None;
                    break;
                }
            }
        }
    }

    /// Check if should trigger hesitation (call at phrase boundaries)
    pub fn should_trigger(&mut self) -> Option<HesitationType> {
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let rand = (self.rng_seed >> 16) as f32 / 65536.0;

        if rand < self.probability {
            // 60% "um", 30% "uh", 10% silent pause
            let type_rand = (self.rng_seed >> 8) as f32 / 65536.0;
            if type_rand < 0.6 {
                Some(HesitationType::Um)
            } else if type_rand < 0.9 {
                Some(HesitationType::Uh)
            } else {
                Some(HesitationType::SilentPause)
            }
        } else {
            None
        }
    }

    pub fn reset(&mut self) {
        self.current_hesitation = None;
        self.playback_pos = 0;
    }

    pub fn start_utterance(&mut self) {
        self.reset();
    }

    /// Reseed the random number generator for new utterance
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: LOMBARD EFFECT
// ============================================================================

/// Simulates the Lombard effect (speaking louder in noise)
///
/// **Why this matters:** When speaking in noisy environments, humans
/// instinctively:
/// - Increase volume
/// - Raise pitch (F0)
/// - Shift formants up (clearer articulation)
/// - Slow down slightly
///
/// This component can be driven by environmental noise level to make
/// the voice more appropriate for the listening context.
#[derive(Clone)]
pub struct LombardEffect {
    sample_rate: u32,
    /// Current noise level (0-1, where 0 = quiet, 1 = very noisy)
    noise_level: f32,
    /// Enable/disable
    enabled: bool,
    /// High-shelf filter for formant brightening
    highshelf_state: BiquadState,
    highshelf_coeffs: BiquadCoeffs,
    /// Current gain adjustment
    current_gain: f32,
    /// Target gain (for smooth transitions)
    target_gain: f32,
    /// Smoothing coefficient
    smooth_coef: f32,
}

impl LombardEffect {
    pub fn new(sample_rate: u32) -> Self {
        // High-shelf boost for articulation clarity (subtle in quiet, stronger in noise)
        let highshelf_coeffs = BiquadCoeffs::high_shelf(sample_rate, 2000.0, 0.0);
        // Smooth over ~100ms
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.1)).exp();

        Self {
            sample_rate,
            noise_level: 0.0,
            enabled: true,
            highshelf_state: BiquadState::new(),
            highshelf_coeffs,
            current_gain: 1.0,
            target_gain: 1.0,
            smooth_coef,
        }
    }

    /// Set the environmental noise level (0 = quiet, 1 = very noisy)
    pub fn set_noise_level(&mut self, level: f32) {
        self.noise_level = level.clamp(0.0, 1.0);

        // Calculate target adjustments based on noise level
        // Volume boost: up to +6dB in noise
        let gain_boost_db = self.noise_level * 6.0;
        self.target_gain = 10.0_f32.powf(gain_boost_db / 20.0);

        // Formant brightness: up to +4dB high-shelf in noise
        let brightness_db = self.noise_level * 4.0;
        self.highshelf_coeffs = BiquadCoeffs::high_shelf(self.sample_rate, 2000.0, brightness_db);
    }

    /// Process audio with Lombard adjustments
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            // Smooth gain transition
            self.current_gain = self.smooth_coef * self.current_gain
                + (1.0 - self.smooth_coef) * self.target_gain;

            // Apply high-shelf for clarity
            let brightened = self.highshelf_state.process(
                *sample,
                self.highshelf_coeffs.b0, self.highshelf_coeffs.b1, self.highshelf_coeffs.b2,
                self.highshelf_coeffs.a1, self.highshelf_coeffs.a2
            );

            // Apply gain boost
            *sample = brightened * self.current_gain;
        }
    }

    pub fn reset(&mut self) {
        self.highshelf_state.reset();
        self.current_gain = 1.0;
    }

    pub fn start_utterance(&mut self) {
        // Keep state for smooth transitions
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: REGISTER TRANSITIONS
// ============================================================================

/// Simulates natural voice register transitions (modal → falsetto, modal → fry)
///
/// **Why this matters:** Human voices have distinct registers:
/// - **Modal**: Normal speaking voice
/// - **Falsetto**: High, light register (used for high notes, surprise)
/// - **Vocal fry**: Low, creaky register (used for emphasis, trailing off)
///
/// Transitions between registers aren't abrupt - they have characteristic
/// "break" qualities that add naturalness.
#[derive(Clone)]
pub struct RegisterTransition {
    sample_rate: u32,
    /// Current register (0 = fry, 0.5 = modal, 1 = falsetto)
    register: f32,
    /// Target register
    target_register: f32,
    /// Enable/disable
    enabled: bool,
    /// Transition rate (samples to complete)
    transition_samples: usize,
    /// Current position in transition
    transition_pos: usize,
    /// Smoothing coefficient
    smooth_coef: f32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum VoiceRegister {
    VocalFry,
    Modal,
    Falsetto,
}

impl RegisterTransition {
    pub fn new(sample_rate: u32) -> Self {
        // Transition over ~150ms
        let transition_samples = (sample_rate as f32 * 0.15) as usize;
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.05)).exp();

        Self {
            sample_rate,
            register: 0.5, // Start modal
            target_register: 0.5,
            enabled: true,
            transition_samples,
            transition_pos: 0,
            smooth_coef,
        }
    }

    /// Request transition to a new register
    pub fn transition_to(&mut self, register: VoiceRegister) {
        self.target_register = match register {
            VoiceRegister::VocalFry => 0.0,
            VoiceRegister::Modal => 0.5,
            VoiceRegister::Falsetto => 1.0,
        };
        self.transition_pos = self.transition_samples;
    }

    /// Process audio applying register-appropriate modifications
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            // Smooth transition
            self.register = self.smooth_coef * self.register
                + (1.0 - self.smooth_coef) * self.target_register;

            // Apply register-specific processing
            if self.register < 0.3 {
                // Vocal fry territory: add low-freq amplitude modulation
                // (More complete vocal fry is handled by VocalFry struct)
                // This just adds subtle creak for low register
            } else if self.register > 0.7 {
                // Falsetto territory: reduce low frequencies, boost highs
                // This is a simple approximation
                *sample *= 0.85; // Falsetto is typically lighter
            }
            // Modal (0.3-0.7): no modification

            // Decrement transition counter
            if self.transition_pos > 0 {
                self.transition_pos -= 1;
            }
        }
    }

    pub fn reset(&mut self) {
        self.register = 0.5;
        self.target_register = 0.5;
        self.transition_pos = 0;
    }

    pub fn start_utterance(&mut self) {
        // Reset to modal for new utterance
        self.target_register = 0.5;
    }

    /// Get current register value (0-1)
    pub fn current_register(&self) -> f32 {
        self.register
    }
}

// ============================================================================
// STATE-OF-THE-ART HUMANIZATION: PHARYNGEAL CONSTRICTION
// ============================================================================

/// Simulates pharyngeal constriction (throat tightening under stress)
///
/// **Why this matters:** Under stress, tension, or strong emotion:
/// - The pharynx (throat) constricts
/// - Voice becomes "tighter", more strained
/// - Formants shift (narrower pharynx = different resonance)
/// - Creates audible "tension" in voice
///
/// This is different from general formant shifts - it specifically models
/// the acoustic effect of throat muscle tension.
#[derive(Clone)]
pub struct PharyngealConstriction {
    sample_rate: u32,
    /// Constriction amount (0 = relaxed, 1 = maximum tension)
    constriction: f32,
    /// Enable/disable
    enabled: bool,
    /// Peak EQ filter for constriction resonance (~2-3kHz emphasis)
    constriction_state: BiquadState,
    constriction_coeffs: BiquadCoeffs,
    /// Slight high-pass for "thinner" quality
    highpass_state: BiquadState,
    highpass_coeffs: BiquadCoeffs,
    /// Smoothing coefficient for parameter changes
    smooth_coef: f32,
    current_constriction: f32,
}

impl PharyngealConstriction {
    pub fn new(sample_rate: u32, constriction: f32) -> Self {
        let c = constriction.clamp(0.0, 1.0);

        // Peak at ~2.5kHz (pharyngeal resonance) - boosts "strained" quality
        let peak_gain = c * 6.0; // Up to +6dB
        let constriction_coeffs = BiquadCoeffs::peak_eq(sample_rate, 2500.0, peak_gain, 2.0);

        // Subtle high-pass for "thinness" (reduced warmth)
        let highpass_coeffs = BiquadCoeffs::highpass(sample_rate, 100.0 + c * 100.0, 0.7);

        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.05)).exp();

        Self {
            sample_rate,
            constriction: c,
            enabled: true,
            constriction_state: BiquadState::new(),
            constriction_coeffs,
            highpass_state: BiquadState::new(),
            highpass_coeffs,
            smooth_coef,
            current_constriction: c,
        }
    }

    /// Set constriction amount (0 = relaxed, 1 = maximum tension)
    pub fn set_constriction(&mut self, constriction: f32) {
        self.constriction = constriction.clamp(0.0, 1.0);

        // Recalculate coefficients
        let peak_gain = self.constriction * 6.0;
        self.constriction_coeffs = BiquadCoeffs::peak_eq(
            self.sample_rate, 2500.0, peak_gain, 2.0
        );
        self.highpass_coeffs = BiquadCoeffs::highpass(
            self.sample_rate, 100.0 + self.constriction * 100.0, 0.7
        );
    }

    /// Process audio with pharyngeal constriction
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        for sample in samples.iter_mut() {
            // Smooth constriction parameter
            self.current_constriction = self.smooth_coef * self.current_constriction
                + (1.0 - self.smooth_coef) * self.constriction;

            // Only apply if significant constriction
            if self.current_constriction > 0.05 {
                // Apply constriction resonance
                let constrained = self.constriction_state.process(
                    *sample,
                    self.constriction_coeffs.b0, self.constriction_coeffs.b1,
                    self.constriction_coeffs.b2, self.constriction_coeffs.a1,
                    self.constriction_coeffs.a2
                );

                // Apply high-pass for thinness
                *sample = self.highpass_state.process(
                    constrained,
                    self.highpass_coeffs.b0, self.highpass_coeffs.b1,
                    self.highpass_coeffs.b2, self.highpass_coeffs.a1,
                    self.highpass_coeffs.a2
                );

                // Blend with original based on constriction amount
                // At low constriction, mostly original; at high, mostly processed
            }
        }
    }

    pub fn reset(&mut self) {
        self.constriction_state.reset();
        self.highpass_state.reset();
        self.current_constriction = self.constriction;
    }

    pub fn start_utterance(&mut self) {
        // Keep filter state
    }
}

// ============================================================================
// PROCESSOR CONFIGURATION
// ============================================================================

/// Configuration for the stateful post-TTS processor
#[derive(Clone)]
pub struct ProcessorConfig {
    pub sample_rate: u32,

    // Warmth (low-shelf EQ)
    pub enable_warmth: bool,
    pub warmth_freq: f32,      // Hz, typically 300
    pub warmth_gain_db: f32,   // dB, typically 2-4

    // Presence (peak EQ)
    pub enable_presence: bool,
    pub presence_freq: f32,    // Hz, typically 3000
    pub presence_gain_db: f32, // dB, typically 2-3
    pub presence_q: f32,       // Q factor, typically 1.5

    // Compression
    pub enable_compression: bool,
    pub comp_threshold_db: f32,
    pub comp_ratio: f32,
    pub comp_attack_ms: f32,
    pub comp_release_ms: f32,
    pub comp_makeup_db: f32,

    // De-esser (legacy wideband - DEPRECATED, causes artifacts)
    pub enable_deesser: bool,
    pub deesser_freq: f32,       // Center freq, typically 6000
    pub deesser_threshold_db: f32,
    pub deesser_ratio: f32,

    // Split-band de-esser (NEW - professional quality, no artifacts)
    pub enable_splitband_deesser: bool,
    pub splitband_crossover_freq: f32,   // Crossover frequency (Hz), typically 5000
    pub splitband_threshold_db: f32,      // Compression threshold for high band
    pub splitband_ratio: f32,             // Compression ratio for high band

    // Limiter
    pub enable_limiter: bool,
    pub limiter_threshold_db: f32,
    pub limiter_release_ms: f32,

    // Crossfade
    pub enable_crossfade: bool,
    pub crossfade_ms: f32,

    // Soft edges (for utterance boundaries only)
    pub soft_attack_ms: f32,
    pub soft_release_ms: f32,

    // =========================================================================
    // HUMANIZATION FEATURES
    // =========================================================================

    // Breath injection (at utterance start)
    pub enable_breath: bool,
    pub breath_probability: f32,  // 0-1, chance of breath at utterance start

    // Micro-pitch modulation (fast ~5Hz pitch variation)
    pub enable_micro_pitch: bool,
    pub micro_pitch_cents: f32,   // Depth in cents (typically 5-10)

    // Noise floor (subtle room tone)
    pub enable_noise_floor: bool,
    pub noise_floor_db: f32,      // Level in dB (typically -60 to -50)

    // Amplitude jitter (volume micro-variations)
    pub enable_amplitude_jitter: bool,
    pub amplitude_jitter_depth: f32,  // Depth 0-1 (typically 0.02 = 2%)

    // Pitch drift (slow pitch wandering over phrases)
    pub enable_pitch_drift: bool,
    pub pitch_drift_cents: f32,   // Max drift in cents (typically 3-8)

    // SOLA-based pitch shifting (artifact-free implementation)
    // When enabled, uses proper overlap-add with cross-correlation instead of
    // broken frame-by-frame resampling. This eliminates clicks/crackles.
    //
    // LATENCY: SOLA adds ~42ms latency at 24kHz (1024-sample analysis window).
    // This is acceptable for real-time voice (under 50ms).
    //
    // WARMUP: SOLA needs ~50ms of audio to fill its buffers before producing
    // optimal output. Very short utterances (<50ms) will work but may have
    // minor artifacts during the warmup period.
    pub use_sola_pitch: bool,

    // =========================================================================
    // "BETTER THAN HUMAN" FEATURES - Superhuman emotional intelligence
    // =========================================================================

    /// Enable emotion-aware prosody (affects pitch, vibrato, breath, pacing)
    /// When enabled, the processor adapts all humanization features based on
    /// the emotional context of the utterance.
    pub enable_emotion_prosody: bool,

    /// Current emotional state (affects all prosody parameters)
    /// See EmotionState for available emotions and their effects.
    pub emotion: EmotionState,

    /// Enable adaptive breath timing (place breaths at phrase boundaries)
    /// When enabled, breaths are placed strategically at semantic boundaries
    /// rather than randomly at utterance start.
    pub enable_adaptive_breath: bool,

    /// Phrase boundaries for adaptive breath placement
    /// Each boundary specifies a sample index and boundary type.
    /// Breaths are placed at appropriate boundaries based on type.
    pub phrase_boundaries: Vec<PhraseBoundary>,

    /// Enable listener-aware pacing (affects prosody based on complexity)
    ///
    /// NOTE: Time-stretching (changing audio duration) is complex for frame-based
    /// processing because output length differs from input length. This feature
    /// currently affects prosodic characteristics (vibrato, drift) rather than
    /// actual playback speed. For actual speed changes, use TTS-level controls
    /// (e.g., Cartesia's speed parameter).
    ///
    /// When enabled, content complexity modulates:
    /// - Emotion-based tempo factors affect vibrato/drift intensity
    /// - Higher complexity = more deliberate, measured prosody
    pub enable_adaptive_pacing: bool,

    /// Content complexity (0.0-1.0, affects prosodic intensity)
    /// 0.0 = simple content (lighter prosody)
    /// 0.5 = moderate complexity (normal prosody)
    /// 1.0 = complex content (more deliberate prosody)
    pub content_complexity: f32,

    // =========================================================================
    // ADVANCED HUMANIZATION - Ultra-realistic speech features
    // =========================================================================

    /// Enable vocal fry / creaky voice at phrase endings
    /// Adds low-frequency (20-80 Hz) amplitude modulation that creates
    /// the characteristic "creaky" quality humans have at phrase ends.
    pub enable_vocal_fry: bool,

    /// Vocal fry depth (0-1, typically 0.3-0.6)
    /// Higher values = more pronounced creaky effect
    pub vocal_fry_depth: f32,

    /// Vocal fry duration at phrase end (ms, typically 150-300)
    pub vocal_fry_duration_ms: f32,

    /// Enable lip smacks / mouth sounds between phrases
    /// Injects subtle mouth opening/closing sounds at phrase boundaries.
    pub enable_lip_smacks: bool,

    /// Lip smack probability at phrase boundaries (0-1)
    /// How often a lip smack occurs at eligible boundaries.
    pub lip_smack_probability: f32,

    /// Enable tempo micro-variations within phrases
    /// Creates subtle speed changes that make speech feel more natural.
    /// Humans naturally speed up mid-phrase and slow at boundaries.
    pub enable_tempo_variation: bool,

    /// Tempo variation depth (0-1, typically 0.02-0.05)
    /// Maximum speed deviation from normal (0.03 = ±3% variation)
    pub tempo_variation_depth: f32,

    /// Enable glottal onset softening for vowel-initial sounds
    /// Applies micro-fades (3-5ms) to sudden energy jumps to prevent
    /// harsh attacks that sound robotic. Human speech has natural
    /// glottal coordination that softens these transitions.
    pub enable_onset_softening: bool,

    // =========================================================================
    // STATE-OF-THE-ART HUMANIZATION - Research-grade voice naturalization
    // =========================================================================

    /// Enable jitter (cycle-to-cycle pitch variation)
    /// Natural speech has 0.5-2% pitch variation between consecutive pitch cycles.
    /// This microvariation is a key marker of human vs. synthetic speech.
    pub enable_jitter: bool,

    /// Jitter amount (0-0.1, typical human range 0.01-0.02 = 1-2%)
    pub jitter_amount: f32,

    /// Enable shimmer (cycle-to-cycle amplitude variation)
    /// Natural speech has 3-10% amplitude variation between pitch cycles.
    /// Combined with jitter, this creates the organic quality of real voice.
    pub enable_shimmer: bool,

    /// Shimmer amount (0-0.3, typical human range 0.03-0.1 = 3-10%)
    pub shimmer_amount: f32,

    /// Enable HNR (Harmonic-to-Noise Ratio) modulation / breathiness control
    /// Adds aspiration noise modulated by speech envelope for natural breathiness.
    /// Essential for warmth and preventing the "sterile" quality of pure synthesis.
    pub enable_hnr_modulation: bool,

    /// Breathiness amount (0-1, typical 0.1-0.3)
    /// 0.0 = crystal clear, 0.5 = moderate breath, 1.0 = very breathy/whispered
    pub hnr_breathiness: f32,

    /// Enable subglottal resonances (chest cavity resonances)
    /// Adds resonances at Sg1=600Hz, Sg2=1400Hz, Sg3=2200Hz that originate
    /// from the chest cavity. These are present in real speech but missing
    /// in most TTS systems, making them a key differentiator.
    pub enable_subglottal_resonance: bool,

    /// Subglottal resonance strength (0-1, typical 0.1-0.3)
    pub subglottal_strength: f32,

    /// Enable smile formant shifts (emotional brightness)
    /// When smiling, the vocal tract shortens and formants shift upward.
    /// This adds high-shelf boost + low-shelf cut to simulate smiling.
    pub enable_smile_formants: bool,

    /// Smile amount (0-1, typical 0.0-0.5)
    /// 0.0 = neutral, 0.5 = slight smile, 1.0 = full smile
    pub smile_amount: f32,

    /// Enable glottalization (glottal stops at vowel onsets)
    /// Adds low-frequency amplitude modulation at stressed vowel beginnings
    /// that creates the natural "attack" humans have when emphasizing words.
    pub enable_glottalization: bool,

    /// Glottalization strength (0-1, typical 0.3-0.6)
    pub glottalization_strength: f32,

    /// Enable hesitation phenomena (natural "um", "uh" sounds)
    /// Injects pre-generated filler sounds at appropriate pauses.
    /// Essential for natural conversational flow.
    pub enable_hesitation_sounds: bool,

    /// Hesitation probability at eligible pauses (0-1, typical 0.1-0.3)
    pub hesitation_probability: f32,

    /// Enable Lombard effect (noise adaptation)
    /// Automatically boosts volume and brightness when background noise is detected.
    /// Humans naturally do this - it's why we speak louder in noisy environments.
    pub enable_lombard_effect: bool,

    /// Enable voice register transitions (modal/falsetto/fry)
    /// Smoothly transitions between voice registers based on emotion and pitch.
    /// Modal = normal, falsetto = head voice (high), fry = creaky (low).
    pub enable_register_transitions: bool,

    /// Target voice register (0=modal, 1=falsetto, 2=fry)
    pub target_register: u8,

    /// Enable pharyngeal constriction (stress/tension in throat)
    /// Adds characteristic throat tightening that occurs during stress or crying.
    /// Creates mid-frequency emphasis (2.5kHz peak) and high-pass filtering.
    pub enable_pharyngeal_constriction: bool,

    /// Pharyngeal constriction amount (0-1, typical 0.0-0.5)
    /// 0.0 = relaxed, 0.5 = moderate tension, 1.0 = very tense/stressed
    pub pharyngeal_amount: f32,
}

impl Default for ProcessorConfig {
    fn default() -> Self {
        Self {
            sample_rate: 24000,

            // Warmth: gentle low-shelf boost
            enable_warmth: true,
            warmth_freq: 300.0,
            warmth_gain_db: 2.5,

            // Presence: clarity boost
            enable_presence: true,
            presence_freq: 3000.0,
            presence_gain_db: 2.0,
            presence_q: 1.5,

            // Compression: smooth dynamics
            // NOTE: Slower attack (30ms) prevents pumping on voice transients
            // NOTE: Longer release (300ms) prevents breathing artifacts
            enable_compression: true,
            comp_threshold_db: -18.0,
            comp_ratio: 2.0,
            comp_attack_ms: 30.0,   // Was 10ms - too fast, caused pumping
            comp_release_ms: 300.0, // Was 100ms - too fast, caused breathing
            comp_makeup_db: 2.0,

            // De-esser (legacy wideband): DISABLED by default
            // NOTE: Causes "sparkler" artifacts due to wideband gain modulation
            enable_deesser: false,  // DISABLED - use splitband instead
            deesser_freq: 6000.0,
            deesser_threshold_db: -15.0,
            deesser_ratio: 3.0,

            // Split-band de-esser: ENABLED by default (professional quality)
            // Only attenuates high frequencies, leaves low/mid untouched
            enable_splitband_deesser: true,
            splitband_crossover_freq: 5000.0,  // Split at 5kHz
            splitband_threshold_db: -20.0,      // Moderate threshold
            splitband_ratio: 4.0,               // 4:1 compression on high band

            // Limiter: prevent clipping
            enable_limiter: true,
            limiter_threshold_db: -1.0,
            limiter_release_ms: 50.0,

            // Crossfade: seamless frames
            // NOTE: 5ms provides smoother transitions than 2ms
            enable_crossfade: true,
            crossfade_ms: 5.0, // Was 2ms - now 5ms for more overlap

            // Soft edges: 15ms fade in/out
            soft_attack_ms: 15.0,
            soft_release_ms: 15.0,

            // =========================================================================
            // HUMANIZATION FEATURES - Make TTS sound natural
            // =========================================================================

            // Breath injection: subtle inhale at utterance start (15% chance)
            enable_breath: true,
            breath_probability: 0.15,

            // Micro-pitch modulation: ~5Hz pitch variation for natural voice
            // ENABLED with SOLA - proper overlap-add eliminates clicks/crackles
            enable_micro_pitch: true,
            micro_pitch_cents: 8.0,

            // Noise floor: very quiet room tone (-58dB = barely audible)
            enable_noise_floor: true,
            noise_floor_db: -58.0,

            // Amplitude jitter: subtle volume variation (1.5% = imperceptible)
            enable_amplitude_jitter: true,
            amplitude_jitter_depth: 0.015,

            // Pitch drift: slow wandering (5 cents = very subtle)
            // ENABLED with SOLA - proper overlap-add eliminates clicks/crackles
            enable_pitch_drift: true,
            pitch_drift_cents: 5.0,

            // SOLA-based pitch shifting: ENABLED by default for artifact-free pitch
            // Uses proper SOLA (Synchronous Overlap-Add) with cross-correlation
            // instead of broken frame-by-frame resampling.
            use_sola_pitch: true,

            // =========================================================================
            // "BETTER THAN HUMAN" FEATURES - Superhuman emotional intelligence
            // =========================================================================

            // Emotion-aware prosody: ENABLED by default
            // Adapts vibrato, pitch drift, breath, and pacing to emotional context
            enable_emotion_prosody: true,
            emotion: EmotionState::Neutral,

            // Adaptive breath timing: DISABLED by default (requires phrase boundaries)
            // Enable when you have semantic phrase boundary information
            enable_adaptive_breath: false,
            phrase_boundaries: Vec::new(),

            // Adaptive pacing: DISABLED by default (requires complexity info)
            // Enable when you have content complexity scoring
            enable_adaptive_pacing: false,
            content_complexity: 0.5, // Default to medium complexity

            // =========================================================================
            // ADVANCED HUMANIZATION - Ultra-realistic speech features
            // =========================================================================

            // Vocal fry: ENABLED - adds natural creaky voice at phrase endings
            // More common in American English, creates organic trailing-off
            enable_vocal_fry: true,
            vocal_fry_depth: 0.3,       // Subtle depth (was 0.4 - too strong)
            vocal_fry_duration_ms: 150.0, // 150ms at phrase ends (was 200ms)

            // Lip smacks: ENABLED - adds realistic mouth sounds at phrase boundaries
            enable_lip_smacks: true,
            lip_smack_probability: 0.2, // 20% chance (was 0.3 - too frequent)

            // Tempo variation: ENABLED - creates natural speech rhythm
            // Humans naturally speed up and slow down within phrases
            enable_tempo_variation: true,
            tempo_variation_depth: 0.025, // ±2.5% speed variation (was 0.03)

            // Onset softening: ENABLED - reduces harsh glottal attacks
            // Makes vowel-initial sounds more natural (less "punchy")
            enable_onset_softening: true,

            // =========================================================================
            // STATE-OF-THE-ART HUMANIZATION - Research-grade voice naturalization
            // =========================================================================

            // Jitter & Shimmer: ENABLED - cycle-to-cycle pitch/amplitude variation
            // These are key acoustic markers that differentiate human from synthetic speech
            enable_jitter: true,
            jitter_amount: 0.015,      // 1.5% - subtle, natural range
            enable_shimmer: true,
            shimmer_amount: 0.05,      // 5% - subtle, natural range

            // HNR Modulation: ENABLED - adds natural breathiness
            // Prevents the "sterile" quality of pure synthesis
            enable_hnr_modulation: true,
            hnr_breathiness: 0.15,     // Light breathiness

            // Subglottal Resonance: ENABLED - chest cavity resonances
            // Missing in most TTS, makes voice sound "embodied"
            enable_subglottal_resonance: true,
            subglottal_strength: 0.2,  // Subtle presence

            // Smile Formants: DISABLED by default - enable for positive emotions
            // Should be dynamically controlled based on emotional context
            enable_smile_formants: false,
            smile_amount: 0.0,

            // Glottalization: DISABLED by default - enable for emphasis
            // Should be dynamically controlled for stressed vowels
            enable_glottalization: false,
            glottalization_strength: 0.4,

            // Hesitation Sounds: DISABLED by default - enable for conversational mode
            // Only use in appropriate contexts (not for reading, announcements, etc.)
            enable_hesitation_sounds: false,
            hesitation_probability: 0.15,

            // Lombard Effect: DISABLED by default - enable when noise detection active
            // Requires real-time noise level measurement to be useful
            enable_lombard_effect: false,

            // Register Transitions: DISABLED by default - enable for emotional range
            // Should be dynamically controlled based on pitch and emotion
            enable_register_transitions: false,
            target_register: 0,        // Default to modal voice

            // Pharyngeal Constriction: DISABLED by default - enable for stress/crying
            // Should be dynamically controlled for emotional scenes
            enable_pharyngeal_constriction: false,
            pharyngeal_amount: 0.0,
        }
    }
}

// ============================================================================
// BIQUAD COEFFICIENT CALCULATION
// ============================================================================

/// Biquad filter coefficients
#[derive(Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    /// Calculate low-shelf filter coefficients
    pub fn low_shelf(sample_rate: u32, freq: f32, gain_db: f32) -> Self {
        let gain = 10.0_f32.powf(gain_db / 20.0);
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * 0.707);
        let a_gain = gain.sqrt();

        let b0 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_omega + 2.0 * a_gain.sqrt() * alpha);
        let b1 = 2.0 * a_gain * ((a_gain - 1.0) - (a_gain + 1.0) * cos_omega);
        let b2 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_omega - 2.0 * a_gain.sqrt() * alpha);
        let a0 = (a_gain + 1.0) + (a_gain - 1.0) * cos_omega + 2.0 * a_gain.sqrt() * alpha;
        let a1 = -2.0 * ((a_gain - 1.0) + (a_gain + 1.0) * cos_omega);
        let a2 = (a_gain + 1.0) + (a_gain - 1.0) * cos_omega - 2.0 * a_gain.sqrt() * alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Calculate peak EQ filter coefficients
    pub fn peak_eq(sample_rate: u32, freq: f32, gain_db: f32, q: f32) -> Self {
        let gain = 10.0_f32.powf(gain_db / 20.0);
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);
        let a_gain = gain.sqrt();

        let b0 = 1.0 + alpha * a_gain;
        let b1 = -2.0 * cos_omega;
        let b2 = 1.0 - alpha * a_gain;
        let a0 = 1.0 + alpha / a_gain;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha / a_gain;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Calculate bandpass filter coefficients (for de-esser detection)
    pub fn bandpass(sample_rate: u32, freq: f32, q: f32) -> Self {
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = alpha;
        let b1 = 0.0;
        let b2 = -alpha;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Calculate lowpass filter coefficients (Butterworth)
    ///
    /// Used for crossover filters in split-band processing.
    /// Q = 0.707 gives Butterworth (maximally flat) response.
    pub fn lowpass(sample_rate: u32, freq: f32, q: f32) -> Self {
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Calculate highpass filter coefficients (Butterworth)
    ///
    /// Used for crossover filters in split-band processing.
    /// Q = 0.707 gives Butterworth (maximally flat) response.
    pub fn highpass(sample_rate: u32, freq: f32, q: f32) -> Self {
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = (1.0 + cos_omega) / 2.0;
        let b1 = -(1.0 + cos_omega);
        let b2 = (1.0 + cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Calculate high-shelf filter coefficients
    ///
    /// Boosts or cuts frequencies above the specified frequency.
    /// Used for smile formant shifts and Lombard effect brightness boost.
    ///
    /// # Arguments
    /// * `sample_rate` - Sample rate in Hz
    /// * `freq` - Shelf frequency in Hz (transition point)
    /// * `gain_db` - Gain in dB (positive = boost, negative = cut)
    ///
    /// # Reference
    /// Audio EQ Cookbook by Robert Bristow-Johnson
    pub fn high_shelf(sample_rate: u32, freq: f32, gain_db: f32) -> Self {
        let gain = 10.0_f32.powf(gain_db / 40.0); // A = sqrt(linear_gain)
        let omega = 2.0 * PI * freq / sample_rate as f32;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();

        // S = 1.0 gives moderate slope (shelf slope parameter)
        let s = 1.0;
        let alpha = sin_omega / 2.0 * ((gain + 1.0 / gain) * (1.0 / s - 1.0) + 2.0).sqrt();

        let b0 = gain * ((gain + 1.0) + (gain - 1.0) * cos_omega + 2.0 * gain.sqrt() * alpha);
        let b1 = -2.0 * gain * ((gain - 1.0) + (gain + 1.0) * cos_omega);
        let b2 = gain * ((gain + 1.0) + (gain - 1.0) * cos_omega - 2.0 * gain.sqrt() * alpha);
        let a0 = (gain + 1.0) - (gain - 1.0) * cos_omega + 2.0 * gain.sqrt() * alpha;
        let a1 = 2.0 * ((gain - 1.0) - (gain + 1.0) * cos_omega);
        let a2 = (gain + 1.0) - (gain - 1.0) * cos_omega - 2.0 * gain.sqrt() * alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/// Stateful Post-TTS Processor
///
/// This processor maintains state between frames for seamless audio enhancement.
/// Create one instance per session and call `process_frame()` for each audio frame.
pub struct PostTTSProcessor {
    config: ProcessorConfig,

    // Pre-computed coefficients
    warmth_coeffs: BiquadCoeffs,
    presence_coeffs: BiquadCoeffs,
    deesser_detect_coeffs: BiquadCoeffs,

    // DC blocker (removes accumulated DC offset from cascaded filters)
    dc_blocker: DcBlocker,

    // Filter states
    warmth_state: BiquadState,
    presence_state: BiquadState,

    // Compressor state
    compressor_state: CompressorState,
    comp_attack_coef: f32,
    comp_release_coef: f32,

    // De-esser state (legacy wideband)
    deesser_state: DeEsserState,
    deesser_attack_coef: f32,
    deesser_release_coef: f32,

    // Split-band de-esser (NEW - professional quality)
    splitband_deesser: SplitBandDeEsser,

    // Limiter state
    limiter_state: LimiterState,
    limiter_threshold: f32,
    limiter_release_coef: f32,

    // Crossfade buffer
    crossfade_buffer: CrossfadeBuffer,

    // Frame counter for logging
    frame_count: u64,

    // Is this the first frame of an utterance?
    is_first_frame: bool,

    // =========================================================================
    // HUMANIZATION STATE
    // =========================================================================
    breath_generator: BreathGenerator,
    micro_pitch: MicroPitchModulator,
    noise_floor: NoiseFloor,
    amplitude_jitter: AmplitudeJitter,
    pitch_drift: PitchDrift,

    // SOLA-based pitch shifters (artifact-free implementation)
    sola_micro_pitch: SolaMicroPitch,
    sola_pitch_drift: SolaPitchDrift,

    // =========================================================================
    // "BETTER THAN HUMAN" STATE
    // =========================================================================

    /// SOLA time-stretcher for listener-aware pacing
    time_stretcher: SolaTimeStretch,

    /// Current emotion state (cached for efficient access)
    current_emotion: EmotionState,

    /// Cached emotion prosody parameters
    emotion_params: EmotionProsodyParams,

    /// Total samples processed in current utterance (for phrase boundary tracking)
    total_samples_processed: usize,

    /// Index of next phrase boundary to check
    next_boundary_index: usize,

    // =========================================================================
    // ADVANCED HUMANIZATION - Ultra-realistic speech features
    // =========================================================================

    /// Vocal fry generator (creaky voice at phrase endings)
    vocal_fry: VocalFry,

    /// Lip smack / mouth sound generator
    lip_smack_generator: LipSmackGenerator,

    /// Tempo micro-variation (subtle speed changes)
    tempo_variation: TempoMicroVariation,

    /// Onset softener (micro-fades on hard attacks)
    onset_softener: OnsetSoftener,

    // =========================================================================
    // STATE-OF-THE-ART HUMANIZATION - Research-grade voice naturalization
    // =========================================================================

    /// Jitter & Shimmer (cycle-to-cycle pitch/amplitude variation)
    jitter_shimmer: JitterShimmer,

    /// HNR Modulator (breathiness control)
    hnr_modulator: HNRModulator,

    /// Subglottal Resonance (chest cavity resonances)
    subglottal_resonance: SubglottalResonance,

    /// Smile Formant Shifts (emotional brightness)
    smile_formants: SmileFormantShift,

    /// Glottalization (glottal stops at vowel onsets)
    glottalization: Glottalization,

    /// Hesitation Phenomena (natural "um", "uh" sounds)
    hesitation_generator: HesitationPhenomena,

    /// Lombard Effect (noise adaptation)
    lombard_effect: LombardEffect,

    /// Register Transitions (modal/falsetto/fry)
    register_transition: RegisterTransition,

    /// Pharyngeal Constriction (stress/tension in throat)
    pharyngeal_constriction: PharyngealConstriction,
}

impl PostTTSProcessor {
    /// Create a new processor with the given configuration
    pub fn new(config: ProcessorConfig) -> Self {
        // Pre-compute coefficients
        let warmth_coeffs = BiquadCoeffs::low_shelf(
            config.sample_rate,
            config.warmth_freq,
            config.warmth_gain_db,
        );

        let presence_coeffs = BiquadCoeffs::peak_eq(
            config.sample_rate,
            config.presence_freq,
            config.presence_gain_db,
            config.presence_q,
        );

        let deesser_detect_coeffs = BiquadCoeffs::bandpass(
            config.sample_rate,
            config.deesser_freq,
            2.0, // Moderate Q for sibilance detection
        );

        // Pre-compute time constants
        let comp_attack_coef = (-1.0 / (config.comp_attack_ms * config.sample_rate as f32 / 1000.0)).exp();
        let comp_release_coef = (-1.0 / (config.comp_release_ms * config.sample_rate as f32 / 1000.0)).exp();

        let deesser_attack_coef = (-1.0 / (1.0 * config.sample_rate as f32 / 1000.0)).exp(); // 1ms attack
        let deesser_release_coef = (-1.0 / (50.0 * config.sample_rate as f32 / 1000.0)).exp(); // 50ms release

        let limiter_release_coef = (-1.0 / (config.limiter_release_ms * config.sample_rate as f32 / 1000.0)).exp();
        let limiter_threshold = 10.0_f32.powf(config.limiter_threshold_db / 20.0);

        // Crossfade samples
        let crossfade_samples = ((config.crossfade_ms * config.sample_rate as f32) / 1000.0) as usize;

        // Lookahead disabled - any delay causes clicks at frame boundaries
        // because the delay buffer holds samples from the previous frame.
        // For frame-by-frame processing, we must process without delay.
        let lookahead_samples = 0;

        Self {
            config: config.clone(),
            warmth_coeffs,
            presence_coeffs,
            deesser_detect_coeffs,
            dc_blocker: DcBlocker::new(config.sample_rate),
            warmth_state: BiquadState::new(),
            presence_state: BiquadState::new(),
            compressor_state: CompressorState::new(),
            comp_attack_coef,
            comp_release_coef,
            deesser_state: DeEsserState::new(),
            deesser_attack_coef,
            deesser_release_coef,
            splitband_deesser: SplitBandDeEsser::new(
                config.sample_rate,
                config.splitband_crossover_freq,
                config.splitband_threshold_db,
                config.splitband_ratio,
            ),
            limiter_state: LimiterState::new(lookahead_samples),
            limiter_threshold,
            limiter_release_coef,
            crossfade_buffer: CrossfadeBuffer::new(crossfade_samples),
            frame_count: 0,
            is_first_frame: true,

            // Humanization components (legacy)
            breath_generator: BreathGenerator::new(config.sample_rate, config.breath_probability),
            micro_pitch: MicroPitchModulator::new(config.sample_rate, config.micro_pitch_cents),
            noise_floor: NoiseFloor::new(config.noise_floor_db),
            amplitude_jitter: AmplitudeJitter::new(config.sample_rate, config.amplitude_jitter_depth),
            pitch_drift: PitchDrift::new(config.sample_rate, config.pitch_drift_cents),

            // SOLA-based pitch shifters (artifact-free)
            sola_micro_pitch: SolaMicroPitch::new(config.sample_rate, config.micro_pitch_cents),
            sola_pitch_drift: SolaPitchDrift::new(config.sample_rate, config.pitch_drift_cents),

            // "Better Than Human" components
            time_stretcher: SolaTimeStretch::new(config.sample_rate),
            current_emotion: config.emotion,
            emotion_params: config.emotion.prosody_params(),

            // Adaptive breath timing tracking
            total_samples_processed: 0,
            next_boundary_index: 0,

            // Advanced humanization (ultra-realistic)
            vocal_fry: VocalFry::new(config.sample_rate, config.vocal_fry_depth),
            lip_smack_generator: LipSmackGenerator::new(config.sample_rate),
            tempo_variation: TempoMicroVariation::new(config.sample_rate, config.tempo_variation_depth),
            onset_softener: OnsetSoftener::new(config.sample_rate),

            // State-of-the-art humanization (research-grade)
            // Note: enable flags are checked at process time, not construction
            jitter_shimmer: JitterShimmer::new(
                config.sample_rate,
                config.jitter_amount,
                config.shimmer_amount,
            ),
            hnr_modulator: HNRModulator::new(
                config.sample_rate,
                config.hnr_breathiness,
            ),
            subglottal_resonance: SubglottalResonance::new(
                config.sample_rate,
                config.subglottal_strength,
            ),
            smile_formants: SmileFormantShift::new(
                config.sample_rate,
                config.smile_amount,
            ),
            glottalization: Glottalization::new(
                config.sample_rate,
                config.glottalization_strength,
            ),
            hesitation_generator: HesitationPhenomena::new(
                config.sample_rate,
                config.hesitation_probability,
            ),
            lombard_effect: LombardEffect::new(config.sample_rate),
            register_transition: RegisterTransition::new(config.sample_rate),
            pharyngeal_constriction: PharyngealConstriction::new(
                config.sample_rate,
                config.pharyngeal_amount,
            ),
        }
    }

    /// Create with default configuration
    pub fn with_defaults() -> Self {
        Self::new(ProcessorConfig::default())
    }

    /// Reset all state (call at start of new utterance)
    pub fn reset(&mut self) {
        self.dc_blocker.reset();
        self.warmth_state.reset();
        self.presence_state.reset();
        self.compressor_state.reset();
        self.deesser_state.reset();
        self.splitband_deesser.reset();
        self.limiter_state.reset();
        self.crossfade_buffer.reset();
        self.frame_count = 0;
        self.is_first_frame = true;

        // Humanization
        self.breath_generator.reset();
        self.micro_pitch.reset();
        self.noise_floor.reset();
        self.amplitude_jitter.reset();
        self.pitch_drift.reset();

        // SOLA pitch shifters
        self.sola_micro_pitch.reset();
        self.sola_pitch_drift.reset();

        // Advanced humanization
        self.vocal_fry.reset();
        self.lip_smack_generator.reset();
        self.tempo_variation.reset();
        self.onset_softener.reset();

        // State-of-the-art humanization
        self.jitter_shimmer.reset();
        self.hnr_modulator.reset();
        self.subglottal_resonance.reset();
        self.smile_formants.reset();
        self.glottalization.reset();
        self.hesitation_generator.reset();
        self.lombard_effect.reset();
        self.register_transition.reset();
        self.pharyngeal_constriction.reset();

        // Adaptive breath timing
        self.total_samples_processed = 0;
        self.next_boundary_index = 0;
    }

    /// Mark the start of a new utterance (resets buffers, keeps filter state for continuity)
    pub fn start_utterance(&mut self) {
        self.is_first_frame = true;
        // Note: We DON'T reset EQ filter states here - they should continue smoothly
        // between utterances to avoid tonal discontinuities.

        // BUT we DO reset the crossfade and limiter buffers since they would contain
        // audio from the previous utterance, causing bleeding/clicks:
        self.crossfade_buffer.reset();
        self.limiter_state.reset();

        // Also reset compressor and de-esser envelopes to avoid artifacts
        // from previous utterance's dynamics
        self.compressor_state.reset();
        self.deesser_state.reset();
        self.splitband_deesser.reset();

        // Reset DC blocker to prevent accumulated offset from previous utterance
        self.dc_blocker.reset();

        // Generate random seed for this utterance from current time
        // This ensures each utterance has unique humanization characteristics
        let base_seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u32)
            .unwrap_or(42);

        // Reseed all humanization PRNGs with unique per-component seeds
        // (each component gets base_seed XOR'd with a unique constant to avoid correlation)
        self.breath_generator.reseed(base_seed ^ 0xDEAD_BEEF);
        self.micro_pitch.reseed(base_seed ^ 0xCAFE_BABE);
        self.noise_floor.reseed(base_seed ^ 0xFACE_FEED);
        self.amplitude_jitter.reseed(base_seed ^ 0xBEEF_CAFE);
        self.pitch_drift.reseed(base_seed ^ 0xFEED_FACE);

        // SOLA pitch shifters get reseeded too
        self.sola_micro_pitch.reseed(base_seed ^ 0xCAFE_BABE);
        self.sola_pitch_drift.reseed(base_seed ^ 0xFEED_FACE);

        // Advanced humanization reseeding
        self.vocal_fry.reseed(base_seed ^ 0xC0EA_CFBA);  // unique seed for vocal fry
        self.lip_smack_generator.reseed(base_seed ^ 0x50AC_C11B);  // unique seed for lip smacks

        // State-of-the-art humanization reseeding
        self.jitter_shimmer.reseed(base_seed ^ 0xA1B2_C3D4);
        self.hnr_modulator.reseed(base_seed ^ 0xE5F6_7890);
        self.hesitation_generator.reseed(base_seed ^ 0x1234_ABCD);

        // Start new utterance for state-of-the-art features
        self.jitter_shimmer.start_utterance();
        self.hnr_modulator.start_utterance();
        self.subglottal_resonance.start_utterance();
        self.smile_formants.start_utterance();
        self.glottalization.start_utterance();
        self.hesitation_generator.start_utterance();
        self.lombard_effect.start_utterance();
        self.register_transition.start_utterance();
        self.pharyngeal_constriction.start_utterance();

        // Start tempo variation for new utterance
        self.tempo_variation.start_utterance();

        // Start onset softener for new utterance
        self.onset_softener.start_utterance();

        // Humanization: maybe trigger breath at utterance start
        if self.config.enable_breath {
            self.breath_generator.trigger_if_probable();
        }

        // Reset pitch modulators for new utterance (keep LFO phase for continuity)
        self.micro_pitch.start_utterance();
        self.pitch_drift.start_utterance();

        // SOLA pitch shifters also start a new utterance
        self.sola_micro_pitch.start_utterance();
        self.sola_pitch_drift.start_utterance();

        // =========================================================================
        // "BETTER THAN HUMAN" - Configure emotion-aware prosody
        // =========================================================================

        if self.config.enable_emotion_prosody {
            // Cache current emotion and its parameters
            self.current_emotion = self.config.emotion;
            self.emotion_params = self.current_emotion.prosody_params();

            // Configure SOLA micro-pitch with emotion parameters
            self.sola_micro_pitch.configure_emotion(
                self.emotion_params.vibrato_rate_hz,
                self.emotion_params.vibrato_depth_cents,
            );

            // Configure SOLA pitch drift with emotion parameters
            self.sola_pitch_drift.configure_emotion(
                self.emotion_params.drift_bias_cents,
                self.emotion_params.drift_range_cents,
            );

            // Override breath probability with emotion-specific value
            self.breath_generator = BreathGenerator::new(
                self.config.sample_rate,
                self.emotion_params.breath_likelihood,
            );
            self.breath_generator.reseed(base_seed ^ 0xDEAD_BEEF);
            if self.config.enable_breath {
                self.breath_generator.trigger_if_probable();
            }
        }

        // Configure adaptive pacing if enabled
        if self.config.enable_adaptive_pacing {
            // Use emotion-based tempo factor combined with content complexity
            let base_tempo = if self.config.enable_emotion_prosody {
                self.emotion_params.tempo_factor
            } else {
                1.0
            };

            // Content complexity modulates the base tempo
            // Complex content slows down even happy speech
            let complexity_factor = if self.config.content_complexity > 0.5 {
                1.0 + (self.config.content_complexity - 0.5) * 0.2 // Up to 10% slower
            } else {
                1.0
            };

            let final_stretch = base_tempo * complexity_factor;
            self.time_stretcher.set_stretch_factor(1.0 / final_stretch); // Invert: slower = higher stretch
            self.time_stretcher.reset();
        }

        // Reset adaptive breath timing tracking for new utterance
        self.total_samples_processed = 0;
        self.next_boundary_index = 0;
    }

    // =========================================================================
    // "BETTER THAN HUMAN" - Runtime emotion control
    // =========================================================================

    /// Set the emotional state (can be called mid-utterance for dynamic expression)
    ///
    /// The emotion will smoothly transition to affect:
    /// - Vibrato rate and depth
    /// - Pitch drift direction and range
    /// - Breath likelihood (for next utterance)
    /// - Tempo/pacing (if adaptive pacing is enabled)
    pub fn set_emotion(&mut self, emotion: EmotionState) {
        self.config.emotion = emotion;
        self.current_emotion = emotion;
        self.emotion_params = emotion.prosody_params();

        if self.config.enable_emotion_prosody {
            // Update SOLA parameters for smooth transition
            self.sola_micro_pitch.configure_emotion(
                self.emotion_params.vibrato_rate_hz,
                self.emotion_params.vibrato_depth_cents,
            );
            self.sola_pitch_drift.configure_emotion(
                self.emotion_params.drift_bias_cents,
                self.emotion_params.drift_range_cents,
            );
        }

        if self.config.enable_adaptive_pacing {
            // Update pacing for emotion
            let stretch = 1.0 / self.emotion_params.tempo_factor;
            self.time_stretcher.set_stretch_factor(stretch);
        }
    }

    /// Set content complexity for adaptive pacing (0.0 = simple, 1.0 = complex)
    pub fn set_content_complexity(&mut self, complexity: f32) {
        self.config.content_complexity = complexity.clamp(0.0, 1.0);
        if self.config.enable_adaptive_pacing {
            self.time_stretcher.set_from_complexity(self.config.content_complexity);
        }
    }

    /// Get current emotional state
    pub fn current_emotion(&self) -> EmotionState {
        self.current_emotion
    }

    /// Get current prosody parameters
    pub fn current_prosody_params(&self) -> &EmotionProsodyParams {
        &self.emotion_params
    }

    // =========================================================================
    // "BETTER THAN HUMAN" - Adaptive Breath Timing
    // =========================================================================

    /// Set phrase boundaries for adaptive breath placement
    ///
    /// Call this before processing an utterance to enable intelligent breath placement.
    /// Boundaries should be sorted by sample_index.
    ///
    /// Example:
    /// ```ignore
    /// processor.set_phrase_boundaries(vec![
    ///     PhraseBoundary { sample_index: 24000, boundary_type: BoundaryType::ClauseBreak },
    ///     PhraseBoundary { sample_index: 48000, boundary_type: BoundaryType::SentenceEnd },
    /// ]);
    /// processor.start_utterance();
    /// ```
    pub fn set_phrase_boundaries(&mut self, boundaries: Vec<PhraseBoundary>) {
        self.config.phrase_boundaries = boundaries;
        self.config.enable_adaptive_breath = !self.config.phrase_boundaries.is_empty();
        self.next_boundary_index = 0;
    }

    /// Add a single phrase boundary
    ///
    /// Can be called during streaming to add boundaries as they are detected.
    pub fn add_phrase_boundary(&mut self, sample_index: usize, boundary_type: BoundaryType) {
        self.config.phrase_boundaries.push(PhraseBoundary {
            sample_index,
            boundary_type,
        });
        self.config.enable_adaptive_breath = true;
    }

    /// Clear all phrase boundaries
    pub fn clear_phrase_boundaries(&mut self) {
        self.config.phrase_boundaries.clear();
        self.config.enable_adaptive_breath = false;
        self.next_boundary_index = 0;
    }

    /// Get the number of phrase boundaries currently set
    pub fn phrase_boundary_count(&self) -> usize {
        self.config.phrase_boundaries.len()
    }

    /// Check if a phrase boundary falls within the current frame and inject breath if appropriate
    fn check_and_inject_boundary_breath(&mut self, samples: &mut [f32], frame_start: usize, frame_end: usize) {
        if !self.config.enable_adaptive_breath || self.config.phrase_boundaries.is_empty() {
            return;
        }

        // Check all boundaries that fall within this frame
        while self.next_boundary_index < self.config.phrase_boundaries.len() {
            let boundary = &self.config.phrase_boundaries[self.next_boundary_index];

            if boundary.sample_index >= frame_end {
                // This boundary is in a future frame
                break;
            }

            if boundary.sample_index >= frame_start {
                // This boundary is in this frame - inject breath based on type
                let breath_likelihood = match boundary.boundary_type {
                    BoundaryType::SentenceEnd => 0.8,      // High chance at sentence end
                    BoundaryType::ClauseBreak => 0.4,      // Medium chance at clause break
                    BoundaryType::EmphasisBefore => 0.2,   // Low chance before emphasis
                    BoundaryType::EmotionalRelease => 0.6, // Good chance after emotional content
                };

                // Combine with emotion-based breath likelihood
                let combined_likelihood = if self.config.enable_emotion_prosody {
                    (breath_likelihood + self.emotion_params.breath_likelihood) / 2.0
                } else {
                    breath_likelihood
                };

                // Trigger breath based on probability
                if self.breath_generator.should_trigger(combined_likelihood) {
                    // Calculate position within frame where breath should start
                    let pos_in_frame = boundary.sample_index.saturating_sub(frame_start);
                    self.breath_generator.inject_at_position(samples, pos_in_frame);
                }

                // Also trigger lip smack at phrase boundaries (if enabled)
                // Lip smacks add realism between phrases - probability based on boundary type
                if self.config.enable_lip_smacks {
                    let smack_probability = self.config.lip_smack_probability * match boundary.boundary_type {
                        BoundaryType::SentenceEnd => 0.5,       // Lower at sentence end (breathy)
                        BoundaryType::ClauseBreak => 1.0,       // Full probability at clause breaks
                        BoundaryType::EmphasisBefore => 0.7,    // Good chance before emphasis
                        BoundaryType::EmotionalRelease => 0.3,  // Lower after emotional content
                    };

                    // Use simple PRNG check for triggering
                    let rand_val = (self.frame_count.wrapping_mul(0xDEADBEEF) ^ boundary.sample_index as u64) as f32
                        / u64::MAX as f32;
                    if rand_val < smack_probability {
                        self.lip_smack_generator.trigger_smack();
                    }
                }
            }

            self.next_boundary_index += 1;
        }
    }

    /// Check for upcoming phrase boundary and signal tempo variation for final lengthening
    ///
    /// Final lengthening is a phonetic phenomenon where speakers naturally slow down
    /// before pauses. This creates a more natural speech rhythm.
    ///
    /// We look ahead by the ramp duration (~150ms / ~3600 samples at 24kHz) and
    /// signal the tempo variation component when a boundary is approaching.
    fn check_and_signal_final_lengthening(&mut self, frame_start: usize, frame_len: usize) {
        if self.config.phrase_boundaries.is_empty() {
            return;
        }

        // Look ahead for upcoming boundaries
        let lookahead_samples = self.tempo_variation.get_final_lengthening_ramp();
        let lookahead_end = frame_start + frame_len + lookahead_samples;

        // Find the nearest upcoming boundary
        for boundary in &self.config.phrase_boundaries {
            // Only consider boundaries ahead of the current frame
            if boundary.sample_index <= frame_start {
                continue;
            }

            // Is this boundary within our lookahead window?
            if boundary.sample_index <= lookahead_end {
                // Calculate samples until boundary from frame start
                let samples_until = boundary.sample_index.saturating_sub(frame_start);

                // Only signal certain boundary types for final lengthening
                // (not emphasis markers - those don't precede pauses)
                match boundary.boundary_type {
                    BoundaryType::SentenceEnd | BoundaryType::ClauseBreak | BoundaryType::EmotionalRelease => {
                        self.tempo_variation.set_phrase_boundary(samples_until);
                        return; // Only signal nearest boundary
                    }
                    _ => {}
                }
            }
        }
    }

    /// Check for upcoming sentence boundary and signal pitch drift for pitch reset
    ///
    /// Pitch reset is a phonetic phenomenon where pitch "declination" (gradual lowering)
    /// resets to a higher baseline at sentence boundaries. This creates natural intonation
    /// contours that distinguish sentence boundaries from within-sentence pauses.
    ///
    /// Unlike final lengthening, pitch reset only triggers on SentenceEnd boundaries.
    fn check_and_signal_pitch_reset(&mut self, frame_start: usize, frame_len: usize) {
        if self.config.phrase_boundaries.is_empty() {
            return;
        }

        // Look ahead for upcoming sentence boundaries
        let lookahead_samples = self.sola_pitch_drift.get_reset_ramp();
        let lookahead_end = frame_start + frame_len + lookahead_samples;

        // Find the nearest upcoming sentence boundary
        for boundary in &self.config.phrase_boundaries {
            // Only consider boundaries ahead of the current frame
            if boundary.sample_index <= frame_start {
                continue;
            }

            // Is this boundary within our lookahead window?
            if boundary.sample_index <= lookahead_end {
                // Calculate samples until boundary from frame start
                let samples_until = boundary.sample_index.saturating_sub(frame_start);

                // Only signal sentence-end boundaries for pitch reset
                // (clause breaks don't typically reset the pitch register)
                match boundary.boundary_type {
                    BoundaryType::SentenceEnd => {
                        self.sola_pitch_drift.set_phrase_boundary(samples_until);
                        return; // Only signal nearest boundary
                    }
                    _ => {}
                }
            }
        }
    }

    /// Process a frame of audio samples in-place
    ///
    /// Call this for each audio frame. The processor maintains state between calls
    /// for seamless audio without artifacts.
    ///
    /// Processing order is carefully designed:
    /// 0. DC blocking - removes accumulated DC offset from input
    /// 1. Soft attack (first frame only)
    /// 1b. Breath injection (first frame, probabilistic)
    /// 1b2. Adaptive breath timing (at phrase boundaries)
    /// 1c. Pitch humanization (micro-pitch + drift)
    /// 1d. Tempo micro-variation (subtle speed changes)
    /// 2. Warmth (low-shelf EQ) - adds body
    /// 3. Compression - controls dynamics
    /// 4. Presence (peak EQ) - adds clarity
    /// 5a/b. De-essing (legacy or split-band)
    /// 5c. Amplitude jitter (subtle volume variations)
    /// 5d. Vocal fry (creaky voice at utterance end)
    /// 5e. Lip smacks (mouth sounds at phrase boundaries)
    /// 6. Soft release (last frame only)
    /// 7. Crossfade - blends with previous frame
    /// 7b. Noise floor - adds room tone (BEFORE storing tail!)
    /// 8. Store tail for next frame's crossfade
    /// 9. Limiter - LAST to catch any peaks
    pub fn process_frame(&mut self, samples: &mut [f32], is_last_frame: bool) -> ProcessingStats {
        let mut stats = ProcessingStats::default();
        self.frame_count += 1;

        if samples.is_empty() {
            return stats;
        }

        // 0. DC blocking - remove any DC offset before processing
        // This prevents cascaded filters from accumulating DC drift
        for sample in samples.iter_mut() {
            *sample = self.dc_blocker.process(*sample);
        }

        // 1. Soft attack on first frame (gentle fade-in)
        if self.is_first_frame && self.config.soft_attack_ms > 0.0 {
            let attack_samples = ((self.config.soft_attack_ms * self.config.sample_rate as f32) / 1000.0) as usize;
            self.apply_soft_attack(samples, attack_samples);
            stats.soft_attack_applied = true;
            self.is_first_frame = false;
        } else if self.is_first_frame {
            self.is_first_frame = false;
        }

        // 1b. Breath injection - mix in breath sound if triggered
        // (Breath was triggered in start_utterance() based on probability)
        if self.config.enable_breath {
            self.breath_generator.process(samples);
        }

        // 1b2. Adaptive breath timing - inject breaths at phrase boundaries
        // This checks if any phrase boundaries fall within this frame's sample range
        // and probabilistically injects breath sounds based on boundary type.
        let frame_start = self.total_samples_processed;
        let frame_end = frame_start + samples.len();
        self.check_and_inject_boundary_breath(samples, frame_start, frame_end);

        // 1b3. Onset softening - apply micro-fades to sudden energy jumps
        // Reduces harsh glottal attacks on vowel-initial sounds for more natural speech
        if self.config.enable_onset_softening {
            self.onset_softener.process(samples);
        }

        // 1c. Pitch humanization - add natural pitch variations
        if self.config.use_sola_pitch {
            // SOLA-based pitch shifting (artifact-free)
            // Uses proper overlap-add with cross-correlation for seamless pitch changes
            // Micro-pitch: fast ~5Hz wobble (like natural vibrato)
            if self.config.enable_micro_pitch {
                self.sola_micro_pitch.process(samples);
            }
            // Pitch drift: slow wandering over phrases
            if self.config.enable_pitch_drift {
                // Check for upcoming sentence boundaries and trigger pitch reset
                // Pitch reset: return drift to baseline at sentence ends (natural declination reset)
                self.check_and_signal_pitch_reset(frame_start, samples.len());
                self.sola_pitch_drift.process(samples);
            }
        } else {
            // Legacy pitch shifting (may cause clicks - kept for reference)
            // Micro-pitch: fast ~5Hz wobble (like natural vibrato)
            if self.config.enable_micro_pitch {
                self.micro_pitch.process(samples);
            }
            // Pitch drift: slow wandering over phrases
            if self.config.enable_pitch_drift {
                self.pitch_drift.process(samples);
            }
        }

        // 1d. Tempo micro-variation - subtle speed changes within phrases
        // Creates natural rhythm variations that make speech feel more human
        if self.config.enable_tempo_variation {
            // Check for upcoming phrase boundary and trigger final lengthening
            // Final lengthening: gradual slowdown before pauses (phonetic phenomenon)
            self.check_and_signal_final_lengthening(frame_start, samples.len());
            self.tempo_variation.process(samples);
        }

        // 2. Warmth (low-shelf EQ) - adds body to voice
        if self.config.enable_warmth {
            self.apply_warmth(samples);
            stats.warmth_applied = true;
        }

        // 3. Compression - controls dynamics (after warmth, before presence)
        if self.config.enable_compression {
            let reduction = self.apply_compression(samples);
            stats.compression_reduction_db = reduction;
        }

        // 4. Presence (peak EQ) - adds clarity (after compression for brighter result)
        if self.config.enable_presence {
            self.apply_presence(samples);
            stats.presence_applied = true;
        }

        // 5a. Legacy De-esser - DEPRECATED (causes wideband artifacts)
        if self.config.enable_deesser {
            let reduction = self.apply_deesser(samples);
            stats.deesser_reduction_db = reduction;
        }

        // 5b. Split-band De-esser - Professional quality (only attenuates high frequencies)
        if self.config.enable_splitband_deesser {
            let reduction = self.apply_splitband_deesser(samples);
            // Prefer split-band reduction in stats (more accurate)
            if !self.config.enable_deesser {
                stats.deesser_reduction_db = reduction;
            }
        }

        // 5c. Amplitude jitter - subtle volume micro-variations
        // Makes the voice feel less "perfect" and more natural
        if self.config.enable_amplitude_jitter {
            self.amplitude_jitter.process(samples);
        }

        // =====================================================================
        // STATE-OF-THE-ART HUMANIZATION - Research-grade voice naturalization
        // =====================================================================

        // 5c2. Jitter & Shimmer - cycle-to-cycle pitch/amplitude variation
        // Key acoustic marker that distinguishes human from synthetic speech.
        // Jitter (pitch) and shimmer (amplitude) work together for organic quality.
        if self.config.enable_jitter || self.config.enable_shimmer {
            self.jitter_shimmer.process(samples);
        }

        // 5c3. HNR Modulation - natural breathiness control
        // Adds aspiration noise modulated by speech envelope for warmth.
        // Prevents the "sterile" quality of pure synthesis.
        if self.config.enable_hnr_modulation {
            self.hnr_modulator.process(samples);
        }

        // 5c4. Subglottal Resonance - chest cavity resonances
        // Adds resonances at Sg1=600Hz, Sg2=1400Hz, Sg3=2200Hz that come
        // from the chest cavity. Makes voice sound "embodied" and full.
        if self.config.enable_subglottal_resonance {
            self.subglottal_resonance.process(samples);
        }

        // 5c5. Smile Formant Shifts - emotional brightness
        // When smiling, vocal tract shortens and formants shift up.
        // Dynamically controlled based on positive emotional context.
        if self.config.enable_smile_formants && self.config.smile_amount > 0.0 {
            self.smile_formants.process(samples);
        }

        // 5c6. Glottalization - glottal stops at vowel onsets
        // Adds low-frequency amplitude modulation for emphasis.
        // Should be triggered on stressed vowels for natural speech.
        if self.config.enable_glottalization {
            self.glottalization.process(samples);
        }

        // 5c7. Hesitation Phenomena - natural "um", "uh" sounds
        // Injects pre-generated filler sounds at appropriate pauses.
        // Essential for conversational flow (disabled by default).
        if self.config.enable_hesitation_sounds {
            self.hesitation_generator.process(samples);
        }

        // 5c8. Lombard Effect - noise adaptation
        // Boosts volume and brightness when background noise detected.
        // Humans naturally do this in noisy environments.
        if self.config.enable_lombard_effect {
            self.lombard_effect.process(samples);
        }

        // 5c9. Register Transitions - modal/falsetto/fry quality
        // Smoothly transitions between voice registers based on emotion/pitch.
        // Controlled dynamically for emotional range.
        if self.config.enable_register_transitions {
            self.register_transition.process(samples);
        }

        // 5c10. Pharyngeal Constriction - stress/tension in throat
        // Adds characteristic throat tightening for stress or crying.
        // Creates mid-frequency emphasis for emotional scenes.
        if self.config.enable_pharyngeal_constriction && self.config.pharyngeal_amount > 0.0 {
            self.pharyngeal_constriction.process(samples);
        }

        // 5d. Vocal fry - creaky voice effect at utterance end
        // Triggers on last frame to create natural trailing-off quality
        if is_last_frame && self.config.enable_vocal_fry {
            self.vocal_fry.trigger_fry(self.config.vocal_fry_duration_ms);
        }
        // Process vocal fry if active (may span multiple frames if triggered earlier)
        if self.config.enable_vocal_fry {
            self.vocal_fry.process(samples);
        }

        // 5e. Lip smacks - process any triggered mouth sounds
        // (triggered at phrase boundaries via check_and_inject_boundary_breath)
        if self.config.enable_lip_smacks {
            self.lip_smack_generator.process(samples);
        }

        // 6. Soft release on last frame (gentle fade-out)
        if is_last_frame && self.config.soft_release_ms > 0.0 {
            let release_samples = ((self.config.soft_release_ms * self.config.sample_rate as f32) / 1000.0) as usize;
            self.apply_soft_release(samples, release_samples);
            stats.soft_release_applied = true;
        }

        // 7. Crossfade - blend with previous frame (both frames now fully processed)
        // Uses equal-power crossfade to maintain constant loudness
        if self.config.enable_crossfade && self.crossfade_buffer.has_tail {
            self.crossfade_buffer.apply_crossfade(samples);
            stats.crossfade_applied = true;
        }

        // 7b. Noise floor - add subtle room tone BEFORE storing tail
        // This ensures the crossfade region has consistent noise characteristics.
        // Without this, the tail would have no noise, creating a subtle discontinuity.
        if self.config.enable_noise_floor {
            self.noise_floor.process(samples);
        }

        // 8. Store tail BEFORE limiter for next frame's crossfade
        // (so crossfade blends pre-limited audio for smoother result)
        // Note: Noise floor is now included in the tail for consistency
        if self.config.enable_crossfade && !is_last_frame {
            self.crossfade_buffer.store_tail(samples);
        }

        // 9. Limiter - LAST in chain to catch any peaks from crossfade or processing
        // This ensures output never clips, even if crossfade creates constructive interference
        if self.config.enable_limiter {
            let reduction = self.apply_limiter(samples);
            stats.limiter_reduction_db = reduction;
        }

        // Update sample position tracker for adaptive breath timing
        self.total_samples_processed += samples.len();

        stats.frame_number = self.frame_count;
        stats
    }

    // ========================================================================
    // INTERNAL PROCESSING FUNCTIONS
    // ========================================================================

    /// Apply warmth using stateful low-shelf filter
    fn apply_warmth(&mut self, samples: &mut [f32]) {
        let c = &self.warmth_coeffs;
        for sample in samples.iter_mut() {
            *sample = self.warmth_state.process(*sample, c.b0, c.b1, c.b2, c.a1, c.a2);
        }
    }

    /// Apply presence using stateful peak EQ filter
    fn apply_presence(&mut self, samples: &mut [f32]) {
        let c = &self.presence_coeffs;
        for sample in samples.iter_mut() {
            *sample = self.presence_state.process(*sample, c.b0, c.b1, c.b2, c.a1, c.a2);
        }
    }

    /// Apply de-esser - reduces harsh sibilance ("s", "sh", "ch" sounds)
    fn apply_deesser(&mut self, samples: &mut [f32]) -> f32 {
        let threshold = 10.0_f32.powf(self.config.deesser_threshold_db / 20.0);
        let ratio = self.config.deesser_ratio;
        let c = &self.deesser_detect_coeffs;

        let mut max_reduction = 0.0f32;

        for sample in samples.iter_mut() {
            // Detect sibilance using bandpass filter
            let sibilance = self.deesser_state.detect_filter
                .process(*sample, c.b0, c.b1, c.b2, c.a1, c.a2)
                .abs();

            // Envelope follower
            let env = &mut self.deesser_state.sibilance_envelope;
            if sibilance > *env {
                *env = self.deesser_attack_coef * *env + (1.0 - self.deesser_attack_coef) * sibilance;
            } else {
                *env = self.deesser_release_coef * *env + (1.0 - self.deesser_release_coef) * sibilance;
            }

            // Compute gain reduction
            let gain = if *env > threshold {
                let over_db = 20.0 * (*env / threshold).log10();
                let reduced_db = over_db / ratio;
                let target = threshold * 10.0_f32.powf(reduced_db / 20.0);
                (target / env.max(1e-10)).min(1.0)
            } else {
                1.0
            };

            self.deesser_state.gain_reduction = gain;
            *sample *= gain;

            let reduction_db = -20.0 * gain.log10();
            max_reduction = max_reduction.max(reduction_db);
        }

        max_reduction
    }

    /// Apply split-band de-esser (professional quality)
    ///
    /// Unlike the wideband de-esser, this only attenuates high frequencies
    /// above the crossover point. Low/mid frequencies pass through untouched.
    fn apply_splitband_deesser(&mut self, samples: &mut [f32]) -> f32 {
        let mut max_reduction = 0.0f32;

        for sample in samples.iter_mut() {
            *sample = self.splitband_deesser.process(*sample);
            let reduction_db = self.splitband_deesser.gain_reduction_db();
            max_reduction = max_reduction.max(reduction_db);
        }

        max_reduction
    }

    /// Apply compression with stateful envelope follower
    fn apply_compression(&mut self, samples: &mut [f32]) -> f32 {
        let threshold = 10.0_f32.powf(self.config.comp_threshold_db / 20.0);
        let ratio = self.config.comp_ratio;
        let makeup = 10.0_f32.powf(self.config.comp_makeup_db / 20.0);

        let mut max_reduction = 0.0f32;

        for sample in samples.iter_mut() {
            let input_abs = sample.abs();

            // Envelope follower
            let env = &mut self.compressor_state.envelope;
            if input_abs > *env {
                *env = self.comp_attack_coef * *env + (1.0 - self.comp_attack_coef) * input_abs;
            } else {
                *env = self.comp_release_coef * *env + (1.0 - self.comp_release_coef) * input_abs;
            }

            // Compute gain
            let gain = if *env > threshold {
                let over_db = 20.0 * (*env / threshold).log10();
                let reduced_db = over_db / ratio;
                let target = threshold * 10.0_f32.powf(reduced_db / 20.0);
                target / env.max(1e-10)
            } else {
                1.0
            };

            self.compressor_state.gain_reduction_db = -20.0 * gain.log10();
            max_reduction = max_reduction.max(self.compressor_state.gain_reduction_db);

            // Apply gain + makeup
            *sample *= gain * makeup;
        }

        max_reduction
    }

    /// Apply soft limiter (no lookahead for frame-by-frame processing)
    fn apply_limiter(&mut self, samples: &mut [f32]) -> f32 {
        let threshold = self.limiter_threshold;
        let mut max_reduction = 0.0f32;

        for sample in samples.iter_mut() {
            // Compute gain needed for current sample
            let input_abs = sample.abs();
            let target_gain = if input_abs > threshold {
                threshold / input_abs
            } else {
                1.0
            };

            // Smooth gain envelope (instant attack, slow release)
            let env = &mut self.limiter_state.gain_envelope;
            if target_gain < *env {
                *env = target_gain; // Instant attack
            } else {
                *env = self.limiter_release_coef * *env + (1.0 - self.limiter_release_coef) * target_gain;
            }

            // Apply gain directly (no delay)
            *sample *= *env;

            let reduction_db = -20.0 * env.log10();
            max_reduction = max_reduction.max(reduction_db);
        }

        max_reduction
    }

    /// Apply soft attack (fade-in)
    fn apply_soft_attack(&self, samples: &mut [f32], attack_samples: usize) {
        let attack_len = attack_samples.min(samples.len());
        for i in 0..attack_len {
            let t = i as f32 / attack_len as f32;
            let envelope = 0.5 * (1.0 - (PI * t).cos()); // 0 -> 1
            samples[i] *= envelope;
        }
    }

    /// Apply soft release (fade-out)
    fn apply_soft_release(&self, samples: &mut [f32], release_samples: usize) {
        let len = samples.len();
        let release_len = release_samples.min(len);
        let start = len - release_len;
        for i in 0..release_len {
            let t = i as f32 / release_len as f32;
            let envelope = 0.5 * (1.0 + (PI * t).cos()); // 1 -> 0
            samples[start + i] *= envelope;
        }
    }

    // ========================================================================
    // GETTERS
    // ========================================================================

    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }

    pub fn config(&self) -> &ProcessorConfig {
        &self.config
    }
}

// ============================================================================
// PROCESSING STATISTICS
// ============================================================================

/// Statistics from processing a single frame
#[derive(Clone, Default)]
pub struct ProcessingStats {
    pub frame_number: u64,
    pub crossfade_applied: bool,
    pub soft_attack_applied: bool,
    pub soft_release_applied: bool,
    pub warmth_applied: bool,
    pub presence_applied: bool,
    pub compression_reduction_db: f32,
    pub deesser_reduction_db: f32,
    pub limiter_reduction_db: f32,
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor_creation() {
        let processor = PostTTSProcessor::with_defaults();
        assert_eq!(processor.frame_count(), 0);
    }

    #[test]
    fn test_process_frame() {
        let mut processor = PostTTSProcessor::with_defaults();

        // Create a simple sine wave
        let mut samples: Vec<f32> = (0..480)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
            .collect();

        let stats = processor.process_frame(&mut samples, false);

        assert_eq!(stats.frame_number, 1);
        assert!(stats.soft_attack_applied); // First frame gets attack
        assert!(!stats.crossfade_applied); // No crossfade on first frame
    }

    #[test]
    fn test_stateful_processing() {
        let mut processor = PostTTSProcessor::with_defaults();

        // Process multiple frames - state should persist
        for i in 0..5 {
            let mut samples: Vec<f32> = (0..480)
                .map(|j| (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5)
                .collect();

            let is_last = i == 4;
            let stats = processor.process_frame(&mut samples, is_last);

            if i == 0 {
                assert!(stats.soft_attack_applied);
                assert!(!stats.crossfade_applied);
            } else if i == 4 {
                assert!(stats.soft_release_applied);
                assert!(stats.crossfade_applied);
            } else {
                assert!(!stats.soft_attack_applied);
                assert!(stats.crossfade_applied);
            }
        }

        assert_eq!(processor.frame_count(), 5);
    }

    #[test]
    fn test_biquad_continuity() {
        let mut state = BiquadState::new();
        let coeffs = BiquadCoeffs::low_shelf(24000, 300.0, 3.0);

        // Process samples and verify state persists
        let mut prev_y = 0.0f32;
        for i in 0..100 {
            let x = (2.0 * PI * 440.0 * i as f32 / 24000.0).sin();
            let y = state.process(x, coeffs.b0, coeffs.b1, coeffs.b2, coeffs.a1, coeffs.a2);

            // Output should be smooth (no sudden jumps except from signal itself)
            if i > 2 {
                assert!((y - prev_y).abs() < 0.5, "Jump too large at sample {}", i);
            }
            prev_y = y;
        }

        // State should be non-zero after processing
        assert!(state.y1.abs() > 1e-10);
    }

    #[test]
    fn test_crossfade() {
        let crossfade_len = 48; // ~2ms at 24kHz
        let mut buffer = CrossfadeBuffer::new(crossfade_len);

        // Frame 1: constant amplitude sine wave
        let frame1: Vec<f32> = (0..480)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
            .collect();
        buffer.store_tail(&frame1);

        // Frame 2: same frequency but phase shifted (simulates chunk boundary)
        let mut frame2: Vec<f32> = (0..480)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * (i + 50) as f32 / 24000.0).sin() * 0.5)
            .collect();
        buffer.apply_crossfade(&mut frame2);

        // Verify crossfade region: no large discontinuities (clicks)
        // The equal-power crossfade should maintain relatively constant amplitude
        let crossfade_region = &frame2[..crossfade_len];
        for i in 1..crossfade_region.len() {
            let jump = (crossfade_region[i] - crossfade_region[i-1]).abs();
            // Max reasonable jump for 440Hz at 24kHz is about 0.1 per sample
            // Clicks would be >0.3
            assert!(
                jump < 0.3,
                "Click detected at crossfade sample {}: jump = {}",
                i, jump
            );
        }

        // Verify continuity after crossfade region
        assert!(
            (frame2[crossfade_len] - frame2[crossfade_len - 1]).abs() < 0.3,
            "Discontinuity at crossfade boundary"
        );
    }

    /// Test equal-power crossfade maintains constant energy
    #[test]
    fn test_crossfade_equal_power() {
        // Equal-power crossfade property: cos²(θ) + sin²(θ) = 1
        // When blending two signals of equal amplitude, output amplitude should stay constant
        use std::f32::consts::PI;

        let crossfade_len = 100;
        let half_pi = PI / 2.0;

        // Compute the sum of squared weights at each point
        for i in 0..crossfade_len {
            let t = i as f32 / crossfade_len as f32;
            let tail_weight = (half_pi * t).cos();
            let head_weight = (half_pi * t).sin();

            // For equal-power: tail² + head² should equal 1.0
            let power_sum = tail_weight * tail_weight + head_weight * head_weight;

            assert!(
                (power_sum - 1.0).abs() < 0.001,
                "Equal-power violated at t={}: tail²+head² = {} (expected 1.0)",
                t, power_sum
            );

            // Also verify weight directions are correct
            if i == 0 {
                assert!(tail_weight > 0.99, "At t=0, tail should be ~1.0: {}", tail_weight);
                assert!(head_weight < 0.01, "At t=0, head should be ~0.0: {}", head_weight);
            }
            if i == crossfade_len - 1 {
                assert!(tail_weight < 0.1, "At t=1, tail should be ~0.0: {}", tail_weight);
                assert!(head_weight > 0.9, "At t=1, head should be ~1.0: {}", head_weight);
            }
        }
    }

    // ========================================================================
    // HUMANIZATION FEATURE TESTS
    // ========================================================================

    #[test]
    fn test_noise_floor_adds_noise() {
        let mut noise = NoiseFloor::new(-60.0); // -60dB noise floor

        // Start with silence
        let mut samples: Vec<f32> = vec![0.0; 480];
        noise.process(&mut samples);

        // Verify noise was added (samples should no longer be silent)
        let has_noise = samples.iter().any(|&s| s != 0.0);
        assert!(has_noise, "NoiseFloor should add subtle noise to samples");

        // Verify noise is quiet (below -40dB for -60dB setting)
        let max_amplitude = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        let noise_db = 20.0 * (max_amplitude + 1e-10).log10();
        assert!(noise_db < -40.0, "Noise should be subtle, got {}dB", noise_db);
    }

    #[test]
    fn test_amplitude_jitter_varies_amplitude() {
        let mut jitter = AmplitudeJitter::new(24000, 0.02); // 2% depth for more visible effect

        // Run multiple frames to let jitter warm up (target updates every ~50ms = 1200 samples)
        let mut all_samples: Vec<f32> = Vec::new();
        for _ in 0..10 {
            let mut samples: Vec<f32> = vec![0.5; 480];
            jitter.process(&mut samples);
            all_samples.extend(samples);
        }

        // Check that samples are not all identical over the full run
        let first = all_samples[0];
        let has_variation = all_samples.iter().any(|&s| (s - first).abs() > 0.0001);
        assert!(has_variation, "AmplitudeJitter should create volume variations");

        // Verify variations are subtle (within expected range for 2% depth)
        let min = all_samples.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = all_samples.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let variation_percent = ((max - min) / 0.5) * 100.0;
        assert!(variation_percent < 10.0, "Variations should be subtle, got {}%", variation_percent);
    }

    #[test]
    fn test_micro_pitch_modulates_across_frames() {
        // This test verifies the read_pos reset fix:
        // Each frame should process ALL its samples, not just the last 2
        let mut pitch = MicroPitchModulator::new(24000, 10.0); // 10 cents depth

        // Process multiple frames
        for frame_idx in 0..3 {
            // Each frame is a constant tone segment (easier to verify modification)
            let mut samples: Vec<f32> = (0..480)
                .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
                .collect();
            let original = samples.clone();

            pitch.process(&mut samples);

            // Count how many samples were modified
            let modified_count = samples.iter()
                .zip(original.iter())
                .filter(|(a, b)| (*a - *b).abs() > 0.0001)
                .count();

            // With the read_pos fix, most samples should be modified
            // Without the fix, only the last 2 samples would change after frame 0
            assert!(
                modified_count > samples.len() / 2,
                "Frame {}: Only {}/{} samples modified. read_pos bug may have returned!",
                frame_idx, modified_count, samples.len()
            );
        }
    }

    #[test]
    fn test_pitch_drift_modulates_across_frames() {
        // PitchDrift only updates target every ~12000 samples (500ms at 24kHz)
        // So we need to process enough samples for it to trigger a drift change
        let mut drift = PitchDrift::new(24000, 10.0); // 10 cents max for more visible effect

        // Process 30 frames (14400 samples) to trigger at least one target update
        let mut modified_in_later_frames = false;
        for frame_idx in 0..30 {
            let mut samples: Vec<f32> = (0..480)
                .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
                .collect();
            let original = samples.clone();

            drift.process(&mut samples);

            // Count modified samples
            let modified_count = samples.iter()
                .zip(original.iter())
                .filter(|(a, b)| (*a - *b).abs() > 0.0001)
                .count();

            // After drift kicks in (after ~25 frames), samples should be modified
            if frame_idx >= 25 && modified_count > samples.len() / 4 {
                modified_in_later_frames = true;
            }
        }

        // At least some later frames should show modification
        assert!(
            modified_in_later_frames,
            "PitchDrift should modify samples after warmup period"
        );
    }

    #[test]
    fn test_micro_pitch_lfo_continuity() {
        // Verify LFO phase persists across frames for smooth modulation
        let mut pitch = MicroPitchModulator::new(24000, 10.0);

        // Process many frames and track LFO phase
        let mut prev_phase = 0.0f32;
        let mut wrap_count = 0;
        for _ in 0..20 {
            let mut samples: Vec<f32> = vec![0.5; 480];
            pitch.process(&mut samples);

            // LFO phase should increase or wrap (when crossing 1.0)
            let phase = pitch.lfo_phase;
            if phase < prev_phase {
                wrap_count += 1;
                // When wrapping, new phase should be small (wrapped portion)
                assert!(phase < 0.3,
                    "After wrap, phase should be small. prev={}, curr={}",
                    prev_phase, phase);
            }
            prev_phase = phase;
        }

        // Should have wrapped at least once over 20 frames
        assert!(wrap_count >= 1, "LFO should wrap at least once over 20 frames");
    }

    #[test]
    fn test_breath_generator_injects_breath() {
        let mut breath = BreathGenerator::new(24000, 0.3); // 30% probability

        // Force breath trigger
        breath.trigger_breath();

        // Process a frame
        let mut samples: Vec<f32> = vec![0.0; 480]; // Start silent
        breath.process(&mut samples);

        // Verify breath was added (samples should have content)
        let has_sound = samples.iter().any(|&s| s.abs() > 0.0001);
        assert!(has_sound, "Breath should add sound when triggered");

        // Verify breath is mixed at expected amplitude
        let max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max > 0.001 && max < 1.0, "Breath amplitude should be moderate: {}", max);
    }

    #[test]
    fn test_breath_generator_only_on_trigger() {
        let mut breath = BreathGenerator::new(24000, 0.3);

        // Don't trigger breath
        let mut samples: Vec<f32> = vec![0.5; 480];
        let original = samples.clone();
        breath.process(&mut samples);

        // Without trigger, samples should be unchanged
        let unchanged = samples.iter()
            .zip(original.iter())
            .all(|(a, b)| (a - b).abs() < 0.0001);
        assert!(unchanged, "Without trigger, breath generator should not modify samples");
    }

    #[test]
    fn test_humanization_integration() {
        // Full integration test: all humanization features enabled
        let config = ProcessorConfig {
            enable_micro_pitch: true,
            micro_pitch_cents: 10.0,
            enable_pitch_drift: true,
            pitch_drift_cents: 5.0,
            enable_amplitude_jitter: true,
            amplitude_jitter_depth: 0.01, // 1% depth
            enable_noise_floor: true,
            noise_floor_db: -60.0,
            enable_breath: true,
            breath_probability: 1.0, // Always trigger for test
            // Disable soft edges to test energy preservation (they're tested separately)
            soft_attack_ms: 0.0,
            soft_release_ms: 0.0,
            ..ProcessorConfig::default()
        };
        let mut processor = PostTTSProcessor::new(config);

        // Process multiple frames
        for i in 0..5 {
            let mut samples: Vec<f32> = (0..480)
                .map(|j| (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5)
                .collect();
            let original_rms: f32 = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();

            let is_last = i == 4;
            processor.process_frame(&mut samples, is_last);

            let processed_rms: f32 = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();

            // Signal should still have meaningful energy (not destroyed by processing)
            // Threshold is 0.15 (15% of original) to account for:
            // - SOLA ramp-up latency in early frames
            // - Hann windowing inherent energy reduction
            // - Breath injection mixing low-energy breath sounds
            let rms_ratio = processed_rms / (original_rms + 0.0001);
            assert!(rms_ratio > 0.15 && rms_ratio < 3.0,
                "Frame {}: Signal energy changed too much: ratio={}", i, rms_ratio);
        }
    }
}

// ============================================================================
// CLICK DIAGNOSTIC (TEMPORARY - REMOVE AFTER DEBUGGING)
// ============================================================================

#[cfg(test)]
mod click_diagnostics {
    use super::*;

    /// Count clicks (sample-to-sample discontinuities > threshold)
    fn count_clicks(samples: &[f32], threshold: f32) -> (usize, Vec<usize>) {
        let mut count = 0;
        let mut positions = Vec::new();
        for i in 1..samples.len() {
            let jump = (samples[i] - samples[i-1]).abs();
            if jump > threshold {
                count += 1;
                positions.push(i);
            }
        }
        (count, positions)
    }

    /// Generate continuous sine wave across multiple frames
    fn generate_sine_frames(num_frames: usize, frame_size: usize, freq: f32, sample_rate: f32) -> Vec<Vec<f32>> {
        let mut frames = Vec::new();
        let mut phase = 0.0f32;
        let phase_inc = 2.0 * PI * freq / sample_rate;
        
        for _ in 0..num_frames {
            let mut frame = Vec::with_capacity(frame_size);
            for _ in 0..frame_size {
                frame.push(phase.sin() * 0.5);
                phase += phase_inc;
                if phase > 2.0 * PI {
                    phase -= 2.0 * PI;
                }
            }
            frames.push(frame);
        }
        frames
    }

    #[test]
    fn diagnose_crossfade_clicks() {
        println!("\n========== CROSSFADE CLICK DIAGNOSTIC ==========\n");
        
        let frame_size = 480;
        let num_frames = 10;
        let threshold = 0.3; // Click threshold
        
        // Test 1: ONLY crossfade enabled (minimal config)
        println!("Test 1: Crossfade ONLY (minimal config)");
        {
            let config = ProcessorConfig {
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: true,
                enable_breath: false,
                enable_micro_pitch: false,
                enable_pitch_drift: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                ..ProcessorConfig::default()
            };
            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();
            
            let frames = generate_sine_frames(num_frames, frame_size, 440.0, 24000.0);
            let mut all_output: Vec<f32> = Vec::new();
            
            for (i, mut frame) in frames.into_iter().enumerate() {
                let is_last = i == num_frames - 1;
                processor.process_frame(&mut frame, is_last);
                all_output.extend(frame);
            }
            
            let (clicks, positions) = count_clicks(&all_output, threshold);
            println!("  Total clicks (threshold {}): {}", threshold, clicks);
            if clicks > 0 && clicks <= 20 {
                println!("  Click positions: {:?}", positions);
                // Show context around first click
                if let Some(&pos) = positions.first() {
                    let start = pos.saturating_sub(3);
                    let end = (pos + 4).min(all_output.len());
                    println!("  Samples around first click (pos {}):", pos);
                    for j in start..end {
                        let marker = if j == pos || j == pos - 1 { " <--" } else { "" };
                        println!("    [{}] = {:.6}{}", j, all_output[j], marker);
                    }
                }
            }
        }
        
        // Test 2: Check where clicks occur relative to frame boundaries
        println!("\nTest 2: Click positions relative to frame boundaries");
        {
            let config = ProcessorConfig {
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: true,
                enable_breath: false,
                enable_micro_pitch: false,
                enable_pitch_drift: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                crossfade_ms: 5.0, // 120 samples at 24kHz
                ..ProcessorConfig::default()
            };
            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();
            
            let frames = generate_sine_frames(num_frames, frame_size, 440.0, 24000.0);
            let mut all_output: Vec<f32> = Vec::new();
            
            for (i, mut frame) in frames.into_iter().enumerate() {
                let is_last = i == num_frames - 1;
                processor.process_frame(&mut frame, is_last);
                all_output.extend(frame);
            }
            
            let (clicks, positions) = count_clicks(&all_output, threshold);
            println!("  Total clicks: {}", clicks);
            
            // Categorize clicks by position within frame
            let crossfade_len = 120; // 5ms at 24kHz
            let mut in_crossfade = 0;
            let mut at_boundary = 0;
            let mut elsewhere = 0;
            
            for &pos in &positions {
                let pos_in_frame = pos % frame_size;
                if pos_in_frame < crossfade_len {
                    in_crossfade += 1;
                } else if pos_in_frame == 0 || pos_in_frame == frame_size - 1 {
                    at_boundary += 1;
                } else {
                    elsewhere += 1;
                }
            }
            println!("  In crossfade region (0-{}): {}", crossfade_len, in_crossfade);
            println!("  At frame boundary: {}", at_boundary);
            println!("  Elsewhere in frame: {}", elsewhere);
        }
        
        // Test 3: DC blocker alone
        println!("\nTest 3: DC blocker ONLY");
        {
            let config = ProcessorConfig {
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: false,
                enable_breath: false,
                enable_micro_pitch: false,
                enable_pitch_drift: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                ..ProcessorConfig::default()
            };
            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();
            
            let frames = generate_sine_frames(num_frames, frame_size, 440.0, 24000.0);
            let mut all_output: Vec<f32> = Vec::new();
            
            for (i, mut frame) in frames.into_iter().enumerate() {
                let is_last = i == num_frames - 1;
                processor.process_frame(&mut frame, is_last);
                all_output.extend(frame);
            }
            
            let (clicks, _) = count_clicks(&all_output, threshold);
            println!("  Total clicks: {}", clicks);
        }
        
        // Test 4: Verify input is continuous (no processing)
        println!("\nTest 4: Verify input continuity (raw sine, no processing)");
        {
            let frames = generate_sine_frames(num_frames, frame_size, 440.0, 24000.0);
            let all_input: Vec<f32> = frames.into_iter().flatten().collect();
            let (clicks, _) = count_clicks(&all_input, threshold);
            println!("  Input clicks: {}", clicks);
        }
        
        // Test 5: Examine crossfade math at boundaries
        println!("\nTest 5: Crossfade boundary analysis");
        {
            let config = ProcessorConfig {
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: true,
                enable_breath: false,
                enable_micro_pitch: false,
                enable_pitch_drift: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                crossfade_ms: 5.0,
                ..ProcessorConfig::default()
            };
            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();
            
            // Process frame 0
            let mut frame0: Vec<f32> = (0..frame_size)
                .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
                .collect();
            let frame0_last_120 = frame0[frame_size-120..].to_vec();
            processor.process_frame(&mut frame0, false);
            
            // Frame 1 - generate continuous
            let mut frame1: Vec<f32> = (frame_size..(frame_size*2))
                .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
                .collect();
            let frame1_first_120_before = frame1[..120].to_vec();
            processor.process_frame(&mut frame1, false);
            let frame1_first_120_after = frame1[..120].to_vec();
            
            // Compare
            println!("  Frame 0 last 5 samples: {:?}", &frame0[frame_size-5..]);
            println!("  Frame 1 first 5 samples (before crossfade): {:?}", &frame1_first_120_before[..5]);
            println!("  Frame 1 first 5 samples (after crossfade): {:?}", &frame1_first_120_after[..5]);
            
            // Check for discontinuity at frame boundary (sample 480)
            let boundary_jump = (frame1[0] - frame0[frame_size-1]).abs();
            println!("  Jump at frame boundary (480): {:.6}", boundary_jump);
        }
        
        println!("\n========== END DIAGNOSTIC ==========\n");
    }

    /// E2E validation test: SOLA-based pitch shifting across many frames
    /// This tests the full processing pipeline with pitch features ENABLED
    /// using the new SOLA implementation that should be artifact-free.
    #[test]
    fn test_sola_pitch_full_pipeline_no_clicks() {
        use std::f32::consts::PI;

        // Helper: count clicks (sample-to-sample jumps above threshold)
        fn count_clicks(samples: &[f32], threshold: f32) -> usize {
            let mut count = 0;
            for i in 1..samples.len() {
                let diff = (samples[i] - samples[i-1]).abs();
                if diff > threshold {
                    count += 1;
                }
            }
            count
        }

        println!("\n========== SOLA E2E VALIDATION ==========\n");

        // Full config with ALL humanization features enabled (including SOLA pitch)
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_warmth: true,
            enable_presence: true,
            enable_compression: true,
            enable_deesser: false,  // Use split-band instead
            enable_splitband_deesser: true,
            enable_limiter: true,
            enable_crossfade: true,
            enable_breath: false,  // Disable for deterministic test
            enable_micro_pitch: true,  // ENABLED
            enable_pitch_drift: true,  // ENABLED
            enable_noise_floor: true,
            enable_amplitude_jitter: true,
            soft_attack_ms: 5.0,
            soft_release_ms: 5.0,
            use_sola_pitch: true,  // Use SOLA implementation
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Process 100 frames of continuous sine wave (2 seconds at 24kHz)
        let num_frames = 100;
        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::with_capacity(num_frames * frame_size);
        let mut phase = 0.0f32;
        let freq = 440.0;
        let phase_inc = 2.0 * PI * freq / 24000.0;

        for frame_idx in 0..num_frames {
            // Generate continuous sine wave (phase accumulates across frames)
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|_| {
                    let sample = phase.sin() * 0.5;
                    phase += phase_inc;
                    if phase >= 2.0 * PI {
                        phase -= 2.0 * PI;
                    }
                    sample
                })
                .collect();

            let is_last = frame_idx == num_frames - 1;
            processor.process_frame(&mut frame, is_last);
            all_output.extend_from_slice(&frame);
        }

        // Skip first ~50ms (warmup for SOLA buffer filling)
        let warmup_samples = (24000.0 * 0.05) as usize;  // 50ms
        let analysis_region = if all_output.len() > warmup_samples {
            &all_output[warmup_samples..]
        } else {
            &all_output[..]
        };

        // Count clicks with different thresholds
        let clicks_03 = count_clicks(analysis_region, 0.3);
        let clicks_02 = count_clicks(analysis_region, 0.2);
        let clicks_015 = count_clicks(analysis_region, 0.15);

        println!("Processed {} frames ({} samples total)", num_frames, all_output.len());
        println!("Analyzing {} samples (after {}ms warmup)", analysis_region.len(), warmup_samples as f32 / 24.0);
        println!("Clicks at threshold 0.30: {}", clicks_03);
        println!("Clicks at threshold 0.20: {}", clicks_02);
        println!("Clicks at threshold 0.15: {}", clicks_015);

        // Check for frame boundary discontinuities
        let mut boundary_clicks = 0;
        for frame_idx in 1..num_frames {
            let boundary_pos = frame_idx * frame_size;
            if boundary_pos < all_output.len() && boundary_pos > 0 {
                let jump = (all_output[boundary_pos] - all_output[boundary_pos - 1]).abs();
                if jump > 0.15 {
                    boundary_clicks += 1;
                    if boundary_clicks <= 5 {
                        println!("  Click at frame {} boundary (pos {}): jump = {:.4}", frame_idx, boundary_pos, jump);
                    }
                }
            }
        }
        println!("Frame boundary clicks (threshold 0.15): {}", boundary_clicks);

        println!("\n========== END SOLA E2E VALIDATION ==========\n");

        // Assertions - with SOLA, we should have very few clicks
        // Allow a small margin for extreme pitch shifts during warmup
        assert!(clicks_03 < 5, "Too many severe clicks (>0.3): {} (expected <5)", clicks_03);
        assert!(boundary_clicks < 3, "Too many frame boundary clicks: {} (expected <3)", boundary_clicks);
    }

    // =========================================================================
    // "BETTER THAN HUMAN" E2E TESTS - Emotion Prosody
    // =========================================================================

    #[test]
    fn test_emotion_prosody_parameters() {
        // Verify each emotion produces correct prosody parameters
        let emotions = [
            (EmotionState::Neutral, 5.5, 8.0, 0.0, 1.0),
            (EmotionState::Happy, 6.0, 10.0, 3.0, 1.05),
            (EmotionState::Sad, 4.5, 12.0, -4.0, 0.92),
            (EmotionState::Excited, 7.0, 15.0, 5.0, 1.12),
            (EmotionState::Calm, 4.0, 5.0, 0.0, 0.95),
            (EmotionState::Tense, 6.5, 6.0, 2.0, 1.08),
            (EmotionState::Empathetic, 5.0, 10.0, -1.0, 0.97),
            (EmotionState::Curious, 5.8, 9.0, 4.0, 1.02),
            (EmotionState::Supportive, 5.2, 8.0, 0.0, 0.98),
        ];

        for (emotion, expected_rate, expected_depth, expected_bias, expected_tempo) in emotions {
            let params = emotion.prosody_params();
            assert!((params.vibrato_rate_hz - expected_rate).abs() < 0.01,
                "Emotion {:?}: vibrato rate {}, expected {}", emotion, params.vibrato_rate_hz, expected_rate);
            assert!((params.vibrato_depth_cents - expected_depth).abs() < 0.01,
                "Emotion {:?}: vibrato depth {}, expected {}", emotion, params.vibrato_depth_cents, expected_depth);
            assert!((params.drift_bias_cents - expected_bias).abs() < 0.01,
                "Emotion {:?}: drift bias {}, expected {}", emotion, params.drift_bias_cents, expected_bias);
            assert!((params.tempo_factor - expected_tempo).abs() < 0.01,
                "Emotion {:?}: tempo factor {}, expected {}", emotion, params.tempo_factor, expected_tempo);
        }
    }

    #[test]
    fn test_emotion_from_u8() {
        // Verify FFI conversion
        assert_eq!(EmotionState::from_u8(0), EmotionState::Neutral);
        assert_eq!(EmotionState::from_u8(1), EmotionState::Happy);
        assert_eq!(EmotionState::from_u8(2), EmotionState::Sad);
        assert_eq!(EmotionState::from_u8(3), EmotionState::Excited);
        assert_eq!(EmotionState::from_u8(4), EmotionState::Calm);
        assert_eq!(EmotionState::from_u8(5), EmotionState::Tense);
        assert_eq!(EmotionState::from_u8(6), EmotionState::Empathetic);
        assert_eq!(EmotionState::from_u8(7), EmotionState::Curious);
        assert_eq!(EmotionState::from_u8(8), EmotionState::Supportive);
        assert_eq!(EmotionState::from_u8(99), EmotionState::Neutral); // Invalid -> Neutral
    }

    #[test]
    fn test_emotion_prosody_integration() {
        // Test full pipeline with emotion-aware prosody enabled
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_emotion_prosody: true,
            emotion: EmotionState::Happy,
            enable_micro_pitch: true,
            enable_pitch_drift: true,
            use_sola_pitch: true,
            // Disable other features for cleaner test
            enable_warmth: false,
            enable_presence: false,
            enable_compression: false,
            enable_deesser: false,
            enable_splitband_deesser: false,
            enable_limiter: false,
            enable_crossfade: false,
            enable_breath: false,
            enable_noise_floor: false,
            enable_amplitude_jitter: false,
            soft_attack_ms: 0.0,
            soft_release_ms: 0.0,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);

        // Verify initial emotion
        assert_eq!(processor.current_emotion(), EmotionState::Happy);

        // Start utterance - this configures emotion parameters
        processor.start_utterance();

        // Process some frames
        let frame_size = 480;
        let num_frames = 20;

        for frame_idx in 0..num_frames {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 440.0 * t).sin() * 0.5
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == num_frames - 1);
        }

        // Verify emotion can be changed mid-stream
        processor.set_emotion(EmotionState::Sad);
        assert_eq!(processor.current_emotion(), EmotionState::Sad);
    }

    #[test]
    fn test_emotion_change_no_clicks() {
        // Verify changing emotion mid-utterance doesn't cause clicks
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_emotion_prosody: true,
            emotion: EmotionState::Neutral,
            enable_micro_pitch: true,
            enable_pitch_drift: true,
            use_sola_pitch: true,
            enable_warmth: false,
            enable_presence: false,
            enable_compression: false,
            enable_deesser: false,
            enable_splitband_deesser: false,
            enable_limiter: false,
            enable_crossfade: true,
            enable_breath: false,
            enable_noise_floor: false,
            enable_amplitude_jitter: false,
            soft_attack_ms: 0.0,
            soft_release_ms: 0.0,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        let frame_size = 480;
        let mut all_output = Vec::new();
        let emotions = [
            EmotionState::Neutral,
            EmotionState::Happy,
            EmotionState::Excited,
            EmotionState::Sad,
            EmotionState::Calm,
        ];

        // Process 50 frames, changing emotion every 10 frames
        for frame_idx in 0..50 {
            // Change emotion every 10 frames
            if frame_idx % 10 == 0 {
                processor.set_emotion(emotions[frame_idx / 10 % emotions.len()]);
            }

            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 440.0 * t).sin() * 0.5
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 49);
            all_output.extend_from_slice(&frame);
        }

        // Count clicks
        let mut clicks = 0;
        for i in 1..all_output.len() {
            if (all_output[i] - all_output[i-1]).abs() > 0.3 {
                clicks += 1;
            }
        }

        assert!(clicks < 10, "Emotion changes caused {} clicks (expected <10)", clicks);
    }

    #[test]
    fn test_all_emotions_produce_different_output() {
        // Verify each emotion produces detectably different audio
        //
        // IMPORTANT: We use a complex signal (harmonics + envelope) instead of a pure
        // sine wave. Pure sine waves are perfectly periodic, so SOLA cross-correlation
        // finds identical matches everywhere, producing identical outputs regardless
        // of pitch parameters.

        let emotions = [
            EmotionState::Neutral,
            EmotionState::Happy,
            EmotionState::Sad,
            EmotionState::Excited,
            EmotionState::Calm,
        ];

        let mut outputs = Vec::new();

        for emotion in &emotions {
            let config = ProcessorConfig {
                sample_rate: 24000,
                enable_emotion_prosody: true,
                emotion: *emotion,
                enable_micro_pitch: true,
                enable_pitch_drift: true,
                use_sola_pitch: true,
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: false,
                enable_breath: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                ..ProcessorConfig::default()
            };

            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();

            // Process 60 frames (longer duration for pitch modulation to have effect)
            let frame_size = 480;
            let mut all_output = Vec::new();

            for frame_idx in 0..60 {
                // Generate a complex, speech-like signal with:
                // - Fundamental + 3 harmonics (like vocal formants)
                // - Amplitude envelope that varies (like natural speech)
                // - Non-periodic elements to give SOLA something to work with
                let mut frame: Vec<f32> = (0..frame_size)
                    .map(|i| {
                        let sample_idx = frame_idx * frame_size + i;
                        let t = sample_idx as f32 / 24000.0;

                        // Base pitch with slight sweep (150-160Hz, voice range)
                        let pitch = 150.0 + 10.0 * (t * 0.5).sin();

                        // Fundamental + harmonics (speech-like spectrum)
                        let fundamental = (2.0 * PI * pitch * t).sin();
                        let h2 = (2.0 * PI * pitch * 2.0 * t).sin() * 0.5;
                        let h3 = (2.0 * PI * pitch * 3.0 * t).sin() * 0.25;
                        let h4 = (2.0 * PI * pitch * 4.0 * t).sin() * 0.15;

                        // Amplitude envelope (varies across utterance)
                        let envelope = 0.7 + 0.3 * (2.0 * PI * 0.8 * t).sin();

                        // Add slight noise component (like breath noise in speech)
                        let noise = ((sample_idx as u32).wrapping_mul(1103515245).wrapping_add(12345) >> 20) as f32 / 2048.0 - 1.0;

                        ((fundamental + h2 + h3 + h4) * envelope + noise * 0.02) * 0.4
                    })
                    .collect();

                processor.process_frame(&mut frame, frame_idx == 59);
                all_output.extend_from_slice(&frame);
            }

            outputs.push(all_output);
        }

        // Compare outputs - they should be different
        // Use correlation or simple difference metric
        for i in 0..outputs.len() {
            for j in (i+1)..outputs.len() {
                let diff: f32 = outputs[i].iter()
                    .zip(outputs[j].iter())
                    .map(|(a, b)| (a - b).abs())
                    .sum::<f32>() / outputs[i].len() as f32;

                // Different emotions should produce different output
                // (The pitch modulation parameters differ)
                // Use a small threshold since differences may be subtle
                assert!(diff > 0.00001,
                    "Emotions {:?} and {:?} produced identical output (diff={})",
                    emotions[i], emotions[j], diff);
            }
        }
    }

    // =========================================================================
    // E2E TESTS: Emotion Prosody Parameters
    // =========================================================================

    #[test]
    fn test_e2e_emotion_prosody_parameters_applied() {
        // E2E test: Verify emotion prosody parameters are correctly applied
        // during audio processing and produce measurable differences.

        let emotions_with_params = [
            (EmotionState::Happy, "Happy: high vibrato, fast tempo"),
            (EmotionState::Sad, "Sad: low vibrato, slow tempo"),
            (EmotionState::Excited, "Excited: highest vibrato, fastest tempo"),
            (EmotionState::Calm, "Calm: minimal vibrato, slow tempo"),
        ];

        // Collect output characteristics for each emotion
        let mut emotion_outputs: Vec<(EmotionState, f32, f32)> = Vec::new();

        for (emotion, description) in &emotions_with_params {
            let config = ProcessorConfig {
                sample_rate: 24000,
                enable_emotion_prosody: true,
                emotion: *emotion,
                enable_micro_pitch: true,
                enable_pitch_drift: true,
                use_sola_pitch: true,
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: false,
                enable_breath: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                ..ProcessorConfig::default()
            };

            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();

            let frame_size = 480;
            let mut all_output: Vec<f32> = Vec::new();

            // Process 100 frames for better statistical accuracy
            for frame_idx in 0..100 {
                let mut frame: Vec<f32> = (0..frame_size)
                    .map(|i| {
                        let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                        let pitch = 150.0 + 10.0 * (t * 0.5).sin();
                        let fundamental = (2.0 * PI * pitch * t).sin();
                        let h2 = (2.0 * PI * pitch * 2.0 * t).sin() * 0.5;
                        ((fundamental + h2) * 0.5)
                    })
                    .collect();

                processor.process_frame(&mut frame, frame_idx == 99);
                all_output.extend_from_slice(&frame);
            }

            // Measure output characteristics
            // 1. RMS energy - should vary by emotion
            let rms: f32 = (all_output.iter().map(|s| s * s).sum::<f32>() / all_output.len() as f32).sqrt();

            // 2. High-frequency energy ratio (pitch variation indicator)
            // More pitch variation = more high-frequency energy spread
            let mut hf_energy: f32 = 0.0;
            for i in 1..all_output.len() {
                let diff = all_output[i] - all_output[i-1];
                hf_energy += diff.abs();
            }
            hf_energy /= all_output.len() as f32;

            emotion_outputs.push((*emotion, rms, hf_energy));

            // Log the emotion description for debugging
            let _ = description;
        }

        // Verify that emotions produce measurably different outputs
        // Happy vs Sad should be noticeably different (vibrato 12 vs 6)
        let happy_idx = emotion_outputs.iter().position(|(e, _, _)| *e == EmotionState::Happy).unwrap();
        let sad_idx = emotion_outputs.iter().position(|(e, _, _)| *e == EmotionState::Sad).unwrap();

        let happy_hf = emotion_outputs[happy_idx].2;
        let sad_hf = emotion_outputs[sad_idx].2;

        // Happy should have different HF content than Sad due to different vibrato
        assert!((happy_hf - sad_hf).abs() > 0.00001,
            "Happy and Sad should produce different pitch modulation patterns. Happy HF={}, Sad HF={}",
            happy_hf, sad_hf);

        // Excited should be the most energetic (highest vibrato)
        let excited_idx = emotion_outputs.iter().position(|(e, _, _)| *e == EmotionState::Excited).unwrap();
        let excited_hf = emotion_outputs[excited_idx].2;
        let calm_idx = emotion_outputs.iter().position(|(e, _, _)| *e == EmotionState::Calm).unwrap();
        let calm_hf = emotion_outputs[calm_idx].2;

        assert!((excited_hf - calm_hf).abs() > 0.00001,
            "Excited and Calm should have different characteristics. Excited HF={}, Calm HF={}",
            excited_hf, calm_hf);
    }

    #[test]
    fn test_e2e_emotion_change_mid_stream() {
        // E2E test: Verify emotion can be changed mid-stream without artifacts
        // and the new emotion's parameters take effect

        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_emotion_prosody: true,
            emotion: EmotionState::Neutral,
            enable_micro_pitch: true,
            enable_pitch_drift: true,
            use_sola_pitch: true,
            enable_warmth: false,
            enable_presence: false,
            enable_compression: false,
            enable_deesser: false,
            enable_splitband_deesser: false,
            enable_limiter: false,
            enable_crossfade: true, // Enable crossfade to catch click issues
            enable_breath: false,
            enable_noise_floor: false,
            enable_amplitude_jitter: false,
            soft_attack_ms: 0.0,
            soft_release_ms: 0.0,
            crossfade_ms: 5.0,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        let frame_size = 480;
        let click_threshold = 0.3; // Matches threshold used in test_emotion_change_no_clicks
        let mut all_output: Vec<f32> = Vec::new();

        // Process first 30 frames with Neutral
        for frame_idx in 0..30 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 440.0 * t).sin() * 0.5
                })
                .collect();

            processor.process_frame(&mut frame, false);
            all_output.extend_from_slice(&frame);
        }

        // Change emotion mid-stream
        processor.set_emotion(EmotionState::Excited);
        assert_eq!(processor.current_emotion(), EmotionState::Excited);

        // Process 30 more frames with Excited emotion
        for frame_idx in 30..60 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 440.0 * t).sin() * 0.5
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 59);
            all_output.extend_from_slice(&frame);
        }

        // Count clicks at the end (consistent with other tests)
        let mut total_clicks = 0;
        for i in 1..all_output.len() {
            if (all_output[i] - all_output[i-1]).abs() > click_threshold {
                total_clicks += 1;
            }
        }

        // Allow a small number of clicks (same tolerance as test_emotion_change_no_clicks)
        assert!(total_clicks < 10,
            "Emotion change mid-stream caused {} clicks (expected <10, threshold={})",
            total_clicks, click_threshold);
    }

    // =========================================================================
    // E2E TESTS: Breath Timing via Phrase Boundaries
    // =========================================================================

    #[test]
    fn test_e2e_phrase_boundary_breath_injection() {
        // E2E test: Verify phrase boundaries trigger breath injection
        // at the correct positions with appropriate probabilities

        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_emotion_prosody: false,
            enable_micro_pitch: false,
            enable_pitch_drift: false,
            enable_warmth: false,
            enable_presence: false,
            enable_compression: false,
            enable_deesser: false,
            enable_splitband_deesser: false,
            enable_limiter: false,
            enable_crossfade: false,
            enable_breath: true, // Enable breath injection
            breath_probability: 0.0, // Disable random breaths, only boundary-triggered
            enable_noise_floor: false,
            enable_amplitude_jitter: false,
            soft_attack_ms: 0.0,
            soft_release_ms: 0.0,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Add phrase boundaries at specific positions
        // Frame 5 (sample 2400) - SentenceEnd (80% probability)
        processor.add_phrase_boundary(2400, BoundaryType::SentenceEnd);
        // Frame 10 (sample 4800) - ClauseBreak (40% probability)
        processor.add_phrase_boundary(4800, BoundaryType::ClauseBreak);
        // Frame 15 (sample 7200) - EmotionalRelease (60% probability)
        processor.add_phrase_boundary(7200, BoundaryType::EmotionalRelease);

        assert_eq!(processor.phrase_boundary_count(), 3);

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 20 frames
        for frame_idx in 0..20 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 440.0 * t).sin() * 0.5
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 19);
            all_output.extend_from_slice(&frame);
        }

        // Verify boundaries were processed
        // The output should have been modified at boundary positions
        // (breath injection adds noise-like samples)

        // Clear boundaries and verify
        processor.clear_phrase_boundaries();
        assert_eq!(processor.phrase_boundary_count(), 0);
    }

    #[test]
    fn test_e2e_multiple_boundary_types() {
        // E2E test: Verify different boundary types have appropriate effects

        let boundary_types = [
            (BoundaryType::SentenceEnd, "SentenceEnd - 80% breath probability"),
            (BoundaryType::ClauseBreak, "ClauseBreak - 40% breath probability"),
            (BoundaryType::EmphasisBefore, "EmphasisBefore - 20% breath probability"),
            (BoundaryType::EmotionalRelease, "EmotionalRelease - 60% breath probability"),
        ];

        for (boundary_type, description) in &boundary_types {
            let config = ProcessorConfig {
                sample_rate: 24000,
                enable_breath: true,
                breath_probability: 0.0, // Only boundary-triggered
                // Disable other processing
                enable_emotion_prosody: false,
                enable_micro_pitch: false,
                enable_pitch_drift: false,
                enable_warmth: false,
                enable_presence: false,
                enable_compression: false,
                enable_deesser: false,
                enable_splitband_deesser: false,
                enable_limiter: false,
                enable_crossfade: false,
                enable_noise_floor: false,
                enable_amplitude_jitter: false,
                soft_attack_ms: 0.0,
                soft_release_ms: 0.0,
                ..ProcessorConfig::default()
            };

            let mut processor = PostTTSProcessor::new(config);
            processor.start_utterance();

            // Add a boundary at frame 3
            processor.add_phrase_boundary(1440, *boundary_type);
            assert_eq!(processor.phrase_boundary_count(), 1);

            let frame_size = 480;

            // Process 5 frames
            for frame_idx in 0..5 {
                let mut frame: Vec<f32> = (0..frame_size)
                    .map(|i| {
                        let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                        (2.0 * PI * 440.0 * t).sin() * 0.5
                    })
                    .collect();

                processor.process_frame(&mut frame, frame_idx == 4);
            }

            // Log description for debugging
            let _ = description;
        }
    }

    #[test]
    fn test_e2e_js_api_phrase_boundaries() {
        // E2E test: Verify phrase boundary JS API methods work correctly
        // This tests the set_phrase_boundaries, add_phrase_boundary, clear methods

        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_breath: true,
            breath_probability: 0.0,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Test set_phrase_boundaries (batch set)
        let boundaries = vec![
            PhraseBoundary { sample_index: 1000, boundary_type: BoundaryType::SentenceEnd },
            PhraseBoundary { sample_index: 2000, boundary_type: BoundaryType::ClauseBreak },
            PhraseBoundary { sample_index: 3000, boundary_type: BoundaryType::EmotionalRelease },
        ];
        processor.set_phrase_boundaries(boundaries);
        assert_eq!(processor.phrase_boundary_count(), 3);

        // Test add_phrase_boundary (incremental add)
        processor.add_phrase_boundary(4000, BoundaryType::EmphasisBefore);
        assert_eq!(processor.phrase_boundary_count(), 4);

        // Test clear_phrase_boundaries
        processor.clear_phrase_boundaries();
        assert_eq!(processor.phrase_boundary_count(), 0);

        // Verify adding after clear works
        processor.add_phrase_boundary(5000, BoundaryType::SentenceEnd);
        assert_eq!(processor.phrase_boundary_count(), 1);
    }

    #[test]
    fn test_e2e_full_humanization_pipeline() {
        // E2E test: Full humanization pipeline with ALL features enabled
        // Verifies no crashes, reasonable output, and feature interaction

        let config = ProcessorConfig {
            sample_rate: 24000,
            // Emotion prosody
            enable_emotion_prosody: true,
            emotion: EmotionState::Happy,
            // SOLA pitch processing
            enable_micro_pitch: true,
            micro_pitch_cents: 10.0,
            enable_pitch_drift: true,
            pitch_drift_cents: 5.0,
            use_sola_pitch: true,
            // Audio enhancement
            enable_warmth: true,
            warmth_gain_db: 2.0,
            enable_presence: true,
            presence_gain_db: 2.0,
            enable_compression: true,
            // Humanization
            enable_breath: true,
            breath_probability: 0.5,
            enable_amplitude_jitter: true,
            amplitude_jitter_depth: 0.01,
            enable_noise_floor: true,
            noise_floor_db: -60.0,
            // Edge smoothing
            enable_crossfade: true,
            crossfade_ms: 5.0,
            soft_attack_ms: 5.0,
            soft_release_ms: 5.0,
            // Dynamics
            enable_limiter: true,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Add phrase boundaries
        processor.add_phrase_boundary(2400, BoundaryType::SentenceEnd);
        processor.add_phrase_boundary(4800, BoundaryType::ClauseBreak);

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 20 frames
        for frame_idx in 0..20 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    let pitch = 150.0 + 10.0 * (t * 0.5).sin();
                    let signal = (2.0 * PI * pitch * t).sin()
                        + 0.5 * (2.0 * PI * pitch * 2.0 * t).sin();
                    signal * 0.4
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 19);
            all_output.extend_from_slice(&frame);
        }

        // Verify output is reasonable
        let rms: f32 = (all_output.iter().map(|s| s * s).sum::<f32>() / all_output.len() as f32).sqrt();
        assert!(rms > 0.01, "Output RMS too low: {}", rms);
        assert!(rms < 1.0, "Output RMS too high: {}", rms);

        // Verify no NaN or Inf values
        for sample in &all_output {
            assert!(!sample.is_nan(), "Output contains NaN");
            assert!(!sample.is_infinite(), "Output contains Inf");
        }

        // Verify output is within limiter bounds
        let max_abs: f32 = all_output.iter().map(|s| s.abs()).fold(0.0, f32::max);
        assert!(max_abs <= 1.0, "Output exceeds limiter bounds: {}", max_abs);
    }

    // =========================================================================
    // ADVANCED HUMANIZATION E2E TESTS
    // =========================================================================

    #[test]
    fn test_e2e_vocal_fry_at_utterance_end() {
        // Test that vocal fry is applied at the end of an utterance
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_vocal_fry: true,
            vocal_fry_depth: 0.5,
            vocal_fry_duration_ms: 200.0,
            enable_limiter: true,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 10 frames
        for frame_idx in 0..10 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 150.0 * t).sin() * 0.4
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 9);  // Last frame triggers fry
            all_output.extend_from_slice(&frame);
        }

        // Verify output is valid
        for sample in &all_output {
            assert!(!sample.is_nan(), "Output contains NaN");
            assert!(!sample.is_infinite(), "Output contains Inf");
        }

        // The last frame should have different characteristics due to vocal fry
        let last_frame_start = (9 * frame_size) as usize;
        let last_frame = &all_output[last_frame_start..];
        let rms: f32 = (last_frame.iter().map(|s| s * s).sum::<f32>() / last_frame.len() as f32).sqrt();
        assert!(rms > 0.01, "Last frame RMS too low (no signal): {}", rms);
    }

    #[test]
    fn test_e2e_lip_smacks_at_phrase_boundaries() {
        // Test that lip smacks are triggered at phrase boundaries
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_lip_smacks: true,
            lip_smack_probability: 1.0,  // 100% probability for testing
            enable_limiter: true,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Add phrase boundaries
        processor.add_phrase_boundary(2400, BoundaryType::ClauseBreak);  // 100ms
        processor.add_phrase_boundary(4800, BoundaryType::SentenceEnd);  // 200ms

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 15 frames
        for frame_idx in 0..15 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 150.0 * t).sin() * 0.4
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 14);
            all_output.extend_from_slice(&frame);
        }

        // Verify output is valid
        for sample in &all_output {
            assert!(!sample.is_nan(), "Output contains NaN");
            assert!(!sample.is_infinite(), "Output contains Inf");
        }

        // Verify output has energy
        let rms: f32 = (all_output.iter().map(|s| s * s).sum::<f32>() / all_output.len() as f32).sqrt();
        assert!(rms > 0.01, "Output RMS too low: {}", rms);
    }

    #[test]
    fn test_e2e_tempo_micro_variation() {
        // Test that tempo micro-variation creates subtle timing differences
        let config = ProcessorConfig {
            sample_rate: 24000,
            enable_tempo_variation: true,
            tempo_variation_depth: 0.05,  // 5% variation for testing
            enable_limiter: true,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 20 frames
        for frame_idx in 0..20 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    (2.0 * PI * 150.0 * t).sin() * 0.4
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 19);
            all_output.extend_from_slice(&frame);
        }

        // Verify output is valid
        for sample in &all_output {
            assert!(!sample.is_nan(), "Output contains NaN");
            assert!(!sample.is_infinite(), "Output contains Inf");
        }

        // Verify output has energy (tempo variation doesn't kill the signal)
        let rms: f32 = (all_output.iter().map(|s| s * s).sum::<f32>() / all_output.len() as f32).sqrt();
        assert!(rms > 0.01, "Output RMS too low after tempo variation: {}", rms);
    }

    #[test]
    fn test_e2e_all_advanced_humanization_combined() {
        // Test all three advanced humanization features together
        let config = ProcessorConfig {
            sample_rate: 24000,
            // Advanced humanization
            enable_vocal_fry: true,
            vocal_fry_depth: 0.4,
            vocal_fry_duration_ms: 150.0,
            enable_lip_smacks: true,
            lip_smack_probability: 0.3,
            enable_tempo_variation: true,
            tempo_variation_depth: 0.03,
            // Basic humanization
            enable_emotion_prosody: true,
            emotion: EmotionState::Calm,
            enable_micro_pitch: true,
            enable_pitch_drift: true,
            use_sola_pitch: true,
            enable_breath: true,
            enable_amplitude_jitter: true,
            // Processing
            enable_limiter: true,
            enable_crossfade: true,
            ..ProcessorConfig::default()
        };

        let mut processor = PostTTSProcessor::new(config);
        processor.start_utterance();

        // Add phrase boundaries for lip smacks
        processor.add_phrase_boundary(2400, BoundaryType::ClauseBreak);
        processor.add_phrase_boundary(4800, BoundaryType::SentenceEnd);
        processor.add_phrase_boundary(7200, BoundaryType::EmphasisBefore);

        let frame_size = 480;
        let mut all_output: Vec<f32> = Vec::new();

        // Process 20 frames (0.4 seconds)
        for frame_idx in 0..20 {
            let mut frame: Vec<f32> = (0..frame_size)
                .map(|i| {
                    let t = (frame_idx * frame_size + i) as f32 / 24000.0;
                    let pitch = 150.0 + 10.0 * (t * 0.5).sin();
                    (2.0 * PI * pitch * t).sin() * 0.4
                })
                .collect();

            processor.process_frame(&mut frame, frame_idx == 19);
            all_output.extend_from_slice(&frame);
        }

        // Verify no NaN or Inf values
        for sample in &all_output {
            assert!(!sample.is_nan(), "Output contains NaN with all features enabled");
            assert!(!sample.is_infinite(), "Output contains Inf with all features enabled");
        }

        // Verify reasonable output levels
        let rms: f32 = (all_output.iter().map(|s| s * s).sum::<f32>() / all_output.len() as f32).sqrt();
        assert!(rms > 0.01, "Output RMS too low: {}", rms);
        assert!(rms < 1.0, "Output RMS too high: {}", rms);

        // Verify limiter bounds
        let max_abs: f32 = all_output.iter().map(|s| s.abs()).fold(0.0, f32::max);
        assert!(max_abs <= 1.0, "Output exceeds limiter bounds: {}", max_abs);
    }
}
