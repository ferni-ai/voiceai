//! Pre-STT Audio Enhancement Pipeline
//!
//! Enhances inbound user audio before sending to Speech-to-Text (Gemini/Google).
//!
//! Key components:
//! - **AGC (Automatic Gain Control)** - Normalize levels from quiet/loud speakers
//! - **Noise Suppression** - Remove background noise (spectral subtraction)
//! - **Bandwidth Extension** - Enhance 8kHz Twilio audio to 16kHz
//! - **Echo Cancellation** - (Future) Remove speaker bleed-through
//!
//! # Performance
//! - All buffers pre-allocated at session start
//! - SIMD-accelerated where applicable
//! - Target: <2ms processing per 20ms frame

use std::f32::consts::PI;
use wide::f32x8;

// ============================================================================
// AGC (AUTOMATIC GAIN CONTROL)
// ============================================================================

/// Automatic Gain Control for consistent input levels
///
/// Uses a peak-following envelope with attack/release dynamics.
/// Target level: -20 dBFS (allows headroom for transients)
pub struct AutoGainControl {
    /// Target RMS level (linear, not dB)
    target_level: f32,
    /// Current gain
    current_gain: f32,
    /// Maximum allowed gain (prevents boosting noise)
    max_gain: f32,
    /// Minimum gain (prevents crushing loud signals)
    min_gain: f32,
    /// Envelope attack time (ms): how fast a rise in level is tracked
    attack_ms: f32,
    /// Envelope release time (ms): how fast a fall in level is tracked
    release_ms: f32,
    /// Envelope follower state
    envelope: f32,
    /// Sample rate for coefficient calculation
    sample_rate: u32,
    /// Gate threshold - don't boost below this (avoids amplifying noise floor)
    gate_threshold: f32,
}

impl AutoGainControl {
    pub fn new(sample_rate: u32) -> Self {
        // Attack: 5ms, Release: 100ms
        let attack_ms = 5.0;
        let release_ms = 100.0;

        Self {
            target_level: 0.1, // ~-20 dBFS
            current_gain: 1.0,
            max_gain: 10.0,   // +20 dB max boost
            min_gain: 0.1,    // -20 dB max reduction
            attack_ms,
            release_ms,
            envelope: 0.0,
            sample_rate,
            gate_threshold: 0.001, // ~-60 dBFS noise gate
        }
    }

    /// Gain turns down this fast when the level jumps (ms to ~90%).
    const GAIN_ATTACK_MS: f32 = 50.0;
    /// Gain turns up this gently when the level drops, to avoid audible pumping.
    const GAIN_RELEASE_MS: f32 = 400.0;

    /// Per-update smoothing coefficient for a time constant, given how much
    /// audio one update covers. The state is updated once per frame, so the
    /// coefficient must use the frame's duration: computing it per sample
    /// (as before) and applying it per 20 ms frame stretched a 100 ms release
    /// to ~32 s and left a caller's speech turned down long after a loud moment.
    fn time_constant_to_coeff(time_ms: f32, update_ms: f32) -> f32 {
        (-2.2 * update_ms / time_ms).exp() // -2.2 ≈ ln(0.1): ~90% of the way in time_ms
    }

    /// Process a frame of audio in-place
    pub fn process(&mut self, samples: &mut [f32]) {
        if samples.is_empty() {
            return;
        }

        // Calculate RMS of input
        let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / samples.len() as f32).sqrt();

        // Noise gate: don't process very quiet signals
        if rms < self.gate_threshold {
            // Apply current gain (don't change it)
            for sample in samples.iter_mut() {
                *sample *= self.current_gain;
            }
            return;
        }

        let frame_ms = samples.len() as f32 * 1000.0 / self.sample_rate as f32;

        // Envelope follower with attack/release
        let coeff = if rms > self.envelope {
            Self::time_constant_to_coeff(self.attack_ms, frame_ms)
        } else {
            Self::time_constant_to_coeff(self.release_ms, frame_ms)
        };
        self.envelope = self.envelope * coeff + rms * (1.0 - coeff);

        // Calculate target gain
        let target_gain = if self.envelope > 0.0001 {
            (self.target_level / self.envelope).clamp(self.min_gain, self.max_gain)
        } else {
            1.0
        };

        // Move the gain toward the target: quickly down, gently up. (A fixed
        // 0.99/0.01 blend per frame was a ~2 s time constant both ways.)
        let gain_ms = if target_gain < self.current_gain {
            Self::GAIN_ATTACK_MS
        } else {
            Self::GAIN_RELEASE_MS
        };
        let g = Self::time_constant_to_coeff(gain_ms, frame_ms);
        self.current_gain = self.current_gain * g + target_gain * (1.0 - g);

        // Apply gain with SIMD
        self.apply_gain_simd(samples);
    }

    /// SIMD-accelerated gain application
    #[inline]
    fn apply_gain_simd(&self, samples: &mut [f32]) {
        let gain = f32x8::splat(self.current_gain);
        let chunks = samples.len() / 8;

        for i in 0..chunks {
            let base = i * 8;
            let v = f32x8::new([
                samples[base],
                samples[base + 1],
                samples[base + 2],
                samples[base + 3],
                samples[base + 4],
                samples[base + 5],
                samples[base + 6],
                samples[base + 7],
            ]);
            let result = v * gain;
            let arr = result.to_array();
            samples[base..base + 8].copy_from_slice(&arr);
        }

        // Handle remaining samples
        for i in (chunks * 8)..samples.len() {
            samples[i] *= self.current_gain;
        }
    }

    /// Get current gain for monitoring
    pub fn current_gain(&self) -> f32 {
        self.current_gain
    }

    /// Get current envelope level
    pub fn envelope_level(&self) -> f32 {
        self.envelope
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.current_gain = 1.0;
        self.envelope = 0.0;
    }
}

// ============================================================================
// NOISE SUPPRESSION (Spectral Subtraction)
// ============================================================================

/// Noise suppression using spectral subtraction
///
/// Estimates noise floor during silence, then subtracts it from speech.
/// Simple but effective for stationary noise (fans, AC, etc.)
pub struct NoiseSupressor {
    /// FFT size (256 for 16ms at 16kHz)
    fft_size: usize,
    /// Noise floor estimate (magnitude spectrum)
    noise_floor: Vec<f32>,
    /// Smoothed magnitude spectrum for noise estimation
    noise_estimate: Vec<f32>,
    /// Alpha for noise floor smoothing (0.98 = slow update)
    noise_alpha: f32,
    /// Alpha for signal smoothing
    signal_alpha: f32,
    /// Oversubtraction factor (1.0-2.0, higher = more aggressive)
    oversubtraction: f32,
    /// Spectral floor (prevents musical noise)
    spectral_floor: f32,
    /// Whether we're currently in noise estimation mode
    in_noise_estimation: bool,
    /// Number of noise frames collected
    noise_frames: usize,
    /// Minimum noise frames before active suppression
    min_noise_frames: usize,
    /// Pre-allocated FFT buffers
    fft_real: Vec<f32>,
    fft_imag: Vec<f32>,
    /// Hanning window
    window: Vec<f32>,
    /// Previous frame for overlap-add
    prev_frame: Vec<f32>,
    /// Sample rate
    sample_rate: u32,
}

impl NoiseSupressor {
    pub fn new(sample_rate: u32) -> Self {
        let fft_size = 256; // 16ms at 16kHz
        let half_fft = fft_size / 2 + 1;

        // Create Hanning window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / (fft_size - 1) as f32).cos()))
            .collect();

        Self {
            fft_size,
            noise_floor: vec![0.0; half_fft],
            noise_estimate: vec![0.0; half_fft],
            noise_alpha: 0.98,
            signal_alpha: 0.8,
            oversubtraction: 1.5,
            spectral_floor: 0.002, // -54 dB floor
            in_noise_estimation: true,
            noise_frames: 0,
            min_noise_frames: 10, // ~200ms of initial noise estimation
            fft_real: vec![0.0; fft_size],
            fft_imag: vec![0.0; fft_size],
            window,
            prev_frame: vec![0.0; fft_size],
            sample_rate,
        }
    }

    /// Process a frame of audio
    ///
    /// Returns true if noise suppression was applied
    pub fn process(&mut self, samples: &mut [f32], is_speech: bool) -> bool {
        if samples.len() > self.fft_size {
            // Frame too large, process in chunks
            let mut processed = false;
            for chunk in samples.chunks_mut(self.fft_size) {
                processed = self.process_chunk(chunk, is_speech) || processed;
            }
            return processed;
        }

        self.process_chunk(samples, is_speech)
    }

    fn process_chunk(&mut self, samples: &mut [f32], is_speech: bool) -> bool {
        // If still in initial noise estimation and no speech, update estimate
        if !is_speech || self.noise_frames < self.min_noise_frames {
            self.update_noise_estimate(samples);
            return false;
        }

        // Apply spectral subtraction
        self.apply_spectral_subtraction(samples);
        true
    }

    /// Update noise floor estimate during silence
    fn update_noise_estimate(&mut self, samples: &[f32]) {
        // Apply window
        let len = samples.len().min(self.fft_size);
        for i in 0..len {
            self.fft_real[i] = samples[i] * self.window[i];
        }
        for i in len..self.fft_size {
            self.fft_real[i] = 0.0;
        }
        self.fft_imag.fill(0.0);

        // Simple DFT for magnitude (we don't need full FFT for noise estimation)
        let half_fft = self.fft_size / 2 + 1;
        for k in 0..half_fft {
            let mut re = 0.0f32;
            let mut im = 0.0f32;
            let omega = 2.0 * PI * k as f32 / self.fft_size as f32;

            for n in 0..self.fft_size {
                let angle = omega * n as f32;
                re += self.fft_real[n] * angle.cos();
                im -= self.fft_real[n] * angle.sin();
            }

            let mag = (re * re + im * im).sqrt();

            // Smoothed noise estimate
            self.noise_estimate[k] = self.noise_alpha * self.noise_estimate[k]
                + (1.0 - self.noise_alpha) * mag;

            // Update noise floor (take maximum for robustness)
            if self.noise_frames < self.min_noise_frames {
                self.noise_floor[k] = self.noise_floor[k].max(mag);
            } else {
                // Slow adaptation after initial estimation
                self.noise_floor[k] = 0.999 * self.noise_floor[k]
                    + 0.001 * self.noise_estimate[k];
            }
        }

        self.noise_frames += 1;
    }

    /// Apply spectral subtraction to remove noise
    fn apply_spectral_subtraction(&mut self, samples: &mut [f32]) {
        let len = samples.len().min(self.fft_size);

        // Apply window and copy to FFT buffer
        for i in 0..len {
            self.fft_real[i] = samples[i] * self.window[i];
        }
        for i in len..self.fft_size {
            self.fft_real[i] = 0.0;
        }
        self.fft_imag.fill(0.0);

        // DFT
        let half_fft = self.fft_size / 2 + 1;
        let mut mags = vec![0.0f32; half_fft];
        let mut phases = vec![0.0f32; half_fft];

        for k in 0..half_fft {
            let mut re = 0.0f32;
            let mut im = 0.0f32;
            let omega = 2.0 * PI * k as f32 / self.fft_size as f32;

            for n in 0..self.fft_size {
                let angle = omega * n as f32;
                re += self.fft_real[n] * angle.cos();
                im -= self.fft_real[n] * angle.sin();
            }

            mags[k] = (re * re + im * im).sqrt();
            phases[k] = im.atan2(re);
        }

        // Spectral subtraction with oversubtraction and spectral floor
        for k in 0..half_fft {
            let subtracted = mags[k] - self.oversubtraction * self.noise_floor[k];
            let floor = self.spectral_floor * mags[k];
            mags[k] = subtracted.max(floor);
        }

        // IDFT
        self.fft_real.fill(0.0);
        for n in 0..self.fft_size {
            for k in 0..half_fft {
                let angle = 2.0 * PI * k as f32 * n as f32 / self.fft_size as f32;
                // Reconstruct with modified magnitude and original phase
                let factor = if k == 0 || k == half_fft - 1 { 1.0 } else { 2.0 };
                self.fft_real[n] += factor * mags[k] * (angle + phases[k]).cos();
            }
            self.fft_real[n] /= self.fft_size as f32;
        }

        // Overlap-add with previous frame
        let overlap = self.fft_size / 2;
        for i in 0..overlap.min(len) {
            samples[i] = self.fft_real[i] * self.window[i] + self.prev_frame[overlap + i];
        }
        for i in overlap..len {
            samples[i] = self.fft_real[i] * self.window[i];
        }

        // Store current frame for next overlap
        self.prev_frame[..self.fft_size].copy_from_slice(&self.fft_real);
    }

    /// Force noise re-estimation (call when entering a new environment)
    pub fn reset_noise_estimate(&mut self) {
        self.noise_floor.fill(0.0);
        self.noise_estimate.fill(0.0);
        self.noise_frames = 0;
    }

    /// Check if noise estimation is complete
    pub fn is_ready(&self) -> bool {
        self.noise_frames >= self.min_noise_frames
    }

    /// Reset all state
    pub fn reset(&mut self) {
        self.reset_noise_estimate();
        self.prev_frame.fill(0.0);
    }
}

// ============================================================================
// BANDWIDTH EXTENSION (8kHz → 16kHz)
// ============================================================================

/// Bandwidth extension for Twilio 8kHz audio
///
/// Uses spectral folding and harmonic generation to reconstruct
/// high-frequency content that was lost in the 8kHz encoding.
pub struct BandwidthExtender {
    /// Target sample rate
    target_rate: u32,
    /// Highpass filter state for harmonic generation
    hp_state: [f32; 2],
    /// Lowpass filter state for smoothing
    lp_state: [f32; 2],
    /// Previous samples for interpolation
    prev_samples: Vec<f32>,
    /// Excitation gain for high frequencies
    excitation_gain: f32,
}

impl BandwidthExtender {
    pub fn new() -> Self {
        Self {
            target_rate: 16000,
            hp_state: [0.0; 2],
            lp_state: [0.0; 2],
            prev_samples: vec![0.0; 4],
            excitation_gain: 0.3, // Subtle high-frequency addition
        }
    }

    /// Upsample from 8kHz to 16kHz with bandwidth extension
    ///
    /// Takes 8kHz input and returns 16kHz output with reconstructed highs
    pub fn process(&mut self, samples_8k: &[f32]) -> Vec<f32> {
        let len_16k = samples_8k.len() * 2;
        let mut output = vec![0.0f32; len_16k];

        // Step 1: Linear interpolation upsample (basic)
        for i in 0..samples_8k.len() {
            let idx = i * 2;
            output[idx] = samples_8k[i];

            // Interpolate between samples
            let next = if i + 1 < samples_8k.len() {
                samples_8k[i + 1]
            } else {
                samples_8k[i]
            };
            output[idx + 1] = (samples_8k[i] + next) * 0.5;
        }

        // Step 2: Apply anti-imaging lowpass (cutoff ~7kHz)
        self.apply_anti_imaging(&mut output);

        // Step 3: Generate high-frequency excitation
        let excitation = self.generate_excitation(&output);

        // Step 4: Add shaped excitation to output
        for i in 0..len_16k {
            output[i] += excitation[i] * self.excitation_gain;
        }

        // Step 5: Final smoothing
        self.apply_smoothing(&mut output);

        output
    }

    /// Anti-imaging lowpass filter
    fn apply_anti_imaging(&mut self, samples: &mut [f32]) {
        // Simple 2-pole lowpass at ~7kHz (Butterworth-ish)
        // For 16kHz sample rate: fc = 7000, Q = 0.707
        let fc = 7000.0;
        let fs = 16000.0;
        let w0 = 2.0 * PI * fc / fs;
        let alpha = w0.sin() / (2.0 * 0.707);

        let a0 = 1.0 + alpha;
        let b0 = (1.0 - w0.cos()) / 2.0 / a0;
        let b1 = (1.0 - w0.cos()) / a0;
        let b2 = b0;
        let a1 = (-2.0 * w0.cos()) / a0;
        let a2 = (1.0 - alpha) / a0;

        for i in 0..samples.len() {
            let input = samples[i];
            let output = b0 * input + b1 * self.lp_state[0] + b2 * self.lp_state[1]
                - a1 * self.lp_state[0] - a2 * self.lp_state[1];

            self.lp_state[1] = self.lp_state[0];
            self.lp_state[0] = input;
            samples[i] = output;
        }
    }

    /// Generate high-frequency excitation from signal
    fn generate_excitation(&mut self, samples: &[f32]) -> Vec<f32> {
        let mut excitation = vec![0.0f32; samples.len()];

        // Highpass filter to extract "energy" contour
        let fc = 4000.0;
        let fs = 16000.0;
        let w0 = 2.0 * PI * fc / fs;
        let alpha = w0.sin() / 1.4142;

        let a0 = 1.0 + alpha;
        let b0 = (1.0 + w0.cos()) / 2.0 / a0;
        let b1 = -(1.0 + w0.cos()) / a0;
        let b2 = b0;
        let a1 = (-2.0 * w0.cos()) / a0;
        let a2 = (1.0 - alpha) / a0;

        let mut hp_z1 = 0.0f32;
        let mut hp_z2 = 0.0f32;

        for i in 0..samples.len() {
            // Highpass
            let hp_out = b0 * samples[i] + b1 * hp_z1 + b2 * hp_z2
                - a1 * hp_z1 - a2 * hp_z2;
            hp_z2 = hp_z1;
            hp_z1 = samples[i];

            // Harmonic generation (soft clipping for odd harmonics)
            let x = hp_out * 3.0;
            let shaped = x / (1.0 + x.abs()); // Soft saturator

            excitation[i] = shaped;
        }

        excitation
    }

    /// Final smoothing filter
    fn apply_smoothing(&mut self, samples: &mut [f32]) {
        // Simple 1-pole lowpass for smoothness
        let alpha = 0.9;
        let mut z = 0.0f32;

        for sample in samples.iter_mut() {
            z = alpha * z + (1.0 - alpha) * *sample;
            *sample = z;
        }
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.hp_state = [0.0; 2];
        self.lp_state = [0.0; 2];
        self.prev_samples.fill(0.0);
    }
}

impl Default for BandwidthExtender {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// HIGH-PASS FILTER (DC Removal & Rumble Filter)
// ============================================================================

/// DC blocking and rumble removal filter
///
/// Removes DC offset and low-frequency rumble that can confuse STT
pub struct HighPassFilter {
    /// Filter state
    z1: f32,
    z2: f32,
    /// Output state
    y1: f32,
    y2: f32,
    /// Cutoff frequency
    cutoff_hz: f32,
    /// Sample rate
    sample_rate: u32,
}

impl HighPassFilter {
    pub fn new(cutoff_hz: f32, sample_rate: u32) -> Self {
        Self {
            z1: 0.0,
            z2: 0.0,
            y1: 0.0,
            y2: 0.0,
            cutoff_hz,
            sample_rate,
        }
    }

    /// Process samples in-place
    pub fn process(&mut self, samples: &mut [f32]) {
        // 2-pole Butterworth highpass
        let w0 = 2.0 * PI * self.cutoff_hz / self.sample_rate as f32;
        let alpha = w0.sin() / (2.0 * 0.707);

        let a0 = 1.0 + alpha;
        let b0 = (1.0 + w0.cos()) / 2.0 / a0;
        let b1 = -(1.0 + w0.cos()) / a0;
        let b2 = b0;
        let a1 = (-2.0 * w0.cos()) / a0;
        let a2 = (1.0 - alpha) / a0;

        for sample in samples.iter_mut() {
            let input = *sample;
            let output = b0 * input + b1 * self.z1 + b2 * self.z2
                - a1 * self.y1 - a2 * self.y2;

            self.z2 = self.z1;
            self.z1 = input;
            self.y2 = self.y1;
            self.y1 = output;

            *sample = output;
        }
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

// ============================================================================
// PRE-STT PROCESSOR (Unified Pipeline)
// ============================================================================

/// Configuration for Pre-STT processing
#[derive(Clone)]
pub struct PreSTTConfig {
    /// Sample rate of input audio
    pub sample_rate: u32,
    /// Enable AGC
    pub enable_agc: bool,
    /// Enable noise suppression
    pub enable_noise_suppression: bool,
    /// Enable high-pass filter (DC removal)
    pub enable_highpass: bool,
    /// High-pass cutoff frequency
    pub highpass_cutoff_hz: f32,
    /// Enable bandwidth extension (for 8kHz input)
    pub enable_bandwidth_extension: bool,
    /// Input is 8kHz (Twilio)
    pub input_is_8khz: bool,
}

impl Default for PreSTTConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            enable_agc: true,
            enable_noise_suppression: true,
            enable_highpass: true,
            highpass_cutoff_hz: 80.0, // Remove rumble below 80Hz
            enable_bandwidth_extension: false,
            input_is_8khz: false,
        }
    }
}

/// Processing statistics
#[derive(Default, Clone)]
pub struct PreSTTStats {
    /// Number of frames processed
    pub frames_processed: u64,
    /// Current AGC gain
    pub agc_gain: f32,
    /// Whether noise suppression is ready
    pub noise_suppression_ready: bool,
    /// Whether bandwidth extension was applied
    pub bandwidth_extended: bool,
}

/// Unified Pre-STT audio processor
///
/// Chains: DC Removal → Bandwidth Extension → AGC → Noise Suppression
pub struct PreSTTProcessor {
    config: PreSTTConfig,
    agc: AutoGainControl,
    noise_suppressor: NoiseSupressor,
    highpass: HighPassFilter,
    bandwidth_extender: BandwidthExtender,
    stats: PreSTTStats,
}

impl PreSTTProcessor {
    /// The rate the filters, AGC and noise suppressor run at. Bandwidth
    /// extension runs first, so for 8 kHz input with extension on they see
    /// 16 kHz audio. Callers describe their input (TS sends sampleRate 8000
    /// with inputIs8Khz for Twilio); building the filters at 8 kHz for 16 kHz
    /// audio would double every cutoff and halve every time constant.
    pub fn processing_rate(config: &PreSTTConfig) -> u32 {
        if config.input_is_8khz {
            if config.enable_bandwidth_extension { 16000 } else { 8000 }
        } else {
            config.sample_rate
        }
    }

    pub fn new(config: PreSTTConfig) -> Self {
        let rate = Self::processing_rate(&config);

        Self {
            agc: AutoGainControl::new(rate),
            noise_suppressor: NoiseSupressor::new(rate),
            highpass: HighPassFilter::new(config.highpass_cutoff_hz, rate),
            bandwidth_extender: BandwidthExtender::new(),
            stats: PreSTTStats::default(),
            config,
        }
    }

    /// Create with default config (all features enabled for 16kHz)
    pub fn with_defaults() -> Self {
        Self::new(PreSTTConfig::default())
    }

    /// Create configured for Twilio (8kHz → 16kHz with bandwidth extension)
    pub fn for_twilio() -> Self {
        Self::new(PreSTTConfig {
            sample_rate: 16000,
            enable_agc: true,
            enable_noise_suppression: true,
            enable_highpass: true,
            highpass_cutoff_hz: 80.0,
            enable_bandwidth_extension: true,
            input_is_8khz: true,
        })
    }

    /// Process an audio frame
    ///
    /// For 8kHz input with bandwidth extension enabled, returns 16kHz output.
    /// Otherwise processes in-place and returns the same buffer.
    ///
    /// # Arguments
    /// * `samples` - Input audio samples
    /// * `is_speech` - VAD result (true if speech detected)
    ///
    /// # Returns
    /// Processed samples (may be different length if upsampled)
    pub fn process(&mut self, samples: &[f32], is_speech: bool) -> Vec<f32> {
        self.stats.frames_processed += 1;

        // Step 1: Bandwidth extension (8kHz → 16kHz) if needed
        let mut working: Vec<f32> = if self.config.enable_bandwidth_extension && self.config.input_is_8khz {
            self.stats.bandwidth_extended = true;
            self.bandwidth_extender.process(samples)
        } else {
            self.stats.bandwidth_extended = false;
            samples.to_vec()
        };

        // Step 2: DC removal / highpass
        if self.config.enable_highpass {
            self.highpass.process(&mut working);
        }

        // Step 3: AGC
        if self.config.enable_agc {
            self.agc.process(&mut working);
            self.stats.agc_gain = self.agc.current_gain();
        }

        // Step 4: Noise suppression
        if self.config.enable_noise_suppression {
            self.noise_suppressor.process(&mut working, is_speech);
            self.stats.noise_suppression_ready = self.noise_suppressor.is_ready();
        }

        working
    }

    /// Process Int16 samples (common format from LiveKit)
    pub fn process_i16(&mut self, samples: &[i16], is_speech: bool) -> Vec<f32> {
        // Convert to f32
        let f32_samples: Vec<f32> = samples.iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();

        self.process(&f32_samples, is_speech)
    }

    /// Get processing statistics
    pub fn stats(&self) -> PreSTTStats {
        self.stats.clone()
    }

    /// Reset noise estimation (call when entering new environment)
    pub fn reset_noise_estimate(&mut self) {
        self.noise_suppressor.reset_noise_estimate();
    }

    /// Full reset
    pub fn reset(&mut self) {
        self.agc.reset();
        self.noise_suppressor.reset();
        self.highpass.reset();
        self.bandwidth_extender.reset();
        self.stats = PreSTTStats::default();
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_twilio_config_as_sent_by_ts_matches_for_twilio() {
        // TS describes Twilio input as 8 kHz; for_twilio() says 16 kHz (the
        // rate after bandwidth extension). Both must build the same processor.
        let from_ts = PreSTTConfig {
            sample_rate: 8000,
            enable_agc: true,
            enable_noise_suppression: true,
            enable_highpass: true,
            highpass_cutoff_hz: 80.0,
            enable_bandwidth_extension: true,
            input_is_8khz: true,
        };
        let mut a = PreSTTProcessor::new(from_ts);
        let mut b = PreSTTProcessor::for_twilio();
        for k in 0..20 {
            let frame: Vec<f32> = (0..160)
                .map(|i| ((2.0 * PI * 300.0 * (k * 160 + i) as f32 / 8000.0).sin() * 0.3))
                .collect();
            assert_eq!(a.process(&frame, true), b.process(&frame, true));
        }
    }

    #[test]
    fn test_agc_boosts_quiet_signal() {
        let mut agc = AutoGainControl::new(16000);

        // Quiet signal (-40 dBFS): a fresh 20 ms frame each time
        let quiet: Vec<f32> = (0..320)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 16000.0).sin() * 0.01)
            .collect();

        // 200 ms of quiet speech
        for _ in 0..10 {
            agc.process(&mut quiet.clone());
        }

        // Gain should have increased
        assert!(agc.current_gain() > 1.5, "AGC should boost quiet signal");
    }

    #[test]
    fn test_agc_reduces_loud_signal() {
        let mut agc = AutoGainControl::new(16000);

        // Loud signal (-3 dBFS): a fresh 20 ms frame each time, as live audio arrives
        let loud: Vec<f32> = (0..320)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 16000.0).sin() * 0.7)
            .collect();

        // 200 ms of loud speech
        for _ in 0..10 {
            agc.process(&mut loud.clone());
        }

        // Gain should have decreased
        assert!(agc.current_gain() < 0.5, "AGC should reduce loud signal");
    }

    #[test]
    fn test_agc_recovers_within_a_second_after_a_loud_moment() {
        let mut agc = AutoGainControl::new(16000);
        let tone = |amp: f32| -> Vec<f32> {
            (0..320).map(|i| (2.0 * PI * 220.0 * i as f32 / 16000.0).sin() * amp).collect()
        };
        // Normal speech level, then a loud laugh, then normal speech again.
        for _ in 0..50 {
            agc.process(&mut tone(0.14));
        }
        let settled = agc.current_gain();
        for _ in 0..15 {
            agc.process(&mut tone(0.9));
        }
        assert!(agc.current_gain() < settled * 0.5, "the loud moment turns the gain down");
        for _ in 0..50 {
            agc.process(&mut tone(0.14)); // one second
        }
        assert!(
            agc.current_gain() > settled * 0.8,
            "gain back near {settled} within a second, got {}",
            agc.current_gain()
        );
    }

    #[test]
    fn test_bandwidth_extender_doubles_length() {
        let bwe = BandwidthExtender::new();
        let input_8k: Vec<f32> = vec![0.0; 160]; // 20ms at 8kHz

        let mut extender = bwe;
        let output_16k = extender.process(&input_8k);

        assert_eq!(output_16k.len(), 320, "Output should be 2x input length");
    }

    #[test]
    fn test_pre_stt_processor_default() {
        let mut processor = PreSTTProcessor::with_defaults();

        // Create test signal
        let samples: Vec<f32> = (0..320)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 16000.0).sin() * 0.1)
            .collect();

        let output = processor.process(&samples, true);

        assert_eq!(output.len(), samples.len());
        assert!(processor.stats().frames_processed > 0);
    }

    #[test]
    fn test_pre_stt_processor_twilio() {
        let mut processor = PreSTTProcessor::for_twilio();

        // Create 8kHz test signal
        let samples_8k: Vec<f32> = (0..160)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 8000.0).sin() * 0.1)
            .collect();

        let output = processor.process(&samples_8k, true);

        // Should be upsampled to 16kHz
        assert_eq!(output.len(), 320);
        assert!(processor.stats().bandwidth_extended);
    }

    #[test]
    fn test_noise_suppressor_initialization() {
        let ns = NoiseSupressor::new(16000);

        assert!(!ns.is_ready(), "Should not be ready initially");
    }

    #[test]
    fn test_highpass_removes_dc() {
        let mut hp = HighPassFilter::new(80.0, 16000);

        // Signal with DC offset
        let mut samples: Vec<f32> = (0..320)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 16000.0).sin() * 0.1 + 0.5)
            .collect();

        hp.process(&mut samples);

        // DC should be mostly removed
        let dc: f32 = samples.iter().sum::<f32>() / samples.len() as f32;
        assert!(dc.abs() < 0.1, "DC should be significantly reduced");
    }
}
